import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getWorkingDaysCount,
  getTaskDailyEstimatedHours,
  getUserDailyAssignedHours,
  isUserUtilized,
  calculateTeamUtilization,
  calculateTasksEfficiency,
  formatHoursRatio,
  getDeliveryUnits,
} from '../src/utils/workload';
import { Task, User } from '../src/types';

test('getWorkingDaysCount correctly counts Monday to Friday inclusive', () => {
  // Monday to Wednesday = 3 days
  assert.equal(getWorkingDaysCount('2026-10-26', '2026-10-28'), 3);
  // Friday to Monday = 2 days (Fri, Mon)
  assert.equal(getWorkingDaysCount('2026-10-23', '2026-10-26'), 2);
  // Saturday to Sunday = 1 day (fallback minimum)
  assert.equal(getWorkingDaysCount('2026-10-24', '2026-10-25'), 1);
  // Same day Monday = 1 day
  assert.equal(getWorkingDaysCount('2026-10-26', '2026-10-26'), 1);
});

test('task estimated hours are split equally across working days between creation and deadline', () => {
  const task: Task = {
    id: 't1',
    userId: 'u1',
    title: 'Design Hero',
    status: 'in_progress',
    cognitiveLoad: 'medium',
    order: 0,
    estimatedHours: 9,
    createdAt: '2026-10-26T09:00:00.000Z', // Monday
    dueDate: '2026-10-28',                  // Wednesday (3 working days)
    updatedAt: '2026-10-26T09:00:00.000Z',
  };

  // 9 hours over 3 working days = 3 hours/day
  assert.equal(getTaskDailyEstimatedHours(task), 3);

  // On Monday (working day in range)
  assert.equal(getTaskDailyEstimatedHours(task, new Date('2026-10-26T12:00:00Z')), 3);
  // On Tuesday (working day in range)
  assert.equal(getTaskDailyEstimatedHours(task, new Date('2026-10-27T12:00:00Z')), 3);
  // On Thursday (outside range)
  assert.equal(getTaskDailyEstimatedHours(task, new Date('2026-10-29T12:00:00Z')), 0);
});

test('utilization considers members with > 3h/day utilized and < 3h/day underutilized', () => {
  const user1: User = { id: 'u1', name: 'Alice', email: 'alice@example.invalid', role: 'content', createdAt: '2026-10-01' };
  const user2: User = { id: 'u2', name: 'Bob', email: 'bob@example.invalid', role: 'content', createdAt: '2026-10-01' };

  // Alice has 8h estimated over 2 working days = 4h/day (> 3h)
  const taskAlice: Task = {
    id: 't-a',
    userId: 'u1',
    title: 'Long Form Copy',
    status: 'in_progress',
    cognitiveLoad: 'high',
    order: 0,
    estimatedHours: 8,
    createdAt: new Date().toISOString(),
    dueDate: new Date().toISOString().slice(0, 10),
    updatedAt: new Date().toISOString(),
  };

  // Bob has 2h estimated over 2 working days = 1h/day (< 3h)
  const taskBob: Task = {
    id: 't-b',
    userId: 'u2',
    title: 'Proofreading',
    status: 'todo',
    cognitiveLoad: 'low',
    order: 0,
    estimatedHours: 2,
    createdAt: new Date().toISOString(),
    dueDate: new Date().toISOString().slice(0, 10),
    updatedAt: new Date().toISOString(),
  };

  const tasks = [taskAlice, taskBob];

  assert.equal(isUserUtilized(user1, tasks), true);
  assert.equal(isUserUtilized(user2, tasks), false);

  const team = [user1, user2];
  const teamUtil = calculateTeamUtilization(team, tasks);
  assert.equal(teamUtil.utilizationPercent, 50);
  assert.equal(teamUtil.utilizedCount, 1);
  assert.equal(teamUtil.totalCount, 2);
  assert.equal(teamUtil.underutilizedUsers.length, 1);
  assert.equal(teamUtil.underutilizedUsers[0].user.id, 'u2');
});

test('efficiency calculates aggregate time taken / time estimated across tasks', () => {
  const task1: Task = {
    id: 't1',
    userId: 'u1',
    title: 'Task 1',
    status: 'done',
    cognitiveLoad: 'medium',
    order: 0,
    estimatedHours: 10,
    inProgressDurationMs: 8 * 3600000, // 8 hours taken
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01',
  };

  const task2: Task = {
    id: 't2',
    userId: 'u1',
    title: 'Task 2',
    status: 'done',
    cognitiveLoad: 'medium',
    order: 1,
    estimatedHours: 10,
    inProgressDurationMs: 6 * 3600000, // 6 hours taken
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01',
  };

  // Total taken = 14h, Total estimated = 20h -> Efficiency = 70%
  const result = calculateTasksEfficiency([task1, task2]);
  assert.equal(result.totalTimeTakenHours, 14);
  assert.equal(result.totalEstimatedHours, 20);
  assert.equal(result.efficiencyPercent, 70);
  assert.equal(formatHoursRatio(result.totalTimeTakenHours, result.totalEstimatedHours), '(14h / 20h)');
});

test('delivery units group CD teams, Video, Research, and UI/UX', () => {
  const users: User[] = [
    { id: 'cd1', name: 'Creative Director 1', email: 'cd1@example.invalid', role: 'content', isCreativeDirector: true, createdAt: '2026-10-01' },
    { id: 'm1', name: 'Writer', email: 'w@example.invalid', role: 'content', creativeDirectorId: 'cd1', createdAt: '2026-10-01' },
    { id: 'v1', name: 'Animator', email: 'v@example.invalid', role: 'video', createdAt: '2026-10-01' },
    { id: 'u1', name: 'Product Designer', email: 'u@example.invalid', role: 'ui_ux', createdAt: '2026-10-01' },
    { id: 'r1', name: 'Researcher', email: 'r@example.invalid', role: 'research', createdAt: '2026-10-01' },
  ];

  const cds = users.filter(u => u.isCreativeDirector);
  const units = getDeliveryUnits(users, cds);

  assert.equal(units.length, 4);
  const cdUnit = units.find(u => u.type === 'cd_team');
  assert.ok(cdUnit);
  assert.equal(cdUnit?.userIds.includes('m1'), true);

  const videoUnit = units.find(u => u.type === 'video');
  assert.ok(videoUnit);
  assert.equal(videoUnit?.userIds.includes('v1'), true);

  const uiUxUnit = units.find(u => u.type === 'ui_ux');
  assert.ok(uiUxUnit);
  assert.equal(uiUxUnit?.userIds.includes('u1'), true);

  const researchUnit = units.find(u => u.type === 'research');
  assert.ok(researchUnit);
  assert.equal(researchUnit?.userIds.includes('r1'), true);
});


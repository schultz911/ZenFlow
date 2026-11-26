import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getWorkingDaysCount,
  getTaskDailyEstimatedHours,
  isUserUtilized,
  calculateTeamUtilization,
  calculateTasksEfficiency,
  formatHoursRatio,
  getAssignedHoursByMemberAndDate,
  rankTaskHours,
  getDeliveryUnits,
  calculateUserWorkload,
  getUserDailyAssignedHours,
  parseLocalDate,
  formatLocalDateKey,
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
  const sameWorkspaceDay = { ...task, createdAt: '2026-10-25T20:00:00Z', dueDate: '2026-10-26' };
  assert.equal(getTaskDailyEstimatedHours(sameWorkspaceDay, new Date('2026-10-26T16:00:00Z')), 9);
  assert.equal(getTaskDailyEstimatedHours(sameWorkspaceDay, new Date('2026-10-25T18:00:00Z')), 0);
});

test('utilization includes exactly 3h and classifies before rounding', () => {
  const user1: User = { id: 'u1', name: 'Alice', email: 'alice@example.invalid', role: 'content', createdAt: '2026-10-01' };
  const user2: User = { id: 'u2', name: 'Bob', email: 'bob@example.invalid', role: 'content', createdAt: '2026-10-01' };

  const date = new Date('2026-10-26T12:00:00Z');
  // Alice has 6h over two working days. Bob has slightly less than 3h.
  const taskAlice: Task = {
    id: 't-a',
    userId: 'u1',
    title: 'Long Form Copy',
    status: 'in_progress',
    cognitiveLoad: 'high',
    order: 0,
    estimatedHours: 6,
    createdAt: '2026-10-26T09:00:00Z',
    dueDate: '2026-10-27',
    updatedAt: '2026-10-26T09:00:00Z',
  };

  const taskBob: Task = {
    id: 't-b',
    userId: 'u2',
    title: 'Proofreading',
    status: 'todo',
    cognitiveLoad: 'low',
    order: 0,
    estimatedHours: 2.99,
    createdAt: '2026-10-26T09:00:00Z',
    dueDate: '2026-10-26',
    updatedAt: '2026-10-26T09:00:00Z',
  };

  const tasks: Task[] = [
    taskAlice,
    taskBob,
    { ...taskBob, id: 'future', startDate: '2026-10-27', dueDate: '2026-10-27', estimatedHours: 4 },
    { ...taskBob, id: 'done', status: 'done', estimatedHours: 4 },
    { ...taskBob, id: 'overdue', startDate: '2026-10-21', dueDate: '2026-10-23', estimatedHours: 30 },
  ];

  assert.equal(isUserUtilized(user1, tasks, date), true);
  assert.equal(isUserUtilized(user2, tasks, date), false);
  const byDate = getAssignedHoursByMemberAndDate(tasks, ['2026-10-26', '2026-10-27'], '2026-10-26');
  assert.equal(byDate.get('u1')?.get('2026-10-26'), 3);
  assert.equal(byDate.get('u2')?.get('2026-10-26'), 2.99);
  assert.equal(byDate.get('u2')?.get('2026-10-27'), 4);

  const team = [user1, user2];
  const teamUtil = calculateTeamUtilization(team, tasks, date);
  assert.equal(teamUtil.utilizationPercent, 50);
  assert.equal(teamUtil.utilizedCount, 1);
  assert.equal(teamUtil.totalCount, 2);
  assert.equal(teamUtil.underutilizedUsers.length, 1);
  assert.equal(teamUtil.underutilizedUsers[0].user.id, 'u2');
});

test('efficiency divides paired completed estimates by billable hours before rounding', () => {
  const measured: Task = {
    id: 'measured',
    userId: 'u1',
    title: 'Measured',
    status: 'done',
    cognitiveLoad: 'medium',
    order: 0,
    estimatedHours: 10,
    inProgressDurationMs: 6 * 3_600_000,
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01',
  };

  const excluded: Task[] = [
    { ...measured, id: 'missing-estimate', estimatedHours: undefined },
    { ...measured, id: 'missing-time', inProgressDurationMs: 0 },
    { ...measured, id: 'in-review', status: 'in_review' },
  ];
  assert.equal(calculateTasksEfficiency(excluded).efficiencyPercent, null);
  const result = calculateTasksEfficiency([measured, measured, ...excluded]);
  assert.equal(result.billableHours, 6);
  assert.equal(result.estimatedHours, 10);
  assert.equal(Math.round(result.efficiencyPercent!), 167);
  assert.equal(formatHoursRatio(result.estimatedHours, result.billableHours), '(10h / 6h)');

  const archived: Task = {
    ...measured, id: 'archived', status: 'archived', estimatedHours: 0.04, inProgressDurationMs: 108_000,
  };
  assert.equal(Math.round(calculateTasksEfficiency([archived]).efficiencyPercent!), 133);
  assert.equal(Math.round(calculateTasksEfficiency([measured, archived]).efficiencyPercent!), 167);
});

test('delivery units group CD teams (Content & Design only)', () => {
  const users: User[] = [
    { id: 'cd1', name: 'Creative Director 1', email: 'cd1@example.invalid', role: 'content', isCreativeDirector: true, createdAt: '2026-10-01' },
    { id: 'm1', name: 'Writer', email: 'w@example.invalid', role: 'content', creativeDirectorId: 'cd1', createdAt: '2026-10-01' },
    { id: 'm2', name: 'Designer', email: 'd@example.invalid', role: 'design', creativeDirectorId: 'cd1', createdAt: '2026-10-01' },
  ];

  const cds = users.filter(u => u.isCreativeDirector);
  const units = getDeliveryUnits(users, cds);

  assert.equal(units.length, 1);
  const cdUnit = units.find(u => u.type === 'cd_team');
  assert.ok(cdUnit);
  assert.equal(cdUnit?.userIds.includes('m1'), true);
  assert.equal(cdUnit?.userIds.includes('m2'), true);
});

test('multi-assignee shared task divides workload score, daily hours, and efficiency evenly across assignees', () => {
  const alice: User = { id: 'u1', name: 'Alice', email: 'alice@example.invalid', role: 'content', createdAt: '2026-10-01' };
  const sharedTask: Task = {
    id: 't-shared',
    userId: 'u1',
    assigneeIds: ['u1', 'u2'],
    title: 'Shared Brand Copy',
    status: 'todo',
    cognitiveLoad: 'medium', // base score 2
    order: 0,
    estimatedHours: 8,
    inProgressDurationMs: 4 * 3600000,
    createdAt: '2026-10-26T09:00:00.000Z',
    startDate: '2026-10-26',
    dueDate: '2026-10-27', // 2 working days -> 8h total / 2 days / 2 assignees = 2h/day per user
    updatedAt: '2026-10-26T09:00:00.000Z',
  };

  const singleTask: Task = {
    ...sharedTask,
    id: 't-single',
    assigneeIds: ['u1'],
  };

  assert.equal(getTaskDailyEstimatedHours(sharedTask, new Date('2026-10-26T12:00:00Z')), 2);
  assert.equal(getUserDailyAssignedHours(alice, [sharedTask], new Date('2026-10-26T12:00:00Z')), 2);

  const singleWl = calculateUserWorkload([singleTask]);
  const sharedWl = calculateUserWorkload([sharedTask]);
  assert.ok(sharedWl.totalScore < singleWl.totalScore);
  assert.ok(Math.abs(sharedWl.totalScore - singleWl.totalScore / 2) <= 0.1);

  const sharedCompleted: Task = { ...sharedTask, status: 'done' };
  const userEff = calculateTasksEfficiency([sharedCompleted], { memberIds: new Set(['u1']) });
  assert.equal(userEff.billableHours, 2);
  assert.equal(userEff.estimatedHours, 4);
  assert.equal(userEff.efficiencyPercent, 200);

  const teamEff = calculateTasksEfficiency([sharedCompleted, sharedCompleted], { memberIds: new Set(['u1', 'u2']) });
  assert.equal(teamEff.billableHours, 4);
  assert.equal(teamEff.estimatedHours, 8);
  assert.equal(calculateTasksEfficiency([sharedCompleted], { memberIds: new Set(['u3']) }).efficiencyPercent, null);

  const overrun: Task = { ...sharedCompleted, id: 'overrun', inProgressDurationMs: 16 * 3_600_000, client: 'Time spent' };
  const budget: Task = { ...sharedCompleted, id: 'budget', estimatedHours: 40, client: 'Big estimate' };
  const ranked = rankTaskHours([budget, overrun, overrun], task => task.client!, { memberIds: new Set(['u1']) });
  assert.deepEqual(ranked, [
    { key: 'Time spent', billableHours: 8, estimatedHours: 4 },
    { key: 'Big estimate', billableHours: 2, estimatedHours: 20 },
  ]);
});

test('parseLocalDate and formatLocalDateKey avoid UTC day-shift and reject invalid dates', () => {
  const mon = parseLocalDate('2026-11-23');
  assert.ok(mon);
  assert.equal(mon.getDay(), 1); // Monday in local time regardless of host TZ
  assert.equal(formatLocalDateKey(mon), '2026-11-23');
  assert.equal(parseLocalDate(''), null);
  assert.equal(parseLocalDate('2026-02-31'), null);
});


import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPERADMIN_EMAIL,
  canEdit,
  canEditTask,
  canManageUser,
  canCreatePipelineTask,
  canAssignToDiscipline,
  type MemberLike,
} from '../src/domain/permissions';
import {
  applyOptimisticTaskUpdate,
  applyOptimisticTaskReorder,
  archiveExpiredDoneTasks,
  taskMatchesAnyUserRef,
  removeUserFromTaskList,
} from '../src/domain/taskTransitions';
import type { Task } from '../src/types';

test('permissions: CD and Cluster Lead scopes match server policy and block cross-cluster edits', () => {
  const cd1: MemberLike = { id: 'cd-1', email: 'cd1@zensciences.com', isCreativeDirector: true };
  const cd2: MemberLike = { id: 'cd-2', email: 'cd2@zensciences.com', isCreativeDirector: true };
  const cl1: MemberLike = { id: 'cl-1', email: 'cl1@zensciences.com', isClusterLead: true, creativeDirectorId: 'cd-1' };
  const biz: MemberLike = { id: 'biz', email: 'biz@zensciences.com', isBusinessLead: true };
  const forgedBiz: MemberLike = { id: 'forged', email: 'forged@zensciences.com', designation: 'Business Lead' };
  const acct: MemberLike = { id: 'acct', email: 'acct@zensciences.com', role: 'account_manager' };
  const alice: MemberLike = { id: 'alice', email: 'alice@zensciences.com', role: 'content', creativeDirectorId: 'cd-1', clusterLeadId: 'cl-1' };
  const charlie: MemberLike = { id: 'charlie', email: 'charlie@zensciences.com', role: 'content', creativeDirectorId: 'cd-2' };
  const superadmin: MemberLike = { id: 'root', email: SUPERADMIN_EMAIL };

  assert.equal(canEdit(cd1, alice), true);
  assert.equal(canEdit(cd1, charlie), false);
  assert.equal(canManageUser(cd1, charlie), false);
  assert.equal(canEdit(cl1, alice), true);
  assert.equal(canEdit(cl1, charlie), false);
  assert.equal(canEdit(biz, charlie), true);
  assert.equal(canEdit(forgedBiz, charlie), false);
  assert.equal(canEdit(acct, alice), false);
  assert.equal(canCreatePipelineTask(acct), true);
  assert.equal(canCreatePipelineTask(alice), false);
  assert.equal(canEdit(superadmin, charlie), true);
  assert.equal(canAssignToDiscipline('content', { id: 'd', email: 'd@x', role: 'design' }), false);
  assert.equal(canAssignToDiscipline('content', alice), true);

  const users = [cd1, cd2, alice, charlie];
  assert.equal(canEditTask(cd1, { userId: 'alice' }, users), true);
  assert.equal(canEditTask(cd1, { userId: 'charlie' }, users), false);

  // Team Lead scoped to CD-1 cannot edit same-discipline member in CD-2's cluster
  const tl1: MemberLike = {
    id: 'tl-1',
    email: 'tl1@zensciences.com',
    role: 'content',
    isTeamLead: true,
    creativeDirectorId: 'cd-1',
  };
  assert.equal(canEdit(tl1, alice), true);
  assert.equal(canEdit(tl1, charlie), false);
});

test('taskTransitions: reorder accumulates in-progress duration, strips pipeline deadlines, and propagates contentDocLink', () => {
  const start = new Date('2026-10-01T10:00:00.000Z');
  const end = new Date('2026-10-01T12:00:00.000Z');
  const baseTasks: Task[] = [
    {
      id: 'c1',
      userId: 'alice',
      assigneeIds: ['alice'],
      team: 'content',
      title: 'Campaign (Content)',
      cognitiveLoad: 'medium',
      status: 'in_progress',
      order: 0,
      dueDate: '2026-10-10',
      inProgressStartedAt: start.toISOString(),
      inProgressDurationMs: 1000,
      parentTaskId: 'parent-1',
      createdAt: start.toISOString(),
      updatedAt: start.toISOString(),
    },
    {
      id: 'd1',
      userId: 'bob',
      assigneeIds: ['bob'],
      team: 'design',
      title: 'Campaign (Design)',
      cognitiveLoad: 'medium',
      status: 'todo',
      order: 0,
      parentTaskId: 'parent-1',
      createdAt: start.toISOString(),
      updatedAt: start.toISOString(),
    },
  ];

  const reordered = applyOptimisticTaskReorder(
    baseTasks,
    [{ id: 'c1', status: 'done', order: 0, contentDocLink: 'https://docs.example.com/copy' }],
    end
  );
  const c1 = reordered.find(t => t.id === 'c1')!;
  const d1 = reordered.find(t => t.id === 'd1')!;
  assert.equal(c1.inProgressStartedAt, undefined);
  assert.equal(c1.inProgressDurationMs, 1000 + 2 * 3600 * 1000);
  assert.equal(c1.completedAt, end.toISOString());
  assert.equal(d1.contentDocLink, 'https://docs.example.com/copy');

  const returnedToPipeline = applyOptimisticTaskUpdate(reordered, 'c1', { status: 'pipeline' }, end).find(t => t.id === 'c1')!;
  assert.equal(returnedToPipeline.dueDate, undefined);
  assert.equal(returnedToPipeline.startDate, undefined);
});

test('taskTransitions: taskMatchesAnyUserRef safely ignores unassigned tasks and archiveExpiredDoneTasks archives >7d tasks', () => {
  const unassigned: Task = {
    id: 'u1',
    team: 'content',
    title: 'Pipeline',
    cognitiveLoad: 'low',
    status: 'pipeline',
    order: 0,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
  assert.equal(taskMatchesAnyUserRef(unassigned, ['alice', 'alice@zensciences.com']), false);

  const oldDone: Task = {
    ...unassigned,
    id: 'done-1',
    userId: 'alice',
    assigneeIds: ['alice'],
    status: 'done',
    completedAt: '2026-10-01T00:00:00.000Z',
  };
  const archived = archiveExpiredDoneTasks([oldDone], new Date('2026-10-10T00:00:00.000Z'));
  assert.equal(archived.length, 1);
  assert.equal(oldDone.status, 'archived');

  const shared: Task = { ...unassigned, id: 's1', userId: 'alice', assigneeIds: ['alice', 'bob'] };
  const cleaned = removeUserFromTaskList([shared, oldDone], 'alice');
  assert.deepEqual(cleaned.deletedTaskIds, ['done-1']);
  assert.equal(cleaned.updatedTasks.length, 1);
  assert.equal(cleaned.updatedTasks[0].userId, 'bob');
});

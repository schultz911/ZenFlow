import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createCloudDiskPersistenceAdapter, createMemoryPersistenceAdapter, createWorkspaceRepository } from '../server/store';
import { reconcileSnapshot } from '../src/lib/reconcile';
import type { QueuedMutation } from '../src/types';
import { getAssignedHoursByMemberAndDate, getTaskBillableMs, getUserDailyAssignedHours, parseLocalDate } from '../src/utils/workload';
import { fixtureServer, fixtureTask } from './fixtures';

test('overlapping delete and edit preserve the other task', { timeout: 5000 }, async () => {
  const server = await fixtureServer();
  let resume = () => {};
  const paused = new Promise<void>(resolve => { resume = resolve; });
  try {
    server.store.tasks.push(fixtureTask('c', 'alice'));
    let entered = () => {};
    const enteredSave = new Promise<void>(resolve => { entered = resolve; });
    const save = server.repo.saveTask;
    server.repo.saveTask = async task => {
      if (task.id === 'b') {
        entered();
        await paused;
      }
      await save(task);
    };
    const edit = server.request('/tasks/b', 'root', 'PUT', { title: 'Updated B' });
    await enteredSave;
    const deletion = server.request('/tasks/a', 'root', 'DELETE');
    await Promise.race([deletion, new Promise(resolve => setTimeout(resolve, 50))]);
    resume();
    assert.equal((await edit).status, 200);
    assert.equal((await deletion).status, 200);
    assert.deepEqual(server.repo.getTasks().map(task => task.id), ['b', 'c']);
    assert.equal(server.repo.getTasks()[0].title, 'Updated B');
  } finally {
    resume();
    await server.close();
  }
});

test('repeated partial removal preserves the shared task and explicit delete still works', async () => {
  const server = await fixtureServer();
  try {
    server.store.tasks.push(fixtureTask('shared', 'alice', { assigneeIds: ['alice', 'bob'] }));
    for (const id of ['alice', 'alice']) {
      assert.equal((await server.request('/tasks/shared?removeAssigneeId=' + id, 'root', 'DELETE')).status, 200);
      assert.deepEqual(server.repo.getTasks().find(task => task.id === 'shared')?.assigneeIds, ['bob']);
    }
    assert.equal((await server.request('/tasks/shared?removeAssigneeId=bob', 'root', 'DELETE')).status, 409);
    assert.equal((await server.request('/tasks/shared', 'root', 'DELETE')).status, 200);
    assert.ok(!server.repo.getTasks().some(task => task.id === 'shared'));
  } finally {
    await server.close();
  }
});

test('corrupted local workspace remains available for recovery', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'zenflow-corrupt-'));
  const file = path.join(directory, 'store.json');
  const original = '{"users":[],"tasks":[{"id":"previous-work"}';
  try {
    await fs.writeFile(file, original);
    assert.throws(() => createWorkspaceRepository(createCloudDiskPersistenceAdapter(directory)), /original file was preserved/);
    assert.equal(await fs.readFile(file, 'utf8'), original);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('failed purge preserves the board, retains retry state across repository startup, and can be resumed', async () => {
  const adapter = createMemoryPersistenceAdapter({ users: [], tasks: [fixtureTask('kept', 'alice')], parentTasks: [] });
  const repo = createWorkspaceRepository(adapter);
  const purge = adapter.purgeAllCollections;
  adapter.purgeAllCollections = async () => { throw new Error('Storage failure'); };
  await assert.rejects(repo.purgeAll(), /Storage failure/);
  assert.deepEqual(repo.getTasks().map(task => task.id), ['kept']);
  const restarted = createWorkspaceRepository(adapter);
  assert.equal(restarted.purgeNeedsRetry(), true);
  adapter.purgeAllCollections = purge;
  await restarted.purgeAll();
  assert.equal(restarted.purgeNeedsRetry(), false);
  assert.equal(restarted.getTasks().length, 0);
});

test('offline task survives snapshot reconciliation, receives edits and keeps one ID on retry', async () => {
  const server = await fixtureServer();
  try {
    const id = `task-alice-${randomUUID()}`;
    const task = fixtureTask(id, 'alice');
    const create = { id: 'mutation-create', type: 'create_task', endpoint: '/api/tasks', method: 'POST',
      payload: { id, title: task.title, userId: task.userId, status: 'todo' }, optimisticTask: task,
      timestamp: 1, retryCount: 0 } satisfies QueuedMutation;
    const edit = { id: 'mutation-edit', type: 'update_task', endpoint: `/api/tasks/${id}`, method: 'PUT',
      payload: { title: 'Updated offline' }, timestamp: 2, retryCount: 0 } satisfies QueuedMutation;
    const reconciled = reconcileSnapshot({ users: [], tasks: [] }, [create, edit], []);
    assert.equal(reconciled.tasks[0].title, 'Updated offline');
    assert.equal(reconciled.tasks[0].status, 'todo');
    assert.equal((await server.request(create.endpoint, 'alice', create.method, create.payload)).status, 201);
    assert.equal((await server.request(edit.endpoint, 'alice', edit.method, edit.payload)).status, 200);
    assert.equal((await server.request(create.endpoint, 'alice', create.method, create.payload)).status, 200);
    assert.deepEqual(server.repo.getTasks().filter(item => item.id === id).map(item => item.title), ['Updated offline']);
  } finally {
    await server.close();
  }
});

test('pipeline local commit precedes ClickUp and retries reuse confirmed parents and children', async () => {
  let remoteCreates = 0;
  const server = await fixtureServer({ clickupTransport: async (_url, init) => {
    if (init?.method !== 'POST') throw new Error('Unexpected remote method');
    remoteCreates++;
    if (remoteCreates === 2) return new Response('{}', { status: 429 });
    return Response.json({ id: `remote-${remoteCreates}`, description: '' });
  } });
  try {
    server.store.users.find(user => user.id === 'cd').clickupApiKey = 'pk_personal_fixture';
    const request = { requestId: randomUUID(), title: 'Bundle', disciplines: ['content', 'design'], clickupListId: 'list-1' };
    const saveBundle = server.repo.savePipelineBundle;
    server.repo.savePipelineBundle = async () => { throw new Error('Storage failure'); };
    assert.equal((await server.request('/tasks/pipeline-bundle', 'cd', 'POST', request)).status, 503);
    assert.equal(remoteCreates, 0);
    server.repo.savePipelineBundle = saveBundle;
    assert.equal((await server.request('/tasks/pipeline-bundle', 'cd', 'POST', request)).status, 502);
    assert.equal(remoteCreates, 2);
    assert.equal((await server.request('/tasks/pipeline-bundle', 'cd', 'POST', request)).status, 200);
    assert.equal(remoteCreates, 4);
    assert.equal((await server.request('/tasks/pipeline-bundle', 'cd', 'POST', request)).status, 200);
    assert.equal(remoteCreates, 4);
    assert.equal(server.repo.getParentTasks().length, 1);
    assert.equal(server.repo.getTasks().filter(task => task.parentTaskId).length, 2);
  } finally {
    await server.close();
  }
});

test('ClickUp setup uses the member key, reports failed sends, and sends the explicit estimate', async () => {
  const attempts: { token: string | null; estimate: number }[] = [];
  const server = await fixtureServer({ clickupTransport: async (_url, init) => {
    attempts.push({ token: new Headers(init?.headers).get('authorization'), estimate: JSON.parse(String(init?.body)).time_estimate });
    return new Response('{}', { status: 503 });
  } });
  try {
    const alice = server.store.users.find(user => user.id === 'alice');
    server.store.users.find(user => user.id === 'root').clickupApiKey = 'pk_root_fixture';
    Object.assign(alice, { role: 'account_manager', isAccountManager: true });
    Object.assign(server.store.tasks[0], { clickupTaskId: 'remote-a', estimatedHours: 2 });
    assert.equal((await server.request('/clickup/spaces', 'alice')).status, 400);
    assert.equal(attempts.length, 0);
    assert.equal((await server.request('/users/alice', 'alice', 'PUT', { clickupApiKey: 'pk_alice_fixture' })).status, 200);
    const result = await server.request('/clickup/sync-user-tasks', 'alice', 'POST', { userId: 'alice' });
    const body = await result.json();
    assert.equal(body.success, false);
    assert.equal(body.syncedCount, 0);
    assert.equal(body.failedCount, 1);
    assert.deepEqual(attempts, [{ token: 'pk_alice_fixture', estimate: 7_200_000 }]);
  } finally {
    await server.close();
  }
});

test('local mode never reports a recent cloud sync', async () => {
  const server = await fixtureServer();
  try {
    assert.equal((await (await server.request('/firestore/sync', 'root', 'POST')).json()).success, false);
    const status = await (await server.request('/firestore/status', 'root')).json();
    assert.equal(status.mode, 'local');
    assert.equal(status.lastSyncTime, undefined);
  } finally {
    await server.close();
  }
});

test('historical analytics retain only recorded dates and freeze the data and clock', async () => {
  const server = await fixtureServer();
  try {
    const task = server.store.tasks[0];
    Object.assign(task, { title: 'Original', status: 'in_progress', inProgressStartedAt: '2026-11-26T17:29:00Z' });
    server.store.users[0].clickupApiKey = 'pk_private_fixture';
    assert.equal(await server.repo.captureAnalyticsSnapshot(new Date('2026-11-26T18:28:00Z')), false);
    assert.equal(await server.repo.captureAnalyticsSnapshot(new Date('2026-11-26T18:29:00Z')), true);
    task.title = 'Edited after cutoff';
    assert.equal(await server.repo.captureAnalyticsSnapshot(new Date('2026-11-26T18:29:30Z')), false);
    const getSnapshot = async (date: string) => {
      const response = await server.request(`/analytics/snapshots?start=${date}&end=${date}`);
      assert.equal(response.status, 200);
      return (await response.json()).snapshot;
    };
    const snapshot = await getSnapshot('2026-11-26');
    assert.equal(snapshot.tasks[0].title, 'Original');
    assert.equal(getTaskBillableMs(snapshot.tasks[0], Date.parse(snapshot.capturedAt)), 3_600_000);
    assert.ok(!JSON.stringify(snapshot).includes('pk_private_fixture'));
    assert.equal(await getSnapshot('2026-11-25'), null);
  } finally {
    await server.close();
  }
});

test('batched analytics allocations match the daily calculation for shared work', async () => {
  const server = await fixtureServer();
  try {
    const alice = server.repo.getUsers().find(user => user.id === 'alice')!;
    const tasks = [fixtureTask('shared', 'alice', { assigneeIds: ['alice', 'bob'], estimatedHours: 13, startDate: '2026-01-05', dueDate: '2026-01-09' })];
    const dates = ['2026-01-05', '2026-01-07', '2026-01-10'];
    const allocations = getAssignedHoursByMemberAndDate(tasks, dates);
    for (const date of dates) {
      assert.equal(allocations.get('alice')?.get(date) || 0, getUserDailyAssignedHours(alice, tasks, parseLocalDate(date)!));
    }
  } finally {
    await server.close();
  }
});

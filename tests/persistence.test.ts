import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { FirestoreWorkspace, nativeData, workspaceMiddleware, WorkspaceSnapshot } from '../server/workspace';

test('retired metadata is stripped while native relationships and history survive', () => {
  const data = nativeData({ id: 'child', parentTaskId: 'parent', userId: 'alice', clickupTaskId: 'remote',
    activityLog: [{ action: 'updated', details: 'Keep history' }], missing: undefined });
  assert.deepEqual(data, { id: 'child', parentTaskId: 'parent', userId: 'alice', activityLog: [{ action: 'updated', details: 'Keep history' }] });
});

test('Firestore outage never reports success or broadcasts; later reads reload durable data', async () => {
  let durable: WorkspaceSnapshot = { revision: 1, store: { users: [], tasks: [{ id: 'a', title: 'Saved' }] } };
  let store = structuredClone(durable.store);
  let failWrite = false, failRead = false;
  let releaseCommit: (() => void) | undefined;
  let delay: Promise<void> | undefined;
  let audit: any[] = [], events: any[] = [], staged: any[] = [];
  const workspace = {
    load: async () => { if (failRead) throw new Error('read unavailable'); return structuredClone(durable); },
    commit: async (_before: any, after: any, records: any[]) => {
      if (delay) await delay;
      if (failWrite) throw new Error('write unavailable');
      durable = { store: structuredClone(after), revision: durable.revision + 1 };
      audit.push(...records); return durable.revision;
    },
  } as unknown as FirestoreWorkspace;
  const app = express();
  app.use(express.json());
  let pendingAudit: any[] = [];
  app.use(workspaceMiddleware({ workspace, getStore: () => store, setStore: value => { store = value; },
    begin: () => { pendingAudit = []; staged = []; }, audit: () => pendingAudit,
    committed: () => { events.push(...staged); staged = []; }, failed: () => { staged = []; },
  }));
  app.put('/task', (req, res) => { store.tasks[0].title = req.body.title; pendingAudit.push({ id: 'audit' }); staged.push('updated'); res.json(store.tasks[0]); });
  app.get('/state', (_req, res) => { res.json(store); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as any).port}`;
  const put = (title: string) => fetch(url + '/task', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
  try {
    failWrite = true;
    assert.equal((await put('Unsaved')).status, 503);
    assert.equal(store.tasks[0].title, 'Saved');
    assert.equal(durable.store.tasks[0].title, 'Saved');
    assert.equal(events.length, 0); assert.equal(audit.length, 0);
    failWrite = false;
    delay = new Promise(resolve => { releaseCommit = resolve; });
    let returned = false;
    const request = put('Committed').then(response => { returned = true; return response; });
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(returned, false); assert.equal(events.length, 0);
    releaseCommit!();
    assert.equal((await request).status, 200);
    assert.equal(durable.store.tasks[0].title, 'Committed');
    assert.equal(events.length, 1); assert.equal(audit.length, 1);
    durable.store.tasks = []; // A deleted cloud record must never be resurrected from cache.
    const state = await (await fetch(url + '/state')).json();
    assert.deepEqual(state.tasks, []);
    failRead = true;
    assert.equal((await fetch(url + '/state')).status, 503);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

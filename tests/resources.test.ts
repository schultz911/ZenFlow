import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { Writable } from 'node:stream';
import { readAuditTail, writeSse, MAX_SSE_BUFFER_BYTES } from '../server/resources';
import { reconcileSnapshot } from '../src/lib/reconcile';
import { fixtureServer, fixtureTask } from './fixtures';
import { quickWorkloadScore, calculateUserWorkload } from '../src/utils/workload';

const legacyTail = (raw: string, limit: number) => raw.trim().split('\n').filter(Boolean).slice(-limit).reverse().flatMap(line => {
  try { return [JSON.parse(line)]; } catch { return []; }
});
test('reverse audit tail preserves legacy results for malformed lines, whitespace, CRLF, Unicode and missing newline', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'zenflow-tail-'));
  try {
    const file = path.join(directory, 'audit.jsonl');
    const cases = ['', '\n \t\r\n', '{"id":1}', '{"id":1}\r\n\r\n{"id":2}\r\n', '{"id":1}\ninvalid\n{"id":2}\n \r\n',
      Array.from({ length: 1000 }, (_, i) => JSON.stringify({ id: i, text: 'नमस्ते 👋 '.repeat(200) })).join('\n'),
      JSON.stringify({ id: 1, text: '長'.repeat(70000) }) + '\n' + JSON.stringify({ id: 2 })];
    for (const raw of cases) {
      await fs.writeFile(file, raw);
      for (const limit of [1, 3, 100]) assert.deepEqual(await readAuditTail(file, limit), legacyTail(raw, limit));
    }
    assert.deepEqual(await readAuditTail(path.join(directory, 'missing')), []);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
test('a stalled Writable cannot retain output beyond the configured bound plus one event', () => {
  const slow = new Writable({ highWaterMark: 1024, write(_chunk, _encoding, _callback) {} });
  const event = `event: update\ndata: ${'x'.repeat(65536)}\n\n`;
  let maximum = 0;
  for (let i = 0; i < 1000; i++) {
    writeSse(slow as any, event);
    maximum = Math.max(maximum, slow.writableLength);
  }
  assert.equal(slow.destroyed, true);
  assert.ok(maximum <= MAX_SSE_BUFFER_BYTES + Buffer.byteLength(event));
  assert.ok(maximum < 300000);
});
test('large snapshots can pass a healthy socket without a reconnect loop', () => {
  let length = 0;
  const healthy = new Writable({ write(chunk, _encoding, callback) { length += chunk.length; callback(); } });
  assert.equal(writeSse(healthy as any, 'x'.repeat(1024 * 1024)), true);
  assert.equal(healthy.destroyed, false);
  assert.equal(length, 1024 * 1024);
  healthy.destroy();
});
test('real HTTP slow reader reaches a bounded queue and is disconnected', async () => {
  let maximum = 0;
  let completed!: () => void;
  const done = new Promise<void>(resolve => { completed = resolve; });
  const server = http.createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.flushHeaders();
    const message = `event: update\ndata: ${'x'.repeat(65536)}\n\n`;
    const send = () => {
      for (let i = 0; i < 10000 && !res.destroyed; i++) {
        writeSse(res, message);
        maximum = Math.max(maximum, res.writableLength);
      }
      completed();
    };
    setImmediate(send);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port;
  const request = http.get(`http://127.0.0.1:${port}`, response => { response.pause(); response.on('error', () => {}); });
  request.on('error', () => {});
  try {
    await done;
    assert.ok(maximum <= MAX_SSE_BUFFER_BYTES + 66000);
  } finally {
    request.destroy(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

async function eventReader(url: string) {
  const controller = new AbortController();
  const response = await fetch(url + '/api/events', { headers: { Authorization: 'Bearer alice' }, signal: controller.signal });
  assert.equal(response.status, 200);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  return { close: () => controller.abort(), next: async (name: string) => {
    while (true) {
      const index = buffer.indexOf('\n\n');
      if (index >= 0) {
        const frame = buffer.slice(0, index); buffer = buffer.slice(index + 2);
        if (frame.startsWith(`event: ${name}\n`)) return JSON.parse(frame.split('\ndata: ')[1]);
      } else {
        const { value, done } = await reader.read();
        if (done) throw new Error('stream ended before event');
        buffer += decoder.decode(value, { stream: true });
      }
    }
  } };
}
test('actual SSE snapshots recover missed deletions and redact keys; healthy clients receive updates', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'zenflow-sse-'));
  const server = await fixtureServer(directory);
  let first: Awaited<ReturnType<typeof eventReader>> | undefined;
  let second: typeof first;
  try {
    server.store.users[2].clickupApiKey = 'PRIVATE_FIXTURE_KEY';
    server.enableLiveBroadcast();
    first = await eventReader(server.url);
    const initial = await first.next('snapshot');
    assert.equal(initial.tasks.length, 2);
    assert.ok(!JSON.stringify(initial).includes('PRIVATE_FIXTURE_KEY'));
    server.ctx.broadcastEvent('task_updated', { ...server.store.tasks[0], title: 'live change' });
    assert.equal((await first.next('update')).payload.title, 'live change');
    first.close();
    server.store.tasks = [fixtureTask('a', 'alice'), fixtureTask('new', 'alice')];
    second = await eventReader(server.url);
    const recovered = await second.next('snapshot');
    assert.deepEqual(recovered.tasks.map((task: any) => task.id), ['a', 'new']);
    assert.equal(recovered.tasks.some((task: any) => task.id === 'b'), false);
  } finally { first?.close(); second?.close(); await server.close(); await fs.rm(directory, { recursive: true, force: true }); }
});
test('snapshot reconciliation preserves pending creates, edits, deletes and reorders', () => {
  const tasks: any[] = [fixtureTask('a', 'alice'), fixtureTask('b', 'bob'), fixtureTask('gone', 'alice')];
  const local: any[] = [...tasks, { ...fixtureTask('offline', 'alice'), title: 'Unsaved work' }];
  const mutation = (type: any, endpoint: string, payload?: any): any => ({ id: 'queue', timestamp: Date.now(), type, endpoint, payload });
  const queue = [mutation('update_task', '/api/tasks/a', { title: 'Pending edit' }), mutation('delete_task', '/api/tasks/gone'),
    mutation('create_task', '/api/tasks', local.at(-1)), mutation('reorder_tasks', '/api/tasks/reorder', { updates: [{ id: 'a', order: 5 }] }), mutation('delete_user', '/api/users/bob')];
  const recovered = reconcileSnapshot({ users: [{ id: 'alice' }, { id: 'bob' }] as any, tasks }, queue, local);
  assert.deepEqual(recovered.tasks.map(task => task.id), ['a', 'offline']);
  assert.equal(recovered.tasks[0].title, 'Pending edit');
  assert.equal(recovered.tasks[0].order, 5);
  assert.equal(recovered.tasks[1].title, 'Unsaved work');
  assert.deepEqual(recovered.users.map(user => user.id), ['alice']);
});
test('actual SSE handshake delivers a large workspace snapshot without evicting a healthy client', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'zenflow-large-sse-'));
  const server = await fixtureServer(directory);
  let connection: Awaited<ReturnType<typeof eventReader>> | undefined;
  try {
    server.store.tasks = Array.from({ length: 1000 }, (_, id) => ({ ...fixtureTask(`large-${id}`, 'alice'), description: 'x'.repeat(500) }));
    connection = await eventReader(server.url);
    const snapshot = await connection.next('snapshot');
    assert.equal(snapshot.tasks.length, 1000);
    assert.equal(server.ctx.clients.length, 1);
  } finally { connection?.close(); await server.close(); await fs.rm(directory, { recursive: true, force: true }); }
});
test('workload scoring excludes retainer/pipeline and maintains numeric parity', () => {
  const task: any = { ...fixtureTask('active', 'alice', 'in_review'), inProgressDurationMs: 8 * 3600000, cognitiveLoad: 'medium' };
  const tasks = [task, fixtureTask('pipe', 'alice', 'pipeline'), fixtureTask('retainer', 'alice', 'retainer')];
  assert.equal(quickWorkloadScore(tasks as any), 1.2);
  assert.equal(calculateUserWorkload(tasks as any).totalScore, quickWorkloadScore(tasks as any));
});

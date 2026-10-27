import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fixtureServer, fixtureTask } from './fixtures';
import { publicMember } from '../server/security';

async function withServer(run: (server: Awaited<ReturnType<typeof fixtureServer>>) => Promise<void>) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'zenflow-security-'));
  const server = await fixtureServer(directory);
  try { await run(server); } finally { await server.close(); await fs.rm(directory, { recursive: true, force: true }); }
}
test('anonymous, expired, unverified and non-Google identities cannot read workspace data', async () => withServer(async server => {
  for (const who of ['', 'expired', 'unverified', 'password', 'invalid']) assert.equal((await server.request('/state', who)).status, 401);
  assert.equal((await server.request('/state', 'unknown')).status, 403);
  assert.equal((await server.request('/health', '')).status, 200);
}));
test('anonymous mutation and SSE routes are protected before handlers run', async () => withServer(async server => {
  for (const [route, method, body] of [['/users', 'POST', {}], ['/users/alice', 'DELETE', undefined], ['/tasks/a', 'DELETE', undefined], ['/tasks/reorder', 'POST', {}], ['/events', 'GET', undefined], ['/firestore/credentials', 'POST', {}], ['/audit/download', 'GET', undefined]]) {
    assert.equal((await server.request(route as string, '', method as string, body)).status, 401);
  }
  assert.equal(server.store.tasks.length, 2);
  assert.equal(server.audit.length, 0);
}));
test('spoofed admin headers, role escalation and trailing slash cannot bypass permissions', async () => withServer(async server => {
  for (const route of ['/users', '/users/']) assert.equal((await server.request(route, 'alice', 'POST', { name: 'Alice', email: 'alice@example.invalid', role: 'content', isCreativeDirector: true }, { 'x-is-superadmin': 'true', 'x-caller-email': 'kiran.s@zensciences.com' })).status, 403);
  assert.equal((await server.request('/users/bob/', 'alice', 'PUT', { email: 'attacker@example.invalid' }, { 'x-is-superadmin': 'true' })).status, 403);
  assert.equal((await server.request('/tasks/b/', 'alice', 'DELETE')).status, 403);
  assert.equal(server.store.users.find((user: any) => user.id === 'alice').isCreativeDirector, undefined);
}));
test('regular users edit own tasks; CDs edit their team; unrelated edits are denied', async () => withServer(async server => {
  assert.equal((await server.request('/tasks/a', 'alice', 'PUT', { title: 'Own update' })).status, 200);
  assert.equal((await server.request('/tasks/a', 'cd', 'PUT', { title: 'Team update' })).status, 200);
  assert.equal((await server.request('/tasks/b', 'cd', 'PUT', { title: 'Forbidden' })).status, 403);
  assert.equal((await server.request('/tasks/b', 'root', 'PUT', { title: 'Admin update' })).status, 200);
  assert.equal(server.store.tasks.find((task: any) => task.id === 'a').title, 'Team update');
}));
test('batch authorization is atomic and owner reassignment cannot cross an unauthorized boundary', async () => withServer(async server => {
  assert.equal((await server.request('/tasks/reorder', 'alice', 'POST', { updates: [{ id: 'a', order: 8 }, { id: 'b', order: 9 }] })).status, 403);
  assert.equal(server.store.tasks[0].order, 0);
  assert.equal((await server.request('/tasks/a', 'alice', 'PUT', { userId: 'bob' })).status, 403);
  assert.equal((await server.request('/tasks', 'alice', 'POST', { userId: 'bob', title: 'Forbidden', status: 'todo' })).status, 403);
}));
test('universal authenticated delegation remains independent across boards and self assignment', async () => withServer(async server => {
  for (const targetUserId of ['bob', 'alice']) {
    const response = await server.request('/tasks/a/duplicate', 'alice', 'POST', { targetUserId, status: 'todo', dueDate: '2026-11-01' });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.task.parentTaskId, 'a');
    assert.equal(body.task.isSubtask, true);
    assert.equal(body.task.userId, targetUserId);
    assert.equal((await server.request(`/tasks/${body.task.id}`, targetUserId, 'PUT', { status: 'in_progress' })).status, 200);
    assert.equal(server.store.tasks[0].status, 'todo');
    await server.request(`/tasks/${body.task.id}`, targetUserId, 'DELETE');
    assert.ok(server.store.tasks.find((task: any) => task.id === 'a'));
  }
}));
test('member provisioning, profile updates and root protection retain the role matrix', async () => withServer(async server => {
  assert.equal((await server.request('/users', 'cd', 'POST', { name: 'New', email: 'new@example.invalid', role: 'design' })).status, 201);
  assert.equal(server.store.users.at(-1).creativeDirectorId, 'cd');
  assert.equal((await server.request('/users', 'cd', 'POST', { name: 'New CD', email: 'newcd@example.invalid', role: 'content', isCreativeDirector: true })).status, 403);
  assert.equal((await server.request('/users/root', 'root', 'DELETE')).status, 403);
  assert.equal((await server.request('/users/alice', 'alice', 'PUT', { role: 'design' })).status, 403);
  assert.equal((await server.request('/users/alice', 'cd', 'PUT', { name: 'Alice Renamed' })).status, 200);
  assert.equal(server.store.users.find((u: any) => u.id === 'alice').name, 'Alice Renamed');
}));
test('HTTP user payloads and mutation events use an allowlist to prevent private credential leakage', async () => withServer(async server => {
  server.store.users[2].privateInternalToken = 'SYNTHETIC_PRIVATE_KEY';
  for (const route of ['/state', '/users']) {
    const response = await server.request(route);
    assert.equal(response.status, 200);
    assert.ok(!(await response.text()).includes('SYNTHETIC_PRIVATE_KEY'));
  }
}));
test('legacy clickup routes return 410 Gone', async () => withServer(async server => {
  for (const route of ['/clickup/spaces', '/clickup/folders-and-lists', '/clickup/webhook', '/clickup/verify']) {
    const res = await server.request(route, 'alice');
    assert.equal(res.status, 410);
  }
}));
test('cookie mutations require the same-origin non-simple header; Bearer API requests work', async () => withServer(async server => {
  const cookie = { Cookie: 'zenflow_identity=alice' };
  assert.equal((await server.request('/tasks/a', '', 'PUT', { title: 'bad' }, cookie)).status, 403);
  assert.equal((await server.request('/tasks/a', '', 'PUT', { title: 'bad' }, { ...cookie, 'x-zenflow-request': '1', Origin: 'https://attacker.invalid' })).status, 403);
  assert.equal((await server.request('/tasks/a', '', 'PUT', { title: 'good' }, { ...cookie, 'x-zenflow-request': '1', Origin: server.url })).status, 200);
}));
test('actual session exchange and logout issue HttpOnly cookies only for verified registered Google users', async () => withServer(async server => {
  for (const who of ['', 'expired', 'unverified', 'password', 'invalid']) {
    assert.equal((await server.request('/auth/session', who, 'POST', undefined, { 'x-zenflow-request': '1' })).status, 401);
  }
  assert.equal((await server.request('/auth/session', 'alice', 'POST')).status, 403);
  assert.equal((await server.request('/auth/session', 'unknown', 'POST', undefined, { 'x-zenflow-request': '1' })).status, 403);
  const response = await server.request('/auth/session', 'alice', 'POST', undefined, { 'x-zenflow-request': '1' });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie')!;
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  assert.match(cookie, /Path=\/api/i);
  assert.equal((await server.request('/state', '', 'GET', undefined, { Cookie: cookie.split(';')[0] })).status, 200);
  const logout = await server.request('/auth/session', '', 'DELETE', undefined, { 'x-zenflow-request': '1' });
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get('set-cookie')!, /Expires=Thu, 01 Jan 1970/i);
}));
test('public member fields use strict allowlist', () => {
  const member = publicMember({ id: 'a', email: 'a@b.invalid', role: 'design', futureSecret: 'secret', privateToken: 'token' });
  assert.equal(member.futureSecret, undefined);
  assert.equal(member.privateToken, undefined);
  assert.equal(member.id, 'a');
  assert.equal(member.role, 'design');
});
test('pipeline and retainer tasks retain deadline and timer behavior', async () => withServer(async server => {
  for (const status of ['pipeline', 'retainer']) {
    const response = await server.request('/tasks', 'alice', 'POST', { userId: 'alice', title: `Task ${status}`, status, cognitiveLoad: 'medium' });
    assert.equal(response.status, 201);
    const task = await response.json();
    assert.equal(task.status, status);
    assert.equal(task.dueDate, undefined);
  }
  server.store.tasks.push(fixtureTask('timer', 'alice'));
  await server.request('/tasks/timer', 'alice', 'PUT', { status: 'in_progress' });
  assert.ok(server.store.tasks.at(-1).inProgressStartedAt);
  await server.request('/tasks/timer', 'alice', 'PUT', { status: 'in_review' });
  assert.equal(server.store.tasks.at(-1).inProgressStartedAt, undefined);
  assert.ok(server.store.tasks.at(-1).inProgressDurationMs >= 0);
}));

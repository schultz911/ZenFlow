import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { generateKeyPairSync } from 'node:crypto';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'zenflow-production-'));
const reservation = net.createServer();
await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve));
const port = (reservation.address() as net.AddressInfo).port;
await new Promise<void>(resolve => reservation.close(() => resolve()));
const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'production', PORT: String(port) };
for (const name of ['FIREBASE_SERVICE_ACCOUNT_KEY', 'GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_AUTH_EMULATOR_HOST']) delete env[name];
let child: ChildProcess;
let output = '';
const start = () => {
  output = '';
  child = spawn(process.execPath, [path.resolve('dist/server.cjs')], { cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout!.on('data', chunk => { output += chunk.toString(); });
  child.stderr!.on('data', chunk => { output += chunk.toString(); });
};
const stop = async () => {
  if (child.exitCode === null) { const exited = new Promise<void>(resolve => child.once('exit', () => resolve())); child.kill('SIGTERM'); await exited; }
};
const ready = async () => {
  const timeout = Date.now() + 30000;
  while (!output.includes('Server running on port') && Date.now() < timeout) {
    if (child.exitCode !== null) throw new Error(`Production process exited: ${output}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.match(output, /Server running on port/);
};
try {
  start();
  await new Promise<void>(resolve => child.once('exit', () => resolve()));
  assert.equal(child.exitCode, 1);
  assert.match(output, /credentials are required/);
  console.log('Compiled server refuses startup without Firestore credentials.');
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^127\.0\.0\.1:\d+$/);
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify({ project_id: 'demo-zenflow', client_email: 'smoke@demo-zenflow.iam.gserviceaccount.com', private_key: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString() });
    env.FIREBASE_PROJECT_ID = 'demo-zenflow';
    env.FIREBASE_DATABASE_ID = 'smoke';
    env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
    const authApp = initializeApp({ projectId: 'zen-flow-7173d' }, 'smoke-auth');
    await getAuth(authApp).createUser({ uid: 'smoke-owner', email: 'kiran.s@zensciences.com', emailVerified: true });
    await deleteApp(authApp);
    const now = Math.floor(Date.now() / 1000);
    const token = [Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({
      sub: 'smoke-owner', user_id: 'smoke-owner', aud: 'zen-flow-7173d', iss: 'https://securetoken.google.com/zen-flow-7173d',
      iat: now, auth_time: now, exp: now + 3600, email: 'kiran.s@zensciences.com', email_verified: true, firebase: { sign_in_provider: 'google.com' },
    })).toString('base64url'), ''].join('.');
    const url = `http://127.0.0.1:${port}`;
    const request = (route: string, method = 'GET', body?: any, authenticated = true) => fetch(url + '/api' + route, {
      method, headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    start(); await ready();
    assert.equal((await request('/health', 'GET', undefined, false)).status, 200);
    for (const route of ['/state', '/events', '/users']) assert.equal((await request(route, 'GET', undefined, false)).status, 401);
    for (const route of ['/clickup/webhook', '/clickup/spaces', '/clickup/verify']) assert.equal((await request(route, 'POST', {}, false)).status, 410);
    const status = await (await request('/firestore/status')).json();
    assert.equal(status.connected, true, JSON.stringify(status) + output); assert.equal(status.mode, 'admin'); assert.equal(status.databaseId, 'smoke');
    const state = await (await request('/state')).json();
    const owner = state.users.find((user: any) => user.email === 'kiran.s@zensciences.com');
    const create = await request('/tasks', 'POST', { id: 'smoke-parent', userId: owner.id, title: 'Native retainer', status: 'retainer', cognitiveLoad: 'medium' });
    assert.equal(create.status, 201, await create.text());
    const subtask = await request('/tasks/smoke-parent/duplicate', 'POST', { targetUserId: owner.id, targetStatus: 'todo', targetDueDate: '2026-11-01' });
    assert.equal(subtask.status, 201);
    const childId = (await subtask.json()).task.id;
    assert.equal((await request(`/tasks/${childId}`, 'PUT', { title: 'Independent child' })).status, 200);
    await stop(); start(); await ready();
    const recovered = await (await request('/state')).json();
    assert.equal(recovered.tasks.find((task: any) => task.id === childId).parentTaskId, 'smoke-parent');
    assert.equal(recovered.tasks.find((task: any) => task.id === childId).title, 'Independent child');
    assert.equal((await request(`/tasks/${childId}`, 'DELETE')).status, 200);
    await stop(); start(); await ready();
    const deleted = await (await request('/state')).json();
    assert.ok(!deleted.tasks.some((task: any) => task.id === childId));
    assert.ok(deleted.tasks.some((task: any) => task.id === 'smoke-parent'));
    const audit = await (await request('/audit/logs')).json();
    assert.ok(audit.logs.some((entry: any) => entry.action === 'task_deleted'));
    const download = await request('/audit/download');
    assert.equal(download.status, 200); assert.ok((await download.text()).includes('task_deleted'));
    console.log('Compiled server + Firestore emulator: authenticated CRUD, delegation, audit export, restart and deletion recovery passed.');
  }
} finally {
  await stop();
  await fs.rm(directory, { recursive: true, force: true });
}

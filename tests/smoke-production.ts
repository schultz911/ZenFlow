import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import assert from 'node:assert/strict';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'zenflow-production-'));
const reservation = net.createServer();
await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve));
const port = (reservation.address() as net.AddressInfo).port;
await new Promise<void>(resolve => reservation.close(() => resolve()));
const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), ZENFLOW_DATA_DIR: path.join(directory, 'data') };
for (const name of ['FIREBASE_SERVICE_ACCOUNT_KEY', 'GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST']) delete env[name];
const child = spawn(process.execPath, [path.resolve('dist/server.cjs')], { cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
child.stdout.on('data', chunk => { output += chunk.toString(); });
child.stderr.on('data', chunk => { output += chunk.toString(); });
try {
  const timeout = Date.now() + 15000;
  while (!output.includes('Server running on port') && Date.now() < timeout) {
    if (child.exitCode !== null) throw new Error(`Production process exited: ${output}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.match(output, /Server running on port/);
  const url = `http://127.0.0.1:${port}`;
  assert.equal((await fetch(url + '/api/health')).status, 200);
  assert.equal((await fetch(url + '/api/state')).status, 401);
  assert.equal((await fetch(url + '/api/events')).status, 401);
  assert.equal((await fetch(url + '/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-is-superadmin': 'true' }, body: JSON.stringify({ email: 'spoof@example.invalid' }) })).status, 401);
  assert.equal((await fetch(url + '/api/clickup/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
  console.log('Compiled production server: health passes; anonymous API/SSE/mutations and unsigned webhook rejected. No live services used.');
} finally {
  child.kill('SIGTERM');
  if (child.exitCode === null) await new Promise<void>(resolve => child.once('exit', () => resolve()));
  await fs.rm(directory, { recursive: true, force: true });
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getApps, deleteApp } from 'firebase-admin/app';
import { verifyFirebaseIdToken } from '../server/firebaseAuth';
import { createServerApp, createSseHub, sanitizeString } from '../server/app';
import { createMemoryPersistenceAdapter, createWorkspaceRepository } from '../server/store';
import { createClickUpService } from '../server/clickup';
import { WebhookRegistry } from '../server/webhooks';

function encodeUnsignedJwt(payload: Record<string, unknown>): string {
  const b64 = (obj: Record<string, unknown>) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.`;
}

test('verifyFirebaseIdToken exchanges session without Firestore credentials and rejects invalid tokens', async () => {
  const prevEmulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const prevProject = process.env.FIREBASE_PROJECT_ID;
  delete process.env.FIREBASE_PROJECT_ID;

  // Stub Firebase Auth Emulator accounts:lookup endpoint so verifyIdToken runs without network/credentials.
  const emulatorServer = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url?.includes('accounts:lookup')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ users: [{ localId: 'uid-kiran', validSince: '0', disabled: false }] }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>(resolve => emulatorServer.listen(0, '127.0.0.1', resolve));
  const emulatorPort = (emulatorServer.address() as { port: number }).port;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${emulatorPort}`;

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zenflow-auth-reg-'));
  const adapter = createMemoryPersistenceAdapter({
    users: [
      {
        id: 'user-superadmin-kiran',
        name: 'Kiran S',
        email: 'kiran.s@zensciences.com',
        role: 'administrator',
        isAdministrator: true,
        isCreativeDirector: true,
        createdAt: '2026-10-01T00:00:00.000Z',
      },
    ],
    tasks: [],
    parentTasks: [],
  });
  const repo = createWorkspaceRepository(adapter);
  const webhookRegistry = new WebhookRegistry(path.join(workDir, 'webhooks.json'));
  const sseHub = createSseHub();
  const clickup = createClickUpService({ repo, webhookRegistry, broadcastEvent: sseHub.broadcastEvent, sanitizeString });

  const app = createServerApp({
    repo,
    clickup,
    verifyIdentity: verifyFirebaseIdToken,
    sseHub,
    enableRequestLogging: false,
  });
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Reset any cached identity app so emulator env var is picked up cleanly.
    const existing = getApps().find(a => a.name === 'zenflow-identity');
    if (existing) await deleteApp(existing);

    const now = Math.floor(Date.now() / 1000);
    const validToken = encodeUnsignedJwt({
      iss: 'https://securetoken.google.com/zen-flow-7173d',
      aud: 'zen-flow-7173d',
      auth_time: now,
      user_id: 'uid-kiran',
      sub: 'uid-kiran',
      iat: now,
      exp: now + 3600,
      email: 'kiran.s@zensciences.com',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    });

    const sessionRes = await fetch(`${baseUrl}/api/auth/session`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${validToken}`, 'x-zenflow-request': '1' },
    });
    assert.equal(sessionRes.status, 200);
    const sessionBody = await sessionRes.json();
    assert.equal(sessionBody.user.email, 'kiran.s@zensciences.com');

    const cookie = sessionRes.headers.get('set-cookie')?.split(';')[0] || '';
    assert.ok(cookie.startsWith('zenflow_identity='));

    const stateRes = await fetch(`${baseUrl}/api/state`, { headers: { Cookie: cookie } });
    assert.equal(stateRes.status, 200);

    const badRes = await fetch(`${baseUrl}/api/auth/session`, {
      method: 'POST',
      headers: { Authorization: 'Bearer not-a-valid-jwt', 'x-zenflow-request': '1' },
    });
    assert.equal(badRes.status, 401);
  } finally {
    const existing = getApps().find(a => a.name === 'zenflow-identity');
    if (existing) await deleteApp(existing);
    if (prevEmulator === undefined) delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    else process.env.FIREBASE_AUTH_EMULATOR_HOST = prevEmulator;
    if (prevProject === undefined) delete process.env.FIREBASE_PROJECT_ID;
    else process.env.FIREBASE_PROJECT_ID = prevProject;
    sseHub.closeAll();
    server.closeAllConnections?.();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await new Promise<void>(resolve => emulatorServer.close(() => resolve()));
    await fs.rm(workDir, { recursive: true, force: true });
  }
});

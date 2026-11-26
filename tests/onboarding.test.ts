import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fixtureServer } from './fixtures';
import { createMemoryPersistenceAdapter, createWorkspaceRepository } from '../server/store';
import { createClickUpService } from '../server/clickup';
import { createServerApp, createSseHub, sanitizeString } from '../server/app';
import { WebhookRegistry } from '../server/webhooks';

describe('Onboarding & Access Requests', () => {
  it('rejects non-@zensciences.com emails outright without creating an access request', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zenflow-onb-'));
    const repo = createWorkspaceRepository(createMemoryPersistenceAdapter({ users: [], tasks: [], parentTasks: [] }));
    const sseHub = createSseHub();
    const clickup = createClickUpService({
      repo,
      webhookRegistry: new WebhookRegistry(path.join(tmpDir, 'wh.json')),
      broadcastEvent: sseHub.broadcastEvent,
      sanitizeString,
    });
    const app = createServerApp({
      repo,
      clickup,
      sseHub,
      enableRequestLogging: false,
      verifyIdentity: async () => ({
        email: 'outsider@gmail.com',
        email_verified: true,
        exp: Math.floor(Date.now() / 1000) + 3600,
        firebase: { sign_in_provider: 'google.com' },
      }),
    });
    const server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;
    try {
      const res = await fetch(`${baseUrl}/api/auth/request-access`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer external',
          origin: baseUrl,
          'x-zenflow-request': '1',
        },
        body: JSON.stringify({ name: 'Outsider' }),
      });
      assert.equal(res.status, 403);
      const errBody = await res.json();
      assert.match(errBody.error || '', /@zensciences\.com/i);
      assert.equal(repo.getAccessRequests().length, 0);
    } finally {
      sseHub.closeAll();
      await new Promise<void>(resolve => server.close(() => resolve()));
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('creates deduped access requests for verified @zensciences.com accounts and enforces RBAC', async () => {
    const srv = await fixtureServer();
    try {
      const originHeaders = { origin: srv.url, 'x-zenflow-request': '1' };
      const first = await srv.request(
        '/auth/request-access',
        'unknown',
        'POST',
        { name: 'New Member' },
        originHeaders
      );
      assert.equal(first.status, 201);
      const firstData = await first.json();
      assert.equal(firstData.deduplicated, false);
      assert.equal(firstData.request.email, 'unknown@zensciences.com');
      assert.equal(firstData.request.status, 'pending');

      const second = await srv.request(
        '/auth/request-access',
        'unknown',
        'POST',
        { name: 'New Member' },
        originHeaders
      );
      assert.equal(second.status, 200);
      const secondData = await second.json();
      assert.equal(secondData.deduplicated, true);
      assert.equal(secondData.request.id, firstData.request.id);
      assert.equal(srv.repo.getAccessRequests().length, 1);

      // Non-manager cannot view or dismiss pending requests
      const nonMgrList = await srv.request('/access-requests', 'alice', 'GET');
      assert.equal(nonMgrList.status, 403);
      const nonMgrDismiss = await srv.request(`/access-requests/${firstData.request.id}/dismiss`, 'alice', 'POST');
      assert.equal(nonMgrDismiss.status, 403);

      // Manager can list pending requests
      const mgrList = await srv.request('/access-requests', 'cd', 'GET');
      assert.equal(mgrList.status, 200);
      const mgrData = await mgrList.json();
      assert.equal(mgrData.requests.length, 1);

      // Creating matching user automatically marks request approved
      const createRes = await srv.request('/users', 'cd', 'POST', {
        name: 'New Member',
        email: 'unknown@zensciences.com',
        role: 'content',
      });
      assert.equal(createRes.status, 201);

      const afterApprove = await srv.request('/access-requests', 'cd', 'GET');
      const afterData = await afterApprove.json();
      assert.equal(afterData.requests.length, 0);
      assert.equal(srv.repo.getAccessRequests()[0].status, 'approved');
    } finally {
      await srv.close();
    }
  });

  it('allows managers to dismiss a pending access request', async () => {
    const srv = await fixtureServer();
    try {
      const created = await srv.request(
        '/auth/request-access',
        'unknown',
        'POST',
        { name: 'Pending Person' },
        { origin: srv.url, 'x-zenflow-request': '1' }
      );
      assert.equal(created.status, 201);
      const { request } = await created.json();

      const dismiss = await srv.request(`/access-requests/${request.id}/dismiss`, 'root', 'POST');
      assert.equal(dismiss.status, 200);
      assert.equal(srv.repo.getAccessRequests()[0].status, 'dismissed');

      const pendingAfter = await srv.request('/access-requests', 'root', 'GET');
      const data = await pendingAfter.json();
      assert.equal(data.requests.length, 0);
    } finally {
      await srv.close();
    }
  });

  it('permits regular member to register first webhook when none exists, while denying overwrites to non-superadmin', async () => {
    const srv = await fixtureServer({
      clickupTransport: async url => {
        if (url.endsWith('/team')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ teams: [{ id: 'team-1' }] }),
            text: async () => '',
          };
        }
        if (url.includes('/webhook')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ webhook: { id: 'wh-first-1', secret: 'sec-1' } }),
            text: async () => '',
          };
        }
        return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
      },
    });
    try {
      // Remove pre-seeded test webhook first as superadmin
      const del = await srv.request('/clickup/webhook/wh-test-1', 'root', 'DELETE');
      assert.equal(del.status, 200);

      // Regular member saves personal ClickUp API key on their profile
      const saveKey = await srv.request('/users/alice', 'alice', 'PUT', {
        clickupApiKey: 'pk_alice_test_123',
      });
      assert.equal(saveKey.status, 200);

      // Regular member registers initial webhook using their ClickUp API key
      const reg = await srv.request(
        '/clickup/webhook/register',
        'alice',
        'POST',
        { endpoint: 'https://zenflow.example.com/api/clickup/webhook' }
      );
      assert.equal(reg.status, 200);
      const regData = await reg.json();
      assert.equal(regData.webhookId, 'wh-first-1');

      // Once a webhook exists, non-superadmin overwrite attempt is rejected
      const overwrite = await srv.request(
        '/clickup/webhook/register',
        'alice',
        'POST',
        { endpoint: 'https://zenflow.example.com/api/clickup/webhook' }
      );
      assert.equal(overwrite.status, 403);
    } finally {
      await srv.close();
    }
  });
});

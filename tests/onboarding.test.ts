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

      // Manager can list pending requests with intact status & timestamp (no member redaction)
      const mgrList = await srv.request('/access-requests', 'cd', 'GET');
      assert.equal(mgrList.status, 200);
      const mgrData = await mgrList.json();
      assert.equal(mgrData.requests.length, 1);
      assert.equal(mgrData.requests[0].status, 'pending');
      assert.equal(typeof mgrData.requests[0].requestedAt, 'string');
      assert.equal(mgrData.requests[0].clickupConnected, undefined);

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
      const dismissBody = await dismiss.json();
      assert.equal(dismissBody.request.status, 'dismissed');
      assert.equal(typeof dismissBody.request.requestedAt, 'string');
      assert.equal(srv.repo.getAccessRequests()[0].status, 'dismissed');

      const pendingAfter = await srv.request('/access-requests', 'root', 'GET');
      const data = await pendingAfter.json();
      assert.equal(data.requests.length, 0);
    } finally {
      await srv.close();
    }
  });

  it('syncRemote preserves remote accessRequests, rolls back on 503 save failure, and filters SSE by manager role', async () => {
    const remoteAdapter = createMemoryPersistenceAdapter({ users: [], tasks: [], parentTasks: [] });
    const repoWithRemote = createWorkspaceRepository({
      ...remoteAdapter,
      async syncFromRemote(current) {
        return {
          deletedLegacyTasks: 0,
          store: {
            ...current,
            accessRequests: [
              {
                id: 'req-remote-1',
                email: 'remote@zensciences.com',
                name: 'Remote User',
                status: 'pending',
                requestedAt: '2026-11-01T00:00:00.000Z',
              },
            ],
          },
        };
      },
    });
    const syncRes = await repoWithRemote.syncRemote();
    assert.equal(syncRes.synced, true);
    assert.equal(repoWithRemote.getAccessRequests().length, 1);
    assert.equal(repoWithRemote.getAccessRequests()[0].id, 'req-remote-1');

    const srv = await fixtureServer();
    const openSse = async (token: string) => {
      const ctrl = new AbortController();
      const res = await fetch(`${srv.url}/api/events`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: ctrl.signal,
      });
      assert.equal(res.status, 200);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      const nextEvent = async (expectedName?: string): Promise<{ event: string; data: any }> => {
        while (true) {
          const sep = buf.indexOf('\n\n');
          if (sep >= 0) {
            const frame = buf.slice(0, sep);
            buf = buf.slice(sep + 2);
            const evMatch = frame.match(/^event: (.+)$/m);
            const dataMatch = frame.match(/^data: (.+)$/m);
            if (evMatch && dataMatch) {
              const parsed = { event: evMatch[1], data: JSON.parse(dataMatch[1]) };
              if (!expectedName || parsed.event === expectedName) return parsed;
            }
          } else {
            const { value, done } = await reader.read();
            if (done) throw new Error('SSE closed early');
            buf += decoder.decode(value, { stream: true });
          }
        }
      };
      await nextEvent('snapshot');
      return { close: () => ctrl.abort(), nextEvent };
    };

    let aliceStream: Awaited<ReturnType<typeof openSse>> | undefined;
    let cdStream: Awaited<ReturnType<typeof openSse>> | undefined;
    try {
      aliceStream = await openSse('alice');
      cdStream = await openSse('cd');

      // Failed saveAccessRequest returns 503 and rolls back memory
      const origSave = srv.repo.saveAccessRequest;
      (srv.repo as any).saveAccessRequest = async () => {
        throw new Error('Firestore down');
      };
      try {
        const failReq = await srv.request(
          '/auth/request-access',
          'unknown',
          'POST',
          { name: 'Outage Test' },
          { origin: srv.url, 'x-zenflow-request': '1' }
        );
        assert.equal(failReq.status, 503);
        assert.equal(srv.repo.getAccessRequests().length, 0);
      } finally {
        (srv.repo as any).saveAccessRequest = origSave;
      }

      // Valid access request broadcasts to manager SSE but NOT non-manager SSE
      const created = await srv.request(
        '/auth/request-access',
        'unknown',
        'POST',
        { name: 'Queued User' },
        { origin: srv.url, 'x-zenflow-request': '1' }
      );
      assert.equal(created.status, 201);
      const { request } = await created.json();

      const mgrEvent = await cdStream.nextEvent('update');
      assert.equal(mgrEvent.data.type, 'access_request_created');
      assert.equal(mgrEvent.data.payload.email, 'unknown@zensciences.com');

      // Send a normal update visible to all; Alice's next update must be task_updated (never access_request_created)
      await srv.request('/tasks/a', 'alice', 'PUT', { title: 'Sentinel Update' });
      const aliceEvent = await aliceStream.nextEvent('update');
      assert.equal(aliceEvent.data.type, 'task_updated');
      assert.equal(aliceEvent.data.payload.title, 'Sentinel Update');

      // Dismiss rollback on saveAccessRequest failure
      (srv.repo as any).saveAccessRequest = async () => {
        throw new Error('Firestore down');
      };
      try {
        const failDismiss = await srv.request(`/access-requests/${request.id}/dismiss`, 'root', 'POST');
        assert.equal(failDismiss.status, 503);
        assert.equal(srv.repo.getAccessRequests()[0].status, 'pending');
      } finally {
        (srv.repo as any).saveAccessRequest = origSave;
      }
    } finally {
      aliceStream?.close();
      cdStream?.close();
      await srv.close();
    }
  });

  it('ignores non-superadmin custom webhook endpoints and serializes concurrent registrations', async () => {
    let createdEndpoints: string[] = [];
    const srv = await fixtureServer({
      clickupTransport: async (url, init) => {
        if (url.endsWith('/team')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ teams: [{ id: 'team-1' }] }),
            text: async () => '',
          };
        }
        if (url.includes('/webhook')) {
          const parsedBody = init?.body ? JSON.parse(String(init.body)) : {};
          createdEndpoints.push(parsedBody.endpoint || '');
          await new Promise(resolve => setTimeout(resolve, 25));
          return {
            ok: true,
            status: 200,
            json: async () => ({ webhook: { id: `wh-${createdEndpoints.length}`, secret: 'sec-1' } }),
            text: async () => '',
          };
        }
        return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
      },
    });
    try {
      await srv.request('/clickup/webhook/wh-test-1', 'root', 'DELETE');
      await srv.request('/users/alice', 'alice', 'PUT', { clickupApiKey: 'pk_alice_test_123' });
      await srv.request('/users/bob', 'root', 'PUT', { clickupApiKey: 'pk_bob_test_456' });

      const [resA, resB] = await Promise.all([
        srv.request('/clickup/webhook/register', 'alice', 'POST', {
          endpoint: 'https://attacker.example/hook',
        }),
        srv.request('/clickup/webhook/register', 'bob', 'POST', {
          endpoint: 'https://attacker2.example/hook',
        }),
      ]);

      const statuses = [resA.status, resB.status].sort((a, b) => a - b);
      assert.deepEqual(statuses, [200, 403]);
      assert.equal(createdEndpoints.length, 1);
      assert.equal(createdEndpoints[0], `${srv.url}/api/clickup/webhook`);

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

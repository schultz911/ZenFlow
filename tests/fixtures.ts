import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import http from 'node:http';
import type { Task, TaskStatus, User } from '../src/types';
import type { Identity } from '../server/security';
import {
  createMemoryPersistenceAdapter,
  createWorkspaceRepository,
  hydrateSubtasksFromParents,
  migrateLegacyRolesInStore,
} from '../server/store';
import { createClickUpService, type ClickUpTransport } from '../server/clickup';
import { createServerApp, createSseHub, sanitizeString } from '../server/app';
import { WebhookRegistry } from '../server/webhooks';

export function fixtureTask(
  id: string,
  userId?: string,
  statusOrExtra: TaskStatus | Partial<Task> = {}
): Task {
  const now = '2026-10-01T10:00:00.000Z';
  const extra: Partial<Task> = typeof statusOrExtra === 'string' ? { status: statusOrExtra } : statusOrExtra;
  return {
    id,
    userId,
    assigneeIds: userId ? [userId] : [],
    team: extra.team || 'content',
    title: `Task ${id}`,
    cognitiveLoad: 'medium',
    status: 'todo',
    order: 0,
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

export async function fixtureServer(
  directoryOrOptions?: string | { directory?: string; clickupTransport?: ClickUpTransport; identityLifetimeMs?: number }
) {
  const opts = typeof directoryOrOptions === 'string' ? { directory: directoryOrOptions } : directoryOrOptions || {};
  const owningTmpDir = !opts.directory;
  const workDir = opts.directory || (await fs.mkdtemp(path.join(os.tmpdir(), 'zenflow-test-')));
  const webhookSecret = 'whsec_test_secret_12345';

  const initialUsers: User[] = [
    {
      id: 'root',
      name: 'Kiran S',
      email: 'kiran.s@zensciences.com',
      role: 'administrator',
      avatarColor: 'from-blue-600 to-indigo-600',
      isAdministrator: true,
      isCreativeDirector: true,
      designation: 'Creative Director',
      createdAt: '2026-10-01T00:00:00.000Z',
    },
    {
      id: 'cd',
      name: 'CD Lead',
      email: 'cd@zensciences.com',
      role: 'content',
      avatarColor: 'from-purple-500 to-pink-500',
      isCreativeDirector: true,
      designation: 'Creative Director',
      createdAt: '2026-10-01T00:00:00.000Z',
    },
    {
      id: 'alice',
      name: 'Alice Content',
      email: 'alice@zensciences.com',
      role: 'content',
      avatarColor: 'from-blue-500 to-cyan-500',
      creativeDirectorId: 'cd',
      createdAt: '2026-10-01T00:00:00.000Z',
    },
    {
      id: 'bob',
      name: 'Bob Design',
      email: 'bob@zensciences.com',
      role: 'design',
      avatarColor: 'from-amber-500 to-orange-500',
      createdAt: '2026-10-01T00:00:00.000Z',
    },
    {
      id: 'lead',
      name: 'Cluster Lead',
      email: 'lead@zensciences.com',
      role: 'content',
      avatarColor: 'from-emerald-500 to-teal-500',
      isClusterLead: true,
      creativeDirectorId: 'cd',
      designation: 'Cluster Lead',
      createdAt: '2026-10-01T00:00:00.000Z',
    },
  ];

  const initialTasks: Task[] = [
    fixtureTask('a', 'alice', { team: 'content' }),
    fixtureTask('b', 'bob', { team: 'design' }),
  ];

  const adapter = createMemoryPersistenceAdapter({
    users: initialUsers,
    tasks: initialTasks,
    parentTasks: [],
  });
  const repo = createWorkspaceRepository(adapter);
  const webhookRegistry = new WebhookRegistry(path.join(workDir, 'webhooks.json'));
  await webhookRegistry.save({
    id: 'wh-test-1',
    endpoint: 'http://127.0.0.1/api/clickup/webhook',
    secret: webhookSecret,
  });

  let activeTransport: ClickUpTransport | undefined = opts.clickupTransport;
  const sseHub = createSseHub();
  const clickup = createClickUpService({
    repo,
    webhookRegistry,
    broadcastEvent: sseHub.broadcastEvent,
    sanitizeString,
    transport: (url, init) => (activeTransport ? activeTransport(url, init) : fetch(url, init)),
  });

  const futureExp = (Date.now() + (opts.identityLifetimeMs ?? 3_600_000)) / 1000;
  const verifyIdentity = async (token: string): Promise<Identity> => {
    if (token === 'expired') {
      return { email: 'alice@zensciences.com', email_verified: true, exp: 1000, firebase: { sign_in_provider: 'google.com' } };
    }
    if (token === 'unverified') {
      return { email: 'alice@zensciences.com', email_verified: false, exp: futureExp, firebase: { sign_in_provider: 'google.com' } };
    }
    if (token === 'password') {
      return { email: 'alice@zensciences.com', email_verified: true, exp: futureExp, firebase: { sign_in_provider: 'password' } };
    }
    if (token === 'unknown') {
      return { email: 'unknown@zensciences.com', email_verified: true, exp: futureExp, firebase: { sign_in_provider: 'google.com' } };
    }
    if (token === 'invalid' || !token) {
      throw new Error('Invalid token');
    }
    const matched = repo.getUsers().find(u => u.id === token || u.email.toLowerCase() === token.toLowerCase());
    if (matched) {
      return { email: matched.email, email_verified: true, exp: futureExp, firebase: { sign_in_provider: 'google.com' } };
    }
    if (token === 'kiran' || token === 'superadmin') {
      return { email: 'kiran.s@zensciences.com', email_verified: true, exp: futureExp, firebase: { sign_in_provider: 'google.com' } };
    }
    throw new Error('Unknown identity token');
  };

  const app = createServerApp({
    repo,
    clickup,
    verifyIdentity,
    sseHub,
    enableRequestLogging: false,
  });

  const httpServer = http.createServer(app);
  await new Promise<void>(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  const port = (httpServer.address() as any).port;
  const url = `http://127.0.0.1:${port}`;

  const request = (
    routePath: string,
    who: string = 'alice',
    method: string = 'GET',
    body?: any,
    extraHeaders: Record<string, string> = {}
  ) => {
    const headers: Record<string, string> = { ...extraHeaders };
    if (who && !headers.Authorization && !headers.authorization && !headers.Cookie && !headers.cookie) {
      headers.Authorization = `Bearer ${who}`;
    }
    if (body !== undefined && !headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }
    const apiPath = routePath.startsWith('/api') ? routePath : `/api${routePath.startsWith('/') ? '' : '/'}${routePath}`;
    return fetch(`${url}${apiPath}`, {
      method,
      headers,
      body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    });
  };

  const close = async () => {
    sseHub.closeAll();
    httpServer.closeAllConnections?.();
    await new Promise<void>(resolve => httpServer.close(() => resolve()));
    if (owningTmpDir) {
      await fs.rm(workDir, { recursive: true, force: true });
    }
  };

  return {
    url,
    store: repo.getStore() as { users: any[]; tasks: any[]; parentTasks: any[] },
    repo,
    clickup,
    webhookSecret,
    get audit() {
      return repo.getRecentAuditLogs();
    },
    enableLiveBroadcast: () => {},
    ctx: {
      broadcastEvent: sseHub.broadcastEvent,
      get clients() {
        return sseHub.getClients();
      },
    },
    migrateLegacyRoles: () => migrateLegacyRolesInStore(repo.getStore()),
    hydrateSubtasksFromParents: () => hydrateSubtasksFromParents(repo.getStore()),
    setClickupTransport: (transport: ClickUpTransport | undefined) => {
      activeTransport = transport;
    },
    request,
    close,
  };
}

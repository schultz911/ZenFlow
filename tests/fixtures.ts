import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import express from 'express';
import { createApiSecurity, redactPayload, SUPERADMIN_EMAIL, SESSION_COOKIE, sameOriginMutation, validSignature } from '../server/security';
import { WebhookRegistry } from '../server/webhooks';
import { writeSse } from '../server/resources';

const source = ts.createSourceFile('server.ts', fs.readFileSync('server.ts', 'utf8'), ts.ScriptTarget.Latest, true);
const handlers = new Map<string, string>();
const functions = new Map<string, string>();
function walk(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(source));
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.expression.getText(source) === 'app' && ts.isStringLiteral(node.arguments[0])) {
    const last = node.arguments.at(-1)!;
    if (ts.isArrowFunction(last)) handlers.set(`${node.expression.name.text} ${node.arguments[0].text}`, last.getText(source));
  }
  ts.forEachChild(node, walk);
}
walk(source);
const compile = (text: string) => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
export function fixtureTask(id: string, userId: string, status = 'todo') {
  return { id, userId, title: id, status, cognitiveLoad: 'medium', order: 0, createdAt: '2026-10-20T00:00:00Z', updatedAt: '2026-10-20T00:00:00Z', inProgressDurationMs: 0, activityLog: [] };
}
export async function fixtureServer(directory: string) {
  const store: any = {
    users: [
      { id: 'root', name: 'Root', email: SUPERADMIN_EMAIL, role: 'content', isCreativeDirector: true },
      { id: 'cd', name: 'Director', email: 'director@example.invalid', role: 'content', isCreativeDirector: true },
      { id: 'alice', name: 'Alice', email: 'alice@example.invalid', role: 'content', creativeDirectorId: 'cd' },
      { id: 'bob', name: 'Bob', email: 'bob@example.invalid', role: 'design' },
    ],
    tasks: [fixtureTask('a', 'alice'), fixtureTask('b', 'bob')],
    parentTasks: [],
  };
  const events: any[] = [], audit: any[] = [];
  const noop = () => {};
  const asyncNoop = async () => {};
  const webhookRegistry = new WebhookRegistry(path.join(directory, '.clickup-webhooks.json'));
  const ctx: any = {
    store, stateRevision: 1, maybeArchive: noop, deduplicateUsers: noop,
    saveStore: noop, dbSaveUser: asyncNoop, dbSaveTask: asyncNoop,
    dbSaveParentTask: asyncNoop, dbDeleteParentTask: asyncNoop, dbBatchSaveParentTasks: asyncNoop,
    dbDeleteUser: asyncNoop, dbDeleteTask: asyncNoop, dbBatchDeleteTasks: asyncNoop,
    dbBatchSaveTasks: asyncNoop, dbBatchSaveUsers: asyncNoop,
    dbPurgeAllCollections: asyncNoop,
    createHash,
    firestoreLimiter: (_req: any, _res: any, next: any) => next(),
    ensureSuperadmin: (s: any) => {
      s.users = s.users.filter((u: any) => u.email.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase());
      if (s.users.length === 0) {
        s.users.push({ id: 'root', name: 'Root', email: SUPERADMIN_EMAIL, role: 'content', isCreativeDirector: true });
      }
    },
    SUPERADMIN_EMAIL,
    LEGACY_REMOVED_ROLES: new Set(['video', 'ui_ux', 'research']),
    ZENFLOW_TO_CLICKUP_STATUS: {
      pipeline: 'open',
      retainer: 'in progress',
      todo: 'to do',
      in_progress: 'in progress',
      in_review: 'internal review',
      done: 'client review',
      archived: 'complete',
    },
    cachedClickupTeamIds: new Map(),
    webhookRegistry,
    validSignature,
    fetch: (...args: any[]) => (globalThis.fetch as any)(...args),
    URL,
    broadcastEvent: (type: string, payload: any) => events.push({ type, payload: redactPayload(payload) }),
    appendAuditLog: async (entry: any) => { audit.push(entry); },
    console: { log: noop, warn: noop, error: noop },
    AVATAR_COLORS: ['blue'],
    COGNITIVE_LOAD_ESTIMATES_MS: { low: 43200000, medium: 86400000, high: 129600000 },
    clients: [], nextClientId: 1, MAX_SSE_CLIENTS: 100,
    writeSse, redactPayload, setInterval, clearInterval,
  };
  for (const name of [
    'sanitizeString',
    'validateHttpUrl',
    'sanitizeUrlList',
    'sanitizeDisciplineMetadata',
    'migrateLegacyTaskFields',
    'hydrateSubtasksFromParents',
    'hashClickupDescription',
    'buildParentClickupMarkdown',
    'buildSubtaskClickupMarkdown',
    'pushSafeClickupDescription',
    'syncParentDescriptionToClickUp',
    'formatBillableHoursServer',
    'isCallerAuthorizedForPipeline',
    'getTaskAssigneeIdsServer',
    'migrateLegacyRoles',
    'resolveClickupTeamId',
    'postClickupTimeEntry',
    'syncContentLinkToClickUp',
    'syncTaskToClickUp',
    'processClickupWebhookEvent',
  ]) {
    ctx[name] = vm.runInNewContext(compile(functions.get(name)!) + `; ${name}`, ctx);
  }
  const app = express();
  app.set('case sensitive routing', true);
  app.use(express.json({ verify: (req: any, _res: any, buf: Buffer) => { req.rawBody = buf; } }));
  const verify = async (token: string) => {
    if (token === 'invalid') throw new Error('bad signature');
    const member = store.users.find((user: any) => user.id === token);
    return {
      email: member?.email || 'unknown@example.invalid', email_verified: token !== 'unverified',
      exp: Math.floor(Date.now() / 1000) + (token === 'expired' ? -60 : 3600),
      firebase: { sign_in_provider: token === 'password' ? 'password' : 'google.com' },
    };
  };
  ctx.verifyIdentity = verify;
  ctx.SESSION_COOKIE = SESSION_COOKIE;
  ctx.sameOriginMutation = sameOriginMutation;
  for (const route of ['post /api/auth/session', 'delete /api/auth/session']) {
    const handler = vm.runInNewContext(compile(`var handler = ${handlers.get(route)}`) + '; handler', ctx);
    const [method, routePath] = route.split(' ');
    (app as any)[method](routePath, handler);
  }
  app.use('/api', createApiSecurity({ getStore: () => store, verify }));
  const routes = [
    'get /api/health', 'get /api/state', 'get /api/users', 'post /api/users',
    'put /api/users/:id', 'delete /api/users/:id',
    'get /api/tasks', 'post /api/tasks', 'post /api/tasks/pipeline-bundle',
    'put /api/tasks/:id', 'delete /api/tasks/:id', 'post /api/tasks/reorder',
    'post /api/tasks/:id/duplicate', 'post /api/firestore/purge', 'get /api/events',
    'post /api/clickup/verify', 'get /api/clickup/spaces', 'post /api/clickup/spaces',
    'get /api/clickup/members', 'get /api/clickup/folders-and-lists', 'get /api/clickup/custom-fields',
    'post /api/clickup/lists', 'post /api/clickup/sync-user-tasks',
    'post /api/clickup/webhook', 'post /api/clickup/webhook/register',
    'get /api/clickup/webhook/status', 'delete /api/clickup/webhook/:id',
  ];
  for (const route of routes) {
    const handler = vm.runInNewContext(compile(`var handler = ${handlers.get(route)}`) + '; handler', ctx);
    const [method, routePath] = route.split(' ');
    (app as any)[method](routePath, (req: any, res: any, next: any) => {
      try { Promise.resolve(handler(req, res)).catch(next); } catch (error) { next(error); }
    });
  }
  app.use((_error: any, _req: any, res: any, _next: any) => res.status(500).json({ error: 'fixture handler failed' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  const address = server.address() as any;
  const url = `http://127.0.0.1:${address.port}`;
  return { store, events, audit, ctx, url,
    migrateLegacyRoles: () => ctx.migrateLegacyRoles(store),
    hydrateSubtasksFromParents: () => ctx.hydrateSubtasksFromParents(store),
    enableLiveBroadcast: () => { ctx.broadcastEvent = vm.runInNewContext(compile(functions.get('broadcastEvent')!) + '; broadcastEvent', ctx); },
    request: (route: string, who = 'alice', method = 'GET', body?: any, headers: Record<string, string> = {}) => fetch(url + '/api' + route, {
      method, headers: { ...(who ? { Authorization: `Bearer ${who}` } : {}), 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    close: async () => { for (const client of ctx.clients) client.res.destroy(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}

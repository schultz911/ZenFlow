import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import express from 'express';
import { createApiSecurity, redactPayload, SUPERADMIN_EMAIL, SESSION_COOKIE, sameOriginMutation } from '../server/security';
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
export async function fixtureServer(_directory: string) {
  const store: any = {
    users: [
      { id: 'root', name: 'Root', email: SUPERADMIN_EMAIL, role: 'content', isCreativeDirector: true },
      { id: 'cd', name: 'Director', email: 'director@example.invalid', role: 'content', isCreativeDirector: true },
      { id: 'alice', name: 'Alice', email: 'alice@example.invalid', role: 'content', creativeDirectorId: 'cd' },
      { id: 'bob', name: 'Bob', email: 'bob@example.invalid', role: 'design' },
    ],
    tasks: [fixtureTask('a', 'alice'), fixtureTask('b', 'bob')],
  };
  const events: any[] = [], audit: any[] = [];
  const noop = () => {};
  const asyncNoop = async () => {};
  const ctx: any = {
    adminDb: { doc: () => ({ get: async () => ({ exists: true }) }) },
    pendingEvents: null, structuredClone, store, stateRevision: 1, autoArchiveDoneTasks: noop, deduplicateUsers: noop,
    saveStore: noop, dbSaveUser: asyncNoop, dbSaveTask: asyncNoop,
    dbDeleteUser: asyncNoop, dbDeleteTask: asyncNoop, dbBatchDeleteTasks: asyncNoop,
    dbBatchSaveTasks: asyncNoop, dbBatchSaveUsers: asyncNoop,
    SUPERADMIN_EMAIL,
    broadcastEvent: (type: string, payload: any) => events.push({ type, payload: redactPayload(payload) }),
    appendAuditLog: async (entry: any) => { audit.push(entry); },
    console: { log: noop, warn: noop, error: noop },
    AVATAR_COLORS: ['blue'],
    COGNITIVE_LOAD_ESTIMATES_MS: { medium: 86400000 },
    fetch: async () => ({ ok: true, json: async () => ({ teams: [], assignees: [], status: { status: 'to do' } }) }),
    clients: [], nextClientId: 1, MAX_SSE_CLIENTS: 100,
    writeSse, redactPayload, setInterval, clearInterval,
  };
  for (const name of ['sanitizeString', 'formatBillableHoursServer']) {
    ctx[name] = vm.runInNewContext(compile(functions.get(name)!) + `; ${name}`, ctx);
  }

  const app = express();
  app.set('case sensitive routing', true);
  app.use(express.json({ verify: (req, _res, buffer) => { (req as any).rawBody = Buffer.from(buffer); } }));
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
  const routes = ['get /api/health', 'get /api/state', 'get /api/users', 'post /api/users',
    'put /api/users/:id', 'delete /api/users/:id', 'get /api/tasks', 'post /api/tasks',
    'put /api/tasks/:id', 'delete /api/tasks/:id', 'post /api/tasks/reorder',
    'post /api/tasks/:id/duplicate', 'get /api/events'];
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
    enableLiveBroadcast: () => { ctx.broadcastEvent = vm.runInNewContext(compile(functions.get('broadcastEvent')!) + '; broadcastEvent', ctx); },
    request: (route: string, who = 'alice', method = 'GET', body?: any, headers: Record<string, string> = {}) => fetch(url + '/api' + route, {
      method, headers: { ...(who ? { Authorization: `Bearer ${who}` } : {}), 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    close: async () => { for (const client of ctx.clients) client.res.destroy(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function clientFixture(saved: Record<string, string> = {}, transport?: (input: string, options: any) => Promise<Response>) {
  const data = new Map(Object.entries(saved));
  let user: any = { uid: 'google-alice', getIdToken: async () => 'alice-token' };
  const auth = { get currentUser() { return user; } };
  const calls: any[] = [];
  const module: any = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('src/lib/api.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, {
    exports: module.exports, require: () => ({ getFirebaseAuth: async () => auth }), Headers, URL,
    localStorage: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) },
    window: { fetch: async (input: string, options: any) => {
      calls.push({ input, options });
      if (transport) return transport(input, options);
      if (options?.method === 'DELETE') return new Response(null, { status: 204 });
      return Response.json({ user: { id: options?.headers?.Authorization === 'Bearer bob-token' ? 'bob' : 'alice' } });
    } },
  });
  return { api: module.exports, calls, data, setUser: (next: any) => { user = next; } };
}
test('client deduplicates session exchange and strips identity assertions from API requests', async () => {
  const fixture = clientFixture();
  await Promise.all(Array.from({ length: 10 }, () => fixture.api.ensureApiSession()));
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.api.getApiMemberId(), 'alice');
  await fixture.api.apiFetch('/api/state', { headers: { 'x-is-superadmin': 'true', 'x-caller-email': 'spoof' } });
  const request = fixture.calls.at(-1);
  assert.equal(request.options.headers.get('x-is-superadmin'), null);
  assert.equal(request.options.headers.get('x-zenflow-request'), '1');
  assert.equal(request.options.credentials, 'same-origin');
});
test('only an unregistered session response triggers the access request path', async () => {
  const missing = clientFixture({}, async () => Response.json({ error: 'Account not registered in ZenFlow' }, { status: 403 }));
  await assert.rejects(missing.api.ensureApiSession(), (error: any) => error instanceof missing.api.UnregisteredMemberError);

  const denied = clientFixture({}, async () => Response.json({ error: 'Invalid request origin' }, { status: 403 }));
  await assert.rejects(denied.api.ensureApiSession(), (error: any) =>
    !(error instanceof denied.api.UnregisteredMemberError) && error.message === 'Invalid request origin');
});
test('cached profiles cannot authenticate requests and offline queue migration preserves pending work', async () => {
  const fixture = clientFixture({ team_dash_current_user_v1: JSON.stringify({ id: 'alice' }),
    zenflow_mutation_queue_v1: JSON.stringify([{ type: 'update_task', payload: { title: 'Keep my edit' } }]) });
  fixture.setUser(null);
  await assert.rejects(fixture.api.apiFetch('/api/state'), /Google authentication required/);
  assert.equal(fixture.calls.length, 0);
  assert.match(fixture.data.get('zenflow_mutation_queue_v1:alice')!, /Keep my edit/);
});
test('account/token changes revalidate the session instead of reusing another member identity', async () => {
  const fixture = clientFixture();
  await fixture.api.ensureApiSession();
  fixture.setUser({ uid: 'google-bob', getIdToken: async () => 'bob-token' });
  await fixture.api.ensureApiSession();
  assert.equal(fixture.calls.length, 2);
  assert.equal(fixture.api.getApiMemberId(), 'bob');
});
test('logout wins over an in-flight exchange and clears its cookie after completion', async () => {
  let complete!: () => void;
  const blocked = new Promise<void>(resolve => { complete = resolve; });
  const fixture = clientFixture({}, async (_input, options) => {
    if (options.method === 'DELETE') return new Response(null, { status: 204 });
    await blocked;
    return Response.json({ user: { id: 'alice' } });
  });
  const pending = fixture.api.ensureApiSession();
  const rejection = assert.rejects(pending, /session changed/);
  await new Promise(resolve => setImmediate(resolve));
  const logout = fixture.api.clearApiSession();
  complete();
  await Promise.all([rejection, logout]);
  assert.equal(fixture.api.getApiMemberId(), '');
  assert.equal(fixture.calls.at(-1).options.method, 'DELETE');
});

test('a rate-limited replay retains the edits in order and retries without spending attempts', async () => {
  const queueKey = 'zenflow_mutation_queue_v1:alice';
  const items = [
    { id: 'edit-1', endpoint: '/api/tasks/a', method: 'PUT', payload: { title: 'One' }, retryCount: 0 },
    { id: 'edit-2', endpoint: '/api/tasks/b', method: 'PUT', payload: { title: 'Two' }, retryCount: 0 },
  ];
  const data = new Map([[queueKey, JSON.stringify(items)]]);
  const attempted: string[] = [];
  let limited = true;
  const module: { exports: any } = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('src/lib/syncClient.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports: module.exports,
    require: () => ({
      getApiMemberId: () => 'alice',
      getRateLimitRetryMs: (response: Response) => Number(response.headers.get('Retry-After')) * 1000,
      apiFetch: async (endpoint: string) => {
        attempted.push(endpoint);
        return limited ? new Response(null, { status: 429, headers: { 'Retry-After': '3' } }) : new Response(null, { status: 204 });
      },
    }),
    localStorage: {
      getItem: (key: string) => data.get(key),
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
    },
  });

  const result = await module.exports.replayMutationQueue();
  assert.equal(result.completed, false);
  assert.equal(result.retryAfterMs, 3000);
  assert.deepEqual(attempted, ['/api/tasks/a']);
  assert.deepEqual(JSON.parse(data.get(queueKey)!), items);
  limited = false;
  assert.equal((await module.exports.replayMutationQueue()).completed, true);
  assert.deepEqual(attempted, ['/api/tasks/a', '/api/tasks/a', '/api/tasks/b']);
  assert.equal(data.has(queueKey), false);
});

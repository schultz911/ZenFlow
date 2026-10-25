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
  await fixture.api.apiFetch('/api/state', { headers: { 'x-clickup-api-key': 'old-key', 'x-is-superadmin': 'true', 'x-caller-email': 'spoof' } });
  const request = fixture.calls.at(-1);
  assert.equal(request.options.headers.get('x-clickup-api-key'), null);
  assert.equal(request.options.headers.get('x-is-superadmin'), null);
  assert.equal(request.options.headers.get('x-zenflow-request'), '1');
  assert.equal(request.options.credentials, 'same-origin');
});
test('cached profiles cannot authenticate requests and offline queue migration removes old tokens', async () => {
  const fixture = clientFixture({ team_dash_current_user_v1: JSON.stringify({ id: 'alice', clickupApiKey: 'saved-secret' }), zenflow_clickup_api_key: 'saved-secret',
    zenflow_mutation_queue_v1: JSON.stringify([{ type: 'update_task', payload: { title: 'Keep my edit', clickupApiKey: 'saved-secret' } }]) });
  fixture.setUser(null);
  await assert.rejects(fixture.api.apiFetch('/api/state'), /Google authentication required/);
  assert.equal(fixture.calls.length, 0);
  assert.ok(!JSON.stringify([...fixture.data]).includes('saved-secret'));
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

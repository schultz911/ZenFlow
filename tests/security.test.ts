import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fixtureServer, fixtureTask } from './fixtures';
import { createApiSecurity, getSuperadminEmail, publicMember, SUPERADMIN_EMAIL } from '../server/security';
import { decryptSecret, encryptSecret } from '../server/crypto';

async function withServer(run: (server: Awaited<ReturnType<typeof fixtureServer>>) => Promise<void>) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'zenflow-security-'));
  const server = await fixtureServer(directory);
  try { await run(server); } finally { await server.close(); await fs.rm(directory, { recursive: true, force: true }); }
}
test('anonymous, expired, unverified and non-Google identities cannot read workspace data', async () => withServer(async server => {
  for (const who of ['', 'expired', 'unverified', 'password', 'invalid']) assert.equal((await server.request('/state', who)).status, 401);
  assert.equal((await server.request('/state', 'unknown')).status, 403);
  assert.equal((await server.request('/health', '')).status, 200);
}));
test('anonymous mutation and SSE routes are protected before handlers run', async () => withServer(async server => {
  for (const [route, method, body] of [['/users', 'POST', {}], ['/users/alice', 'DELETE', undefined], ['/tasks/a', 'DELETE', undefined], ['/tasks/reorder', 'POST', {}], ['/events', 'GET', undefined], ['/firestore/credentials', 'POST', {}], ['/audit/download', 'GET', undefined]]) {
    assert.equal((await server.request(route as string, '', method as string, body)).status, 401);
  }
  assert.equal(server.store.tasks.length, 2);
  assert.equal(server.audit.length, 0);
}));
test('spoofed admin headers, role escalation and trailing slash cannot bypass permissions', async () => withServer(async server => {
  for (const route of ['/users', '/users/']) assert.equal((await server.request(route, 'alice', 'POST', { name: 'Alice', email: 'alice@example.invalid', role: 'content', isCreativeDirector: true }, { 'x-is-superadmin': 'true', 'x-caller-email': 'kiran.s@zensciences.com' })).status, 403);
  assert.equal((await server.request('/users/bob/', 'alice', 'PUT', { email: 'attacker@example.invalid' }, { 'x-is-superadmin': 'true' })).status, 403);
  assert.equal((await server.request('/tasks/b/', 'alice', 'DELETE')).status, 403);
  assert.equal(server.store.users.find((user: any) => user.id === 'alice').isCreativeDirector, undefined);
}));
test('regular users edit own tasks; CDs edit their team; unrelated edits are denied', async () => withServer(async server => {
  assert.equal((await server.request('/tasks/a', 'alice', 'PUT', { title: 'Own update' })).status, 200);
  assert.equal((await server.request('/tasks/a', 'cd', 'PUT', { title: 'Team update' })).status, 200);
  assert.equal((await server.request('/tasks/b', 'cd', 'PUT', { title: 'Forbidden' })).status, 403);
  assert.equal((await server.request('/tasks/b', 'root', 'PUT', { title: 'Admin update' })).status, 200);
  assert.equal(server.store.tasks.find((task: any) => task.id === 'a').title, 'Team update');
}));
test('batch authorization is atomic and owner reassignment cannot cross an unauthorized boundary', async () => withServer(async server => {
  assert.equal((await server.request('/tasks/reorder', 'alice', 'POST', { updates: [{ id: 'a', order: 8 }, { id: 'b', order: 9 }] })).status, 403);
  assert.equal(server.store.tasks[0].order, 0);
  assert.equal((await server.request('/tasks/a', 'alice', 'PUT', { userId: 'bob' })).status, 403);
  assert.equal((await server.request('/tasks', 'alice', 'POST', { userId: 'bob', title: 'Forbidden', status: 'todo' })).status, 403);
}));
test('universal authenticated delegation remains independent across boards and self assignment', async () => withServer(async server => {
  for (const targetUserId of ['bob', 'alice']) {
    const response = await server.request('/tasks/a/duplicate', 'alice', 'POST', { targetUserId, status: 'todo', dueDate: '2026-11-01' });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.task.parentTaskId, 'a');
    assert.equal(body.task.isSubtask, true);
    assert.equal(body.task.userId, targetUserId);
    assert.equal((await server.request(`/tasks/${body.task.id}`, targetUserId, 'PUT', { status: 'in_progress' })).status, 200);
    assert.equal(server.store.tasks[0].status, 'todo');
    await server.request(`/tasks/${body.task.id}`, targetUserId, 'DELETE');
    assert.ok(server.store.tasks.find((task: any) => task.id === 'a'));
  }
}));
test('member provisioning, profile updates and root protection retain the role matrix', async () => withServer(async server => {
  assert.equal((await server.request('/users', 'cd', 'POST', { name: 'New', email: 'new@example.invalid', role: 'design' })).status, 201);
  assert.equal(server.store.users.at(-1).creativeDirectorId, 'cd');
  assert.equal((await server.request('/users', 'cd', 'POST', { name: 'New CD', email: 'newcd@example.invalid', role: 'content', isCreativeDirector: true })).status, 403);
  assert.equal((await server.request('/users', 'cd', 'POST', { name: 'New Admin', email: 'admin@example.invalid', role: 'administrator' })).status, 403);
  assert.equal((await server.request('/users/root', 'root', 'DELETE')).status, 403);
  assert.equal((await server.request('/users/alice', 'alice', 'PUT', { role: 'design' })).status, 403);
  assert.equal((await server.request('/users/alice', 'cd', 'PUT', { name: 'Alice Renamed' })).status, 200);
  assert.equal(server.store.users.find((u: any) => u.id === 'alice').name, 'Alice Renamed');
  const designUserRes = await server.request('/users', 'root', 'POST', {
    name: 'Brand Designer',
    email: 'designer@example.invalid',
    role: 'design',
    isBrandDesigner: true,
    clusterLeadId: 'cd',
  });
  assert.equal(designUserRes.status, 201);
  const createdDesignUser = await designUserRes.json();
  assert.equal(createdDesignUser.role, 'design');
  assert.equal(createdDesignUser.isBrandDesigner, true);
  assert.equal(createdDesignUser.clusterLeadId, 'cd');
}));
test('special role combinations are enforced on create and update without escalating callers', async () => withServer(async server => {
  const create = (suffix: string, fields: object) => server.request('/users', 'root', 'POST', {
    name: suffix, email: `${suffix}@example.invalid`, ...fields,
  });
  assert.equal((await create('invalid-cd', { role: 'content', isCreativeDirector: true, isAdministrator: true })).status, 400);
  assert.equal((await create('invalid-admin', { isCreativeDirector: true })).status, 400);
  assert.equal((await create('invalid-cluster', { role: 'design', isClusterLead: true })).status, 400);
  assert.equal((await create('invalid-team', { role: 'account_manager', isTeamLead: true })).status, 400);
  assert.equal((await create('invalid-multiple', { isCreativeDirector: true, isBusinessLead: true, isAdministrator: true })).status, 400);
  const created = await create('lead', { isCreativeDirector: true, isAdministrator: true });
  assert.equal(created.status, 201);
  const lead = await created.json();
  assert.equal(lead.role, undefined);
  assert.equal(lead.isAdministrator, true);
  assert.equal((await server.request(`/users/${lead.id}`, 'cd', 'PUT', { role: 'account_manager', isClusterLead: true })).status, 403);
  const cluster = await server.request(`/users/${lead.id}`, 'root', 'PUT', {
    role: 'account_manager', isAdministrator: false, isCreativeDirector: false, isClusterLead: true,
  });
  assert.equal(cluster.status, 200);
  const clusterUser = await cluster.json();
  assert.equal(clusterUser.role, 'account_manager');
  assert.equal(Boolean(clusterUser.isAdministrator), false);
  assert.equal(clusterUser.isClusterLead, true);
  assert.equal((await server.request(`/users/${lead.id}`, 'root', 'PUT', { role: 'design' })).status, 400);
  const team = await server.request(`/users/${lead.id}`, 'root', 'PUT', {
    role: 'design', isClusterLead: false, isTeamLead: true, isAdministrator: false, isAccountManager: false,
  });
  assert.equal(team.status, 200);
  const teamUser = await team.json();
  assert.equal(teamUser.role, 'design');
  assert.equal(Boolean(teamUser.isAccountManager), false);
  const business = await server.request(`/users/${lead.id}`, 'root', 'PUT', {
    role: null, isTeamLead: false, isBusinessLead: true, isAdministrator: true,
  });
  assert.equal(business.status, 200);
  const businessUser = await business.json();
  assert.equal(businessUser.role, undefined);
  assert.equal(businessUser.isAdministrator, true);
  assert.equal((await server.request('/users/cd', 'root', 'PUT', { name: 'Legacy CD' })).status, 200);
}));
test('HTTP user payloads and mutation events use an allowlist to prevent private credential leakage', async () => withServer(async server => {
  server.store.users[2].privateInternalToken = 'SYNTHETIC_PRIVATE_KEY';
  server.store.users[2].clickupApiKey = 'pk_secret_token_do_not_leak';
  for (const route of ['/state', '/users']) {
    const response = await server.request(route);
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.ok(!body.includes('SYNTHETIC_PRIVATE_KEY'));
    assert.ok(!body.includes('pk_secret_token_do_not_leak'));
  }
}));
test('clickup webhook rejects unsigned or tampered requests with 401', async () => withServer(async server => {
  const resMissingSig = await server.request('/clickup/webhook', '', 'POST', { event: 'taskStatusUpdated' });
  assert.equal(resMissingSig.status, 401);
  const resInvalidSig = await server.request('/clickup/webhook', '', 'POST', { event: 'taskStatusUpdated' }, { 'x-signature': 'deadbeef' });
  assert.equal(resInvalidSig.status, 401);
}));
test('cookie mutations require the same-origin non-simple header; Bearer API requests work', async () => withServer(async server => {
  const cookie = { Cookie: 'zenflow_identity=alice' };
  assert.equal((await server.request('/tasks/a', '', 'PUT', { title: 'bad' }, cookie)).status, 403);
  assert.equal((await server.request('/tasks/a', '', 'PUT', { title: 'bad' }, { ...cookie, 'x-zenflow-request': '1', Origin: 'https://attacker.invalid' })).status, 403);
  assert.equal((await server.request('/tasks/a', '', 'PUT', { title: 'good' }, { ...cookie, 'x-zenflow-request': '1', Origin: server.url })).status, 200);
}));
test('actual session exchange and logout issue HttpOnly cookies only for verified registered Google users', async () => withServer(async server => {
  for (const who of ['', 'expired', 'unverified', 'password', 'invalid']) {
    assert.equal((await server.request('/auth/session', who, 'POST', undefined, { 'x-zenflow-request': '1' })).status, 401);
  }
  assert.equal((await server.request('/auth/session', 'alice', 'POST')).status, 403);
  assert.equal((await server.request('/auth/session', 'unknown', 'POST', undefined, { 'x-zenflow-request': '1' })).status, 403);
  const response = await server.request('/auth/session', 'alice', 'POST', undefined, { 'x-zenflow-request': '1' });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie')!;
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  assert.match(cookie, /Path=\/api/i);
  assert.equal((await server.request('/state', '', 'GET', undefined, { Cookie: cookie.split(';')[0] })).status, 200);
  const logout = await server.request('/auth/session', '', 'DELETE', undefined, { 'x-zenflow-request': '1' });
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get('set-cookie')!, /Expires=Thu, 01 Jan 1970/i);
}));
test('public member fields use strict allowlist', () => {
  const member = publicMember({
    id: 'a',
    email: 'a@b.invalid',
    role: 'design',
    isClusterLead: true,
    isContentLead: true,
    isArtDirector: true,
    isAdministrator: true,
    isBusinessLead: true,
    isContentSpecialist: true,
    isBrandDesigner: true,
    isTeamLead: true,
    isAccountManager: true,
    designation: 'Business Lead',
    clusterLeadId: 'lead-1',
    clickupApiKey: 'pk_secret_123',
    clickupUserId: '9911',
    clickupUsername: 'designer99',
    futureSecret: 'secret',
    privateToken: 'token',
  });
  assert.equal(member.futureSecret, undefined);
  assert.equal(member.privateToken, undefined);
  assert.equal(member.clickupApiKey, undefined);
  assert.equal(member.id, 'a');
  assert.equal(member.role, 'design');
  assert.equal(member.clickupUserId, '9911');
  assert.equal(member.clickupUsername, 'designer99');
  assert.equal(member.isClusterLead, true);
  assert.equal(member.isTeamLead, true);
  assert.equal(member.isAccountManager, true);
  assert.equal(member.isContentLead, true);
  assert.equal(member.isArtDirector, true);
  assert.equal(member.isAdministrator, true);
  assert.equal(member.isBusinessLead, true);
  assert.equal(member.isContentSpecialist, true);
  assert.equal(member.isBrandDesigner, true);
  assert.equal(member.designation, 'Business Lead');
  assert.equal(member.clusterLeadId, 'lead-1');
});
test('pipeline and retainer tasks retain deadline and timer behavior', async () => withServer(async server => {
  for (const status of ['pipeline', 'retainer']) {
    const response = await server.request('/tasks', 'cd', 'POST', {
      userId: 'alice',
      title: `Task ${status}`,
      status,
      cognitiveLoad: 'high',
      priority: 'high',
      estimatedHours: 4,
      dueDate: '2026-12-01',
    });
    assert.equal(response.status, 201);
    const task = await response.json();
    assert.equal(task.status, status);
    assert.equal(task.dueDate, undefined);
    if (status === 'retainer') {
      assert.equal(task.cognitiveLoad, undefined);
      assert.equal(task.priority, undefined);
      assert.equal(task.estimatedHours, undefined);
      // Subtask duplicated from Ongoing retains explicitly supplied estimate, priority, load, and deadline
      const dupRes = await server.request(`/tasks/${task.id}/duplicate`, 'cd', 'POST', {
        targetUserId: 'alice',
        title: 'Ongoing Subtask',
        targetStatus: 'todo',
        targetDueDate: '2026-12-05',
        targetCognitiveLoad: 'high',
        targetPriority: 'high',
        targetEstimatedHours: 3.5,
      });
      assert.equal(dupRes.status, 201);
      const { task: subtask } = await dupRes.json();
      assert.equal(subtask.cognitiveLoad, 'high');
      assert.equal(subtask.priority, 'high');
      assert.equal(subtask.estimatedHours, 3.5);
      assert.equal(subtask.dueDate, '2026-12-05');
    }
  }
  server.store.tasks.push(fixtureTask('timer', 'alice'));
  await server.request('/tasks/timer', 'alice', 'PUT', { status: 'in_progress' });
  assert.ok(server.store.tasks.at(-1).inProgressStartedAt);
  await server.request('/tasks/timer', 'alice', 'PUT', { status: 'in_review' });
  assert.equal(server.store.tasks.at(-1).inProgressStartedAt, undefined);
  assert.ok(server.store.tasks.at(-1).inProgressDurationMs >= 0);
}));

test('database purge: exclusive to superadmin; non-superadmins are rejected with 403', async () => withServer(async server => {
  // Alice (regular user) receives 403
  const aliceRes = await server.request('/firestore/purge', 'alice', 'POST', {});
  assert.equal(aliceRes.status, 403);

  // Creative Director (non-superadmin) receives 403
  const cdRes = await server.request('/firestore/purge', 'cd', 'POST', {});
  assert.equal(cdRes.status, 403);

  // Initial state check: has tasks and multiple users
  assert.ok(server.store.tasks.length > 0);
  assert.ok(server.store.users.length > 1);

  // Superadmin (root) calling purge succeeds
  const rootRes = await server.request('/firestore/purge', 'root', 'POST', {});
  assert.equal(rootRes.status, 200);
  const data = await rootRes.json();
  assert.equal(data.success, true);
  assert.ok(data.deletedTaskCount > 0);
  assert.ok(data.deletedUserCount > 0);

  // Store is purged: 0 tasks, exactly 1 user (the root superadmin)
  assert.equal(server.store.tasks.length, 0);
  assert.equal(server.store.users.length, 1);
  assert.equal(server.store.users[0].email, SUPERADMIN_EMAIL);
}));

test('non-admin callers cannot grant or forge privileged flags, designations, or target admins', async () => withServer(async server => {
  for (const payload of [
    { name: 'Esc1', email: 'esc1@example.invalid', role: 'content', isBusinessLead: true },
    { name: 'Esc2', email: 'esc2@example.invalid', role: 'content', isClusterLead: true },
  ]) {
    assert.equal((await server.request('/users', 'cd', 'POST', payload)).status, 403);
  }
  const strippedRes = await server.request('/users', 'cd', 'POST', {
    name: 'Esc3',
    email: 'esc3@example.invalid',
    role: 'content',
    designation: 'Business Lead',
  });
  assert.equal(strippedRes.status, 201);
  const strippedUser = await strippedRes.json();
  assert.equal(strippedUser.designation, undefined);
  assert.equal(strippedUser.isBusinessLead, undefined);

  assert.equal((await server.request('/users/alice', 'alice', 'PUT', { designation: 'Business Lead' })).status, 403);
  assert.equal((await server.request('/users/alice', 'cd', 'PUT', { designation: 'Business Lead' })).status, 403);
  assert.equal((await server.request('/users/alice', 'cd', 'PUT', { isBusinessLead: true })).status, 403);
  assert.equal((await server.request('/users/root', 'cd', 'PUT', { name: 'Hijack' })).status, 403);
}));

test('assigneeIds bypass and non-pipeline Accounts task creation are blocked', async () => withServer(async server => {
  server.store.users.push({
    id: 'acct',
    name: 'Acct Mgr',
    email: 'acct@zensciences.com',
    role: 'account_manager',
    isAccountManager: true,
    avatarColor: 'from-slate-500 to-slate-600',
    createdAt: '2026-10-01T00:00:00.000Z',
  });
  assert.equal(
    (await server.request('/tasks', 'alice', 'POST', { userId: 'alice', assigneeIds: ['bob'], title: 'Bypass', status: 'todo' })).status,
    403
  );
  assert.equal(
    (await server.request('/tasks/reorder', 'alice', 'POST', { updates: [{ id: 'a', assigneeIds: ['bob'] }] })).status,
    403
  );
  assert.equal(
    (await server.request('/tasks', 'acct', 'POST', { title: 'Active Non-Pipeline', team: 'content', status: 'todo' })).status,
    403
  );
  assert.equal(
    (await server.request('/tasks', 'acct', 'POST', { title: 'Valid Pipeline', team: 'content', status: 'pipeline' })).status,
    201
  );
}));

test('clickup route IDs, endpoint URLs, PAT isolation, and webhook lookup enforce security bounds', async () => withServer(async server => {
  server.store.users.find((u: any) => u.id === 'root').clickupApiKey = 'pk_root_only_token';
  server.store.users.push({
    id: 'acct',
    name: 'Acct Mgr',
    email: 'acct@zensciences.com',
    role: 'account_manager',
    isAccountManager: true,
    avatarColor: 'from-slate-500 to-slate-600',
    createdAt: '2026-10-01T00:00:00.000Z',
  });

  assert.equal((await server.request('/clickup/folders-and-lists?spaceId=..%2Fother', 'root', 'GET')).status, 400);
  assert.equal((await server.request('/clickup/custom-fields?listId=bad!id', 'root', 'GET')).status, 400);
  assert.equal((await server.request('/clickup/webhook/bad!id', 'root', 'DELETE')).status, 400);

  assert.equal((await server.request('/clickup/spaces', 'alice', 'POST', { teamId: '123', name: 'Blocked' })).status, 403);
  assert.equal((await server.request('/clickup/lists', 'alice', 'POST', { spaceId: '123', name: 'Blocked' })).status, 403);
  // Accounts user without own PAT cannot borrow admin/other PATs
  assert.equal((await server.request('/clickup/spaces', 'acct', 'POST', { teamId: '123', name: 'No PAT' })).status, 400);

  assert.equal(
    (await server.request('/clickup/webhook/register', 'root', 'POST', { teamId: '123', endpoint: 'http://evil.example.com/hook' })).status,
    400
  );

  const rawBody = JSON.stringify({ event: 'taskStatusUpdated', webhook_id: 'wh-test-1', task_id: 'cu_missing' });
  const sig = crypto.createHmac('sha256', server.webhookSecret).update(rawBody).digest('hex');
  assert.equal(
    (await server.request('/clickup/webhook', '', 'POST', rawBody, { 'x-signature': sig })).status,
    200
  );
}));

test('clickup webhook time sync prevents double-counting and status endpoints report honest state', async () => withServer(async server => {
  const postedUrls: string[] = [];
  server.setClickupTransport(async (url, init) => {
    if (init?.method === 'POST' && (url.includes('/time_entries') || url.includes('/time'))) {
      postedUrls.push(url);
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: 'cu_time_1', status: { status: 'to do' }, description: '' }),
      text: async () => '',
    };
  });

  const taskA = server.store.tasks.find((t: any) => t.id === 'a');
  taskA.clickupTaskId = 'cu_time_1';
  server.store.users.find((u: any) => u.id === 'alice').clickupApiKey = 'pk_alice_token';

  // Inbound webhook records 2 hours tracked in ClickUp
  await server.clickup.processWebhookEvent({
    taskId: 'cu_time_1',
    eventType: 'taskTimeTrackedUpdated',
    historyItems: [{ field: 'time_spent', after: 7200000 }],
    rawBody: {},
  });
  assert.equal(taskA.inProgressDurationMs, 7200000);
  assert.equal(taskA.lastSyncedClickupTimeMs, 7200000);

  // Subsequent ZenFlow edit must NOT re-post those 2 hours back to ClickUp
  const putRes = await server.request('/tasks/a', 'alice', 'PUT', { title: 'Renamed Task A' });
  assert.equal(putRes.status, 200);
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(postedUrls.length, 0);

  // Webhook status includes listening: true, and disconnected Firestore reports mode: 'local'
  const whStatus = await (await server.request('/clickup/webhook/status', 'root')).json();
  assert.equal(whStatus.listening, true);
  const fsStatus = await (await server.request('/firestore/status', 'root')).json();
  assert.equal(fsStatus.connected, false);
  assert.equal(fsStatus.mode, 'local');
}));

test('remap-tasks preserves co-assignees on shared tasks and Firestore write failure returns 503 with rollback', async () => withServer(async server => {
  // Share task 'a' between alice and bob
  const taskA = server.store.tasks.find((t: any) => t.id === 'a');
  taskA.assigneeIds = ['alice', 'bob'];
  taskA.userId = 'alice';

  const remapRes = await server.request('/users/remap-tasks', 'root', 'POST', {
    fromUserId: 'alice',
    toUserId: 'cd',
  });
  assert.equal(remapRes.status, 200);
  assert.deepEqual(taskA.assigneeIds, ['cd', 'bob']);
  assert.equal(taskA.userId, 'cd');

  // Simulate cloud persistence write failure -> 503 + in-memory state preserved
  const origSaveTask = server.repo.saveTask;
  (server.repo as any).saveTask = async () => {
    throw new Error('Simulated Firestore outage');
  };
  try {
    const failedPut = await server.request('/tasks/a', 'root', 'PUT', { title: 'Should Not Persist' });
    assert.equal(failedPut.status, 503);
    assert.equal(server.store.tasks.find((t: any) => t.id === 'a').title, 'Task a');
  } finally {
    (server.repo as any).saveTask = origSaveTask;
  }
}));

test('unsafe javascript URLs in contentDocLink are rejected on update and reorder', async () => withServer(async server => {
  assert.equal((await server.request('/tasks/a', 'alice', 'PUT', { contentDocLink: 'javascript:alert(1)' })).status, 400);
  assert.equal(
    (await server.request('/tasks/reorder', 'alice', 'POST', { updates: [{ id: 'a', contentDocLink: 'javascript:alert(1)' }] })).status,
    400
  );
}));

test('security headers and at-rest secret encryption behave as configured', async () => withServer(async server => {
  const healthRes = await server.request('/health', '');
  assert.equal(healthRes.headers.get('x-powered-by'), null);
  const csp = healthRes.headers.get('content-security-policy') || '';
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'self'/);

  const prevKey = process.env.ZENFLOW_SECRETS_KEY;
  process.env.ZENFLOW_SECRETS_KEY = 'unit-test-master-secret-key';
  try {
    const encrypted = encryptSecret('pk_12345_test_pat');
    assert.ok(encrypted?.startsWith('enc:v1:'));
    assert.notEqual(encrypted, 'pk_12345_test_pat');
    assert.equal(decryptSecret(encrypted), 'pk_12345_test_pat');
  } finally {
    if (prevKey === undefined) delete process.env.ZENFLOW_SECRETS_KEY;
    else process.env.ZENFLOW_SECRETS_KEY = prevKey;
  }
}));

test('superadmin can exchange sessions, verify email, and access API without prior registration (default and env override)', async () => {
  await withServer(async server => {
    // Simulate a store where superadmin was not pre-registered
    server.store.users = server.store.users.filter((u: any) => u.email.toLowerCase() !== SUPERADMIN_EMAIL.toLowerCase());
    assert.equal(server.store.users.some((u: any) => u.email.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase()), false);

    const sessionRes = await server.request('/auth/session', 'kiran', 'POST', undefined, { 'x-zenflow-request': '1' });
    assert.equal(sessionRes.status, 200);
    const sessionBody = await sessionRes.json();
    assert.equal(sessionBody.user.email.toLowerCase(), SUPERADMIN_EMAIL.toLowerCase());
    assert.equal(sessionBody.user.isAdministrator, true);

    // Direct API access also succeeds if superadmin is absent from store.users
    server.store.users = server.store.users.filter((u: any) => u.email.toLowerCase() !== SUPERADMIN_EMAIL.toLowerCase());
    const stateRes = await server.request('/state', 'kiran', 'GET');
    assert.equal(stateRes.status, 200);

    server.store.users = server.store.users.filter((u: any) => u.email.toLowerCase() !== SUPERADMIN_EMAIL.toLowerCase());
    const verifyRes = await server.request('/auth/verify-email', 'kiran', 'POST', { email: SUPERADMIN_EMAIL });
    assert.equal(verifyRes.status, 200);
    const verifyBody = await verifyRes.json();
    assert.equal(verifyBody.user.email.toLowerCase(), SUPERADMIN_EMAIL.toLowerCase());
  });

  // Environment variable override works dynamically without prior user entry
  const prevEnv = process.env.ZENFLOW_SUPERADMIN_EMAIL;
  process.env.ZENFLOW_SUPERADMIN_EMAIL = 'Custom.Super@Zensciences.com';
  try {
    assert.equal(getSuperadminEmail(), 'custom.super@zensciences.com');
    const store = { users: [] as any[], tasks: [] as any[] };
    const middleware = createApiSecurity({
      getStore: () => store,
      verify: async () => ({
        email: 'custom.super@zensciences.com',
        email_verified: true,
        exp: Math.floor(Date.now() / 1000) + 3600,
        firebase: { sign_in_provider: 'google.com' },
      }),
    });
    let status = 200;
    let nextCalled = false;
    const req: any = {
      path: '/state',
      method: 'GET',
      headers: {},
      query: {},
      get: (h: string) => (h.toLowerCase() === 'authorization' ? 'Bearer ok' : undefined),
    };
    const res: any = {
      locals: {},
      setHeader: () => res,
      json: () => res,
      status: (code: number) => {
        status = code;
        return { json: () => res };
      },
    };
    await middleware(req, res, () => {
      nextCalled = true;
    });
    assert.equal(status, 200);
    assert.equal(nextCalled, true);
    assert.equal(res.locals.caller.email, 'custom.super@zensciences.com');
    assert.equal(store.users.length, 1);
  } finally {
    if (prevEnv === undefined) delete process.env.ZENFLOW_SUPERADMIN_EMAIL;
    else process.env.ZENFLOW_SUPERADMIN_EMAIL = prevEnv;
  }
});

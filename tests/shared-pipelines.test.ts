import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fixtureServer } from './fixtures';
import {
  getUserDailyAssignedHours,
  isUserUtilized,
  calculateTeamUtilization,
} from '../src/utils/workload';
import { Task, User } from '../src/types';

async function withServer(run: (server: Awaited<ReturnType<typeof fixtureServer>>) => Promise<void>) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'zenflow-shared-pipeline-'));
  const server = await fixtureServer(directory);
  // Add accounts manager and another CD to store
  server.store.users.push(
    { id: 'acct', name: 'Account Exec', email: 'acct@example.invalid', role: 'account_manager', isAccountManager: true, clickupApiKey: 'pk_test_acct' },
    { id: 'cd2', name: 'Director 2', email: 'director2@example.invalid', role: 'content', isCreativeDirector: true },
    { id: 'charlie', name: 'Charlie', email: 'charlie@example.invalid', role: 'content', creativeDirectorId: 'cd2' }
  );
  try { await run(server); } finally { await server.close(); await fs.rm(directory, { recursive: true, force: true }); }
}

test('role-based task creation: Accounts and special roles can create tasks; regular users cannot create pipeline tasks', async () => withServer(async server => {
  // Alice is regular content specialist (no special role, not accounts) -> DENIED
  const resAlice = await server.request('/tasks', 'alice', 'POST', {
    title: 'Alice Unauthorized Pipeline Task',
    status: 'pipeline',
    team: 'content',
  });
  assert.equal(resAlice.status, 403);

  // Bob is regular design member -> DENIED
  const resBob = await server.request('/tasks', 'bob', 'POST', {
    title: 'Bob Unauthorized Pipeline Task',
    status: 'pipeline',
    team: 'design',
  });
  assert.equal(resBob.status, 403);

  // Account Manager creates pipeline task -> SUCCEEDS (201)
  const resAcct = await server.request('/tasks', 'acct', 'POST', {
    title: 'Q4 Blog Post for Client X',
    status: 'pipeline',
    team: 'content',
    client: 'Client X',
    project: 'Q4 Content Push',
    priority: 'high',
    disciplineMetadata: {
      contentType: 'Blog Post',
      contentSpecifications: '1200 words, SEO optimized',
      sourceContentReferences: ['https://docs.google.com/document/d/source-1'],
    },
  });
  assert.equal(resAcct.status, 201);
  const taskAcct = await resAcct.json();
  assert.equal(taskAcct.title, 'Q4 Blog Post for Client X');
  assert.equal(taskAcct.status, 'pipeline');
  assert.equal(taskAcct.team, 'content');
  assert.equal(taskAcct.userId, undefined); // Initially Unassigned!
  assert.equal(taskAcct.priority, 'high');
  assert.equal(taskAcct.disciplineMetadata.contentSpecifications, '1200 words, SEO optimized');
  assert.deepEqual(taskAcct.disciplineMetadata.sourceContentReferences, ['https://docs.google.com/document/d/source-1']);

  // Creative Director creates design pipeline task -> SUCCEEDS (201)
  const resCD = await server.request('/tasks', 'cd', 'POST', {
    title: 'Brand Design Concept',
    status: 'pipeline',
    team: 'design',
    disciplineMetadata: {
      assetType: 'Key Visual',
      designSpecifications: '1080x1080 Figma export',
      brandAssetsReferences: ['https://figma.com/file/brand-assets'],
    },
  });
  assert.equal(resCD.status, 201);
  const taskCD = await resCD.json();
  assert.equal(taskCD.team, 'design');
  assert.equal(taskCD.userId, undefined); // Unassigned
  assert.equal(taskCD.disciplineMetadata.designSpecifications, '1080x1080 Figma export');
  assert.deepEqual(taskCD.disciplineMetadata.brandAssetsReferences, ['https://figma.com/file/brand-assets']);
}));

test('Creative Directors can assign pipeline tasks to matching-discipline users across all teams', async () => withServer(async server => {
  // 1. Account manager creates unassigned Content pipeline task
  const createRes = await server.request('/tasks', 'acct', 'POST', {
    title: 'Global Rebrand Whitepaper',
    status: 'pipeline',
    team: 'content',
  });
  assert.equal(createRes.status, 201);
  const created = await createRes.json();
  assert.equal(created.userId, undefined);

  // 2. CD 1 assigns task to Charlie (who belongs to CD 2's team!)
  // Cross-team assignment for matching discipline succeeds!
  const assignRes = await server.request(`/tasks/${created.id}`, 'cd', 'PUT', {
    userId: 'charlie',
    cognitiveLoad: 'high',
    estimatedHours: 12.5,
  });
  assert.equal(assignRes.status, 200);
  const updated = await assignRes.json();
  assert.equal(updated.userId, 'charlie');
  assert.equal(updated.cognitiveLoad, 'high');
  assert.equal(updated.estimatedHours, 12.5);

  // CD can update estimates later
  const updateRes = await server.request(`/tasks/${created.id}`, 'cd', 'PUT', {
    cognitiveLoad: 'medium',
    estimatedHours: 8,
  });
  assert.equal(updateRes.status, 200);
  const updated2 = await updateRes.json();
  assert.equal(updated2.cognitiveLoad, 'medium');
  assert.equal(updated2.estimatedHours, 8);
}));

test('Prevent assignments to users belonging to a different discipline', async () => withServer(async server => {
  // Create a Content pipeline task
  const createRes = await server.request('/tasks', 'acct', 'POST', {
    title: 'Content Task',
    status: 'pipeline',
    team: 'content',
  });
  assert.equal(createRes.status, 201);
  const created = await createRes.json();

  // Try to assign Content task to Bob (who is 'design') -> Must return 400
  const assignBob = await server.request(`/tasks/${created.id}`, 'cd', 'PUT', {
    userId: 'bob',
  });
  assert.equal(assignBob.status, 400);

  // Task remains unassigned
  const inStore = server.store.tasks.find((t: any) => t.id === created.id);
  assert.equal(inStore.userId, undefined);
}));

test('pipeline-bundle creates linked Content & Design subtasks under a ClickUp parent task and handles Content -> Sent link propagation', async () => withServer(async server => {
  server.store.users.find(user => user.id === 'alice').clickupApiKey = 'pk_fixture_alice';
  server.store.users.find(user => user.id === 'cd').clickupApiKey = 'pk_fixture_cd';

  const clickupCalls: Array<{ url: string; method: string; body: any }> = [];
  let createdClickupIdx = 100;

  server.setClickupTransport(async (url: string, init?: any) => {
    const method = init?.method || 'GET';
    const body = init?.body ? JSON.parse(init.body) : null;
    clickupCalls.push({ url: String(url), method, body });
    if (method === 'POST' && String(url).includes('/task') && !String(url).includes('/comment')) {
      createdClickupIdx++;
      return new Response(
        JSON.stringify({ id: `cu-${createdClickupIdx}`, url: `https://app.clickup.com/t/cu-${createdClickupIdx}` }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (method === 'GET' && String(url).includes('/api/v2/task/')) {
      return new Response(JSON.stringify({ description: 'Existing spec' }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });

  try {
    // 1. Account manager creates Content + Design bundle
    const bundleRes = await server.request('/tasks/pipeline-bundle', 'acct', 'POST', {
      title: 'Q4 Campaign Launch',
      description: 'Full launch pack',
      client: 'Acme',
      project: 'Launch',
      priority: 'high',
      disciplines: ['content', 'design'],
      clickupSpaceId: 'sp-1',
      clickupSpaceName: 'Acme',
      clickupListId: 'list-1',
      clickupListName: 'Launch',
      disciplineSpecs: {
        content: {
          contentType: 'Blog Post',
          contentSpecifications: '1200 words, narrative angle',
          sourceContentReferences: ['https://docs.google.com/document/d/src'],
        },
        design: {
          assetType: 'Hero Banner',
          designSpecifications: '1920x1080 PNG + Figma',
          brandAssetsReferences: ['https://figma.com/file/assets'],
        },
      },
    });
    assert.equal(bundleRes.status, 201);
    const bundle = await bundleRes.json();
    assert.equal(bundle.tasks.length, 2);
    assert.equal(bundle.clickupParentTaskId, 'cu-101');

    const contentSubtask = bundle.tasks.find((t: any) => t.team === 'content');
    const designSubtask = bundle.tasks.find((t: any) => t.team === 'design');
    assert.ok(contentSubtask && designSubtask);
    assert.equal(contentSubtask.parentTaskId, designSubtask.parentTaskId);
    assert.equal(contentSubtask.clickupParentTaskId, 'cu-101');
    assert.equal(designSubtask.clickupParentTaskId, 'cu-101');
    assert.equal(contentSubtask.status, 'pipeline');
    assert.equal(designSubtask.status, 'pipeline');

    // Assign content subtask with startDate + estimate
    const assignRes = await server.request(`/tasks/${contentSubtask.id}`, 'cd', 'PUT', {
      userId: 'alice',
      status: 'in_progress',
      dueDate: '2026-12-01',
      startDate: '2026-11-25',
      estimatedHours: 6,
      cognitiveLoad: 'high',
    });
    assert.equal(assignRes.status, 200);

    // Sending Content task to 'done' without contentDocLink must fail with 400
    const badDoneRes = await server.request(`/tasks/${contentSubtask.id}`, 'alice', 'PUT', {
      status: 'done',
    });
    assert.equal(badDoneRes.status, 400);

    // Sending Content task to 'done' with valid URL saves link and propagates to sibling Design task
    const docUrl = 'https://docs.google.com/document/d/abc123';
    const goodDoneRes = await server.request(`/tasks/${contentSubtask.id}`, 'alice', 'PUT', {
      status: 'done',
      contentDocLink: docUrl,
    });
    assert.equal(goodDoneRes.status, 200);
    const updatedContent = await goodDoneRes.json();
    assert.equal(updatedContent.contentDocLink, docUrl);

    const siblingDesign = server.store.tasks.find((t: any) => t.id === designSubtask.id);
    assert.equal(siblingDesign.contentDocLink, docUrl);

    // Verify ClickUp received comment + description sync
    await server.repo.runMutation(() => {});
    assert.ok(clickupCalls.some(c => c.url.includes(`/task/${contentSubtask.clickupTaskId}/comment`)));
    assert.ok(clickupCalls.some(c => c.url.includes(`/task/${designSubtask.clickupTaskId}/comment`)));

    // Duplicate (share) Design subtask across two assignees -> 1 backend task, 2 assignees, partial removal works
    const assignDesignRes = await server.request(`/tasks/${designSubtask.id}`, 'root', 'PUT', {
      userId: 'bob',
      assigneeIds: ['bob'],
      status: 'todo',
      dueDate: '2026-12-02',
      estimatedHours: 8,
    });
    assert.equal(assignDesignRes.status, 200);
    server.store.users.push({ id: 'bob2', name: 'Bob 2', email: 'bob2@example.invalid', role: 'design' });
    const shareRes = await server.request(`/tasks/${designSubtask.id}`, 'root', 'PUT', {
      assigneeIds: ['bob', 'bob2'],
    });
    assert.equal(shareRes.status, 200);
    const sharedTask = await shareRes.json();
    assert.deepEqual(Array.from(sharedTask.assigneeIds), ['bob', 'bob2']);

    // Removing bob only removes bob from assigneeIds while keeping task for bob2
    const partialDelete = await server.request(`/tasks/${designSubtask.id}?removeAssigneeId=bob`, 'bob', 'DELETE');
    assert.equal(partialDelete.status, 200);
    const afterPartial = server.store.tasks.find((t: any) => t.id === designSubtask.id);
    assert.ok(afterPartial);
    assert.deepEqual(Array.from(afterPartial.assigneeIds), ['bob2']);
    assert.equal(afterPartial.userId, 'bob2');
  } finally {
    server.setClickupTransport(undefined);
  }
}));

test('migrateLegacyRoles clears video/ui_ux/research roles from users and deletes legacy role tasks', async () => withServer(async server => {
  server.store.users.push(
    { id: 'v1', name: 'Old Video', email: 'v@example.invalid', role: 'video' } as any,
    { id: 'u1', name: 'Old UX', email: 'ux@example.invalid', role: 'ui_ux' } as any,
    { id: 'r1', name: 'Old Research', email: 'r@example.invalid', role: 'research' } as any
  );
  server.store.tasks.push(
    { ...fixtureTaskSafe('legacy-v', 'v1'), team: 'video' },
    { ...fixtureTaskSafe('legacy-u', 'alice'), team: 'ui_ux' },
    { ...fixtureTaskSafe('legacy-r', 'r1') }
  );

  const migration = server.migrateLegacyRoles();
  assert.equal(migration.changed, true);
  assert.equal(migration.removedTaskIds.length, 3);
  assert.equal(server.store.users.find((u: any) => u.id === 'v1').role, undefined);
  assert.equal(server.store.users.find((u: any) => u.id === 'u1').role, undefined);
  assert.equal(server.store.users.find((u: any) => u.id === 'r1').role, undefined);
  assert.equal(server.store.tasks.find((t: any) => t.id === 'legacy-v'), undefined);
  assert.equal(server.store.tasks.find((t: any) => t.id === 'legacy-u'), undefined);
  assert.equal(server.store.tasks.find((t: any) => t.id === 'legacy-r'), undefined);
}));

function fixtureTaskSafe(id: string, userId: string) {
  return {
    id,
    userId,
    title: id,
    status: 'todo',
    cognitiveLoad: 'medium',
    order: 0,
    createdAt: '2026-10-20T00:00:00Z',
    updatedAt: '2026-10-20T00:00:00Z',
    inProgressDurationMs: 0,
    activityLog: [],
  };
}

test('Assigned pipeline tasks accurately reflect in individual workload and utilization metrics', () => {
  const alice: User = { id: 'alice', name: 'Alice', email: 'alice@example.invalid', role: 'content', createdAt: '2026-10-01' };

  // Task 1: Assigned to Alice in pipeline with 8 estimated hours over 2 working days (4h/day)
  const today = new Date().toISOString().slice(0, 10);
  const assignedPipelineTask: Task = {
    id: 't-pipe',
    userId: 'alice',
    team: 'content',
    title: 'Assigned Pipeline Copy',
    status: 'pipeline',
    cognitiveLoad: 'high',
    order: 0,
    estimatedHours: 8,
    createdAt: new Date().toISOString(),
    dueDate: today,
    updatedAt: new Date().toISOString(),
  };

  const tasks = [assignedPipelineTask];

  // Alice daily assigned hours includes her assigned pipeline task (8h over 1 day = 8h/day)
  const dailyHours = getUserDailyAssignedHours(alice, tasks);
  assert.equal(dailyHours, 8);

  // Alice is considered utilized (> 3h/day)
  assert.equal(isUserUtilized(alice, tasks), true);

  // Team utilization reflects Alice as utilized
  const teamUtil = calculateTeamUtilization([alice], tasks);
  assert.equal(teamUtil.utilizationPercent, 100);
  assert.equal(teamUtil.utilizedCount, 1);
});

test('Existing tasks without team field migrate cleanly on server startup', async () => withServer(async server => {
  // Push legacy task without team
  const legacyTask: any = {
    id: 'legacy-1',
    userId: 'bob', // Bob is 'design'
    title: 'Old Design Task',
    status: 'pipeline',
    cognitiveLoad: 'medium',
    order: 0,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  };
  server.store.tasks.push(legacyTask);

  // GET /state returns tasks with migrated team
  const res = await server.request('/tasks', 'cd');
  assert.equal(res.status, 200);
  const allTasks = await res.json();
  const found = allTasks.find((t: any) => t.id === 'legacy-1');
  assert.ok(found);
  assert.equal(found.title, 'Old Design Task');
}));

test('ParentTask collection, sibling Brief/BrandGuidelines sync, conflict-safe ClickUp sync, URL validation, and orphan cleanup', async () => withServer(async server => {
  server.store.users.find(user => user.id === 'alice').clickupApiKey = 'pk_fixture_alice';
  server.store.users.find(user => user.id === 'cd').clickupApiKey = 'pk_fixture_cd';

  const clickupState = new Map<string, { description: string }>();
  const clickupCalls: Array<{ url: string; method: string; body: any }> = [];
  let seq = 200;

  const baseTransport = async (url: string, init?: any) => {
    const u = String(url);
    const method = init?.method || 'GET';
    const body = init?.body ? JSON.parse(init.body) : null;
    clickupCalls.push({ url: u, method, body });

    if (method === 'POST' && u.includes('/list/') && u.endsWith('/task')) {
      seq++;
      const id = `cu-${seq}`;
      clickupState.set(id, { description: body?.description || '' });
      return new Response(JSON.stringify({ id, url: `https://app.clickup.com/t/${id}`, description: body?.description || '' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const taskMatch = u.match(/\/api\/v2\/task\/([^/?]+)$/);
    if (taskMatch) {
      const cuId = taskMatch[1];
      const current = clickupState.get(cuId) || { description: '' };
      if (method === 'GET') {
        return new Response(JSON.stringify({ id: cuId, description: current.description, time_spent: 0, assignees: [] }), { status: 200 });
      }
      if (method === 'PUT') {
        if (typeof body?.description === 'string') {
          current.description = body.description;
          clickupState.set(cuId, current);
        }
        return new Response(JSON.stringify({ id: cuId, description: current.description }), { status: 200 });
      }
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  server.setClickupTransport(baseTransport);

  try {
    // 1. Invalid URLs must be rejected with 400
    const badBrandRes = await server.request('/tasks/pipeline-bundle', 'acct', 'POST', {
      title: 'Bad URL Test',
      brandGuidelines: 'ftp://invalid.example.com',
      disciplines: ['content'],
    });
    assert.equal(badBrandRes.status, 400);

    const badRefRes = await server.request('/tasks/pipeline-bundle', 'acct', 'POST', {
      title: 'Bad Ref Test',
      disciplines: ['design'],
      disciplineSpecs: { design: { brandAssetsReferences: ['not-a-url'] } },
    });
    assert.equal(badRefRes.status, 400);

    // 2. Create Content + Design bundle with Brief + Brand Guidelines
    const bundleRes = await server.request('/tasks/pipeline-bundle', 'acct', 'POST', {
      title: 'Q1 Brand Campaign',
      description: 'Long campaign brief across both teams.',
      brandGuidelines: 'https://brand.example.com/guidelines',
      disciplines: ['content', 'design'],
      clickupSpaceId: 'sp-1',
      clickupListId: 'list-1',
      disciplineSpecs: {
        content: {
          contentType: 'Whitepaper',
          contentSpecifications: '2000 words executive tone',
          sourceContentReferences: ['https://docs.example.com/a', 'https://docs.example.com/b'],
        },
        design: {
          assetType: 'Presentation Deck',
          designSpecifications: '16:9 dark theme slides',
          brandAssetsReferences: ['https://figma.com/file/xyz'],
        },
      },
    });
    assert.equal(bundleRes.status, 201);
    const bundle = await bundleRes.json();
    assert.equal(server.store.parentTasks.length, 1);
    const parentRecord = server.store.parentTasks[0];
    assert.equal(parentRecord.id, bundle.parentTaskId);
    assert.equal(parentRecord.brief, 'Long campaign brief across both teams.');
    assert.equal(parentRecord.brandGuidelines, 'https://brand.example.com/guidelines');
    assert.ok(parentRecord.lastSyncedClickupDescHash);

    const contentSub = bundle.tasks.find((t: any) => t.team === 'content');
    const designSub = bundle.tasks.find((t: any) => t.team === 'design');
    assert.equal(contentSub.description, 'Long campaign brief across both teams.');
    assert.equal(designSub.brandGuidelines, 'https://brand.example.com/guidelines');

    // ClickUp parent got clean Brief + Brand Guidelines (no markers); subtasks got only their specs
    const cuParentDesc = clickupState.get(bundle.clickupParentTaskId)?.description || '';
    assert.ok(cuParentDesc.includes('Long campaign brief across both teams.'));
    assert.ok(cuParentDesc.includes('https://brand.example.com/guidelines'));
    assert.equal(cuParentDesc.includes('[ZenFlow]'), false);

    const cuContentDesc = clickupState.get(contentSub.clickupTaskId)?.description || '';
    assert.ok(cuContentDesc.includes('2000 words executive tone'));
    assert.ok(cuContentDesc.includes('https://docs.example.com/a'));
    assert.equal(cuContentDesc.includes('Long campaign brief'), false);

    // 3. Status/assignee update must NOT send description to ClickUp
    clickupCalls.length = 0;
    const statusMoveRes = await server.request(`/tasks/${contentSub.id}`, 'cd', 'PUT', {
      userId: 'alice',
      status: 'todo',
      dueDate: '2026-12-10',
    });
    assert.equal(statusMoveRes.status, 200);
    await new Promise(r => setTimeout(r, 30));
    const putWithDescOnStatus = clickupCalls.filter(c => c.method === 'PUT' && c.body && 'description' in c.body);
    assert.equal(putWithDescOnStatus.length, 0);

    // 4. Editing Brief on Content subtask updates ParentTask, propagates to Design sibling, and updates ClickUp parent when unmodified
    const briefEditRes = await server.request(`/tasks/${contentSub.id}`, 'cd', 'PUT', {
      description: 'Updated shared campaign brief v2.',
      brandGuidelines: 'https://brand.example.com/v2',
    });
    assert.equal(briefEditRes.status, 200);
    await new Promise(r => setTimeout(r, 40));

    assert.equal(server.store.parentTasks[0].brief, 'Updated shared campaign brief v2.');
    assert.equal(server.store.parentTasks[0].brandGuidelines, 'https://brand.example.com/v2');
    const updatedDesignSub = server.store.tasks.find((t: any) => t.id === designSub.id);
    assert.equal(updatedDesignSub.description, 'Updated shared campaign brief v2.');
    assert.equal(updatedDesignSub.brandGuidelines, 'https://brand.example.com/v2');
    assert.ok((clickupState.get(bundle.clickupParentTaskId)?.description || '').includes('Updated shared campaign brief v2.'));

    // 5. Conflict guard: if someone manually edits ClickUp parent description, ZenFlow preserves it and posts a comment instead
    clickupState.set(bundle.clickupParentTaskId, { description: 'Manual ClickUp notes written by PM — do not overwrite!' });
    clickupCalls.length = 0;
    const briefConflictRes = await server.request(`/tasks/${contentSub.id}`, 'cd', 'PUT', {
      description: 'Brief v3 from ZenFlow',
    });
    assert.equal(briefConflictRes.status, 200);
    await new Promise(r => setTimeout(r, 40));

    assert.equal(
      clickupState.get(bundle.clickupParentTaskId)?.description,
      'Manual ClickUp notes written by PM — do not overwrite!'
    );
    assert.ok(
      clickupCalls.some(
        c =>
          c.method === 'POST' &&
          c.url.includes(`/task/${bundle.clickupParentTaskId}/comment`) &&
          String(c.body?.comment_text || '').includes('Brief v3 from ZenFlow')
      )
    );

    // 5.5 Clearing description, brandGuidelines, and disciplineMetadata via empty values propagates cleanly
    const clearRes = await server.request(`/tasks/${contentSub.id}`, 'cd', 'PUT', {
      description: '',
      brandGuidelines: '',
      disciplineMetadata: {},
    });
    assert.equal(clearRes.status, 200);
    const clearedContent = await clearRes.json();
    assert.equal(clearedContent.description, undefined);
    assert.equal(clearedContent.brandGuidelines, undefined);
    assert.equal(clearedContent.disciplineMetadata, undefined);
    assert.equal(server.store.parentTasks[0].brief, undefined);
    assert.equal(server.store.parentTasks[0].brandGuidelines, undefined);
    const clearedDesignSub = server.store.tasks.find((t: any) => t.id === designSub.id);
    assert.equal(clearedDesignSub.description, undefined);
    assert.equal(clearedDesignSub.brandGuidelines, undefined);

    // 5.6 Transient ClickUp GET 500 error must NOT overwrite manual ClickUp description
    clickupCalls.length = 0;
    server.setClickupTransport(async (url: string, init?: any) => {
      if (String(url).includes(`/task/${bundle.clickupParentTaskId}`) && (!init?.method || init.method === 'GET')) {
        return new Response('Upstream error', { status: 500 });
      }
      return baseTransport(url, init);
    });
    const transientErrRes = await server.request(`/tasks/${contentSub.id}`, 'cd', 'PUT', {
      description: 'Should not clobber on GET 500',
    });
    assert.equal(transientErrRes.status, 200);
    await new Promise(r => setTimeout(r, 40));
    server.setClickupTransport(baseTransport);
    assert.equal(
      clickupState.get(bundle.clickupParentTaskId)?.description,
      'Manual ClickUp notes written by PM — do not overwrite!'
    );

    // 5.7 Moving Content to Done with contentDocLink + spec change does not duplicate ClickUp description PUTs or conflict comments
    clickupState.set(contentSub.clickupTaskId, { description: 'Manual ClickUp notes on content subtask' });
    clickupCalls.length = 0;
    const doneWithSpecRes = await server.request(`/tasks/${contentSub.id}`, 'alice', 'PUT', {
      status: 'done',
      contentDocLink: 'https://docs.google.com/document/d/final-e2e',
      disciplineMetadata: { contentType: 'Whitepaper', contentSpecifications: 'Updated spec at done' },
    });
    assert.equal(doneWithSpecRes.status, 200);
    await new Promise(r => setTimeout(r, 40));
    const contentSubComments = clickupCalls.filter(
      c => c.method === 'POST' && c.url.includes(`/task/${contentSub.clickupTaskId}/comment`)
    );
    assert.equal(contentSubComments.length, 1);

    // 6. Deleting both subtasks cleans up orphaned ParentTask
    await server.request(`/tasks/${contentSub.id}`, 'root', 'DELETE');
    assert.equal(server.store.parentTasks.length, 1);
    await server.request(`/tasks/${designSub.id}`, 'root', 'DELETE');
    assert.equal(server.store.parentTasks.length, 0);
  } finally {
    server.setClickupTransport(undefined);
  }
}));

test('Delegated subtasks preserve distinct descriptions across hydration and edits', async () => withServer(async server => {
  const dup1 = await server.request('/tasks/a/duplicate', 'alice', 'POST', {
    targetUserId: 'bob',
    title: 'Subtask 1',
    description: 'First custom description',
  });
  assert.equal(dup1.status, 201);
  const sub1 = (await dup1.json()).task;

  const dup2 = await server.request('/tasks/a/duplicate', 'alice', 'POST', {
    targetUserId: 'alice',
    title: 'Subtask 2',
    description: 'Second distinct description',
  });
  assert.equal(dup2.status, 201);
  const sub2 = (await dup2.json()).task;

  // Startup hydration must not treat regular task 'a' as a canonical ParentTask
  server.hydrateSubtasksFromParents();
  assert.equal(server.store.tasks.find((t: any) => t.id === sub1.id).description, 'First custom description');
  assert.equal(server.store.tasks.find((t: any) => t.id === sub2.id).description, 'Second distinct description');

  // Editing sub1 description must not overwrite sub2 description
  const editRes = await server.request(`/tasks/${sub1.id}`, 'bob', 'PUT', {
    description: 'Edited first description',
  });
  assert.equal(editRes.status, 200);
  assert.equal(server.store.tasks.find((t: any) => t.id === sub2.id).description, 'Second distinct description');
}));

test('Non-destructive legacy task migration folds old metadata & attachments idempotently', async () => withServer(async server => {
  server.store.tasks.push(
    {
      ...fixtureTaskSafe('legacy-content', 'alice'),
      team: 'content',
      parentTaskId: 'parent-legacy-1',
      parentTaskTitle: 'Legacy Parent',
      isSubtask: true,
      description: 'Shared legacy brief',
      attachments: ['https://drive.google.com/file/1'],
      disciplineMetadata: {
        contentType: 'Case Study',
        deliverable: 'Google Doc Draft',
        wordCount: 1500,
        brief: 'https://docs.google.com/document/d/outline',
        relevantRequirements: 'Include customer quote',
      },
    } as any,
    {
      ...fixtureTaskSafe('legacy-design', 'bob'),
      team: 'design',
      parentTaskId: 'parent-legacy-1',
      parentTaskTitle: 'Legacy Parent',
      isSubtask: true,
      description: 'Shared legacy brief',
      attachments: ['https://figma.com/file/legacy-kit'],
      disciplineMetadata: {
        assetType: 'Infographic',
        dimensions: '1080x1920',
        format: 'Figma',
        quantity: 3,
        designSpecifications: 'Use dark palette',
      },
    } as any
  );

  const firstRun = server.hydrateSubtasksFromParents();
  assert.equal(firstRun, true);

  const contentTask = server.store.tasks.find((t: any) => t.id === 'legacy-content');
  assert.equal(contentTask.disciplineMetadata.contentType, 'Case Study');
  assert.ok(contentTask.disciplineMetadata.contentSpecifications.includes('Deliverable Format: Google Doc Draft'));
  assert.ok(contentTask.disciplineMetadata.contentSpecifications.includes('Word Count Target: 1500'));
  assert.ok(contentTask.disciplineMetadata.contentSpecifications.includes('Include customer quote'));
  assert.deepEqual(Array.from(contentTask.disciplineMetadata.sourceContentReferences), [
    'https://docs.google.com/document/d/outline',
    'https://drive.google.com/file/1',
  ]);
  assert.equal(contentTask.attachments, undefined);

  const designTask = server.store.tasks.find((t: any) => t.id === 'legacy-design');
  assert.equal(designTask.disciplineMetadata.assetType, 'Infographic');
  assert.ok(designTask.disciplineMetadata.designSpecifications.includes('Use dark palette'));
  assert.ok(designTask.disciplineMetadata.designSpecifications.includes('Dimensions: 1080x1920'));
  assert.ok(designTask.disciplineMetadata.designSpecifications.includes('Deliverable Format: Figma'));
  assert.ok(designTask.disciplineMetadata.designSpecifications.includes('Quantity: 3'));
  assert.deepEqual(Array.from(designTask.disciplineMetadata.brandAssetsReferences), ['https://figma.com/file/legacy-kit']);
  assert.equal(designTask.attachments, undefined);

  // ParentTask backfilled
  const parent = server.store.parentTasks.find((p: any) => p.id === 'parent-legacy-1');
  assert.ok(parent);
  assert.equal(parent.brief, 'Shared legacy brief');

  // Second run is strictly idempotent
  const secondRun = server.hydrateSubtasksFromParents();
  assert.equal(secondRun, false);
}));

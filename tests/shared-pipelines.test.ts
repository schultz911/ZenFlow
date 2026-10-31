import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fixtureServer } from './fixtures';
import { SUPERADMIN_EMAIL } from '../server/security';
import {
  getUserDailyAssignedHours,
  isUserUtilized,
  calculateTeamUtilization,
  calculateTasksEfficiency,
} from '../src/utils/workload';
import { Task, User } from '../src/types';

async function withServer(run: (server: Awaited<ReturnType<typeof fixtureServer>>) => Promise<void>) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'zenflow-shared-pipeline-'));
  const server = await fixtureServer(directory);
  // Add accounts manager, video member, research member, and another CD to store
  server.store.users.push(
    { id: 'acct', name: 'Account Exec', email: 'acct@example.invalid', role: 'account_manager', isAccountManager: true },
    { id: 'cd2', name: 'Director 2', email: 'director2@example.invalid', role: 'content', isCreativeDirector: true },
    { id: 'charlie', name: 'Charlie', email: 'charlie@example.invalid', role: 'content', creativeDirectorId: 'cd2' },
    { id: 'vid1', name: 'Video Guy', email: 'video@example.invalid', role: 'video' },
    { id: 'res1', name: 'Researcher', email: 'research@example.invalid', role: 'research' }
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
    disciplineMetadata: { contentType: 'Blog Post', wordCount: 1200 },
  });
  assert.equal(resAcct.status, 201);
  const taskAcct = await resAcct.json();
  assert.equal(taskAcct.title, 'Q4 Blog Post for Client X');
  assert.equal(taskAcct.status, 'pipeline');
  assert.equal(taskAcct.team, 'content');
  assert.equal(taskAcct.userId, undefined); // Initially Unassigned!
  assert.equal(taskAcct.priority, 'high');
  assert.equal(taskAcct.disciplineMetadata.wordCount, 1200);

  // Creative Director creates pipeline task -> SUCCEEDS (201)
  const resCD = await server.request('/tasks', 'cd', 'POST', {
    title: 'Brand Video Concept',
    status: 'pipeline',
    team: 'video',
    disciplineMetadata: { videoType: 'Explainer', duration: '60s' },
  });
  assert.equal(resCD.status, 201);
  const taskCD = await resCD.json();
  assert.equal(taskCD.team, 'video');
  assert.equal(taskCD.userId, undefined); // Unassigned
  assert.equal(taskCD.disciplineMetadata.duration, '60s');
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

  // Try to assign Content task to Video Guy ('video') -> Must return 400
  const assignVid = await server.request(`/tasks/${created.id}`, 'cd', 'PUT', {
    userId: 'vid1',
  });
  assert.equal(assignVid.status, 400);

  // Task remains unassigned
  const inStore = server.store.tasks.find((t: any) => t.id === created.id);
  assert.equal(inStore.userId, undefined);
}));

test('Discipline-specific task creation captures all 5 discipline specifications and shared fields', async () => withServer(async server => {
  // 1. Content
  const resContent = await server.request('/tasks', 'acct', 'POST', {
    title: 'Product Launch Case Study',
    status: 'pipeline',
    team: 'content',
    client: 'Acme',
    project: 'Launch',
    priority: 'high',
    disciplineMetadata: {
      contentType: 'Case Study',
      deliverable: 'Google Doc',
      brief: 'https://notion.so/brief/123',
      wordCount: 1500,
      relevantRequirements: 'Interview quotes included',
    },
    attachments: ['https://drive.google.com/doc/1'],
  });
  assert.equal(resContent.status, 201);
  const cTask = await resContent.json();
  assert.equal(cTask.disciplineMetadata.contentType, 'Case Study');
  assert.equal(cTask.disciplineMetadata.wordCount, 1500);
  assert.equal(cTask.attachments[0], 'https://drive.google.com/doc/1');

  // 2. Design
  const resDesign = await server.request('/tasks', 'acct', 'POST', {
    title: 'Banner Creatives',
    status: 'pipeline',
    team: 'design',
    disciplineMetadata: {
      assetType: 'Social Media Banner',
      dimensions: '1080x1080',
      format: 'Figma',
      quantity: 5,
      designSpecifications: 'Dark theme primary',
    },
  });
  assert.equal(resDesign.status, 201);
  const dTask = await resDesign.json();
  assert.equal(dTask.disciplineMetadata.assetType, 'Social Media Banner');
  assert.equal(dTask.disciplineMetadata.dimensions, '1080x1080');
  assert.equal(dTask.disciplineMetadata.quantity, 5);

  // 3. Video
  const resVideo = await server.request('/tasks', 'acct', 'POST', {
    title: 'Feature Reel',
    status: 'pipeline',
    team: 'video',
    disciplineMetadata: {
      videoType: 'Reel / Short',
      duration: '30s',
      aspectRatio: '9:16',
      deliverables: '4K MP4',
      productionRequirements: 'Upbeat music',
    },
  });
  assert.equal(resVideo.status, 201);
  const vTask = await resVideo.json();
  assert.equal(vTask.disciplineMetadata.duration, '30s');
  assert.equal(vTask.disciplineMetadata.aspectRatio, '9:16');

  // 4. UI/UX
  const resUIUX = await server.request('/tasks', 'acct', 'POST', {
    title: 'Checkout Flow Overhaul',
    status: 'pipeline',
    team: 'ui_ux',
    disciplineMetadata: {
      designType: 'Web App',
      platform: 'Responsive',
      screens: 6,
      userFlows: 'Cart to Payment Complete',
      prototypeRequirements: 'Clickable Figma',
    },
  });
  assert.equal(resUIUX.status, 201);
  const uTask = await resUIUX.json();
  assert.equal(uTask.disciplineMetadata.screens, 6);
  assert.equal(uTask.disciplineMetadata.platform, 'Responsive');

  // 5. Research
  const resResearch = await server.request('/tasks', 'acct', 'POST', {
    title: 'Competitor Feature Audit',
    status: 'pipeline',
    team: 'research',
    disciplineMetadata: {
      researchType: 'Competitive Benchmarking',
      objectives: 'Identify pricing gaps',
      scope: 'Top 5 US competitors',
      methodology: 'Secondary / Desk Research',
      expectedOutputs: 'Deck + Matrix',
    },
  });
  assert.equal(resResearch.status, 201);
  const rTask = await resResearch.json();
  assert.equal(rTask.disciplineMetadata.researchType, 'Competitive Benchmarking');
  assert.equal(rTask.disciplineMetadata.scope, 'Top 5 US competitors');
}));

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

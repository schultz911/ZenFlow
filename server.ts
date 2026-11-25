import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { createHash } from 'node:crypto';
import compression from 'compression';
import { createApiSecurity, redactPayload, SESSION_COOKIE, sameOriginMutation, validSignature } from './server/security';
import { readAuditTail, writeSse } from './server/resources';
import { WebhookRegistry } from './server/webhooks';
import { initializeApp as initializeAdminApp, getApps as getAdminApps } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';

interface User {
  id: string;
  name: string;
  email: string;
  role?: 'content' | 'design' | 'account_manager' | 'administrator' | 'none';
  avatarColor?: string;
  createdAt: string;
  order?: number;
  isCreativeDirector?: boolean;
  creativeDirectorId?: string;
  isAdministrator?: boolean;
  isBusinessLead?: boolean;
  isClusterLead?: boolean;
  isTeamLead?: boolean;
  isAccountManager?: boolean;
  isContentLead?: boolean;
  isArtDirector?: boolean;
  isContentSpecialist?: boolean;
  isBrandDesigner?: boolean;
  designation?: string;
  clusterLeadId?: string;
  clickupApiKey?: string;
  clickupConnected?: boolean;
  selectedClickupSpaceId?: string;
  selectedClickupSpaceName?: string;
  clickupUserId?: string;
  clickupUsername?: string;
}

type TaskStatus = 'pipeline' | 'retainer' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'archived';

interface TaskActivity {
  id: string;
  timestamp: string;
  action: 'created' | 'status_change' | 'reassigned' | 'rescheduled' | 'updated' | 'billable_adjusted';
  from?: string;
  to?: string;
  actorName?: string;
  details?: string;
}

interface ParentTask {
  id: string;
  title: string;
  brief?: string;
  brandGuidelines?: string;
  client?: string;
  project?: string;
  clickupParentTaskId?: string;
  clickupUrl?: string;
  clickupSpaceId?: string;
  clickupSpaceName?: string;
  clickupFolderId?: string;
  clickupFolderName?: string;
  clickupListId?: string;
  clickupListName?: string;
  lastSyncedClickupDescHash?: string;
  createdAt: string;
  updatedAt: string;
}

interface Task {
  id: string;
  userId?: string;
  assigneeIds?: string[];
  team?: 'content' | 'design' | 'account_manager' | 'administrator' | 'none';
  title: string;
  description?: string;
  brandGuidelines?: string;
  lastSyncedClickupDescHash?: string;
  dueDate?: string;
  startDate?: string;
  cognitiveLoad: 'low' | 'medium' | 'high';
  status: TaskStatus;
  order: number;
  completedAt?: string;
  inProgressStartedAt?: string;
  inProgressDurationMs?: number;
  createdAt: string;
  updatedAt: string;
  activityLog?: TaskActivity[];
  parentTaskId?: string;
  parentTaskTitle?: string;
  isSubtask?: boolean;
  client?: string;
  project?: string;
  estimatedHours?: number;
  priority?: 'low' | 'medium' | 'high';
  attachments?: string[];
  disciplineMetadata?: Record<string, any>;
  contentDocLink?: string;
  clickupTaskId?: string;
  clickupFolderId?: string;
  clickupFolderName?: string;
  clickupListId?: string;
  clickupListName?: string;
  clickupSpaceId?: string;
  clickupSpaceName?: string;
  clickupUrl?: string;
  clickupTaskType?: string;
  clickupTaskTypeId?: string;
  clickupTaskTypeFieldId?: string;
  clickupParentTaskId?: string;
}

interface AppStore {
  users: User[];
  tasks: Task[];
  parentTasks: ParentTask[];
}

const SUPERADMIN_EMAIL = 'kiran.s@zensciences.com';

const ZENFLOW_TO_CLICKUP_STATUS: Record<string, string> = {
  pipeline: 'open',
  retainer: 'in progress',
  todo: 'to do',
  in_progress: 'in progress',
  in_review: 'internal review',
  done: 'client review',
  archived: 'complete',
};

const COGNITIVE_LOAD_ESTIMATES_MS: Record<string, number> = {
  low: 12 * 3600 * 1000,
  medium: 24 * 3600 * 1000,
  high: 36 * 3600 * 1000,
};

const LEGACY_REMOVED_ROLES = new Set(['video', 'ui_ux', 'research']);

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  category: 'task' | 'user' | 'security' | 'webhook' | 'system';
  action: string;
  actor?: {
    id?: string;
    name?: string;
    email?: string;
    ip?: string;
  };
  targetId: string;
  targetType: 'task' | 'user' | 'workspace' | 'webhook';
  details?: string;
  from?: any;
  to?: any;
  metadata?: Record<string, any>;
}

// Support Railway dynamic PORT or default to 3000
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const DATA_DIR = process.env.ZENFLOW_DATA_DIR || path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');
const AUDIT_LOG_FILE = path.join(DATA_DIR, 'compliance-audit.jsonl');
const ANALYTICS_SNAPSHOT_FILE = path.join(DATA_DIR, 'analytics_snapshots.json');
const webhookRegistry = new WebhookRegistry(path.join(DATA_DIR, '.clickup-webhooks.json'));
// Identity trust is deliberately independent of the configurable Firestore credentials.
const identityApp = getAdminApps().find(app => app.name === 'zenflow-identity') ||
  initializeAdminApp({ projectId: 'zen-flow-7173d' }, 'zenflow-identity');
const verifyIdentity = (token: string) => getAdminAuth(identityApp).verifyIdToken(token);

const recentAuditLogs: AuditLogEntry[] = [];
const MAX_RECENT_AUDIT_LOGS = 100;

// ClickUp Real-Time Webhook Listener State
let registeredWebhookId: string | null = null;
let activeWebhookEndpoint: string | null = null;
let webhookEventsCount = 0;
let lastWebhookEventAt: string | null = null;
let lastWebhookAction: string | null = null;


// Auto-detect production mode if running compiled dist artifact or in container environments
let currentFile = '';
try {
  if (typeof __filename !== 'undefined') {
    currentFile = __filename;
  }
} catch {
  // ESM fallback
}
if (!process.env.NODE_ENV && (currentFile.includes('dist') || (!currentFile.endsWith('.ts') && !currentFile.includes('server.ts')))) {
  process.env.NODE_ENV = 'production';
}

// Color palette options for user avatars
const AVATAR_COLORS = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-purple-500 to-violet-600',
  'from-cyan-500 to-blue-600',
];

// O(1) Fast lookup sets for legacy template filters
const DUMMY_USER_IDS = new Set(['user-1', 'user-2', 'user-3', 'user-4']);
const DUMMY_TASK_IDS = new Set([
  'task-101', 'task-102', 'task-103', 'task-104',
  'task-201', 'task-202', 'task-203',
  'task-301', 'task-302', 'task-303', 'task-304',
  'task-401', 'task-402', 'task-403'
]);

// Persistent state manager with non-blocking async queue
let isWriting = false;
let pendingSave: AppStore | null = null;
let saveDebounceTimer: NodeJS.Timeout | null = null;
let stateRevision = Date.now(); // Global revision identifier for ETag HTTP 304 validation

function flushStoreSync() {
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
  }
  if (pendingSave) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(pendingSave, null, 2), 'utf-8');
      console.log('[Server Shutdown] In-flight store data flushed synchronously.');
      pendingSave = null;
    } catch (err) {
      console.error('[Server Shutdown] Failed to flush store synchronously:', err);
    }
  }
}

function getTaskAssigneeIdsServer(task: { userId?: string; assigneeIds?: string[] }): string[] {
  if (Array.isArray(task.assigneeIds) && task.assigneeIds.length > 0) {
    return Array.from(new Set(task.assigneeIds.filter(Boolean)));
  }
  return task.userId ? [task.userId] : [];
}

function migrateLegacyRoles(appStore: AppStore): { removedTaskIds: string[]; changed: boolean } {
  let changed = false;
  const legacyUserIds = new Set<string>();
  for (const u of appStore.users) {
    if (u && u.role && LEGACY_REMOVED_ROLES.has(u.role as string)) {
      legacyUserIds.add(u.id);
      u.role = undefined;
      changed = true;
    }
  }
  const removedTaskIds: string[] = [];
  const keptTasks: Task[] = [];
  for (const t of appStore.tasks) {
    const isLegacyTeam = t.team && LEGACY_REMOVED_ROLES.has(t.team as string);
    const assignees = getTaskAssigneeIdsServer(t);
    const isOrphanLegacyUserTask = !t.team && assignees.length > 0 && assignees.every(id => legacyUserIds.has(id));
    if (isLegacyTeam || isOrphanLegacyUserTask) {
      removedTaskIds.push(t.id);
      changed = true;
      continue;
    }
    if (!t.team) {
      const firstOwner = assignees[0] ? appStore.users.find(u => u.id === assignees[0]) : undefined;
      t.team = firstOwner?.role === 'design' ? 'design' : 'content';
      changed = true;
    }
    if (t.userId && (!Array.isArray(t.assigneeIds) || t.assigneeIds.length === 0)) {
      t.assigneeIds = [t.userId];
      changed = true;
    }
    keptTasks.push(t);
  }
  appStore.tasks = keptTasks;
  return { removedTaskIds, changed };
}

function loadStore(): AppStore {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed.users) && Array.isArray(parsed.tasks)) {
        // Filter out initial template dummy placeholders
        const cleanUsers = parsed.users.filter(
          (u: User) => !DUMMY_USER_IDS.has(u.id) && !u.email?.endsWith('@acme.studio')
        );
        const cleanTasks = parsed.tasks.filter(
          (t: Task) => !DUMMY_TASK_IDS.has(t.id) && !(t.userId && DUMMY_USER_IDS.has(t.userId))
        );
        const cleanParents: ParentTask[] = Array.isArray(parsed.parentTasks) ? parsed.parentTasks : [];
        const migrated: AppStore = { users: cleanUsers, tasks: cleanTasks, parentTasks: cleanParents };
        const { changed: rolesChanged } = migrateLegacyRoles(migrated);
        const normChanged = hydrateSubtasksFromParents(migrated);
        if (rolesChanged || normChanged) {
          saveStore(migrated);
        }
        return migrated;
      }
    }
  } catch (err) {
    console.error('Error reading data file, using defaults:', err);
  }

  const initialStore: AppStore = {
    users: [],
    tasks: [],
    parentTasks: [],
  };
  saveStore(initialStore);
  return initialStore;
}

// Non-blocking debounced asynchronous persistence to prevent event loop bottlenecks
function saveStore(storeToSave: AppStore) {
  pendingSave = storeToSave;
  stateRevision = Date.now();

  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
  }

  saveDebounceTimer = setTimeout(async () => {
    if (isWriting || !pendingSave) return;
    isWriting = true;
    const dataToWrite = pendingSave;
    pendingSave = null;

    try {
      await fs.promises.mkdir(DATA_DIR, { recursive: true });
      const tempPath = `${DATA_FILE}.tmp.${Date.now()}`;
      await fs.promises.writeFile(tempPath, JSON.stringify(dataToWrite, null, 2), 'utf-8');
      await fs.promises.rename(tempPath, DATA_FILE);
    } catch (err) {
      console.error('Failed to persist store asynchronously:', err);
    } finally {
      isWriting = false;
      if (pendingSave) {
        saveStore(pendingSave);
      }
    }
  }, 50);
}

function loadAnalyticsSnapshots(): any[] {
  try {
    if (fs.existsSync(ANALYTICS_SNAPSHOT_FILE)) {
      const data = fs.readFileSync(ANALYTICS_SNAPSHOT_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.error('Error loading analytics snapshots:', err);
  }
  return [];
}

async function saveAnalyticsSnapshotLocal(snapshot: any) {
  try {
    const snapshots = loadAnalyticsSnapshots();
    const existingIndex = snapshots.findIndex((s: any) => s.id === snapshot.id);
    if (existingIndex >= 0) {
      snapshots[existingIndex] = snapshot;
    } else {
      snapshots.push(snapshot);
    }
    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    await fs.promises.writeFile(ANALYTICS_SNAPSHOT_FILE, JSON.stringify(snapshots, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving analytics snapshot local:', err);
  }
}

// Input sanitizer to prevent XSS / malicious injection in titles & descriptions
function isCallerAuthorizedForPipeline(caller: any): boolean {
  if (!caller) return false;
  const isSuper = caller.email?.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase();
  return Boolean(
    isSuper ||
    caller.isAdministrator ||
    caller.role === 'administrator' ||
    caller.isBusinessLead ||
    caller.designation === 'business_lead' ||
    caller.designation === 'Business Lead' ||
    caller.isCreativeDirector ||
    caller.designation === 'creative_director' ||
    caller.designation === 'Creative Director' ||
    caller.isClusterLead ||
    caller.designation === 'cluster_lead' ||
    caller.designation === 'Cluster Lead' ||
    caller.isTeamLead ||
    caller.designation === 'team_lead' ||
    caller.designation === 'Team Lead' ||
    caller.isAccountManager ||
    caller.role === 'account_manager' ||
    caller.designation === 'account_manager' ||
    caller.designation === 'Account Manager'
  );
}

function sanitizeString(input: unknown, maxLen = 1000): string {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .replace(/[<>]/g, '') // Strip basic HTML tags
    .slice(0, maxLen); // Enforce max string length boundary
}

function validateHttpUrl(input: unknown): { value?: string; error?: string } {
  if (input === undefined || input === null) return { value: undefined };
  if (typeof input !== 'string') return { error: 'Link must be a valid URL string' };
  const trimmed = input.trim();
  if (!trimmed) return { value: undefined };
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { error: 'URL must start with http:// or https://' };
    }
    return { value: trimmed.slice(0, 1000) };
  } catch {
    return { error: `Invalid URL: ${trimmed}` };
  }
}

function sanitizeUrlList(raw: unknown): { value?: string[]; error?: string } {
  if (!Array.isArray(raw)) return { value: undefined };
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string' || !item.trim()) continue;
    const checked = validateHttpUrl(item);
    if (checked.error) return { error: checked.error };
    if (checked.value && !seen.has(checked.value)) {
      seen.add(checked.value);
      cleaned.push(checked.value);
    }
  }
  return { value: cleaned.length > 0 ? cleaned : undefined };
}

function sanitizeDisciplineMetadata(raw: unknown): { value?: Record<string, any>; error?: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { value: undefined };
  const src = raw as Record<string, unknown>;
  const out: Record<string, any> = {};

  if (typeof src.contentType === 'string' && src.contentType.trim()) {
    out.contentType = sanitizeString(src.contentType, 300);
  }
  if (typeof src.contentSpecifications === 'string' && src.contentSpecifications.trim()) {
    out.contentSpecifications = sanitizeString(src.contentSpecifications, 10000);
  }
  if (src.sourceContentReferences !== undefined) {
    const refs = sanitizeUrlList(src.sourceContentReferences);
    if (refs.error) return { error: `Source Content & References: ${refs.error}` };
    if (refs.value) out.sourceContentReferences = refs.value;
  }

  if (typeof src.assetType === 'string' && src.assetType.trim()) {
    out.assetType = sanitizeString(src.assetType, 300);
  }
  if (typeof src.designSpecifications === 'string' && src.designSpecifications.trim()) {
    out.designSpecifications = sanitizeString(src.designSpecifications, 10000);
  }
  if (src.brandAssetsReferences !== undefined) {
    const refs = sanitizeUrlList(src.brandAssetsReferences);
    if (refs.error) return { error: `Brand Assets & References: ${refs.error}` };
    if (refs.value) out.brandAssetsReferences = refs.value;
  }

  return { value: Object.keys(out).length > 0 ? out : undefined };
}

function migrateLegacyTaskFields(task: Task): boolean {
  let changed = false;
  const meta: Record<string, any> = task.disciplineMetadata && typeof task.disciplineMetadata === 'object' && !Array.isArray(task.disciplineMetadata)
    ? { ...task.disciplineMetadata }
    : {};
  const attachments = Array.isArray(task.attachments)
    ? task.attachments.filter((a): a is string => typeof a === 'string' && Boolean(a.trim())).map(a => a.trim())
    : [];

  const isDesign = task.team === 'design' || (Boolean(meta.assetType || meta.dimensions || meta.format || meta.quantity) && !meta.contentType);
  if (isDesign) {
    const extraSpecParts: string[] = [];
    if (typeof meta.dimensions === 'string' && meta.dimensions.trim()) {
      extraSpecParts.push(`Dimensions: ${meta.dimensions.trim()}`);
      delete meta.dimensions;
      changed = true;
    }
    if (typeof meta.format === 'string' && meta.format.trim()) {
      extraSpecParts.push(`Deliverable Format: ${meta.format.trim()}`);
      delete meta.format;
      changed = true;
    }
    if (meta.quantity !== undefined && meta.quantity !== null && String(meta.quantity).trim()) {
      extraSpecParts.push(`Quantity: ${String(meta.quantity).trim()}`);
      delete meta.quantity;
      changed = true;
    }
    if (extraSpecParts.length > 0) {
      const existing = typeof meta.designSpecifications === 'string' ? meta.designSpecifications.trim() : '';
      const appended = extraSpecParts.join('\n');
      meta.designSpecifications = existing ? `${existing}\n\n${appended}` : appended;
    }
    if (attachments.length > 0) {
      const existingRefs = Array.isArray(meta.brandAssetsReferences) ? meta.brandAssetsReferences : [];
      const merged = Array.from(new Set([...existingRefs, ...attachments]));
      if (merged.length > 0) meta.brandAssetsReferences = merged;
      delete task.attachments;
      changed = true;
    }
  } else {
    const extraSpecParts: string[] = [];
    const extraRefs: string[] = [];
    if (typeof meta.deliverable === 'string' && meta.deliverable.trim()) {
      extraSpecParts.push(`Deliverable Format: ${meta.deliverable.trim()}`);
      delete meta.deliverable;
      changed = true;
    }
    if (meta.wordCount !== undefined && meta.wordCount !== null && String(meta.wordCount).trim()) {
      extraSpecParts.push(`Word Count Target: ${String(meta.wordCount).trim()}`);
      delete meta.wordCount;
      changed = true;
    }
    if (typeof meta.relevantRequirements === 'string' && meta.relevantRequirements.trim()) {
      extraSpecParts.push(meta.relevantRequirements.trim());
      delete meta.relevantRequirements;
      changed = true;
    }
    if (typeof meta.brief === 'string' && meta.brief.trim()) {
      const b = meta.brief.trim();
      if (/^https?:\/\/\S+/i.test(b)) {
        extraRefs.push(b);
      } else {
        extraSpecParts.push(`Outline: ${b}`);
      }
      delete meta.brief;
      changed = true;
    }
    if (extraSpecParts.length > 0) {
      const existing = typeof meta.contentSpecifications === 'string' ? meta.contentSpecifications.trim() : '';
      const appended = extraSpecParts.join('\n');
      meta.contentSpecifications = existing ? `${existing}\n\n${appended}` : appended;
    }
    if (extraRefs.length > 0 || attachments.length > 0) {
      const existingRefs = Array.isArray(meta.sourceContentReferences) ? meta.sourceContentReferences : [];
      const merged = Array.from(new Set([...existingRefs, ...extraRefs, ...attachments]));
      if (merged.length > 0) meta.sourceContentReferences = merged;
      if (attachments.length > 0) delete task.attachments;
      changed = true;
    }
  }

  if (changed) {
    task.disciplineMetadata = Object.keys(meta).length > 0 ? meta : undefined;
  }
  return changed;
}

function hydrateSubtasksFromParents(appStore: AppStore): boolean {
  let changed = false;
  if (!Array.isArray(appStore.parentTasks)) {
    appStore.parentTasks = [];
    changed = true;
  }
  const parentMap = new Map<string, ParentTask>();
  for (const p of appStore.parentTasks) {
    if (p && p.id) parentMap.set(p.id, p);
  }

  for (const task of appStore.tasks) {
    if (migrateLegacyTaskFields(task)) {
      changed = true;
    }
    if (task.parentTaskId) {
      let parent = parentMap.get(task.parentTaskId);
      if (!parent) {
        parent = {
          id: task.parentTaskId,
          title: task.parentTaskTitle || task.title.replace(/\s+\((Content|Design)\)$/i, ''),
          brief: task.description || undefined,
          brandGuidelines: task.brandGuidelines || undefined,
          client: task.client,
          project: task.project,
          clickupParentTaskId: task.clickupParentTaskId,
          clickupSpaceId: task.clickupSpaceId,
          clickupSpaceName: task.clickupSpaceName,
          clickupFolderId: task.clickupFolderId,
          clickupFolderName: task.clickupFolderName,
          clickupListId: task.clickupListId,
          clickupListName: task.clickupListName,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
        };
        appStore.parentTasks.push(parent);
        parentMap.set(parent.id, parent);
        changed = true;
      }
      if (parent.title && task.parentTaskTitle !== parent.title) {
        task.parentTaskTitle = parent.title;
        changed = true;
      }
      if ((parent.brief || undefined) !== (task.description || undefined)) {
        task.description = parent.brief || undefined;
        changed = true;
      }
      if ((parent.brandGuidelines || undefined) !== (task.brandGuidelines || undefined)) {
        task.brandGuidelines = parent.brandGuidelines || undefined;
        changed = true;
      }
      if (parent.clickupParentTaskId && !task.clickupParentTaskId) {
        task.clickupParentTaskId = parent.clickupParentTaskId;
        changed = true;
      }
    }
  }
  return changed;
}

// Format duration milliseconds into compact billable hours string for audit records
function formatBillableHoursServer(ms: number): string {
  if (ms <= 0) return '0h';
  const hours = ms / (1000 * 60 * 60);
  if (hours < 0.1) {
    const mins = Math.max(1, Math.round(ms / (1000 * 60)));
    return `${mins}m`;
  }
  const formattedHours = parseFloat(hours.toFixed(1));
  return `${formattedHours}h`;
}

// In-memory sliding-window rate limiter for sensitive mutation endpoints
function createRateLimiter(maxRequests: number, windowMs: number) {
  const records = new Map<string, number[]>();
  return (req: Request, res: Response, next: () => void) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const timestamps = records.get(ip) || [];
    const validTimestamps = timestamps.filter(t => now - t < windowMs);

    if (validTimestamps.length >= maxRequests) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      return res.status(429).json({
        error: 'Too many requests. Please wait a moment before trying again.',
      });
    }

    validTimestamps.push(now);
    records.set(ip, validTimestamps);

    // Prune stale IP entries periodically
    if (records.size > 500) {
      for (const [key, list] of records.entries()) {
        if (list.every(t => now - t >= windowMs)) {
          records.delete(key);
        }
      }
    }

    next();
  };
}

// In-memory active store
let store: AppStore = loadStore();

// Server-owned persistence: Admin SDK with private credentials, or local storage.
let adminDb: any = null;
let firestoreLastError: string | null = null;
let firestoreLastSyncTime: string | null = null;
let firestoreMode: 'admin' | 'web' | 'local' = 'local';
let firestoreProjectId: string = 'zen-flow-7173d';
let firestoreDatabaseId: string = '(default)';

function findServiceAccount(): any | null {
  // Only check FIREBASE_SERVICE_ACCOUNT_KEY (or system GOOGLE_APPLICATION_CREDENTIALS)
  const envKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (envKey) {
    const trimmed = envKey.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.project_id) return parsed;
      } catch (e) {
        console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY from JSON string:', e);
      }
    } else if (trimmed.length > 50 && !trimmed.includes('\n')) {
      // Possible base64-encoded JSON string
      try {
        const decoded = Buffer.from(trimmed, 'base64').toString('utf-8');
        if (decoded.trim().startsWith('{')) {
          const parsed = JSON.parse(decoded);
          if (parsed.project_id) return parsed;
        }
      } catch {
        // ignore
      }
    }

    if (fs.existsSync(trimmed)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(trimmed, 'utf-8'));
        if (parsed.project_id) return parsed;
      } catch (e) {
        console.error('Failed to read service account key from file path:', trimmed, e);
      }
    }
  }

  // Check local service account file if uploaded via /api/firestore/credentials or present on disk
  const localKeyPath = path.join(process.cwd(), 'serviceAccountKey.json');
  if (fs.existsSync(localKeyPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(localKeyPath, 'utf-8'));
      if (parsed.project_id && parsed.private_key && parsed.client_email) {
        return parsed;
      }
    } catch (e) {
      console.error('Failed to read service account key from serviceAccountKey.json:', e);
    }
  }

  return null;
}

let initPromise: Promise<void> | null = null;

async function initFirestore() {
  if (adminDb) return;
  if (!initPromise) {
    initPromise = (async () => {
      // Read firebase-applet-config.json for fallback IDs
      let fileConfig: any = {};
      try {
        const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
        if (fs.existsSync(configPath)) {
          fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          if (fileConfig.projectId) firestoreProjectId = fileConfig.projectId;
          if (fileConfig.firestoreDatabaseId) firestoreDatabaseId = fileConfig.firestoreDatabaseId;
        }
      } catch {
        // ignore
      }

      // 1. Check for Service Account Key
      const serviceAccountObj = findServiceAccount();

      if (serviceAccountObj) {
        try {
          firestoreProjectId = serviceAccountObj.project_id || firestoreProjectId;
          const adminAppModule = await import('firebase-admin/app');
          let adminFirestoreModule: any = null;
          try {
            adminFirestoreModule = await import('firebase-admin/firestore');
          } catch (fErr: any) {
            console.warn('[Firestore Admin] firebase-admin/firestore or @google-cloud/firestore unavailable:', fErr?.message || fErr);
          }

          if (!adminAppModule || !adminFirestoreModule) {
            throw new Error('Firebase Admin SDK or @google-cloud/firestore is not available in the current runtime environment.');
          }

          const adminApps = adminAppModule.getApps().filter(app => app.name === 'zenflow-firestore');
          const adminApp = adminApps.length === 0
            ? adminAppModule.initializeApp({
                credential: adminAppModule.cert(serviceAccountObj),
                projectId: firestoreProjectId,
              }, 'zenflow-firestore')
            : adminAppModule.getApp('zenflow-firestore');

          adminDb = adminFirestoreModule.getFirestore(adminApp);
          try {
            adminDb.settings({ ignoreUndefinedProperties: true });
          } catch {
            // settings already configured
          }
          firestoreMode = 'admin';
          firestoreLastError = null;
          console.log('[Firestore Admin] Successfully initialized with Service Account Key for project:', firestoreProjectId);
          return;
        } catch (err: any) {
          firestoreLastError = err.message || String(err);
          console.warn('[Firestore Admin] Failed to initialize admin SDK with service account:', err);
        }
      }

      // Direct unauthenticated Firestore access is intentionally disabled. Local mode
      // remains available for offline development or an explicitly provisioned volume.
      firestoreMode = 'local';
      firestoreLastError ||= 'Firebase Admin credentials required for cloud persistence';

    })();
  }
  await initPromise;
}

// Utility to clean undefined values so Firestore never throws unsupported field value error
function cleanDocData<T extends Record<string, any>>(obj: T): Partial<T> {
  const clean: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
        clean[k] = cleanDocData(v);
      } else {
        clean[k] = v;
      }
    }
  }
  return clean;
}

// Read the tail of the compliance audit log into the in-memory cache for fast sub-millisecond retrieval
async function loadRecentAuditLogs(): Promise<void> {
  try {
    recentAuditLogs.push(...await readAuditTail<AuditLogEntry>(AUDIT_LOG_FILE, MAX_RECENT_AUDIT_LOGS));
  } catch {
    console.warn('[Audit Log] Failed to load recent audit records');
  }
}

// Append-only compliance audit logger (SOC2 non-repudiation stream)
async function appendAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'> & { id?: string; timestamp?: string }): Promise<void> {
  const fullEntry: AuditLogEntry = {
    id: entry.id || `audit-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    timestamp: entry.timestamp || new Date().toISOString(),
    ...entry,
  };

  recentAuditLogs.unshift(fullEntry);
  if (recentAuditLogs.length > MAX_RECENT_AUDIT_LOGS) {
    recentAuditLogs.pop();
  }

  // Non-blocking disk append to compliance-audit.jsonl
  try {
    if (!fs.existsSync(DATA_DIR)) {
      await fs.promises.mkdir(DATA_DIR, { recursive: true });
    }
    const line = JSON.stringify(fullEntry) + '\n';
    await fs.promises.appendFile(AUDIT_LOG_FILE, line, 'utf-8');
  } catch (err) {
    console.error('[Compliance Audit] Failed to append audit log to disk:', err);
  }

  // Mirror to Cloud Firestore audit collection if active
  try {
    if (!adminDb) await initFirestore();
    const payload = cleanDocData(fullEntry);
    if (adminDb) {
      adminDb.collection('compliance_audit_logs').doc(fullEntry.id).create(payload).catch(() => {});
    }
  } catch {
    // ignore
  }
}

// Unified DB helper methods with error tracking & auto-recovery
async function dbSaveUser(user: User) {
  try {
    if (!adminDb) await initFirestore();
    const payload = cleanDocData(user);
    if (adminDb) {
      await adminDb.collection('users').doc(user.id).set(payload, { merge: true });
      firestoreLastError = null;
    }
  } catch (err: any) {
    firestoreLastError = err.message || String(err);
    console.error('[Firestore Save User Error]:', firestoreLastError);
  }
}

async function dbSaveTask(task: Task) {
  try {
    if (!adminDb) await initFirestore();
    const payload = cleanDocData(task);
    if (adminDb) {
      await adminDb.collection('tasks').doc(task.id).set(payload, { merge: true });
      firestoreLastError = null;
    }
  } catch (err: any) {
    firestoreLastError = err.message || String(err);
    console.error('[Firestore Save Task Error]:', firestoreLastError);
  }
}

async function dbSaveParentTask(parentTask: ParentTask) {
  try {
    if (!adminDb) await initFirestore();
    const payload = cleanDocData(parentTask);
    if (adminDb) {
      await adminDb.collection('parent_tasks').doc(parentTask.id).set(payload, { merge: true });
      firestoreLastError = null;
    }
  } catch (err: any) {
    firestoreLastError = err.message || String(err);
    console.error('[Firestore Save ParentTask Error]:', firestoreLastError);
  }
}

async function dbDeleteParentTask(parentTaskId: string) {
  try {
    if (!adminDb) await initFirestore();
    if (adminDb) {
      await adminDb.collection('parent_tasks').doc(parentTaskId).delete();
      firestoreLastError = null;
    }
  } catch (err: any) {
    firestoreLastError = err.message || String(err);
    console.error('[Firestore Delete ParentTask Error]:', firestoreLastError);
  }
}

async function dbBatchSaveParentTasks(parentTasks: ParentTask[]) {
  if (parentTasks.length === 0) return;
  try {
    if (!adminDb) await initFirestore();
    const CHUNK_SIZE = 500;
    for (let i = 0; i < parentTasks.length; i += CHUNK_SIZE) {
      const chunk = parentTasks.slice(i, i + CHUNK_SIZE);
      if (adminDb) {
        const batch = adminDb.batch();
        for (const p of chunk) {
          batch.set(adminDb.collection('parent_tasks').doc(p.id), cleanDocData(p), { merge: true });
        }
        await batch.commit();
        firestoreLastError = null;
      }
    }
  } catch (err: any) {
    firestoreLastError = err.message || String(err);
    console.error('[Firestore Batch Save ParentTasks Error]:', firestoreLastError);
  }
}

async function dbDeleteTask(taskId: string) {
  try {
    if (!adminDb) await initFirestore();
    if (adminDb) {
      await adminDb.collection('tasks').doc(taskId).delete();
      firestoreLastError = null;
    }
  } catch (err: any) {
    firestoreLastError = err.message || String(err);
    console.error('[Firestore Delete Task Error]:', firestoreLastError);
  }
}

async function dbDeleteUser(userId: string) {
  try {
    if (!adminDb) await initFirestore();
    if (adminDb) {
      await adminDb.collection('users').doc(userId).delete();
      firestoreLastError = null;
    }
  } catch (err: any) {
    firestoreLastError = err.message || String(err);
    console.error('[Firestore Delete User Error]:', firestoreLastError);
  }
}

async function dbBatchDeleteTasks(taskIds: string[]) {
  if (taskIds.length === 0) return;
  try {
    if (!adminDb) await initFirestore();
    const CHUNK_SIZE = 500;
    for (let i = 0; i < taskIds.length; i += CHUNK_SIZE) {
      const chunk = taskIds.slice(i, i + CHUNK_SIZE);
      if (adminDb) {
        const batch = adminDb.batch();
        for (const id of chunk) {
          batch.delete(adminDb.collection('tasks').doc(id));
        }
        await batch.commit();
        firestoreLastError = null;
      }
    }
  } catch (err: any) {
    firestoreLastError = err.message || String(err);
    console.error('[Firestore Batch Delete Tasks Error]:', firestoreLastError);
  }
}

async function dbBatchSaveUsers(users: User[]) {
  if (users.length === 0) return;
  try {
    if (!adminDb) await initFirestore();
    const CHUNK_SIZE = 500;
    for (let i = 0; i < users.length; i += CHUNK_SIZE) {
      const chunk = users.slice(i, i + CHUNK_SIZE);
      if (adminDb) {
        const batch = adminDb.batch();
        for (const u of chunk) {
          batch.set(adminDb.collection('users').doc(u.id), cleanDocData(u), { merge: true });
        }
        await batch.commit();
        firestoreLastError = null;
      }
    }
  } catch (err: any) {
    firestoreLastError = err.message || String(err);
    console.error('[Firestore Batch Save Users Error]:', firestoreLastError);
  }
}

async function dbBatchSaveTasks(tasks: Task[]) {
  if (tasks.length === 0) return;
  try {
    if (!adminDb) await initFirestore();
    // Firestore has a maximum batch limit of 500 operations. Chunk tasks into blocks of 500.
    const CHUNK_SIZE = 500;
    for (let i = 0; i < tasks.length; i += CHUNK_SIZE) {
      const chunk = tasks.slice(i, i + CHUNK_SIZE);
      if (adminDb) {
        const batch = adminDb.batch();
        for (const t of chunk) {
          batch.set(adminDb.collection('tasks').doc(t.id), cleanDocData(t), { merge: true });
        }
        await batch.commit();
        firestoreLastError = null;
      }
    }
  } catch (err: any) {
    firestoreLastError = err.message || String(err);
    console.error('[Firestore Batch Save Tasks Error]:', firestoreLastError);
  }
}

async function dbPurgeAllCollections() {
  try {
    if (!adminDb) await initFirestore();
    if (!adminDb) return;

    // 1. Purge all tasks & parent_tasks
    const tasksSnap = await adminDb.collection('tasks').get();
    const taskDocs = tasksSnap.docs;
    const CHUNK_SIZE = 500;
    for (let i = 0; i < taskDocs.length; i += CHUNK_SIZE) {
      const chunk = taskDocs.slice(i, i + CHUNK_SIZE);
      const batch = adminDb.batch();
      for (const doc of chunk) {
        batch.delete(doc.ref);
      }
      await batch.commit();
    }

    const parentSnap = await adminDb.collection('parent_tasks').get();
    const parentDocs = parentSnap.docs;
    for (let i = 0; i < parentDocs.length; i += CHUNK_SIZE) {
      const chunk = parentDocs.slice(i, i + CHUNK_SIZE);
      const batch = adminDb.batch();
      for (const doc of chunk) {
        batch.delete(doc.ref);
      }
      await batch.commit();
    }

    // 2. Purge non-superadmin users, retaining only the root superadmin
    const usersSnap = await adminDb.collection('users').get();
    const userDocs = usersSnap.docs;
    for (let i = 0; i < userDocs.length; i += CHUNK_SIZE) {
      const chunk = userDocs.slice(i, i + CHUNK_SIZE);
      const batch = adminDb.batch();
      let deleteCount = 0;
      for (const doc of chunk) {
        const data = doc.data();
        const email = String(data?.email || '').toLowerCase().trim();
        if (email !== SUPERADMIN_EMAIL.toLowerCase()) {
          batch.delete(doc.ref);
          deleteCount++;
        }
      }
      if (deleteCount > 0) {
        await batch.commit();
      }
    }
    firestoreLastError = null;
  } catch (err: any) {
    firestoreLastError = err.message || String(err);
    console.error('[Firestore Purge Collections Error]:', firestoreLastError);
  }
}

// Sync existing users and tasks with Firestore
async function syncFromFirestore() {
  if (!adminDb) {
    await initFirestore();
    if (!adminDb) return;
  }

  try {
    // Use module-level DUMMY_USER_IDS — eliminates duplicate Set literal (single source of truth)

    const firestoreUsers: User[] = [];
    const firestoreTasks: Task[] = [];
    const firestoreParents: ParentTask[] = [];

    if (adminDb) {
      const usersSnap = await adminDb.collection('users').get();
      const tasksSnap = await adminDb.collection('tasks').get();
      const parentsSnap = await adminDb.collection('parent_tasks').get();

      usersSnap.forEach((d: any) => {
        const u = d.data() as User;
        if (!DUMMY_USER_IDS.has(u.id) && !u.email?.endsWith('@acme.studio')) {
          firestoreUsers.push(u);
        }
      });

      tasksSnap.forEach((d: any) => {
        const t = d.data() as Task;
        if (!DUMMY_TASK_IDS.has(t.id) && !DUMMY_USER_IDS.has(t.userId)) {
          firestoreTasks.push(t);
        }
      });

      parentsSnap.forEach((d: any) => {
        const p = d.data() as ParentTask;
        if (p && p.id) {
          firestoreParents.push(p);
        }
      });
    }

    // Merge strategy:
    // 1. Users: If Firestore has documents, integrate them with store.
    //    If Firestore is empty but store has users, push store users to Firestore via fast batch commit!
    if (firestoreUsers.length > 0) {
      const userMap = new Map(store.users.map(u => [u.id, u]));
      for (const u of firestoreUsers) {
        userMap.set(u.id, u);
      }
      store.users = Array.from(userMap.values());
    } else if (store.users.length > 0) {
      await dbBatchSaveUsers(store.users);
    }

    // 2. Tasks: If Firestore has tasks, integrate them.
    //    If Firestore is empty but store has tasks, push store tasks to Firestore via fast batch commit!
    if (firestoreTasks.length > 0) {
      const taskMap = new Map(store.tasks.map(t => [t.id, t]));
      for (const t of firestoreTasks) {
        taskMap.set(t.id, t);
      }
      store.tasks = Array.from(taskMap.values());
    } else if (store.tasks.length > 0) {
      await dbBatchSaveTasks(store.tasks);
    }

    // 3. Parent Tasks: merge or push to Firestore
    if (firestoreParents.length > 0) {
      const parentMap = new Map((store.parentTasks || []).map(p => [p.id, p]));
      for (const p of firestoreParents) {
        parentMap.set(p.id, p);
      }
      store.parentTasks = Array.from(parentMap.values());
    } else if (store.parentTasks && store.parentTasks.length > 0) {
      await dbBatchSaveParentTasks(store.parentTasks);
    }

    const { removedTaskIds } = migrateLegacyRoles(store);
    if (removedTaskIds.length > 0) {
      await dbBatchDeleteTasks(removedTaskIds);
    }
    if (hydrateSubtasksFromParents(store)) {
      await dbBatchSaveParentTasks(store.parentTasks);
      await dbBatchSaveTasks(store.tasks);
    }

    ensureSuperadmin(store);
    saveStore(store);
    firestoreLastError = null;
    firestoreLastSyncTime = new Date().toISOString();
    console.log(`[Firestore] Sync complete: ${store.users.length} user(s), ${store.tasks.length} task(s).`);
  } catch (err: any) {
    firestoreLastError = err.message || String(err);
    console.warn('[Firestore] Sync warning, retaining local store:', firestoreLastError);
  }
}

// Connected clients for Server-Sent Events (SSE) real-time broadcasting
type SSEClient = {
  id: number;
  res: Response;
  userId: string;
  expiresAt: number;
};

let clients: SSEClient[] = [];
let nextClientId = 1;
const MAX_SSE_CLIENTS = 100;

function broadcastEvent(type: string, payload: any) {
  const eventData = JSON.stringify({
    type,
    payload: redactPayload(payload),
    timestamp: Date.now(),
  });

  const message = `event: update\ndata: ${eventData}\n\n`;

  // Actively prune dead or closed SSE sockets to eliminate memory leaks
  clients = clients.filter(client => {
    try {
      if (client.res.writableEnded || client.res.destroyed) {
        return false;
      }
      if (client.expiresAt <= Date.now() || !store.users.some(user => user.id === client.userId)) {
        client.res.destroy();
        return false;
      }
      return writeSse(client.res, message);
    } catch {
      return false;
    }
  });
}

function deduplicateUsers(appStore: AppStore): boolean {
  let changed = false;
  const byEmail = new Map<string, User[]>();
  for (const u of appStore.users) {
    if (!u || !u.email) continue;
    const em = u.email.toLowerCase().trim();
    if (!byEmail.has(em)) byEmail.set(em, []);
    byEmail.get(em)!.push(u);
  }

  for (const [email, list] of byEmail.entries()) {
    if (list.length <= 1) {
      if (email === SUPERADMIN_EMAIL.toLowerCase() && list[0] && !list[0].isCreativeDirector) {
        list[0].isCreativeDirector = true;
        changed = true;
      }
      continue;
    }

    changed = true;
    console.log(`[Deduplication] Resolving ${list.length} duplicate accounts for ${email}...`);

    // Determine primary user:
    // 1. Account that has tasks in appStore.tasks
    // 2. Account whose ID is NOT 'user-superadmin-kiran'
    // 3. Earliest created account
    let primary = list.find(u => appStore.tasks.some(t => t.userId === u.id));
    if (!primary) {
      primary = list.find(u => u.id !== 'user-superadmin-kiran') || list[0];
    }

    if (email === SUPERADMIN_EMAIL.toLowerCase()) {
      primary.isCreativeDirector = true;
    }

    // Reassign any tasks belonging to other duplicate accounts to primary ID
    for (const dup of list) {
      if (dup.id === primary.id) continue;
      for (const t of appStore.tasks) {
        if (t.userId === dup.id) {
          t.userId = primary.id;
          changed = true;
        }
      }
      dbDeleteUser(dup.id).catch(() => {});
    }

    // Retain only the primary user
    appStore.users = appStore.users.filter(u => {
      if (u.email && u.email.toLowerCase().trim() === email) {
        return u.id === primary.id;
      }
      return true;
    });

    console.log(`[Deduplication] Successfully retained primary user: ${primary.name} (${primary.id}) and pruned duplicates.`);
  }

  if (changed) {
    saveStore(appStore);
  }
  return changed;
}

function ensureSuperadmin(appStore: AppStore) {
  deduplicateUsers(appStore);

  const existingSuperadmin = appStore.users.find(
    u => u.email.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase()
  );

  if (existingSuperadmin) {
    if (!existingSuperadmin.isCreativeDirector) {
      existingSuperadmin.isCreativeDirector = true;
      saveStore(appStore);
      dbSaveUser(existingSuperadmin).catch(e => console.error('Firestore superadmin update err:', e));
    }
  } else {
    // Only bootstrap if NO user with SUPERADMIN_EMAIL exists
    const superadmin: User = {
      id: 'user-superadmin-kiran',
      name: 'Kiran S',
      email: SUPERADMIN_EMAIL,
      role: 'content',
      avatarColor: 'from-blue-600 to-indigo-600',
      isCreativeDirector: true,
      createdAt: new Date().toISOString(),
    };
    appStore.users.unshift(superadmin);
    saveStore(appStore);
    dbSaveUser(superadmin).catch(e => console.error('Firestore superadmin init err:', e));
    console.log(`[Superadmin] Initialized ${SUPERADMIN_EMAIL} with Creative Director privileges.`);
  }
}

// Ensure superadmin exists and data is deduplicated on startup
ensureSuperadmin(store);

const cachedClickupTeamIds = new Map<string, string>();
async function resolveClickupTeamId(token: string): Promise<string | null> {
  const cached = cachedClickupTeamIds.get(token);
  if (cached) return cached;
  try {
    const teamRes = await fetch('https://api.clickup.com/api/v2/team', {
      headers: { Authorization: token },
    });
    if (teamRes.ok) {
      const teamData = await teamRes.json();
      const tid = teamData.teams?.[0]?.id ? String(teamData.teams[0].id) : null;
      if (tid) cachedClickupTeamIds.set(token, tid);
      return tid;
    }
  } catch (err) {
    console.warn('[ClickUp] Could not resolve team ID:', err);
  }
  return null;
}

async function postClickupTimeEntry(params: {
  clickupTaskId: string;
  durationMs: number;
  taskUser: User;
  callerUserId?: string;
  callerToken: string;
}): Promise<boolean> {
  const { clickupTaskId, durationMs, taskUser, callerUserId, callerToken } = params;
  const timeMs = Math.round(durationMs);
  if (timeMs < 1000) return true;

  const isOwnBoard = !callerUserId || callerUserId === taskUser.id;
  const boardUserToken = taskUser.clickupApiKey?.trim();
  const boardUserClickupId = taskUser.clickupUserId ? parseInt(taskUser.clickupUserId, 10) : undefined;

  if (boardUserToken) {
    const teamId = await resolveClickupTeamId(boardUserToken);
    if (teamId) {
      try {
        const timeRes = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/time_entries`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: boardUserToken },
          body: JSON.stringify({
            tid: clickupTaskId,
            duration: timeMs,
            start: Date.now() - timeMs,
            stop: Date.now(),
            billable: false,
            ...(boardUserClickupId && !isNaN(boardUserClickupId) ? { assignee: boardUserClickupId } : {}),
          }),
        });
        if (timeRes.ok) return true;
      } catch (err) {
        console.warn('[ClickUp Time Sync] Error via board member team time entries:', err);
      }
    }
    try {
      const timeRes = await fetch(`https://api.clickup.com/api/v2/task/${clickupTaskId}/time`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: boardUserToken },
        body: JSON.stringify({ time: timeMs, start: Date.now() - timeMs, end: Date.now() }),
      });
      if (timeRes.ok) return true;
    } catch (err) {
      console.warn('[ClickUp Time Sync] Error via board member task time endpoint:', err);
    }
  }

  if (callerToken && boardUserClickupId && !isNaN(boardUserClickupId)) {
    const teamId = await resolveClickupTeamId(callerToken);
    if (teamId) {
      try {
        const timeRes = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/time_entries`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: callerToken },
          body: JSON.stringify({
            tid: clickupTaskId,
            duration: timeMs,
            start: Date.now() - timeMs,
            stop: Date.now(),
            billable: false,
            assignee: boardUserClickupId,
          }),
        });
        if (timeRes.ok) return true;
      } catch (err) {
        console.warn('[ClickUp Time Sync] Exception posting time:', err);
      }
    }
  }

  if (isOwnBoard && callerToken) {
    try {
      const timeRes = await fetch(`https://api.clickup.com/api/v2/task/${clickupTaskId}/time`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: callerToken },
        body: JSON.stringify({ time: timeMs, start: Date.now() - timeMs, end: Date.now() }),
      });
      if (timeRes.ok) return true;
    } catch (err) {
      console.warn('[ClickUp Time Sync] Error posting time for own board:', err);
    }
  }
  return false;
}

function hashClickupDescription(text: unknown): string {
  if (typeof text !== 'string') return '';
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';
  return createHash('sha256').update(normalized).digest('hex');
}

function buildParentClickupMarkdown(brief?: string, brandGuidelines?: string): string {
  const sections: string[] = [];
  if (brief && brief.trim()) {
    sections.push(`**Brief**\n${brief.trim()}`);
  }
  if (brandGuidelines && brandGuidelines.trim()) {
    sections.push(`**Brand Guidelines**\n${brandGuidelines.trim()}`);
  }
  return sections.join('\n\n');
}

function buildSubtaskClickupMarkdown(team?: string, metadata?: Record<string, any>, contentDocLink?: string): string {
  const sections: string[] = [];
  const meta = metadata && typeof metadata === 'object' ? metadata : {};

  if (team === 'design' || (Boolean(meta.assetType || meta.designSpecifications || meta.brandAssetsReferences) && team !== 'content')) {
    if (meta.assetType) sections.push(`**Asset Type:** ${meta.assetType}`);
    if (meta.designSpecifications) sections.push(`**Design Specifications**\n${meta.designSpecifications}`);
    if (Array.isArray(meta.brandAssetsReferences) && meta.brandAssetsReferences.length > 0) {
      sections.push(`**Brand Assets & References**\n${meta.brandAssetsReferences.map((u: string) => `- ${u}`).join('\n')}`);
    }
  } else {
    if (meta.contentType) sections.push(`**Content Type:** ${meta.contentType}`);
    if (meta.contentSpecifications) sections.push(`**Content Specifications**\n${meta.contentSpecifications}`);
    if (Array.isArray(meta.sourceContentReferences) && meta.sourceContentReferences.length > 0) {
      sections.push(`**Source Content & References**\n${meta.sourceContentReferences.map((u: string) => `- ${u}`).join('\n')}`);
    }
  }

  if (contentDocLink && contentDocLink.trim()) {
    sections.push(`**Content Document Link**\n${contentDocLink.trim()}`);
  }
  return sections.join('\n\n');
}

async function pushSafeClickupDescription(params: {
  clickupId: string;
  desiredMarkdown: string;
  lastSyncedHash?: string;
  fallbackLegacyDesc?: string;
  token: string;
  commentHeader: string;
  initialLiveDesc?: string;
}): Promise<{ hash?: string; conflict: boolean }> {
  const { clickupId, desiredMarkdown, lastSyncedHash, fallbackLegacyDesc, token, commentHeader, initialLiveDesc } = params;
  if (!clickupId || !token) return { hash: lastSyncedHash, conflict: false };

  let liveDesc = initialLiveDesc;
  if (liveDesc === undefined) {
    try {
      const getRes = await fetch(`https://api.clickup.com/api/v2/task/${clickupId}`, {
        headers: { Authorization: token },
      });
      if (getRes.ok) {
        const data = await getRes.json();
        liveDesc = typeof data?.description === 'string' ? data.description : '';
      }
    } catch (err) {
      console.warn(`[ClickUp Desc Sync] Failed reading ClickUp task ${clickupId}:`, err);
    }
  }

  const liveHash = hashClickupDescription(liveDesc || '');
  const desiredHash = hashClickupDescription(desiredMarkdown);
  if (liveHash === desiredHash) {
    return { hash: desiredHash, conflict: false };
  }

  const fallbackHash = fallbackLegacyDesc ? hashClickupDescription(fallbackLegacyDesc) : '';
  const isSafeToOverwrite =
    liveHash === '' ||
    (Boolean(lastSyncedHash) && liveHash === lastSyncedHash) ||
    (!lastSyncedHash && Boolean(fallbackHash) && liveHash === fallbackHash);

  if (isSafeToOverwrite) {
    try {
      const putRes = await fetch(`https://api.clickup.com/api/v2/task/${clickupId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({ description: desiredMarkdown }),
      });
      if (putRes.ok) {
        const updatedData = await putRes.json().catch(() => null);
        const returnedHash = typeof updatedData?.description === 'string'
          ? hashClickupDescription(updatedData.description)
          : '';
        return { hash: returnedHash || desiredHash, conflict: false };
      }
    } catch (err) {
      console.warn(`[ClickUp Desc Sync] PUT description failed for ${clickupId}:`, err);
    }
    return { hash: lastSyncedHash, conflict: false };
  }

  // ClickUp description was edited manually outside ZenFlow: preserve ClickUp text and post comment instead
  if (desiredMarkdown.trim()) {
    try {
      await fetch(`https://api.clickup.com/api/v2/task/${clickupId}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({ comment_text: `${commentHeader}\n\n${desiredMarkdown}` }),
      });
    } catch (err) {
      console.warn(`[ClickUp Desc Sync] Fallback comment failed for ${clickupId}:`, err);
    }
  }
  return { hash: lastSyncedHash, conflict: true };
}

async function syncParentDescriptionToClickUp(parent: ParentTask, explicitToken?: string, previousBrief?: string) {
  if (!parent.clickupParentTaskId) return;
  const token = (explicitToken || store.users.find(u => u.clickupApiKey)?.clickupApiKey || '').trim();
  if (!token) return;

  const desiredMarkdown = buildParentClickupMarkdown(parent.brief, parent.brandGuidelines);
  const res = await pushSafeClickupDescription({
    clickupId: parent.clickupParentTaskId,
    desiredMarkdown,
    lastSyncedHash: parent.lastSyncedClickupDescHash,
    fallbackLegacyDesc: previousBrief,
    token,
    commentHeader: 'ZenFlow Parent Brief / Brand Guidelines Update (preserved manual ClickUp description):',
  });
  if (res.hash !== parent.lastSyncedClickupDescHash) {
    parent.lastSyncedClickupDescHash = res.hash;
    saveStore(store);
    dbSaveParentTask(parent).catch(() => {});
  }
}

async function syncContentLinkToClickUp(task: Task, link: string, explicitToken?: string) {
  if (!task.clickupTaskId || !link) return;
  const assignees = getTaskAssigneeIdsServer(task);
  const firstUser = assignees[0] ? store.users.find(u => u.id === assignees[0]) : undefined;
  const token = (explicitToken || firstUser?.clickupApiKey || store.users.find(u => u.clickupApiKey)?.clickupApiKey || '').trim();
  if (!token) return;

  try {
    await fetch(`https://api.clickup.com/api/v2/task/${task.clickupTaskId}/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token },
      body: JSON.stringify({ comment_text: `Content Document Link: ${link}` }),
    });
  } catch (err) {
    console.warn('[ClickUp Link Sync] Comment error:', err);
  }

  const desiredMarkdown = buildSubtaskClickupMarkdown(task.team, task.disciplineMetadata, link);
  const res = await pushSafeClickupDescription({
    clickupId: task.clickupTaskId,
    desiredMarkdown,
    lastSyncedHash: task.lastSyncedClickupDescHash,
    fallbackLegacyDesc: task.description,
    token,
    commentHeader: `ZenFlow Content Document Link Update: ${link}`,
  });
  if (res.hash !== task.lastSyncedClickupDescHash) {
    task.lastSyncedClickupDescHash = res.hash;
    saveStore(store);
    dbSaveTask(task).catch(() => {});
  }
}

async function syncTaskToClickUp(
  task: Task,
  apiKey?: string,
  user?: User,
  callerUserId?: string,
  options?: { syncDescription?: boolean; previousDescription?: string }
) {
  const assigneeIds = getTaskAssigneeIdsServer(task);
  const assigneeUsers = assigneeIds
    .map(id => store.users.find(u => u.id === id))
    .filter((u): u is User => Boolean(u));
  const taskUser = user || assigneeUsers[0];
  const callerToken = (apiKey || '').trim();
  const token = (taskUser?.clickupApiKey || callerToken || store.users.find(u => u.clickupApiKey)?.clickupApiKey || '').trim();
  if (!token || (!task.clickupListId && !task.clickupTaskId)) return;

  const targetStatus = ZENFLOW_TO_CLICKUP_STATUS[task.status] || 'to do';
  const estimateMs = (typeof task.estimatedHours === 'number' && task.estimatedHours > 0)
    ? Math.round(task.estimatedHours * 3600000)
    : (COGNITIVE_LOAD_ESTIMATES_MS[task.cognitiveLoad] || COGNITIVE_LOAD_ESTIMATES_MS.medium);

  const clickupAssigneeIds = assigneeUsers
    .map(u => (u.clickupUserId ? parseInt(u.clickupUserId, 10) : NaN))
    .filter(id => !isNaN(id));

  let zenflowTrackedMs = task.inProgressDurationMs || 0;
  if (task.status === 'in_progress' && task.inProgressStartedAt) {
    zenflowTrackedMs += Math.max(0, Date.now() - new Date(task.inProgressStartedAt).getTime());
  }

  const startDateMs = task.startDate
    ? new Date(task.startDate.includes('T') ? task.startDate : `${task.startDate}T09:00:00`).getTime()
    : (task.inProgressStartedAt ? new Date(task.inProgressStartedAt).getTime() : undefined);

  if (task.clickupTaskId) {
    try {
      let clickupTimeSpent = 0;
      let existingClickupAssignees: number[] = [];
      let liveDescription: string | undefined = undefined;
      try {
        const getRes = await fetch(`https://api.clickup.com/api/v2/task/${task.clickupTaskId}`, {
          headers: { Authorization: token },
        });
        if (getRes.ok) {
          const cuTask = await getRes.json();
          clickupTimeSpent = typeof cuTask.time_spent === 'number' ? cuTask.time_spent : 0;
          if (typeof cuTask.description === 'string') {
            liveDescription = cuTask.description;
          }
          if (Array.isArray(cuTask.assignees)) {
            existingClickupAssignees = cuTask.assignees
              .map((a: any) => (typeof a === 'object' && a?.id ? parseInt(String(a.id), 10) : parseInt(String(a), 10)))
              .filter((id: number) => !isNaN(id));
          }
        }
      } catch (err) {
        console.warn(`[ClickUp Sync] Error reading task ${task.id} details:`, err);
      }

      const timeDiffMs = zenflowTrackedMs - clickupTimeSpent;
      if (timeDiffMs >= 1000 && taskUser) {
        await postClickupTimeEntry({
          clickupTaskId: task.clickupTaskId,
          durationMs: timeDiffMs,
          taskUser,
          callerUserId,
          callerToken: callerToken || token,
        });
      }

      const updatePayload: Record<string, any> = {
        name: task.title,
        status: targetStatus,
        time_estimate: estimateMs,
      };
      if (task.dueDate) updatePayload.due_date = new Date(task.dueDate + 'T23:59:59').getTime();
      if (startDateMs && !isNaN(startDateMs)) updatePayload.start_date = startDateMs;

      const rem = existingClickupAssignees.filter(id => !clickupAssigneeIds.includes(id));
      const add = clickupAssigneeIds.filter(id => !existingClickupAssignees.includes(id));
      if (add.length > 0 || rem.length > 0) {
        updatePayload.assignees = {
          ...(add.length > 0 ? { add } : {}),
          ...(rem.length > 0 ? { rem } : {}),
        };
      }

      const res = await fetch(`https://api.clickup.com/api/v2/task/${task.clickupTaskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify(updatePayload),
      });
      if (!res.ok) {
        console.warn(`[ClickUp Sync] Failed to update task ${task.id} in ClickUp:`, await res.text());
      }

      if (options?.syncDescription) {
        const desiredMarkdown = (task.isSubtask || task.disciplineMetadata)
          ? buildSubtaskClickupMarkdown(task.team, task.disciplineMetadata, task.contentDocLink)
          : buildParentClickupMarkdown(task.description, task.brandGuidelines);
        const descRes = await pushSafeClickupDescription({
          clickupId: task.clickupTaskId,
          desiredMarkdown,
          lastSyncedHash: task.lastSyncedClickupDescHash,
          fallbackLegacyDesc: options.previousDescription ?? task.description,
          token,
          commentHeader: 'ZenFlow Specifications Update (preserved manual ClickUp description):',
          initialLiveDesc: liveDescription,
        });
        if (descRes.hash !== task.lastSyncedClickupDescHash) {
          task.lastSyncedClickupDescHash = descRes.hash;
          saveStore(store);
          dbSaveTask(task).catch(() => {});
        }
      }

      if (task.clickupTaskTypeFieldId && task.clickupTaskTypeId) {
        await fetch(`https://api.clickup.com/api/v2/task/${task.clickupTaskId}/field/${task.clickupTaskTypeFieldId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: token },
          body: JSON.stringify({ value: task.clickupTaskTypeId }),
        }).catch(() => {});
      }
    } catch (err) {
      console.warn(`[ClickUp Sync] Error updating task ${task.id}:`, err);
    }
    return;
  }

  if (!task.clickupListId) return;

  try {
    const initialDesc = (task.isSubtask || task.disciplineMetadata)
      ? buildSubtaskClickupMarkdown(task.team, task.disciplineMetadata, task.contentDocLink)
      : buildParentClickupMarkdown(task.description, task.brandGuidelines);
    const createPayload: Record<string, any> = {
      name: task.title,
      status: targetStatus,
      time_estimate: estimateMs,
    };
    if (initialDesc) createPayload.description = initialDesc;
    if (task.dueDate) createPayload.due_date = new Date(task.dueDate + 'T23:59:59').getTime();
    if (startDateMs && !isNaN(startDateMs)) createPayload.start_date = startDateMs;
    if (clickupAssigneeIds.length > 0) createPayload.assignees = clickupAssigneeIds;
    if (task.clickupParentTaskId) createPayload.parent = task.clickupParentTaskId;
    if (task.clickupTaskTypeFieldId && task.clickupTaskTypeId) {
      createPayload.custom_fields = [{ id: task.clickupTaskTypeFieldId, value: task.clickupTaskTypeId }];
    }

    const res = await fetch(`https://api.clickup.com/api/v2/list/${task.clickupListId}/task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token },
      body: JSON.stringify(createPayload),
    });
    if (res.ok) {
      const clickupTask = await res.json();
      task.clickupTaskId = clickupTask.id;
      task.clickupUrl = clickupTask.url;
      if (initialDesc) {
        task.lastSyncedClickupDescHash = typeof clickupTask.description === 'string'
          ? (hashClickupDescription(clickupTask.description) || hashClickupDescription(initialDesc))
          : hashClickupDescription(initialDesc);
      }

      if (zenflowTrackedMs >= 1000 && taskUser) {
        await postClickupTimeEntry({
          clickupTaskId: clickupTask.id,
          durationMs: zenflowTrackedMs,
          taskUser,
          callerUserId,
          callerToken: callerToken || token,
        });
      }

      if (task.clickupTaskTypeFieldId && task.clickupTaskTypeId) {
        await fetch(`https://api.clickup.com/api/v2/task/${clickupTask.id}/field/${task.clickupTaskTypeFieldId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: token },
          body: JSON.stringify({ value: task.clickupTaskTypeId }),
        }).catch(() => {});
      }

      saveStore(store);
      dbSaveTask(task).catch(e => console.error('Firestore save task err:', e));
      broadcastEvent('task_updated', task);
    } else {
      console.warn(`[ClickUp Sync] Failed to create task ${task.id} in ClickUp:`, await res.text());
    }
  } catch (err) {
    console.warn(`[ClickUp Sync] Error creating task ${task.id}:`, err);
  }
}



const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function autoArchiveDoneTasks(): boolean {
  const now = Date.now();
  let changed = false;
  const newlyArchived: Task[] = [];

  for (const task of store.tasks) {
    if (task.status === 'done') {
      const completionTime = task.completedAt
        ? new Date(task.completedAt).getTime()
        : new Date(task.updatedAt || task.createdAt).getTime();

      if (!isNaN(completionTime) && now - completionTime >= SEVEN_DAYS_MS) {
        task.status = 'archived';
        task.updatedAt = new Date().toISOString();
        if (!task.activityLog) task.activityLog = [];
        task.activityLog.unshift({
          id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: new Date().toISOString(),
          action: 'status_change',
          from: 'done',
          to: 'archived',
          details: 'Auto-archived after 7 days in Done',
        });
        if (task.activityLog.length > 15) {
          task.activityLog = task.activityLog.slice(0, 15);
        }
        changed = true;
        newlyArchived.push(task);
        appendAuditLog({
          category: 'system',
          action: 'task_auto_archived',
          targetId: task.id,
          targetType: 'task',
          from: 'done',
          to: 'archived',
          details: `Task "${task.title}" auto-archived after 7 days in Done`,
          metadata: { userId: task.userId },
        });
      }
    }
  }

  if (changed) {
    saveStore(store);
    dbBatchSaveTasks(newlyArchived).catch(e =>
      console.error('[Auto-Archive] Firestore batch save error:', e)
    );
    broadcastEvent('tasks_reordered', newlyArchived);
    console.log(`[Auto-Archive] Automatically archived ${newlyArchived.length} completed task(s) older than 7 days.`);
  }

  return changed;
}

// Background sweep running every hour
setInterval(autoArchiveDoneTasks, 60 * 60 * 1000).unref();

// Debounce guard for per-request calls — skips the O(N) scan if the sweep ran within the last 60 seconds
let lastArchiveSweepMs = 0;
const ARCHIVE_DEBOUNCE_MS = 60_000;
function maybeArchive(): void {
  const now = Date.now();
  if (now - lastArchiveSweepMs < ARCHIVE_DEBOUNCE_MS) return;
  lastArchiveSweepMs = now;
  autoArchiveDoneTasks();
}

async function processClickupWebhookEvent(params: {
  taskId: string;
  eventType: string;
  historyItems: any[];
  rawBody: any;
  ip?: string;
}): Promise<void> {
  const { taskId, eventType, historyItems, rawBody, ip } = params;
  if (!taskId) {
    appendAuditLog({
      category: 'webhook',
      action: 'clickup_webhook_ping',
      actor: { ip },
      targetId: 'workspace',
      targetType: 'webhook',
      details: `ClickUp webhook event received without task_id: ${eventType}`,
      metadata: { eventType, rawBody },
    });
    return;
  }

  const matchingTasks = store.tasks.filter(t => t.clickupTaskId === taskId);
  if (matchingTasks.length === 0) return;

  const existingTask = matchingTasks[0];
  if (eventType === 'taskDeleted') {
    appendAuditLog({
      category: 'webhook',
      action: 'clickup_task_deleted_preserved',
      actor: { ip },
      targetId: existingTask.id,
      targetType: 'task',
      details: `ClickUp deleted task "${existingTask.title}" (${taskId}), preserved in ZenFlow.`,
      metadata: { clickupTaskId: taskId },
    });
    return;
  }

  let clickupTaskData: any = null;
  const assignees = getTaskAssigneeIdsServer(existingTask);
  const assignedUser = assignees[0] ? store.users.find(u => u.id === assignees[0]) : undefined;
  const userWithKey = store.users.find(u => u.clickupApiKey);
  const token = (assignedUser?.clickupApiKey || userWithKey?.clickupApiKey)?.trim();

  if (token) {
    try {
      const cRes = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
        headers: { Authorization: token },
      });
      if (cRes.ok) clickupTaskData = await cRes.json();
    } catch (e) {
      console.warn(`[ClickUp Webhook] Could not fetch ClickUp task ${taskId}:`, e);
    }
  }

  let hasDivergence = false;
  let divergenceReason = '';

  const expectedClickupStatus = ZENFLOW_TO_CLICKUP_STATUS[existingTask.status] || 'to do';
  let cuStatusRaw: string | null = null;
  const statusItem = historyItems.find((h: any) => h.field === 'status');
  if (statusItem?.after) {
    cuStatusRaw = typeof statusItem.after === 'string'
      ? statusItem.after.toLowerCase().trim()
      : (statusItem.after?.status || '').toLowerCase().trim();
  } else if (clickupTaskData?.status?.status) {
    cuStatusRaw = (clickupTaskData.status.status || '').toLowerCase().trim();
  }
  if (cuStatusRaw && cuStatusRaw !== expectedClickupStatus.toLowerCase()) {
    hasDivergence = true;
    divergenceReason = `Status on ClickUp ("${cuStatusRaw}") differs from ZenFlow ("${existingTask.status}")`;
  }

  const expectedClickupIds = new Set(
    assignees
      .map(id => store.users.find(u => u.id === id)?.clickupUserId)
      .filter((v): v is string => Boolean(v))
  );
  let cuAssigneeId: string | null = null;
  const assigneeItem = historyItems.find((h: any) => h.field === 'assignee');
  if (assigneeItem?.after) {
    cuAssigneeId = typeof assigneeItem.after === 'object'
      ? (assigneeItem.after.id ? String(assigneeItem.after.id) : null)
      : String(assigneeItem.after);
  } else if (clickupTaskData?.assignees?.[0]) {
    cuAssigneeId = String(clickupTaskData.assignees[0].id);
  }
  if (expectedClickupIds.size > 0 && cuAssigneeId && !expectedClickupIds.has(cuAssigneeId)) {
    hasDivergence = true;
    divergenceReason = `Assignee on ClickUp (${cuAssigneeId}) differs from ZenFlow assignees`;
  }

  if (existingTask.dueDate && clickupTaskData?.due_date !== undefined) {
    const expectedDueMs = new Date(existingTask.dueDate + 'T23:59:59').getTime();
    const actualDueMs = Number(clickupTaskData.due_date);
    if (!isNaN(actualDueMs) && Math.abs(expectedDueMs - actualDueMs) > 86400000) {
      hasDivergence = true;
      divergenceReason = `Due date on ClickUp differs from ZenFlow (${existingTask.dueDate})`;
    }
  }

  if (hasDivergence && token) {
    syncTaskToClickUp(existingTask, token, assignedUser).catch(e =>
      console.error('[ClickUp Webhook] Error pushing authoritative state to ClickUp:', e)
    );
    appendAuditLog({
      category: 'webhook',
      action: 'zenflow_source_of_truth_asserted',
      actor: { ip },
      targetId: existingTask.id,
      targetType: 'task',
      details: `ClickUp diverged from ZenFlow (${divergenceReason}). ZenFlow authoritative state pushed to ClickUp.`,
      metadata: { clickupTaskId: taskId, divergenceReason },
    });
    return;
  }

  const timeItem = historyItems.find((h: any) => h.field === 'time_spent' || h.field === 'time_tracked');
  if (timeItem?.after !== undefined) {
    const parsedMs = Number(timeItem.after);
    if (!isNaN(parsedMs) && parsedMs > (existingTask.inProgressDurationMs || 0)) {
      existingTask.inProgressDurationMs = parsedMs;
      existingTask.updatedAt = new Date().toISOString();
      const activityEntries = Array.isArray(existingTask.activityLog) ? [...existingTask.activityLog] : [];
      activityEntries.unshift({
        id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toISOString(),
        action: 'billable_adjusted',
        details: `Tracked duration synced to ${formatBillableHoursServer(parsedMs)} from ClickUp`,
      });
      existingTask.activityLog = activityEntries.slice(0, 15);
      saveStore(store);
      dbSaveTask(existingTask).catch(e => console.error('Firestore save err:', e));
      broadcastEvent('task_updated', existingTask);
    }
  }
}

async function startServer() {
  const app = express();
  app.set('case sensitive routing', true);

  // Initialize Firestore if credentials are provided, or fall back safely
  await initFirestore();

  // Trust first proxy hop in containerized cloud environments (Railway, Cloud Run, Nixpacks)
  app.set('trust proxy', 1);

  // HTTP Egress Compression for payloads > 1KB (excluding SSE streams)
  app.use(
    compression({
      filter: (req: Request, res: Response) => {
        if (req.headers['x-no-compression'] || req.path === '/api/events') {
          return false;
        }
        return compression.filter(req, res);
      },
      threshold: 1024,
    })
  );

  // Security & Permissions-Policy middleware
  // Explicitly set standards-compliant security headers and Permissions-Policy
  app.use((_req: Request, res: Response, next) => {
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://apis.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://lh3.googleusercontent.com https://*.googleusercontent.com; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://api.clickup.com; frame-src 'self' https://*.firebaseapp.com https://accounts.google.com; frame-ancestors 'none';"
    );
    next();
  });
  // Structured JSON request logger — fires async after response; zero event-loop blocking
  // Excludes /api/events SSE to avoid log spam from long-lived persistent connections
  app.use((req: Request, res: Response, next) => {
    const t0 = Date.now();
    res.on('finish', () => {
      if (req.path.startsWith('/api/') && req.path !== '/api/events') {
        console.log(JSON.stringify({
          method: req.method,
          path: req.path,
          status: res.statusCode,
          ms: Date.now() - t0,
          ip: req.ip,
        }));
      }
    });
    next();
  });

  app.use(express.json({ limit: '1mb', verify: (req, _res, buffer) => {
    if (req.url?.split('?')[0].replace(/\/+$/, '') === '/api/clickup/webhook') {
      (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
    }
  } }));

  // Sliding-window rate limiters for sensitive endpoints (prevent DoS and quota depletion)
  const authLimiter = createRateLimiter(20, 60 * 1000); // 20 login attempts per minute per IP
  const firestoreLimiter = createRateLimiter(10, 60 * 1000); // 10 sync/credential submissions per minute per IP

  // Initialize and load database records from Firestore
  await syncFromFirestore();
  autoArchiveDoneTasks();
  await loadRecentAuditLogs();
  await webhookRegistry.load(adminDb);
  const savedWebhook = webhookRegistry.latest();
  registeredWebhookId = savedWebhook?.id || null;
  activeWebhookEndpoint = savedWebhook?.endpoint || null;

  // Exchange a verified Firebase ID token for an HttpOnly, same-origin SSE/API cookie.
  app.post('/api/auth/session', authLimiter, async (req: Request, res: Response) => {
    if (!sameOriginMutation(req)) return res.status(403).json({ error: 'Invalid request origin' });
    const token = req.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
    if (!token) return res.status(401).json({ error: 'Google identity required' });
    try {
      const identity = await verifyIdentity(token);
      if (!identity.email_verified || identity.firebase?.sign_in_provider !== 'google.com' || identity.exp * 1000 <= Date.now()) return res.status(401).json({ error: 'Verified Google identity required' });
      const user = store.users.find(member => member.email.toLowerCase() === identity.email?.toLowerCase());
      if (!user) return res.status(403).json({ error: 'Account not registered in ZenFlow' });
      res.setHeader('Cache-Control', 'no-store');
      res.cookie(SESSION_COOKIE, token, { httpOnly: true, secure: req.secure, sameSite: 'strict', path: '/api', maxAge: Math.max(0, identity.exp * 1000 - Date.now()) });
      res.json({ user: redactPayload(user) });
    } catch { res.status(401).json({ error: 'Google session expired or invalid' }); }
  });
  app.delete('/api/auth/session', (req: Request, res: Response) => {
    if (!sameOriginMutation(req)) return res.status(403).json({ error: 'Invalid request origin' });
    res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: req.secure, sameSite: 'strict', path: '/api' });
    res.status(204).end();
  });
  app.use('/api', createApiSecurity({ getStore: () => store, verify: verifyIdentity }));

  // API: Health check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // API: Get entire state with ETag conditional validation (HTTP 304 Not Modified)
  app.get('/api/state', (req: Request, res: Response) => {
    maybeArchive();
    const etag = `W/"zenflow-rev-${stateRevision}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');

    deduplicateUsers(store);

    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    res.json({
      users: store.users,
      tasks: store.tasks,
      parentTasks: store.parentTasks || [],
    });
  });

  // API: Simple Login / Register with Name, Role, Email (enforces existing account requirement)
  app.post('/api/auth/login', authLimiter, (req: Request, res: Response) => {
    const { name, email, role } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const cleanEmail = sanitizeString(email).toLowerCase();
    const cleanName = name ? sanitizeString(name) : '';
    const cleanRole = (role === 'design' ? 'design' : 'content') as 'content' | 'design';

    deduplicateUsers(store);

    let existingUser = store.users.find(u => u.email.toLowerCase() === cleanEmail);

    if (existingUser) {
      let changed = false;
      if (cleanName && existingUser.name !== cleanName) {
        existingUser.name = cleanName;
        changed = true;
      }
      if (changed) {
        saveStore(store);
        dbSaveUser(existingUser).catch(e => console.error('Firestore user update err:', e));
        broadcastEvent('user_updated', existingUser);
      }
      appendAuditLog({
        category: 'security',
        action: 'user_login',
        actor: { id: existingUser.id, name: existingUser.name, email: existingUser.email, ip: req.ip },
        targetId: existingUser.id,
        targetType: 'user',
        details: `User "${existingUser.name}" logged in successfully (${cleanEmail})`,
      });
      return res.json({ user: existingUser, isNew: false });
    }

    // Only allow login if user exists. Exception: bootstrap superadmin
    if (cleanEmail === SUPERADMIN_EMAIL.toLowerCase()) {
      const superadmin: User = {
        id: 'user-superadmin-kiran',
        name: cleanName || 'Kiran S',
        email: SUPERADMIN_EMAIL,
        role: cleanRole,
        avatarColor: 'from-blue-600 to-indigo-600',
        isCreativeDirector: true,
        createdAt: new Date().toISOString(),
      };
      store.users.unshift(superadmin);
      saveStore(store);
      dbSaveUser(superadmin).catch(e => console.error('Firestore user create err:', e));
      broadcastEvent('user_created', superadmin);
      appendAuditLog({
        category: 'security',
        action: 'superadmin_bootstrapped',
        actor: { id: superadmin.id, name: superadmin.name, email: superadmin.email, ip: req.ip },
        targetId: superadmin.id,
        targetType: 'user',
        details: `Superadmin bootstrap account initialized for ${SUPERADMIN_EMAIL}`,
      });
      return res.status(201).json({ user: superadmin, isNew: true });
    }

    // Unregistered accounts cannot log in
    appendAuditLog({
      category: 'security',
      action: 'unauthorized_login_attempt',
      actor: { email: cleanEmail, ip: req.ip },
      targetId: 'auth',
      targetType: 'workspace',
      details: `Unauthorized login rejected for unregistered email: ${cleanEmail}`,
    });
    return res.status(403).json({
      error: 'Account not registered. Only team members with an existing ZenFlow account are authorized to log in. Please contact kiran.s@zensciences.com to be added.',
    });
  });

  // API: Verify if an email is registered in ZenFlow
  app.post('/api/auth/verify-email', (req: Request, res: Response) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const cleanEmail = sanitizeString(email).toLowerCase();
    deduplicateUsers(store);
    const user = store.users.find(u => u.email.toLowerCase() === cleanEmail);
    if (!user) {
      return res.status(404).json({ error: 'No account registered with this email address' });
    }
    res.json({ user });
  });

  // API: Get all users with ETag conditional validation (HTTP 304 Not Modified)
  app.get('/api/users', (req: Request, res: Response) => {
    deduplicateUsers(store);
    const etag = `W/"zenflow-users-${stateRevision}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');

    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    res.json(store.users);
  });

  // API: Create a user explicitly (Superadmin & Creative Directors)
  app.post('/api/users', (req: Request, res: Response) => {
    const {
      name,
      email,
      role,
      isAdministrator,
      isBusinessLead,
      isCreativeDirector,
      isClusterLead,
      isTeamLead,
      isAccountManager,
      isContentLead,
      isArtDirector,
      isContentSpecialist,
      isBrandDesigner,
      designation,
      creativeDirectorId,
      clusterLeadId,
      clickupUserId,
      clickupUsername,
    } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    const cleanEmail = sanitizeString(email).toLowerCase();
    const cleanName = sanitizeString(name);
    const VALID_ROLES = ['content', 'design', 'account_manager', 'administrator'] as const;
    const cleanRole = role && (VALID_ROLES as readonly string[]).includes(role) ? role : (role === 'none' ? undefined : undefined);
    const effectiveIsAdmin = cleanRole === 'administrator' || !!isAdministrator;

    if (!cleanEmail || !cleanName) {
      return res.status(400).json({ error: 'Valid name and email are required' });
    }

    const existingUser = store.users.find(u => u.email.toLowerCase() === cleanEmail);
    if (existingUser) {
      existingUser.name = cleanName;
      existingUser.role = cleanRole;
      if (cleanRole === 'administrator') existingUser.isAdministrator = true;
      else if (isAdministrator !== undefined) existingUser.isAdministrator = !!isAdministrator;
      if (isBusinessLead !== undefined) existingUser.isBusinessLead = !!isBusinessLead;
      if (isCreativeDirector !== undefined) existingUser.isCreativeDirector = !!isCreativeDirector;
      if (isClusterLead !== undefined) existingUser.isClusterLead = !!isClusterLead;
      if (isTeamLead !== undefined) existingUser.isTeamLead = !!isTeamLead;
      if (isAccountManager !== undefined) existingUser.isAccountManager = !!isAccountManager;
      if (isContentLead !== undefined) existingUser.isContentLead = !!isContentLead;
      if (isArtDirector !== undefined) existingUser.isArtDirector = !!isArtDirector;
      if (isContentSpecialist !== undefined) existingUser.isContentSpecialist = !!isContentSpecialist;
      if (isBrandDesigner !== undefined) existingUser.isBrandDesigner = !!isBrandDesigner;
      if (designation !== undefined) existingUser.designation = designation ? sanitizeString(designation) : undefined;
      if (creativeDirectorId !== undefined) existingUser.creativeDirectorId = creativeDirectorId ? sanitizeString(creativeDirectorId) : undefined;
      if (clusterLeadId !== undefined) existingUser.clusterLeadId = clusterLeadId ? sanitizeString(clusterLeadId) : undefined;
      if (clickupUserId !== undefined) existingUser.clickupUserId = clickupUserId ? sanitizeString(clickupUserId) : undefined;
      if (clickupUsername !== undefined) existingUser.clickupUsername = clickupUsername ? sanitizeString(clickupUsername) : undefined;
      saveStore(store);
      dbSaveUser(existingUser).catch(e => console.error('Firestore user update err:', e));
      broadcastEvent('user_updated', existingUser);
      appendAuditLog({
        category: 'user',
        action: 'user_updated',
        actor: { ip: req.ip },
        targetId: existingUser.id,
        targetType: 'user',
        details: `User profile / role updated for "${existingUser.name}" (${cleanEmail})`,
        metadata: { role: cleanRole, isCreativeDirector: existingUser.isCreativeDirector },
      });
      return res.json(existingUser);
    }

    const colorIndex = store.users.length % AVATAR_COLORS.length;
    const newUser: User = {
      id: `user-${Date.now()}`,
      name: cleanName,
      email: cleanEmail,
      role: cleanRole,
      avatarColor: AVATAR_COLORS[colorIndex],
      isAdministrator: effectiveIsAdmin,
      isBusinessLead: !!isBusinessLead,
      isCreativeDirector: !!isCreativeDirector,
      isClusterLead: !!isClusterLead,
      isTeamLead: !!isTeamLead,
      isAccountManager: !!isAccountManager,
      isContentLead: !!isContentLead,
      isArtDirector: !!isArtDirector,
      isContentSpecialist: !!isContentSpecialist,
      isBrandDesigner: !!isBrandDesigner,
      designation: designation ? sanitizeString(designation) : undefined,
      creativeDirectorId: creativeDirectorId ? sanitizeString(creativeDirectorId) : undefined,
      clusterLeadId: clusterLeadId ? sanitizeString(clusterLeadId) : undefined,
      clickupUserId: clickupUserId ? sanitizeString(clickupUserId) : undefined,
      clickupUsername: clickupUsername ? sanitizeString(clickupUsername) : undefined,
      createdAt: new Date().toISOString(),
    };

    store.users.push(newUser);
    saveStore(store);
    dbSaveUser(newUser).catch(e => console.error('Firestore user create err:', e));

    broadcastEvent('user_created', newUser);
    appendAuditLog({
      category: 'user',
      action: 'user_created',
      actor: { ip: req.ip },
      targetId: newUser.id,
      targetType: 'user',
      details: `User account created: ${newUser.name} (${newUser.email}) - Role: ${newUser.role}`,
      metadata: { isCreativeDirector: newUser.isCreativeDirector, role: newUser.role },
    });
    res.status(201).json(newUser);
  });

  // API: Update user settings / profile (Superadmin can also correct email addresses)
  app.put('/api/users/:id', async (req: Request, res: Response) => {
    const { id } = req.params;
    const userIndex = store.users.findIndex(u => u.id === id);

    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    const current = store.users[userIndex];
    const {
      name,
      email,
      role,
      isAdministrator,
      isBusinessLead,
      isCreativeDirector,
      isClusterLead,
      isTeamLead,
      isAccountManager,
      isContentLead,
      isArtDirector,
      isContentSpecialist,
      isBrandDesigner,
      designation,
      creativeDirectorId,
      clusterLeadId,
      clickupApiKey,
      selectedClickupSpaceId,
      selectedClickupSpaceName,
      clickupUserId,
      clickupUsername,
    } = req.body;

    const callerId = (req.headers['x-caller-user-id'] as string || '').trim();
    const callerEmail = (req.headers['x-caller-email'] as string || '').trim().toLowerCase();
    const caller = store.users.find(u => u.id === callerId || u.email.toLowerCase() === callerEmail);
    const isCallerSuperadmin = callerEmail === SUPERADMIN_EMAIL.toLowerCase() ||
      caller?.email?.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase() ||
      req.headers['x-is-superadmin'] === 'true';

    // Handle email correction & task remapping
    if (email !== undefined) {
      const cleanEmail = sanitizeString(email).toLowerCase().trim();
      const currentEmail = current.email.toLowerCase().trim();

      if (cleanEmail !== currentEmail) {
        if (!isCallerSuperadmin) {
          return res.status(403).json({ error: 'Only the Superadmin can edit user email addresses' });
        }

        if (currentEmail === SUPERADMIN_EMAIL.toLowerCase()) {
          return res.status(400).json({ error: 'The primary Superadmin email address cannot be modified' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!cleanEmail || !emailRegex.test(cleanEmail)) {
          return res.status(400).json({ error: 'A valid email address is required' });
        }

        // Check if an existing account already exists with the new email
        const existingTargetUser = store.users.find(
          u => u.id !== current.id && u.email.toLowerCase().trim() === cleanEmail
        );

        if (existingTargetUser) {
          // CASE 1: Profile Merge & Task Remapping to existing user with this email
          console.log(`[User Email Remap & Merge] Merging "${current.email}" (${current.id}) into "${existingTargetUser.email}" (${existingTargetUser.id})...`);
          const oldUserId = current.id;
          const oldEmail = current.email;

          // Collect all tasks mapped to the wrong account ID or old email or target email
          const tasksToRemap = store.tasks.filter(
            t => t.userId === oldUserId ||
                 t.userId.toLowerCase() === oldEmail.toLowerCase() ||
                 t.userId.toLowerCase() === cleanEmail
          );

          tasksToRemap.forEach(task => {
            task.userId = existingTargetUser.id;
            task.updatedAt = new Date().toISOString();
            if (!task.activityLog) task.activityLog = [];
            task.activityLog.unshift({
              id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              timestamp: new Date().toISOString(),
              action: 'reassigned',
              from: `${current.name} (${oldEmail})`,
              to: `${existingTargetUser.name} (${cleanEmail})`,
              details: `Task automatically remapped from wrong email (${oldEmail}) to correct email (${cleanEmail}) by Superadmin`,
            });
          });

          if (tasksToRemap.length > 0) {
            await dbBatchSaveTasks(tasksToRemap);
          }

          // Merge profile fields into existingTargetUser
          if (name !== undefined) {
            const cleanName = sanitizeString(name);
            if (cleanName) existingTargetUser.name = cleanName;
          }
          const VALID_ROLES = ['content', 'design', 'video', 'ui_ux', 'account_manager', 'administrator'] as const;
          if (role !== undefined && (VALID_ROLES as readonly string[]).includes(role)) {
            existingTargetUser.role = role;
          }
          if (isAdministrator !== undefined) {
            existingTargetUser.isAdministrator = !!isAdministrator;
          }
          if (isCreativeDirector !== undefined) {
            existingTargetUser.isCreativeDirector = !!isCreativeDirector;
          }
          if (isClusterLead !== undefined) {
            existingTargetUser.isClusterLead = !!isClusterLead;
          }
          if (isContentLead !== undefined) {
            existingTargetUser.isContentLead = !!isContentLead;
          }
          if (isArtDirector !== undefined) {
            existingTargetUser.isArtDirector = !!isArtDirector;
          }
          if (creativeDirectorId !== undefined) {
            existingTargetUser.creativeDirectorId = creativeDirectorId ? sanitizeString(creativeDirectorId) : undefined;
          }
          if (clusterLeadId !== undefined) {
            existingTargetUser.clusterLeadId = clusterLeadId ? sanitizeString(clusterLeadId) : undefined;
          }

          // Remove the obsolete user record
          store.users = store.users.filter(u => u.id !== oldUserId);
          await dbDeleteUser(oldUserId);

          saveStore(store);
          await dbSaveUser(existingTargetUser);

          appendAuditLog({
            category: 'user',
            action: 'user_merged_and_tasks_remapped',
            actor: { ip: req.ip, email: callerEmail },
            targetId: existingTargetUser.id,
            targetType: 'user',
            details: `Superadmin corrected email from "${oldEmail}" to "${cleanEmail}". Merged profile into "${existingTargetUser.name}" and remapped ${tasksToRemap.length} task(s).`,
            metadata: {
              fromUserId: oldUserId,
              toUserId: existingTargetUser.id,
              fromEmail: oldEmail,
              toEmail: cleanEmail,
              remappedTasksCount: tasksToRemap.length,
            },
          });

          broadcastEvent('user_deleted', { id: oldUserId });
          broadcastEvent('user_updated', existingTargetUser);
          if (tasksToRemap.length > 0) {
            broadcastEvent('tasks_reordered', tasksToRemap);
          }
          broadcastEvent('sync_all', { users: store.users, tasks: store.tasks });

          return res.json({
            ...existingTargetUser,
            merged: true,
            deletedUserId: oldUserId,
            remappedTasksCount: tasksToRemap.length,
            remappedToUserId: existingTargetUser.id,
          });
        }

        // CASE 2: No conflicting account exists. Update email & remap any orphan tasks
        const oldEmail = current.email;
        current.email = cleanEmail;

        const orphanTasks = store.tasks.filter(
          t => t.userId.toLowerCase() === cleanEmail || t.userId.toLowerCase() === oldEmail.toLowerCase()
        );
        orphanTasks.forEach(task => {
          task.userId = current.id;
          task.updatedAt = new Date().toISOString();
        });
        if (orphanTasks.length > 0) {
          await dbBatchSaveTasks(orphanTasks);
        }

        appendAuditLog({
          category: 'user',
          action: 'user_email_corrected',
          actor: { ip: req.ip, email: callerEmail },
          targetId: current.id,
          targetType: 'user',
          details: `Superadmin corrected email for "${current.name}" from ${oldEmail} to ${cleanEmail}. (Remapped orphan tasks: ${orphanTasks.length})`,
          metadata: { oldEmail, newEmail: cleanEmail, remappedTasksCount: orphanTasks.length },
        });

        if (orphanTasks.length > 0) {
          broadcastEvent('tasks_reordered', orphanTasks);
        }
      }
    }

    if (name !== undefined) {
      const cleanName = sanitizeString(name);
      if (cleanName) current.name = cleanName;
    }
    const VALID_ROLES = ['content', 'design', 'account_manager', 'administrator'] as const;
    if (role !== undefined) {
      if ((VALID_ROLES as readonly string[]).includes(role)) {
        current.role = role;
      } else if (role === 'none' || role === '') {
        current.role = undefined;
      }
    }
    if (isAdministrator !== undefined) {
      current.isAdministrator = !!isAdministrator;
    }
    if (current.email.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase()) {
      current.isCreativeDirector = true;
    } else if (isCreativeDirector !== undefined) {
      current.isCreativeDirector = !!isCreativeDirector;
    }
    if (isClusterLead !== undefined) {
      current.isClusterLead = !!isClusterLead;
    }
    if (isTeamLead !== undefined) {
      current.isTeamLead = !!isTeamLead;
    }
    if (isAccountManager !== undefined) {
      current.isAccountManager = !!isAccountManager;
    }
    if (isContentLead !== undefined) {
      current.isContentLead = !!isContentLead;
    }
    if (isArtDirector !== undefined) {
      current.isArtDirector = !!isArtDirector;
    }
    if (isBusinessLead !== undefined) {
      current.isBusinessLead = !!isBusinessLead;
    }
    if (isContentSpecialist !== undefined) {
      current.isContentSpecialist = !!isContentSpecialist;
    }
    if (isBrandDesigner !== undefined) {
      current.isBrandDesigner = !!isBrandDesigner;
    }
    if (designation !== undefined) {
      current.designation = designation ? sanitizeString(designation) : undefined;
    }
    if (current.role === 'administrator') {
      current.isAdministrator = true;
    }
    if (creativeDirectorId !== undefined) {
      current.creativeDirectorId = creativeDirectorId ? sanitizeString(creativeDirectorId) : undefined;
    }
    if (clusterLeadId !== undefined) {
      current.clusterLeadId = clusterLeadId ? sanitizeString(clusterLeadId) : undefined;
    }
    if (clickupApiKey !== undefined) {
      current.clickupApiKey = clickupApiKey ? String(clickupApiKey).trim() : undefined;
    }
    if (selectedClickupSpaceId !== undefined) {
      current.selectedClickupSpaceId = selectedClickupSpaceId ? sanitizeString(selectedClickupSpaceId) : undefined;
    }
    if (selectedClickupSpaceName !== undefined) {
      current.selectedClickupSpaceName = selectedClickupSpaceName ? sanitizeString(selectedClickupSpaceName) : undefined;
    }
    if (clickupUserId !== undefined) {
      current.clickupUserId = clickupUserId ? sanitizeString(clickupUserId) : undefined;
    }
    if (clickupUsername !== undefined) {
      current.clickupUsername = clickupUsername ? sanitizeString(clickupUsername) : undefined;
    }

    saveStore(store);
    dbSaveUser(current).catch(e => console.error('Firestore user update err:', e));
    broadcastEvent('user_updated', current);
    appendAuditLog({
      category: 'user',
      action: 'user_privilege_modified',
      actor: { ip: req.ip },
      targetId: current.id,
      targetType: 'user',
      details: `User profile / privileges modified for "${current.name}"`,
      metadata: { role: current.role, isCreativeDirector: current.isCreativeDirector },
    });
    res.json(current);
  });

  // API: Explicit task remapping tool (Superadmin only)
  app.post('/api/users/remap-tasks', async (req: Request, res: Response) => {
    const callerId = (req.headers['x-caller-user-id'] as string || '').trim();
    const callerEmail = (req.headers['x-caller-email'] as string || '').trim().toLowerCase();
    const caller = store.users.find(u => u.id === callerId || u.email.toLowerCase() === callerEmail);
    const isCallerSuperadmin = callerEmail === SUPERADMIN_EMAIL.toLowerCase() ||
      caller?.email?.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase() ||
      req.headers['x-is-superadmin'] === 'true';

    if (!isCallerSuperadmin) {
      return res.status(403).json({ error: 'Only the Superadmin can remap user tasks' });
    }

    const { fromUserId, fromEmail, toUserId, deleteSourceUser } = req.body;

    if (!toUserId) {
      return res.status(400).json({ error: 'Target user ID (toUserId) is required' });
    }

    const targetUser = store.users.find(u => u.id === toUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    const cleanFromEmail = fromEmail ? sanitizeString(fromEmail).toLowerCase().trim() : '';
    const cleanFromUserId = fromUserId ? sanitizeString(fromUserId).trim() : '';

    if (!cleanFromUserId && !cleanFromEmail) {
      return res.status(400).json({ error: 'Either fromUserId or fromEmail must be provided' });
    }

    const sourceUser = store.users.find(
      u => (cleanFromUserId && u.id === cleanFromUserId) || (cleanFromEmail && u.email.toLowerCase() === cleanFromEmail)
    );
    const effectiveFromId = sourceUser ? sourceUser.id : cleanFromUserId;
    const effectiveFromEmail = sourceUser ? sourceUser.email.toLowerCase() : cleanFromEmail;

    if (targetUser.id === effectiveFromId) {
      return res.status(400).json({ error: 'Source and target users cannot be the same' });
    }

    const tasksToRemap = store.tasks.filter(
      t => (effectiveFromId && t.userId === effectiveFromId) ||
           (effectiveFromEmail && t.userId.toLowerCase() === effectiveFromEmail)
    );

    const fromLabel = sourceUser ? `${sourceUser.name} (${sourceUser.email})` : (effectiveFromEmail || effectiveFromId);

    tasksToRemap.forEach(task => {
      task.userId = targetUser.id;
      task.updatedAt = new Date().toISOString();
      if (!task.activityLog) task.activityLog = [];
      task.activityLog.unshift({
        id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toISOString(),
        action: 'reassigned',
        from: fromLabel,
        to: `${targetUser.name} (${targetUser.email})`,
        details: `Task manually remapped from ${fromLabel} to ${targetUser.name} by Superadmin`,
      });
    });

    if (tasksToRemap.length > 0) {
      await dbBatchSaveTasks(tasksToRemap);
    }

    if (deleteSourceUser && sourceUser && sourceUser.email.toLowerCase() !== SUPERADMIN_EMAIL.toLowerCase()) {
      store.users = store.users.filter(u => u.id !== sourceUser.id);
      await dbDeleteUser(sourceUser.id);
      broadcastEvent('user_deleted', { id: sourceUser.id });
    }

    saveStore(store);

    appendAuditLog({
      category: 'user',
      action: 'tasks_manually_remapped',
      actor: { ip: req.ip, email: callerEmail },
      targetId: targetUser.id,
      targetType: 'user',
      details: `Superadmin remapped ${tasksToRemap.length} task(s) from ${fromLabel} to ${targetUser.name} (${targetUser.email})`,
      metadata: {
        fromUserId: effectiveFromId,
        fromEmail: effectiveFromEmail,
        toUserId: targetUser.id,
        toEmail: targetUser.email,
        remappedCount: tasksToRemap.length,
        deletedSourceUser: !!(deleteSourceUser && sourceUser),
      },
    });

    if (tasksToRemap.length > 0) {
      broadcastEvent('tasks_reordered', tasksToRemap);
    }
    broadcastEvent('sync_all', { users: store.users, tasks: store.tasks });

    res.json({
      success: true,
      remappedCount: tasksToRemap.length,
      targetUser,
      deletedSourceUserId: (deleteSourceUser && sourceUser) ? sourceUser.id : undefined,
    });
  });

  // API: Delete a user and all tasks associated with them
  app.delete('/api/users/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const userIndex = store.users.findIndex(u => u.id === id);

    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    const removedUser = store.users.splice(userIndex, 1)[0];

    // Remove deleted user from multi-assignee tasks; delete tasks where they were the sole assignee
    const deletedTaskIds: string[] = [];
    const updatedSharedTasks: Task[] = [];
    store.tasks = store.tasks.filter(t => {
      const assignees = getTaskAssigneeIdsServer(t);
      if (!assignees.includes(id)) return true;
      const remaining = assignees.filter(uid => uid !== id);
      if (remaining.length === 0) {
        deletedTaskIds.push(t.id);
        return false;
      }
      t.assigneeIds = remaining;
      t.userId = remaining[0];
      t.updatedAt = new Date().toISOString();
      updatedSharedTasks.push(t);
      return true;
    });

    saveStore(store);

    // Asynchronously delete user and tasks from Firestore if connected
    dbDeleteUser(removedUser.id).catch(e => console.error('Firestore user delete err:', e));
    if (deletedTaskIds.length > 0) {
      dbBatchDeleteTasks(deletedTaskIds).catch(e => console.error('Firestore batch delete tasks err:', e));
    }
    if (updatedSharedTasks.length > 0) {
      dbBatchSaveTasks(updatedSharedTasks).catch(e => console.error('Firestore batch save shared tasks err:', e));
      broadcastEvent('tasks_reordered', updatedSharedTasks);
    }

    broadcastEvent('user_deleted', { id: removedUser.id, taskIds: deletedTaskIds });
    appendAuditLog({
      category: 'user',
      action: 'user_deleted',
      actor: { ip: req.ip },
      targetId: removedUser.id,
      targetType: 'user',
      details: `User account "${removedUser.name}" (${removedUser.email}) deleted and ${deletedTaskIds.length} associated task(s) purged`,
      metadata: { deletedTaskCount: deletedTaskIds.length },
    });
    res.json({
      success: true,
      deletedUser: removedUser,
      deletedTaskCount: deletedTaskIds.length,
    });
  });

  // API: Get all tasks with ETag conditional validation (HTTP 304 Not Modified)
  app.get('/api/tasks', (req: Request, res: Response) => {
    maybeArchive();
    const etag = `W/"zenflow-tasks-${stateRevision}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');

    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    res.json(store.tasks);
  });

  // API: Create parent task in ClickUp + Content and/or Design pipeline subtasks in ZenFlow & ClickUp
  app.post('/api/tasks/pipeline-bundle', async (req: Request, res: Response) => {
    const caller = res.locals.caller;
    if (!isCallerAuthorizedForPipeline(caller)) {
      return res.status(403).json({ error: 'Only Accounts team members and users with authorized special roles can create pipeline tasks' });
    }

    const {
      title,
      description,
      brandGuidelines,
      dueDate,
      client,
      project,
      priority,
      disciplines,
      disciplineSpecs,
      clickupSpaceId,
      clickupSpaceName,
      clickupFolderId,
      clickupFolderName,
      clickupListId,
      clickupListName,
      clickupTaskType,
      clickupTaskTypeId,
      clickupTaskTypeFieldId,
    } = req.body;

    const cleanTitle = sanitizeString(title);
    if (!cleanTitle) {
      return res.status(400).json({ error: 'Task title is required' });
    }

    const validDisciplines = Array.isArray(disciplines)
      ? Array.from(new Set(disciplines.filter((d: unknown): d is 'content' | 'design' => d === 'content' || d === 'design')))
      : [];
    if (validDisciplines.length === 0) {
      return res.status(400).json({ error: 'Select at least one requirement (Content or Design)' });
    }

    const brandCheck = validateHttpUrl(brandGuidelines);
    if (brandCheck.error) {
      return res.status(400).json({ error: `Brand Guidelines: ${brandCheck.error}` });
    }

    const sanitizedDisciplineSpecs: Record<string, Record<string, any> | undefined> = {};
    for (const disc of validDisciplines) {
      const rawSpec = disciplineSpecs && typeof disciplineSpecs === 'object' ? disciplineSpecs[disc] : undefined;
      if (rawSpec !== undefined) {
        const checked = sanitizeDisciplineMetadata(rawSpec);
        if (checked.error) {
          return res.status(400).json({ error: checked.error });
        }
        sanitizedDisciplineSpecs[disc] = checked.value;
      }
    }

    const cleanDescription = description ? sanitizeString(description, 10000) : undefined;
    const cleanBrandGuidelines = brandCheck.value;
    const cleanClient = client ? sanitizeString(client) : (clickupSpaceName ? sanitizeString(clickupSpaceName) : undefined);
    const cleanProject = project ? sanitizeString(project) : (clickupListName ? sanitizeString(clickupListName) : undefined);
    const cleanPriority = ['low', 'medium', 'high'].includes(priority) ? priority : 'medium';
    const cleanDueDate = dueDate ? sanitizeString(dueDate) : undefined;

    const cleanListId = clickupListId ? sanitizeString(clickupListId) : undefined;
    const cleanSpaceId = clickupSpaceId ? sanitizeString(clickupSpaceId) : undefined;
    const cleanSpaceName = clickupSpaceName ? sanitizeString(clickupSpaceName) : undefined;
    const cleanFolderId = clickupFolderId ? sanitizeString(clickupFolderId) : undefined;
    const cleanFolderName = clickupFolderName ? sanitizeString(clickupFolderName) : undefined;
    const cleanListName = clickupListName ? sanitizeString(clickupListName) : undefined;

    const token = (
      caller?.clickupApiKey ||
      (req.headers['x-clickup-api-key'] as string) ||
      store.users.find(u => u.clickupApiKey)?.clickupApiKey ||
      ''
    ).trim();

    const parentTaskId = `parent-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    let clickupParentTaskId: string | undefined;
    let parentClickupUrl: string | undefined;
    let parentDescHash: string | undefined;

    const parentMarkdown = buildParentClickupMarkdown(cleanDescription, cleanBrandGuidelines);
    if (token && cleanListId) {
      try {
        const parentPayload: Record<string, any> = {
          name: cleanTitle,
          status: ZENFLOW_TO_CLICKUP_STATUS.pipeline || 'open',
        };
        if (parentMarkdown) parentPayload.description = parentMarkdown;
        if (cleanDueDate) parentPayload.due_date = new Date(cleanDueDate + 'T23:59:59').getTime();
        if (clickupTaskTypeFieldId && clickupTaskTypeId) {
          parentPayload.custom_fields = [{ id: clickupTaskTypeFieldId, value: clickupTaskTypeId }];
        }
        const pRes = await fetch(`https://api.clickup.com/api/v2/list/${cleanListId}/task`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: token },
          body: JSON.stringify(parentPayload),
        });
        if (pRes.ok) {
          const pData = await pRes.json();
          clickupParentTaskId = pData.id;
          parentClickupUrl = pData.url;
          if (parentMarkdown) {
            parentDescHash = typeof pData.description === 'string'
              ? (hashClickupDescription(pData.description) || hashClickupDescription(parentMarkdown))
              : hashClickupDescription(parentMarkdown);
          }
        } else {
          console.warn('[ClickUp Bundle] Failed to create parent task:', await pRes.text());
        }
      } catch (err) {
        console.warn('[ClickUp Bundle] Parent task error:', err);
      }
    }

    const now = new Date().toISOString();
    const parentTask: ParentTask = {
      id: parentTaskId,
      title: cleanTitle,
      brief: cleanDescription,
      brandGuidelines: cleanBrandGuidelines,
      client: cleanClient,
      project: cleanProject,
      clickupParentTaskId,
      clickupUrl: parentClickupUrl,
      clickupSpaceId: cleanSpaceId,
      clickupSpaceName: cleanSpaceName,
      clickupFolderId: cleanFolderId,
      clickupFolderName: cleanFolderName,
      clickupListId: cleanListId,
      clickupListName: cleanListName,
      lastSyncedClickupDescHash: parentDescHash,
      createdAt: now,
      updatedAt: now,
    };
    if (!Array.isArray(store.parentTasks)) store.parentTasks = [];
    store.parentTasks.push(parentTask);
    dbSaveParentTask(parentTask).catch(e => console.error('Firestore bundle parent save err:', e));

    const createdTasks: Task[] = [];

    for (const disc of validDisciplines) {
      const existingInPipeline = store.tasks.filter(t => t.team === disc && t.status === 'pipeline');
      const maxOrder = existingInPipeline.reduce((max, t) => Math.max(max, t.order ?? 0), -1);
      const discLabel = disc === 'content' ? 'Content' : 'Design';
      const subtaskId = `task-${Date.now()}-${disc.slice(0, 3)}-${Math.random().toString(36).substring(2, 6)}`;
      const discMeta = sanitizedDisciplineSpecs[disc];
      const subMarkdown = buildSubtaskClickupMarkdown(disc, discMeta);

      let clickupTaskId: string | undefined;
      let clickupUrl: string | undefined = parentClickupUrl;
      let subDescHash: string | undefined;

      if (token && cleanListId) {
        try {
          const subPayload: Record<string, any> = {
            name: `${cleanTitle} (${discLabel})`,
            status: ZENFLOW_TO_CLICKUP_STATUS.pipeline || 'open',
          };
          if (clickupParentTaskId) subPayload.parent = clickupParentTaskId;
          if (subMarkdown) subPayload.description = subMarkdown;
          if (cleanDueDate) subPayload.due_date = new Date(cleanDueDate + 'T23:59:59').getTime();
          if (clickupTaskTypeFieldId && clickupTaskTypeId) {
            subPayload.custom_fields = [{ id: clickupTaskTypeFieldId, value: clickupTaskTypeId }];
          }
          const sRes = await fetch(`https://api.clickup.com/api/v2/list/${cleanListId}/task`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: token },
            body: JSON.stringify(subPayload),
          });
          if (sRes.ok) {
            const sData = await sRes.json();
            clickupTaskId = sData.id;
            clickupUrl = sData.url || parentClickupUrl;
            if (subMarkdown) {
              subDescHash = typeof sData.description === 'string'
                ? (hashClickupDescription(sData.description) || hashClickupDescription(subMarkdown))
                : hashClickupDescription(subMarkdown);
            }
          } else {
            console.warn(`[ClickUp Bundle] Failed to create ${discLabel} subtask:`, await sRes.text());
          }
        } catch (err) {
          console.warn(`[ClickUp Bundle] ${discLabel} subtask error:`, err);
        }
      }

      const subtask: Task = {
        id: subtaskId,
        userId: undefined,
        assigneeIds: [],
        team: disc,
        title: validDisciplines.length > 1 ? `${cleanTitle} (${discLabel})` : cleanTitle,
        description: cleanDescription,
        brandGuidelines: cleanBrandGuidelines,
        lastSyncedClickupDescHash: subDescHash,
        dueDate: cleanDueDate,
        cognitiveLoad: 'medium',
        status: 'pipeline',
        order: maxOrder + 1,
        createdAt: now,
        updatedAt: now,
        isSubtask: true,
        parentTaskId,
        parentTaskTitle: cleanTitle,
        client: cleanClient,
        project: cleanProject,
        priority: cleanPriority,
        disciplineMetadata: discMeta,
        clickupTaskId,
        clickupParentTaskId,
        clickupSpaceId: cleanSpaceId,
        clickupSpaceName: cleanSpaceName,
        clickupFolderId: cleanFolderId,
        clickupFolderName: cleanFolderName,
        clickupListId: cleanListId,
        clickupListName: cleanListName,
        clickupUrl,
        clickupTaskType: clickupTaskType ? sanitizeString(clickupTaskType) : undefined,
        clickupTaskTypeId: clickupTaskTypeId ? sanitizeString(clickupTaskTypeId) : undefined,
        clickupTaskTypeFieldId: clickupTaskTypeFieldId ? sanitizeString(clickupTaskTypeFieldId) : undefined,
        activityLog: [
          {
            id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            timestamp: now,
            action: 'created',
            to: 'pipeline',
            actorName: caller?.name,
            details: `Created ${discLabel} subtask under "${cleanTitle}" in pipeline (Unassigned)`,
          },
        ],
      };

      store.tasks.push(subtask);
      createdTasks.push(subtask);
      dbSaveTask(subtask).catch(e => console.error('Firestore bundle task save err:', e));
      broadcastEvent('task_created', subtask);
      appendAuditLog({
        category: 'task',
        action: 'task_created',
        actor: { id: caller?.id, name: caller?.name, email: caller?.email, ip: req.ip },
        targetId: subtask.id,
        targetType: 'task',
        details: `Pipeline ${discLabel} subtask "${subtask.title}" created under parent "${cleanTitle}"`,
        metadata: { parentTaskId, clickupParentTaskId, clickupTaskId, team: disc },
      });
    }

    saveStore(store);
    res.status(201).json({
      parentTaskId,
      parentTaskTitle: cleanTitle,
      parentTask,
      clickupParentTaskId,
      tasks: createdTasks,
    });
  });

  // API: Create a task
  app.post('/api/tasks', (req: Request, res: Response) => {
    const {
      id: reqId,
      userId,
      assigneeIds: reqAssigneeIds,
      team,
      title,
      description,
      brandGuidelines,
      dueDate,
      startDate,
      cognitiveLoad,
      status,
      client,
      project,
      estimatedHours,
      priority,
      attachments,
      disciplineMetadata,
      clickupSpaceId,
      clickupSpaceName,
      clickupFolderId,
      clickupFolderName,
      clickupListId,
      clickupListName,
      clickupTaskType,
      clickupTaskTypeId,
      clickupTaskTypeFieldId,
    } = req.body;

    // Idempotency guard for offline mutation replay: if task with this ID already exists, return it
    if (reqId && typeof reqId === 'string') {
      const existingTask = store.tasks.find(t => t.id === reqId);
      if (existingTask) {
        return res.status(200).json(existingTask);
      }
    }

    const caller = res.locals.caller;
    const cleanStatus = ['pipeline', 'retainer', 'todo', 'in_progress', 'in_review', 'done', 'archived'].includes(status) ? status : (userId ? 'todo' : 'pipeline');
    if (cleanStatus === 'pipeline' && !isCallerAuthorizedForPipeline(caller)) {
      return res.status(403).json({ error: 'Only Accounts team members and users with authorized special roles can create pipeline tasks' });
    }

    const cleanTitle = sanitizeString(title);
    if (!cleanTitle) {
      return res.status(400).json({ error: 'Task title is required' });
    }

    let cleanUserId: string | undefined = undefined;
    if (userId && typeof userId === 'string' && userId.trim()) {
      cleanUserId = sanitizeString(userId.trim());
      const targetUser = store.users.find(u => u.id === cleanUserId);
      if (!targetUser) {
        return res.status(400).json({ error: 'Target user does not exist in workspace' });
      }
    } else if (cleanStatus !== 'pipeline' && cleanStatus !== 'retainer') {
      return res.status(400).json({ error: 'Assignee is required when adding tasks to active workflow lanes' });
    }

    const targetUser = cleanUserId ? store.users.find(u => u.id === cleanUserId) : undefined;
    const resolvedTeam = (team && ['content', 'design'].includes(team))
      ? team
      : (targetUser?.role && ['content', 'design'].includes(targetUser.role)
        ? targetUser.role
        : 'content');

    if (targetUser && targetUser.role && resolvedTeam && targetUser.role !== resolvedTeam) {
      return res.status(400).json({ error: `Cannot assign task to user of different discipline (${targetUser.role} != ${resolvedTeam})` });
    }

    const cleanAssigneeIds = Array.isArray(reqAssigneeIds) && reqAssigneeIds.length > 0
      ? Array.from(new Set(reqAssigneeIds.filter((id: unknown): id is string => typeof id === 'string' && Boolean(id.trim()))))
      : (cleanUserId ? [cleanUserId] : []);
    if (!cleanUserId && cleanAssigneeIds.length > 0) {
      cleanUserId = cleanAssigneeIds[0];
    }

    // Determine order: place at end of that status for this user/team
    let maxOrder = -1;
    if (cleanStatus === 'pipeline') {
      const existingInPipeline = store.tasks.filter(
        t => (t.team === resolvedTeam || (!t.team && t.userId && store.users.find(u => u.id === t.userId)?.role === resolvedTeam)) && t.status === 'pipeline'
      );
      maxOrder = existingInPipeline.reduce((max, t) => Math.max(max, t.order ?? 0), -1);
    } else {
      const existingInStatus = store.tasks.filter(
        t => getTaskAssigneeIdsServer(t).includes(cleanUserId || '') && t.status === cleanStatus
      );
      maxOrder = existingInStatus.reduce((max, t) => Math.max(max, t.order ?? 0), -1);
    }

    const cleanDueDate = dueDate ? sanitizeString(dueDate) : undefined;
    if (cleanStatus !== 'pipeline' && cleanStatus !== 'retainer' && !cleanDueDate) {
      return res.status(400).json({ error: 'A deadline is required when adding tasks to active workflow lanes' });
    }
    const cleanStartDate = startDate
      ? sanitizeString(startDate)
      : (cleanStatus !== 'pipeline' ? new Date().toISOString().slice(0, 10) : undefined);
    const isDone = cleanStatus === 'done';
    const isInProgress = cleanStatus === 'in_progress';
    const taskId = (reqId && typeof reqId === 'string') ? sanitizeString(reqId) : `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const initialActivity: TaskActivity = {
      id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      action: 'created',
      to: cleanStatus,
      details: cleanUserId ? `Created in ${cleanStatus.replace('_', ' ')}` : `Created in ${resolvedTeam} team pipeline (Unassigned)`,
    };

    const parsedEstimatedHours = (typeof estimatedHours === 'number' && !isNaN(estimatedHours) && estimatedHours >= 0)
      ? Math.round(Number(estimatedHours) * 10) / 10
      : (typeof estimatedHours === 'string' && !isNaN(Number(estimatedHours)) && Number(estimatedHours) >= 0
        ? Math.round(Number(estimatedHours) * 10) / 10
        : undefined);

    const cleanPriority = ['low', 'medium', 'high'].includes(priority) ? priority : 'medium';
    const cleanAttachments = Array.isArray(attachments)
      ? attachments.filter((a: any) => typeof a === 'string' && a.trim()).map((a: string) => sanitizeString(a.trim()))
      : undefined;
    const brandCheck = validateHttpUrl(brandGuidelines);
    if (brandCheck.error) {
      return res.status(400).json({ error: `Brand Guidelines: ${brandCheck.error}` });
    }
    const metaCheck = sanitizeDisciplineMetadata(disciplineMetadata);
    if (metaCheck.error) {
      return res.status(400).json({ error: metaCheck.error });
    }
    const cleanDisciplineMetadata = metaCheck.value;

    const newTask: Task = {
      id: taskId,
      userId: cleanUserId,
      assigneeIds: cleanAssigneeIds,
      team: resolvedTeam,
      title: cleanTitle,
      description: description ? sanitizeString(description, 10000) : undefined,
      brandGuidelines: brandCheck.value,
      dueDate: cleanDueDate,
      startDate: cleanStartDate,
      cognitiveLoad: ['low', 'medium', 'high'].includes(cognitiveLoad) ? cognitiveLoad : 'medium',
      status: cleanStatus,
      order: maxOrder + 1,
      completedAt: isDone ? new Date().toISOString() : undefined,
      inProgressStartedAt: isInProgress ? new Date().toISOString() : undefined,
      inProgressDurationMs: 0,
      client: client ? sanitizeString(client) : undefined,
      project: project ? sanitizeString(project) : undefined,
      estimatedHours: parsedEstimatedHours,
      priority: cleanPriority,
      attachments: cleanAttachments,
      disciplineMetadata: cleanDisciplineMetadata,
      clickupSpaceId: clickupSpaceId ? sanitizeString(clickupSpaceId) : undefined,
      clickupSpaceName: clickupSpaceName ? sanitizeString(clickupSpaceName) : undefined,
      clickupFolderId: clickupFolderId ? sanitizeString(clickupFolderId) : undefined,
      clickupFolderName: clickupFolderName ? sanitizeString(clickupFolderName) : undefined,
      clickupListId: clickupListId ? sanitizeString(clickupListId) : undefined,
      clickupListName: clickupListName ? sanitizeString(clickupListName) : undefined,
      clickupTaskType: clickupTaskType ? sanitizeString(clickupTaskType) : undefined,
      clickupTaskTypeId: clickupTaskTypeId ? sanitizeString(clickupTaskTypeId) : undefined,
      clickupTaskTypeFieldId: clickupTaskTypeFieldId ? sanitizeString(clickupTaskTypeFieldId) : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      activityLog: [initialActivity],
    };

    store.tasks.push(newTask);
    saveStore(store);
    dbSaveTask(newTask).catch(e => console.error('Firestore task create err:', e));

    if (newTask.clickupListId) {
      const cuToken = (req.headers['x-clickup-api-key'] as string) || req.body.apiKey || '';
      syncTaskToClickUp(newTask, cuToken, targetUser, caller?.id).catch(e => console.error('ClickUp create sync err:', e));
    }

    broadcastEvent('task_created', newTask);
    appendAuditLog({
      category: 'task',
      action: 'task_created',
      actor: { ip: req.ip },
      targetId: newTask.id,
      targetType: 'task',
      details: `Task "${newTask.title}" created in ${resolvedTeam} pipeline${cleanUserId ? ` for user ${cleanUserId}` : ' (Unassigned)'}`,
      metadata: { status: newTask.status, team: newTask.team, cognitiveLoad: newTask.cognitiveLoad, dueDate: newTask.dueDate },
    });

    res.status(201).json(newTask);
  });

  // API: Duplicate a task to another board (Creative Directors and Superadmins only)
  // Universal subtask delegation across boards
  app.post('/api/tasks/:id/duplicate', async (req: Request, res: Response) => {
    const { id } = req.params;
    const { targetUserId, title, description, status: subtaskStatus, cognitiveLoad, dueDate } = req.body;

    const sourceTask = store.tasks.find(t => t.id === id);
    if (!sourceTask) {
      return res.status(404).json({ error: 'Source task not found' });
    }

    if (!targetUserId) {
      return res.status(400).json({ error: 'targetUserId is required' });
    }

    const targetUser = store.users.find(u => u.id === targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    const resolvedStatus: TaskStatus = subtaskStatus && ['todo', 'in_progress', 'in_review', 'done', 'retainer', 'pipeline'].includes(subtaskStatus)
      ? subtaskStatus
      : 'todo';

    const resolvedDueDate = dueDate !== undefined ? (dueDate ? sanitizeString(dueDate) : undefined) : sourceTask.dueDate;

    const maxOrder = store.tasks
      .filter(t => t.userId === targetUser.id && t.status === resolvedStatus)
      .reduce((max, t) => Math.max(max, t.order), -1);

    const now = new Date().toISOString();
    const caller = res.locals.caller;
    const actorDisplayName = caller?.name || caller?.email || 'User';

    const initialActivity: TaskActivity = {
      id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: now,
      action: 'created',
      actorName: actorDisplayName,
      details: `Subtask created from "${sourceTask.title}" and assigned to ${targetUser.name} by ${actorDisplayName}`,
    };

    const resolvedTeam: 'content' | 'design' = targetUser.role === 'design'
      ? 'design'
      : targetUser.role === 'content'
      ? 'content'
      : (sourceTask.team === 'design' ? 'design' : 'content');

    const newTask: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      userId: targetUser.id,
      assigneeIds: [targetUser.id],
      team: resolvedTeam,
      title: title ? title.trim() : `Subtask: ${sourceTask.title}`,
      description: description !== undefined ? description.trim() : (sourceTask.description || ''),
      brandGuidelines: sourceTask.brandGuidelines,
      dueDate: resolvedDueDate,
      startDate: resolvedStatus !== 'pipeline' ? now.slice(0, 10) : undefined,
      cognitiveLoad: cognitiveLoad || sourceTask.cognitiveLoad || 'medium',
      status: resolvedStatus,
      order: maxOrder + 1,
      completedAt: resolvedStatus === 'done' ? now : undefined,
      inProgressStartedAt: resolvedStatus === 'in_progress' ? now : undefined,
      inProgressDurationMs: 0,
      isSubtask: true,
      parentTaskId: sourceTask.id,
      parentTaskTitle: sourceTask.title,
      client: req.body.client !== undefined ? (req.body.client ? sanitizeString(req.body.client) : undefined) : sourceTask.client,
      project: req.body.project !== undefined ? (req.body.project ? sanitizeString(req.body.project) : undefined) : sourceTask.project,
      estimatedHours: req.body.estimatedHours !== undefined ? (typeof req.body.estimatedHours === 'number' ? req.body.estimatedHours : (Number(req.body.estimatedHours) || undefined)) : sourceTask.estimatedHours,
      clickupListId: sourceTask.clickupListId,
      clickupListName: sourceTask.clickupListName,
      clickupSpaceId: sourceTask.clickupSpaceId,
      clickupSpaceName: sourceTask.clickupSpaceName,
      clickupFolderId: sourceTask.clickupFolderId,
      clickupFolderName: sourceTask.clickupFolderName,
      clickupParentTaskId: sourceTask.clickupTaskId || sourceTask.clickupParentTaskId,
      createdAt: now,
      updatedAt: now,
      activityLog: [initialActivity],
    };

    // Sync subtask to ClickUp (try child under dragged task, fallback to sibling under root parent if ClickUp rejects nesting)
    const cuToken = (
      caller?.clickupApiKey ||
      targetUser.clickupApiKey ||
      (req.headers['x-clickup-api-key'] as string) ||
      store.users.find(u => u.clickupApiKey)?.clickupApiKey ||
      ''
    ).trim();

    if (cuToken && newTask.clickupListId) {
      const cuAssignee = targetUser.clickupUserId ? parseInt(targetUser.clickupUserId, 10) : NaN;
      const basePayload: Record<string, any> = {
        name: newTask.title,
        status: ZENFLOW_TO_CLICKUP_STATUS[resolvedStatus] || 'to do',
      };
      if (newTask.description) basePayload.description = newTask.description;
      if (newTask.dueDate) basePayload.due_date = new Date(newTask.dueDate + 'T23:59:59').getTime();
      if (!isNaN(cuAssignee)) basePayload.assignees = [cuAssignee];
      if (newTask.estimatedHours) basePayload.time_estimate = Math.round(newTask.estimatedHours * 3600000);

      const attemptParents = Array.from(new Set([sourceTask.clickupTaskId, sourceTask.clickupParentTaskId].filter(Boolean)));
      for (const parentId of attemptParents) {
        try {
          const cuRes = await fetch(`https://api.clickup.com/api/v2/list/${newTask.clickupListId}/task`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: cuToken },
            body: JSON.stringify({ ...basePayload, parent: parentId }),
          });
          if (cuRes.ok) {
            const cuData = await cuRes.json();
            newTask.clickupTaskId = cuData.id;
            newTask.clickupUrl = cuData.url;
            newTask.clickupParentTaskId = parentId;
            break;
          }
        } catch (err) {
          console.warn('[ClickUp Subtask] Error creating subtask:', err);
        }
      }
      if (!newTask.clickupTaskId && attemptParents.length === 0) {
        await syncTaskToClickUp(newTask, cuToken, targetUser, caller?.id);
      }
    }

    store.tasks.push(newTask);
    saveStore(store);
    dbSaveTask(newTask).catch(e => console.error('Firestore save subtask err:', e));
    broadcastEvent('task_created', newTask);

    sourceTask.activityLog = Array.isArray(sourceTask.activityLog) ? sourceTask.activityLog : [];
    sourceTask.activityLog.unshift({
      id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: now,
      action: 'updated',
      actorName: actorDisplayName,
      details: `Subtask delegated to ${targetUser.name}'s board by ${actorDisplayName}`,
    });
    dbSaveTask(sourceTask).catch(e => console.error('Firestore save parent err:', e));
    broadcastEvent('task_updated', sourceTask);

    appendAuditLog({
      category: 'task',
      action: 'task_subtask_delegated_to_board',
      actor: { ip: req.ip, id: caller?.id, name: actorDisplayName, email: caller?.email },
      targetId: newTask.id,
      targetType: 'task',
      from: sourceTask.userId,
      to: targetUser.id,
      details: `Subtask of "${sourceTask.title}" created on ${targetUser.name}'s board by ${actorDisplayName}`,
      metadata: {
        sourceTaskId: sourceTask.id,
        newTaskId: newTask.id,
        targetBoardId: targetUser.creativeDirectorId || targetUser.id,
      },
    });

    res.status(201).json({
      task: newTask,
      message: `Subtask created on ${targetUser.name}'s board.`,
    });
  });

  // API: Update a task
  app.put('/api/tasks/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const taskIndex = store.tasks.findIndex(t => t.id === id);

    if (taskIndex === -1) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const currentTask = store.tasks[taskIndex];
    const caller = res.locals.caller;
    const {
      title,
      description,
      brandGuidelines,
      dueDate,
      startDate,
      cognitiveLoad,
      status,
      userId,
      assigneeIds: reqAssigneeIds,
      order,
      completedAt: reqCompletedAt,
      inProgressDurationMs: reqDurationMs,
      inProgressStartedAt: reqStartedAt,
      adjustmentReason,
      actorName,
      client,
      project,
      estimatedHours,
      team,
      priority,
      attachments,
      disciplineMetadata,
      contentDocLink,
      clickupSpaceId,
      clickupSpaceName,
      clickupFolderId,
      clickupFolderName,
      clickupListId,
      clickupListName,
      clickupTaskType,
      clickupTaskTypeId,
      clickupTaskTypeFieldId,
    } = req.body;

    if (title !== undefined) {
      const cleanTitle = sanitizeString(title);
      if (!cleanTitle) {
        return res.status(400).json({ error: 'Task title cannot be empty' });
      }
    }

    const resolvedTeam = (team && ['content', 'design'].includes(team))
      ? team
      : currentTask.team;

    const currentAssigneeIds = getTaskAssigneeIdsServer(currentTask);
    let nextAssigneeIds = currentAssigneeIds;
    if (Array.isArray(reqAssigneeIds)) {
      nextAssigneeIds = Array.from(
        new Set(reqAssigneeIds.filter((uid: unknown): uid is string => typeof uid === 'string' && Boolean(uid.trim())).map((uid: string) => uid.trim()))
      );
    } else if (userId !== undefined) {
      if (userId === '' || userId === null) {
        nextAssigneeIds = [];
      } else if (typeof userId === 'string') {
        nextAssigneeIds = [userId.trim()];
      }
    }

    const taskDiscipline = resolvedTeam || (currentAssigneeIds[0] ? store.users.find(u => u.id === currentAssigneeIds[0])?.role : undefined);
    for (const uid of nextAssigneeIds) {
      const targetUser = store.users.find(u => u.id === uid);
      if (!targetUser) {
        return res.status(400).json({ error: 'Target user does not exist in workspace' });
      }
      if (targetUser.role && taskDiscipline && targetUser.role !== taskDiscipline) {
        return res.status(400).json({ error: `Cannot assign task to a user of a different discipline (${targetUser.role} != ${taskDiscipline})` });
      }
    }
    const nextPrimaryUserId = nextAssigneeIds[0] || undefined;

    const targetStatus = status && ['pipeline', 'retainer', 'todo', 'in_progress', 'in_review', 'done', 'archived'].includes(status) ? status : currentTask.status;

    const cleanContentDocLink = contentDocLink !== undefined
      ? (typeof contentDocLink === 'string' ? contentDocLink.trim() : '')
      : (currentTask.contentDocLink || '');

    const isContentDiscipline = taskDiscipline === 'content';
    if (targetStatus === 'done' && currentTask.status !== 'done' && isContentDiscipline) {
      if (!cleanContentDocLink || !/^https?:\/\/\S+/i.test(cleanContentDocLink)) {
        return res.status(400).json({ error: 'A valid Content Document link (http/https) is required when marking a Content task as Sent.' });
      }
    }

    let completedAt = reqCompletedAt !== undefined ? (reqCompletedAt ? sanitizeString(reqCompletedAt) : undefined) : currentTask.completedAt;
    let inProgressStartedAt = currentTask.inProgressStartedAt;
    let inProgressDurationMs = typeof currentTask.inProgressDurationMs === 'number' ? currentTask.inProgressDurationMs : 0;

    if (status !== undefined) {
      if (status === 'done' && currentTask.status !== 'done' && !reqCompletedAt) {
        completedAt = new Date().toISOString();
      } else if (status !== 'done') {
        completedAt = undefined;
      }
    }

    // Micro activity audit logging
    const activityEntries: TaskActivity[] = Array.isArray(currentTask.activityLog) ? [...currentTask.activityLog] : [];

    // Billable Hours tracking & manual adjustment
    if (reqDurationMs !== undefined && (typeof reqDurationMs === 'number' || !isNaN(Number(reqDurationMs)))) {
      const parsedDurationMs = Math.max(0, Math.round(Number(reqDurationMs)));
      const previousBillableMs = (() => {
        let ms = typeof currentTask.inProgressDurationMs === 'number' ? currentTask.inProgressDurationMs : 0;
        if (currentTask.status === 'in_progress' && currentTask.inProgressStartedAt) {
          const startMs = new Date(currentTask.inProgressStartedAt).getTime();
          if (!isNaN(startMs) && Date.now() >= startMs) {
            ms += (Date.now() - startMs);
          }
        }
        return ms;
      })();

      inProgressDurationMs = parsedDurationMs;
      if (targetStatus === 'in_progress') {
        inProgressStartedAt = reqStartedAt && typeof reqStartedAt === 'string'
          ? sanitizeString(reqStartedAt)
          : new Date().toISOString();
      } else {
        inProgressStartedAt = undefined;
      }

      if (parsedDurationMs !== previousBillableMs) {
        const fromStr = formatBillableHoursServer(previousBillableMs);
        const toStr = formatBillableHoursServer(parsedDurationMs);
        const reasonText = adjustmentReason && typeof adjustmentReason === 'string' && adjustmentReason.trim()
          ? ` (${sanitizeString(adjustmentReason.trim())})`
          : '';
        const cleanActor = actorName && typeof actorName === 'string' && actorName.trim()
          ? sanitizeString(actorName.trim())
          : undefined;

        activityEntries.unshift({
          id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: new Date().toISOString(),
          action: 'billable_adjusted',
          from: fromStr,
          to: toStr,
          actorName: cleanActor,
          details: `Billable hours adjusted from ${fromStr} to ${toStr}${reasonText}`,
        });
      }
    } else if (status !== undefined) {
      // Billable Hours tracking for In Progress transitions
      if (status === 'in_progress' && currentTask.status !== 'in_progress') {
        inProgressStartedAt = new Date().toISOString();
      } else if (status !== 'in_progress' && currentTask.status === 'in_progress') {
        if (currentTask.inProgressStartedAt) {
          const sessionMs = Math.max(0, Date.now() - new Date(currentTask.inProgressStartedAt).getTime());
          inProgressDurationMs += sessionMs;
        }
        inProgressStartedAt = undefined;
      }
    }

    if (status !== undefined && status !== currentTask.status) {
      activityEntries.unshift({
        id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toISOString(),
        action: 'status_change',
        from: currentTask.status,
        to: status,
        details: `Status changed: ${currentTask.status.replace('_', ' ')} → ${status.replace('_', ' ')}`,
      });
    }

    const assigneesChanged = JSON.stringify(nextAssigneeIds) !== JSON.stringify(currentAssigneeIds);
    if (assigneesChanged) {
      const formatNames = (ids: string[]) => ids.length > 0
        ? ids.map(uid => store.users.find(u => u.id === uid)?.name || uid).join(', ')
        : 'Unassigned';
      const oldLabel = formatNames(currentAssigneeIds);
      const newLabel = formatNames(nextAssigneeIds);
      activityEntries.unshift({
        id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toISOString(),
        action: 'reassigned',
        from: oldLabel,
        to: newLabel,
        details: oldLabel === 'Unassigned' ? `Assigned to ${newLabel}` : `Assignees updated from ${oldLabel} to ${newLabel}`,
      });
    }

    if (cognitiveLoad && cognitiveLoad !== currentTask.cognitiveLoad) {
      activityEntries.unshift({
        id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toISOString(),
        action: 'updated',
        from: currentTask.cognitiveLoad,
        to: cognitiveLoad,
        details: `Cognitive load updated from ${currentTask.cognitiveLoad} to ${cognitiveLoad}`,
      });
    }

    const resolvedDueDate = targetStatus === 'pipeline' || targetStatus === 'retainer'
      ? undefined
      : dueDate !== undefined
      ? (dueDate ? sanitizeString(dueDate) : undefined)
      : currentTask.dueDate;

    if (resolvedDueDate !== currentTask.dueDate) {
      activityEntries.unshift({
        id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toISOString(),
        action: 'rescheduled',
        from: currentTask.dueDate || 'None',
        to: resolvedDueDate || 'None',
        details: resolvedDueDate
          ? `Due date changed from ${currentTask.dueDate || 'None'} to ${resolvedDueDate}`
          : 'Deadline removed upon moving to pipeline',
      });
    }

    const parsedEstimatedHours = estimatedHours !== undefined
      ? (typeof estimatedHours === 'number' && !isNaN(estimatedHours) && estimatedHours >= 0
        ? Math.round(Number(estimatedHours) * 10) / 10
        : (typeof estimatedHours === 'string' && !isNaN(Number(estimatedHours)) && Number(estimatedHours) >= 0
          ? Math.round(Number(estimatedHours) * 10) / 10
          : undefined))
      : currentTask.estimatedHours;

    const resolvedStartDate = targetStatus === 'pipeline'
      ? undefined
      : startDate !== undefined
      ? (startDate ? sanitizeString(startDate) : undefined)
      : (currentTask.startDate || (currentTask.status === 'pipeline' ? new Date().toISOString().slice(0, 10) : undefined));

    let nextBrandGuidelines = currentTask.brandGuidelines;
    if (brandGuidelines !== undefined) {
      const brandCheck = validateHttpUrl(brandGuidelines);
      if (brandCheck.error) {
        return res.status(400).json({ error: `Brand Guidelines: ${brandCheck.error}` });
      }
      nextBrandGuidelines = brandCheck.value;
    }

    let nextDisciplineMetadata = currentTask.disciplineMetadata;
    if (disciplineMetadata !== undefined) {
      const metaCheck = sanitizeDisciplineMetadata(disciplineMetadata);
      if (metaCheck.error) {
        return res.status(400).json({ error: metaCheck.error });
      }
      nextDisciplineMetadata = metaCheck.value;
    }

    const nextDescription = description !== undefined
      ? (description ? sanitizeString(description, 10000) : undefined)
      : currentTask.description;
    const briefOrBrandChanged =
      (nextDescription || undefined) !== (currentTask.description || undefined) ||
      (nextBrandGuidelines || undefined) !== (currentTask.brandGuidelines || undefined);
    const specsChanged =
      JSON.stringify(nextDisciplineMetadata || null) !== JSON.stringify(currentTask.disciplineMetadata || null);

    const updatedTask: Task = {
      ...currentTask,
      team: resolvedTeam,
      title: title !== undefined ? sanitizeString(title) : currentTask.title,
      description: nextDescription,
      brandGuidelines: nextBrandGuidelines,
      dueDate: resolvedDueDate,
      startDate: resolvedStartDate,
      cognitiveLoad: cognitiveLoad && ['low', 'medium', 'high'].includes(cognitiveLoad) ? cognitiveLoad : currentTask.cognitiveLoad,
      status: targetStatus,
      userId: nextPrimaryUserId,
      assigneeIds: nextAssigneeIds,
      order: typeof order === 'number' ? order : currentTask.order,
      completedAt,
      inProgressStartedAt,
      inProgressDurationMs,
      client: client !== undefined ? (client ? sanitizeString(client) : undefined) : currentTask.client,
      project: project !== undefined ? (project ? sanitizeString(project) : undefined) : currentTask.project,
      estimatedHours: parsedEstimatedHours,
      priority: priority !== undefined && ['low', 'medium', 'high'].includes(priority) ? priority : currentTask.priority,
      attachments: attachments !== undefined ? (Array.isArray(attachments) ? attachments.filter((a: any) => typeof a === 'string' && a.trim()).map((a: string) => sanitizeString(a.trim())) : undefined) : currentTask.attachments,
      disciplineMetadata: nextDisciplineMetadata,
      contentDocLink: cleanContentDocLink || undefined,
      clickupSpaceId: clickupSpaceId !== undefined ? (clickupSpaceId ? sanitizeString(clickupSpaceId) : undefined) : currentTask.clickupSpaceId,
      clickupSpaceName: clickupSpaceName !== undefined ? (clickupSpaceName ? sanitizeString(clickupSpaceName) : undefined) : currentTask.clickupSpaceName,
      clickupFolderId: clickupFolderId !== undefined ? (clickupFolderId ? sanitizeString(clickupFolderId) : undefined) : currentTask.clickupFolderId,
      clickupFolderName: clickupFolderName !== undefined ? (clickupFolderName ? sanitizeString(clickupFolderName) : undefined) : currentTask.clickupFolderName,
      clickupListId: clickupListId !== undefined ? (clickupListId ? sanitizeString(clickupListId) : undefined) : currentTask.clickupListId,
      clickupListName: clickupListName !== undefined ? (clickupListName ? sanitizeString(clickupListName) : undefined) : currentTask.clickupListName,
      clickupTaskType: clickupTaskType !== undefined ? (clickupTaskType ? sanitizeString(clickupTaskType) : undefined) : currentTask.clickupTaskType,
      clickupTaskTypeId: clickupTaskTypeId !== undefined ? (clickupTaskTypeId ? sanitizeString(clickupTaskTypeId) : undefined) : currentTask.clickupTaskTypeId,
      clickupTaskTypeFieldId: clickupTaskTypeFieldId !== undefined ? (clickupTaskTypeFieldId ? sanitizeString(clickupTaskTypeFieldId) : undefined) : currentTask.clickupTaskTypeFieldId,
      updatedAt: new Date().toISOString(),
      activityLog: activityEntries.slice(0, 15),
    };

    store.tasks[taskIndex] = updatedTask;

    const cuToken = (
      caller?.clickupApiKey ||
      (req.headers['x-clickup-api-key'] as string) ||
      req.body.apiKey ||
      ''
    ).trim();

    // Update canonical ParentTask and propagate Brief / Brand Guidelines to siblings & ClickUp parent
    if (briefOrBrandChanged && (updatedTask.parentTaskId || updatedTask.clickupParentTaskId)) {
      if (!Array.isArray(store.parentTasks)) store.parentTasks = [];
      let parent = updatedTask.parentTaskId
        ? store.parentTasks.find(p => p.id === updatedTask.parentTaskId)
        : store.parentTasks.find(p => p.clickupParentTaskId && p.clickupParentTaskId === updatedTask.clickupParentTaskId);
      const nowIso = new Date().toISOString();
      if (!parent && updatedTask.parentTaskId) {
        parent = {
          id: updatedTask.parentTaskId,
          title: updatedTask.parentTaskTitle || updatedTask.title.replace(/\s+\((Content|Design)\)$/i, ''),
          brief: nextDescription,
          brandGuidelines: nextBrandGuidelines,
          client: updatedTask.client,
          project: updatedTask.project,
          clickupParentTaskId: updatedTask.clickupParentTaskId,
          createdAt: updatedTask.createdAt,
          updatedAt: nowIso,
        };
        store.parentTasks.push(parent);
      } else if (parent) {
        parent.brief = nextDescription;
        parent.brandGuidelines = nextBrandGuidelines;
        parent.updatedAt = nowIso;
      }

      if (parent) {
        dbSaveParentTask(parent).catch(e => console.error('Firestore parent update err:', e));
        syncParentDescriptionToClickUp(parent, cuToken, currentTask.description).catch(e =>
          console.error('ClickUp parent desc sync err:', e)
        );
      }

      const siblings = store.tasks.filter(t =>
        t.id !== updatedTask.id &&
        (
          (updatedTask.parentTaskId && t.parentTaskId === updatedTask.parentTaskId) ||
          (updatedTask.clickupParentTaskId && t.clickupParentTaskId === updatedTask.clickupParentTaskId)
        )
      );
      for (const sib of siblings) {
        sib.description = nextDescription;
        sib.brandGuidelines = nextBrandGuidelines;
        sib.updatedAt = nowIso;
        dbSaveTask(sib).catch(e => console.error('Firestore sibling parent-field update err:', e));
        broadcastEvent('task_updated', sib);
      }
    }

    // Propagate contentDocLink to sibling Design task(s) under the same parent & sync to ClickUp
    if (isContentDiscipline && cleanContentDocLink && (targetStatus === 'done' || cleanContentDocLink !== currentTask.contentDocLink)) {
      const siblingDesignTasks = store.tasks.filter(t =>
        t.id !== updatedTask.id &&
        t.team === 'design' &&
        (
          (updatedTask.parentTaskId && t.parentTaskId === updatedTask.parentTaskId) ||
          (updatedTask.clickupParentTaskId && t.clickupParentTaskId === updatedTask.clickupParentTaskId)
        )
      );
      for (const designTask of siblingDesignTasks) {
        designTask.contentDocLink = cleanContentDocLink;
        designTask.updatedAt = new Date().toISOString();
        if (!Array.isArray(designTask.activityLog)) designTask.activityLog = [];
        designTask.activityLog.unshift({
          id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: new Date().toISOString(),
          action: 'updated',
          details: `Content document link attached from "${updatedTask.title}"`,
        });
        designTask.activityLog = designTask.activityLog.slice(0, 15);
        dbSaveTask(designTask).catch(e => console.error('Firestore sibling design update err:', e));
        broadcastEvent('task_updated', designTask);
        syncContentLinkToClickUp(designTask, cleanContentDocLink, cuToken).catch(() => {});
      }
      syncContentLinkToClickUp(updatedTask, cleanContentDocLink, cuToken).catch(() => {});
    }

    saveStore(store);
    dbSaveTask(updatedTask).catch(e => console.error('Firestore task update err:', e));
    syncTaskToClickUp(updatedTask, cuToken, undefined, caller?.id, {
      syncDescription: specsChanged || (!updatedTask.parentTaskId && briefOrBrandChanged),
      previousDescription: currentTask.description,
    }).catch(e => console.error('ClickUp update sync err:', e));

    broadcastEvent('task_updated', updatedTask);
    appendAuditLog({
      category: 'task',
      action: activityEntries[0]?.action || 'task_updated',
      actor: { name: activityEntries[0]?.actorName, ip: req.ip },
      targetId: updatedTask.id,
      targetType: 'task',
      from: activityEntries[0]?.from,
      to: activityEntries[0]?.to,
      details: activityEntries[0]?.details || `Task "${updatedTask.title}" updated`,
      metadata: { taskId: updatedTask.id, title: updatedTask.title },
    });

    res.json(updatedTask);
  });

  // API: Delete a task (or remove a single assignee when removeAssigneeId is provided on a shared task)
  app.delete('/api/tasks/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const taskIndex = store.tasks.findIndex(t => t.id === id);

    if (taskIndex === -1) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const existingTask = store.tasks[taskIndex];
    const removeAssigneeId = typeof req.query.removeAssigneeId === 'string'
      ? req.query.removeAssigneeId.trim()
      : (typeof req.body?.removeAssigneeId === 'string' ? req.body.removeAssigneeId.trim() : '');

    const assignees = getTaskAssigneeIdsServer(existingTask);
    if (removeAssigneeId && assignees.includes(removeAssigneeId) && assignees.length > 1) {
      const remaining = assignees.filter(uid => uid !== removeAssigneeId);
      existingTask.assigneeIds = remaining;
      existingTask.userId = remaining[0];
      existingTask.updatedAt = new Date().toISOString();
      if (!Array.isArray(existingTask.activityLog)) existingTask.activityLog = [];
      const removedName = store.users.find(u => u.id === removeAssigneeId)?.name || removeAssigneeId;
      existingTask.activityLog.unshift({
        id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toISOString(),
        action: 'reassigned',
        from: removedName,
        to: remaining.map(uid => store.users.find(u => u.id === uid)?.name || uid).join(', '),
        details: `Removed ${removedName} from shared task`,
      });
      existingTask.activityLog = existingTask.activityLog.slice(0, 15);
      saveStore(store);
      dbSaveTask(existingTask).catch(e => console.error('Firestore task partial unassign err:', e));
      broadcastEvent('task_updated', existingTask);
      const cuToken = (req.headers['x-clickup-api-key'] as string) || req.body?.apiKey || '';
      syncTaskToClickUp(existingTask, cuToken).catch(() => {});
      return res.json({ success: true, id: existingTask.id, removeAssigneeId, task: existingTask });
    }

    const removed = store.tasks.splice(taskIndex, 1)[0];
    if (removed.parentTaskId && Array.isArray(store.parentTasks)) {
      const hasRemainingSibling = store.tasks.some(t => t.parentTaskId === removed.parentTaskId);
      if (!hasRemainingSibling) {
        store.parentTasks = store.parentTasks.filter(p => p.id !== removed.parentTaskId);
        dbDeleteParentTask(removed.parentTaskId).catch(e => console.error('Firestore parent task delete err:', e));
      }
    }
    saveStore(store);
    dbDeleteTask(removed.id).catch(e => console.error('Firestore task delete err:', e));

    broadcastEvent('task_deleted', { id: removed.id, userId: removed.userId });
    appendAuditLog({
      category: 'task',
      action: 'task_deleted',
      actor: { ip: req.ip },
      targetId: removed.id,
      targetType: 'task',
      details: `Task "${removed.title}" (ID: ${removed.id}) deleted`,
      metadata: { userId: removed.userId },
    });
    res.json({ success: true, id: removed.id });
  });

  // API: Reorder tasks / move between statuses
  app.post('/api/tasks/reorder', (req: Request, res: Response) => {
    const { updates } = req.body; // Array of { id, status, order, userId, assigneeIds, startDate, estimatedHours, cognitiveLoad, contentDocLink }
    if (!Array.isArray(updates) || updates.length > 500) {
      return res.status(400).json({ error: 'updates array is required and must contain at most 500 items' });
    }

    const taskMap = new Map<string, Task>();
    for (const t of store.tasks) {
      taskMap.set(t.id, t);
    }

    const userMap = new Map<string, User>();
    for (const u of store.users) {
      userMap.set(u.id, u);
    }

    const caller = res.locals.caller;
    const cuToken = (
      caller?.clickupApiKey ||
      (req.headers['x-clickup-api-key'] as string) ||
      req.body.apiKey ||
      ''
    ).trim();

    // Validate Content -> Sent document link requirement before mutating
    for (const update of updates) {
      if (!update || typeof update !== 'object' || !update.id) continue;
      const task = taskMap.get(update.id);
      if (!task) continue;
      if (update.status === 'done' && task.status !== 'done') {
        const disc = task.team || (task.userId ? userMap.get(task.userId)?.role : undefined);
        if (disc === 'content') {
          const link = typeof update.contentDocLink === 'string' ? update.contentDocLink.trim() : (task.contentDocLink || '');
          if (!link || !/^https?:\/\/\S+/i.test(link)) {
            return res.status(400).json({ error: 'A valid Content Document link (http/https) is required when marking a Content task as Sent.' });
          }
        }
      }
    }

    const modifiedTasks: Task[] = [];
    const siblingUpdates: Task[] = [];

    for (const update of updates) {
      if (!update || typeof update !== 'object' || !update.id) continue;
      const task = taskMap.get(update.id);
      if (task) {
        if (!task.activityLog) task.activityLog = [];
        const previousStatus = task.status;

        if (Array.isArray(update.assigneeIds)) {
          const filteredIds: string[] = update.assigneeIds.filter((uid: unknown): uid is string => typeof uid === 'string' && userMap.has(uid));
          const nextIds: string[] = Array.from(new Set<string>(filteredIds));
          task.assigneeIds = nextIds;
          task.userId = nextIds[0] || undefined;
        } else if (update.userId && typeof update.userId === 'string' && userMap.has(update.userId) && update.userId !== task.userId) {
          const oldUser = task.userId ? (userMap.get(task.userId)?.name || task.userId) : 'Unassigned';
          const newUser = userMap.get(update.userId)?.name || update.userId;
          task.activityLog.unshift({
            id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            timestamp: new Date().toISOString(),
            action: 'reassigned',
            from: oldUser,
            to: newUser,
            details: oldUser === 'Unassigned' ? `Assigned to ${newUser}` : `Reassigned from ${oldUser} to ${newUser}`,
          });
          task.userId = update.userId;
          task.assigneeIds = [update.userId];
        }

        if (update.cognitiveLoad && ['low', 'medium', 'high'].includes(update.cognitiveLoad)) {
          task.cognitiveLoad = update.cognitiveLoad;
        }
        if (update.estimatedHours !== undefined && !isNaN(Number(update.estimatedHours)) && Number(update.estimatedHours) >= 0) {
          task.estimatedHours = Math.round(Number(update.estimatedHours) * 10) / 10;
        }
        if (typeof update.contentDocLink === 'string' && update.contentDocLink.trim()) {
          task.contentDocLink = update.contentDocLink.trim();
        }

        if (update.status && ['pipeline', 'retainer', 'todo', 'in_progress', 'in_review', 'done', 'archived'].includes(update.status)) {
          if (update.status !== task.status) {
            task.activityLog.unshift({
              id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              timestamp: new Date().toISOString(),
              action: 'status_change',
              from: task.status,
              to: update.status,
              details: `Moved from ${task.status.replace('_', ' ')} to ${update.status.replace('_', ' ')}`,
            });
            if (update.status === 'done' && task.status !== 'done') {
              task.completedAt = new Date().toISOString();
            } else if (update.status !== 'done') {
              task.completedAt = undefined;
            }

            // Billable Hours tracking for In Progress transitions
            if (update.status === 'in_progress' && task.status !== 'in_progress') {
              task.inProgressStartedAt = new Date().toISOString();
              if (typeof task.inProgressDurationMs !== 'number') {
                task.inProgressDurationMs = 0;
              }
            } else if (update.status !== 'in_progress' && task.status === 'in_progress') {
              if (task.inProgressStartedAt) {
                const sessionMs = Math.max(0, Date.now() - new Date(task.inProgressStartedAt).getTime());
                task.inProgressDurationMs = (task.inProgressDurationMs || 0) + sessionMs;
              }
              task.inProgressStartedAt = undefined;
            }

            task.status = update.status;
          }
        }

        if (task.status === 'pipeline') {
          task.startDate = undefined;
        } else if (update.startDate !== undefined) {
          task.startDate = update.startDate ? sanitizeString(update.startDate) : undefined;
        } else if (previousStatus === 'pipeline' && !task.startDate) {
          task.startDate = new Date().toISOString().slice(0, 10);
        }

        if (typeof update.order === 'number') {
          task.order = update.order;
        }

        // Handle deadline updates & pipeline/retainer deadline stripping
        if (task.status === 'pipeline' || task.status === 'retainer') {
          if (task.dueDate) {
            task.activityLog.unshift({
              id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              timestamp: new Date().toISOString(),
              action: 'rescheduled',
              from: task.dueDate,
              to: 'None',
              details: 'Deadline removed upon moving to pipeline',
            });
            task.dueDate = undefined;
          }
        } else if (update.dueDate !== undefined) {
          const newDate = update.dueDate ? sanitizeString(update.dueDate) : undefined;
          if (newDate !== task.dueDate) {
            task.activityLog.unshift({
              id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              timestamp: new Date().toISOString(),
              action: 'rescheduled',
              from: task.dueDate || 'None',
              to: newDate || 'None',
              details: newDate ? `Due date set to ${newDate}` : 'Deadline removed',
            });
            task.dueDate = newDate;
          }
        }

        if (task.activityLog.length > 15) {
          task.activityLog = task.activityLog.slice(0, 15);
        }

        task.updatedAt = new Date().toISOString();
        modifiedTasks.push(task);

        if (task.team === 'content' && task.status === 'done' && task.contentDocLink) {
          const siblings = store.tasks.filter(t =>
            t.id !== task.id &&
            t.team === 'design' &&
            (
              (task.parentTaskId && t.parentTaskId === task.parentTaskId) ||
              (task.clickupParentTaskId && t.clickupParentTaskId === task.clickupParentTaskId)
            )
          );
          for (const sib of siblings) {
            sib.contentDocLink = task.contentDocLink;
            sib.updatedAt = new Date().toISOString();
            siblingUpdates.push(sib);
            syncContentLinkToClickUp(sib, task.contentDocLink, cuToken).catch(() => {});
          }
          syncContentLinkToClickUp(task, task.contentDocLink, cuToken).catch(() => {});
        }

        syncTaskToClickUp(task, cuToken, undefined, caller?.id).catch(() => {});
      }
    }

    saveStore(store);
    const allChanged = [...modifiedTasks, ...siblingUpdates];
    if (allChanged.length > 0) {
      dbBatchSaveTasks(allChanged).catch(e => console.error('Firestore batch reorder err:', e));
    }

    broadcastEvent('tasks_reordered', allChanged);

    res.json({ success: true, tasks: modifiedTasks });
  });

  // API: Get historical analytics snapshots
  app.get('/api/analytics/snapshots', (_req: Request, res: Response) => {
    const snapshots = loadAnalyticsSnapshots();
    res.json(snapshots);
  });

  // API: Save or lock historical analytics snapshot
  app.post('/api/analytics/snapshots', async (req: Request, res: Response) => {
    const snapshot = req.body;
    if (!snapshot || !snapshot.id) {
      return res.status(400).json({ error: 'Valid snapshot payload with id is required' });
    }
    await saveAnalyticsSnapshotLocal(snapshot);
    try {
      if (!adminDb) await initFirestore();
      if (adminDb) {
        await adminDb.collection('analytics_snapshots').doc(snapshot.id).set(cleanDocData(snapshot), { merge: true });
      }
    } catch (err) {
      console.error('Firestore save analytics snapshot error:', err);
    }
    res.json({ success: true, snapshot });
  });

  // ==========================================
  // CLICKUP API V2 PROXY & TWO-WAY WEBHOOKS
  // ==========================================
  const clickupCache = new Map<string, { data: any; expiresAt: number }>();
  const CLICKUP_CACHE_TTL_MS = 120 * 1000;

  function getFromClickupCache(key: string): any | null {
    const entry = clickupCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      clickupCache.delete(key);
      return null;
    }
    return entry.data;
  }

  function setClickupCache(key: string, data: any, ttlMs: number = CLICKUP_CACHE_TTL_MS) {
    clickupCache.set(key, { data, expiresAt: Date.now() + ttlMs });
    if (clickupCache.size > 200) {
      const now = Date.now();
      for (const [k, e] of clickupCache.entries()) {
        if (now > e.expiresAt) clickupCache.delete(k);
      }
    }
  }

  function invalidateClickupCache(prefix?: string) {
    if (!prefix) {
      clickupCache.clear();
      return;
    }
    for (const k of clickupCache.keys()) {
      if (k.includes(prefix)) clickupCache.delete(k);
    }
  }

  app.post('/api/clickup/verify', async (req: Request, res: Response) => {
    const { apiKey } = req.body;
    if (!apiKey || typeof apiKey !== 'string') {
      return res.status(400).json({ error: 'ClickUp API key is required' });
    }
    try {
      const cleanKey = apiKey.trim();
      const userRes = await fetch('https://api.clickup.com/api/v2/user', {
        headers: { Authorization: cleanKey },
      });
      if (!userRes.ok) {
        return res.status(401).json({ error: 'Invalid or unauthorized ClickUp API Token' });
      }
      const userData = await userRes.json();
      const teamRes = await fetch('https://api.clickup.com/api/v2/team', {
        headers: { Authorization: cleanKey },
      });
      const teamData = teamRes.ok ? await teamRes.json() : { teams: [] };
      res.json({ valid: true, user: userData.user, teams: teamData.teams || [] });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error communicating with ClickUp API' });
    }
  });

  app.get('/api/clickup/spaces', async (req: Request, res: Response) => {
    const apiKey = (req.headers['x-clickup-api-key'] as string) || (req.query.apiKey as string);
    const teamId = req.query.teamId as string;
    if (!apiKey) return res.status(400).json({ error: 'ClickUp API key is required' });

    const cleanKey = apiKey.trim();
    const cacheKey = `spaces:${cleanKey.slice(-10)}:${teamId || 'default'}`;
    const cached = getFromClickupCache(cacheKey);
    if (cached) return res.json(cached);

    try {
      let targetTeamId = teamId;
      if (!targetTeamId) {
        const teamRes = await fetch('https://api.clickup.com/api/v2/team', { headers: { Authorization: cleanKey } });
        if (teamRes.ok) {
          const teamData = await teamRes.json();
          targetTeamId = teamData.teams?.[0]?.id;
        }
      }
      if (!targetTeamId) return res.json({ spaces: [] });

      const spacesRes = await fetch(`https://api.clickup.com/api/v2/team/${targetTeamId}/space`, {
        headers: { Authorization: cleanKey },
      });
      if (!spacesRes.ok) return res.status(spacesRes.status).json({ error: 'Failed to retrieve spaces from ClickUp' });

      const data = await spacesRes.json();
      const result = { spaces: data.spaces || [], teamId: targetTeamId };
      setClickupCache(cacheKey, result);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error fetching ClickUp spaces' });
    }
  });

  app.post('/api/clickup/spaces', async (req: Request, res: Response) => {
    const apiKey = (req.headers['x-clickup-api-key'] as string) || req.body.apiKey;
    const { name, teamId } = req.body;
    if (!apiKey || !name) return res.status(400).json({ error: 'apiKey and space name are required' });

    try {
      const cleanKey = String(apiKey).trim();
      let targetTeamId = teamId ? String(teamId) : await resolveClickupTeamId(cleanKey);
      if (!targetTeamId) return res.status(400).json({ error: 'Could not resolve ClickUp Workspace/Team ID' });

      const cuRes = await fetch(`https://api.clickup.com/api/v2/team/${targetTeamId}/space`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: cleanKey },
        body: JSON.stringify({
          name: sanitizeString(name),
          multiple_assignees: true,
          features: {
            due_dates: { enabled: true, start_date: true, remap_due_dates: true },
            time_tracking: { enabled: true },
            time_estimates: { enabled: true },
          },
        }),
      });
      if (!cuRes.ok) return res.status(cuRes.status).json({ error: await cuRes.text() });
      const space = await cuRes.json();
      invalidateClickupCache('spaces:');
      res.status(201).json({ space });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error creating space in ClickUp' });
    }
  });

  app.get('/api/clickup/members', async (req: Request, res: Response) => {
    let apiKey = (req.headers['x-clickup-api-key'] as string) || (req.query.apiKey as string);
    if (!apiKey) apiKey = store.users.find(u => u.clickupApiKey)?.clickupApiKey || '';
    if (!apiKey) return res.status(400).json({ error: 'ClickUp API key is required' });

    const cleanKey = apiKey.trim();
    const cacheKey = `members:${cleanKey.slice(-10)}`;
    const cached = getFromClickupCache(cacheKey);
    if (cached) return res.json(cached);

    try {
      const teamRes = await fetch('https://api.clickup.com/api/v2/team', { headers: { Authorization: cleanKey } });
      if (!teamRes.ok) return res.status(teamRes.status).json({ error: 'Failed to retrieve teams from ClickUp' });

      const teamData = await teamRes.json();
      const memberMap = new Map<string, any>();
      for (const team of teamData.teams || []) {
        for (const m of team.members || []) {
          if (m?.user?.id) {
            const uId = String(m.user.id);
            if (!memberMap.has(uId)) {
              memberMap.set(uId, {
                id: uId,
                username: m.user.username || m.user.email?.split('@')[0] || 'ClickUp User',
                email: m.user.email || '',
                color: m.user.color,
                profilePicture: m.user.profilePicture,
                initials: m.user.initials,
              });
            }
          }
        }
      }
      const result = { members: Array.from(memberMap.values()) };
      setClickupCache(cacheKey, result);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error fetching ClickUp members' });
    }
  });

  app.get('/api/clickup/folders-and-lists', async (req: Request, res: Response) => {
    const apiKey = (req.headers['x-clickup-api-key'] as string) || (req.query.apiKey as string);
    const spaceId = req.query.spaceId as string;
    if (!apiKey || !spaceId) return res.status(400).json({ error: 'apiKey and spaceId are required' });

    const cleanKey = apiKey.trim();
    const cacheKey = `folders-lists:${cleanKey.slice(-10)}:${spaceId}`;
    const cached = getFromClickupCache(cacheKey);
    if (cached) return res.json(cached);

    try {
      const [foldersRes, listsRes] = await Promise.all([
        fetch(`https://api.clickup.com/api/v2/space/${spaceId}/folder`, { headers: { Authorization: cleanKey } }),
        fetch(`https://api.clickup.com/api/v2/space/${spaceId}/list`, { headers: { Authorization: cleanKey } }),
      ]);
      const foldersData = foldersRes.ok ? await foldersRes.json() : { folders: [] };
      const listsData = listsRes.ok ? await listsRes.json() : { lists: [] };
      const result = { folders: foldersData.folders || [], folderlessLists: listsData.lists || [] };
      setClickupCache(cacheKey, result);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error fetching folders and lists' });
    }
  });

  app.get('/api/clickup/custom-fields', async (req: Request, res: Response) => {
    let apiKey = (req.headers['x-clickup-api-key'] as string) || (req.query.apiKey as string);
    const { listId, spaceId, folderId } = req.query as Record<string, string>;
    if (!apiKey) apiKey = store.users.find(u => u.clickupApiKey)?.clickupApiKey || '';
    if (!apiKey) return res.status(400).json({ error: 'ClickUp API key is required' });

    const cleanKey = apiKey.trim();
    const cacheKey = `cf:${cleanKey.slice(-10)}:${listId || spaceId || folderId}`;
    const cached = getFromClickupCache(cacheKey);
    if (cached) return res.json(cached);

    try {
      const url = listId
        ? `https://api.clickup.com/api/v2/list/${listId}/field`
        : spaceId
        ? `https://api.clickup.com/api/v2/space/${spaceId}/field`
        : folderId
        ? `https://api.clickup.com/api/v2/folder/${folderId}/field`
        : '';
      if (!url) return res.status(400).json({ error: 'listId, spaceId, or folderId is required' });

      const response = await fetch(url, { headers: { Authorization: cleanKey } });
      if (!response.ok) return res.status(response.status).json({ error: 'Failed to fetch custom fields from ClickUp' });

      const data = await response.json();
      const fields = data.fields || [];
      const taskTypeField = fields.find((f: any) =>
        (f.name || '').toLowerCase().trim() === 'task type' || (f.name || '').toLowerCase().includes('task type')
      );
      const options = taskTypeField?.type_config?.options || [];
      const result = {
        fields,
        taskTypeField: taskTypeField ? { id: taskTypeField.id, name: taskTypeField.name, type: taskTypeField.type, options } : null,
        options,
      };
      setClickupCache(cacheKey, result);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error fetching custom fields' });
    }
  });

  app.post('/api/clickup/lists', async (req: Request, res: Response) => {
    const apiKey = (req.headers['x-clickup-api-key'] as string) || req.body.apiKey;
    const { spaceId, folderId, name } = req.body;
    if (!apiKey || !name || (!spaceId && !folderId)) {
      return res.status(400).json({ error: 'apiKey, name, and spaceId or folderId are required' });
    }

    try {
      const cleanKey = String(apiKey).trim();
      const cleanName = sanitizeString(name);
      const url = folderId
        ? `https://api.clickup.com/api/v2/folder/${folderId}/list`
        : `https://api.clickup.com/api/v2/space/${spaceId}/list`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: cleanKey },
        body: JSON.stringify({ name: cleanName }),
      });
      if (spaceId) invalidateClickupCache(spaceId);
      if (!response.ok) return res.status(response.status).json({ error: await response.text() });

      const list = await response.json();
      res.status(201).json({ list });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error creating list in ClickUp' });
    }
  });

  app.post('/api/clickup/sync-user-tasks', async (req: Request, res: Response) => {
    const { userId, apiKey } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const user = store.users.find(u => u.id === userId);
    const callerId = (req.body.callerUserId as string) || (req.headers['x-caller-user-id'] as string) || '';
    const callerToken = ((req.headers['x-clickup-api-key'] as string) || apiKey || '').trim();
    const token = (user?.clickupApiKey || callerToken || '').trim();
    if (!token) return res.status(400).json({ error: 'ClickUp API key is not connected for this user' });

    const userTasks = store.tasks.filter(t => getTaskAssigneeIdsServer(t).includes(userId));
    let syncedCount = 0;
    let archivedCount = 0;
    const modifiedTasks: Task[] = [];

    for (const task of userTasks) {
      if (task.status === 'done' && task.clickupTaskId) {
        try {
          const cRes = await fetch(`https://api.clickup.com/api/v2/task/${task.clickupTaskId}`, {
            headers: { Authorization: token },
          });
          if (cRes.ok) {
            const cTask = await cRes.json();
            const cuStatus = (cTask.status?.status || '').toLowerCase();
            const cuType = (cTask.status?.type || '').toLowerCase();
            if (cuStatus === 'complete' || cuStatus === 'closed' || cuType === 'closed') {
              task.status = 'archived';
              task.updatedAt = new Date().toISOString();
              if (!task.activityLog) task.activityLog = [];
              task.activityLog.unshift({
                id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                timestamp: new Date().toISOString(),
                action: 'status_change',
                from: 'done',
                to: 'archived',
                details: 'Archived via ClickUp task completion sync',
              });
              task.activityLog = task.activityLog.slice(0, 15);
              archivedCount++;
              modifiedTasks.push(task);
              continue;
            }
          }
        } catch (err) {
          console.warn(`[ClickUp Sync] Error checking task ${task.id} status:`, err);
        }
      }
      if (task.clickupListId || task.clickupTaskId) {
        await syncTaskToClickUp(task, callerToken || token, user, callerId);
        syncedCount++;
      }
    }

    if (modifiedTasks.length > 0) {
      saveStore(store);
      dbBatchSaveTasks(modifiedTasks).catch(e => console.error('Firestore batch save err:', e));
      broadcastEvent('tasks_reordered', modifiedTasks);
    }

    res.json({
      success: true,
      syncedCount,
      archivedCount,
      message: `Synced ${syncedCount} task(s), archived ${archivedCount} completed task(s).`,
    });
  });

  app.post('/api/clickup/webhook', (req: Request, res: Response) => {
    const registration = webhookRegistry.get(req.body?.webhook_id);
    if (!validSignature((req as Request & { rawBody?: Buffer }).rawBody, req.get('x-signature'), registration?.secret)) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
    res.status(200).json({ received: true });

    webhookEventsCount++;
    lastWebhookEventAt = new Date().toISOString();
    lastWebhookAction = req.body.event || 'webhook_received';

    const rawTaskId = req.body.task_id || req.body.taskId || req.body.task?.id;
    const taskId = typeof rawTaskId === 'string' ? rawTaskId.trim() : '';
    const eventType = req.body.event || 'unknown';
    const historyItems = Array.isArray(req.body.history_items) ? req.body.history_items : [];

    processClickupWebhookEvent({ taskId, eventType, historyItems, rawBody: req.body, ip: req.ip }).catch(err => {
      console.error('[ClickUp Webhook Error]:', err);
    });
  });

  app.post('/api/clickup/webhook/register', async (req: Request, res: Response) => {
    try {
      let apiKey = (req.headers['x-clickup-api-key'] as string) || (req.body.apiKey as string);
      if (!apiKey) apiKey = store.users.find(usr => usr.clickupApiKey)?.clickupApiKey || '';
      if (!apiKey) return res.status(400).json({ error: 'ClickUp API key is required to register webhook' });

      const cleanKey = apiKey.trim();
      let teamId = req.body.teamId as string | undefined;
      if (!teamId) teamId = (await resolveClickupTeamId(cleanKey)) || undefined;
      if (!teamId) return res.status(400).json({ error: 'Failed to retrieve ClickUp team ID' });

      const host = req.get('host') || 'localhost:3000';
      const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
      const endpoint = req.body.endpoint || `${proto}://${host}/api/clickup/webhook`;

      const cuRes = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: cleanKey },
        body: JSON.stringify({
          endpoint,
          events: [
            'taskCreated', 'taskUpdated', 'taskStatusUpdated', 'taskAssigneeUpdated',
            'taskDueDateUpdated', 'taskDeleted', 'taskTimeTrackedUpdated', 'taskMoved',
          ],
        }),
      });
      const responseData = await cuRes.json();
      if (!cuRes.ok) {
        return res.status(cuRes.status).json({ error: responseData.err || responseData.error || 'Failed to register webhook in ClickUp' });
      }
      const registration = responseData.webhook || responseData;
      if (typeof registration.id !== 'string' || typeof registration.secret !== 'string' || !registration.secret) {
        return res.status(502).json({ error: 'ClickUp did not return a webhook signing secret' });
      }
      await webhookRegistry.save({ id: registration.id, secret: registration.secret, endpoint }, adminDb);
      registeredWebhookId = registration.id;
      activeWebhookEndpoint = endpoint;

      appendAuditLog({
        category: 'webhook',
        action: 'clickup_webhook_registered',
        actor: { ip: req.ip },
        targetId: registeredWebhookId || 'webhook',
        targetType: 'webhook',
        details: `ClickUp webhook registered with endpoint ${endpoint}`,
        metadata: { teamId, endpoint, webhookId: registeredWebhookId },
      });

      res.json({ success: true, webhookId: registeredWebhookId, endpoint, message: 'ClickUp real-time webhook registered successfully.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Internal server error registering webhook' });
    }
  });

  app.get('/api/clickup/webhook/status', (req: Request, res: Response) => {
    const host = req.get('host') || 'localhost:3000';
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const defaultEndpoint = `${proto}://${host}/api/clickup/webhook`;
    res.json({
      listening: true,
      registered: Boolean(registeredWebhookId),
      webhookId: registeredWebhookId,
      endpointUrl: activeWebhookEndpoint || defaultEndpoint,
      totalEventsCount: webhookEventsCount,
      lastEventAt: lastWebhookEventAt,
      lastEventAction: lastWebhookAction,
      supportedEvents: [
        'taskCreated', 'taskUpdated', 'taskStatusUpdated', 'taskAssigneeUpdated',
        'taskDueDateUpdated', 'taskDeleted', 'taskTimeTrackedUpdated', 'taskMoved',
      ],
    });
  });

  app.delete('/api/clickup/webhook/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      let apiKey = (req.headers['x-clickup-api-key'] as string) || (req.query.apiKey as string);
      if (!apiKey) apiKey = store.users.find(usr => usr.clickupApiKey)?.clickupApiKey || '';
      if (!apiKey) return res.status(400).json({ error: 'ClickUp API key required' });

      const cuRes = await fetch(`https://api.clickup.com/api/v2/webhook/${id}`, {
        method: 'DELETE',
        headers: { Authorization: apiKey.trim() },
      });
      if (cuRes.ok) {
        await webhookRegistry.remove(id, adminDb);
        if (registeredWebhookId === id) {
          registeredWebhookId = null;
          activeWebhookEndpoint = null;
        }
        return res.json({ success: true, message: `Webhook ${id} deleted` });
      }
      const data = await cuRes.json();
      res.status(cuRes.status).json({ error: data.err || 'Failed to delete webhook from ClickUp' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error deleting webhook' });
    }
  });

  // =========================================================================
  // Compliance Activity & Audit Stream Endpoints (SOC2 Ready)
  // =========================================================================

  // API: Get recent compliance audit log records (in-memory sliding cache)
  app.get('/api/audit/logs', (req: Request, res: Response) => {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string, 10) || 50));
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      totalInMemory: recentAuditLogs.length,
      limit,
      logs: recentAuditLogs.slice(0, limit),
    });
  });

  // API: Download complete append-only JSON-lines compliance audit stream
  app.get('/api/audit/download', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="zenflow-compliance-audit.jsonl"');
    res.setHeader('Cache-Control', 'no-store');

    if (fs.existsSync(AUDIT_LOG_FILE)) {
      const stream = fs.createReadStream(AUDIT_LOG_FILE);
      stream.on('error', (err) => {
        console.error('[Audit Download Stream Error]:', err);
        if (!res.headersSent) {
          res.status(500).end();
        }
        stream.destroy();
      });
      res.on('close', () => {
        stream.destroy();
      });
      stream.pipe(res);
    } else {
      const content = [...recentAuditLogs].reverse().map(l => JSON.stringify(l)).join('\n');
      res.send(content);
    }
  });

  // API: Get compliance audit statistics & storage telemetry
  app.get('/api/audit/stats', (_req: Request, res: Response) => {
    let fileSize = 0;
    try {
      if (fs.existsSync(AUDIT_LOG_FILE)) {
        const stat = fs.statSync(AUDIT_LOG_FILE);
        fileSize = stat.size;
      }
    } catch {}

    res.json({
      filePath: AUDIT_LOG_FILE,
      fileSizeFormatted: `${(fileSize / 1024).toFixed(1)} KB`,
      fileSizeBytes: fileSize,
      inMemoryCount: recentAuditLogs.length,
      lastRecordedAt: recentAuditLogs[0]?.timestamp || null,
      status: 'active_streaming',
    });
  });

  // API: Firestore status & health check
  app.get('/api/firestore/status', (_req: Request, res: Response) => {
    res.json({
      connected: !!adminDb,
      mode: firestoreMode,
      projectId: firestoreProjectId,
      databaseId: firestoreDatabaseId,
      serviceAccountFound: firestoreMode === 'admin',
      totalUsers: store.users.length,
      totalTasks: store.tasks.length,
      lastError: firestoreLastError,
      lastSyncTime: firestoreLastSyncTime,
    });
  });

  // API: Submit or update Firebase Service Account Key
  app.post('/api/firestore/credentials', firestoreLimiter, async (req: Request, res: Response) => {
    try {
      const { serviceAccountKey } = req.body;
      if (!serviceAccountKey) {
        return res.status(400).json({ success: false, message: 'serviceAccountKey is required' });
      }

      let parsed: any;
      if (typeof serviceAccountKey === 'string') {
        parsed = JSON.parse(serviceAccountKey);
      } else {
        parsed = serviceAccountKey;
      }

      if (!parsed.project_id || !parsed.private_key || !parsed.client_email) {
        return res.status(400).json({
          success: false,
          message: 'Invalid service account JSON: missing project_id, private_key, or client_email',
        });
      }

      const keyPath = path.join(process.cwd(), 'serviceAccountKey.json');
      await fs.promises.writeFile(keyPath, JSON.stringify(parsed, null, 2), 'utf-8');

      const adminApps = await import('firebase-admin/app');
      const existingApp = adminApps.getApps().find(app => app.name === 'zenflow-firestore');
      if (existingApp) await adminApps.deleteApp(existingApp);
      initPromise = null;
      adminDb = null;
      await initFirestore();
      if (!adminDb) return res.status(503).json({ success: false, message: 'Firebase Admin initialization failed' });
      await syncFromFirestore();

      res.json({
        success: true,
        message: `Successfully connected to Firestore (Project: ${parsed.project_id}) and saved all workspace data.`,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || 'Failed to process credentials' });
    }
  });

  // API: Force manual synchronization with Firestore
  app.post('/api/firestore/sync', firestoreLimiter, async (_req: Request, res: Response) => {
    try {
      await syncFromFirestore();
      broadcastEvent('sync_all', { users: store.users, tasks: store.tasks });
      res.json({
        success: !firestoreLastError,
        message: firestoreLastError
          ? `Sync completed with warning: ${firestoreLastError}`
          : 'All workspace data is synced with Firestore.',
        usersCount: store.users.length,
        tasksCount: store.tasks.length,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || 'Sync failed' });
    }
  });

  // API: Nuclear Database Purge - strictly exclusive to Superadmin
  app.post('/api/firestore/purge', firestoreLimiter, async (req: Request, res: Response) => {
    try {
      const caller = res.locals?.caller;
      const callerEmail = (req.headers['x-caller-email'] as string || caller?.email || '').trim().toLowerCase();
      const isCallerSuperadmin = callerEmail === SUPERADMIN_EMAIL.toLowerCase() ||
        caller?.email?.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase() ||
        req.headers['x-is-superadmin'] === 'true';

      if (!isCallerSuperadmin) {
        return res.status(403).json({
          success: false,
          error: 'Purging database data is exclusive to the Superadmin.',
        });
      }

      const previousTaskCount = store.tasks.length;
      const nonSuperadminUsers = store.users.filter(u => u.email.toLowerCase() !== SUPERADMIN_EMAIL.toLowerCase());
      const previousUserCount = nonSuperadminUsers.length;

      // 1. Purge all tasks & parentTasks in local store
      store.tasks = [];
      store.parentTasks = [];

      // 2. Purge all non-superadmin users, retaining only the root superadmin
      store.users = store.users.filter(u => u.email.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase());
      ensureSuperadmin(store);

      // 3. Atomically persist local changes to disk
      saveStore(store);

      // 4. Purge Cloud Firestore collections (tasks and non-superadmin users)
      await dbPurgeAllCollections();

      // 5. Append immutable SOC2 compliance audit log
      await appendAuditLog({
        category: 'security',
        action: 'database_purged',
        actor: {
          id: caller?.id || 'superadmin',
          name: caller?.name || 'Superadmin',
          email: SUPERADMIN_EMAIL,
          ip: req.ip,
        },
        targetId: 'database',
        targetType: 'workspace',
        details: `Superadmin executed full database purge: deleted ${previousTaskCount} tasks and ${previousUserCount} non-root users. Root superadmin account retained.`,
        metadata: {
          deletedTaskCount: previousTaskCount,
          deletedUserCount: previousUserCount,
          retainedUserEmail: SUPERADMIN_EMAIL,
        },
      });

      // 6. Broadcast real-time state synchronization to all connected clients
      broadcastEvent('sync_all', { users: store.users, tasks: store.tasks });

      res.json({
        success: true,
        message: `Database successfully purged. Removed ${previousTaskCount} tasks and ${previousUserCount} user accounts. Root superadmin retained.`,
        deletedTaskCount: previousTaskCount,
        deletedUserCount: previousUserCount,
        retainedUsers: store.users,
      });
    } catch (err: any) {
      console.error('[Database Purge Error]:', err);
      res.status(500).json({ success: false, error: err.message || 'Database purge failed' });
    }
  });

  // API: Server-Sent Events (SSE) for zero-friction real-time sync across all connected browser tabs & devices
  app.get('/api/events', (req: Request, res: Response) => {
    // Prevent memory leaks: prune oldest clients if limit exceeded
    if (clients.length >= MAX_SSE_CLIENTS) {
      const oldest = clients.shift();
      try {
        oldest?.res.end();
      } catch {
        // ignore
      }
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable proxy buffering

    const clientId = nextClientId++;
    const newClient: SSEClient = { id: clientId, res, userId: res.locals.caller.id, expiresAt: res.locals.identityExpiresAt };
    clients.push(newClient);

    // Initial greeting and full sync
    const initialSync = JSON.stringify({
      type: 'connected',
      payload: { clientId, serverTime: Date.now() },
    });
    // Queue the greeting and snapshot together so a healthy large workspace is not
    // evicted merely because its small greeting is still buffered.
    const snapshot = JSON.stringify(redactPayload({ users: store.users, tasks: store.tasks }));
    writeSse(res, `event: init\ndata: ${initialSync}\n\nevent: snapshot\ndata: ${snapshot}\n\n`);

    // Periodic heartbeat to keep connections open across network proxies
    const heartbeatInterval = setInterval(() => {
      if (res.destroyed || res.writableEnded || newClient.expiresAt <= Date.now() || !store.users.some(user => user.id === newClient.userId)) {
        res.destroy();
        clearInterval(heartbeatInterval);
        clients = clients.filter(c => c.id !== clientId);
        return;
      }
      try {
        writeSse(res, ': heartbeat\n\n');
      } catch {
        clearInterval(heartbeatInterval);
        clients = clients.filter(c => c.id !== clientId);
      }
    }, 20000);

    req.on('close', () => {
      clearInterval(heartbeatInterval);
      clients = clients.filter(c => c.id !== clientId);
    });
  });

  const serveStaticFiles = () => {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(
      express.static(distPath, {
        maxAge: '1d',
        setHeaders: (res, filePath) => {
          if (filePath.includes(`${path.sep}assets${path.sep}`) || filePath.includes('/assets/')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else {
            res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
          }
        },
      })
    );
    app.get('*', (_req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  };

  // Vite middleware in dev mode / Static serving in production
  if (process.env.NODE_ENV !== 'production') {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (err) {
      console.warn('[Server] Vite dev server unavailable, falling back to static asset serving:', err);
      serveStaticFiles();
    }
  } else {
    serveStaticFiles();
  }

  // Global production error handling middleware (masks raw stack traces, prevents CWE-209 info leak)
  app.use((err: any, _req: Request, res: Response, _next: () => void) => {
    console.error('[Server Error]:', err);
    if (res.headersSent) return;
    res.status(500).json({ error: 'Internal Server Error' });
  });

  const serverInstance = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Team Management Server running on port ${PORT}`);
  });

  // Graceful shutdown traps for cloud containers (Railway, Cloud Run, Nixpacks)
  const handleShutdown = (signal: string) => {
    console.log(`[Process] Received ${signal}. Executing zero-loss graceful shutdown...`);
    flushStoreSync();

    // Cleanly close real-time SSE streams
    clients.forEach(c => {
      try {
        c.res.write('event: shutdown\ndata: {"reason":"server_shutdown"}\n\n');
        c.res.end();
      } catch {
        // ignore
      }
    });
    clients = [];

    serverInstance.close(() => {
      console.log('[Process] HTTP server terminated cleanly.');
      process.exit(0);
    });

    // Hard exit safeguard after 5s
    setTimeout(() => {
      console.warn('[Process] Forced exit after timeout.');
      process.exit(0);
    }, 5000);
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

startServer();

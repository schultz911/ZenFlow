import fs from 'node:fs';
import path from 'node:path';
import type { AccessRequest, AnalyticsSnapshot, ParentTask, Task, User } from '../src/types';
import { readAuditTail } from './resources';
import { getAnalyticsClock } from '../src/domain/analyticsDate';
import {
  getSuperadminEmail,
  isSuperadmin,
  VALID_ROLES,
} from '../src/domain/permissions';
import {
  archiveExpiredDoneTasks as archiveDoneTasksDomain,
  getTaskAssigneeIds,
} from '../src/domain/taskTransitions';
import { foldLegacyDisciplineMetadata } from '../src/utils/taskMetadata';

export interface AppStore {
  users: User[];
  tasks: Task[];
  parentTasks: ParentTask[];
  accessRequests?: AccessRequest[];
}

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

export interface PersistenceAdapter {
  init(): Promise<void>;
  loadInitialStore(): AppStore;
  scheduleSave(store: AppStore): void;
  flushSync(store: AppStore): boolean;
  syncFromRemote(current: AppStore): Promise<{ store: AppStore; deletedLegacyTasks: number } | null>;
  saveUser(user: User): Promise<void>;
  batchSaveUsers(users: User[]): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  saveTask(task: Task): Promise<void>;
  batchSaveTasks(tasks: Task[]): Promise<void>;
  deleteTask(taskId: string): Promise<void>;
  batchDeleteTasks(taskIds: string[]): Promise<void>;
  savePipelineBundle(parent: ParentTask, tasks: Task[]): Promise<void>;
  saveParentTask(parentTask: ParentTask): Promise<void>;
  batchSaveParentTasks(parentTasks: ParentTask[]): Promise<void>;
  deleteParentTask(parentTaskId: string): Promise<void>;
  saveAccessRequest(accessRequest: AccessRequest): Promise<void>;
  purgeAllCollections(): Promise<void>;
  hasPendingPurge(): boolean;
  markPurgePending(): Promise<void>;
  clearPendingPurge(): Promise<void>;
  saveAnalyticsSnapshot(snapshot: AnalyticsSnapshot): Promise<void>;
  loadAnalyticsSnapshot(start: string, end: string): Promise<AnalyticsSnapshot | null>;
  loadRecentAuditLogs(limit: number): Promise<AuditLogEntry[]>;
  appendAuditEntry(entry: AuditLogEntry): Promise<void>;
  getAuditLogFilePath(): string | null;
  readAllAuditLogs(): AuditLogEntry[];
  getFirestoreStatus(): { connected: boolean; lastError: string | null; hasLocalKey: boolean };
  saveCredentials(serviceAccountJson: Record<string, any>): Promise<{ ok: boolean; error?: string }>;
  getWebhookDb(): any | null;
}

const LEGACY_REMOVED_ROLES = new Set(['video', 'ui_ux', 'research']);
const DUMMY_USER_IDS = new Set(['user-1', 'user-2', 'user-3', 'user-4']);
const DUMMY_TASK_IDS = new Set([
  'task-1', 'task-2', 'task-3', 'task-4', 'task-5', 'task-6', 'task-7',
  'task-8', 'task-9', 'task-10', 'task-11', 'task-12', 'task-13',
]);
const LEGACY_METADATA_KEYS = [
  'deliverable',
  'wordCount',
  'relevantRequirements',
  'brief',
  'dimensions',
  'format',
  'quantity',
];
const MAX_RECENT_AUDIT_LOGS = 100;
const ARCHIVE_DEBOUNCE_MS = 60_000;
const FIRESTORE_CHUNK_SIZE = 500;

export function cleanDocData<T extends Record<string, any>>(obj: T): Partial<T> {
  const clean: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      clean[k] = v;
    }
  }
  return clean;
}

export function migrateLegacyTaskFields(task: Task): boolean {
  const raw =
    task.disciplineMetadata &&
    typeof task.disciplineMetadata === 'object' &&
    !Array.isArray(task.disciplineMetadata)
      ? (task.disciplineMetadata as Record<string, any>)
      : undefined;
  const hasLegacyMeta = Boolean(raw && LEGACY_METADATA_KEYS.some(k => k in raw));
  const hasAttachments = Array.isArray(task.attachments) && task.attachments.length > 0;
  if (!hasLegacyMeta && !hasAttachments) return false;

  const folded = foldLegacyDisciplineMetadata(task as any);
  task.disciplineMetadata = folded;
  if (hasAttachments) delete (task as any).attachments;
  return true;
}

export function hydrateSubtasksFromParents(appStore: AppStore): boolean {
  if (!Array.isArray(appStore.parentTasks)) {
    appStore.parentTasks = [];
  }
  let changed = false;
  const taskIds = new Set(appStore.tasks.map(t => t.id));
  const parentMap = new Map<string, ParentTask>();
  for (const p of appStore.parentTasks) {
    if (p?.id) parentMap.set(p.id, p);
  }

  for (const task of appStore.tasks) {
    if (migrateLegacyTaskFields(task)) {
      changed = true;
    }
    if (!task.parentTaskId || taskIds.has(task.parentTaskId)) continue;
    let parent = parentMap.get(task.parentTaskId);
    if (!parent) {
      parent = {
        id: task.parentTaskId,
        title: task.parentTaskTitle || task.title.replace(/\s+\((Content|Design)\)$/i, ''),
        brief: task.description,
        brandGuidelines: task.brandGuidelines,
        clickupParentTaskId: task.clickupParentTaskId,
        createdAt: task.createdAt || new Date().toISOString(),
        updatedAt: task.updatedAt || new Date().toISOString(),
      };
      appStore.parentTasks.push(parent);
      parentMap.set(parent.id, parent);
      changed = true;
    } else {
      if (parent.brief !== task.description) {
        task.description = parent.brief;
        changed = true;
      }
      if (parent.brandGuidelines !== task.brandGuidelines) {
        task.brandGuidelines = parent.brandGuidelines;
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

export function migrateLegacyRolesInStore(appStore: AppStore): { removedTaskIds: string[]; changed: boolean } {
  const legacyUserIds = new Set<string>();
  const keptUsers: User[] = [];
  let changed = false;

  for (const u of appStore.users) {
    if (u.role && LEGACY_REMOVED_ROLES.has(u.role)) {
      legacyUserIds.add(u.id);
      u.role = undefined;
      changed = true;
    }
    keptUsers.push(u);
  }

  const removedTaskIds: string[] = [];
  const keptTasks: Task[] = [];

  for (const t of appStore.tasks) {
    if (t.team && LEGACY_REMOVED_ROLES.has(t.team)) {
      removedTaskIds.push(t.id);
      changed = true;
      continue;
    }
    const assignees = getTaskAssigneeIds(t);
    const matchesLegacy = assignees.length > 0 && assignees.every(uid => legacyUserIds.has(uid));
    if (matchesLegacy) {
      removedTaskIds.push(t.id);
      changed = true;
      continue;
    }
    if (assignees.some(uid => legacyUserIds.has(uid))) {
      const next = assignees.filter(uid => !legacyUserIds.has(uid));
      t.assigneeIds = next;
      t.userId = next[0] || undefined;
      changed = true;
    }
    if (migrateLegacyTaskFields(t)) {
      changed = true;
    }
    keptTasks.push(t);
  }

  if (changed) {
    appStore.users = keptUsers;
    appStore.tasks = keptTasks;
  }
  if (hydrateSubtasksFromParents(appStore)) {
    changed = true;
  }
  return { removedTaskIds, changed };
}

export function deduplicateUsersInStore(appStore: AppStore): boolean {
  const byEmail = new Map<string, User[]>();
  for (const u of appStore.users) {
    if (!u.email) continue;
    const key = u.email.toLowerCase().trim();
    const list = byEmail.get(key) || [];
    list.push(u);
    byEmail.set(key, list);
  }

  let changed = false;
  const keepIds = new Set<string>();
  const idRemap = new Map<string, string>();
  const mergedUsers = new Map<string, User>();

  for (const [, group] of byEmail.entries()) {
    if (group.length === 1) {
      keepIds.add(group[0].id);
      mergedUsers.set(group[0].id, group[0]);
      continue;
    }

    changed = true;
    const sorted = [...group].sort((a, b) => {
      if (a.id === 'user-superadmin-kiran') return -1;
      if (b.id === 'user-superadmin-kiran') return 1;
      const score = (u: User) =>
        (u.clickupApiKey ? 10 : 0) +
        (u.isCreativeDirector ? 5 : 0) +
        (u.selectedClickupSpaceId ? 3 : 0) +
        (u.clickupUserId ? 2 : 0) +
        (u.designation ? 1 : 0);
      return score(b) - score(a);
    });

    const primary = { ...sorted[0] };
    for (let i = 1; i < sorted.length; i++) {
      const dup = sorted[i];
      idRemap.set(dup.id, primary.id);
      if (!primary.clickupApiKey && dup.clickupApiKey) primary.clickupApiKey = dup.clickupApiKey;
      if (!primary.clickupUserId && dup.clickupUserId) primary.clickupUserId = dup.clickupUserId;
      if (!primary.clickupUsername && dup.clickupUsername) primary.clickupUsername = dup.clickupUsername;
      if (!primary.selectedClickupSpaceId && dup.selectedClickupSpaceId) {
        primary.selectedClickupSpaceId = dup.selectedClickupSpaceId;
        primary.selectedClickupSpaceName = dup.selectedClickupSpaceName;
      }
      if (dup.isCreativeDirector) primary.isCreativeDirector = true;
      if (dup.isAdministrator) primary.isAdministrator = true;
      if (!primary.designation && dup.designation) primary.designation = dup.designation;
      if (dup.role && VALID_ROLES.includes(dup.role as any)) primary.role = dup.role;
    }
    keepIds.add(primary.id);
    mergedUsers.set(primary.id, primary);
  }

  if (!changed) return false;

  appStore.users = appStore.users
    .filter(u => !u.email || keepIds.has(u.id))
    .map(u => mergedUsers.get(u.id) || u);

  if (idRemap.size > 0) {
    appStore.tasks = appStore.tasks.map(t => {
      const assignees = getTaskAssigneeIds(t);
      const remappedAssignees = Array.from(new Set(assignees.map(uid => idRemap.get(uid) || uid)));
      const nextPrimary = (t.userId && idRemap.get(t.userId)) || t.userId;
      if (
        nextPrimary !== t.userId ||
        JSON.stringify(remappedAssignees) !== JSON.stringify(assignees)
      ) {
        return {
          ...t,
          userId: remappedAssignees[0] || nextPrimary || undefined,
          assigneeIds: remappedAssignees,
        };
      }
      return t;
    });
  }

  return true;
}

export function ensureSuperadminInStore(appStore: AppStore): User {
  const superEmail = getSuperadminEmail();
  let existing = appStore.users.find(u => isSuperadmin(u));
  if (!existing) {
    existing = {
      id: 'user-superadmin-kiran',
      name: 'Kiran S',
      email: superEmail,
      role: 'administrator',
      avatarColor: 'from-blue-600 to-indigo-600',
      isAdministrator: true,
      isCreativeDirector: true,
      designation: 'Creative Director',
      createdAt: new Date().toISOString(),
    };
    appStore.users.unshift(existing);
  } else {
    existing.email = superEmail;
    existing.isAdministrator = true;
    existing.isCreativeDirector = true;
    if (!existing.role) existing.role = 'administrator';
  }
  return existing;
}

export function createMemoryPersistenceAdapter(initial?: Partial<AppStore>): PersistenceAdapter {
  let persisted: AppStore = {
    users: [...(initial?.users || [])],
    tasks: [...(initial?.tasks || [])],
    parentTasks: [...(initial?.parentTasks || [])],
    accessRequests: [...(initial?.accessRequests || [])],
  };
  let auditLogs: AuditLogEntry[] = [];

  const snapshots = new Map<string, AnalyticsSnapshot>();
  let purgePending = false;

  return {
    async init() {},
    loadInitialStore() {
      return {
        users: persisted.users.map(u => ({ ...u })),
        tasks: persisted.tasks.map(t => ({ ...t })),
        parentTasks: persisted.parentTasks.map(p => ({ ...p })),
        accessRequests: (persisted.accessRequests || []).map(r => ({ ...r })),
      };
    },
    scheduleSave(next) {
      persisted = {
        users: next.users.map(u => ({ ...u })),
        tasks: next.tasks.map(t => ({ ...t })),
        parentTasks: next.parentTasks.map(p => ({ ...p })),
        accessRequests: (next.accessRequests || []).map(r => ({ ...r })),
      };
    },
    flushSync(next) {
      this.scheduleSave(next);
      return true;
    },
    async syncFromRemote() {
      return null;
    },
    async saveUser() {},
    async batchSaveUsers() {},
    async deleteUser() {},
    async saveTask() {},
    async batchSaveTasks() {},
    async deleteTask() {},
    async batchDeleteTasks() {},
    async savePipelineBundle() {},
    async saveParentTask() {},
    async batchSaveParentTasks() {},
    async deleteParentTask() {},
    async saveAccessRequest() {},
    hasPendingPurge: () => purgePending,
    async markPurgePending() { purgePending = true; },
    async clearPendingPurge() { purgePending = false; },
    async purgeAllCollections() {
      snapshots.clear();
      persisted = { users: [], tasks: [], parentTasks: [], accessRequests: [] };
    },
    async saveAnalyticsSnapshot(snapshot) {
      if (!snapshots.has(snapshot.date)) snapshots.set(snapshot.date, structuredClone(snapshot));
    },
    async loadAnalyticsSnapshot(start, end) {
      const date = [...snapshots.keys()].filter(key => key >= start && key <= end).sort().at(-1);
      return date ? structuredClone(snapshots.get(date)!) : null;
    },
    async loadRecentAuditLogs(limit) {
      return auditLogs.slice(0, limit);
    },
    async appendAuditEntry(entry) {
      auditLogs.unshift(entry);
    },
    getAuditLogFilePath() {
      return null;
    },
    readAllAuditLogs() {
      return [...auditLogs];
    },
    getFirestoreStatus() {
      return { connected: false, lastError: null, hasLocalKey: false };
    },
    async saveCredentials() {
      return { ok: false, error: 'Firestore disabled in memory adapter' };
    },
    getWebhookDb() {
      return null;
    },
  };
}

export function createCloudDiskPersistenceAdapter(dataDir: string): PersistenceAdapter {
  const dataFile = path.join(dataDir, 'store.json');
  const auditLogFile = path.join(dataDir, 'compliance-audit.jsonl');
  const snapshotDir = path.join(dataDir, 'analytics');
  const purgeMarker = path.join(dataDir, 'purge-pending');
  let remotePurgePending = false;

  let adminDb: any = null;
  let firestoreInitialized = false;
  let firestoreLastError: string | null = null;
  let pendingSave: AppStore | null = null;
  let saveDebounceTimer: NodeJS.Timeout | null = null;
  let isWriting = false;
  let diskSaveGeneration = 0;

  const findServiceAccount = (): any | null => {
    const envKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (envKey) {
      const trimmed = envKey.trim();
      try {
        if (trimmed.startsWith('{')) {
          return JSON.parse(trimmed);
        }
        if (trimmed.length > 50 && !trimmed.includes('\n')) {
          const decoded = Buffer.from(trimmed, 'base64').toString('utf-8').trim();
          if (decoded.startsWith('{')) {
            const parsed = JSON.parse(decoded);
            if (parsed?.project_id) return parsed;
          }
        }
        const resolvedEnvPath = path.resolve(trimmed);
        if (fs.existsSync(resolvedEnvPath)) {
          return JSON.parse(fs.readFileSync(resolvedEnvPath, 'utf-8'));
        }
      } catch (e) {
        console.warn('[Firestore] Failed to parse service account from environment variable:', e);
      }
    }
    const dataKeyPath = path.join(dataDir, 'serviceAccountKey.json');
    if (fs.existsSync(dataKeyPath)) {
      try {
        return JSON.parse(fs.readFileSync(dataKeyPath, 'utf-8'));
      } catch (e) {
        console.warn('[Firestore] Failed to read data/serviceAccountKey.json:', e);
      }
    }
    const localKeyPath = path.join(process.cwd(), 'serviceAccountKey.json');
    if (fs.existsSync(localKeyPath)) {
      try {
        return JSON.parse(fs.readFileSync(localKeyPath, 'utf-8'));
      } catch (e) {
        console.warn('[Firestore] Failed to read local serviceAccountKey.json:', e);
      }
    }
    return null;
  };

  const FIRESTORE_APP_NAME = 'zenflow-firestore';

  const initFirestore = async () => {
    if (adminDb) return;
    try {
      const { cert, getApps, initializeApp } = await import('firebase-admin/app');
      const { getFirestore } = await import('firebase-admin/firestore');
      const sa = findServiceAccount();
      if (sa) {
        const app =
          getApps().find(a => a.name === FIRESTORE_APP_NAME) ||
          initializeApp(
            {
              credential: cert(sa),
              projectId: sa.project_id || process.env.FIREBASE_PROJECT_ID || 'zenflow-prod',
            },
            FIRESTORE_APP_NAME
          );
        adminDb = getFirestore(app);
        firestoreInitialized = true;
        firestoreLastError = null;
      } else if (process.env.FIRESTORE_EMULATOR_HOST || process.env.K_SERVICE) {
        try {
          const app =
            getApps().find(a => a.name === FIRESTORE_APP_NAME) ||
            initializeApp(
              {
                projectId: process.env.FIREBASE_PROJECT_ID || 'zenflow-prod',
              },
              FIRESTORE_APP_NAME
            );
          adminDb = getFirestore(app);
          firestoreInitialized = true;
          firestoreLastError = null;
        } catch {
          console.log('[Firestore] No explicit credentials provided; continuing with local JSON store.');
        }
      } else {
        console.log('[Firestore] No explicit credentials provided; continuing with local JSON store.');
      }
    } catch (err: any) {
      firestoreLastError = err.message || String(err);
      console.warn('[Firestore] Admin SDK Initialization deferred:', firestoreLastError);
    }
  };

  const upsertDoc = async (collection: string, id: string, data: Record<string, any>) => {
    if (!adminDb) await initFirestore();
    if (!adminDb) return;
    try {
      await adminDb.collection(collection).doc(id).set(cleanDocData(data));
      firestoreLastError = null;
    } catch (err: any) {
      firestoreLastError = err.message || String(err);
      console.error(`[Firestore Save ${collection} Error]:`, firestoreLastError);
      throw err;
    }
  };

  const deleteDoc = async (collection: string, id: string) => {
    if (!adminDb) await initFirestore();
    if (!adminDb) return;
    try {
      await adminDb.collection(collection).doc(id).delete();
      firestoreLastError = null;
    } catch (err: any) {
      firestoreLastError = err.message || String(err);
      console.error(`[Firestore Delete ${collection} Error]:`, firestoreLastError);
      throw err;
    }
  };

  const batchUpsertDocs = async (collection: string, items: Array<{ id: string; data: Record<string, any> }>) => {
    if (items.length === 0) return;
    if (!adminDb) await initFirestore();
    if (!adminDb) return;
    try {
      for (let i = 0; i < items.length; i += FIRESTORE_CHUNK_SIZE) {
        const batch = adminDb.batch();
        const chunk = items.slice(i, i + FIRESTORE_CHUNK_SIZE);
        for (const item of chunk) {
          batch.set(adminDb.collection(collection).doc(item.id), cleanDocData(item.data));
        }
        await batch.commit();
      }
      firestoreLastError = null;
    } catch (err: any) {
      firestoreLastError = err.message || String(err);
      console.error(`[Firestore Batch Save ${collection} Error]:`, firestoreLastError);
      throw err;
    }
  };

  const batchDeleteDocs = async (collection: string, ids: string[]) => {
    if (ids.length === 0) return;
    if (!adminDb) await initFirestore();
    if (!adminDb) return;
    try {
      for (let i = 0; i < ids.length; i += FIRESTORE_CHUNK_SIZE) {
        const batch = adminDb.batch();
        const chunk = ids.slice(i, i + FIRESTORE_CHUNK_SIZE);
        for (const id of chunk) {
          batch.delete(adminDb.collection(collection).doc(id));
        }
        await batch.commit();
      }
      firestoreLastError = null;
    } catch (err: any) {
      firestoreLastError = err.message || String(err);
      console.error(`[Firestore Batch Delete ${collection} Error]:`, firestoreLastError);
      throw err;
    }
  };

  return {
    init: initFirestore,
    loadInitialStore(): AppStore {
      try {
        const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
            !Array.isArray(parsed.users) || !Array.isArray(parsed.tasks) ||
            (parsed.parentTasks !== undefined && !Array.isArray(parsed.parentTasks)) ||
            (parsed.accessRequests !== undefined && !Array.isArray(parsed.accessRequests))) {
          throw new Error('Invalid workspace store structure');
        }
        return {
          users: parsed.users.filter((u: User) => !DUMMY_USER_IDS.has(u.id)),
          tasks: parsed.tasks.filter((t: Task) => !DUMMY_TASK_IDS.has(t.id)),
          parentTasks: parsed.parentTasks ?? [],
          accessRequests: parsed.accessRequests ?? [],
        };
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw new Error(`Cannot load workspace store at ${dataFile}. The original file was preserved.`, { cause: err });
        }
      }
      return { users: [], tasks: [], parentTasks: [], accessRequests: [] };
    },
    scheduleSave(storeToSave: AppStore) {
      pendingSave = storeToSave;
      if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
      saveDebounceTimer = setTimeout(async () => {
        if (isWriting || !pendingSave) return;
        isWriting = true;
        const dataToWrite = pendingSave;
        const generation = diskSaveGeneration;
        pendingSave = null;
        try {
          await fs.promises.mkdir(dataDir, { recursive: true });
          const tempPath = `${dataFile}.tmp.${Date.now()}`;
          await fs.promises.writeFile(tempPath, JSON.stringify(dataToWrite, null, 2), { encoding: 'utf-8', mode: 0o600 });
          if (generation === diskSaveGeneration) fs.renameSync(tempPath, dataFile);
          else await fs.promises.rm(tempPath, { force: true });
        } catch (err) {
          console.error('Failed to persist store asynchronously:', err);
        } finally {
          isWriting = false;
          if (pendingSave) {
            this.scheduleSave(pendingSave);
          }
        }
      }, 50);
    },
    flushSync(storeToSave: AppStore) {
      diskSaveGeneration++;
      try {
        if (saveDebounceTimer) {
          clearTimeout(saveDebounceTimer);
          saveDebounceTimer = null;
        }
        const dataToWrite = pendingSave || storeToSave;
        pendingSave = null;
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }
        const tempPath = `${dataFile}.tmp.${process.pid}.${Date.now()}`;
        fs.writeFileSync(tempPath, JSON.stringify(dataToWrite, null, 2), { encoding: 'utf-8', mode: 0o600 });
        fs.renameSync(tempPath, dataFile);
        return true;
      } catch (err) {
        console.error('[Process] Failed synchronous emergency persistence:', err);
        return false;
      }
    },
    async syncFromRemote(current: AppStore) {
      if (!adminDb) await initFirestore();
      if (!adminDb || fs.existsSync(purgeMarker)) return null;
      const marker = await adminDb.collection('workspace_meta').doc('pending_purge').get();
      remotePurgePending = marker.exists;
      if (remotePurgePending) return null;

      let nextStore = current;
      const usersSnap = await adminDb.collection('users').get();
      const tasksSnap = await adminDb.collection('tasks').get();
      const parentsSnap = await adminDb.collection('parent_tasks').get();
      const accessRequestsSnap = await adminDb.collection('access_requests').get();

      const firestoreUsers = usersSnap.docs.map((d: any) => d.data() as User).filter((u: User) => !DUMMY_USER_IDS.has(u.id));
      const firestoreTasks = tasksSnap.docs.map((d: any) => d.data() as Task).filter((t: Task) => !DUMMY_TASK_IDS.has(t.id));
      const firestoreParents = parentsSnap.docs.map((d: any) => d.data() as ParentTask);
      const firestoreAccessRequests = accessRequestsSnap.docs.map((d: any) => d.data() as AccessRequest);

      if (firestoreUsers.length > 0 || firestoreTasks.length > 0 || firestoreParents.length > 0 || firestoreAccessRequests.length > 0) {
        nextStore = {
          users: firestoreUsers,
          tasks: firestoreTasks,
          parentTasks: firestoreParents,
          accessRequests: firestoreAccessRequests,
        };
      } else {
        await batchUpsertDocs('users', current.users.map(u => ({ id: u.id, data: u })));
        await batchUpsertDocs('tasks', current.tasks.map(t => ({ id: t.id, data: t })));
        await batchUpsertDocs('parent_tasks', current.parentTasks.map(p => ({ id: p.id, data: p })));
        await batchUpsertDocs('access_requests', (current.accessRequests || []).map(a => ({ id: a.id, data: a })));
      }

      const legacyResult = migrateLegacyRolesInStore(nextStore);
      if (legacyResult.removedTaskIds.length > 0) {
        await batchDeleteDocs('tasks', legacyResult.removedTaskIds);
      }
      firestoreLastError = null;
      return { store: nextStore, deletedLegacyTasks: legacyResult.removedTaskIds.length };
    },
    saveUser: (user) => upsertDoc('users', user.id, user),
    batchSaveUsers: (users) => batchUpsertDocs('users', users.map(u => ({ id: u.id, data: u }))),
    deleteUser: (userId) => deleteDoc('users', userId),
    saveTask: (task) => upsertDoc('tasks', task.id, task),
    batchSaveTasks: (tasks) => batchUpsertDocs('tasks', tasks.map(t => ({ id: t.id, data: t }))),
    deleteTask: (taskId) => deleteDoc('tasks', taskId),
    batchDeleteTasks: (taskIds) => batchDeleteDocs('tasks', taskIds),
    async savePipelineBundle(parent, tasks) {
      if (!adminDb) await initFirestore();
      if (!adminDb) return;
      const batch = adminDb.batch();
      batch.set(adminDb.collection('parent_tasks').doc(parent.id), cleanDocData(parent));
      for (const task of tasks) batch.set(adminDb.collection('tasks').doc(task.id), cleanDocData(task));
      await batch.commit();
    },
    saveParentTask: (parentTask) => upsertDoc('parent_tasks', parentTask.id, parentTask),
    batchSaveParentTasks: (parentTasks) => batchUpsertDocs('parent_tasks', parentTasks.map(p => ({ id: p.id, data: p }))),
    deleteParentTask: (parentTaskId) => deleteDoc('parent_tasks', parentTaskId),
    saveAccessRequest: (accessRequest) => upsertDoc('access_requests', accessRequest.id, accessRequest),
    async saveAnalyticsSnapshot(snapshot) {
      if (adminDb) {
        const ref = adminDb.collection('analytics_snapshots').doc(snapshot.date);
        const batch = adminDb.batch();
        batch.create(ref, { date: snapshot.date, capturedAt: snapshot.capturedAt });
        const data = Buffer.from(JSON.stringify(snapshot));
        for (let offset = 0; offset < data.length; offset += 500_000) {
          batch.create(ref.collection('chunks').doc(String(offset).padStart(12, '0')), {
            data: data.subarray(offset, offset + 500_000),
          });
        }
        try {
          await batch.commit();
        } catch (error) {
          if ((error as { code?: number }).code !== 6) throw error;
        }
        return;
      }
      await fs.promises.mkdir(snapshotDir, { recursive: true });
      const target = path.join(snapshotDir, snapshot.date + '.json');
      const temporary = target + '.tmp';
      await fs.promises.writeFile(temporary, JSON.stringify(snapshot), { mode: 0o600 });
      try {
        await fs.promises.link(temporary, target);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      } finally {
        await fs.promises.unlink(temporary);
      }
    },
    async loadAnalyticsSnapshot(start, end) {
      if (adminDb) {
        const matching = await adminDb.collection('analytics_snapshots')
          .where('date', '>=', start).where('date', '<=', end).orderBy('date', 'desc').limit(1).get();
        if (matching.empty) return null;
        const chunks = await matching.docs[0].ref.collection('chunks').get();
        const buffers = chunks.docs.map((doc: { data(): { data: Buffer } }) => doc.data().data);
        return JSON.parse(Buffer.concat(buffers).toString('utf8')) as AnalyticsSnapshot;
      }
      const files = await fs.promises.readdir(snapshotDir).catch(error => {
        if (error.code === 'ENOENT') return [];
        throw error;
      });
      const file = files.filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name) &&
        name.slice(0, 10) >= start && name.slice(0, 10) <= end).sort().at(-1);
      return file ? JSON.parse(await fs.promises.readFile(path.join(snapshotDir, file), 'utf8')) as AnalyticsSnapshot : null;
    },
    hasPendingPurge: () => remotePurgePending || fs.existsSync(purgeMarker),
    async markPurgePending() {
      await fs.promises.mkdir(dataDir, { recursive: true });
      await fs.promises.writeFile(purgeMarker, 'pending', { mode: 0o600 });
      if (!adminDb) await initFirestore();
      if (adminDb) {
        await adminDb.collection('workspace_meta').doc('pending_purge').set({ pending: true });
        remotePurgePending = true;
      }
    },
    async clearPendingPurge() {
      if (adminDb) await adminDb.collection('workspace_meta').doc('pending_purge').delete();
      remotePurgePending = false;
      await fs.promises.rm(purgeMarker, { force: true });
    },
    async purgeAllCollections() {
      if (!adminDb) await initFirestore();
      if (!adminDb) {
        await fs.promises.rm(snapshotDir, { recursive: true, force: true });
        return;
      }
      await adminDb.recursiveDelete(adminDb.collection('analytics_snapshots'));
      for (const col of ['tasks', 'parent_tasks', 'access_requests']) {
        const snap = await adminDb.collection(col).get();
        for (let i = 0; i < snap.docs.length; i += FIRESTORE_CHUNK_SIZE) {
          const batch = adminDb.batch();
          for (const doc of snap.docs.slice(i, i + FIRESTORE_CHUNK_SIZE)) {
            batch.delete(doc.ref);
          }
          await batch.commit();
        }
      }
      const usersSnap = await adminDb.collection('users').get();
      for (let i = 0; i < usersSnap.docs.length; i += FIRESTORE_CHUNK_SIZE) {
        const batch = adminDb.batch();
        let count = 0;
        for (const doc of usersSnap.docs.slice(i, i + FIRESTORE_CHUNK_SIZE)) {
          const email = String(doc.data()?.email || '').toLowerCase().trim();
          if (email !== getSuperadminEmail()) {
            batch.delete(doc.ref);
            count++;
          }
        }
        if (count > 0) await batch.commit();
      }
      await fs.promises.rm(snapshotDir, { recursive: true, force: true });
      firestoreLastError = null;
    },
    async loadRecentAuditLogs(limit) {
      return readAuditTail<AuditLogEntry>(auditLogFile, limit);
    },
    async appendAuditEntry(fullEntry) {
      try {
        await fs.promises.mkdir(dataDir, { recursive: true });
        await fs.promises.appendFile(auditLogFile, JSON.stringify(fullEntry) + '\n', { encoding: 'utf-8', mode: 0o600 });
      } catch (e) {
        console.error('[Audit Log Disk Error]:', e);
      }
      if (adminDb) {
        adminDb.collection('compliance_audit_logs').doc(fullEntry.id).set(cleanDocData(fullEntry)).catch((e: any) =>
          console.error('[Audit Log Firestore Error]:', e)
        );
      }
    },
    getAuditLogFilePath() {
      return auditLogFile;
    },
    readAllAuditLogs() {
      if (!fs.existsSync(auditLogFile)) return [];
      try {
        const content = fs.readFileSync(auditLogFile, 'utf-8');
        return content
          .trim()
          .split('\n')
          .filter(Boolean)
          .map(line => {
            try {
              return JSON.parse(line) as AuditLogEntry;
            } catch {
              return null;
            }
          })
          .filter((item): item is AuditLogEntry => item !== null)
          .reverse();
      } catch {
        return [];
      }
    },
    getFirestoreStatus() {
      return {
        connected: Boolean(adminDb && firestoreInitialized),
        lastError: firestoreLastError,
        hasLocalKey:
          fs.existsSync(path.join(dataDir, 'serviceAccountKey.json')) ||
          fs.existsSync(path.join(process.cwd(), 'serviceAccountKey.json')),
      };
    },
    async saveCredentials(serviceAccountJson) {
      if (!serviceAccountJson || !serviceAccountJson.project_id || !serviceAccountJson.private_key || !serviceAccountJson.client_email) {
        return { ok: false, error: 'Invalid Firebase Service Account JSON' };
      }
      await fs.promises.mkdir(dataDir, { recursive: true });
      const keyPath = path.join(dataDir, 'serviceAccountKey.json');
      fs.writeFileSync(keyPath, JSON.stringify(serviceAccountJson, null, 2), { encoding: 'utf-8', mode: 0o600 });
      const { deleteApp, getApps } = await import('firebase-admin/app');
      const existing = getApps().find(a => a.name === FIRESTORE_APP_NAME);
      if (existing) await deleteApp(existing);
      adminDb = null;
      firestoreInitialized = false;
      await initFirestore();
      return { ok: Boolean(adminDb) };
    },
    getWebhookDb() {
      return adminDb;
    },
  };
}

export function createWorkspaceRepository(adapter: PersistenceAdapter) {
  const store: AppStore = adapter.loadInitialStore();
  let stateRevision = Date.now();
  let recentAuditLogs: AuditLogEntry[] = [];
  let lastArchiveSweepMs = 0;
  let lastSyncTime: string | undefined;
  let mutationTail = Promise.resolve();
  let purgeNeedsRetry = adapter.hasPendingPurge();
  let lastSnapshotDate: string | undefined;

  const touch = () => {
    stateRevision = Math.max(stateRevision + 1, Date.now());
  };

  // Run initial migrations & superadmin guarantee on boot
  const bootMig = migrateLegacyRolesInStore(store);
  const bootDedup = deduplicateUsersInStore(store);
  const hadSuper = store.users.some(u => isSuperadmin(u));
  ensureSuperadminInStore(store);
  if (bootMig.changed || bootDedup || !hadSuper) {
    adapter.scheduleSave(store);
  }

  return {
    runMutation<T>(operation: () => T | Promise<T>): Promise<T> {
      const result = mutationTail.then(operation);
      mutationTail = result.then(() => {}, () => {});
      return result;
    },
    purgeNeedsRetry: () => purgeNeedsRetry,
    async captureAnalyticsSnapshot(now = new Date()) {
      const { date, closing } = getAnalyticsClock(now);
      if (!closing || lastSnapshotDate === date || purgeNeedsRetry) return false;
      const users = store.users.map(({ id, name, role, createdAt, designation, isCreativeDirector,
        creativeDirectorId, isAdministrator, isBusinessLead, isClusterLead, isTeamLead }) =>
        ({ id, name, email: '', role, createdAt, designation, isCreativeDirector, creativeDirectorId,
          isAdministrator, isBusinessLead, isClusterLead, isTeamLead }));
      const tasks = store.tasks.map(({ id, userId, assigneeIds, title, status, cognitiveLoad,
        order, client, project, estimatedHours, startDate, dueDate, createdAt, updatedAt,
        inProgressStartedAt, inProgressDurationMs, activityLog }) =>
        ({ id, userId, assigneeIds, title, status, cognitiveLoad, order, client, project, estimatedHours,
          startDate, dueDate, createdAt, updatedAt, inProgressStartedAt, inProgressDurationMs,
          activityLog: activityLog?.map(({ id, timestamp, action, from, to }) => ({ id, timestamp, action, from, to })) }));
      await adapter.saveAnalyticsSnapshot({ date, capturedAt: now.toISOString(), users, tasks });
      lastSnapshotDate = date;
      return true;
    },
    loadAnalyticsSnapshot: (start: string, end: string) => adapter.loadAnalyticsSnapshot(start, end),
    getStore: () => store,
    getRevision: () => stateRevision,
    getUsers: () => store.users,
    getTasks: () => store.tasks,
    getParentTasks: () => store.parentTasks,
    getAccessRequests: () => (store.accessRequests ||= []),
    saveLocal() {
      touch();
      adapter.scheduleSave(store);
    },
    ensureSuperadmin() {
      const existed = store.users.some(u => isSuperadmin(u));
      const superUser = ensureSuperadminInStore(store);
      if (!existed) {
        this.saveLocal();
        adapter.saveUser(superUser).catch(e => console.error('Firestore superadmin sync err:', e));
      }
      return superUser;
    },
    flushSync() {
      adapter.flushSync(store);
    },
    async init() {
      await adapter.init();
      await this.syncRemote();
      await this.archiveExpiredDoneTasks();
      recentAuditLogs = await adapter.loadRecentAuditLogs(MAX_RECENT_AUDIT_LOGS);
    },
    async syncRemote() {
      try {
        const res = await adapter.syncFromRemote(store);
        if (!res) {
          purgeNeedsRetry ||= adapter.hasPendingPurge();
          return { synced: false, deletedLegacyTasks: 0 };
        }
        store.users = res.store.users;
        store.tasks = res.store.tasks;
        store.parentTasks = res.store.parentTasks;
        store.accessRequests = res.store.accessRequests || [];
        ensureSuperadminInStore(store);
        deduplicateUsersInStore(store);
        migrateLegacyRolesInStore(store);
        this.saveLocal();
        lastSyncTime = new Date().toISOString();
        return { synced: true, deletedLegacyTasks: res.deletedLegacyTasks };
      } catch (err) {
        console.error('[Firestore Sync Error]:', err);
        return { synced: false, deletedLegacyTasks: 0 };
      }
    },
    async deduplicateUsers() {
      if (purgeNeedsRetry) return false;
      if (deduplicateUsersInStore(store)) {
        this.saveLocal();
        await Promise.all([adapter.batchSaveUsers(store.users), adapter.batchSaveTasks(store.tasks)]).catch(() => {});
        return true;
      }
      return false;
    },
    async archiveExpiredDoneTasks(onArchived?: (tasks: Task[]) => void): Promise<boolean> {
      if (purgeNeedsRetry) return false;
      const newlyArchived = archiveDoneTasksDomain(store.tasks);
      if (newlyArchived.length > 0) {
        this.saveLocal();
        await adapter.batchSaveTasks(newlyArchived).catch(e =>
          console.error('[Auto-Archive] Firestore batch save error:', e)
        );
        onArchived?.(newlyArchived);
        return true;
      }
      return false;
    },
    async maybeArchive(onArchived?: (tasks: Task[]) => void) {
      const now = Date.now();
      if (now - lastArchiveSweepMs < ARCHIVE_DEBOUNCE_MS) return;
      lastArchiveSweepMs = now;
      await this.archiveExpiredDoneTasks(onArchived);
    },
    async purgeAll(): Promise<{ deletedTasks: number; deletedUsers: number; retainedUser: User }> {
      const deletedTasks = store.tasks.length;
      const nonSuperCount = store.users.filter(u => !isSuperadmin(u)).length;
      const rootAdmin = ensureSuperadminInStore(store);
      purgeNeedsRetry = true;
      await adapter.markPurgePending();
      await adapter.saveUser(rootAdmin);
      // Each retry scans the remaining documents, including after a partial batch failure.
      await adapter.purgeAllCollections();
      store.tasks = [];
      store.parentTasks = [];
      store.accessRequests = [];
      store.users = store.users.filter(u => isSuperadmin(u));
      this.saveLocal();
      if (!adapter.flushSync(store)) throw new Error('Could not persist the purged workspace locally');
      await adapter.clearPendingPurge();
      purgeNeedsRetry = false;
      return { deletedTasks, deletedUsers: nonSuperCount, retainedUser: rootAdmin };
    },
    saveUser: (user: User) => adapter.saveUser(user),
    batchSaveUsers: (users: User[]) => adapter.batchSaveUsers(users),
    deleteUser: (userId: string) => adapter.deleteUser(userId),
    saveTask: (task: Task) => adapter.saveTask(task),
    batchSaveTasks: (tasks: Task[]) => adapter.batchSaveTasks(tasks),
    deleteTask: (taskId: string) => adapter.deleteTask(taskId),
    batchDeleteTasks: (taskIds: string[]) => adapter.batchDeleteTasks(taskIds),
    savePipelineBundle: (parent: ParentTask, tasks: Task[]) => adapter.savePipelineBundle(parent, tasks),
    saveParentTask: (parentTask: ParentTask) => adapter.saveParentTask(parentTask),
    batchSaveParentTasks: (parentTasks: ParentTask[]) => adapter.batchSaveParentTasks(parentTasks),
    deleteParentTask: (parentTaskId: string) => adapter.deleteParentTask(parentTaskId),
    saveAccessRequest: (accessRequest: AccessRequest) => adapter.saveAccessRequest(accessRequest),
    appendAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'> & { id?: string; timestamp?: string }) {
      const fullEntry: AuditLogEntry = {
        id: entry.id || `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        timestamp: entry.timestamp || new Date().toISOString(),
        ...entry,
      };
      recentAuditLogs.unshift(fullEntry);
      if (recentAuditLogs.length > MAX_RECENT_AUDIT_LOGS) {
        recentAuditLogs.length = MAX_RECENT_AUDIT_LOGS;
      }
      void adapter.appendAuditEntry(fullEntry);
    },
    getRecentAuditLogs: () => recentAuditLogs,
    getAuditLogFilePath: () => adapter.getAuditLogFilePath(),
    readAllAuditLogs: () => adapter.readAllAuditLogs(),
    getFirestoreStatus: () => ({ ...adapter.getFirestoreStatus(), lastSyncTime }),
    saveCredentials: (json: Record<string, any>) => {
      lastSyncTime = undefined;
      return adapter.saveCredentials(json);
    },
    getWebhookDb: () => adapter.getWebhookDb(),
  };
}

export type WorkspaceRepository = ReturnType<typeof createWorkspaceRepository>;

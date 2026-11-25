import fs from 'node:fs';
import path from 'node:path';
import type { ParentTask, Task, User } from '../src/types';
import { readAuditTail } from './resources';
import {
  isSuperadmin,
  SUPERADMIN_EMAIL,
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
  flushSync(store: AppStore): void;
  syncFromRemote(current: AppStore): Promise<{ store: AppStore; deletedLegacyTasks: number }>;
  saveUser(user: User): Promise<void>;
  batchSaveUsers(users: User[]): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  saveTask(task: Task): Promise<void>;
  batchSaveTasks(tasks: Task[]): Promise<void>;
  deleteTask(taskId: string): Promise<void>;
  batchDeleteTasks(taskIds: string[]): Promise<void>;
  saveParentTask(parentTask: ParentTask): Promise<void>;
  batchSaveParentTasks(parentTasks: ParentTask[]): Promise<void>;
  deleteParentTask(parentTaskId: string): Promise<void>;
  purgeAllCollections(): Promise<void>;
  loadRecentAuditLogs(limit: number): Promise<AuditLogEntry[]>;
  appendAuditEntry(entry: AuditLogEntry): Promise<void>;
  readAllAuditLogs(): AuditLogEntry[];
  loadAnalyticsSnapshots(): any[];
  saveAnalyticsSnapshot(snapshot: any): Promise<void>;
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
  let existing = appStore.users.find(u => isSuperadmin(u));
  if (!existing) {
    existing = {
      id: 'user-superadmin-kiran',
      name: 'Kiran S',
      email: SUPERADMIN_EMAIL,
      role: 'administrator',
      avatarColor: 'from-blue-600 to-indigo-600',
      isAdministrator: true,
      isCreativeDirector: true,
      designation: 'Creative Director',
      createdAt: new Date().toISOString(),
    };
    appStore.users.unshift(existing);
  } else {
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
  };
  let auditLogs: AuditLogEntry[] = [];
  let snapshots: any[] = [];

  return {
    async init() {},
    loadInitialStore() {
      return {
        users: persisted.users.map(u => ({ ...u })),
        tasks: persisted.tasks.map(t => ({ ...t })),
        parentTasks: persisted.parentTasks.map(p => ({ ...p })),
      };
    },
    scheduleSave(next) {
      persisted = {
        users: next.users.map(u => ({ ...u })),
        tasks: next.tasks.map(t => ({ ...t })),
        parentTasks: next.parentTasks.map(p => ({ ...p })),
      };
    },
    flushSync(next) {
      this.scheduleSave(next);
    },
    async syncFromRemote(current) {
      return { store: current, deletedLegacyTasks: 0 };
    },
    async saveUser() {},
    async batchSaveUsers() {},
    async deleteUser() {},
    async saveTask() {},
    async batchSaveTasks() {},
    async deleteTask() {},
    async batchDeleteTasks() {},
    async saveParentTask() {},
    async batchSaveParentTasks() {},
    async deleteParentTask() {},
    async purgeAllCollections() {
      persisted = { users: [], tasks: [], parentTasks: [] };
    },
    async loadRecentAuditLogs(limit) {
      return auditLogs.slice(0, limit);
    },
    async appendAuditEntry(entry) {
      auditLogs.unshift(entry);
    },
    readAllAuditLogs() {
      return [...auditLogs];
    },
    loadAnalyticsSnapshots() {
      return [...snapshots];
    },
    async saveAnalyticsSnapshot(snapshot) {
      const idx = snapshots.findIndex(s => s.id === snapshot.id);
      if (idx >= 0) snapshots[idx] = snapshot;
      else snapshots.push(snapshot);
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
  const analyticsSnapshotFile = path.join(dataDir, 'analytics_snapshots.json');

  let adminDb: any = null;
  let firestoreInitialized = false;
  let firestoreLastError: string | null = null;
  let pendingSave: AppStore | null = null;
  let saveDebounceTimer: NodeJS.Timeout | null = null;
  let isWriting = false;

  const findServiceAccount = (): any | null => {
    const envKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (envKey) {
      try {
        if (envKey.trim().startsWith('{')) {
          return JSON.parse(envKey);
        }
        const resolvedEnvPath = path.resolve(envKey);
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

  const initFirestore = async () => {
    if (adminDb) return;
    try {
      const adminModule: any = await import('firebase-admin');
      const admin = adminModule.default || adminModule;
      const sa = findServiceAccount();
      if (sa) {
        if (!admin.apps?.length) {
          admin.initializeApp({
            credential: admin.credential.cert(sa),
            projectId: sa.project_id || process.env.FIREBASE_PROJECT_ID || 'zenflow-prod',
          });
        }
        adminDb = admin.firestore();
        firestoreInitialized = true;
        firestoreLastError = null;
      } else if (process.env.FIREBASE_PROJECT_ID || process.env.K_SERVICE || process.env.RAILWAY_ENVIRONMENT) {
        try {
          if (!admin.apps?.length) {
            admin.initializeApp({
              projectId: process.env.FIREBASE_PROJECT_ID || 'zenflow-prod',
            });
          }
          adminDb = admin.firestore();
          firestoreInitialized = true;
          firestoreLastError = null;
        } catch {
          console.log('[Firestore] No explicit credentials provided; continuing with local JSON store.');
        }
      }
    } catch (err: any) {
      firestoreLastError = err.message || String(err);
      console.warn('[Firestore] Admin SDK Initialization deferred:', firestoreLastError);
    }
  };

  const upsertDoc = async (collection: string, id: string, data: Record<string, any>) => {
    try {
      if (!adminDb) await initFirestore();
      if (adminDb) {
        await adminDb.collection(collection).doc(id).set(cleanDocData(data));
        firestoreLastError = null;
      }
    } catch (err: any) {
      firestoreLastError = err.message || String(err);
      console.error(`[Firestore Save ${collection} Error]:`, firestoreLastError);
    }
  };

  const deleteDoc = async (collection: string, id: string) => {
    try {
      if (!adminDb) await initFirestore();
      if (adminDb) {
        await adminDb.collection(collection).doc(id).delete();
        firestoreLastError = null;
      }
    } catch (err: any) {
      firestoreLastError = err.message || String(err);
      console.error(`[Firestore Delete ${collection} Error]:`, firestoreLastError);
    }
  };

  const batchUpsertDocs = async (collection: string, items: Array<{ id: string; data: Record<string, any> }>) => {
    if (items.length === 0) return;
    try {
      if (!adminDb) await initFirestore();
      if (adminDb) {
        for (let i = 0; i < items.length; i += FIRESTORE_CHUNK_SIZE) {
          const batch = adminDb.batch();
          const chunk = items.slice(i, i + FIRESTORE_CHUNK_SIZE);
          for (const item of chunk) {
            batch.set(adminDb.collection(collection).doc(item.id), cleanDocData(item.data));
          }
          await batch.commit();
        }
        firestoreLastError = null;
      }
    } catch (err: any) {
      firestoreLastError = err.message || String(err);
      console.error(`[Firestore Batch Save ${collection} Error]:`, firestoreLastError);
    }
  };

  const batchDeleteDocs = async (collection: string, ids: string[]) => {
    if (ids.length === 0) return;
    try {
      if (!adminDb) await initFirestore();
      if (adminDb) {
        for (let i = 0; i < ids.length; i += FIRESTORE_CHUNK_SIZE) {
          const batch = adminDb.batch();
          const chunk = ids.slice(i, i + FIRESTORE_CHUNK_SIZE);
          for (const id of chunk) {
            batch.delete(adminDb.collection(collection).doc(id));
          }
          await batch.commit();
        }
        firestoreLastError = null;
      }
    } catch (err: any) {
      firestoreLastError = err.message || String(err);
      console.error(`[Firestore Batch Delete ${collection} Error]:`, firestoreLastError);
    }
  };

  return {
    init: initFirestore,
    loadInitialStore(): AppStore {
      try {
        if (fs.existsSync(dataFile)) {
          const raw = fs.readFileSync(dataFile, 'utf-8');
          const parsed = JSON.parse(raw);
          const cleanUsers = (parsed.users || []).filter((u: User) => !DUMMY_USER_IDS.has(u.id));
          const cleanTasks = (parsed.tasks || []).filter((t: Task) => !DUMMY_TASK_IDS.has(t.id));
          const cleanParents = Array.isArray(parsed.parentTasks) ? parsed.parentTasks : [];
          return { users: cleanUsers, tasks: cleanTasks, parentTasks: cleanParents };
        }
      } catch (err) {
        console.error('Failed to read store.json, starting fresh:', err);
      }
      return { users: [], tasks: [], parentTasks: [] };
    },
    scheduleSave(storeToSave: AppStore) {
      pendingSave = storeToSave;
      if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
      saveDebounceTimer = setTimeout(async () => {
        if (isWriting || !pendingSave) return;
        isWriting = true;
        const dataToWrite = pendingSave;
        pendingSave = null;
        try {
          await fs.promises.mkdir(dataDir, { recursive: true });
          const tempPath = `${dataFile}.tmp.${Date.now()}`;
          await fs.promises.writeFile(tempPath, JSON.stringify(dataToWrite, null, 2), { encoding: 'utf-8', mode: 0o600 });
          await fs.promises.rename(tempPath, dataFile);
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
        fs.writeFileSync(dataFile, JSON.stringify(dataToWrite, null, 2), { encoding: 'utf-8', mode: 0o600 });
      } catch (err) {
        console.error('[Process] Failed synchronous emergency persistence:', err);
      }
    },
    async syncFromRemote(current: AppStore) {
      if (!adminDb) await initFirestore();
      if (!adminDb) return { store: current, deletedLegacyTasks: 0 };

      let nextStore = current;
      const usersSnap = await adminDb.collection('users').get();
      const tasksSnap = await adminDb.collection('tasks').get();
      const parentsSnap = await adminDb.collection('parent_tasks').get();

      const firestoreUsers = usersSnap.docs.map((d: any) => d.data() as User).filter((u: User) => !DUMMY_USER_IDS.has(u.id));
      const firestoreTasks = tasksSnap.docs.map((d: any) => d.data() as Task).filter((t: Task) => !DUMMY_TASK_IDS.has(t.id));
      const firestoreParents = parentsSnap.docs.map((d: any) => d.data() as ParentTask);

      if (firestoreUsers.length > 0 || firestoreTasks.length > 0 || firestoreParents.length > 0) {
        nextStore = {
          users: firestoreUsers,
          tasks: firestoreTasks,
          parentTasks: firestoreParents,
        };
      } else {
        await batchUpsertDocs('users', current.users.map(u => ({ id: u.id, data: u })));
        await batchUpsertDocs('tasks', current.tasks.map(t => ({ id: t.id, data: t })));
        await batchUpsertDocs('parent_tasks', current.parentTasks.map(p => ({ id: p.id, data: p })));
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
    saveParentTask: (parentTask) => upsertDoc('parent_tasks', parentTask.id, parentTask),
    batchSaveParentTasks: (parentTasks) => batchUpsertDocs('parent_tasks', parentTasks.map(p => ({ id: p.id, data: p }))),
    deleteParentTask: (parentTaskId) => deleteDoc('parent_tasks', parentTaskId),
    async purgeAllCollections() {
      if (!adminDb) await initFirestore();
      if (!adminDb) return;
      for (const col of ['tasks', 'parent_tasks']) {
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
          if (email !== SUPERADMIN_EMAIL.toLowerCase()) {
            batch.delete(doc.ref);
            count++;
          }
        }
        if (count > 0) await batch.commit();
      }
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
        adminDb.collection('audit_logs').doc(fullEntry.id).set(cleanDocData(fullEntry)).catch((e: any) =>
          console.error('[Audit Log Firestore Error]:', e)
        );
      }
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
    loadAnalyticsSnapshots() {
      try {
        if (fs.existsSync(analyticsSnapshotFile)) {
          const parsed = JSON.parse(fs.readFileSync(analyticsSnapshotFile, 'utf-8'));
          if (Array.isArray(parsed)) return parsed;
        }
      } catch (err) {
        console.error('Error loading analytics snapshots:', err);
      }
      return [];
    },
    async saveAnalyticsSnapshot(snapshot) {
      try {
        const snapshots = this.loadAnalyticsSnapshots();
        const existingIndex = snapshots.findIndex((s: any) => s.id === snapshot.id);
        if (existingIndex >= 0) snapshots[existingIndex] = snapshot;
        else snapshots.push(snapshot);
        await fs.promises.mkdir(dataDir, { recursive: true });
        await fs.promises.writeFile(analyticsSnapshotFile, JSON.stringify(snapshots, null, 2), { encoding: 'utf-8', mode: 0o600 });
        if (!adminDb) await initFirestore();
        if (adminDb) {
          await adminDb.collection('analytics_snapshots').doc(snapshot.id).set(cleanDocData(snapshot), { merge: true });
        }
      } catch (err) {
        console.error('Error saving analytics snapshot:', err);
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

  const touch = () => {
    stateRevision = Date.now();
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
    getStore: () => store,
    getRevision: () => stateRevision,
    getUsers: () => store.users,
    getTasks: () => store.tasks,
    getParentTasks: () => store.parentTasks,
    saveLocal() {
      touch();
      adapter.scheduleSave(store);
    },
    flushSync() {
      adapter.flushSync(store);
    },
    async init() {
      await adapter.init();
      await this.syncRemote();
      this.archiveExpiredDoneTasks();
      recentAuditLogs = await adapter.loadRecentAuditLogs(MAX_RECENT_AUDIT_LOGS);
    },
    async syncRemote() {
      try {
        const res = await adapter.syncFromRemote(store);
        store.users = res.store.users;
        store.tasks = res.store.tasks;
        store.parentTasks = res.store.parentTasks;
        ensureSuperadminInStore(store);
        deduplicateUsersInStore(store);
        migrateLegacyRolesInStore(store);
        this.saveLocal();
        return { synced: true, deletedLegacyTasks: res.deletedLegacyTasks };
      } catch (err) {
        console.error('[Firestore Sync Error]:', err);
        return { synced: false, deletedLegacyTasks: 0 };
      }
    },
    deduplicateUsers() {
      if (deduplicateUsersInStore(store)) {
        this.saveLocal();
        adapter.batchSaveUsers(store.users).catch(() => {});
        adapter.batchSaveTasks(store.tasks).catch(() => {});
        return true;
      }
      return false;
    },
    archiveExpiredDoneTasks(onArchived?: (tasks: Task[]) => void): boolean {
      const newlyArchived = archiveDoneTasksDomain(store.tasks);
      if (newlyArchived.length > 0) {
        this.saveLocal();
        adapter.batchSaveTasks(newlyArchived).catch(e =>
          console.error('[Auto-Archive] Firestore batch save error:', e)
        );
        onArchived?.(newlyArchived);
        return true;
      }
      return false;
    },
    maybeArchive(onArchived?: (tasks: Task[]) => void) {
      const now = Date.now();
      if (now - lastArchiveSweepMs < ARCHIVE_DEBOUNCE_MS) return;
      lastArchiveSweepMs = now;
      this.archiveExpiredDoneTasks(onArchived);
    },
    async purgeAll(): Promise<{ deletedTasks: number; deletedUsers: number; retainedUser: User }> {
      const deletedTasks = store.tasks.length;
      const nonSuperCount = store.users.filter(u => !isSuperadmin(u)).length;
      store.tasks = [];
      store.parentTasks = [];
      store.users = store.users.filter(u => isSuperadmin(u));
      const rootAdmin = ensureSuperadminInStore(store);
      this.saveLocal();
      await adapter.purgeAllCollections();
      await adapter.saveUser(rootAdmin);
      return { deletedTasks, deletedUsers: nonSuperCount, retainedUser: rootAdmin };
    },
    saveUser: (user: User) => adapter.saveUser(user),
    batchSaveUsers: (users: User[]) => adapter.batchSaveUsers(users),
    deleteUser: (userId: string) => adapter.deleteUser(userId),
    saveTask: (task: Task) => adapter.saveTask(task),
    batchSaveTasks: (tasks: Task[]) => adapter.batchSaveTasks(tasks),
    deleteTask: (taskId: string) => adapter.deleteTask(taskId),
    batchDeleteTasks: (taskIds: string[]) => adapter.batchDeleteTasks(taskIds),
    saveParentTask: (parentTask: ParentTask) => adapter.saveParentTask(parentTask),
    batchSaveParentTasks: (parentTasks: ParentTask[]) => adapter.batchSaveParentTasks(parentTasks),
    deleteParentTask: (parentTaskId: string) => adapter.deleteParentTask(parentTaskId),
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
    readAllAuditLogs: () => adapter.readAllAuditLogs(),
    loadAnalyticsSnapshots: () => adapter.loadAnalyticsSnapshots(),
    saveAnalyticsSnapshot: (snapshot: any) => adapter.saveAnalyticsSnapshot(snapshot),
    getFirestoreStatus: () => adapter.getFirestoreStatus(),
    saveCredentials: (json: Record<string, any>) => adapter.saveCredentials(json),
    getWebhookDb: () => adapter.getWebhookDb(),
  };
}

export type WorkspaceRepository = ReturnType<typeof createWorkspaceRepository>;

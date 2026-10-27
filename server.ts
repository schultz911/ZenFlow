import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import compression from 'compression';
import { createApiSecurity, redactPayload, SESSION_COOKIE, sameOriginMutation } from './server/security';
import { readAuditTail, writeSse } from './server/resources';
import { initializeApp as initializeAdminApp, getApps as getAdminApps } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';

interface User {
  id: string;
  name: string;
  email: string;
  role?: 'content' | 'design' | 'video' | 'ui_ux' | 'research' | 'account_manager' | 'administrator' | 'none';
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

interface Task {
  id: string;
  userId: string;
  title: string;
  description?: string;
  dueDate?: string;
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
}

interface AppStore {
  users: User[];
  tasks: Task[];
}

const SUPERADMIN_EMAIL = 'kiran.s@zensciences.com';

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
// Identity trust is deliberately independent of the configurable Firestore credentials.
const identityApp = getAdminApps().find(app => app.name === 'zenflow-identity') ||
  initializeAdminApp({ projectId: 'zen-flow-7173d' }, 'zenflow-identity');
const verifyIdentity = (token: string) => getAdminAuth(identityApp).verifyIdToken(token);

const recentAuditLogs: AuditLogEntry[] = [];
const MAX_RECENT_AUDIT_LOGS = 100;


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
          (t: Task) => !DUMMY_TASK_IDS.has(t.id) && !DUMMY_USER_IDS.has(t.userId)
        );
        return { users: cleanUsers, tasks: cleanTasks };
      }
    }
  } catch (err) {
    console.error('Error reading data file, using defaults:', err);
  }

  const initialStore: AppStore = {
    users: [],
    tasks: [],
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

// Input sanitizer to prevent XSS / malicious injection in titles & descriptions
function sanitizeString(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .replace(/[<>]/g, '') // Strip basic HTML tags
    .slice(0, 1000); // Enforce max string length boundary
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

    if (adminDb) {
      const usersSnap = await adminDb.collection('users').get();
      const tasksSnap = await adminDb.collection('tasks').get();

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
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://apis.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://lh3.googleusercontent.com https://*.googleusercontent.com; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com; frame-src 'self' https://*.firebaseapp.com https://accounts.google.com; frame-ancestors 'none';"
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

  app.use(express.json({ limit: '1mb' }));

  // Sliding-window rate limiters for sensitive endpoints (prevent DoS and quota depletion)
  const authLimiter = createRateLimiter(20, 60 * 1000); // 20 login attempts per minute per IP
  const firestoreLimiter = createRateLimiter(10, 60 * 1000); // 10 sync/credential submissions per minute per IP

  // Initialize and load database records from Firestore
  await syncFromFirestore();
  autoArchiveDoneTasks();
  await loadRecentAuditLogs();

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
    } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    const cleanEmail = sanitizeString(email).toLowerCase();
    const cleanName = sanitizeString(name);
    const VALID_ROLES = ['content', 'design', 'video', 'ui_ux', 'research', 'account_manager', 'administrator'] as const;
    const cleanRole = role && (VALID_ROLES as readonly string[]).includes(role) ? role : (role === 'none' ? undefined : (role || undefined));
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
    const VALID_ROLES = ['content', 'design', 'video', 'ui_ux', 'research', 'account_manager', 'administrator'] as const;
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

    // Collect and remove all tasks belonging to this user
    const deletedTaskIds: string[] = [];
    store.tasks = store.tasks.filter(t => {
      if (t.userId === id) {
        deletedTaskIds.push(t.id);
        return false;
      }
      return true;
    });

    saveStore(store);

    // Asynchronously delete user and tasks from Firestore if connected
    dbDeleteUser(removedUser.id).catch(e => console.error('Firestore user delete err:', e));
    if (deletedTaskIds.length > 0) {
      dbBatchDeleteTasks(deletedTaskIds).catch(e => console.error('Firestore batch delete tasks err:', e));
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

  // API: Create a task
  app.post('/api/tasks', (req: Request, res: Response) => {
    const {
      id: reqId,
      userId,
      title,
      description,
      dueDate,
      cognitiveLoad,
      status,
    } = req.body;

    // Idempotency guard for offline mutation replay: if task with this ID already exists, return it
    if (reqId && typeof reqId === 'string') {
      const existingTask = store.tasks.find(t => t.id === reqId);
      if (existingTask) {
        return res.status(200).json(existingTask);
      }
    }

    const cleanTitle = sanitizeString(title);
    if (!userId || !cleanTitle) {
      return res.status(400).json({ error: 'userId and title are required' });
    }

    const userExists = store.users.some(u => u.id === userId);
    if (!userExists) {
      return res.status(400).json({ error: 'User does not exist in workspace' });
    }

    // Determine order: place at end of that status for this user
    const existingInStatus = store.tasks.filter(
      t => t.userId === userId && t.status === (status || 'todo')
    );
    const maxOrder = existingInStatus.reduce((max, t) => Math.max(max, t.order ?? 0), -1);

    const cleanStatus = ['pipeline', 'retainer', 'todo', 'in_progress', 'in_review', 'done', 'archived'].includes(status) ? status : 'todo';
    const cleanDueDate = dueDate ? sanitizeString(dueDate) : undefined;
    if (cleanStatus !== 'pipeline' && cleanStatus !== 'retainer' && !cleanDueDate) {
      return res.status(400).json({ error: 'A deadline is required when adding tasks to active workflow lanes' });
    }
    const isDone = cleanStatus === 'done';
    const isInProgress = cleanStatus === 'in_progress';
    const taskId = (reqId && typeof reqId === 'string') ? sanitizeString(reqId) : `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const initialActivity: TaskActivity = {
      id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      action: 'created',
      to: cleanStatus,
      details: `Created in ${cleanStatus.replace('_', ' ')}`,
    };

    const newTask: Task = {
      id: taskId,
      userId,
      title: cleanTitle,
      description: description ? sanitizeString(description) : undefined,
      dueDate: cleanDueDate,
      cognitiveLoad: ['low', 'medium', 'high'].includes(cognitiveLoad) ? cognitiveLoad : 'medium',
      status: cleanStatus,
      order: maxOrder + 1,
      completedAt: isDone ? new Date().toISOString() : undefined,
      inProgressStartedAt: isInProgress ? new Date().toISOString() : undefined,
      inProgressDurationMs: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      activityLog: [initialActivity],
    };

    store.tasks.push(newTask);
    saveStore(store);
    dbSaveTask(newTask).catch(e => console.error('Firestore task create err:', e));

    broadcastEvent('task_created', newTask);
    appendAuditLog({
      category: 'task',
      action: 'task_created',
      actor: { ip: req.ip },
      targetId: newTask.id,
      targetType: 'task',
      details: `Task "${newTask.title}" created for user ${userId}`,
      metadata: { status: newTask.status, cognitiveLoad: newTask.cognitiveLoad, dueDate: newTask.dueDate },
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
    const caller = (req as any).user;
    const actorDisplayName = caller?.name || caller?.email || 'User';

    const initialActivity: TaskActivity = {
      id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: now,
      action: 'created',
      actorName: actorDisplayName,
      details: `Subtask created from "${sourceTask.title}" and assigned to ${targetUser.name} by ${actorDisplayName}`,
    };

    const newTask: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      userId: targetUser.id,
      title: title ? title.trim() : `Subtask: ${sourceTask.title}`,
      description: description !== undefined ? description.trim() : (sourceTask.description || ''),
      dueDate: resolvedDueDate,
      cognitiveLoad: cognitiveLoad || sourceTask.cognitiveLoad || 'medium',
      status: resolvedStatus,
      order: maxOrder + 1,
      completedAt: resolvedStatus === 'done' ? now : undefined,
      inProgressStartedAt: resolvedStatus === 'in_progress' ? now : undefined,
      inProgressDurationMs: 0,
      isSubtask: true,
      parentTaskId: sourceTask.id,
      parentTaskTitle: sourceTask.title,
      createdAt: now,
      updatedAt: now,
      activityLog: [initialActivity],
    };

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
    const {
      title,
      description,
      dueDate,
      cognitiveLoad,
      status,
      userId,
      order,
      completedAt: reqCompletedAt,
      inProgressDurationMs: reqDurationMs,
      inProgressStartedAt: reqStartedAt,
      adjustmentReason,
      actorName,
    } = req.body;

    if (title !== undefined) {
      const cleanTitle = sanitizeString(title);
      if (!cleanTitle) {
        return res.status(400).json({ error: 'Task title cannot be empty' });
      }
    }

    if (userId !== undefined && userId !== currentTask.userId) {
      const userExists = store.users.some(u => u.id === userId);
      if (!userExists) {
        return res.status(400).json({ error: 'Target user does not exist in workspace' });
      }
    }

    const targetStatus = status && ['pipeline', 'retainer', 'todo', 'in_progress', 'in_review', 'done', 'archived'].includes(status) ? status : currentTask.status;

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

    if (userId !== undefined && userId !== currentTask.userId) {
      const oldUser = store.users.find(u => u.id === currentTask.userId)?.name || currentTask.userId;
      const newUser = store.users.find(u => u.id === userId)?.name || userId;
      activityEntries.unshift({
        id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toISOString(),
        action: 'reassigned',
        from: oldUser,
        to: newUser,
        details: `Reassigned from ${oldUser} to ${newUser}`,
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

    const updatedTask: Task = {
      ...currentTask,
      title: title !== undefined ? sanitizeString(title) : currentTask.title,
      description: description !== undefined ? (description ? sanitizeString(description) : undefined) : currentTask.description,
      dueDate: resolvedDueDate,
      cognitiveLoad: cognitiveLoad && ['low', 'medium', 'high'].includes(cognitiveLoad) ? cognitiveLoad : currentTask.cognitiveLoad,
      status: targetStatus,
      userId: userId || currentTask.userId,
      order: typeof order === 'number' ? order : currentTask.order,
      completedAt,
      inProgressStartedAt,
      inProgressDurationMs,
      updatedAt: new Date().toISOString(),
      activityLog: activityEntries.slice(0, 15),
    };

    store.tasks[taskIndex] = updatedTask;
    saveStore(store);
    dbSaveTask(updatedTask).catch(e => console.error('Firestore task update err:', e));

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

  // API: Delete a task
  app.delete('/api/tasks/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const taskIndex = store.tasks.findIndex(t => t.id === id);

    if (taskIndex === -1) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const removed = store.tasks.splice(taskIndex, 1)[0];
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
      metadata: { userId: removed.userId,  },
    });
    res.json({ success: true, id: removed.id });
  });

  // API: Reorder tasks / move between statuses
  app.post('/api/tasks/reorder', (req: Request, res: Response) => {
    const { updates } = req.body; // Array of { id, status, order, userId }
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

    const modifiedTasks: Task[] = [];

    for (const update of updates) {
      if (!update || typeof update !== 'object' || !update.id) continue;
      const task = taskMap.get(update.id);
      if (task) {
        if (!task.activityLog) task.activityLog = [];

        if (update.userId && typeof update.userId === 'string' && userMap.has(update.userId) && update.userId !== task.userId) {
          const oldUser = userMap.get(task.userId)?.name || task.userId;
          const newUser = userMap.get(update.userId)?.name || update.userId;
          task.activityLog.unshift({
            id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            timestamp: new Date().toISOString(),
            action: 'reassigned',
            from: oldUser,
            to: newUser,
            details: `Reassigned from ${oldUser} to ${newUser}`,
          });
          task.userId = update.userId;
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

      }
    }

    saveStore(store);
    if (modifiedTasks.length > 0) {
      dbBatchSaveTasks(modifiedTasks).catch(e => console.error('Firestore batch reorder err:', e));
    }

    broadcastEvent('tasks_reordered', modifiedTasks);

    res.json({ success: true, tasks: modifiedTasks });
  });

  // ==========================================
  // CLICKUP INTEGRATION (REMOVED - 410 GONE)
  // ==========================================
  app.all('/api/clickup/*', (_req: Request, res: Response) => {
    res.status(410).json({ error: 'ClickUp integration has been removed. ZenFlow operates in standalone mode.' });
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

import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import compression from 'compression';


import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore as getWebFirestore,
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'content' | 'design';
  avatarColor?: string;
  createdAt: string;
}

interface Task {
  id: string;
  userId: string;
  title: string;
  description?: string;
  dueDate?: string;
  cognitiveLoad: 'low' | 'medium' | 'high';
  status: 'todo' | 'in_progress' | 'in_review' | 'done' | 'archived';
  order: number;
  createdAt: string;
  updatedAt: string;
}

interface AppStore {
  users: User[];
  tasks: Task[];
}

// Support Railway dynamic PORT or default to 3000
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

// Auto-detect production mode if running compiled dist artifact or in container environments
if (!process.env.NODE_ENV && (__filename.includes('dist') || !__filename.endsWith('.ts'))) {
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
      if (!fs.existsSync(DATA_DIR)) {
        await fs.promises.mkdir(DATA_DIR, { recursive: true });
      }
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

// Database drivers: Admin SDK (with Service Account) or Web SDK (with API Keys)
let adminDb: any = null;
let webDb: any = null;
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

  return null;
}

let initPromise: Promise<void> | null = null;

async function initFirestore() {
  if (adminDb || webDb) return;
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

          const adminApps = adminAppModule.getApps();
          const adminApp = adminApps.length === 0
            ? adminAppModule.initializeApp({
                credential: adminAppModule.cert(serviceAccountObj),
                projectId: firestoreProjectId,
              })
            : adminAppModule.getApp();

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

      // 2. Fallback to Web Client SDK if apiKey + projectId is provided
      const fbConfig = {
        apiKey: process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || fileConfig.apiKey || '',
        projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || fileConfig.projectId || firestoreProjectId,
        appId: process.env.FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID || fileConfig.appId || '',
        authDomain: process.env.FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN || fileConfig.authDomain || '',
      };

      if (fbConfig.apiKey && fbConfig.projectId) {
        try {
          const fbApp = getApps().length === 0 ? initializeApp(fbConfig) : getApp();
          webDb = getWebFirestore(fbApp);
          firestoreMode = 'web';
          firestoreProjectId = fbConfig.projectId;
          console.log('[Firestore Web] Initialized Firestore Web SDK for project:', fbConfig.projectId);
        } catch (err: any) {
          firestoreLastError = err.message || String(err);
          console.warn('[Firestore Web] Initialization warning, using local resilient store:', err);
        }
      }
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

// Unified DB helper methods with error tracking & auto-recovery
async function dbSaveUser(user: User) {
  try {
    if (!adminDb && !webDb) await initFirestore();
    const payload = cleanDocData(user);
    if (adminDb) {
      await adminDb.collection('users').doc(user.id).set(payload, { merge: true });
      firestoreLastError = null;
    } else if (webDb) {
      await setDoc(doc(webDb, 'users', user.id), payload, { merge: true });
      firestoreLastError = null;
    }
  } catch (err: any) {
    firestoreLastError = err.message || String(err);
    console.error('[Firestore Save User Error]:', firestoreLastError);
  }
}

async function dbSaveTask(task: Task) {
  try {
    if (!adminDb && !webDb) await initFirestore();
    const payload = cleanDocData(task);
    if (adminDb) {
      await adminDb.collection('tasks').doc(task.id).set(payload, { merge: true });
      firestoreLastError = null;
    } else if (webDb) {
      await setDoc(doc(webDb, 'tasks', task.id), payload, { merge: true });
      firestoreLastError = null;
    }
  } catch (err: any) {
    firestoreLastError = err.message || String(err);
    console.error('[Firestore Save Task Error]:', firestoreLastError);
  }
}

async function dbDeleteTask(taskId: string) {
  try {
    if (!adminDb && !webDb) await initFirestore();
    if (adminDb) {
      await adminDb.collection('tasks').doc(taskId).delete();
      firestoreLastError = null;
    } else if (webDb) {
      await deleteDoc(doc(webDb, 'tasks', taskId));
      firestoreLastError = null;
    }
  } catch (err: any) {
    firestoreLastError = err.message || String(err);
    console.error('[Firestore Delete Task Error]:', firestoreLastError);
  }
}

async function dbBatchSaveUsers(users: User[]) {
  if (users.length === 0) return;
  try {
    if (!adminDb && !webDb) await initFirestore();
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
      } else if (webDb) {
        const batch = writeBatch(webDb);
        for (const u of chunk) {
          batch.set(doc(webDb, 'users', u.id), cleanDocData(u), { merge: true });
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
    if (!adminDb && !webDb) await initFirestore();
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
      } else if (webDb) {
        const batch = writeBatch(webDb);
        for (const t of chunk) {
          batch.set(doc(webDb, 'tasks', t.id), cleanDocData(t), { merge: true });
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
  if (!adminDb && !webDb) {
    await initFirestore();
    if (!adminDb && !webDb) return;
  }

  try {
    const demoUserIds = new Set(['user-1', 'user-2', 'user-3', 'user-4']);
    const firestoreUsers: User[] = [];
    const firestoreTasks: Task[] = [];

    if (adminDb) {
      const usersSnap = await adminDb.collection('users').get();
      const tasksSnap = await adminDb.collection('tasks').get();

      usersSnap.forEach((d: any) => {
        const u = d.data() as User;
        if (!demoUserIds.has(u.id) && !u.email?.endsWith('@acme.studio')) {
          firestoreUsers.push(u);
        }
      });

      tasksSnap.forEach((d: any) => {
        const t = d.data() as Task;
        if (
          !t.id.startsWith('task-10') &&
          !t.id.startsWith('task-20') &&
          !t.id.startsWith('task-30') &&
          !t.id.startsWith('task-40') &&
          !demoUserIds.has(t.userId)
        ) {
          firestoreTasks.push(t);
        }
      });
    } else if (webDb) {
      const usersSnap = await getDocs(collection(webDb, 'users'));
      const tasksSnap = await getDocs(collection(webDb, 'tasks'));

      usersSnap.forEach(d => {
        const u = d.data() as User;
        if (!demoUserIds.has(u.id) && !u.email?.endsWith('@acme.studio')) {
          firestoreUsers.push(u);
        }
      });

      tasksSnap.forEach(d => {
        const t = d.data() as Task;
        if (
          !t.id.startsWith('task-10') &&
          !t.id.startsWith('task-20') &&
          !t.id.startsWith('task-30') &&
          !t.id.startsWith('task-40') &&
          !demoUserIds.has(t.userId)
        ) {
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
};

let clients: SSEClient[] = [];
let nextClientId = 1;
const MAX_SSE_CLIENTS = 100;

function broadcastEvent(type: string, payload: any) {
  const eventData = JSON.stringify({
    type,
    payload,
    timestamp: Date.now(),
  });

  const message = `event: update\ndata: ${eventData}\n\n`;

  // Actively prune dead or closed SSE sockets to eliminate memory leaks
  clients = clients.filter(client => {
    try {
      if (client.res.writableEnded || client.res.destroyed) {
        return false;
      }
      client.res.write(message);
      return true;
    } catch {
      return false;
    }
  });
}

async function startServer() {
  const app = express();

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
  app.use((req: Request, res: Response, next) => {
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    next();
  });

  app.use(express.json({ limit: '1mb' }));

  // Sliding-window rate limiters for sensitive endpoints (prevent DoS and quota depletion)
  const authLimiter = createRateLimiter(20, 60 * 1000); // 20 login attempts per minute per IP
  const firestoreLimiter = createRateLimiter(10, 60 * 1000); // 10 sync/credential submissions per minute per IP

  // Initialize and load database records from Firestore
  await syncFromFirestore();

  // API: Health check
  app.get('/api/health', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // API: Get entire state with ETag conditional validation (HTTP 304 Not Modified)
  app.get('/api/state', (req: Request, res: Response) => {
    const etag = `W/"zenflow-rev-${stateRevision}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');

    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    res.json({
      users: store.users,
      tasks: store.tasks,
    });
  });

  // API: Simple Login / Register with Name, Role, Email
  app.post('/api/auth/login', authLimiter, (req: Request, res: Response) => {
    const { name, email, role } = req.body;

    if (!name || !email || !role) {
      return res.status(400).json({ error: 'Name, email, and role are required' });
    }

    const cleanEmail = sanitizeString(email).toLowerCase();
    const cleanName = sanitizeString(name);
    const cleanRole = (role === 'design' ? 'design' : 'content') as 'content' | 'design';

    if (!cleanEmail || !cleanName) {
      return res.status(400).json({ error: 'Valid name and email are required' });
    }

    let existingUser = store.users.find(u => u.email.toLowerCase() === cleanEmail);

    if (existingUser) {
      // If user already exists, update name or role if changed
      let changed = false;
      if (existingUser.name !== cleanName || existingUser.role !== cleanRole) {
        existingUser.name = cleanName;
        existingUser.role = cleanRole;
        changed = true;
      }
      if (changed) {
        saveStore(store);
        dbSaveUser(existingUser).catch(e => console.error('Firestore user update err:', e));
        broadcastEvent('user_updated', existingUser);
      }
      return res.json({ user: existingUser, isNew: false });
    }

    // New user created: a new swimlane is automatically formed on their role tab
    const colorIndex = store.users.length % AVATAR_COLORS.length;
    const newUser: User = {
      id: `user-${Date.now()}`,
      name: cleanName,
      email: cleanEmail,
      role: cleanRole,
      avatarColor: AVATAR_COLORS[colorIndex],
      createdAt: new Date().toISOString(),
    };

    store.users.push(newUser);
    saveStore(store);
    dbSaveUser(newUser).catch(e => console.error('Firestore user create err:', e));

    broadcastEvent('user_created', newUser);
    return res.status(201).json({ user: newUser, isNew: true });
  });

  // API: Get all users with ETag conditional validation (HTTP 304 Not Modified)
  app.get('/api/users', (req: Request, res: Response) => {
    const etag = `W/"zenflow-users-${stateRevision}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');

    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    res.json(store.users);
  });

  // API: Create a user explicitly
  app.post('/api/users', (req: Request, res: Response) => {
    const { name, email, role } = req.body;
    if (!name || !email || !role) {
      return res.status(400).json({ error: 'Name, email, and role are required' });
    }

    const cleanEmail = sanitizeString(email).toLowerCase();
    const cleanName = sanitizeString(name);
    const cleanRole = role === 'design' ? 'design' : 'content';

    if (!cleanEmail || !cleanName) {
      return res.status(400).json({ error: 'Valid name and email are required' });
    }

    const existingUser = store.users.find(u => u.email.toLowerCase() === cleanEmail);
    if (existingUser) {
      existingUser.name = cleanName;
      existingUser.role = cleanRole;
      saveStore(store);
      dbSaveUser(existingUser).catch(e => console.error('Firestore user update err:', e));
      broadcastEvent('user_updated', existingUser);
      return res.json(existingUser);
    }

    const colorIndex = store.users.length % AVATAR_COLORS.length;
    const newUser: User = {
      id: `user-${Date.now()}`,
      name: cleanName,
      email: cleanEmail,
      role: cleanRole,
      avatarColor: AVATAR_COLORS[colorIndex],
      createdAt: new Date().toISOString(),
    };

    store.users.push(newUser);
    saveStore(store);
    dbSaveUser(newUser).catch(e => console.error('Firestore user create err:', e));

    broadcastEvent('user_created', newUser);
    res.status(201).json(newUser);
  });

  // API: Get all tasks with ETag conditional validation (HTTP 304 Not Modified)
  app.get('/api/tasks', (req: Request, res: Response) => {
    const etag = `W/"zenflow-tasks-${stateRevision}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');

    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    res.json(store.tasks);
  });

  // API: Create a task
  app.post('/api/tasks', (req: Request, res: Response) => {
    const { userId, title, description, dueDate, cognitiveLoad, status } = req.body;

    const cleanTitle = sanitizeString(title);
    if (!userId || !cleanTitle) {
      return res.status(400).json({ error: 'userId and title are required' });
    }

    // Determine order: place at end of that status for this user
    const existingInStatus = store.tasks.filter(
      t => t.userId === userId && t.status === (status || 'todo')
    );
    const maxOrder = existingInStatus.reduce((max, t) => Math.max(max, t.order ?? 0), -1);

    const newTask: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      userId,
      title: cleanTitle,
      description: description ? sanitizeString(description) : undefined,
      dueDate: dueDate ? sanitizeString(dueDate) : undefined,
      cognitiveLoad: ['low', 'medium', 'high'].includes(cognitiveLoad) ? cognitiveLoad : 'medium',
      status: ['todo', 'in_progress', 'in_review', 'done', 'archived'].includes(status) ? status : 'todo',
      order: maxOrder + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    store.tasks.push(newTask);
    saveStore(store);
    dbSaveTask(newTask).catch(e => console.error('Firestore task create err:', e));

    broadcastEvent('task_created', newTask);
    res.status(201).json(newTask);
  });

  // API: Update a task
  app.put('/api/tasks/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const taskIndex = store.tasks.findIndex(t => t.id === id);

    if (taskIndex === -1) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const currentTask = store.tasks[taskIndex];
    const { title, description, dueDate, cognitiveLoad, status, userId, order } = req.body;

    const updatedTask: Task = {
      ...currentTask,
      title: title !== undefined ? sanitizeString(title) : currentTask.title,
      description: description !== undefined ? (description ? sanitizeString(description) : undefined) : currentTask.description,
      dueDate: dueDate !== undefined ? (dueDate ? sanitizeString(dueDate) : undefined) : currentTask.dueDate,
      cognitiveLoad: cognitiveLoad && ['low', 'medium', 'high'].includes(cognitiveLoad) ? cognitiveLoad : currentTask.cognitiveLoad,
      status: status && ['todo', 'in_progress', 'in_review', 'done', 'archived'].includes(status) ? status : currentTask.status,
      userId: userId || currentTask.userId,
      order: typeof order === 'number' ? order : currentTask.order,
      updatedAt: new Date().toISOString(),
    };

    store.tasks[taskIndex] = updatedTask;
    saveStore(store);
    dbSaveTask(updatedTask).catch(e => console.error('Firestore task update err:', e));

    broadcastEvent('task_updated', updatedTask);
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
    res.json({ success: true, id: removed.id });
  });

  // API: Reorder tasks / move between statuses
  app.post('/api/tasks/reorder', (req: Request, res: Response) => {
    const { updates } = req.body; // Array of { id, status, order }
    if (!Array.isArray(updates) || updates.length > 500) {
      return res.status(400).json({ error: 'updates array is required and must contain at most 500 items' });
    }

    const modifiedTasks: Task[] = [];

    for (const update of updates) {
      const task = store.tasks.find(t => t.id === update.id);
      if (task) {
        if (update.userId && typeof update.userId === 'string') {
          task.userId = update.userId;
        }
        if (update.status && ['todo', 'in_progress', 'in_review', 'done', 'archived'].includes(update.status)) {
          task.status = update.status;
        }
        if (typeof update.order === 'number') {
          task.order = update.order;
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

  // API: Firestore status & health check
  app.get('/api/firestore/status', (req: Request, res: Response) => {
    res.json({
      connected: !!adminDb || !!webDb,
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
      fs.writeFileSync(keyPath, JSON.stringify(parsed, null, 2), 'utf-8');

      initPromise = null;
      adminDb = null;
      webDb = null;
      await initFirestore();
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
  app.post('/api/firestore/sync', firestoreLimiter, async (req: Request, res: Response) => {
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
    const newClient: SSEClient = { id: clientId, res };
    clients.push(newClient);

    // Initial greeting and full sync
    const initialSync = JSON.stringify({
      type: 'connected',
      payload: { clientId, serverTime: Date.now() },
    });
    res.write(`event: init\ndata: ${initialSync}\n\n`);

    // Periodic heartbeat to keep connections open across network proxies
    const heartbeatInterval = setInterval(() => {
      if (res.destroyed || res.writableEnded) {
        clearInterval(heartbeatInterval);
        return;
      }
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeatInterval);
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
    app.get('*', (req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
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
  app.use((err: any, req: Request, res: Response, _next: () => void) => {
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

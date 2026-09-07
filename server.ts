import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import {
  initializeApp as initAdminApp,
  cert as adminCert,
  getApps as getAdminApps,
  getApp as getAdminApp,
} from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
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

// Color palette options for user avatars
const AVATAR_COLORS = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-purple-500 to-violet-600',
  'from-cyan-500 to-blue-600',
];

// Initial default seed state (empty for clean project)
const SEED_USERS: User[] = [];

const SEED_TASKS: Task[] = [];

// Persistent state manager
function loadStore(): AppStore {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed.users) && Array.isArray(parsed.tasks)) {
        // Filter out any leftover sample users and tasks
        const cleanUsers = parsed.users.filter(
          (u: User) => !['user-1', 'user-2', 'user-3', 'user-4'].includes(u.id) && !u.email?.endsWith('@acme.studio')
        );
        const cleanTasks = parsed.tasks.filter(
          (t: Task) => !['task-101', 'task-102', 'task-103', 'task-104', 'task-201', 'task-202', 'task-203', 'task-301', 'task-302', 'task-303', 'task-304', 'task-401', 'task-402', 'task-403'].includes(t.id)
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

function saveStore(store: AppStore) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist store:', err);
  }
}

// In-memory active store
let store: AppStore = loadStore();

// Database drivers: Admin SDK (with Service Account) or Web SDK (with API Keys)
let adminDb: any = null;
let webDb: any = null;

function initFirestore() {
  // 1. Check for Service Account Key (JSON string, file path, or ./serviceAccountKey.json)
  const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const localKeyPath = path.join(process.cwd(), 'serviceAccountKey.json');

  let serviceAccountObj: any = null;
  if (serviceAccountEnv) {
    const trimmed = serviceAccountEnv.trim();
    if (trimmed.startsWith('{')) {
      try {
        serviceAccountObj = JSON.parse(trimmed);
      } catch (e) {
        console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY as JSON:', e);
      }
    } else if (fs.existsSync(trimmed)) {
      try {
        serviceAccountObj = JSON.parse(fs.readFileSync(trimmed, 'utf-8'));
      } catch (e) {
        console.error('Failed to read service account key from file:', trimmed, e);
      }
    }
  } else if (fs.existsSync(localKeyPath)) {
    try {
      serviceAccountObj = JSON.parse(fs.readFileSync(localKeyPath, 'utf-8'));
    } catch (e) {
      console.error('Failed to read ./serviceAccountKey.json:', e);
    }
  }

  if (serviceAccountObj) {
    try {
      const adminApp = getAdminApps().length === 0
        ? initAdminApp({
            credential: adminCert(serviceAccountObj),
            projectId: serviceAccountObj.project_id || 'zen-flow',
          })
        : getAdminApp();

      const dbId = process.env.FIREBASE_DATABASE_ID || undefined;
      adminDb = dbId ? getAdminFirestore(adminApp, dbId) : getAdminFirestore(adminApp);
      console.log('[Firestore Admin] Initialized with Service Account Key for project:', serviceAccountObj.project_id || 'zen-flow');
      return;
    } catch (err) {
      console.warn('[Firestore Admin] Failed to initialize admin SDK with service account:', err);
    }
  }

  // 2. Fallback to Web Client SDK if apiKey + projectId is provided
  let fileConfig: any = {};
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (err) {
    // fallback to env vars
  }

  const fbConfig = {
    apiKey: process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || fileConfig.apiKey || '',
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || fileConfig.projectId || 'zen-flow',
    appId: process.env.FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID || fileConfig.appId || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN || fileConfig.authDomain || '',
    firestoreDatabaseId: process.env.FIREBASE_DATABASE_ID || process.env.VITE_FIREBASE_DATABASE_ID || fileConfig.firestoreDatabaseId || undefined,
  };

  if (fbConfig.apiKey && fbConfig.projectId) {
    try {
      const fbApp = getApps().length === 0 ? initializeApp(fbConfig) : getApp();
      webDb = fbConfig.firestoreDatabaseId
        ? getWebFirestore(fbApp, fbConfig.firestoreDatabaseId)
        : getWebFirestore(fbApp);
      console.log('[Firestore Web] Initialized Firestore Web SDK for project:', fbConfig.projectId);
    } catch (err) {
      console.warn('[Firestore Web] Initialization warning, using local file store:', err);
    }
  }
}

initFirestore();

// Unified DB helper methods
async function dbSaveUser(user: User) {
  if (adminDb) {
    await adminDb.collection('users').doc(user.id).set(user, { merge: true });
  } else if (webDb) {
    await setDoc(doc(webDb, 'users', user.id), user, { merge: true });
  }
}

async function dbSaveTask(task: Task) {
  if (adminDb) {
    await adminDb.collection('tasks').doc(task.id).set(task, { merge: true });
  } else if (webDb) {
    await setDoc(doc(webDb, 'tasks', task.id), task, { merge: true });
  }
}

async function dbDeleteTask(taskId: string) {
  if (adminDb) {
    await adminDb.collection('tasks').doc(taskId).delete();
  } else if (webDb) {
    await deleteDoc(doc(webDb, 'tasks', taskId));
  }
}

async function dbBatchSaveTasks(tasks: Task[]) {
  if (tasks.length === 0) return;
  if (adminDb) {
    const batch = adminDb.batch();
    for (const t of tasks) {
      batch.set(adminDb.collection('tasks').doc(t.id), t, { merge: true });
    }
    await batch.commit();
  } else if (webDb) {
    const batch = writeBatch(webDb);
    for (const t of tasks) {
      batch.set(doc(webDb, 'tasks', t.id), t, { merge: true });
    }
    await batch.commit();
  }
}

// Sync existing users and tasks from Firestore, purging any legacy sample/demo items
async function syncFromFirestore() {
  if (!adminDb && !webDb) return;
  try {
    const demoUserIds = new Set(['user-1', 'user-2', 'user-3', 'user-4']);
    const firestoreUsers: User[] = [];
    const firestoreTasks: Task[] = [];

    if (adminDb) {
      const usersSnap = await adminDb.collection('users').get();
      const tasksSnap = await adminDb.collection('tasks').get();
      const batch = adminDb.batch();
      let hasPurges = false;

      usersSnap.forEach((d: any) => {
        const u = d.data() as User;
        if (demoUserIds.has(u.id) || u.email?.endsWith('@acme.studio')) {
          batch.delete(d.ref);
          hasPurges = true;
        } else {
          firestoreUsers.push(u);
        }
      });

      tasksSnap.forEach((d: any) => {
        const t = d.data() as Task;
        if (
          t.id.startsWith('task-10') ||
          t.id.startsWith('task-20') ||
          t.id.startsWith('task-30') ||
          t.id.startsWith('task-40') ||
          demoUserIds.has(t.userId)
        ) {
          batch.delete(d.ref);
          hasPurges = true;
        } else {
          firestoreTasks.push(t);
        }
      });

      if (hasPurges) {
        await batch.commit();
        console.log('[Firestore Admin] Purged all legacy sample documents from Firestore.');
      }
    } else if (webDb) {
      const usersSnap = await getDocs(collection(webDb, 'users'));
      const tasksSnap = await getDocs(collection(webDb, 'tasks'));
      const batch = writeBatch(webDb);
      let hasPurges = false;

      usersSnap.forEach(d => {
        const u = d.data() as User;
        if (demoUserIds.has(u.id) || u.email?.endsWith('@acme.studio')) {
          batch.delete(d.ref);
          hasPurges = true;
        } else {
          firestoreUsers.push(u);
        }
      });

      tasksSnap.forEach(d => {
        const t = d.data() as Task;
        if (
          t.id.startsWith('task-10') ||
          t.id.startsWith('task-20') ||
          t.id.startsWith('task-30') ||
          t.id.startsWith('task-40') ||
          demoUserIds.has(t.userId)
        ) {
          batch.delete(d.ref);
          hasPurges = true;
        } else {
          firestoreTasks.push(t);
        }
      });

      if (hasPurges) {
        await batch.commit();
        console.log('[Firestore Web] Purged all legacy sample documents from Firestore.');
      }
    }

    store.users = firestoreUsers;
    store.tasks = firestoreTasks;
    saveStore(store);
    console.log(`[Firestore] Database ready: ${firestoreUsers.length} user(s), ${firestoreTasks.length} task(s).`);
  } catch (err) {
    console.warn('[Firestore] Sync warning, retaining local store:', err);
  }
}

// Complete purge of all user and task records across Firestore, memory, and disk
async function clearAllDataFromDb() {
  store.users = [];
  store.tasks = [];
  saveStore(store);

  if (adminDb) {
    try {
      const usersSnap = await adminDb.collection('users').get();
      const tasksSnap = await adminDb.collection('tasks').get();
      const batch = adminDb.batch();
      usersSnap.forEach((d: any) => batch.delete(d.ref));
      tasksSnap.forEach((d: any) => batch.delete(d.ref));
      await batch.commit();
      console.log('[Firestore Admin] Purged all documents from Firestore collections.');
    } catch (err) {
      console.warn('[Firestore Admin] Error purging documents:', err);
    }
  } else if (webDb) {
    try {
      const usersSnap = await getDocs(collection(webDb, 'users'));
      const tasksSnap = await getDocs(collection(webDb, 'tasks'));
      const batch = writeBatch(webDb);
      usersSnap.forEach(d => batch.delete(d.ref));
      tasksSnap.forEach(d => batch.delete(d.ref));
      await batch.commit();
      console.log('[Firestore Web] Purged all documents from Firestore collections.');
    } catch (err) {
      console.warn('[Firestore Web] Error purging documents:', err);
    }
  }

  broadcastEvent('sync_all', { users: [], tasks: [] });
}

// Connected clients for Server-Sent Events (SSE) real-time broadcasting
type SSEClient = {
  id: number;
  res: Response;
};

let clients: SSEClient[] = [];
let nextClientId = 1;

function broadcastEvent(type: string, payload: any) {
  const eventData = JSON.stringify({
    type,
    payload,
    timestamp: Date.now(),
  });

  const message = `event: update\ndata: ${eventData}\n\n`;

  clients.forEach(client => {
    try {
      client.res.write(message);
    } catch {
      // client disconnected
    }
  });
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // Initialize and load database records from Firestore
  await syncFromFirestore();

  // API: Health check
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // API: Get entire state
  app.get('/api/state', (req: Request, res: Response) => {
    res.json({
      users: store.users,
      tasks: store.tasks,
    });
  });

  // API: Simple Login / Register with Name, Role, Email
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { name, email, role } = req.body;

    if (!name || !email || !role) {
      return res.status(400).json({ error: 'Name, email, and role are required' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanName = String(name).trim();
    const cleanRole = (role === 'design' ? 'design' : 'content') as 'content' | 'design';

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

  // API: Get all users
  app.get('/api/users', (req: Request, res: Response) => {
    res.json(store.users);
  });

  // API: Create a user explicitly
  app.post('/api/users', (req: Request, res: Response) => {
    const { name, email, role } = req.body;
    if (!name || !email || !role) {
      return res.status(400).json({ error: 'Name, email, and role are required' });
    }

    const colorIndex = store.users.length % AVATAR_COLORS.length;
    const newUser: User = {
      id: `user-${Date.now()}`,
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      role: role === 'design' ? 'design' : 'content',
      avatarColor: AVATAR_COLORS[colorIndex],
      createdAt: new Date().toISOString(),
    };

    store.users.push(newUser);
    saveStore(store);
    dbSaveUser(newUser).catch(e => console.error('Firestore user create err:', e));

    broadcastEvent('user_created', newUser);
    res.status(201).json(newUser);
  });

  // API: Get all tasks
  app.get('/api/tasks', (req: Request, res: Response) => {
    res.json(store.tasks);
  });

  // API: Create a task
  app.post('/api/tasks', (req: Request, res: Response) => {
    const { userId, title, description, dueDate, cognitiveLoad, status } = req.body;

    if (!userId || !title) {
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
      title: String(title).trim(),
      description: description ? String(description).trim() : undefined,
      dueDate: dueDate ? String(dueDate).trim() : undefined,
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
      title: title !== undefined ? String(title).trim() : currentTask.title,
      description: description !== undefined ? (description ? String(description).trim() : undefined) : currentTask.description,
      dueDate: dueDate !== undefined ? (dueDate ? String(dueDate).trim() : undefined) : currentTask.dueDate,
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
    if (!Array.isArray(updates)) {
      return res.status(400).json({ error: 'updates array is required' });
    }

    const modifiedTasks: Task[] = [];

    for (const update of updates) {
      const task = store.tasks.find(t => t.id === update.id);
      if (task) {
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

  // API: Clear/Reset all workspace data
  app.post('/api/clear', async (req: Request, res: Response) => {
    await clearAllDataFromDb();
    res.json({ success: true, message: 'All workspace data cleared' });
  });

  app.post('/api/reset', async (req: Request, res: Response) => {
    await clearAllDataFromDb();
    res.json({ success: true, message: 'All workspace data cleared' });
  });

  // API: Server-Sent Events (SSE) for zero-friction real-time sync across all connected browser tabs & devices
  app.get('/api/events', (req: Request, res: Response) => {
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
      res.write(': heartbeat\n\n');
    }, 20000);

    req.on('close', () => {
      clearInterval(heartbeatInterval);
      clients = clients.filter(c => c.id !== clientId);
    });
  });

  // Vite middleware in dev mode / Static serving in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Team Management Server running on port ${PORT}`);
  });
}

startServer();

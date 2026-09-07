import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
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

// Initial default seed state
const SEED_USERS: User[] = [
  {
    id: 'user-1',
    name: 'Elena Rostova',
    email: 'elena.rostova@acme.studio',
    role: 'content',
    avatarColor: 'from-amber-500 to-orange-600',
    createdAt: '2026-08-15T10:00:00.000Z',
  },
  {
    id: 'user-2',
    name: 'Marcus Vance',
    email: 'marcus.vance@acme.studio',
    role: 'content',
    avatarColor: 'from-rose-500 to-pink-600',
    createdAt: '2026-08-20T11:30:00.000Z',
  },
  {
    id: 'user-3',
    name: 'Aria Chen',
    email: 'aria.chen@acme.studio',
    role: 'design',
    avatarColor: 'from-blue-500 to-indigo-600',
    createdAt: '2026-08-12T09:15:00.000Z',
  },
  {
    id: 'user-4',
    name: 'Julian Hayes',
    email: 'julian.hayes@acme.studio',
    role: 'design',
    avatarColor: 'from-emerald-500 to-teal-600',
    createdAt: '2026-08-18T14:45:00.000Z',
  },
];

const SEED_TASKS: Task[] = [
  {
    id: 'task-101',
    userId: 'user-1',
    title: 'Brand Tone of Voice & Messaging Guide 2026',
    description: 'Synthesize leadership interviews into comprehensive brand narrative pillars.',
    dueDate: '2026-09-06',
    cognitiveLoad: 'high',
    status: 'in_progress',
    order: 0,
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-03T10:00:00.000Z',
  },
  {
    id: 'task-102',
    userId: 'user-1',
    title: 'Quarterly Product Announcement Deck',
    description: 'Outline key customer outcomes and feature highlights for slide narrative.',
    dueDate: '2026-09-08',
    cognitiveLoad: 'medium',
    status: 'todo',
    order: 0,
    createdAt: '2026-09-02T09:00:00.000Z',
    updatedAt: '2026-09-02T09:00:00.000Z',
  },
  {
    id: 'task-103',
    userId: 'user-1',
    title: 'Executive Ghostwriting: AI & Design Ethics',
    description: 'Draft 1,200 word op-ed examining human agency in generative workflows.',
    dueDate: '2026-09-05',
    cognitiveLoad: 'high',
    status: 'in_review',
    order: 0,
    createdAt: '2026-09-01T14:00:00.000Z',
    updatedAt: '2026-09-03T16:00:00.000Z',
  },
  {
    id: 'task-104',
    userId: 'user-1',
    title: 'Product Changelog Release Notes (v4.2)',
    description: 'Proofread engineering change logs into crisp consumer-friendly bullets.',
    dueDate: '2026-09-04',
    cognitiveLoad: 'low',
    status: 'done',
    order: 0,
    createdAt: '2026-08-30T10:00:00.000Z',
    updatedAt: '2026-09-04T08:30:00.000Z',
  },
  {
    id: 'task-201',
    userId: 'user-2',
    title: 'Enterprise Onboarding Email Drip Sequence',
    description: 'Write 5 targeted lifecycle emails guiding CTOs through SSO and team invites.',
    dueDate: '2026-09-05',
    cognitiveLoad: 'medium',
    status: 'in_progress',
    order: 0,
    createdAt: '2026-09-02T11:00:00.000Z',
    updatedAt: '2026-09-03T09:00:00.000Z',
  },
  {
    id: 'task-202',
    userId: 'user-2',
    title: 'Landing Page Conversion Copy Experiments',
    description: 'Produce 3 distinct headline variations focusing on team velocity.',
    dueDate: '2026-09-09',
    cognitiveLoad: 'low',
    status: 'todo',
    order: 0,
    createdAt: '2026-09-03T15:00:00.000Z',
    updatedAt: '2026-09-03T15:00:00.000Z',
  },
  {
    id: 'task-203',
    userId: 'user-2',
    title: 'Editorial Style Guide Glossary Update',
    description: 'Standardize terminology for real-time collaboration terms.',
    dueDate: undefined,
    cognitiveLoad: 'low',
    status: 'todo',
    order: 1,
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
  },
  {
    id: 'task-301',
    userId: 'user-3',
    title: 'Design System Token Architecture (WCAG AAA)',
    description: 'Rebuild dark mode contrast ratios and semantic surface elevation tokens.',
    dueDate: '2026-09-05',
    cognitiveLoad: 'high',
    status: 'in_progress',
    order: 0,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-03T11:00:00.000Z',
  },
  {
    id: 'task-302',
    userId: 'user-3',
    title: 'Interactive Prototype for Role Swimlanes',
    description: 'Test touch drag-and-drop mechanics and spring animation physics.',
    dueDate: '2026-09-07',
    cognitiveLoad: 'medium',
    status: 'todo',
    order: 0,
    createdAt: '2026-09-02T13:00:00.000Z',
    updatedAt: '2026-09-02T13:00:00.000Z',
  },
  {
    id: 'task-303',
    userId: 'user-3',
    title: 'Mobile Navigation Sheet Specs',
    description: 'Finalize gesture thresholds and safe-area inset margins for iOS/Android.',
    dueDate: '2026-09-04',
    cognitiveLoad: 'medium',
    status: 'in_review',
    order: 0,
    createdAt: '2026-09-01T16:00:00.000Z',
    updatedAt: '2026-09-04T07:00:00.000Z',
  },
  {
    id: 'task-304',
    userId: 'user-3',
    title: 'Team Onboarding Iconography (32px vector)',
    description: '12 new SVG icons conforming to 2px stroke grid guidelines.',
    dueDate: '2026-09-03',
    cognitiveLoad: 'low',
    status: 'done',
    order: 0,
    createdAt: '2026-08-28T10:00:00.000Z',
    updatedAt: '2026-09-03T17:00:00.000Z',
  },
  {
    id: 'task-401',
    userId: 'user-4',
    title: 'Component Library Performance & Layout Shifts',
    description: 'Audit render bottlenecks and eliminate layout shift in dynamic table rows.',
    dueDate: '2026-09-06',
    cognitiveLoad: 'high',
    status: 'in_progress',
    order: 0,
    createdAt: '2026-09-02T10:00:00.000Z',
    updatedAt: '2026-09-03T14:00:00.000Z',
  },
  {
    id: 'task-402',
    userId: 'user-4',
    title: 'Empty State Graphic System',
    description: 'Craft subtle monochromatic line art for zero-data swimlanes and searches.',
    dueDate: '2026-09-10',
    cognitiveLoad: 'medium',
    status: 'todo',
    order: 0,
    createdAt: '2026-09-03T16:30:00.000Z',
    updatedAt: '2026-09-03T16:30:00.000Z',
  },
  {
    id: 'task-403',
    userId: 'user-4',
    title: 'Micro-interaction Sound & Haptics Spec',
    description: 'Document auditory frequencies for task completion chimes.',
    dueDate: undefined,
    cognitiveLoad: 'low',
    status: 'archived',
    order: 0,
    createdAt: '2026-08-25T11:00:00.000Z',
    updatedAt: '2026-09-01T09:00:00.000Z',
  },
];

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
        return parsed;
      }
    }
  } catch (err) {
    console.error('Error reading data file, using defaults:', err);
  }

  const initialStore: AppStore = {
    users: SEED_USERS,
    tasks: SEED_TASKS,
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

// Firebase Firestore Configuration
function getFirebaseConfig() {
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return parsed;
    }
  } catch (err) {
    // fallback to env vars
  }
  return {
    apiKey: process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY,
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'zennext-4d040',
    appId: process.env.FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN,
    firestoreDatabaseId: process.env.FIREBASE_DATABASE_ID || process.env.VITE_FIREBASE_DATABASE_ID || 'ai-studio-teammanagementda-9980efc0-ca83-4c76-90fb-bb53a62ccc11',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  };
}

const fbConfig = getFirebaseConfig();
let firestoreDb: any = null;

if (fbConfig && fbConfig.apiKey && fbConfig.projectId) {
  try {
    const fbApp = getApps().length === 0 ? initializeApp(fbConfig) : getApp();
    firestoreDb = fbConfig.firestoreDatabaseId
      ? getFirestore(fbApp, fbConfig.firestoreDatabaseId)
      : getFirestore(fbApp);
    console.log('[Firestore] Initialized Firestore database:', fbConfig.firestoreDatabaseId || '(default)');
  } catch (err) {
    console.warn('[Firestore] Initialization warning, using local file store:', err);
  }
}

// Sync existing users and tasks from Firestore, or seed if empty
async function syncFromFirestore() {
  if (!firestoreDb) return;
  try {
    const usersSnap = await getDocs(collection(firestoreDb, 'users'));
    const tasksSnap = await getDocs(collection(firestoreDb, 'tasks'));

    if (usersSnap.empty) {
      console.log('[Firestore] Database empty. Seeding demo users and tasks into Firestore...');
      const batch = writeBatch(firestoreDb);
      for (const u of SEED_USERS) {
        batch.set(doc(firestoreDb, 'users', u.id), u);
      }
      for (const t of SEED_TASKS) {
        batch.set(doc(firestoreDb, 'tasks', t.id), t);
      }
      await batch.commit();
      console.log('[Firestore] Seed complete.');
      store.users = [...SEED_USERS];
      store.tasks = [...SEED_TASKS];
      saveStore(store);
      return;
    }

    const firestoreUsers: User[] = [];
    usersSnap.forEach(d => {
      firestoreUsers.push(d.data() as User);
    });

    const firestoreTasks: Task[] = [];
    tasksSnap.forEach(d => {
      firestoreTasks.push(d.data() as Task);
    });

    store.users = firestoreUsers;
    store.tasks = firestoreTasks;
    saveStore(store);
    console.log(`[Firestore] Loaded ${firestoreUsers.length} users and ${firestoreTasks.length} tasks from Firestore.`);
  } catch (err) {
    console.warn('[Firestore] Sync warning, retaining local store:', err);
  }
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
        if (firestoreDb) {
          setDoc(doc(firestoreDb, 'users', existingUser.id), existingUser).catch(e => console.error('Firestore user update err:', e));
        }
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
    if (firestoreDb) {
      setDoc(doc(firestoreDb, 'users', newUser.id), newUser).catch(e => console.error('Firestore user create err:', e));
    }

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
    if (firestoreDb) {
      setDoc(doc(firestoreDb, 'users', newUser.id), newUser).catch(e => console.error('Firestore user create err:', e));
    }

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
    if (firestoreDb) {
      setDoc(doc(firestoreDb, 'tasks', newTask.id), newTask).catch(e => console.error('Firestore task create err:', e));
    }

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
    if (firestoreDb) {
      setDoc(doc(firestoreDb, 'tasks', updatedTask.id), updatedTask).catch(e => console.error('Firestore task update err:', e));
    }

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
    if (firestoreDb) {
      deleteDoc(doc(firestoreDb, 'tasks', removed.id)).catch(e => console.error('Firestore task delete err:', e));
    }

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
    if (firestoreDb && modifiedTasks.length > 0) {
      const batch = writeBatch(firestoreDb);
      for (const t of modifiedTasks) {
        batch.set(doc(firestoreDb, 'tasks', t.id), t, { merge: true });
      }
      batch.commit().catch(e => console.error('Firestore batch reorder err:', e));
    }

    broadcastEvent('tasks_reordered', modifiedTasks);
    res.json({ success: true, tasks: modifiedTasks });
  });

  // API: Reset to initial demo seed data
  app.post('/api/reset', (req: Request, res: Response) => {
    store = {
      users: [...SEED_USERS],
      tasks: [...SEED_TASKS],
    };
    saveStore(store);
    if (firestoreDb) {
      const batch = writeBatch(firestoreDb);
      for (const u of SEED_USERS) {
        batch.set(doc(firestoreDb, 'users', u.id), u);
      }
      for (const t of SEED_TASKS) {
        batch.set(doc(firestoreDb, 'tasks', t.id), t);
      }
      batch.commit().catch(e => console.error('Firestore reset err:', e));
    }
    broadcastEvent('sync_all', store);
    res.json({ success: true, message: 'Reset to seed data' });
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

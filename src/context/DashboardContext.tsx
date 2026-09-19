import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { User, Task, Role, TaskStatus, RealtimeEvent, DragTaskInfo, TaskOrderUpdate, QueuedMutation } from '../types';
import { INITIAL_USERS, INITIAL_TASKS } from '../data/initialData';
import { compareTasksByDeadline } from '../utils/workload';

export interface FirestoreStatus {
  connected: boolean;
  mode: 'admin' | 'web' | 'local';
  projectId: string;
  databaseId: string;
  serviceAccountFound: boolean;
  totalUsers: number;
  totalTasks: number;
  lastError: string | null;
  lastSyncTime?: string;
}

const OFFLINE_QUEUE_KEY = 'zenflow_mutation_queue_v1';

function loadMutationQueue(): QueuedMutation[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return [];
}

function saveMutationQueue(queue: QueuedMutation[]) {
  try {
    if (queue.length > 0) {
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    } else {
      localStorage.removeItem(OFFLINE_QUEUE_KEY);
    }
  } catch {
    // ignore
  }
}

function enqueueMutation(mutation: Omit<QueuedMutation, 'id' | 'timestamp' | 'retryCount'>) {
  const queue = loadMutationQueue();
  queue.push({
    ...mutation,
    id: `mut-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: Date.now(),
    retryCount: 0,
  });
  saveMutationQueue(queue);
}

interface DashboardContextType {
  currentUser: User | null;
  users: User[];
  tasks: Task[];
  activeRoleTab: Role;
  setActiveRoleTab: (tab: Role) => void;
  darkMode: boolean;
  setDarkMode: (val: boolean | ((prev: boolean) => boolean)) => void;
  syncStatus: 'connected' | 'connecting' | 'offline';
  isLoading: boolean;
  firestoreStatus: FirestoreStatus | null;
  activeDragInfo: DragTaskInfo | null;
  setActiveDragInfo: (info: DragTaskInfo | null) => void;
  refreshFirestoreStatus: () => Promise<void>;
  syncWithFirestore: () => Promise<{ success: boolean; message: string }>;
  uploadServiceAccountKey: (keyContent: string) => Promise<{ success: boolean; message: string }>;
  login: (name: string, role: Role, email: string) => Promise<User>;
  logout: () => void;
  switchUser: (user: User) => void;
  createTask: (data: {
    userId: string;
    title: string;
    description?: string;
    dueDate?: string;
    cognitiveLoad: 'low' | 'medium' | 'high';
    status: TaskStatus;
  }) => Promise<Task>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<Task>;
  rescheduleTask: (taskId: string, newDueDate?: string) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  moveTask: (taskId: string, targetUserId: string, newStatus: TaskStatus, newIndex?: number) => Promise<void>;
  reassignTask: (taskId: string, targetUserId: string) => Promise<void>;
  moveTaskStatus: (taskId: string, newStatus: TaskStatus, newIndex?: number, targetUserId?: string) => Promise<void>;
  reorderTasks: (updates: Array<TaskOrderUpdate>) => Promise<void>;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

const USER_SESSION_KEY = 'team_dash_current_user_v1';
const THEME_KEY = 'team_dash_dark_mode_v1';

export const DashboardProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [users, setUsers] = useState<User[]>(() => {
    return INITIAL_USERS;
  });

  const [tasks, setTasks] = useState<Task[]>(() => {
    return INITIAL_TASKS;
  });

  const tasksRef = useRef<Task[]>(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  // Stable ref for users — keeps login callback dep-free, preventing context re-creation on every SSE user event
  const usersRef = useRef<User[]>(users);
  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  const [activeDragInfo, setActiveDragInfo] = useState<DragTaskInfo | null>(null);

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem(USER_SESSION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (['user-1', 'user-2', 'user-3', 'user-4'].includes(parsed.id) || parsed.email?.endsWith('@acme.studio')) {
          localStorage.removeItem(USER_SESSION_KEY);
          return null;
        }
        return parsed;
      }
    } catch {
      // ignore
    }
    return null;
  });

  const [activeRoleTab, setActiveRoleTab] = useState<Role>(() => {
    if (currentUser?.role) return currentUser.role;
    return 'content';
  });

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved !== null) return saved === 'true';
      return true; // Default to Sophisticated Dark theme
    } catch {
      return true;
    }
  });

  const [syncStatus, setSyncStatus] = useState<'connected' | 'connecting' | 'offline'>('connecting');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [firestoreStatus, setFirestoreStatus] = useState<FirestoreStatus | null>(null);

  const refreshFirestoreStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/firestore/status');
      if (res.ok) {
        const data = await res.json();
        setFirestoreStatus(data);
      }
    } catch (err) {
      // ignore
    }
  }, []);

  // Apply dark mode class to root document & body
  useEffect(() => {
    try {
      if (darkMode) {
        document.documentElement.classList.add('dark');
        document.body.classList.add('dark');
        localStorage.setItem(THEME_KEY, 'true');
      } else {
        document.documentElement.classList.remove('dark');
        document.body.classList.remove('dark');
        localStorage.setItem(THEME_KEY, 'false');
      }
    } catch {
      // ignore
    }
  }, [darkMode]);

  // Persist current user in local storage
  useEffect(() => {
    try {
      if (currentUser) {
        localStorage.setItem(USER_SESSION_KEY, JSON.stringify(currentUser));
      } else {
        localStorage.removeItem(USER_SESSION_KEY);
      }
    } catch {
      // ignore
    }
  }, [currentUser]);

  // Initial fetch from backend server
  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.users) && data.users.length > 0) {
          const userMap = new Map<string, User>();
          for (const u of data.users) {
            if (u && u.id) userMap.set(u.id, u);
          }
          const uniqueUsers = Array.from(userMap.values());
          setUsers(uniqueUsers);
          // If currentUser exists, sync it
          setCurrentUser(prev => {
            if (!prev) return uniqueUsers[0] || null;
            const matched = uniqueUsers.find(
              (u: User) => u.id === prev.id || u.email.toLowerCase() === prev.email.toLowerCase()
            );
            return matched || prev;
          });
        }
        if (Array.isArray(data.tasks)) {
          const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
          const now = Date.now();
          const taskMap = new Map<string, Task>();
          for (const t of data.tasks) {
            if (t && t.id) {
              if (t.status === 'done') {
                const doneTime = t.completedAt
                  ? new Date(t.completedAt).getTime()
                  : new Date(t.updatedAt || t.createdAt).getTime();
                if (!isNaN(doneTime) && now - doneTime >= SEVEN_DAYS) {
                  t.status = 'archived';
                  t.updatedAt = new Date().toISOString();
                  if (!t.activityLog) t.activityLog = [];
                  t.activityLog.unshift({
                    id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                    timestamp: new Date().toISOString(),
                    action: 'status_change',
                    from: 'done',
                    to: 'archived',
                    details: 'Auto-archived after 7 days in Done',
                  });
                  if (t.activityLog.length > 15) {
                    t.activityLog = t.activityLog.slice(0, 15);
                  }
                }
              }
              taskMap.set(t.id, t);
            }
          }
          setTasks(Array.from(taskMap.values()));
        }
        setSyncStatus('connected');
      }
    } catch (err) {
      console.warn('Backend /api/state not reachable yet, operating in local-resilient mode:', err);
      setSyncStatus('offline');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const isReplayingRef = useRef(false);

  // Replay persistent offline mutation queue in FIFO sequence upon network restore
  const replayQueue = useCallback(async () => {
    if (isReplayingRef.current) return;
    const queue = loadMutationQueue();
    if (queue.length === 0) return;

    isReplayingRef.current = true;
    const remainingQueue: QueuedMutation[] = [];

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];

      // Discard permanently failing mutations after 5 retries to prevent infinite replay loops
      if ((item.retryCount ?? 0) >= 5) {
        console.warn('[Offline Queue] Dropping permanently failed mutation after 5 retries:', item.type, item.endpoint);
        continue;
      }

      try {
        const res = await fetch(item.endpoint, {
          method: item.method,
          headers: { 'Content-Type': 'application/json' },
          body: item.payload ? JSON.stringify(item.payload) : undefined,
        });
        if (!res.ok && res.status >= 400 && res.status < 500) {
          console.warn(`[Offline Queue] Discarding client error (${res.status}) for:`, item);
        } else if (!res.ok) {
          item.retryCount = (item.retryCount || 0) + 1;
          remainingQueue.push(item);
          remainingQueue.push(...queue.slice(i + 1));
          break;
        }
      } catch (err) {
        item.retryCount = (item.retryCount || 0) + 1;
        remainingQueue.push(item);
        remainingQueue.push(...queue.slice(i + 1));
        break;
      }
    }

    saveMutationQueue(remainingQueue);
    isReplayingRef.current = false;

    if (remainingQueue.length === 0) {
      await fetchState();
      await refreshFirestoreStatus();
      setSyncStatus('connected');
    }
  }, [fetchState, refreshFirestoreStatus]);

  useEffect(() => {
    fetchState();
    refreshFirestoreStatus();
  }, [fetchState, refreshFirestoreStatus]);

  // Online / Offline network status listener with auto queue replay
  useEffect(() => {
    const handleOnline = () => {
      setSyncStatus('connecting');
      replayQueue();
    };
    const handleOffline = () => {
      setSyncStatus('offline');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (navigator.onLine && loadMutationQueue().length > 0) {
      replayQueue();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [replayQueue]);

  // Server-Sent Events (SSE) Realtime Listener
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: any = null;
    let isMounted = true;

    function connectSSE() {
      if (!isMounted) return;
      try {
        eventSource = new EventSource('/api/events');

        eventSource.onopen = () => {
          if (isMounted) {
            setSyncStatus('connected');
            replayQueue();
          }
        };

        eventSource.addEventListener('init', () => {
          if (isMounted) setSyncStatus('connected');
        });

        eventSource.addEventListener('update', (e: MessageEvent) => {
          if (!isMounted) return;
          try {
            const event: RealtimeEvent = JSON.parse(e.data);
            const { type, payload } = event;

            if (type === 'user_created') {
              setUsers(prev => {
                const map = new Map(prev.map(u => [u.id, u]));
                map.set(payload.id, payload);
                return Array.from(map.values());
              });
            } else if (type === 'user_updated') {
              setUsers(prev => prev.map(u => (u.id === payload.id ? payload : u)));
              setCurrentUser(prev => (prev?.id === payload.id ? payload : prev));
            } else if (type === 'user_deleted') {
              const deletedUserId = payload.id;
              setUsers(prev => prev.filter(u => u.id !== deletedUserId));
              setTasks(prev => prev.filter(t => t.userId !== deletedUserId));
              setCurrentUser(prev => (prev?.id === deletedUserId ? null : prev));
            } else if (type === 'task_created') {
              setTasks(prev => {
                const map = new Map<string, Task>();
                for (const t of prev) {
                  // If there's an optimistic temp task with matching properties, discard the temp version
                  if (
                    t.id.startsWith('temp-') &&
                    t.userId === payload.userId &&
                    t.title === payload.title
                  ) {
                    continue;
                  }
                  map.set(t.id, t);
                }
                map.set(payload.id, payload);
                return Array.from(map.values());
              });
            } else if (type === 'task_updated') {
              setTasks(prev => {
                const map = new Map(prev.map(t => [t.id, t]));
                map.set(payload.id, payload);
                return Array.from(map.values());
              });
            } else if (type === 'task_deleted') {
              setTasks(prev => prev.filter(t => t.id !== payload.id));
            } else if (type === 'tasks_reordered') {
              const updatedMap = new Map((payload as Task[]).map(t => [t.id, t]));
              setTasks(prev => {
                const map = new Map<string, Task>();
                for (const t of prev) {
                  const updated = updatedMap.get(t.id) || t;
                  map.set(t.id, updated);
                }
                for (const t of payload as Task[]) {
                  map.set(t.id, t);
                }
                return Array.from(map.values());
              });
            } else if (type === 'sync_all') {
              if (payload.users) {
                const userMap = new Map((payload.users as User[]).map(u => [u.id, u]));
                setUsers(Array.from(userMap.values()));
              }
              if (payload.tasks) {
                const taskMap = new Map((payload.tasks as Task[]).map(t => [t.id, t]));
                setTasks(Array.from(taskMap.values()));
              }
            }
          } catch (err) {
            console.error('Error handling SSE update:', err);
          }
        });

        eventSource.onerror = () => {
          if (!isMounted) return;
          setSyncStatus('connecting');
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          // Reconnect after 3s
          reconnectTimeout = setTimeout(connectSSE, 3000);
        };
      } catch (e) {
        if (!isMounted) return;
        setSyncStatus('offline');
        reconnectTimeout = setTimeout(connectSSE, 5000);
      }
    }

    connectSSE();

    return () => {
      isMounted = false;
      if (eventSource) {
        eventSource.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, []);

  // Authentication Login: takes name, role (content or design), official email address
  // When a new account is created, a new swimlane is formed on the respective role tab
  const login = useCallback(async (name: string, role: Role, email: string): Promise<User> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, role, email }),
      });

      if (res.ok) {
        const data = await res.json();
        const user: User = data.user;
        setCurrentUser(user);
        setActiveRoleTab(user.role);

        // Update local users array if new
        setUsers(prev => {
          const exists = prev.some(u => u.id === user.id);
          return exists ? prev.map(u => (u.id === user.id ? user : u)) : [...prev, user];
        });

        return user;
      }
    } catch (err) {
      console.warn('Direct server login call failed, fallback local creation:', err);
    }

    // Local fallback if offline — reads from ref to avoid stale closure dependency on users
    const cleanEmail = email.trim().toLowerCase();
    let existing = usersRef.current.find(u => u.email.toLowerCase() === cleanEmail);
    if (!existing) {
      const newUser: User = {
        id: `user-${Date.now()}`,
        name: name.trim(),
        email: cleanEmail,
        role,
        avatarColor: 'from-blue-500 to-indigo-600',
        createdAt: new Date().toISOString(),
      };
      setUsers(prev => [...prev, newUser]);
      existing = newUser;
    }
    setCurrentUser(existing);
    setActiveRoleTab(existing.role);
    return existing;
  }, []); // stable — reads users from usersRef.current

  const logout = useCallback(() => {
    setCurrentUser(null);
  }, []);

  const switchUser = useCallback((user: User) => {
    setCurrentUser(user);
    setActiveRoleTab(user.role);
  }, []);

  // Task creation with offline mutation queuing
  const createTask = useCallback(async (data: {
    userId: string;
    title: string;
    description?: string;
    dueDate?: string;
    cognitiveLoad: 'low' | 'medium' | 'high';
    status: TaskStatus;
  }): Promise<Task> => {
    const realId = `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const currentTasks = tasksRef.current;
    const isCompleted = data.status === 'done';
    const now = new Date().toISOString();

    const initialActivity = {
      id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: now,
      action: 'created' as const,
      to: data.status,
      details: `Created in ${data.status.replace('_', ' ')}`,
    };

    const isInProgress = data.status === 'in_progress';

    const optimisticTask: Task = {
      id: realId,
      userId: data.userId,
      title: data.title.trim(),
      description: data.description ? data.description.trim() : undefined,
      dueDate: data.dueDate,
      cognitiveLoad: data.cognitiveLoad,
      status: data.status,
      order: currentTasks.filter(t => t.userId === data.userId && t.status === data.status).length,
      completedAt: isCompleted ? now : undefined,
      inProgressStartedAt: isInProgress ? now : undefined,
      inProgressDurationMs: 0,
      createdAt: now,
      updatedAt: now,
      activityLog: [initialActivity],
    };

    setTasks(prev => {
      const map = new Map<string, Task>();
      for (const t of prev) {
        if (t.id) map.set(t.id, t);
      }
      map.set(realId, optimisticTask);
      return Array.from(map.values());
    });

    const payload = { id: realId, ...data };

    try {
      if (!navigator.onLine) throw new Error('Offline');
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const saved: Task = await res.json();
        setTasks(prev => {
          const map = new Map(prev.map(t => [t.id, t]));
          map.set(saved.id, saved);
          return Array.from(map.values());
        });
        return saved;
      } else {
        throw new Error(`Server returned ${res.status}`);
      }
    } catch (err) {
      console.warn('Create task offline/failed, buffering in queue:', err);
      enqueueMutation({
        type: 'create_task',
        endpoint: '/api/tasks',
        method: 'POST',
        payload,
      });
      setSyncStatus('offline');
    }

    return optimisticTask;
  }, []);

  // Task update with offline mutation queuing
  const updateTask = useCallback(async (id: string, updates: Partial<Task>): Promise<Task> => {
    let updatedTask: Task | undefined;
    setTasks(prev => {
      const map = new Map<string, Task>();
      for (const t of prev) {
        if (t.id === id) {
          let completedAt = t.completedAt;
          let inProgressStartedAt = t.inProgressStartedAt;
          let inProgressDurationMs = typeof t.inProgressDurationMs === 'number' ? t.inProgressDurationMs : 0;

          if (updates.status !== undefined) {
            if (updates.status === 'done' && t.status !== 'done') {
              completedAt = new Date().toISOString();
            } else if (updates.status !== 'done') {
              completedAt = undefined;
            }

            if (updates.status === 'in_progress' && t.status !== 'in_progress') {
              inProgressStartedAt = new Date().toISOString();
            } else if (updates.status !== 'in_progress' && t.status === 'in_progress') {
              if (t.inProgressStartedAt) {
                const sessionMs = Math.max(0, Date.now() - new Date(t.inProgressStartedAt).getTime());
                inProgressDurationMs += sessionMs;
              }
              inProgressStartedAt = undefined;
            }
          }
          updatedTask = {
            ...t,
            ...updates,
            completedAt,
            inProgressStartedAt,
            inProgressDurationMs,
            updatedAt: new Date().toISOString(),
          };
          map.set(t.id, updatedTask);
        } else {
          map.set(t.id, t);
        }
      }
      return Array.from(map.values());
    });

    try {
      if (!navigator.onLine) throw new Error('Offline');
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const serverTask: Task = await res.json();
        setTasks(prev => {
          const map = new Map(prev.map(t => [t.id, t]));
          map.set(id, serverTask);
          return Array.from(map.values());
        });
        return serverTask;
      } else {
        throw new Error(`Server returned ${res.status}`);
      }
    } catch (err) {
      console.warn('Update task offline/failed, buffering in queue:', err);
      enqueueMutation({
        type: 'update_task',
        endpoint: `/api/tasks/${id}`,
        method: 'PUT',
        payload: updates,
      });
      setSyncStatus('offline');
    }

    return updatedTask || (tasksRef.current.find(t => t.id === id) as Task);
  }, []);

  // Dedicated reschedule helper for quick snooze
  const rescheduleTask = useCallback(async (taskId: string, newDueDate?: string): Promise<Task> => {
    return updateTask(taskId, { dueDate: newDueDate });
  }, [updateTask]);

  // Task delete with offline mutation queuing
  const deleteTask = useCallback(async (id: string): Promise<void> => {
    setTasks(prev => prev.filter(t => t.id !== id));

    try {
      if (!navigator.onLine) throw new Error('Offline');
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
    } catch (err) {
      console.warn('Delete task offline/failed, buffering in queue:', err);
      enqueueMutation({
        type: 'delete_task',
        endpoint: `/api/tasks/${id}`,
        method: 'DELETE',
      });
      setSyncStatus('offline');
    }
  }, []);

  // User delete with offline mutation queuing
  const deleteUser = useCallback(async (userId: string): Promise<void> => {
    setUsers(prev => prev.filter(u => u.id !== userId));
    setTasks(prev => prev.filter(t => t.userId !== userId));
    setCurrentUser(prev => (prev?.id === userId ? null : prev));

    try {
      if (!navigator.onLine) throw new Error('Offline');
      const res = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
    } catch (err) {
      console.warn('Delete user offline/failed, buffering in queue:', err);
      enqueueMutation({
        type: 'delete_user',
        endpoint: `/api/users/${userId}`,
        method: 'DELETE',
      });
      setSyncStatus('offline');
    }
  }, []);

  // Move task across users and/or statuses with order index normalization & offline queuing
  const moveTask = useCallback(async (
    taskId: string,
    targetUserId: string,
    newStatus: TaskStatus,
    newIndex?: number
  ): Promise<void> => {
    const currentTasks = tasksRef.current;
    const task = currentTasks.find(t => t.id === taskId);
    if (!task) return;

    const isSameUser = task.userId === targetUserId;
    const isSameStatus = task.status === newStatus;

    if (isSameUser && isSameStatus && newIndex === undefined) return;

    // Get current tasks in target column excluding the moving task
    const targetUserTasksInStatus = currentTasks
      .filter(t => t.userId === targetUserId && t.status === newStatus && t.id !== taskId)
      .sort((a, b) => compareTasksByDeadline(a, b, newStatus));

    const targetOrder =
      newIndex !== undefined
        ? Math.max(0, Math.min(newIndex, targetUserTasksInStatus.length))
        : targetUserTasksInStatus.length;

    const now = new Date().toISOString();
    const isCompleted = newStatus === 'done';
    const completedAt = isCompleted
      ? task.completedAt || now
      : undefined;
    let inProgressStartedAt = task.inProgressStartedAt;
    let inProgressDurationMs = typeof task.inProgressDurationMs === 'number' ? task.inProgressDurationMs : 0;
    if (newStatus === 'in_progress' && task.status !== 'in_progress') {
      inProgressStartedAt = now;
    } else if (newStatus !== 'in_progress' && task.status === 'in_progress') {
      if (task.inProgressStartedAt) {
        const sessionMs = Math.max(0, Date.now() - new Date(task.inProgressStartedAt).getTime());
        inProgressDurationMs += sessionMs;
      }
      inProgressStartedAt = undefined;
    }

    // Prepare full batch updates so order numbers are strictly sorted
    const reorderedTargetTasks = [...targetUserTasksInStatus];
    const movedTaskUpdated: Task = {
      ...task,
      userId: targetUserId,
      status: newStatus,
      order: targetOrder,
      completedAt,
      inProgressStartedAt,
      inProgressDurationMs,
      updatedAt: now,
    };
    reorderedTargetTasks.splice(targetOrder, 0, movedTaskUpdated);

    const batchUpdates: Array<TaskOrderUpdate> = reorderedTargetTasks.map((t, idx) => ({
      id: t.id,
      userId: targetUserId,
      status: newStatus,
      order: idx,
    }));

    // Optimistically update
    setTasks(prev => {
      const updateMap = new Map(batchUpdates.map(u => [u.id, u]));
      return prev.map(t => {
        const u = updateMap.get(t.id);
        if (u) {
          const isMoved = t.id === taskId;
          return {
            ...t,
            userId: u.userId || t.userId,
            status: u.status,
            order: u.order,
            completedAt: isMoved ? completedAt : t.completedAt,
            inProgressStartedAt: isMoved ? inProgressStartedAt : t.inProgressStartedAt,
            inProgressDurationMs: isMoved ? inProgressDurationMs : t.inProgressDurationMs,
            updatedAt: now,
          };
        }
        return t;
      });
    });

    try {
      if (!navigator.onLine) throw new Error('Offline');
      const res = await fetch('/api/tasks/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: batchUpdates }),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
    } catch (err) {
      console.warn('Move task offline/failed, buffering in queue:', err);
      enqueueMutation({
        type: 'reorder_tasks',
        endpoint: '/api/tasks/reorder',
        method: 'POST',
        payload: { updates: batchUpdates },
      });
      setSyncStatus('offline');
    }
  }, []);

  // Direct task reassignment helper
  const reassignTask = useCallback(async (taskId: string, targetUserId: string): Promise<void> => {
    const task = tasksRef.current.find(t => t.id === taskId);
    if (!task || task.userId === targetUserId) return;
    await moveTask(taskId, targetUserId, task.status);
  }, [moveTask]);

  // Move task status and order (backwards compatible, delegates to moveTask)
  const moveTaskStatus = useCallback(async (
    taskId: string,
    newStatus: TaskStatus,
    newIndex?: number,
    targetUserId?: string
  ): Promise<void> => {
    const task = tasksRef.current.find(t => t.id === taskId);
    if (!task) return;
    const destUser = targetUserId || task.userId;
    await moveTask(taskId, destUser, newStatus, newIndex);
  }, [moveTask]);

  // Reorder tasks batch with offline queuing
  const reorderTasks = useCallback(async (updates: Array<TaskOrderUpdate>): Promise<void> => {
    const updateMap = new Map(updates.map(u => [u.id, u]));
    const now = new Date().toISOString();

    setTasks(prev =>
      prev.map(t => {
        const u = updateMap.get(t.id);
        if (u) {
          const isDone = u.status === 'done';
          const completedAt = isDone ? t.completedAt || now : undefined;
          let inProgressStartedAt = t.inProgressStartedAt;
          let inProgressDurationMs = typeof t.inProgressDurationMs === 'number' ? t.inProgressDurationMs : 0;

          if (u.status !== undefined && u.status !== t.status) {
            if (u.status === 'in_progress') {
              inProgressStartedAt = now;
            } else if (t.status === 'in_progress') {
              if (t.inProgressStartedAt) {
                const sessionMs = Math.max(0, Date.now() - new Date(t.inProgressStartedAt).getTime());
                inProgressDurationMs += sessionMs;
              }
              inProgressStartedAt = undefined;
            }
          }

          return {
            ...t,
            userId: u.userId || t.userId,
            status: u.status,
            order: u.order,
            completedAt,
            inProgressStartedAt,
            inProgressDurationMs,
            updatedAt: now,
          };
        }
        return t;
      })
    );

    try {
      if (!navigator.onLine) throw new Error('Offline');
      const res = await fetch('/api/tasks/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
    } catch (err) {
      console.warn('Reorder tasks offline/failed, buffering in queue:', err);
      enqueueMutation({
        type: 'reorder_tasks',
        endpoint: '/api/tasks/reorder',
        method: 'POST',
        payload: { updates },
      });
      setSyncStatus('offline');
    }
  }, []);

  // Trigger full synchronization with Firestore
  const syncWithFirestore = useCallback(async (): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch('/api/firestore/sync', { method: 'POST' });
      const data = await res.json();
      await fetchState();
      await refreshFirestoreStatus();
      return data;
    } catch (err: any) {
      return { success: false, message: err.message || 'Sync failed' };
    }
  }, [fetchState, refreshFirestoreStatus]);

  // Upload or apply Firebase Service Account Key
  const uploadServiceAccountKey = useCallback(async (keyContent: string): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch('/api/firestore/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceAccountKey: keyContent }),
      });
      const data = await res.json();
      await fetchState();
      await refreshFirestoreStatus();
      return data;
    } catch (err: any) {
      return { success: false, message: err.message || 'Key upload failed' };
    }
  }, [fetchState, refreshFirestoreStatus]);

  const contextValue = useMemo(
    () => ({
      currentUser,
      users,
      tasks,
      activeRoleTab,
      setActiveRoleTab,
      darkMode,
      setDarkMode,
      syncStatus,
      isLoading,
      firestoreStatus,
      activeDragInfo,
      setActiveDragInfo,
      refreshFirestoreStatus,
      syncWithFirestore,
      uploadServiceAccountKey,
      login,
      logout,
      switchUser,
      createTask,
      updateTask,
      rescheduleTask,
      deleteTask,
      deleteUser,
      moveTask,
      reassignTask,
      moveTaskStatus,
      reorderTasks,
    }),
    [
      currentUser,
      users,
      tasks,
      activeRoleTab,
      darkMode,
      syncStatus,
      isLoading,
      firestoreStatus,
      activeDragInfo,
      refreshFirestoreStatus,
      syncWithFirestore,
      uploadServiceAccountKey,
      login,
      logout,
      switchUser,
      createTask,
      updateTask,
      rescheduleTask,
      deleteTask,
      deleteUser,
      moveTask,
      reassignTask,
      moveTaskStatus,
      reorderTasks,
    ]
  );

  return (
    <DashboardContext.Provider value={contextValue}>
      {children}
    </DashboardContext.Provider>
  );
};

export const useDashboard = () => {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
};

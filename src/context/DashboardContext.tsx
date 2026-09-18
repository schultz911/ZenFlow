import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { User, Task, Role, TaskStatus, RealtimeEvent, DragTaskInfo, TaskOrderUpdate } from '../types';
import { INITIAL_USERS, INITIAL_TASKS } from '../data/initialData';

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

  useEffect(() => {
    fetchState();
    refreshFirestoreStatus();
  }, [fetchState, refreshFirestoreStatus]);

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
          if (isMounted) setSyncStatus('connected');
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

    // Local fallback if offline
    const cleanEmail = email.trim().toLowerCase();
    let existing = users.find(u => u.email.toLowerCase() === cleanEmail);
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
  }, [users]);

  const logout = useCallback(() => {
    setCurrentUser(null);
  }, []);

  const switchUser = useCallback((user: User) => {
    setCurrentUser(user);
    setActiveRoleTab(user.role);
  }, []);

  // Task creation
  const createTask = useCallback(async (data: {
    userId: string;
    title: string;
    description?: string;
    dueDate?: string;
    cognitiveLoad: 'low' | 'medium' | 'high';
    status: TaskStatus;
  }): Promise<Task> => {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const currentTasks = tasksRef.current;
    const isCompleted = data.status === 'done';
    const now = new Date().toISOString();
    // Optimistic task
    const tempTask: Task = {
      id: tempId,
      userId: data.userId,
      title: data.title.trim(),
      description: data.description ? data.description.trim() : undefined,
      dueDate: data.dueDate,
      cognitiveLoad: data.cognitiveLoad,
      status: data.status,
      order: currentTasks.filter(t => t.userId === data.userId && t.status === data.status).length,
      completedAt: isCompleted ? now : undefined,
      createdAt: now,
      updatedAt: now,
    };

    setTasks(prev => {
      const map = new Map<string, Task>();
      for (const t of prev) {
        if (t.id) map.set(t.id, t);
      }
      map.set(tempId, tempTask);
      return Array.from(map.values());
    });

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const saved: Task = await res.json();
        setTasks(prev => {
          const map = new Map<string, Task>();
          for (const t of prev) {
            // Remove the temporary task and any matching id
            if (t.id === tempId || t.id === saved.id) continue;
            map.set(t.id, t);
          }
          map.set(saved.id, saved);
          return Array.from(map.values());
        });
        return saved;
      }
    } catch (err) {
      console.warn('Create task server call failed, using optimistic task:', err);
    }

    return tempTask;
  }, []);

  // Task update
  const updateTask = useCallback(async (id: string, updates: Partial<Task>): Promise<Task> => {
    let updatedTask: Task | undefined;
    setTasks(prev => {
      const map = new Map<string, Task>();
      for (const t of prev) {
        if (t.id === id) {
          let completedAt = t.completedAt;
          if (updates.status !== undefined) {
            if (updates.status === 'done' && t.status !== 'done') {
              completedAt = new Date().toISOString();
            } else if (updates.status !== 'done') {
              completedAt = undefined;
            }
          }
          updatedTask = { ...t, ...updates, completedAt, updatedAt: new Date().toISOString() };
          map.set(t.id, updatedTask);
        } else {
          map.set(t.id, t);
        }
      }
      return Array.from(map.values());
    });

    try {
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
      }
    } catch (err) {
      console.warn('Update task server call failed:', err);
    }

    return updatedTask || (tasksRef.current.find(t => t.id === id) as Task);
  }, []);

  // Task delete
  const deleteTask = useCallback(async (id: string): Promise<void> => {
    setTasks(prev => prev.filter(t => t.id !== id));

    try {
      await fetch(`/api/tasks/${id}`, {
        method: 'DELETE',
      });
    } catch (err) {
      console.warn('Delete task server call failed:', err);
    }
  }, []);

  // User delete (cascade delete user and all their tasks)
  const deleteUser = useCallback(async (userId: string): Promise<void> => {
    // Optimistically remove user and their tasks
    setUsers(prev => prev.filter(u => u.id !== userId));
    setTasks(prev => prev.filter(t => t.userId !== userId));
    setCurrentUser(prev => {
      if (prev?.id === userId) {
        return null;
      }
      return prev;
    });

    try {
      await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
      });
    } catch (err) {
      console.warn('Delete user server call failed:', err);
    }
  }, []);

  // Move task across users and/or statuses with order index normalization
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
      .sort((a, b) => a.order - b.order);

    const targetOrder =
      newIndex !== undefined
        ? Math.max(0, Math.min(newIndex, targetUserTasksInStatus.length))
        : targetUserTasksInStatus.length;

    const now = new Date().toISOString();
    const isCompleted = newStatus === 'done';
    const completedAt = isCompleted
      ? task.completedAt || now
      : undefined;

    // Prepare full batch updates so order numbers are strictly sorted
    const reorderedTargetTasks = [...targetUserTasksInStatus];
    const movedTaskUpdated: Task = {
      ...task,
      userId: targetUserId,
      status: newStatus,
      order: targetOrder,
      completedAt,
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
          return {
            ...t,
            userId: u.userId || t.userId,
            status: u.status,
            order: u.order,
            completedAt,
            updatedAt: now,
          };
        }
        return t;
      });
    });

    try {
      await fetch('/api/tasks/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: batchUpdates }),
      });
    } catch (err) {
      console.warn('Move task server call failed:', err);
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

  // Reorder tasks batch
  const reorderTasks = useCallback(async (updates: Array<TaskOrderUpdate>): Promise<void> => {
    const updateMap = new Map(updates.map(u => [u.id, u]));
    const now = new Date().toISOString();

    setTasks(prev =>
      prev.map(t => {
        const u = updateMap.get(t.id);
        if (u) {
          const isDone = u.status === 'done';
          const completedAt = isDone ? t.completedAt || now : undefined;
          return {
            ...t,
            userId: u.userId || t.userId,
            status: u.status,
            order: u.order,
            completedAt,
            updatedAt: now,
          };
        }
        return t;
      })
    );

    try {
      await fetch('/api/tasks/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
    } catch (err) {
      console.warn('Reorder tasks server call failed:', err);
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

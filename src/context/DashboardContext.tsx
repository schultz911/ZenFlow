import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
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
          setUsers(data.users);
          // If currentUser exists, sync it
          setCurrentUser(prev => {
            if (!prev) return data.users[0] || null;
            const matched = data.users.find((u: User) => u.id === prev.id || u.email.toLowerCase() === prev.email.toLowerCase());
            return matched || prev;
          });
        }
        if (Array.isArray(data.tasks)) {
          setTasks(data.tasks);
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

    function connectSSE() {
      try {
        eventSource = new EventSource('/api/events');

        eventSource.onopen = () => {
          setSyncStatus('connected');
        };

        eventSource.addEventListener('init', () => {
          setSyncStatus('connected');
        });

        eventSource.addEventListener('update', (e: MessageEvent) => {
          try {
            const event: RealtimeEvent = JSON.parse(e.data);
            const { type, payload } = event;

            if (type === 'user_created') {
              setUsers(prev => {
                const exists = prev.some(u => u.id === payload.id);
                return exists ? prev : [...prev, payload];
              });
            } else if (type === 'user_updated') {
              setUsers(prev => prev.map(u => (u.id === payload.id ? payload : u)));
              setCurrentUser(prev => (prev?.id === payload.id ? payload : prev));
            } else if (type === 'task_created') {
              setTasks(prev => {
                const exists = prev.some(t => t.id === payload.id);
                return exists ? prev : [...prev, payload];
              });
            } else if (type === 'task_updated') {
              setTasks(prev => prev.map(t => (t.id === payload.id ? payload : t)));
            } else if (type === 'task_deleted') {
              setTasks(prev => prev.filter(t => t.id !== payload.id));
            } else if (type === 'tasks_reordered') {
              const updatedMap = new Map((payload as Task[]).map(t => [t.id, t]));
              setTasks(prev => prev.map(t => updatedMap.get(t.id) || t));
            } else if (type === 'sync_all') {
              if (payload.users) setUsers(payload.users);
              if (payload.tasks) setTasks(payload.tasks);
            }
          } catch (err) {
            console.error('Error handling SSE update:', err);
          }
        });

        eventSource.onerror = () => {
          setSyncStatus('connecting');
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          // Reconnect after 3s
          reconnectTimeout = setTimeout(connectSSE, 3000);
        };
      } catch (e) {
        setSyncStatus('offline');
        reconnectTimeout = setTimeout(connectSSE, 5000);
      }
    }

    connectSSE();

    return () => {
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
  const login = async (name: string, role: Role, email: string): Promise<User> => {
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
  };

  const logout = () => {
    setCurrentUser(null);
  };

  const switchUser = (user: User) => {
    setCurrentUser(user);
    setActiveRoleTab(user.role);
  };

  // Task creation
  const createTask = async (data: {
    userId: string;
    title: string;
    description?: string;
    dueDate?: string;
    cognitiveLoad: 'low' | 'medium' | 'high';
    status: TaskStatus;
  }): Promise<Task> => {
    // Optimistic task
    const tempTask: Task = {
      id: `task-${Date.now()}`,
      userId: data.userId,
      title: data.title.trim(),
      description: data.description ? data.description.trim() : undefined,
      dueDate: data.dueDate,
      cognitiveLoad: data.cognitiveLoad,
      status: data.status,
      order: tasks.filter(t => t.userId === data.userId && t.status === data.status).length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setTasks(prev => [...prev, tempTask]);

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const saved: Task = await res.json();
        setTasks(prev => prev.map(t => (t.id === tempTask.id ? saved : t)));
        return saved;
      }
    } catch (err) {
      console.warn('Create task server call failed, using optimistic task:', err);
    }

    return tempTask;
  };

  // Task update
  const updateTask = async (id: string, updates: Partial<Task>): Promise<Task> => {
    let updatedTask: Task | undefined;
    setTasks(prev =>
      prev.map(t => {
        if (t.id === id) {
          updatedTask = { ...t, ...updates, updatedAt: new Date().toISOString() };
          return updatedTask;
        }
        return t;
      })
    );

    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const serverTask: Task = await res.json();
        setTasks(prev => prev.map(t => (t.id === id ? serverTask : t)));
        return serverTask;
      }
    } catch (err) {
      console.warn('Update task server call failed:', err);
    }

    return updatedTask || (tasks.find(t => t.id === id) as Task);
  };

  // Task delete
  const deleteTask = async (id: string): Promise<void> => {
    setTasks(prev => prev.filter(t => t.id !== id));

    try {
      await fetch(`/api/tasks/${id}`, {
        method: 'DELETE',
      });
    } catch (err) {
      console.warn('Delete task server call failed:', err);
    }
  };

  // Move task across users and/or statuses with order index normalization
  const moveTask = async (
    taskId: string,
    targetUserId: string,
    newStatus: TaskStatus,
    newIndex?: number
  ): Promise<void> => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const isSameUser = task.userId === targetUserId;
    const isSameStatus = task.status === newStatus;

    if (isSameUser && isSameStatus && newIndex === undefined) return;

    // Get current tasks in target column excluding the moving task
    const targetUserTasksInStatus = tasks
      .filter(t => t.userId === targetUserId && t.status === newStatus && t.id !== taskId)
      .sort((a, b) => a.order - b.order);

    const targetOrder =
      newIndex !== undefined
        ? Math.max(0, Math.min(newIndex, targetUserTasksInStatus.length))
        : targetUserTasksInStatus.length;

    const now = new Date().toISOString();

    // Prepare full batch updates so order numbers are strictly sorted
    const reorderedTargetTasks = [...targetUserTasksInStatus];
    const movedTaskUpdated: Task = {
      ...task,
      userId: targetUserId,
      status: newStatus,
      order: targetOrder,
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
  };

  // Direct task reassignment helper
  const reassignTask = async (taskId: string, targetUserId: string): Promise<void> => {
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.userId === targetUserId) return;
    await moveTask(taskId, targetUserId, task.status);
  };

  // Move task status and order (backwards compatible, delegates to moveTask)
  const moveTaskStatus = async (
    taskId: string,
    newStatus: TaskStatus,
    newIndex?: number,
    targetUserId?: string
  ): Promise<void> => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const destUser = targetUserId || task.userId;
    await moveTask(taskId, destUser, newStatus, newIndex);
  };

  // Reorder tasks batch
  const reorderTasks = async (updates: Array<TaskOrderUpdate>): Promise<void> => {
    const updateMap = new Map(updates.map(u => [u.id, u]));
    const now = new Date().toISOString();

    setTasks(prev =>
      prev.map(t => {
        const u = updateMap.get(t.id);
        if (u) {
          return {
            ...t,
            userId: u.userId || t.userId,
            status: u.status,
            order: u.order,
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
  };

  // Trigger full synchronization with Firestore
  const syncWithFirestore = async (): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch('/api/firestore/sync', { method: 'POST' });
      const data = await res.json();
      await fetchState();
      await refreshFirestoreStatus();
      return data;
    } catch (err: any) {
      return { success: false, message: err.message || 'Sync failed' };
    }
  };

  // Upload or apply Firebase Service Account Key
  const uploadServiceAccountKey = async (keyContent: string): Promise<{ success: boolean; message: string }> => {
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
  };

  return (
    <DashboardContext.Provider
      value={{
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
        moveTask,
        reassignTask,
        moveTaskStatus,
        reorderTasks,
      }}
    >
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

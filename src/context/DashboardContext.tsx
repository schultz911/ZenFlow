import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import {
  User,
  Task,
  Role,
  TaskStatus,
  RealtimeEvent,
  DragTaskInfo,
  TaskOrderUpdate,
  QueuedMutation,
  TaskActivity,
  ClickupSpace,
  ClickupList,
  ClickupFolder,
  ClickupMember,
  ClickupCustomFieldOption,
  AuditLogEntry,
  ClickupWebhookStatus,
} from '../types';
import { INITIAL_USERS, INITIAL_TASKS } from '../data/initialData';
import { compareTasksByDeadline, formatBillableHours, getTaskBillableMs } from '../utils/workload';
import { signInWithGoogle, signOutFirebase, onFirebaseAuthStateChanged } from '../lib/firebase';

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

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_QUEUE_SIZE = 100;

function enqueueMutation(mutation: Omit<QueuedMutation, 'id' | 'timestamp' | 'retryCount'>) {
  const now = Date.now();
  // Filter out stale mutations older than 7 days
  const queue = loadMutationQueue().filter(m => now - m.timestamp < SEVEN_DAYS_MS);
  queue.push({
    ...mutation,
    id: `mut-${now}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: now,
    retryCount: 0,
  });
  // Cap queue to latest 100 mutations to prevent unbounded local storage growth
  const boundedQueue = queue.length > MAX_QUEUE_SIZE ? queue.slice(-MAX_QUEUE_SIZE) : queue;
  saveMutationQueue(boundedQueue);
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
  isAuthChecking: boolean;
  authError: string | null;
  setAuthError: (err: string | null) => void;
  syncWithFirestore: () => Promise<{ success: boolean; message: string }>;
  uploadServiceAccountKey: (keyContent: string) => Promise<{ success: boolean; message: string }>;
  login: (name: string, role: Role, email: string) => Promise<User>;
  loginWithGoogle: () => Promise<User>;
  logout: () => void;
  switchUser: (user: User) => void;
  createUser: (data: {
    name: string;
    email: string;
    role: Role;
    isCreativeDirector?: boolean;
    creativeDirectorId?: string;
    clickupUserId?: string;
    clickupUsername?: string;
  }) => Promise<User>;
  updateUserProfile: (userId: string, updates: Partial<User>) => Promise<User>;
  // Role & Permissions
  isSuperadmin: boolean;
  isCreativeDirector: boolean;
  canManageMembers: boolean;
  canEditUserTasks: (targetUserId: string) => boolean;
  canSwitchBoards: boolean;
  creativeDirectors: User[];
  activeBoardId: string;
  setActiveBoardId: (boardId: string) => void;
  // ClickUp Integration
  isZensciencesUser: boolean;
  isClickupConnected: boolean;
  clickupApiKey: string;
  clickupMembers: ClickupMember[];
  loadClickupMembers: (apiKey?: string) => Promise<ClickupMember[]>;
  clickupSpaces: ClickupSpace[];
  selectedClickupSpaceId: string;
  clickupFoldersAndLists: { folders: ClickupFolder[]; folderlessLists: ClickupList[] };
  spaceFoldersMap: Record<string, string[]>;
  showClickupPrompt: boolean;
  setShowClickupPrompt: (val: boolean) => void;
  connectClickup: (apiKey: string) => Promise<{ success: boolean; error?: string }>;
  disconnectClickup: () => void;
  setSelectedClickupSpaceId: (spaceId: string, spaceName?: string) => Promise<void>;
  createClickupList: (name: string, spaceId: string, folderId?: string) => Promise<ClickupList | null>;
  syncUserTasksWithClickUp: (userId: string) => Promise<{ success: boolean; syncedCount: number; archivedCount: number; message: string }>;
  assignTaskClickupList: (taskId: string, listId: string, listName: string, folderId?: string, folderName?: string) => Promise<Task>;
  clickupCustomFieldOptions: ClickupCustomFieldOption[];
  clickupTaskTypeFieldId: string;
  isLoadingTaskTypes: boolean;
  fetchClickupCustomFields: (params: { listId?: string; spaceId?: string; folderId?: string }) => Promise<ClickupCustomFieldOption[]>;
  getUserSyncState: (userId: string) => 'synced' | 'pending' | 'failed' | 'unmapped';
  // ClickUp Real-Time Webhook & Audit Stream
  clickupWebhookStatus: ClickupWebhookStatus | null;
  refreshClickupWebhookStatus: () => Promise<void>;
  registerClickupWebhook: (customEndpoint?: string) => Promise<{ success: boolean; message: string; webhookId?: string }>;
  fetchAuditLogs: (limit?: number) => Promise<AuditLogEntry[]>;
  downloadAuditLogs: () => void;
  // Tasks
  createTask: (data: {
    userId: string;
    title: string;
    description?: string;
    dueDate?: string;
    cognitiveLoad: 'low' | 'medium' | 'high';
    status: TaskStatus;
    clickupTaskId?: string;
    clickupFolderId?: string;
    clickupFolderName?: string;
    clickupListId?: string;
    clickupListName?: string;
    clickupSpaceId?: string;
    clickupUrl?: string;
    clickupTaskType?: string;
    clickupTaskTypeId?: string;
    clickupTaskTypeFieldId?: string;
  }) => Promise<Task>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<Task>;
  adjustBillableHours: (taskId: string, newDurationMs: number, reason?: string) => Promise<Task>;
  rescheduleTask: (taskId: string, newDueDate?: string) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  moveTask: (taskId: string, targetUserId: string, newStatus: TaskStatus, newIndex?: number, newDueDate?: string | null) => Promise<void>;
  reassignTask: (taskId: string, targetUserId: string) => Promise<void>;
  moveTaskStatus: (taskId: string, newStatus: TaskStatus, newIndex?: number, targetUserId?: string, newDueDate?: string | null) => Promise<void>;
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
  tasksRef.current = tasks;
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  // Stable ref for users — keeps login callback dep-free, preventing context re-creation on every SSE user event
  const usersRef = useRef<User[]>(users);
  usersRef.current = users;
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

  // Stable ref for currentUser — keeps adjustBillableHours and task helpers dep-free
  const currentUserRef = useRef<User | null>(currentUser);
  currentUserRef.current = currentUser;
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  const [activeRoleTab, setActiveRoleTab] = useState<Role>(() => {
    if (currentUser?.role) return currentUser.role;
    return 'content';
  });

  // Roles & Permissions
  const SUPERADMIN_EMAIL = 'kiran.s@zensciences.com';
  const isSuperadmin = useMemo(() => {
    return currentUser?.email?.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase();
  }, [currentUser]);

  const isCreativeDirector = useMemo(() => {
    return Boolean(currentUser?.isCreativeDirector || isSuperadmin);
  }, [currentUser, isSuperadmin]);

  const creativeDirectors = useMemo(() => {
    return users.filter(u => u.isCreativeDirector || u.email.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase());
  }, [users]);

  const [activeBoardId, setActiveBoardIdState] = useState<string>(() => {
    return localStorage.getItem('zenflow_active_board_id') || 'all';
  });

  const setActiveBoardId = useCallback((boardId: string) => {
    setActiveBoardIdState(boardId);
    try {
      localStorage.setItem('zenflow_active_board_id', boardId);
    } catch {}
  }, []);

  // Synchronize board access with user role
  useEffect(() => {
    if (currentUser) {
      const isSuper = currentUser.email.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase();
      const isCD = Boolean(currentUser.isCreativeDirector || isSuper);
      if (!isCD) {
        // Regular user: locked to their assigned Creative Director's board
        const targetBoard = currentUser.creativeDirectorId || currentUser.id;
        setActiveBoardIdState(targetBoard);
      } else if (activeBoardId !== 'all' && !creativeDirectors.some(cd => cd.id === activeBoardId)) {
        setActiveBoardIdState(currentUser.id);
      }
    }
  }, [currentUser, creativeDirectors, activeBoardId]);

  const canManageMembers = useMemo(() => {
    if (!currentUser) return false;
    return isSuperadmin || isCreativeDirector;
  }, [currentUser, isSuperadmin, isCreativeDirector]);

  const canSwitchBoards = useMemo(() => {
    if (!currentUser) return false;
    return isSuperadmin || isCreativeDirector;
  }, [currentUser, isSuperadmin, isCreativeDirector]);

  const canEditUserTasks = useCallback((targetUserId: string): boolean => {
    if (!currentUser) return false;
    if (isSuperadmin) return true;
    if (isCreativeDirector) {
      if (targetUserId === currentUser.id) return true;
      const target = usersRef.current.find(u => u.id === targetUserId);
      return target?.creativeDirectorId === currentUser.id;
    }
    return targetUserId === currentUser.id;
  }, [currentUser, isSuperadmin, isCreativeDirector]);

  // ClickUp Integration State
  const isZensciencesUser = useMemo(() => {
    return Boolean(currentUser?.email?.toLowerCase().endsWith('@zensciences.com'));
  }, [currentUser]);

  const clickupApiKey = useMemo(() => {
    return currentUser?.clickupApiKey || localStorage.getItem('zenflow_clickup_api_key') || '';
  }, [currentUser]);

  const isClickupConnected = useMemo(() => {
    return Boolean(isZensciencesUser && clickupApiKey);
  }, [isZensciencesUser, clickupApiKey]);

  const [showClickupPrompt, setShowClickupPrompt] = useState<boolean>(false);
  const [clickupSpaces, setClickupSpaces] = useState<ClickupSpace[]>([]);
  const [selectedClickupSpaceId, setSelectedClickupSpaceIdState] = useState<string>(() => {
    return currentUser?.selectedClickupSpaceId || localStorage.getItem('zenflow_clickup_space_id') || '';
  });
  const selectedClickupSpaceIdRef = useRef<string>(selectedClickupSpaceId);
  selectedClickupSpaceIdRef.current = selectedClickupSpaceId;
  const [clickupFoldersAndLists, setClickupFoldersAndLists] = useState<{
    folders: ClickupFolder[];
    folderlessLists: ClickupList[];
  }>({ folders: [], folderlessLists: [] });
  const [spaceFoldersMap, setSpaceFoldersMap] = useState<Record<string, string[]>>({});

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved !== null) return saved === 'true';
      return true; // Default to Sophisticated Dark theme
    } catch {
      return true;
    }
  });

  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [clickupMembers, setClickupMembers] = useState<ClickupMember[]>([]);
  const [clickupCustomFieldOptions, setClickupCustomFieldOptions] = useState<ClickupCustomFieldOption[]>([]);
  const [clickupTaskTypeFieldId, setClickupTaskTypeFieldId] = useState<string>('');
  const [isLoadingTaskTypes, setIsLoadingTaskTypes] = useState<boolean>(false);
  const [userSyncFailures, setUserSyncFailures] = useState<Record<string, boolean>>({});
  const [clickupWebhookStatus, setClickupWebhookStatus] = useState<ClickupWebhookStatus | null>(null);

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

  const refreshClickupWebhookStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/clickup/webhook/status');
      if (res.ok) {
        const data: ClickupWebhookStatus = await res.json();
        setClickupWebhookStatus(data);
      }
    } catch {
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
        const idReassignments = new Map<string, string>(); // duplicateId -> primaryId

        if (Array.isArray(data.users) && data.users.length > 0) {
          const rawTasks = Array.isArray(data.tasks) ? data.tasks : [];
          const byEmail = new Map<string, User[]>();
          for (const u of data.users) {
            if (!u || !u.id || !u.email) continue;
            const em = u.email.toLowerCase().trim();
            if (!byEmail.has(em)) byEmail.set(em, []);
            byEmail.get(em)!.push(u);
          }

          const dedupedUsers: User[] = [];

          for (const [em, list] of byEmail.entries()) {
            if (list.length === 1) {
              const u = list[0];
              if (em === SUPERADMIN_EMAIL.toLowerCase()) u.isCreativeDirector = true;
              dedupedUsers.push(u);
              continue;
            }

            // Deduplicate! Pick the one with tasks, or non-user-superadmin-kiran
            let primary = list.find(u => rawTasks.some(t => t.userId === u.id));
            if (!primary) {
              primary = list.find(u => u.id !== 'user-superadmin-kiran') || list[0];
            }
            if (em === SUPERADMIN_EMAIL.toLowerCase()) primary.isCreativeDirector = true;
            dedupedUsers.push(primary);

            for (const dup of list) {
              if (dup.id !== primary.id) {
                idReassignments.set(dup.id, primary.id);
              }
            }
          }

          setUsers(dedupedUsers);

          // If currentUser exists, sync it to the primary deduplicated user
          setCurrentUser(prev => {
            if (!prev) return dedupedUsers[0] || null;
            const targetId = idReassignments.get(prev.id) || prev.id;
            const matched = dedupedUsers.find(
              (u: User) => u.id === targetId || u.email.toLowerCase() === prev.email.toLowerCase()
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
              // Reassign task userId if it was assigned to a duplicate ID
              if (idReassignments.has(t.userId)) {
                t.userId = idReassignments.get(t.userId)!;
              }
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
    refreshClickupWebhookStatus();
  }, [fetchState, refreshFirestoreStatus, refreshClickupWebhookStatus]);

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

  // ClickUp Loaders & Handlers
  const loadClickupSpaces = useCallback(async (apiKey: string) => {
    if (!apiKey) return;
    try {
      const res = await fetch('/api/clickup/spaces', {
        headers: { 'x-clickup-api-key': apiKey },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.spaces)) {
          setClickupSpaces(data.spaces);
          if (data.spaces.length > 0 && !selectedClickupSpaceIdRef.current) {
            const firstId = data.spaces[0].id;
            setSelectedClickupSpaceIdState(firstId);
            localStorage.setItem('zenflow_clickup_space_id', firstId);
          }
          // Preload folder names for all spaces in background
          data.spaces.forEach(async (sp: ClickupSpace) => {
            try {
              const fRes = await fetch(
                `/api/clickup/folders-and-lists?spaceId=${encodeURIComponent(sp.id)}`,
                { headers: { 'x-clickup-api-key': apiKey } }
              );
              if (fRes.ok) {
                const fData = await fRes.json();
                const folderNames = (fData.folders || []).map((f: ClickupFolder) => f.name);
                setSpaceFoldersMap(prev => ({
                  ...prev,
                  [sp.id]: folderNames,
                }));
              }
            } catch {
              // ignore
            }
          });
        }
      }
    } catch (err) {
      console.warn('Failed to load ClickUp spaces:', err);
    }
  }, []);

  const loadClickupFoldersAndLists = useCallback(async (spaceId: string, apiKey: string) => {
    if (!spaceId || !apiKey) return;
    try {
      const res = await fetch(`/api/clickup/folders-and-lists?spaceId=${encodeURIComponent(spaceId)}`, {
        headers: { 'x-clickup-api-key': apiKey },
      });
      if (res.ok) {
        const data = await res.json();
        setClickupFoldersAndLists({
          folders: data.folders || [],
          folderlessLists: data.folderlessLists || [],
        });
        const folderNames = (data.folders || []).map((f: ClickupFolder) => f.name);
        setSpaceFoldersMap(prev => ({
          ...prev,
          [spaceId]: folderNames,
        }));
      }
    } catch (err) {
      console.warn('Failed to load ClickUp folders & lists:', err);
    }
  }, []);

  useEffect(() => {
    if (isClickupConnected && clickupApiKey) {
      loadClickupSpaces(clickupApiKey);
    }
  }, [isClickupConnected, clickupApiKey, loadClickupSpaces]);

  useEffect(() => {
    if (isClickupConnected && clickupApiKey && selectedClickupSpaceId) {
      loadClickupFoldersAndLists(selectedClickupSpaceId, clickupApiKey);
    }
  }, [isClickupConnected, clickupApiKey, selectedClickupSpaceId, loadClickupFoldersAndLists]);

  const loadClickupMembers = useCallback(async (apiKey?: string): Promise<ClickupMember[]> => {
    const key = (apiKey || clickupApiKey || '').trim();
    try {
      const headers: Record<string, string> = {};
      if (key) headers['x-clickup-api-key'] = key;
      const res = await fetch('/api/clickup/members', { headers });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.members)) {
          setClickupMembers(data.members);
          return data.members;
        }
      }
    } catch (err) {
      console.warn('Failed to load ClickUp members:', err);
    }
    return [];
  }, [clickupApiKey]);

  useEffect(() => {
    if (isClickupConnected && clickupApiKey) {
      loadClickupMembers(clickupApiKey);
    }
  }, [isClickupConnected, clickupApiKey, loadClickupMembers]);

  // Google Auth Session Enforcement
  // If not logged in via Google Auth, log them out and bring them to login screen
  useEffect(() => {
    let isMounted = true;
    let unsubPromise: Promise<() => void> | null = null;

    unsubPromise = onFirebaseAuthStateChanged(async (fbUser) => {
      if (!isMounted) return;

      if (!fbUser) {
        // No Google user session
        setCurrentUser(null);
        try {
          localStorage.removeItem(USER_SESSION_KEY);
        } catch {}
        setIsAuthChecking(false);
        return;
      }

      // Google user is logged in
      const email = (fbUser.email || '').toLowerCase().trim();
      if (!email) {
        await signOutFirebase();
        setCurrentUser(null);
        try {
          localStorage.removeItem(USER_SESSION_KEY);
        } catch {}
        setAuthError('Google Account has no email address.');
        setIsAuthChecking(false);
        return;
      }

      // Check registered users in workspace
      let matched = usersRef.current.find(u => u.email.toLowerCase().trim() === email);
      if (!matched) {
        try {
          const res = await fetch('/api/auth/verify-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });
          if (res.ok) {
            const data = await res.json();
            matched = data.user;
          }
        } catch (e) {
          console.warn('[Auth] Server verify-email failed:', e);
        }
      }

      if (matched) {
        setCurrentUser(matched);
        setAuthError(null);
      } else {
        await signOutFirebase();
        setCurrentUser(null);
        try {
          localStorage.removeItem(USER_SESSION_KEY);
        } catch {}
        setAuthError(`Account not registered: ${email}. Only registered ZenFlow team members can view the board. Please contact kiran.s@zensciences.com to be added.`);
      }
      setIsAuthChecking(false);
    });

    return () => {
      isMounted = false;
      if (unsubPromise) {
        unsubPromise.then(unsub => unsub?.()).catch(() => {});
      }
    };
  }, []);

  const updateUserProfile = useCallback(async (userId: string, updates: Partial<User>): Promise<User> => {
    setUsers(prev => prev.map(u => (u.id === userId ? { ...u, ...updates } : u)));
    if (currentUserRef.current?.id === userId) {
      setCurrentUser(prev => (prev ? { ...prev, ...updates } : null));
    }
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const updatedUser: User = await res.json();
        setUsers(prev => prev.map(u => (u.id === userId ? updatedUser : u)));
        if (currentUserRef.current?.id === userId) {
          setCurrentUser(updatedUser);
        }
        return updatedUser;
      }
    } catch (err) {
      console.warn('Update user profile offline/failed:', err);
    }
    return { ...(usersRef.current.find(u => u.id === userId) || {}), ...updates } as User;
  }, []);

  const connectClickup = useCallback(async (apiKey: string): Promise<{ success: boolean; error?: string }> => {
    const cleanKey = apiKey.trim();
    if (!cleanKey) return { success: false, error: 'API key is required' };
    try {
      const res = await fetch('/api/clickup/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: cleanKey }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        return { success: false, error: data.error || 'Invalid ClickUp API Key' };
      }
      localStorage.setItem('zenflow_clickup_api_key', cleanKey);
      if (currentUserRef.current) {
        await updateUserProfile(currentUserRef.current.id, { clickupApiKey: cleanKey });
      }
      await loadClickupSpaces(cleanKey);
      setShowClickupPrompt(false);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Connection failed' };
    }
  }, [updateUserProfile, loadClickupSpaces]);

  const disconnectClickup = useCallback(() => {
    localStorage.removeItem('zenflow_clickup_api_key');
    if (currentUserRef.current) {
      updateUserProfile(currentUserRef.current.id, { clickupApiKey: undefined });
    }
    setClickupSpaces([]);
    setClickupFoldersAndLists({ folders: [], folderlessLists: [] });
  }, [updateUserProfile]);

  const setSelectedClickupSpaceId = useCallback(async (spaceId: string, spaceName?: string) => {
    setSelectedClickupSpaceIdState(spaceId);
    try {
      localStorage.setItem('zenflow_clickup_space_id', spaceId);
      if (spaceName) localStorage.setItem('zenflow_clickup_space_name', spaceName);
    } catch {}

    if (currentUserRef.current) {
      await updateUserProfile(currentUserRef.current.id, {
        selectedClickupSpaceId: spaceId,
        selectedClickupSpaceName: spaceName,
      });
    }

    if (clickupApiKey) {
      await loadClickupFoldersAndLists(spaceId, clickupApiKey);
    }
  }, [clickupApiKey, updateUserProfile, loadClickupFoldersAndLists]);

  const createClickupList = useCallback(async (
    name: string,
    spaceId: string,
    folderId?: string
  ): Promise<ClickupList | null> => {
    const apiKey = currentUserRef.current?.clickupApiKey || localStorage.getItem('zenflow_clickup_api_key') || '';
    if (!apiKey || !name) return null;
    try {
      const res = await fetch('/api/clickup/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          spaceId,
          folderId,
          name: name.trim(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const createdList: ClickupList = data.list;
        await loadClickupFoldersAndLists(spaceId, apiKey);
        return createdList;
      }
    } catch (err) {
      console.warn('Failed to create ClickUp list:', err);
    }
    return null;
  }, [loadClickupFoldersAndLists]);

  const syncUserTasksWithClickUp = useCallback(async (userId: string) => {
    const apiKey = currentUserRef.current?.clickupApiKey || localStorage.getItem('zenflow_clickup_api_key') || '';
    const callerUserId = currentUserRef.current?.id;
    try {
      const res = await fetch('/api/clickup/sync-user-tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'x-clickup-api-key': apiKey } : {}),
          ...(callerUserId ? { 'x-caller-user-id': callerUserId } : {}),
        },
        body: JSON.stringify({ userId, apiKey, callerUserId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUserSyncFailures(prev => ({ ...prev, [userId]: false }));
        await fetchState();
        return {
          success: true,
          syncedCount: data.syncedCount || 0,
          archivedCount: data.archivedCount || 0,
          message: data.message || 'Sync complete',
        };
      }
      setUserSyncFailures(prev => ({ ...prev, [userId]: true }));
      return {
        success: false,
        syncedCount: 0,
        archivedCount: 0,
        message: data.error || 'Failed to sync with ClickUp',
      };
    } catch (err: any) {
      setUserSyncFailures(prev => ({ ...prev, [userId]: true }));
      return {
        success: false,
        syncedCount: 0,
        archivedCount: 0,
        message: err.message || 'Sync request failed',
      };
    }
  }, [fetchState]);

  const fetchClickupCustomFields = useCallback(async (params: { listId?: string; spaceId?: string; folderId?: string }): Promise<ClickupCustomFieldOption[]> => {
    const apiKey = currentUserRef.current?.clickupApiKey || localStorage.getItem('zenflow_clickup_api_key') || '';
    if (!apiKey) return [];
    setIsLoadingTaskTypes(true);
    try {
      const q = new URLSearchParams();
      if (params.listId) q.set('listId', params.listId);
      else if (params.spaceId) q.set('spaceId', params.spaceId);
      else if (params.folderId) q.set('folderId', params.folderId);

      const res = await fetch(`/api/clickup/custom-fields?${q.toString()}`, {
        headers: { 'x-clickup-api-key': apiKey },
      });
      if (res.ok) {
        const data = await res.json();
        const options: ClickupCustomFieldOption[] = data.options || [];
        setClickupCustomFieldOptions(options);
        if (data.taskTypeField?.id) {
          setClickupTaskTypeFieldId(data.taskTypeField.id);
        }
        return options;
      }
    } catch (err) {
      console.warn('[DashboardContext] Failed to fetch custom fields:', err);
    } finally {
      setIsLoadingTaskTypes(false);
    }
    return [];
  }, []);

  useEffect(() => {
    if (selectedClickupSpaceId && clickupApiKey) {
      fetchClickupCustomFields({ spaceId: selectedClickupSpaceId });
    }
  }, [selectedClickupSpaceId, clickupApiKey, fetchClickupCustomFields]);

  const getUserSyncState = useCallback((targetUserId: string): 'synced' | 'pending' | 'failed' | 'unmapped' => {
    const targetUser = usersRef.current.find(u => u.id === targetUserId);
    if (!targetUser?.clickupUserId) {
      return 'unmapped';
    }
    if (userSyncFailures[targetUserId]) {
      return 'failed';
    }
    const targetTasks = tasksRef.current.filter(t => t.userId === targetUserId);
    const hasUnsynced = targetTasks.some(t => t.clickupListId && !t.clickupTaskId);
    if (hasUnsynced) {
      return 'pending';
    }
    return 'synced';
  }, [userSyncFailures]);

  // ClickUp Real-Time Webhook Registration
  const registerClickupWebhook = useCallback(async (customEndpoint?: string): Promise<{ success: boolean; message: string; webhookId?: string }> => {
    try {
      const key = clickupApiKey || currentUserRef.current?.clickupApiKey || '';
      const res = await fetch('/api/clickup/webhook/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(key ? { 'x-clickup-api-key': key } : {}),
        },
        body: JSON.stringify({ endpoint: customEndpoint }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await refreshClickupWebhookStatus();
        return {
          success: true,
          message: data.message || 'ClickUp real-time webhook registered successfully!',
          webhookId: data.webhookId,
        };
      }
      return { success: false, message: data.error || 'Failed to register webhook in ClickUp' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Network error registering webhook' };
    }
  }, [clickupApiKey, refreshClickupWebhookStatus]);

  // SOC2 Compliance Audit Stream Queries & Export
  const fetchAuditLogs = useCallback(async (limit: number = 50): Promise<AuditLogEntry[]> => {
    try {
      const res = await fetch(`/api/audit/logs?limit=${limit}`);
      if (res.ok) {
        const data = await res.json();
        return data.logs || [];
      }
    } catch (err) {
      console.warn('Failed to fetch compliance audit logs:', err);
    }
    return [];
  }, []);

  const downloadAuditLogs = useCallback(() => {
    window.open('/api/audit/download', '_blank');
  }, []);

  // Authentication Login: takes name, role (content or design), official email address
  const login = useCallback(async (name: string, role: Role, email: string): Promise<User> => {
    const cleanEmail = email.trim().toLowerCase();
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, role, email: cleanEmail }),
      });

      if (res.ok) {
        const data = await res.json();
        const user: User = data.user;
        setCurrentUser(user);
        setActiveRoleTab(user.role);
        setUsers(prev => {
          const exists = prev.some(u => u.id === user.id);
          return exists ? prev.map(u => (u.id === user.id ? user : u)) : [...prev, user];
        });
        return user;
      } else {
        const errData = await res.json();
        throw new Error(errData.error || 'Authentication rejected');
      }
    } catch (err: any) {
      console.warn('Login call failed:', err);
      throw err;
    }
  }, []);

  const loginWithGoogle = useCallback(async (): Promise<User> => {
    setAuthError(null);
    const googleUser = await signInWithGoogle();
    const cleanEmail = googleUser.email.trim().toLowerCase();

    // Prefer user with existing tasks if multiple exist
    const matchingUsers = usersRef.current.filter(u => u.email.toLowerCase() === cleanEmail);
    let existing = matchingUsers.find(u => tasksRef.current.some(t => t.userId === u.id))
      || matchingUsers.find(u => u.id !== 'user-superadmin-kiran')
      || matchingUsers[0];

    if (!existing) {
      try {
        const res = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail }),
        });
        if (res.ok) {
          const data = await res.json();
          existing = data.user;
        }
      } catch (err) {
        console.warn('Backend verify-email call failed:', err);
      }
    }

    if (!existing) {
      await signOutFirebase();
      const err = `Account not registered: ${cleanEmail}. Only users with existing ZenFlow accounts are authorized to sign in. Please contact kiran.s@zensciences.com to be added.`;
      setAuthError(err);
      throw new Error(err);
    }

    setCurrentUser(existing);
    setActiveRoleTab(existing.role);
    if (existing.email.toLowerCase().endsWith('@zensciences.com') && !existing.clickupApiKey) {
      setShowClickupPrompt(true);
    }
    return existing;
  }, []);

  const logout = useCallback(() => {
    setCurrentUser(null);
    try {
      localStorage.removeItem(USER_SESSION_KEY);
    } catch {}
    signOutFirebase().catch(() => {});
  }, []);

  const switchUser = useCallback((user: User) => {
    setCurrentUser(user);
    setActiveRoleTab(user.role);
  }, []);

  const createUser = useCallback(async (data: {
    name: string;
    email: string;
    role: Role;
    isCreativeDirector?: boolean;
    creativeDirectorId?: string;
    clickupUserId?: string;
    clickupUsername?: string;
  }): Promise<User> => {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const newUser: User = await res.json();
      setUsers(prev => {
        const filtered = prev.filter(u => u.id !== newUser.id);
        return [...filtered, newUser];
      });
      return newUser;
    }
    const err = await res.json();
    throw new Error(err.error || 'Failed to create user');
  }, []);

  // Task creation with offline mutation queuing
  const createTask = useCallback(async (data: {
    userId: string;
    title: string;
    description?: string;
    dueDate?: string;
    cognitiveLoad: 'low' | 'medium' | 'high';
    status: TaskStatus;
    clickupTaskId?: string;
    clickupFolderId?: string;
    clickupFolderName?: string;
    clickupListId?: string;
    clickupListName?: string;
    clickupSpaceId?: string;
    clickupUrl?: string;
    clickupTaskType?: string;
    clickupTaskTypeId?: string;
    clickupTaskTypeFieldId?: string;
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
      clickupTaskId: data.clickupTaskId,
      clickupFolderId: data.clickupFolderId,
      clickupFolderName: data.clickupFolderName,
      clickupListId: data.clickupListId,
      clickupListName: data.clickupListName,
      clickupSpaceId: data.clickupSpaceId,
      clickupUrl: data.clickupUrl,
      clickupTaskType: data.clickupTaskType,
      clickupTaskTypeId: data.clickupTaskTypeId,
      clickupTaskTypeFieldId: data.clickupTaskTypeFieldId,
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

    const callerId = currentUserRef.current?.id || '';
    const clickKey = currentUserRef.current?.clickupApiKey || localStorage.getItem('zenflow_clickup_api_key') || '';

    try {
      if (!navigator.onLine) throw new Error('Offline');
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(clickKey ? { 'x-clickup-api-key': clickKey } : {}),
          ...(callerId ? { 'x-caller-user-id': callerId } : {}),
        },
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

          if (updates.inProgressDurationMs !== undefined) {
            inProgressDurationMs = Math.max(0, updates.inProgressDurationMs);
            if (updates.inProgressStartedAt !== undefined) {
              inProgressStartedAt = updates.inProgressStartedAt;
            }
          } else if (updates.status !== undefined) {
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
          const finalDueDate = updates.status === 'pipeline'
            ? undefined
            : updates.dueDate !== undefined
            ? (updates.dueDate || undefined)
            : t.dueDate;

          updatedTask = {
            ...t,
            ...updates,
            dueDate: finalDueDate,
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

    const callerId = currentUserRef.current?.id || '';
    const clickKey = currentUserRef.current?.clickupApiKey || localStorage.getItem('zenflow_clickup_api_key') || '';

    try {
      if (!navigator.onLine) throw new Error('Offline');
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(clickKey ? { 'x-clickup-api-key': clickKey } : {}),
          ...(callerId ? { 'x-caller-user-id': callerId } : {}),
        },
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

  const assignTaskClickupList = useCallback(async (
    taskId: string,
    listId: string,
    listName: string,
    folderId?: string,
    folderName?: string
  ): Promise<Task> => {
    return await updateTask(taskId, {
      clickupListId: listId,
      clickupListName: listName,
      clickupFolderId: folderId,
      clickupFolderName: folderName,
    });
  }, [updateTask]);

  // Dedicated helper to adjust billable hours manually with immediate optimistic update and audit history logging
  const adjustBillableHours = useCallback(async (taskId: string, newDurationMs: number, reason?: string): Promise<Task> => {
    const cleanDuration = Math.max(0, Math.round(newDurationMs));
    const currentTask = tasksRef.current.find(t => t.id === taskId);
    const previousBillableMs = currentTask ? getTaskBillableMs(currentTask) : 0;
    const oldFormatted = formatBillableHours(previousBillableMs);
    const newFormatted = formatBillableHours(cleanDuration);

    const isCurrentInProgress = currentTask?.status === 'in_progress';
    const newStartedAt = isCurrentInProgress ? new Date().toISOString() : undefined;

    const trimmedReason = reason?.trim() || '';
    const details = `Billable hours adjusted from ${oldFormatted} to ${newFormatted}${trimmedReason ? ` (${trimmedReason})` : ''}`;

    const activityEntry: TaskActivity = {
      id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      action: 'billable_adjusted',
      from: oldFormatted,
      to: newFormatted,
      actorName: currentUserRef.current?.name,
      details,
    };

    let optimisticTask: Task | undefined;
    setTasks(prev => {
      const map = new Map<string, Task>();
      for (const t of prev) {
        if (t.id === taskId) {
          const currentLogs = Array.isArray(t.activityLog) ? t.activityLog : [];
          const updatedLogs = [activityEntry, ...currentLogs].slice(0, 15);
          optimisticTask = {
            ...t,
            inProgressDurationMs: cleanDuration,
            inProgressStartedAt: newStartedAt,
            updatedAt: new Date().toISOString(),
            activityLog: updatedLogs,
          };
          map.set(t.id, optimisticTask);
        } else {
          map.set(t.id, t);
        }
      }
      return Array.from(map.values());
    });

    const payload = {
      inProgressDurationMs: cleanDuration,
      inProgressStartedAt: newStartedAt,
      adjustmentReason: trimmedReason || undefined,
      actorName: currentUserRef.current?.name || undefined,
    };

    const callerId = currentUserRef.current?.id || '';
    const clickKey = currentUserRef.current?.clickupApiKey || localStorage.getItem('zenflow_clickup_api_key') || '';

    try {
      if (!navigator.onLine) throw new Error('Offline');
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(clickKey ? { 'x-clickup-api-key': clickKey } : {}),
          ...(callerId ? { 'x-caller-user-id': callerId } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const serverTask: Task = await res.json();
        setTasks(prev => {
          const map = new Map(prev.map(t => [t.id, t]));
          map.set(taskId, serverTask);
          return Array.from(map.values());
        });
        return serverTask;
      } else {
        throw new Error(`Server returned ${res.status}`);
      }
    } catch (err) {
      console.warn('Adjust billable hours offline/failed, buffering in queue:', err);
      enqueueMutation({
        type: 'update_task',
        endpoint: `/api/tasks/${taskId}`,
        method: 'PUT',
        payload,
      });
      setSyncStatus('offline');
    }

    return optimisticTask || (tasksRef.current.find(t => t.id === taskId) as Task);
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
    newIndex?: number,
    newDueDate?: string | null
  ): Promise<void> => {
    const currentTasks = tasksRef.current;
    const task = currentTasks.find(t => t.id === taskId);
    if (!task) return;

    const isSameUser = task.userId === targetUserId;
    const isSameStatus = task.status === newStatus;
    const isDueDateUnchanged = newDueDate === undefined && (newStatus !== 'pipeline' || !task.dueDate);

    if (isSameUser && isSameStatus && newIndex === undefined && isDueDateUnchanged) return;

    // Automatic pipeline deadline removal: pipeline tasks strictly possess no deadline
    const resolvedDueDate =
      newStatus === 'pipeline'
        ? undefined
        : newDueDate !== undefined
        ? (newDueDate || undefined)
        : task.dueDate;

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
      dueDate: resolvedDueDate,
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
      dueDate: t.id === taskId ? (resolvedDueDate || null) : t.dueDate,
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
            dueDate: isMoved ? resolvedDueDate : t.dueDate,
            completedAt: isMoved ? completedAt : t.completedAt,
            inProgressStartedAt: isMoved ? inProgressStartedAt : t.inProgressStartedAt,
            inProgressDurationMs: isMoved ? inProgressDurationMs : t.inProgressDurationMs,
            updatedAt: now,
          };
        }
        return t;
      });
    });

    const callerId = currentUserRef.current?.id || '';
    const clickKey = currentUserRef.current?.clickupApiKey || localStorage.getItem('zenflow_clickup_api_key') || '';

    try {
      if (!navigator.onLine) throw new Error('Offline');
      const res = await fetch('/api/tasks/reorder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(clickKey ? { 'x-clickup-api-key': clickKey } : {}),
          ...(callerId ? { 'x-caller-user-id': callerId } : {}),
        },
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
    targetUserId?: string,
    newDueDate?: string | null
  ): Promise<void> => {
    const task = tasksRef.current.find(t => t.id === taskId);
    if (!task) return;
    const destUser = targetUserId || task.userId;
    await moveTask(taskId, destUser, newStatus, newIndex, newDueDate);
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

    const callerId = currentUserRef.current?.id || '';
    const clickKey = currentUserRef.current?.clickupApiKey || localStorage.getItem('zenflow_clickup_api_key') || '';

    try {
      if (!navigator.onLine) throw new Error('Offline');
      const res = await fetch('/api/tasks/reorder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(clickKey ? { 'x-clickup-api-key': clickKey } : {}),
          ...(callerId ? { 'x-caller-user-id': callerId } : {}),
        },
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
      isAuthChecking,
      authError,
      setAuthError,
      firestoreStatus,
      activeDragInfo,
      setActiveDragInfo,
      refreshFirestoreStatus,
      syncWithFirestore,
      uploadServiceAccountKey,
      login,
      loginWithGoogle,
      logout,
      switchUser,
      createUser,
      updateUserProfile,
      // Role & Permissions
      isSuperadmin,
      isCreativeDirector,
      canManageMembers,
      canEditUserTasks,
      canSwitchBoards,
      creativeDirectors,
      activeBoardId,
      setActiveBoardId,
      // ClickUp Integration
      isZensciencesUser,
      isClickupConnected,
      clickupApiKey,
      clickupMembers,
      loadClickupMembers,
      clickupSpaces,
      selectedClickupSpaceId,
      clickupFoldersAndLists,
      spaceFoldersMap,
      showClickupPrompt,
      setShowClickupPrompt,
      connectClickup,
      disconnectClickup,
      setSelectedClickupSpaceId,
      createClickupList,
      syncUserTasksWithClickUp,
      assignTaskClickupList,
      clickupCustomFieldOptions,
      clickupTaskTypeFieldId,
      isLoadingTaskTypes,
      fetchClickupCustomFields,
      getUserSyncState,
      // Real-Time Webhook & Compliance Audit
      clickupWebhookStatus,
      refreshClickupWebhookStatus,
      registerClickupWebhook,
      fetchAuditLogs,
      downloadAuditLogs,
      // Tasks
      createTask,
      updateTask,
      adjustBillableHours,
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
      isAuthChecking,
      authError,
      firestoreStatus,
      activeDragInfo,
      refreshFirestoreStatus,
      syncWithFirestore,
      uploadServiceAccountKey,
      login,
      loginWithGoogle,
      logout,
      switchUser,
      createUser,
      updateUserProfile,
      isSuperadmin,
      isCreativeDirector,
      canManageMembers,
      canEditUserTasks,
      canSwitchBoards,
      creativeDirectors,
      activeBoardId,
      setActiveBoardId,
      isZensciencesUser,
      isClickupConnected,
      clickupApiKey,
      clickupMembers,
      loadClickupMembers,
      clickupSpaces,
      selectedClickupSpaceId,
      clickupFoldersAndLists,
      spaceFoldersMap,
      showClickupPrompt,
      connectClickup,
      disconnectClickup,
      setSelectedClickupSpaceId,
      createClickupList,
      syncUserTasksWithClickUp,
      assignTaskClickupList,
      clickupCustomFieldOptions,
      clickupTaskTypeFieldId,
      isLoadingTaskTypes,
      fetchClickupCustomFields,
      getUserSyncState,
      clickupWebhookStatus,
      refreshClickupWebhookStatus,
      registerClickupWebhook,
      fetchAuditLogs,
      downloadAuditLogs,
      createTask,
      updateTask,
      adjustBillableHours,
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

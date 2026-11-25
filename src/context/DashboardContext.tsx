import { apiFetch as fetch, clearApiSession, getApiMemberId } from '../lib/api';
import { reconcileSnapshot } from '../lib/reconcile';
import {
  enqueueMutation,
  loadMutationQueue,
  replayMutationQueue,
  subscribeRealtimeEvents,
} from '../lib/syncClient';
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import {
  User,
  Task,
  Role,
  RoleFilter,
  CognitiveLoad,
  TaskStatus,
  RealtimeEvent,
  DragTaskInfo,
  TaskOrderUpdate,
  TaskActivity,
  AuditLogEntry,
  TaskDisciplineMetadata,
  ClickupMember,
  ClickupSpace,
  ClickupList,
  ClickupFolder,
  ClickupCustomFieldOption,
  ClickupWebhookStatus,
} from '../types';
import { compareTasksByDeadline, formatBillableHours, getTaskBillableMs, getTaskAssigneeIds } from '../utils/workload';
import { signInWithGoogle, signOutFirebase, onFirebaseAuthStateChanged } from '../lib/firebase';
import {
  SUPERADMIN_EMAIL,
  isSuperadmin as isSuperadminMember,
  isAdminMember,
  isBusinessLead as isBusinessLeadMember,
  isCreativeDirector as isCreativeDirectorMember,
  isClusterLead as isClusterLeadMember,
  isTeamLead as isTeamLeadMember,
  isAccountsMember,
  canManageMembers as canManageMembersPolicy,
  canCreatePipelineTask as canCreatePipelinePolicy,
  canAssignTask as canAssignTaskPolicy,
  canManageUser as canManageUserPolicy,
  canEditUserBoard,
  canSwitchBoards as canSwitchBoardsPolicy,
} from '../domain/permissions';
import {
  applyOptimisticTaskUpdate,
  applyOptimisticTaskReorder,
  computeStatusTransitionTimers,
  archiveExpiredDoneTasks,
  removeUserFromTaskList,
} from '../domain/taskTransitions';

export interface FirestoreStatus {
  connected: boolean;
  mode: 'admin';
  projectId: string;
  databaseId: string;
  serviceAccountFound: boolean;
  totalUsers: number;
  totalTasks: number;
  lastError: string | null;
  lastSyncTime?: string;
}

export interface AuthContextValue {
  currentUser: User | null;
  isAuthChecking: boolean;
  authError: string | null;
  setAuthError: (err: string | null) => void;
  loginWithGoogle: () => Promise<User>;
  logout: () => void;
  isSuperadmin: boolean;
  isAdministrator: boolean;
  isBusinessLead: boolean;
  isCreativeDirector: boolean;
  isClusterLead: boolean;
  isTeamLead: boolean;
  isAccountManager: boolean;
  canManageMembers: boolean;
  canCreatePipelineTask: boolean;
  canAssignTask: boolean;
  canSwitchBoards: boolean;
  canManageUser: (targetUser: User) => boolean;
  canEditUserTasks: (targetUserId?: string) => boolean;
}

export interface WorkspaceContextValue {
  users: User[];
  tasks: Task[];
  creativeDirectors: User[];
  clusterLeads: User[];
  syncStatus: 'connected' | 'connecting' | 'offline';
  isLoading: boolean;
  firestoreStatus: FirestoreStatus | null;
  refreshFirestoreStatus: () => Promise<void>;
  syncWithFirestore: () => Promise<{ success: boolean; message: string }>;
  purgeAllDatabaseData: () => Promise<{ success: boolean; message: string; deletedTaskCount?: number; deletedUserCount?: number }>;
  createUser: (data: {
    name: string;
    email: string;
    role?: Role;
    isAdministrator?: boolean;
    isBusinessLead?: boolean;
    isCreativeDirector?: boolean;
    isClusterLead?: boolean;
    isTeamLead?: boolean;
    isAccountManager?: boolean;
    isContentLead?: boolean;
    isArtDirector?: boolean;
    isContentSpecialist?: boolean;
    isBrandDesigner?: boolean;
    designation?: string;
    creativeDirectorId?: string;
    clusterLeadId?: string;
    clickupUserId?: string;
    clickupUsername?: string;
  }) => Promise<User>;
  updateUserProfile: (userId: string, updates: Partial<User>) => Promise<User>;
  remapUserTasks: (fromUserIdOrEmail: string, toUserId: string, deleteSourceUser?: boolean) => Promise<{ success: boolean; remappedCount: number; error?: string }>;
  deleteUser: (userId: string) => Promise<void>;
  fetchAuditLogs: (limit?: number) => Promise<AuditLogEntry[]>;
  downloadAuditLogs: () => void;
  createPipelineBundle: (data: {
    title: string;
    description?: string;
    brandGuidelines?: string;
    dueDate?: string;
    client?: string;
    project?: string;
    priority?: 'low' | 'medium' | 'high';
    disciplines: ('content' | 'design')[];
    disciplineSpecs?: Partial<Record<'content' | 'design', TaskDisciplineMetadata>>;
    clickupSpaceId?: string;
    clickupSpaceName?: string;
    clickupFolderId?: string;
    clickupFolderName?: string;
    clickupListId?: string;
    clickupListName?: string;
    clickupTaskType?: string;
    clickupTaskTypeId?: string;
    clickupTaskTypeFieldId?: string;
  }) => Promise<{ parentTask: any; tasks: Task[] }>;
  createTask: (data: {
    userId?: string;
    assigneeIds?: string[];
    team?: Role;
    title: string;
    description?: string;
    brandGuidelines?: string;
    dueDate?: string;
    startDate?: string;
    cognitiveLoad: CognitiveLoad;
    status?: TaskStatus;
    client?: string;
    project?: string;
    estimatedHours?: number;
    priority?: 'low' | 'medium' | 'high';
    attachments?: string[];
    disciplineMetadata?: TaskDisciplineMetadata;
    clickupSpaceId?: string;
    clickupSpaceName?: string;
    clickupFolderId?: string;
    clickupFolderName?: string;
    clickupListId?: string;
    clickupListName?: string;
    clickupTaskType?: string;
    clickupTaskTypeId?: string;
    clickupTaskTypeFieldId?: string;
  }) => Promise<Task>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<Task>;
  adjustBillableHours: (taskId: string, newDurationMs: number, reason?: string) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;
  removeAssigneeOrDeleteTask: (id: string, removeAssigneeId?: string) => Promise<void>;
  shareTaskWithUser: (taskId: string, targetUserId: string) => Promise<Task>;
  reassignTaskFromUser: (
    taskId: string,
    sourceUserId: string,
    targetUserId: string,
    newStatus?: TaskStatus,
    newDueDate?: string | null
  ) => Promise<Task>;
  moveTask: (
    taskId: string,
    targetUserId: string,
    newStatus: TaskStatus,
    newIndex?: number,
    newDueDate?: string | null,
    extraUpdates?: {
      startDate?: string;
      estimatedHours?: number;
      cognitiveLoad?: CognitiveLoad;
      contentDocLink?: string;
      sourceUserId?: string;
    }
  ) => Promise<void>;
  reorderTasks: (updates: Array<TaskOrderUpdate>) => Promise<void>;
  duplicateTaskToBoard: (params: {
    taskId: string;
    targetUserId: string;
    title?: string;
    targetStatus?: TaskStatus;
    targetDueDate?: string;
  }) => Promise<{ task: Task; warning?: string; message?: string }>;
}

export interface ClickUpContextValue {
  isZensciencesUser: boolean;
  isClickupConnected: boolean;
  clickupMembers: ClickupMember[];
  loadClickupMembers: (apiKey?: string) => Promise<ClickupMember[]>;
  clickupSpaces: ClickupSpace[];
  selectedClickupSpaceId: string;
  spaceFoldersAndListsMap: Record<string, { folders: ClickupFolder[]; folderlessLists: ClickupList[] }>;
  getFoldersAndListsForSpace: (spaceId: string) => Promise<{ folders: ClickupFolder[]; folderlessLists: ClickupList[] }>;
  connectClickup: (apiKey: string) => Promise<{ success: boolean; error?: string }>;
  disconnectClickup: () => void;
  setSelectedClickupSpaceId: (spaceId: string, spaceName?: string) => Promise<void>;
  createClickupSpace: (name: string) => Promise<ClickupSpace | null>;
  createClickupList: (name: string, spaceId: string, folderId?: string) => Promise<ClickupList | null>;
  syncUserTasksWithClickUp: (userId: string) => Promise<{ success: boolean; syncedCount: number; archivedCount: number; message: string }>;
  clickupCustomFieldOptions: ClickupCustomFieldOption[];
  clickupTaskTypeFieldId: string;
  isLoadingTaskTypes: boolean;
  fetchClickupCustomFields: (params: { listId?: string; spaceId?: string; folderId?: string }) => Promise<ClickupCustomFieldOption[]>;
  clickupWebhookStatus: ClickupWebhookStatus | null;
  refreshClickupWebhookStatus: () => Promise<void>;
  registerClickupWebhook: (customEndpoint?: string) => Promise<{ success: boolean; message: string; webhookId?: string }>;
}

export interface BoardUiContextValue {
  activeRoleTab: RoleFilter;
  setActiveRoleTab: (tab: RoleFilter) => void;
  activeBoardId: string;
  setActiveBoardId: (boardId: string) => void;
  darkMode: boolean;
  setDarkMode: (val: boolean | ((prev: boolean) => boolean)) => void;
  activeDragInfo: DragTaskInfo | null;
  setActiveDragInfo: (info: DragTaskInfo | null) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);
const ClickUpContext = createContext<ClickUpContextValue | undefined>(undefined);
const BoardUiContext = createContext<BoardUiContextValue | undefined>(undefined);

const USER_SESSION_KEY = 'team_dash_current_user_v1';
const THEME_KEY = 'team_dash_dark_mode_v1';

export const DashboardProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const tasksRef = useRef<Task[]>(tasks);
  tasksRef.current = tasks;
  const usersRef = useRef<User[]>(users);
  usersRef.current = users;

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const currentUserRef = useRef<User | null>(currentUser);
  currentUserRef.current = currentUser;

  const [activeDragInfo, setActiveDragInfo] = useState<DragTaskInfo | null>(null);
  const [activeRoleTab, setActiveRoleTab] = useState<RoleFilter>('all');
  const [activeBoardId, setActiveBoardId] = useState<string>('all');
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'connected' | 'connecting' | 'offline'>('connecting');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [firestoreStatus, setFirestoreStatus] = useState<FirestoreStatus | null>(null);

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  // Derived permissions
  const isSuperadmin = isSuperadminMember(currentUser);
  const isAdministrator = isAdminMember(currentUser);
  const isBusinessLead = isBusinessLeadMember(currentUser);
  const isCreativeDirector = isCreativeDirectorMember(currentUser);
  const isClusterLead = isClusterLeadMember(currentUser);
  const isTeamLead = isTeamLeadMember(currentUser);
  const isAccountManager = isAccountsMember(currentUser);
  const canManageMembers = canManageMembersPolicy(currentUser);
  const canCreatePipelineTask = canCreatePipelinePolicy(currentUser);
  const canAssignTask = canAssignTaskPolicy(currentUser);
  const canSwitchBoards = canSwitchBoardsPolicy(currentUser);

  const canManageUser = useCallback(
    (targetUser: User) => canManageUserPolicy(currentUserRef.current, targetUser),
    [currentUser]
  );

  const canEditUserTasks = useCallback(
    (targetUserId?: string) => canEditUserBoard(currentUserRef.current, targetUserId, usersRef.current),
    [currentUser]
  );

  const creativeDirectors = useMemo(
    () =>
      users
        .filter(u => u.isCreativeDirector || u.email.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase())
        .sort((a, b) => a.name.localeCompare(b.name)),
    [users]
  );

  const clusterLeads = useMemo(
    () => users.filter(u => u.isClusterLead).sort((a, b) => a.name.localeCompare(b.name)),
    [users]
  );

  useEffect(() => {
    if (!currentUser) {
      setActiveBoardId('all');
    } else if (isAdministrator || isBusinessLead) {
      setActiveBoardId('all');
    } else if (isCreativeDirector || isClusterLead) {
      setActiveBoardId(currentUser.id);
    } else if (currentUser.creativeDirectorId) {
      setActiveBoardId(currentUser.creativeDirectorId);
    } else {
      setActiveBoardId('all');
    }
  }, [currentUser?.id, isAdministrator, isBusinessLead, isCreativeDirector, isClusterLead]);

  useEffect(() => {
    if (activeRoleTab !== 'all' && activeRoleTab !== 'content' && activeRoleTab !== 'design') {
      setActiveRoleTab('all');
    }
  }, [activeRoleTab]);

  // ClickUp state
  const isZensciencesUser = useMemo(
    () => Boolean(currentUser?.email?.toLowerCase().endsWith('@zensciences.com')),
    [currentUser]
  );
  const isClickupConnected = useMemo(
    () => Boolean(isZensciencesUser && currentUser?.clickupConnected),
    [isZensciencesUser, currentUser?.clickupConnected]
  );
  const [clickupSpaces, setClickupSpaces] = useState<ClickupSpace[]>([]);
  const [selectedClickupSpaceId, setSelectedClickupSpaceIdState] = useState<string>(
    () => currentUser?.selectedClickupSpaceId || localStorage.getItem('zenflow_clickup_space_id') || ''
  );
  const selectedClickupSpaceIdRef = useRef<string>(selectedClickupSpaceId);
  selectedClickupSpaceIdRef.current = selectedClickupSpaceId;

  const [spaceFoldersAndListsMap, setSpaceFoldersAndListsMap] = useState<
    Record<string, { folders: ClickupFolder[]; folderlessLists: ClickupList[] }>
  >({});
  const spaceFoldersAndListsMapRef = useRef(spaceFoldersAndListsMap);
  spaceFoldersAndListsMapRef.current = spaceFoldersAndListsMap;
  const [clickupMembers, setClickupMembers] = useState<ClickupMember[]>([]);
  const [clickupCustomFieldOptions, setClickupCustomFieldOptions] = useState<ClickupCustomFieldOption[]>([]);
  const [clickupTaskTypeFieldId, setClickupTaskTypeFieldId] = useState<string>('');
  const [isLoadingTaskTypes, setIsLoadingTaskTypes] = useState<boolean>(false);
  const [clickupWebhookStatus, setClickupWebhookStatus] = useState<ClickupWebhookStatus | null>(null);

  const refreshFirestoreStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/firestore/status');
      if (res.ok) setFirestoreStatus(await res.json());
    } catch {
      // ignore
    }
  }, []);

  const refreshClickupWebhookStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/clickup/webhook/status');
      if (res.ok) setClickupWebhookStatus(await res.json());
    } catch {
      // ignore
    }
  }, []);

  const loadClickupFoldersAndLists = useCallback(async (spaceId: string, apiKey: string = '') => {
    if (!spaceId) return;
    try {
      const res = await fetch(`/api/clickup/folders-and-lists?spaceId=${encodeURIComponent(spaceId)}`, {
        headers: apiKey ? { 'x-clickup-api-key': apiKey } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setSpaceFoldersAndListsMap(prev => ({
          ...prev,
          [spaceId]: { folders: data.folders || [], folderlessLists: data.folderlessLists || [] },
        }));
      }
    } catch (err) {
      console.warn('Failed to load ClickUp folders & lists:', err);
    }
  }, []);

  const loadClickupSpaces = useCallback(async (apiKey: string = '') => {
    try {
      const res = await fetch('/api/clickup/spaces', {
        headers: apiKey ? { 'x-clickup-api-key': apiKey } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.spaces)) {
          setClickupSpaces(data.spaces);
          if (data.spaces.length > 0 && !selectedClickupSpaceIdRef.current) {
            const firstId = data.spaces[0].id;
            setSelectedClickupSpaceIdState(firstId);
            try { localStorage.setItem('zenflow_clickup_space_id', firstId); } catch {}
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load ClickUp spaces:', err);
    }
  }, []);

  const getFoldersAndListsForSpace = useCallback(async (spaceId: string) => {
    if (!spaceId) return { folders: [], folderlessLists: [] };
    if (spaceFoldersAndListsMapRef.current[spaceId]) return spaceFoldersAndListsMapRef.current[spaceId];
    try {
      const res = await fetch(`/api/clickup/folders-and-lists?spaceId=${encodeURIComponent(spaceId)}`);
      if (res.ok) {
        const data = await res.json();
        const result = { folders: data.folders || [], folderlessLists: data.folderlessLists || [] };
        setSpaceFoldersAndListsMap(prev => ({ ...prev, [spaceId]: result }));
        return result;
      }
    } catch (err) {
      console.warn('Failed to load folders & lists for space:', err);
    }
    return { folders: [], folderlessLists: [] };
  }, []);

  const loadClickupMembers = useCallback(async (apiKey: string = ''): Promise<ClickupMember[]> => {
    try {
      const res = await fetch('/api/clickup/members', {
        headers: apiKey ? { 'x-clickup-api-key': apiKey } : {},
      });
      if (res.ok) {
        const data = await res.json();
        const list: ClickupMember[] = Array.isArray(data.members) ? data.members : [];
        setClickupMembers(list);
        return list;
      }
    } catch (err) {
      console.warn('Failed to load ClickUp members:', err);
    }
    return [];
  }, []);

  useEffect(() => {
    if (isClickupConnected) {
      loadClickupSpaces('');
      loadClickupMembers('');
    }
  }, [isClickupConnected, loadClickupSpaces, loadClickupMembers]);

  useEffect(() => {
    try {
      document.documentElement.classList.toggle('dark', darkMode);
      document.body.classList.toggle('dark', darkMode);
      localStorage.setItem(THEME_KEY, String(darkMode));
    } catch {
      // ignore
    }
  }, [darkMode]);

  useEffect(() => {
    try {
      if (currentUser) localStorage.setItem(USER_SESSION_KEY, JSON.stringify(currentUser));
      else localStorage.removeItem(USER_SESSION_KEY);
    } catch {
      // ignore
    }
  }, [currentUser]);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) return;
      const data = await res.json();
      const idReassignments = new Map<string, string>();

      if (Array.isArray(data.users) && data.users.length > 0) {
        const rawTasks = Array.isArray(data.tasks) ? data.tasks : [];
        const byEmail = new Map<string, User[]>();
        for (const u of data.users) {
          if (!u?.id || !u?.email) continue;
          const em = u.email.toLowerCase().trim();
          const list = byEmail.get(em) || [];
          list.push(u);
          byEmail.set(em, list);
        }

        const dedupedUsers: User[] = [];
        for (const [em, list] of byEmail.entries()) {
          let primary = list.find(u => rawTasks.some((t: Task) => t.userId === u.id)) ||
            list.find(u => u.id !== 'user-superadmin-kiran') ||
            list[0];
          if (em === SUPERADMIN_EMAIL.toLowerCase()) primary = { ...primary, isCreativeDirector: true };
          dedupedUsers.push(primary);
          for (const dup of list) {
            if (dup.id !== primary.id) idReassignments.set(dup.id, primary.id);
          }
        }

        setUsers(reconcileSnapshot({ users: dedupedUsers, tasks: [] }, loadMutationQueue(), tasksRef.current).users);
        setCurrentUser(prev => {
          if (!prev) return null;
          const targetId = idReassignments.get(prev.id) || prev.id;
          return dedupedUsers.find(u => u.id === targetId || u.email.toLowerCase() === prev.email.toLowerCase()) || prev;
        });
      }

      if (Array.isArray(data.tasks)) {
        const mappedTasks: Task[] = [];
        for (const t of data.tasks as Task[]) {
          if (!t?.id) continue;
          const remapped = t.userId && idReassignments.has(t.userId)
            ? { ...t, userId: idReassignments.get(t.userId) }
            : t;
          mappedTasks.push(remapped);
        }
        archiveExpiredDoneTasks(mappedTasks);
        setTasks(reconcileSnapshot({ users: [], tasks: mappedTasks }, loadMutationQueue(), tasksRef.current).tasks);
      }
      setSyncStatus('connected');
    } catch (err) {
      console.warn('Backend /api/state not reachable yet, operating in local-resilient mode:', err);
      setSyncStatus('offline');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const isReplayingRef = useRef(false);
  const runReplay = useCallback(async () => {
    if (!getApiMemberId() || isReplayingRef.current) return;
    isReplayingRef.current = true;
    try {
      const result = await replayMutationQueue();
      if (result.completed && result.hadItems) {
        await fetchState();
        await refreshFirestoreStatus();
        setSyncStatus('connected');
      }
    } finally {
      isReplayingRef.current = false;
    }
  }, [fetchState, refreshFirestoreStatus]);

  useEffect(() => {
    if (!currentUser) return;
    fetchState();
    refreshFirestoreStatus();
  }, [currentUser?.id, fetchState, refreshFirestoreStatus]);

  useEffect(() => {
    const handleOnline = () => {
      setSyncStatus('connecting');
      if (getApiMemberId()) runReplay();
    };
    const handleOffline = () => setSyncStatus('offline');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    if (navigator.onLine && loadMutationQueue().length > 0) runReplay();
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [runReplay]);

  useEffect(() => {
    if (!currentUser) return;
    return subscribeRealtimeEvents({
      onStatusChange: setSyncStatus,
      onSnapshot: rawSnapshot => {
        const snapshot = reconcileSnapshot(rawSnapshot, loadMutationQueue(), tasksRef.current);
        setUsers(snapshot.users);
        setTasks(snapshot.tasks);
        setCurrentUser(previous => (previous ? snapshot.users.find(u => u.id === previous.id) || previous : null));
        runReplay();
      },
      onEvent: (event: RealtimeEvent) => {
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
          setTasks(prev => removeUserFromTaskList(prev, deletedUserId).keptTasks);
          setCurrentUser(prev => (prev?.id === deletedUserId ? null : prev));
        } else if (type === 'task_created') {
          setTasks(prev => {
            const map = new Map<string, Task>();
            for (const t of prev) {
              if (t.id.startsWith('temp-') && t.userId === payload.userId && t.title === payload.title) continue;
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
          setTasks(prev => {
            const map = new Map(prev.map(t => [t.id, t]));
            for (const t of payload as Task[]) map.set(t.id, t);
            return Array.from(map.values());
          });
        } else if (type === 'sync_all') {
          if (payload.users) setUsers(Array.from(new Map((payload.users as User[]).map(u => [u.id, u])).values()));
          if (payload.tasks) setTasks(Array.from(new Map((payload.tasks as Task[]).map(t => [t.id, t])).values()));
        }
      },
    });
  }, [runReplay, currentUser?.id]);

  // Firebase Google Auth state subscription
  useEffect(() => {
    let isMounted = true;
    let authRevision = 0;

    const unsubPromise = onFirebaseAuthStateChanged(async fbUser => {
      const revision = ++authRevision;
      if (!isMounted) return;

      if (!fbUser) {
        clearApiSession().catch(() => {});
        setUsers([]);
        setTasks([]);
        setIsLoading(false);
        setCurrentUser(null);
        try { localStorage.removeItem(USER_SESSION_KEY); } catch {}
        setIsAuthChecking(false);
        return;
      }

      const email = (fbUser.email || '').toLowerCase().trim();
      if (!email) {
        await signOutFirebase();
        setCurrentUser(null);
        try { localStorage.removeItem(USER_SESSION_KEY); } catch {}
        setAuthError('Google Account has no email address.');
        setIsAuthChecking(false);
        return;
      }

      let matched: User | undefined;
      try {
        const res = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        if (res.ok) matched = (await res.json()).user;
      } catch (e) {
        console.warn('[Auth] Server verify-email failed:', e);
      }

      if (!isMounted || revision !== authRevision) return;
      if (matched) {
        setCurrentUser(matched);
        setAuthError(null);
      } else {
        await signOutFirebase();
        setCurrentUser(null);
        try { localStorage.removeItem(USER_SESSION_KEY); } catch {}
        setAuthError(
          `Account not registered: ${email}. Only registered ZenFlow team members can view the board. Please contact kiran.s@zensciences.com to be added.`
        );
      }
      setIsAuthChecking(false);
    });

    return () => {
      isMounted = false;
      unsubPromise.then(unsub => unsub?.()).catch(() => {});
    };
  }, []);

  const loginWithGoogle = useCallback(async (): Promise<User> => {
    setAuthError(null);
    const googleUser = await signInWithGoogle();
    const cleanEmail = googleUser.email.trim().toLowerCase();
    const response = await fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail }),
    });
    const existing: User | undefined = response.ok ? (await response.json()).user : undefined;
    if (!existing) {
      await signOutFirebase();
      const err = `Account not registered: ${cleanEmail}. Only users with existing ZenFlow accounts are authorized to sign in. Please contact kiran.s@zensciences.com to be added.`;
      setAuthError(err);
      throw new Error(err);
    }
    setCurrentUser(existing);
    setActiveRoleTab(existing.role === 'content' || existing.role === 'design' ? existing.role : 'all');
    return existing;
  }, []);

  const logout = useCallback(() => {
    setCurrentUser(null);
    setUsers([]);
    setTasks([]);
    clearApiSession().catch(() => {});
    try { localStorage.removeItem(USER_SESSION_KEY); } catch {}
    signOutFirebase().catch(() => {});
  }, []);

  const updateUserProfile = useCallback(async (userId: string, updates: Partial<User>): Promise<User> => {
    const res = await fetch(`/api/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to update user profile');
    }
    const data = await res.json();
    const updatedUser: User = data.user || data;
    if (data.merged && data.deletedUserId) {
      setUsers(prev => prev.filter(u => u.id !== data.deletedUserId).map(u => (u.id === updatedUser.id ? updatedUser : u)));
      setTasks(prev => prev.map(t => (t.userId === data.deletedUserId ? { ...t, userId: updatedUser.id } : t)));
      if (currentUserRef.current?.id === data.deletedUserId) setCurrentUser(updatedUser);
    } else {
      setUsers(prev => prev.map(u => (u.id === userId ? updatedUser : u)));
      if (currentUserRef.current?.id === userId) setCurrentUser(updatedUser);
    }
    return updatedUser;
  }, []);

  const remapUserTasks = useCallback(
    async (
      fromUserIdOrEmail: string,
      toUserId: string,
      deleteSourceUser: boolean = false
    ): Promise<{ success: boolean; remappedCount: number; error?: string }> => {
      try {
        const isEmail = fromUserIdOrEmail.includes('@');
        const res = await fetch('/api/users/remap-tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fromUserId: isEmail ? undefined : fromUserIdOrEmail,
            fromEmail: isEmail ? fromUserIdOrEmail : undefined,
            toUserId,
            deleteSourceUser,
          }),
        });
        const data = await res.json();
        if (!res.ok) return { success: false, remappedCount: 0, error: data.error || 'Failed to remap tasks' };

        const effectiveFromUser = usersRef.current.find(
          u => (!isEmail && u.id === fromUserIdOrEmail) || (isEmail && u.email.toLowerCase() === fromUserIdOrEmail.toLowerCase())
        );
        const effectiveFromId = effectiveFromUser?.id || fromUserIdOrEmail;

        setTasks(prev =>
          prev.map(t => {
            const matches =
              (effectiveFromId && t.userId === effectiveFromId) ||
              (isEmail && t.userId?.toLowerCase() === fromUserIdOrEmail.toLowerCase());
            return matches ? { ...t, userId: toUserId, assigneeIds: [toUserId] } : t;
          })
        );
        if (deleteSourceUser && data.deletedSourceUserId) {
          setUsers(prev => prev.filter(u => u.id !== data.deletedSourceUserId));
        }
        return { success: true, remappedCount: data.remappedCount || 0 };
      } catch (err: any) {
        return { success: false, remappedCount: 0, error: err.message || 'Network error remapping tasks' };
      }
    },
    []
  );

  const fetchAuditLogs = useCallback(async (limit: number = 50): Promise<AuditLogEntry[]> => {
    const res = await fetch(`/api/audit/logs?limit=${limit}`);
    if (!res.ok) throw new Error('Audit history could not be loaded');
    return (await res.json()).logs || [];
  }, []);

  const downloadAuditLogs = useCallback(() => {
    window.open('/api/audit/download', '_blank', 'noopener,noreferrer');
  }, []);

  // ClickUp actions
  const connectClickup = useCallback(
    async (apiKey: string): Promise<{ success: boolean; error?: string }> => {
      const cleanKey = apiKey.trim();
      if (!cleanKey) return { success: false, error: 'API key is required' };
      try {
        const res = await fetch('/api/clickup/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: cleanKey }),
        });
        const data = await res.json();
        if (!res.ok || !data.valid) return { success: false, error: data.error || 'Invalid ClickUp API Key' };
        if (currentUserRef.current) {
          await updateUserProfile(currentUserRef.current.id, { clickupApiKey: cleanKey });
        }
        await loadClickupSpaces('');
        await loadClickupMembers('');
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message || 'Connection failed' };
      }
    },
    [updateUserProfile, loadClickupSpaces, loadClickupMembers]
  );

  const disconnectClickup = useCallback(() => {
    localStorage.removeItem('zenflow_clickup_api_key');
    if (currentUserRef.current) updateUserProfile(currentUserRef.current.id, { clickupApiKey: '' });
    setClickupSpaces([]);
  }, [updateUserProfile]);

  const setSelectedClickupSpaceId = useCallback(
    async (spaceId: string, spaceName?: string) => {
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
      if (isClickupConnected) await loadClickupFoldersAndLists(spaceId, '');
    },
    [isClickupConnected, updateUserProfile, loadClickupFoldersAndLists]
  );

  const createClickupSpace = useCallback(
    async (name: string): Promise<ClickupSpace | null> => {
      if (!name.trim()) return null;
      try {
        const res = await fetch('/api/clickup/spaces', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim() }),
        });
        if (res.ok) {
          const data = await res.json();
          await loadClickupSpaces('');
          return data.space;
        }
      } catch (err) {
        console.warn('Failed to create ClickUp space:', err);
      }
      return null;
    },
    [loadClickupSpaces]
  );

  const createClickupList = useCallback(
    async (name: string, spaceId: string, folderId?: string): Promise<ClickupList | null> => {
      if (!name.trim() || (!spaceId && !folderId)) return null;
      try {
        const res = await fetch('/api/clickup/lists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spaceId, folderId, name: name.trim() }),
        });
        if (res.ok) {
          const data = await res.json();
          setSpaceFoldersAndListsMap(prev => {
            const next = { ...prev };
            delete next[spaceId];
            return next;
          });
          await loadClickupFoldersAndLists(spaceId, '');
          return data.list;
        }
      } catch (err) {
        console.warn('Failed to create ClickUp list:', err);
      }
      return null;
    },
    [loadClickupFoldersAndLists]
  );

  const syncUserTasksWithClickUp = useCallback(
    async (userId: string) => {
      try {
        const res = await fetch('/api/clickup/sync-user-tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
          await fetchState();
          return {
            success: true,
            syncedCount: data.syncedCount || 0,
            archivedCount: data.archivedCount || 0,
            message: data.message || 'Sync complete',
          };
        }
        return { success: false, syncedCount: 0, archivedCount: 0, message: data?.error || 'Failed to sync with ClickUp' };
      } catch (err: any) {
        return { success: false, syncedCount: 0, archivedCount: 0, message: err.message || 'Sync request failed' };
      }
    },
    [fetchState]
  );

  const fetchClickupCustomFields = useCallback(
    async (params: { listId?: string; spaceId?: string; folderId?: string }): Promise<ClickupCustomFieldOption[]> => {
      setIsLoadingTaskTypes(true);
      try {
        const q = new URLSearchParams();
        if (params.listId) q.set('listId', params.listId);
        else if (params.spaceId) q.set('spaceId', params.spaceId);
        else if (params.folderId) q.set('folderId', params.folderId);
        const res = await fetch(`/api/clickup/custom-fields?${q.toString()}`);
        if (res.ok) {
          const data = await res.json();
          const options: ClickupCustomFieldOption[] = data.options || [];
          setClickupCustomFieldOptions(options);
          if (data.taskTypeField?.id) setClickupTaskTypeFieldId(data.taskTypeField.id);
          return options;
        }
      } catch (err) {
        console.warn('[DashboardContext] Failed to fetch custom fields:', err);
      } finally {
        setIsLoadingTaskTypes(false);
      }
      return [];
    },
    []
  );

  const registerClickupWebhook = useCallback(
    async (customEndpoint?: string): Promise<{ success: boolean; message: string; webhookId?: string }> => {
      try {
        const res = await fetch('/api/clickup/webhook/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
    },
    [refreshClickupWebhookStatus]
  );

  // User & Task CRUD
  const createUser = useCallback(async (data: Parameters<WorkspaceContextValue['createUser']>[0]): Promise<User> => {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to add team member');
    }
    const newUser: User = await res.json();
    setUsers(prev => [...prev.filter(u => u.id !== newUser.id), newUser]);
    return newUser;
  }, []);

  const deleteUser = useCallback(async (userId: string): Promise<void> => {
    setUsers(prev => prev.filter(u => u.id !== userId));
    setTasks(prev => removeUserFromTaskList(prev, userId).keptTasks);
    setCurrentUser(prev => (prev?.id === userId ? null : prev));
    try {
      if (!navigator.onLine) throw new Error('Offline');
      const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
    } catch {
      enqueueMutation({ type: 'delete_user', endpoint: `/api/users/${userId}`, method: 'DELETE' });
      setSyncStatus('offline');
    }
  }, []);

  const createPipelineBundle = useCallback<WorkspaceContextValue['createPipelineBundle']>(async data => {
    const res = await fetch('/api/tasks/pipeline-bundle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || 'Failed to create pipeline task');

    const createdTasks: Task[] = Array.isArray(payload.tasks) ? payload.tasks : [];
    setTasks(prev => {
      const map = new Map(prev.map(t => [t.id, t]));
      for (const ct of createdTasks) map.set(ct.id, ct);
      return Array.from(map.values());
    });
    return { parentTask: payload.parentTask, tasks: createdTasks };
  }, []);

  const createTask = useCallback<WorkspaceContextValue['createTask']>(async data => {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date();
    const nowIso = now.toISOString();
    const status: TaskStatus = data.status || 'todo';
    const finalDueDate = status === 'pipeline' || status === 'retainer' ? undefined : data.dueDate;
    const timers = computeStatusTransitionTimers({ status: 'pipeline', inProgressDurationMs: 0 }, status, now);

    const existing = tasksRef.current.filter(
      t => (data.userId ? getTaskAssigneeIds(t).includes(data.userId) : true) && t.status === status
    );
    const maxOrder = existing.reduce((max, t) => Math.max(max, t.order ?? 0), -1);

    const assigneeIds = Array.isArray(data.assigneeIds)
      ? Array.from(new Set(data.assigneeIds.filter(Boolean)))
      : data.userId
      ? [data.userId]
      : [];

    const optimisticTask: Task = {
      id: tempId,
      userId: assigneeIds[0] || undefined,
      assigneeIds,
      team: data.team,
      title: data.title,
      description: data.description,
      brandGuidelines: data.brandGuidelines,
      dueDate: finalDueDate,
      startDate: status === 'pipeline' ? undefined : data.startDate || nowIso.slice(0, 10),
      cognitiveLoad: data.cognitiveLoad,
      status,
      order: maxOrder + 1,
      completedAt: timers.completedAt,
      inProgressStartedAt: timers.inProgressStartedAt,
      inProgressDurationMs: timers.inProgressDurationMs,
      client: data.client,
      project: data.project,
      estimatedHours: data.estimatedHours,
      priority: data.priority,
      attachments: data.attachments,
      disciplineMetadata: data.disciplineMetadata,
      clickupSpaceId: data.clickupSpaceId,
      clickupSpaceName: data.clickupSpaceName,
      clickupFolderId: data.clickupFolderId,
      clickupFolderName: data.clickupFolderName,
      clickupListId: data.clickupListId,
      clickupListName: data.clickupListName,
      clickupTaskType: data.clickupTaskType,
      clickupTaskTypeId: data.clickupTaskTypeId,
      clickupTaskTypeFieldId: data.clickupTaskTypeFieldId,
      createdAt: nowIso,
      updatedAt: nowIso,
      activityLog: [{ id: `act-${Date.now()}`, timestamp: nowIso, action: 'created', details: 'Task created' }],
    };

    setTasks(prev => [...prev, optimisticTask]);

    try {
      if (!navigator.onLine) throw new Error('Offline');
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const createdTask: Task = await res.json();
        setTasks(prev => {
          const map = new Map<string, Task>();
          for (const t of prev) if (t.id !== tempId) map.set(t.id, t);
          map.set(createdTask.id, createdTask);
          return Array.from(map.values());
        });
        return createdTask;
      }
      const errData = await res.json().catch(() => ({}));
      if (res.status >= 400 && res.status < 500) {
        setTasks(prev => prev.filter(t => t.id !== tempId));
        throw new Error(errData.error || `Server rejected request (${res.status})`);
      }
      throw new Error(`Server returned ${res.status}`);
    } catch (err: any) {
      if (err?.message?.startsWith('Server rejected') || err?.message?.includes('Only authorized roles') || err?.message?.includes('discipline')) {
        throw err;
      }
      enqueueMutation({ type: 'create_task', endpoint: '/api/tasks', method: 'POST', payload: data });
      setSyncStatus('offline');
      return optimisticTask;
    }
  }, []);

  const updateTask = useCallback(async (id: string, updates: Partial<Task>): Promise<Task> => {
    let optimisticTask: Task | undefined;
    setTasks(prev => {
      const next = applyOptimisticTaskUpdate(prev, id, updates);
      optimisticTask = next.find(t => t.id === id);
      return next;
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
        setTasks(prev => applyOptimisticTaskUpdate(prev, id, serverTask).map(t => (t.id === id ? serverTask : t)));
        return serverTask;
      }
      if (res.status >= 400 && res.status < 500) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed (${res.status})`);
      }
      throw new Error(`Server returned ${res.status}`);
    } catch (err) {
      console.warn('Update task offline/failed, buffering in queue:', err);
      enqueueMutation({ type: 'update_task', endpoint: `/api/tasks/${id}`, method: 'PUT', payload: updates });
      setSyncStatus('offline');
    }
    return optimisticTask || (tasksRef.current.find(t => t.id === id) as Task);
  }, []);

  const adjustBillableHours = useCallback(
    async (taskId: string, newDurationMs: number, reason?: string): Promise<Task> => {
      const cleanDuration = Math.max(0, Math.round(newDurationMs));
      const currentTask = tasksRef.current.find(t => t.id === taskId);
      const previousBillableMs = currentTask ? getTaskBillableMs(currentTask) : 0;
      const oldFormatted = formatBillableHours(previousBillableMs);
      const newFormatted = formatBillableHours(cleanDuration);
      const newStartedAt = currentTask?.status === 'in_progress' ? new Date().toISOString() : undefined;
      const trimmedReason = reason?.trim() || '';

      const activityEntry: TaskActivity = {
        id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toISOString(),
        action: 'billable_adjusted',
        from: oldFormatted,
        to: newFormatted,
        actorName: currentUserRef.current?.name,
        details: `Billable hours adjusted from ${oldFormatted} to ${newFormatted}${trimmedReason ? ` (${trimmedReason})` : ''}`,
      };

      let optimisticTask: Task | undefined;
      setTasks(prev =>
        prev.map(t => {
          if (t.id !== taskId) return t;
          optimisticTask = {
            ...t,
            inProgressDurationMs: cleanDuration,
            inProgressStartedAt: newStartedAt,
            updatedAt: new Date().toISOString(),
            activityLog: [activityEntry, ...(t.activityLog || [])].slice(0, 15),
          };
          return optimisticTask;
        })
      );

      const payload = {
        inProgressDurationMs: cleanDuration,
        inProgressStartedAt: newStartedAt,
        adjustmentReason: trimmedReason || undefined,
        actorName: currentUserRef.current?.name || undefined,
      };

      try {
        if (!navigator.onLine) throw new Error('Offline');
        const res = await fetch(`/api/tasks/${taskId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const serverTask: Task = await res.json();
          setTasks(prev => prev.map(t => (t.id === taskId ? serverTask : t)));
          return serverTask;
        }
        throw new Error(`Server returned ${res.status}`);
      } catch {
        enqueueMutation({ type: 'update_task', endpoint: `/api/tasks/${taskId}`, method: 'PUT', payload });
        setSyncStatus('offline');
      }
      return optimisticTask || (tasksRef.current.find(t => t.id === taskId) as Task);
    },
    []
  );

  const deleteTask = useCallback(async (id: string): Promise<void> => {
    setTasks(prev => prev.filter(t => t.id !== id));
    try {
      if (!navigator.onLine) throw new Error('Offline');
      const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
    } catch {
      enqueueMutation({ type: 'delete_task', endpoint: `/api/tasks/${id}`, method: 'DELETE' });
      setSyncStatus('offline');
    }
  }, []);

  const removeAssigneeOrDeleteTask = useCallback(
    async (id: string, removeAssigneeId?: string): Promise<void> => {
      const task = tasksRef.current.find(t => t.id === id);
      const assignees = task ? getTaskAssigneeIds(task) : [];
      if (removeAssigneeId && assignees.includes(removeAssigneeId) && assignees.length > 1) {
        const remaining = assignees.filter(uid => uid !== removeAssigneeId);
        setTasks(prev => prev.map(t => (t.id === id ? { ...t, assigneeIds: remaining, userId: remaining[0] } : t)));
        try {
          const res = await fetch(`/api/tasks/${id}?removeAssigneeId=${encodeURIComponent(removeAssigneeId)}`, {
            method: 'DELETE',
          });
          if (!res.ok) throw new Error(`Server returned ${res.status}`);
        } catch (err) {
          console.warn('Partial unassign failed:', err);
        }
        return;
      }
      await deleteTask(id);
    },
    [deleteTask]
  );

  const shareTaskWithUser = useCallback(
    async (taskId: string, targetUserId: string): Promise<Task> => {
      const task = tasksRef.current.find(t => t.id === taskId);
      if (!task) throw new Error('Task not found');
      const nextAssigneeIds = Array.from(new Set([...getTaskAssigneeIds(task), targetUserId]));
      return updateTask(taskId, { assigneeIds: nextAssigneeIds, userId: nextAssigneeIds[0] });
    },
    [updateTask]
  );

  const reassignTaskFromUser = useCallback(
    async (
      taskId: string,
      sourceUserId: string,
      targetUserId: string,
      newStatus?: TaskStatus,
      newDueDate?: string | null
    ): Promise<Task> => {
      const task = tasksRef.current.find(t => t.id === taskId);
      if (!task) throw new Error('Task not found');
      const replaced = getTaskAssigneeIds(task).filter(id => id !== sourceUserId);
      if (!replaced.includes(targetUserId)) replaced.push(targetUserId);
      return updateTask(taskId, {
        assigneeIds: replaced,
        userId: replaced[0],
        ...(newStatus ? { status: newStatus } : {}),
        ...(newDueDate !== undefined ? { dueDate: newDueDate || undefined } : {}),
      });
    },
    [updateTask]
  );

  const duplicateTaskToBoard = useCallback<WorkspaceContextValue['duplicateTaskToBoard']>(async params => {
    const res = await fetch(`/api/tasks/${params.taskId}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUserId: params.targetUserId,
        title: params.title,
        targetStatus: params.targetStatus,
        targetDueDate: params.targetDueDate,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to duplicate task as subtask to board');
    const newTask: Task = data.task;
    setTasks(prev => {
      const exists = prev.some(t => t.id === newTask.id);
      return exists ? prev.map(t => (t.id === newTask.id ? newTask : t)) : [...prev, newTask];
    });
    return { task: newTask, warning: data.warning, message: data.message };
  }, []);

  const reorderTasks = useCallback(async (updates: Array<TaskOrderUpdate>): Promise<void> => {
    setTasks(prev => applyOptimisticTaskReorder(prev, updates));
    try {
      if (!navigator.onLine) throw new Error('Offline');
      const res = await fetch('/api/tasks/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
    } catch {
      enqueueMutation({ type: 'reorder_tasks', endpoint: '/api/tasks/reorder', method: 'POST', payload: { updates } });
      setSyncStatus('offline');
    }
  }, []);

  const moveTask = useCallback<WorkspaceContextValue['moveTask']>(
    async (taskId, targetUserId, newStatus, newIndex, newDueDate, extraUpdates) => {
      const currentTasks = tasksRef.current;
      const task = currentTasks.find(t => t.id === taskId);
      if (!task) return;

      const existingAssignees = getTaskAssigneeIds(task);
      const isSameUser = existingAssignees.includes(targetUserId);
      const isSameStatus = task.status === newStatus;
      const isDueDateUnchanged =
        newDueDate === undefined && ((newStatus !== 'pipeline' && newStatus !== 'retainer') || !task.dueDate);
      if (isSameUser && isSameStatus && newIndex === undefined && isDueDateUnchanged && !extraUpdates) return;

      const resolvedDueDate =
        newStatus === 'pipeline' || newStatus === 'retainer'
          ? undefined
          : newDueDate !== undefined
          ? newDueDate || undefined
          : task.dueDate;

      let nextAssigneeIds: string[];
      if (newStatus === 'pipeline' && !task.userId && existingAssignees.length === 0) {
        nextAssigneeIds = [];
      } else if (task.status === 'pipeline' || existingAssignees.length <= 1) {
        nextAssigneeIds = [targetUserId];
      } else if (existingAssignees.includes(targetUserId)) {
        nextAssigneeIds = existingAssignees;
      } else {
        nextAssigneeIds = extraUpdates?.sourceUserId
          ? Array.from(new Set([...existingAssignees.filter(id => id !== extraUpdates.sourceUserId), targetUserId]))
          : [targetUserId];
      }
      const primaryUserId = nextAssigneeIds[0] || targetUserId;

      const targetUserTasksInStatus = currentTasks
        .filter(t => getTaskAssigneeIds(t).includes(targetUserId) && t.status === newStatus && t.id !== taskId)
        .sort((a, b) => compareTasksByDeadline(a, b, newStatus));

      const targetOrder =
        newIndex !== undefined
          ? Math.max(0, Math.min(newIndex, targetUserTasksInStatus.length))
          : targetUserTasksInStatus.length;

      const now = new Date();
      const nowIso = now.toISOString();
      const timers = computeStatusTransitionTimers(task, newStatus, now);
      const resolvedStartDate =
        newStatus === 'pipeline'
          ? undefined
          : extraUpdates?.startDate !== undefined
          ? extraUpdates.startDate
          : task.startDate || (task.status === 'pipeline' ? nowIso.slice(0, 10) : undefined);

      const movedTaskUpdated: Task = {
        ...task,
        userId: primaryUserId,
        assigneeIds: nextAssigneeIds,
        status: newStatus,
        dueDate: resolvedDueDate,
        startDate: resolvedStartDate,
        estimatedHours: extraUpdates?.estimatedHours !== undefined ? extraUpdates.estimatedHours : task.estimatedHours,
        cognitiveLoad: extraUpdates?.cognitiveLoad !== undefined ? extraUpdates.cognitiveLoad : task.cognitiveLoad,
        contentDocLink: extraUpdates?.contentDocLink !== undefined ? extraUpdates.contentDocLink : task.contentDocLink,
        order: targetOrder,
        ...timers,
        updatedAt: nowIso,
      };

      const reorderedTargetTasks = [...targetUserTasksInStatus];
      reorderedTargetTasks.splice(targetOrder, 0, movedTaskUpdated);

      const batchUpdates: TaskOrderUpdate[] = reorderedTargetTasks.map((t, index) => ({
        id: t.id,
        userId: t.id === taskId ? primaryUserId : t.userId,
        assigneeIds: t.id === taskId ? nextAssigneeIds : getTaskAssigneeIds(t),
        status: newStatus,
        order: index,
        dueDate: t.id === taskId ? resolvedDueDate ?? null : undefined,
        startDate: t.id === taskId ? resolvedStartDate : undefined,
        estimatedHours: t.id === taskId && extraUpdates?.estimatedHours !== undefined ? extraUpdates.estimatedHours : undefined,
        cognitiveLoad: t.id === taskId && extraUpdates?.cognitiveLoad !== undefined ? extraUpdates.cognitiveLoad : undefined,
        contentDocLink: t.id === taskId && extraUpdates?.contentDocLink !== undefined ? extraUpdates.contentDocLink : undefined,
      }));

      await reorderTasks(batchUpdates);
    },
    [reorderTasks]
  );

  const syncWithFirestore = useCallback(async () => {
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

  const purgeAllDatabaseData = useCallback(async () => {
    const res = await fetch('/api/firestore/purge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-zenflow-request': '1' },
      credentials: 'same-origin',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || 'Database purge failed');
    await fetchState();
    await refreshFirestoreStatus();
    return data;
  }, [fetchState, refreshFirestoreStatus]);

  const authValue = useMemo<AuthContextValue>(
    () => ({
      currentUser,
      isAuthChecking,
      authError,
      setAuthError,
      loginWithGoogle,
      logout,
      isSuperadmin,
      isAdministrator,
      isBusinessLead,
      isCreativeDirector,
      isClusterLead,
      isTeamLead,
      isAccountManager,
      canManageMembers,
      canCreatePipelineTask,
      canAssignTask,
      canSwitchBoards,
      canManageUser,
      canEditUserTasks,
    }),
    [
      currentUser,
      isAuthChecking,
      authError,
      loginWithGoogle,
      logout,
      isSuperadmin,
      isAdministrator,
      isBusinessLead,
      isCreativeDirector,
      isClusterLead,
      isTeamLead,
      isAccountManager,
      canManageMembers,
      canCreatePipelineTask,
      canAssignTask,
      canSwitchBoards,
      canManageUser,
      canEditUserTasks,
    ]
  );

  const workspaceValue = useMemo<WorkspaceContextValue>(
    () => ({
      users,
      tasks,
      creativeDirectors,
      clusterLeads,
      syncStatus,
      isLoading,
      firestoreStatus,
      refreshFirestoreStatus,
      syncWithFirestore,
      purgeAllDatabaseData,
      createUser,
      updateUserProfile,
      remapUserTasks,
      deleteUser,
      fetchAuditLogs,
      downloadAuditLogs,
      createPipelineBundle,
      createTask,
      updateTask,
      adjustBillableHours,
      deleteTask,
      removeAssigneeOrDeleteTask,
      shareTaskWithUser,
      reassignTaskFromUser,
      moveTask,
      reorderTasks,
      duplicateTaskToBoard,
    }),
    [
      users,
      tasks,
      creativeDirectors,
      clusterLeads,
      syncStatus,
      isLoading,
      firestoreStatus,
      refreshFirestoreStatus,
      syncWithFirestore,
      purgeAllDatabaseData,
      createUser,
      updateUserProfile,
      remapUserTasks,
      deleteUser,
      fetchAuditLogs,
      downloadAuditLogs,
      createPipelineBundle,
      createTask,
      updateTask,
      adjustBillableHours,
      deleteTask,
      removeAssigneeOrDeleteTask,
      shareTaskWithUser,
      reassignTaskFromUser,
      moveTask,
      reorderTasks,
      duplicateTaskToBoard,
    ]
  );

  const clickupValue = useMemo<ClickUpContextValue>(
    () => ({
      isZensciencesUser,
      isClickupConnected,
      clickupMembers,
      loadClickupMembers,
      clickupSpaces,
      selectedClickupSpaceId,
      spaceFoldersAndListsMap,
      getFoldersAndListsForSpace,
      connectClickup,
      disconnectClickup,
      setSelectedClickupSpaceId,
      createClickupSpace,
      createClickupList,
      syncUserTasksWithClickUp,
      clickupCustomFieldOptions,
      clickupTaskTypeFieldId,
      isLoadingTaskTypes,
      fetchClickupCustomFields,
      clickupWebhookStatus,
      refreshClickupWebhookStatus,
      registerClickupWebhook,
    }),
    [
      isZensciencesUser,
      isClickupConnected,
      clickupMembers,
      loadClickupMembers,
      clickupSpaces,
      selectedClickupSpaceId,
      spaceFoldersAndListsMap,
      getFoldersAndListsForSpace,
      connectClickup,
      disconnectClickup,
      setSelectedClickupSpaceId,
      createClickupSpace,
      createClickupList,
      syncUserTasksWithClickUp,
      clickupCustomFieldOptions,
      clickupTaskTypeFieldId,
      isLoadingTaskTypes,
      fetchClickupCustomFields,
      clickupWebhookStatus,
      refreshClickupWebhookStatus,
      registerClickupWebhook,
    ]
  );

  const boardUiValue = useMemo<BoardUiContextValue>(
    () => ({
      activeRoleTab,
      setActiveRoleTab,
      activeBoardId,
      setActiveBoardId,
      darkMode,
      setDarkMode,
      activeDragInfo,
      setActiveDragInfo,
    }),
    [activeRoleTab, activeBoardId, darkMode, activeDragInfo]
  );

  return (
    <AuthContext.Provider value={authValue}>
      <WorkspaceContext.Provider value={workspaceValue}>
        <ClickUpContext.Provider value={clickupValue}>
          <BoardUiContext.Provider value={boardUiValue}>{children}</BoardUiContext.Provider>
        </ClickUpContext.Provider>
      </WorkspaceContext.Provider>
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within a DashboardProvider');
  return ctx;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within a DashboardProvider');
  return ctx;
}

export function useClickUp(): ClickUpContextValue {
  const ctx = useContext(ClickUpContext);
  if (!ctx) throw new Error('useClickUp must be used within a DashboardProvider');
  return ctx;
}

export function useBoardUi(): BoardUiContextValue {
  const ctx = useContext(BoardUiContext);
  if (!ctx) throw new Error('useBoardUi must be used within a DashboardProvider');
  return ctx;
}

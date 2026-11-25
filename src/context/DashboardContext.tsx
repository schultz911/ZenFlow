import { apiFetch as fetch, ensureApiSession, clearApiSession, getApiMemberId } from '../lib/api';
import { reconcileSnapshot } from '../lib/reconcile';
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
  QueuedMutation,
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
import { INITIAL_USERS, INITIAL_TASKS } from '../data/initialData';
import { compareTasksByDeadline, formatBillableHours, getTaskBillableMs, getTaskAssigneeIds } from '../utils/workload';
import { signInWithGoogle, signOutFirebase, onFirebaseAuthStateChanged } from '../lib/firebase';

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

const OFFLINE_QUEUE_KEY = 'zenflow_mutation_queue_v1';

function loadMutationQueue(): QueuedMutation[] {
  try {
    if (!getApiMemberId()) return [];
    const raw = localStorage.getItem(`${OFFLINE_QUEUE_KEY}:${getApiMemberId()}`);
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
    if (!getApiMemberId()) return;
    if (queue.length > 0) {
      localStorage.setItem(`${OFFLINE_QUEUE_KEY}:${getApiMemberId()}`, JSON.stringify(queue));
    } else {
      localStorage.removeItem(`${OFFLINE_QUEUE_KEY}:${getApiMemberId()}`);
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
  activeRoleTab: RoleFilter;
  setActiveRoleTab: (tab: RoleFilter) => void;
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
  purgeAllDatabaseData: () => Promise<{ success: boolean; message: string; deletedTaskCount?: number; deletedUserCount?: number }>;
  login: (name: string, role: Role, email: string) => Promise<User>;
  loginWithGoogle: () => Promise<User>;
  logout: () => void;
  switchUser: (user: User) => void;
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
  // Role & Permissions
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
  canManageUser: (targetUser: User) => boolean;
  canEditUserTasks: (targetUserId?: string) => boolean;
  canSwitchBoards: boolean;
  creativeDirectors: User[];
  clusterLeads: User[];
  activeBoardId: string;
  setActiveBoardId: (boardId: string) => void;
  // ClickUp Integration
  isZensciencesUser: boolean;
  clickupApiKey: string;
  isClickupConnected: boolean;
  clickupMembers: ClickupMember[];
  loadClickupMembers: (apiKey?: string) => Promise<ClickupMember[]>;
  clickupSpaces: ClickupSpace[];
  selectedClickupSpaceId: string;
  clickupFoldersAndLists: { folders: ClickupFolder[]; folderlessLists: ClickupList[] };
  spaceFoldersMap: Record<string, string[]>;
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
  fetchAuditLogs: (limit?: number) => Promise<AuditLogEntry[]>;
  downloadAuditLogs: () => void;
  // Tasks
  createPipelineBundle: (data: {
    title: string;
    description?: string;
    brandGuidelines?: string;
    dueDate?: string;
    client?: string;
    project?: string;
    priority?: 'low' | 'medium' | 'high';
    attachments?: string[];
    disciplines: Array<'content' | 'design'>;
    disciplineSpecs?: { content?: TaskDisciplineMetadata; design?: TaskDisciplineMetadata };
    clickupSpaceId?: string;
    clickupSpaceName?: string;
    clickupFolderId?: string;
    clickupFolderName?: string;
    clickupListId?: string;
    clickupListName?: string;
    clickupTaskType?: string;
    clickupTaskTypeId?: string;
    clickupTaskTypeFieldId?: string;
  }) => Promise<{ parentTaskId: string; parentTaskTitle: string; clickupParentTaskId?: string; tasks: Task[] }>;
  createTask: (data: {
    userId?: string;
    assigneeIds?: string[];
    team?: Role;
    title: string;
    description?: string;
    brandGuidelines?: string;
    dueDate?: string;
    startDate?: string;
    cognitiveLoad?: 'low' | 'medium' | 'high';
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
  rescheduleTask: (taskId: string, newDueDate?: string) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;
  removeAssigneeOrDeleteTask: (taskId: string, removeAssigneeId?: string) => Promise<void>;
  shareTaskWithUser: (taskId: string, targetUserId: string) => Promise<Task>;
  reassignTaskFromUser: (
    taskId: string,
    sourceUserId: string,
    targetUserId: string,
    newStatus?: TaskStatus,
    newDueDate?: string | null
  ) => Promise<Task>;
  deleteUser: (userId: string) => Promise<void>;
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
  reassignTask: (taskId: string, targetUserId: string) => Promise<void>;
  moveTaskStatus: (taskId: string, newStatus: TaskStatus, newIndex?: number, targetUserId?: string, newDueDate?: string | null) => Promise<void>;
  reorderTasks: (updates: Array<TaskOrderUpdate>) => Promise<void>;
  duplicateTaskToBoard: (params: {
    taskId: string;
    targetUserId: string;
    title?: string;
    targetStatus?: TaskStatus;
    targetDueDate?: string;
  }) => Promise<{ task: Task; warning?: string; message?: string }>;
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

  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Stable ref for currentUser — keeps adjustBillableHours and task helpers dep-free
  const currentUserRef = useRef<User | null>(currentUser);
  currentUserRef.current = currentUser;
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  const [activeRoleTab, setActiveRoleTab] = useState<RoleFilter>('all');

  // Roles & Permissions
  const SUPERADMIN_EMAIL = 'kiran.s@zensciences.com';
  const isSuperadmin = useMemo(() => {
    return currentUser?.email?.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase();
  }, [currentUser]);

  const isAdministrator = useMemo(() => {
    return Boolean(currentUser?.isAdministrator || currentUser?.role === 'administrator');
  }, [currentUser]);

  const isBusinessLead = useMemo(() => {
    return Boolean(currentUser?.isBusinessLead || currentUser?.designation === 'business_lead');
  }, [currentUser]);

  const isCreativeDirector = useMemo(() => {
    return Boolean(currentUser?.isCreativeDirector || isSuperadmin);
  }, [currentUser, isSuperadmin]);

  const isClusterLead = useMemo(() => {
    return Boolean(currentUser?.isClusterLead);
  }, [currentUser]);

  const isTeamLead = useMemo(() => {
    return Boolean(currentUser?.isTeamLead || currentUser?.designation === 'team_lead' || currentUser?.designation === 'Team Lead');
  }, [currentUser]);

  const isAccountManager = useMemo(() => {
    return Boolean(currentUser?.isAccountManager || currentUser?.designation === 'account_manager' || currentUser?.designation === 'Account Manager');
  }, [currentUser]);

  const creativeDirectors = useMemo(() => {
    return users.filter(u => u.isCreativeDirector || u.email.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase());
  }, [users]);

  const clusterLeads = useMemo(() => {
    return users.filter(u => u.isClusterLead || u.email.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase());
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
      const isPrivileged = Boolean(currentUser.isCreativeDirector || currentUser.isAdministrator || currentUser.isBusinessLead || currentUser.isClusterLead || currentUser.role === 'administrator' || isSuper);
      if (!isPrivileged) {
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
    // Administrator, Business Lead, Cluster Lead, Creative Director can add accounts
    return isSuperadmin || isAdministrator || isBusinessLead || isCreativeDirector || isClusterLead;
  }, [currentUser, isSuperadmin, isAdministrator, isBusinessLead, isCreativeDirector, isClusterLead]);

  const canCreatePipelineTask = useMemo(() => {
    if (!currentUser) return false;
    const isSuper = currentUser.email?.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase();
    const isAdmin = Boolean(currentUser.isAdministrator || currentUser.role === 'administrator' || isSuper);
    const isAccounts = Boolean(
      currentUser.role === 'account_manager' ||
      currentUser.isAccountManager ||
      currentUser.designation === 'account_manager' ||
      currentUser.designation === 'Account Manager'
    );
    const hasSpecialRole = Boolean(
      currentUser.isBusinessLead ||
      currentUser.designation === 'business_lead' ||
      currentUser.designation === 'Business Lead' ||
      currentUser.isCreativeDirector ||
      currentUser.designation === 'creative_director' ||
      currentUser.designation === 'Creative Director' ||
      currentUser.isClusterLead ||
      currentUser.designation === 'cluster_lead' ||
      currentUser.designation === 'Cluster Lead' ||
      currentUser.isTeamLead ||
      currentUser.designation === 'team_lead' ||
      currentUser.designation === 'Team Lead'
    );
    return isAdmin || isAccounts || hasSpecialRole;
  }, [currentUser]);

  const canAssignTask = useMemo(() => {
    if (!currentUser) return false;
    const isSuper = currentUser.email?.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase();
    return Boolean(
      isSuper ||
      currentUser.isCreativeDirector ||
      currentUser.designation === 'creative_director' ||
      currentUser.designation === 'Creative Director' ||
      currentUser.isAdministrator ||
      currentUser.role === 'administrator' ||
      currentUser.isBusinessLead ||
      currentUser.isClusterLead
    );
  }, [currentUser]);

  const canManageUser = useCallback((targetUser: User): boolean => {
    if (!currentUser) return false;
    // Administrator, Business Lead can add and delete accounts and edit user information
    if (isSuperadmin || isAdministrator || isBusinessLead) return true;
    // Cluster Lead, Creative Director can add and delete accounts to their teams only and edit team member information
    if (isCreativeDirector) {
      return targetUser.creativeDirectorId === currentUser.id;
    }
    if (isClusterLead) {
      return targetUser.clusterLeadId === currentUser.id || targetUser.creativeDirectorId === currentUser.id;
    }
    return false;
  }, [currentUser, isSuperadmin, isAdministrator, isBusinessLead, isCreativeDirector, isClusterLead]);

  const canSwitchBoards = useMemo(() => {
    if (!currentUser) return false;
    // Administrator, Business Lead, Cluster Lead, Creative Director can access all boards
    return isSuperadmin || isAdministrator || isBusinessLead || isCreativeDirector || isClusterLead;
  }, [currentUser, isSuperadmin, isAdministrator, isBusinessLead, isCreativeDirector, isClusterLead]);

  const canEditUserTasks = useCallback((targetUserId?: string): boolean => {
    if (!currentUser) return false;
    // Administrator and Business Lead - can access all boards, edit all boards
    if (isSuperadmin || isAdministrator || isBusinessLead) return true;
    // Account Manager - cannot edit boards
    if (currentUser.isAccountManager || currentUser.designation === 'account_manager' || currentUser.role === 'account_manager') {
      return false;
    }
    // Cluster Lead and Creative Director - can access all boards, edit boards of their teams, and assign/edit pipeline tasks across teams
    if (isCreativeDirector || isClusterLead) {
      return true;
    }
    // Team Lead - can access team board, edit boards of their team
    if (currentUser.isTeamLead || currentUser.isContentLead || currentUser.isArtDirector) {
      if (!targetUserId || targetUserId === currentUser.id) return true;
      const target = usersRef.current.find(u => u.id === targetUserId);
      return Boolean(
        (currentUser.creativeDirectorId && target?.creativeDirectorId === currentUser.creativeDirectorId) ||
        (currentUser.clusterLeadId && target?.clusterLeadId === currentUser.clusterLeadId) ||
        (currentUser.role && target?.role === currentUser.role)
      );
    }
    // All other users - can access their team board, can edit their own boards
    return targetUserId === currentUser.id;
  }, [currentUser, isSuperadmin, isAdministrator, isBusinessLead, isCreativeDirector, isClusterLead]);

  // ClickUp Integration State
  const isZensciencesUser = useMemo(() => {
    return Boolean(currentUser?.email?.toLowerCase().endsWith('@zensciences.com'));
  }, [currentUser]);

  const clickupApiKey = useMemo(() => '', []);

  const isClickupConnected = useMemo(() => {
    return Boolean(isZensciencesUser && currentUser?.clickupConnected);
  }, [isZensciencesUser, currentUser?.clickupConnected]);

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

  const loadClickupFoldersAndLists = useCallback(async (spaceId: string, apiKey: string = '') => {
    if (!spaceId) return;
    try {
      const res = await fetch(`/api/clickup/folders-and-lists?spaceId=${encodeURIComponent(spaceId)}`, {
        headers: apiKey ? { 'x-clickup-api-key': apiKey } : {},
      });
      if (res.ok) {
        const data = await res.json();
        const result = { folders: data.folders || [], folderlessLists: data.folderlessLists || [] };
        setClickupFoldersAndLists(result);
        setSpaceFoldersAndListsMap(prev => ({ ...prev, [spaceId]: result }));
        setSpaceFoldersMap(prev => ({ ...prev, [spaceId]: (data.folders || []).map((f: ClickupFolder) => f.name) }));
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
    if (spaceFoldersAndListsMapRef.current[spaceId]) {
      return spaceFoldersAndListsMapRef.current[spaceId];
    }
    try {
      const res = await fetch(`/api/clickup/folders-and-lists?spaceId=${encodeURIComponent(spaceId)}`);
      if (res.ok) {
        const data = await res.json();
        const result = { folders: data.folders || [], folderlessLists: data.folderlessLists || [] };
        setSpaceFoldersAndListsMap(prev => ({ ...prev, [spaceId]: result }));
        setSpaceFoldersMap(prev => ({ ...prev, [spaceId]: (data.folders || []).map((f: ClickupFolder) => f.name) }));
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

          setUsers(reconcileSnapshot({ users: dedupedUsers, tasks: [] }, loadMutationQueue(), tasksRef.current).users);

          // If currentUser exists, sync it to the primary deduplicated user
          setCurrentUser(prev => {
            if (!prev) return null;
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
          setTasks(reconcileSnapshot({ users: [], tasks: Array.from(taskMap.values()) }, loadMutationQueue(), tasksRef.current).tasks);
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
    if (!getApiMemberId() || isReplayingRef.current) return;
    const queue = loadMutationQueue();
    if (queue.length === 0) return;

    isReplayingRef.current = true;
    const remainingQueue: QueuedMutation[] = [];
    const replayOwner = getApiMemberId();

    for (let i = 0; i < queue.length; i++) {
      if (getApiMemberId() !== replayOwner) break;
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
        if (res.status === 401 || res.status === 403) {
          remainingQueue.push(...queue.slice(i));
          break;
        }
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

    if (getApiMemberId() === replayOwner) {
      const replayIds = new Set(queue.map(item => item.id));
      const appended = loadMutationQueue().filter(item => !replayIds.has(item.id));
      saveMutationQueue([...remainingQueue, ...appended]);
    }
    isReplayingRef.current = false;

    if (remainingQueue.length === 0 && getApiMemberId() === replayOwner) {
      await fetchState();
      await refreshFirestoreStatus();
      setSyncStatus('connected');
    }
  }, [fetchState, refreshFirestoreStatus]);

  useEffect(() => {
    if (!currentUser) return;
    fetchState();
    refreshFirestoreStatus();

  }, [currentUser?.id, fetchState, refreshFirestoreStatus]);

  // Online / Offline network status listener with auto queue replay
  useEffect(() => {
    const handleOnline = () => {
      setSyncStatus('connecting');
      if (getApiMemberId()) replayQueue();
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
    if (!currentUser) return;
    let eventSource: EventSource | null = null;
    let reconnectTimeout: any = null;
    let isMounted = true;

    async function connectSSE() {
      if (!isMounted) return;
      try {
        await ensureApiSession();
        if (!isMounted) return;
        eventSource = new EventSource('/api/events');

        eventSource.onopen = () => {
          if (isMounted) {
            setSyncStatus('connected');
          }
        };

        eventSource.addEventListener('init', () => {
          if (isMounted) setSyncStatus('connected');
        });

        eventSource.addEventListener('snapshot', (e: MessageEvent) => {
          if (!isMounted) return;
          try {
            const snapshot = reconcileSnapshot(JSON.parse(e.data), loadMutationQueue(), tasksRef.current);
            setUsers(snapshot.users);
            setTasks(snapshot.tasks);
            setCurrentUser(previous => previous ? snapshot.users.find(user => user.id === previous.id) || previous : null);
            replayQueue();
          } catch { setSyncStatus('offline'); }
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
              setTasks(prev =>
                prev
                  .map(t => {
                    const assignees = getTaskAssigneeIds(t);
                    if (!assignees.includes(deletedUserId)) return t;
                    const remaining = assignees.filter(id => id !== deletedUserId);
                    if (remaining.length === 0) return null;
                    return { ...t, assigneeIds: remaining, userId: remaining[0] };
                  })
                  .filter((t): t is Task => Boolean(t))
              );
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
  }, [replayQueue, currentUser?.id]);

  // Google Auth Session Enforcement
  // If not logged in via Google Auth, log them out and bring them to login screen
  useEffect(() => {
    let isMounted = true;
    let unsubPromise: Promise<() => void> | null = null;
    let authRevision = 0;

    unsubPromise = onFirebaseAuthStateChanged(async (fbUser) => {
      const revision = ++authRevision;
      if (!isMounted) return;

      if (!fbUser) {
        clearApiSession().catch(() => {});
        setUsers([]);
        setTasks([]);
        setIsLoading(false);
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

      // Registration and identity are verified server-side before any workspace load.
      let matched: User | undefined;
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

      if (!isMounted || revision !== authRevision) return;
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
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-caller-user-id': currentUserRef.current?.id || '',
          'x-caller-email': currentUserRef.current?.email || '',
          'x-is-superadmin': isSuperadmin ? 'true' : 'false',
        },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        const updatedUser: User = data.user || data;
        if (data.merged && data.deletedUserId) {
          setUsers(prev => prev.filter(u => u.id !== data.deletedUserId).map(u => (u.id === updatedUser.id ? updatedUser : u)));
          setTasks(prev => prev.map(t => (t.userId === data.deletedUserId ? { ...t, userId: updatedUser.id } : t)));
          if (currentUserRef.current?.id === data.deletedUserId) {
            setCurrentUser(updatedUser);
          }
        } else {
          setUsers(prev => prev.map(u => (u.id === userId ? updatedUser : u)));
          if (currentUserRef.current?.id === userId) {
            setCurrentUser(updatedUser);
          }
        }
        return updatedUser;
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to update user profile');
      }
    } catch (err) {
      console.warn('Update user profile offline/failed:', err);
      throw err;
    }
  }, [isSuperadmin]);

  const remapUserTasks = useCallback(async (
    fromUserIdOrEmail: string,
    toUserId: string,
    deleteSourceUser: boolean = false
  ): Promise<{ success: boolean; remappedCount: number; error?: string }> => {
    try {
      const isEmail = fromUserIdOrEmail.includes('@');
      const payload = {
        fromUserId: isEmail ? undefined : fromUserIdOrEmail,
        fromEmail: isEmail ? fromUserIdOrEmail : undefined,
        toUserId,
        deleteSourceUser,
      };

      const res = await fetch('/api/users/remap-tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-caller-user-id': currentUserRef.current?.id || '',
          'x-caller-email': currentUserRef.current?.email || '',
          'x-is-superadmin': isSuperadmin ? 'true' : 'false',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, remappedCount: 0, error: data.error || 'Failed to remap tasks' };
      }

      // Optimistically update local tasks
      const effectiveFromUser = usersRef.current.find(
        u => (!isEmail && u.id === fromUserIdOrEmail) || (isEmail && u.email.toLowerCase() === fromUserIdOrEmail.toLowerCase())
      );
      const effectiveFromId = effectiveFromUser ? effectiveFromUser.id : fromUserIdOrEmail;

      setTasks(prev => prev.map(t => {
        const matches = (effectiveFromId && t.userId === effectiveFromId) ||
          (isEmail && t.userId.toLowerCase() === fromUserIdOrEmail.toLowerCase());
        return matches ? { ...t, userId: toUserId } : t;
      }));

      if (deleteSourceUser && data.deletedSourceUserId) {
        setUsers(prev => prev.filter(u => u.id !== data.deletedSourceUserId));
      }

      return { success: true, remappedCount: data.remappedCount || 0 };
    } catch (err: any) {
      return { success: false, remappedCount: 0, error: err.message || 'Network error remapping tasks' };
    }
  }, [isSuperadmin]);

  // SOC2 Compliance Audit Stream Queries & Export
  const fetchAuditLogs = useCallback(async (limit: number = 50): Promise<AuditLogEntry[]> => {
    const res = await fetch(`/api/audit/logs?limit=${limit}`);
    if (!res.ok) throw new Error('Audit history could not be loaded');
    return (await res.json()).logs || [];
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
        setActiveRoleTab(user.role === 'content' || user.role === 'design' ? user.role : 'all');
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

    const response = await fetch('/api/auth/verify-email', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: cleanEmail }),
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
    try {
      localStorage.removeItem(USER_SESSION_KEY);
    } catch {}
    signOutFirebase().catch(() => {});
  }, []);

  const switchUser = useCallback((user: User) => {
    setCurrentUser(user);
    setActiveRoleTab(user.role === 'content' || user.role === 'design' ? user.role : 'all');
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
      if (currentUserRef.current) {
        await updateUserProfile(currentUserRef.current.id, { clickupApiKey: cleanKey });
      }
      await loadClickupSpaces('');
      await loadClickupMembers('');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Connection failed' };
    }
  }, [updateUserProfile, loadClickupSpaces, loadClickupMembers]);

  const disconnectClickup = useCallback(() => {
    localStorage.removeItem('zenflow_clickup_api_key');
    if (currentUserRef.current) {
      updateUserProfile(currentUserRef.current.id, { clickupApiKey: '' });
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
    if (isClickupConnected) {
      await loadClickupFoldersAndLists(spaceId, '');
    }
  }, [isClickupConnected, updateUserProfile, loadClickupFoldersAndLists]);

  const createClickupSpace = useCallback(async (name: string): Promise<ClickupSpace | null> => {
    if (!name.trim()) return null;
    try {
      const res = await fetch('/api/clickup/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        const created: ClickupSpace = data.space;
        await loadClickupSpaces('');
        return created;
      }
    } catch (err) {
      console.warn('Failed to create ClickUp space:', err);
    }
    return null;
  }, [loadClickupSpaces]);

  const createClickupList = useCallback(async (
    name: string,
    spaceId: string,
    folderId?: string
  ): Promise<ClickupList | null> => {
    if (!name.trim() || (!spaceId && !folderId)) return null;
    try {
      const res = await fetch('/api/clickup/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spaceId, folderId, name: name.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        const createdList: ClickupList = data.list;
        setSpaceFoldersAndListsMap(prev => {
          const next = { ...prev };
          delete next[spaceId];
          return next;
        });
        await loadClickupFoldersAndLists(spaceId, '');
        return createdList;
      }
    } catch (err) {
      console.warn('Failed to create ClickUp list:', err);
    }
    return null;
  }, [loadClickupFoldersAndLists]);

  const syncUserTasksWithClickUp = useCallback(async (userId: string) => {
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
  }, [fetchState]);

  const fetchClickupCustomFields = useCallback(async (params: { listId?: string; spaceId?: string; folderId?: string }): Promise<ClickupCustomFieldOption[]> => {
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
  }, []);

  const registerClickupWebhook = useCallback(async (customEndpoint?: string): Promise<{ success: boolean; message: string; webhookId?: string }> => {
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
  }, [refreshClickupWebhookStatus]);

  const createUser = useCallback(async (data: {
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

  // Create parent task + Content and/or Design subtasks in pipeline
  const createPipelineBundle = useCallback(async (data: {
    title: string;
    description?: string;
    brandGuidelines?: string;
    dueDate?: string;
    client?: string;
    project?: string;
    priority?: 'low' | 'medium' | 'high';
    attachments?: string[];
    disciplines: Array<'content' | 'design'>;
    disciplineSpecs?: { content?: TaskDisciplineMetadata; design?: TaskDisciplineMetadata };
    clickupSpaceId?: string;
    clickupSpaceName?: string;
    clickupFolderId?: string;
    clickupFolderName?: string;
    clickupListId?: string;
    clickupListName?: string;
    clickupTaskType?: string;
    clickupTaskTypeId?: string;
    clickupTaskTypeFieldId?: string;
  }): Promise<{ parentTaskId: string; parentTaskTitle: string; clickupParentTaskId?: string; tasks: Task[] }> => {
    const res = await fetch('/api/tasks/pipeline-bundle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const resData = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(resData.error || 'Failed to create pipeline task(s)');
    }
    const createdTasks: Task[] = Array.isArray(resData.tasks) ? resData.tasks : [];
    setTasks(prev => {
      const map = new Map(prev.map(t => [t.id, t]));
      for (const t of createdTasks) map.set(t.id, t);
      return Array.from(map.values());
    });
    return resData;
  }, []);

  // Task creation with offline mutation queuing
  const createTask = useCallback(async (data: {
    userId?: string;
    assigneeIds?: string[];
    team?: Role;
    title: string;
    description?: string;
    brandGuidelines?: string;
    dueDate?: string;
    startDate?: string;
    cognitiveLoad?: 'low' | 'medium' | 'high';
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
  }): Promise<Task> => {
    const realId = `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const currentTasks = tasksRef.current;
    const status = data.status || (data.userId ? 'todo' : 'pipeline');
    const cognitiveLoad = data.cognitiveLoad || 'medium';
    const cleanUserId = (data.userId && data.userId.trim()) ? data.userId.trim() : undefined;
    const cleanAssigneeIds = Array.isArray(data.assigneeIds) && data.assigneeIds.length > 0
      ? data.assigneeIds
      : (cleanUserId ? [cleanUserId] : []);
    const ownerRole = cleanUserId ? usersRef.current.find(u => u.id === cleanUserId)?.role : undefined;
    const team: Role = data.team === 'design' || data.team === 'content'
      ? data.team
      : (ownerRole === 'design' || ownerRole === 'content' ? ownerRole : 'content');
    const isCompleted = status === 'done';
    const now = new Date().toISOString();

    const initialActivity = {
      id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: now,
      action: 'created' as const,
      to: status,
      details: cleanUserId ? `Created in ${status.replace('_', ' ')}` : `Created in ${team} team pipeline (Unassigned)`,
    };

    const isInProgress = status === 'in_progress';

    const optimisticTask: Task = {
      id: realId,
      userId: cleanUserId,
      assigneeIds: cleanAssigneeIds,
      team,
      title: data.title.trim(),
      description: data.description ? data.description.trim() : undefined,
      brandGuidelines: data.brandGuidelines ? data.brandGuidelines.trim() : undefined,
      dueDate: (status === 'pipeline' || status === 'retainer') ? undefined : data.dueDate,
      startDate: status !== 'pipeline' ? (data.startDate || now.slice(0, 10)) : undefined,
      cognitiveLoad,
      status,
      order: currentTasks.filter(t => (cleanUserId ? getTaskAssigneeIds(t).includes(cleanUserId) : t.team === team) && t.status === status).length,
      completedAt: isCompleted ? now : undefined,
      inProgressStartedAt: isInProgress ? now : undefined,
      inProgressDurationMs: 0,
      client: data.client,
      project: data.project,
      estimatedHours: data.estimatedHours,
      priority: data.priority || 'medium',
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

    try {
      if (!navigator.onLine) throw new Error('Offline');
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
    const prevTarget = tasksRef.current.find(t => t.id === id);
    const linkToPropagate = updates.contentDocLink || prevTarget?.contentDocLink;
    const isContentDoneUpdate = Boolean(
      prevTarget &&
      (updates.team || prevTarget.team) === 'content' &&
      linkToPropagate &&
      (updates.status === 'done' || (updates.contentDocLink && updates.contentDocLink !== prevTarget.contentDocLink))
    );
    const parentBriefChanged = Boolean(prevTarget && updates.description !== undefined && updates.description !== prevTarget.description);
    const parentBrandChanged = Boolean(prevTarget && updates.brandGuidelines !== undefined && updates.brandGuidelines !== prevTarget.brandGuidelines);
    const shouldSyncParentFields = Boolean(prevTarget && (prevTarget.parentTaskId || prevTarget.clickupParentTaskId) && (parentBriefChanged || parentBrandChanged));

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
          const finalDueDate = (updates.status === 'pipeline' || updates.status === 'retainer')
            ? undefined
            : updates.dueDate !== undefined
            ? (updates.dueDate || undefined)
            : t.dueDate;

          const nextAssigneeIds = Array.isArray(updates.assigneeIds)
            ? Array.from(new Set(updates.assigneeIds.filter(Boolean)))
            : updates.userId !== undefined
            ? (updates.userId ? [updates.userId] : [])
            : getTaskAssigneeIds(t);

          const nextStartDate = updates.status === 'pipeline'
            ? undefined
            : updates.startDate !== undefined
            ? updates.startDate
            : (t.startDate || (t.status === 'pipeline' && updates.status ? new Date().toISOString().slice(0, 10) : undefined));

          updatedTask = {
            ...t,
            ...updates,
            assigneeIds: nextAssigneeIds,
            userId: nextAssigneeIds[0] || undefined,
            startDate: nextStartDate,
            dueDate: finalDueDate,
            completedAt,
            inProgressStartedAt,
            inProgressDurationMs,
            updatedAt: new Date().toISOString(),
          };
          map.set(t.id, updatedTask);
        } else if (
          prevTarget &&
          ((prevTarget.parentTaskId && t.parentTaskId === prevTarget.parentTaskId) ||
            (prevTarget.clickupParentTaskId && t.clickupParentTaskId === prevTarget.clickupParentTaskId))
        ) {
          let nextSibling = t;
          let siblingModified = false;
          if (isContentDoneUpdate && t.team === 'design' && linkToPropagate) {
            nextSibling = { ...nextSibling, contentDocLink: linkToPropagate };
            siblingModified = true;
          }
          if (shouldSyncParentFields) {
            nextSibling = {
              ...nextSibling,
              ...(parentBriefChanged ? { description: updates.description || undefined } : {}),
              ...(parentBrandChanged ? { brandGuidelines: updates.brandGuidelines || undefined } : {}),
            };
            siblingModified = true;
          }
          map.set(t.id, siblingModified ? { ...nextSibling, updatedAt: new Date().toISOString() } : t);
        } else {
          map.set(t.id, t);
        }
      }
      return Array.from(map.values());
    });

    const callerId = currentUserRef.current?.id || '';

    try {
      if (!navigator.onLine) throw new Error('Offline');
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
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

    try {
      if (!navigator.onLine) throw new Error('Offline');
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
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

  // Remove a single assignee from a shared task, or delete the task when sole assignee
  const removeAssigneeOrDeleteTask = useCallback(async (id: string, removeAssigneeId?: string): Promise<void> => {
    const task = tasksRef.current.find(t => t.id === id);
    const assignees = task ? getTaskAssigneeIds(task) : [];
    if (removeAssigneeId && assignees.includes(removeAssigneeId) && assignees.length > 1) {
      const remaining = assignees.filter(uid => uid !== removeAssigneeId);
      setTasks(prev => prev.map(t => t.id === id ? { ...t, assigneeIds: remaining, userId: remaining[0] } : t));
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
  }, [deleteTask]);

  const shareTaskWithUser = useCallback(async (taskId: string, targetUserId: string): Promise<Task> => {
    const task = tasksRef.current.find(t => t.id === taskId);
    if (!task) throw new Error('Task not found');
    const nextAssigneeIds = Array.from(new Set([...getTaskAssigneeIds(task), targetUserId]));
    return updateTask(taskId, {
      assigneeIds: nextAssigneeIds,
      userId: nextAssigneeIds[0],
    });
  }, [updateTask]);

  const reassignTaskFromUser = useCallback(async (
    taskId: string,
    sourceUserId: string,
    targetUserId: string,
    newStatus?: TaskStatus,
    newDueDate?: string | null
  ): Promise<Task> => {
    const task = tasksRef.current.find(t => t.id === taskId);
    if (!task) throw new Error('Task not found');
    const currentIds = getTaskAssigneeIds(task);
    const replaced = currentIds.filter(id => id !== sourceUserId);
    if (!replaced.includes(targetUserId)) replaced.push(targetUserId);
    const updates: Partial<Task> = {
      assigneeIds: replaced,
      userId: replaced[0],
    };
    if (newStatus) updates.status = newStatus;
    if (newDueDate !== undefined) updates.dueDate = newDueDate || undefined;
    return updateTask(taskId, updates);
  }, [updateTask]);

  // User delete with offline mutation queuing
  const deleteUser = useCallback(async (userId: string): Promise<void> => {
    setUsers(prev => prev.filter(u => u.id !== userId));
    setTasks(prev =>
      prev
        .map(t => {
          const assignees = getTaskAssigneeIds(t);
          if (!assignees.includes(userId)) return t;
          const remaining = assignees.filter(id => id !== userId);
          if (remaining.length === 0) return null;
          return { ...t, assigneeIds: remaining, userId: remaining[0] };
        })
        .filter((t): t is Task => Boolean(t))
    );
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
    newDueDate?: string | null,
    extraUpdates?: {
      startDate?: string;
      estimatedHours?: number;
      cognitiveLoad?: CognitiveLoad;
      contentDocLink?: string;
      sourceUserId?: string;
    }
  ): Promise<void> => {
    const currentTasks = tasksRef.current;
    const task = currentTasks.find(t => t.id === taskId);
    if (!task) return;

    const existingAssignees = getTaskAssigneeIds(task);
    const isSameUser = existingAssignees.includes(targetUserId);
    const isSameStatus = task.status === newStatus;
    const isDueDateUnchanged = newDueDate === undefined && ((newStatus !== 'pipeline' && newStatus !== 'retainer') || !task.dueDate);
    const hasExtraUpdates = Boolean(extraUpdates && Object.keys(extraUpdates).length > 0);

    if (isSameUser && isSameStatus && newIndex === undefined && isDueDateUnchanged && !hasExtraUpdates) return;

    // Automatic pipeline & retainer deadline removal: pipeline & retainer tasks strictly possess no deadline
    const resolvedDueDate =
      (newStatus === 'pipeline' || newStatus === 'retainer')
        ? undefined
        : newDueDate !== undefined
        ? (newDueDate || undefined)
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

    // Get current tasks in target column excluding the moving task
    const targetUserTasksInStatus = currentTasks
      .filter(t => getTaskAssigneeIds(t).includes(targetUserId) && t.status === newStatus && t.id !== taskId)
      .sort((a, b) => compareTasksByDeadline(a, b, newStatus));

    const targetOrder =
      newIndex !== undefined
        ? Math.max(0, Math.min(newIndex, targetUserTasksInStatus.length))
        : targetUserTasksInStatus.length;

    const now = new Date().toISOString();
    const resolvedStartDate = newStatus === 'pipeline'
      ? undefined
      : extraUpdates?.startDate !== undefined
      ? extraUpdates.startDate
      : (task.startDate || (task.status === 'pipeline' ? now.slice(0, 10) : undefined));
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
      userId: primaryUserId,
      assigneeIds: nextAssigneeIds,
      status: newStatus,
      dueDate: resolvedDueDate,
      startDate: resolvedStartDate,
      estimatedHours: extraUpdates?.estimatedHours !== undefined ? extraUpdates.estimatedHours : task.estimatedHours,
      cognitiveLoad: extraUpdates?.cognitiveLoad !== undefined ? extraUpdates.cognitiveLoad : task.cognitiveLoad,
      contentDocLink: extraUpdates?.contentDocLink !== undefined ? extraUpdates.contentDocLink : task.contentDocLink,
      order: targetOrder,
      completedAt,
      inProgressStartedAt,
      inProgressDurationMs,
      updatedAt: now,
    };
    reorderedTargetTasks.splice(targetOrder, 0, movedTaskUpdated);

    const batchUpdates: Array<TaskOrderUpdate> = reorderedTargetTasks.map((t, idx) => ({
      id: t.id,
      userId: t.id === taskId ? primaryUserId : t.userId,
      assigneeIds: t.id === taskId ? nextAssigneeIds : undefined,
      status: newStatus,
      order: idx,
      dueDate: t.id === taskId ? (resolvedDueDate || null) : t.dueDate,
      ...(t.id === taskId && resolvedStartDate !== undefined ? { startDate: resolvedStartDate } : {}),
      ...(t.id === taskId && extraUpdates?.estimatedHours !== undefined ? { estimatedHours: extraUpdates.estimatedHours } : {}),
      ...(t.id === taskId && extraUpdates?.cognitiveLoad !== undefined ? { cognitiveLoad: extraUpdates.cognitiveLoad } : {}),
      ...(t.id === taskId && extraUpdates?.contentDocLink !== undefined ? { contentDocLink: extraUpdates.contentDocLink } : {}),
    }));

    const linkToPropagate = extraUpdates?.contentDocLink || task.contentDocLink;
    const shouldPropagateLink = Boolean(
      task.team === 'content' && newStatus === 'done' && linkToPropagate
    );

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
            assigneeIds: isMoved ? nextAssigneeIds : t.assigneeIds,
            status: u.status,
            order: u.order,
            dueDate: isMoved ? resolvedDueDate : t.dueDate,
            startDate: isMoved ? resolvedStartDate : t.startDate,
            estimatedHours: isMoved && extraUpdates?.estimatedHours !== undefined ? extraUpdates.estimatedHours : t.estimatedHours,
            cognitiveLoad: isMoved && extraUpdates?.cognitiveLoad !== undefined ? extraUpdates.cognitiveLoad : t.cognitiveLoad,
            contentDocLink: isMoved && extraUpdates?.contentDocLink !== undefined ? extraUpdates.contentDocLink : t.contentDocLink,
            completedAt: isMoved ? completedAt : t.completedAt,
            inProgressStartedAt: isMoved ? inProgressStartedAt : t.inProgressStartedAt,
            inProgressDurationMs: isMoved ? inProgressDurationMs : t.inProgressDurationMs,
            updatedAt: now,
          };
        }
        if (
          shouldPropagateLink &&
          t.team === 'design' &&
          ((task.parentTaskId && t.parentTaskId === task.parentTaskId) ||
            (task.clickupParentTaskId && t.clickupParentTaskId === task.clickupParentTaskId))
        ) {
          return { ...t, contentDocLink: linkToPropagate, updatedAt: now };
        }
        return t;
      });
    });

    const callerId = currentUserRef.current?.id || '';

    try {
      if (!navigator.onLine) throw new Error('Offline');
      const res = await fetch('/api/tasks/reorder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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

  // Duplicate task as subtask to another board (Creative Directors and Superadmins)
  const duplicateTaskToBoard = useCallback(async (params: {
    taskId: string;
    targetUserId: string;
    title?: string;
    targetStatus?: TaskStatus;
    targetDueDate?: string;
  }): Promise<{ task: Task;  warning?: string; message?: string }> => {
    const { taskId, targetUserId, title, targetStatus, targetDueDate } = params;
    const sourceTask = tasksRef.current.find(t => t.id === taskId);
    if (!sourceTask) {
      throw new Error('Source task not found');
    }

    const callerId = currentUserRef.current?.id || '';

    const isSuper = Boolean(isSuperadmin || currentUserRef.current?.email?.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase());

    const res = await fetch(`/api/tasks/${taskId}/duplicate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(callerId ? { 'x-caller-user-id': callerId } : {}),
        ...(isSuper ? { 'isSuperadmin': 'true', 'x-is-superadmin': 'true' } : {}),
      },
      body: JSON.stringify({
        targetUserId,
        title,
        targetStatus,
        targetDueDate,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to duplicate task as subtask to board');
    }

    const newTask: Task = data.task;
    setTasks(prev => {
      if (prev.some(t => t.id === newTask.id)) {
        return prev.map(t => (t.id === newTask.id ? newTask : t));
      }
      return [...prev, newTask];
    });

    return {
      task: newTask,

      warning: data.warning,
      message: data.message,
    };
  }, [isSuperadmin]);

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

    try {
      if (!navigator.onLine) throw new Error('Offline');
      const res = await fetch('/api/tasks/reorder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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

  // Nuclear purge of all database data (tasks + non-root users) exclusive to Superadmin
  const purgeAllDatabaseData = useCallback(async (): Promise<{ success: boolean; message: string; deletedTaskCount?: number; deletedUserCount?: number }> => {
    try {
      const email = currentUserRef.current?.email || '';
      const callerId = currentUserRef.current?.id || '';
      const res = await fetch('/api/firestore/purge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-zenflow-request': '1',
          'x-caller-email': email,
          'x-caller-user-id': callerId,
          'x-is-superadmin': isSuperadmin ? 'true' : 'false',
        },
        credentials: 'same-origin',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || 'Database purge failed');
      }
      await fetchState();
      await refreshFirestoreStatus();
      return data;
    } catch (err: any) {
      throw err;
    }
  }, [fetchState, refreshFirestoreStatus, isSuperadmin]);

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
      purgeAllDatabaseData,
      login,
      loginWithGoogle,
      logout,
      switchUser,
      createUser,
      updateUserProfile,
      remapUserTasks,
      // Role & Permissions
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
      canManageUser,
      canEditUserTasks,
      canSwitchBoards,
      creativeDirectors,
      clusterLeads,
      activeBoardId,
      setActiveBoardId,
      isZensciencesUser,
      clickupApiKey,
      isClickupConnected,
      clickupMembers,
      loadClickupMembers,
      clickupSpaces,
      selectedClickupSpaceId,
      clickupFoldersAndLists,
      spaceFoldersMap,
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
      fetchAuditLogs,
      downloadAuditLogs,
      // Tasks
      createPipelineBundle,
      createTask,
      updateTask,
      adjustBillableHours,
      rescheduleTask,
      deleteTask,
      removeAssigneeOrDeleteTask,
      shareTaskWithUser,
      reassignTaskFromUser,
      deleteUser,
      moveTask,
      reassignTask,
      moveTaskStatus,
      reorderTasks,
      duplicateTaskToBoard,
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
      purgeAllDatabaseData,
      login,
      loginWithGoogle,
      logout,
      switchUser,
      createUser,
      updateUserProfile,
      remapUserTasks,
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
      canManageUser,
      canEditUserTasks,
      canSwitchBoards,
      creativeDirectors,
      clusterLeads,
      activeBoardId,
      setActiveBoardId,
      isZensciencesUser,
      clickupApiKey,
      isClickupConnected,
      clickupMembers,
      loadClickupMembers,
      clickupSpaces,
      selectedClickupSpaceId,
      clickupFoldersAndLists,
      spaceFoldersMap,
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
      fetchAuditLogs,
      downloadAuditLogs,
      createPipelineBundle,
      createTask,
      updateTask,
      adjustBillableHours,
      rescheduleTask,
      deleteTask,
      removeAssigneeOrDeleteTask,
      shareTaskWithUser,
      reassignTaskFromUser,
      deleteUser,
      moveTask,
      reassignTask,
      moveTaskStatus,
      reorderTasks,
      duplicateTaskToBoard,
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

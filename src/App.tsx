import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { DashboardProvider, useAuth, useBoardUi, useWorkspace } from './context/DashboardContext';
import { Header } from './components/Header';
import { OverviewBar } from './components/OverviewBar';
import { FreePoolContainer } from './components/FreePoolContainer';
import { Swimlane } from './components/Swimlane';
import { SignInModal } from './components/SignInModal';
import { AddMemberModal } from './components/AddMemberModal';
import { TaskModal } from './components/TaskModal';
import { WorkloadModal } from './components/WorkloadModal';
import { FirestoreModal } from './components/FirestoreModal';
import { DeleteUserModal } from './components/DeleteUserModal';
import { BillableHoursModal } from './components/BillableHoursModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MarqueeRibbon } from './components/MarqueeRibbon';
import { EditUserModal } from './components/EditUserModal';
import { DuplicateTaskModal } from './components/DuplicateTaskModal';
import { DeleteTaskModal } from './components/DeleteTaskModal';
import { AnalyticsModal } from './components/AnalyticsModal';
import { TeamPipeline } from './components/TeamPipeline';
import { DisciplineTaskModal } from './components/modals/DisciplineTaskModal';
import { TaskAssignmentModal } from './components/TaskAssignmentModal';
import { ContentLinkPromptModal } from './components/ContentLinkPromptModal';
import { DeadlineDemandModal } from './components/DeadlineDemandModal';
import { WipLimitModal } from './components/WipLimitModal';
import { OnboardingChecklist } from './components/OnboardingChecklist';
import { User, Task, TaskStatus } from './types';
import { getTaskAssigneeIds, groupTasksByAssignee, formatTaskStatus, formatDateOnly, quickWorkloadScore, getDaysRemaining } from './utils/workload';
import { UserPlus, FileText, Palette, Search, Trash2, AlertTriangle, X, Loader2, RotateCcw, Keyboard } from 'lucide-react';
import { DialogPanel } from './components/ui/DialogPanel';
import { AnimatePresence } from 'motion/react';

const EMPTY_TASKS: Task[] = [];
const WORKSPACE_SECTIONS = [
  { id: 'workspace-overview', label: 'Overview' },
  { id: 'workspace-pipeline', label: 'Pipeline' },
  { id: 'member-lanes', label: 'Members' },
] as const;

function DashboardContent() {
  const {
    currentUser,
    isAuthChecking,
    canManageMembers,
    canCreatePipelineTask,
    canAssignTask,
    canEditUserTasks,
  } = useAuth();
  const {
    users,
    tasks,
    moveTask,
    removeAssigneeOrDeleteTask,
    deleteUser,
    createTask,
    updateTask,
    adjustBillableHours,
    syncStatus,
  } = useWorkspace();
  const {
    activeRoleTab,
    setActiveRoleTab,
    activeDragInfo,
    setActiveDragInfo,
    activeBoardId,
    setActiveBoardId,
  } = useBoardUi();

  // Modals state
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [isNewAccountModal, setIsNewAccountModal] = useState(false);
  const [newMemberPrefill, setNewMemberPrefill] = useState<{ name: string; email: string } | null>(null);
  const [setupChecklistOpen, setSetupChecklistOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
  const [adjustBillableTask, setAdjustBillableTask] = useState<Task | null>(null);
  const [defaultTaskUserId, setDefaultTaskUserId] = useState<string | undefined>(undefined);
  const [defaultTaskStatus, setDefaultTaskStatus] = useState<TaskStatus | undefined>('todo');
  const [workloadModalUser, setWorkloadModalUser] = useState<User | null>(null);
  const [firestoreModalOpen, setFirestoreModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [taskToDuplicate, setTaskToDuplicate] = useState<Task | null>(null);
  const [duplicateTargetUserId, setDuplicateTargetUserId] = useState<string | undefined>(undefined);
  const [duplicateTargetStatus, setDuplicateTargetStatus] = useState<TaskStatus | undefined>(undefined);
  const [taskToDeleteState, setTaskToDeleteState] = useState<{ task: Task; targetUserId?: string } | null>(null);
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);
  const [isHoveringDeleteZone, setIsHoveringDeleteZone] = useState(false);
  const [analyticsModalOpen, setAnalyticsModalOpen] = useState(false);
  const [freePoolOpen, setFreePoolOpen] = useState(false);
  const [sortByPressure, setSortByPressure] = useState(false);
  const [disciplineModalOpen, setDisciplineModalOpen] = useState(false);
  const [selectedTaskForAssignment, setSelectedTaskForAssignment] = useState<Task | null>(null);
  const [assignmentPresetUserId, setAssignmentPresetUserId] = useState<string | undefined>(undefined);
  const assignmentFromPipeline = useRef(false);
  const [membersWithWork, setMembersWithWork] = useState(false);
  const workspaceScrollRef = useRef<HTMLDivElement>(null);
  const sectionJump = useRef<{ id: string; scrollTop: number } | null>(null);
  const [currentSection, setCurrentSection] = useState<string>(WORKSPACE_SECTIONS[0].id);

  useEffect(() => {
    const workspace = workspaceScrollRef.current;
    const main = document.getElementById('main-workspace');
    if (!currentUser || !workspace || !main) return;
    const header = workspace.querySelector('header');
    const updateSection = () => {
      const jump = sectionJump.current;
      if (jump && jump.scrollTop === workspace.scrollTop && document.getElementById(jump.id)) return;
      sectionJump.current = null;
      const readingLine = (header?.getBoundingClientRect().bottom ?? 0) + 24;
      const section = WORKSPACE_SECTIONS.reduce<string>((active, { id }) => {
        const target = document.getElementById(id);
        return target && target.getBoundingClientRect().top <= readingLine ? id : active;
      }, WORKSPACE_SECTIONS[0].id);
      setCurrentSection(section);
    };
    const observer = new ResizeObserver(updateSection);
    observer.observe(workspace);
    observer.observe(main);
    workspace.addEventListener('scroll', updateSection, { passive: true });
    updateSection();
    return () => {
      observer.disconnect();
      workspace.removeEventListener('scroll', updateSection);
    };
  }, [currentUser]);
  const [createdBrief, setCreatedBrief] = useState<string | null>(null);
  const [assignmentNotice, setAssignmentNotice] = useState<{ taskId: string; member: string; destination: string; fromPipeline: boolean } | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [showAllMyTasks, setShowAllMyTasks] = useState(false);
  const [queuePrompt, setQueuePrompt] = useState<{ task: Task; kind: 'link' | 'deadline' | 'wip'; status: TaskStatus } | null>(null);
  const [queueBusy, setQueueBusy] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [undoToast, setUndoToast] = useState<{
    message: string;
    undo: () => Promise<void>;
  } | null>(null);

  // Stable refs for currentUser and users — allow keyboard effect and task modal handler to have empty dep arrays
  const currentUserRef = useRef(currentUser);
  const appUsersRef = useRef(users);
  const canCreatePipelineRef = useRef(canCreatePipelineTask);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
  useEffect(() => { appUsersRef.current = users; }, [users]);
  useEffect(() => { canCreatePipelineRef.current = canCreatePipelineTask; }, [canCreatePipelineTask]);

  // Task modal open handler — stabilized with empty deps; reads currentUser/users from refs
  const handleOpenAddTask = useCallback((userId?: string, status?: TaskStatus) => {
    setTaskToEdit(null);
    setDefaultTaskUserId(userId || currentUserRef.current?.id || appUsersRef.current[0]?.id);
    setDefaultTaskStatus(status || 'todo');
    setTaskModalOpen(true);
  }, []); // stable — reads from refs at call time

  // Free pool resource jump and highlight handler
  const handleSelectFreeResource = useCallback((user: User) => {
    setSearchQuery('');
    if (activeRoleTab !== 'all' && (user.role === 'content' || user.role === 'design') && user.role !== activeRoleTab) {
      setActiveRoleTab(user.role);
    }
    if (activeBoardId !== 'all') {
      const isVisibleOnCurrentBoard = user.id === activeBoardId || user.creativeDirectorId === activeBoardId;
      if (!isVisibleOnCurrentBoard) {
        setActiveBoardId('all');
      }
    }
    setTimeout(() => {
      const el = document.getElementById(`swimlane-${user.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus({ preventScroll: true });
      }
    }, 120);
  }, [activeRoleTab, setActiveRoleTab, activeBoardId, setActiveBoardId]);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');

  // User workspace ordering with persistent localStorage storage
  const [customUserOrder, setCustomUserOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('zenflow_user_order_v1');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Fast O(1) lookup map of user names for search queries
  const userNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of users) {
      map.set(u.id, u.name.toLowerCase());
    }
    return map;
  }, [users]);

  // Filter tasks by search query across tasks, clients, projects, and members
  const filteredTasks = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    if (!trimmed) return tasks;

    const map = new Map<string, Task>();
    for (const task of tasks) {
      if (!task || !task.id) continue;
      if (activeBoardId !== 'all') {
        const assignees = getTaskAssigneeIds(task);
        const belongs = task.owningClusterId ? task.owningClusterId === activeBoardId
          : assignees.some(id => {
            const user = users.find(member => member.id === id);
            return user?.id === activeBoardId || user?.creativeDirectorId === activeBoardId;
          });
        if (!belongs) continue;
      }
      const matchesTitle = task.title.toLowerCase().includes(trimmed);
      const matchesDesc = task.description ? task.description.toLowerCase().includes(trimmed) : false;
      const matchesClient = task.client ? task.client.toLowerCase().includes(trimmed) : false;
      const matchesProject = task.project ? task.project.toLowerCase().includes(trimmed) : false;
      const matchesParent = task.parentTaskTitle?.toLowerCase().includes(trimmed) || false;
      const matchesUser = getTaskAssigneeIds(task).some(uid => userNameMap.get(uid)?.includes(trimmed));

      if (matchesTitle || matchesDesc || matchesClient || matchesProject || matchesParent || matchesUser) {
        map.set(task.id, task);
      }
    }
    return Array.from(map.values());
  }, [tasks, searchQuery, userNameMap, activeBoardId, users]);

  // Cross-role search result counts for global navigation (Content & Design)
  const searchRoleMatches = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    if (!trimmed) return null;

    const counts: Record<string, number> = {
      content: 0,
      design: 0,
    };

    const taskMatchesSet = new Set(filteredTasks.map(t => t.id));
    for (const t of tasks) {
      if (!taskMatchesSet.has(t.id)) continue;
      if (t.team && counts[t.team] !== undefined) {
        counts[t.team]++;
        continue;
      }
      const firstUid = getTaskAssigneeIds(t)[0];
      const u = users.find(usr => usr.id === firstUid);
      if (u && u.role && counts[u.role] !== undefined) {
        counts[u.role]++;
      }
    }

    for (const u of users) {
      if (
        (activeBoardId === 'all' || u.id === activeBoardId || u.creativeDirectorId === activeBoardId) && (
        u.name.toLowerCase().includes(trimmed) ||
        u.email.toLowerCase().includes(trimmed) ||
        (u.designation && u.designation.toLowerCase().includes(trimmed)))
      ) {
        if (u.role && counts[u.role] !== undefined) {
          counts[u.role]++;
        }
      }
    }

    return counts;
  }, [searchQuery, filteredTasks, tasks, users, activeBoardId]);

  const allTasksByUserId = useMemo(() => groupTasksByAssignee(tasks), [tasks]);

  // Filter users by role tab ('all' | 'content' | 'design') and active team board
  // When search is active, show only users who match the query or have matching tasks
  const roleFilteredUsers = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    let boardUsers = users;

    // When searching, allow finding members across boards in the active role tab
    if (activeBoardId !== 'all') {
      boardUsers = users.filter(u => u.id === activeBoardId || u.creativeDirectorId === activeBoardId);
    }

    let filtered =
      activeRoleTab === 'all'
        ? boardUsers.filter(u => u.role === 'content' || u.role === 'design')
        : boardUsers.filter(u => u.role === activeRoleTab);

    // If search is active, only show users who match query or have matching tasks
    if (trimmed) {
      const usersWithMatchingTasks = new Set<string>();
      for (const t of filteredTasks) {
        for (const uid of getTaskAssigneeIds(t)) {
          usersWithMatchingTasks.add(uid);
        }
      }
      filtered = filtered.filter(u => {
        const matchesName = u.name.toLowerCase().includes(trimmed);
        const matchesEmail = u.email.toLowerCase().includes(trimmed);
        const matchesDesignation = u.designation ? u.designation.toLowerCase().includes(trimmed) : false;
        const hasTasks = usersWithMatchingTasks.has(u.id);
        return matchesName || matchesEmail || matchesDesignation || hasTasks;
      });
    }

    const getUserScore = (uId: string) => {
      const list = allTasksByUserId.get(uId) || [];
      return quickWorkloadScore(list);
    };
    const isOverloadedOrWipBreached = (uId: string) => {
      const list = allTasksByUserId.get(uId) || [];
      return quickWorkloadScore(list) >= 12 || list.filter(t => t.status === 'in_progress').length > 2;
    };

    if (sortByPressure) {
      return [...filtered].sort((a, b) => {
        const aOver = isOverloadedOrWipBreached(a.id) ? 1 : 0;
        const bOver = isOverloadedOrWipBreached(b.id) ? 1 : 0;
        if (aOver !== bOver) return bOver - aOver;
        return getUserScore(b.id) - getUserScore(a.id);
      });
    }

    const pinnedUser = currentUser ? filtered.find(u => u.id === currentUser.id) : null;
    const reorderableUsers = pinnedUser ? filtered.filter(u => u.id !== currentUser.id) : filtered;

    if (customUserOrder.length === 0) {
      return pinnedUser ? [pinnedUser, ...reorderableUsers] : reorderableUsers;
    }

    const orderMap = new Map<string, number>();
    for (let i = 0; i < customUserOrder.length; i++) {
      orderMap.set(customUserOrder[i], i);
    }

    const sortedReorderable = [...reorderableUsers].sort((a, b) => {
      const indexA = orderMap.has(a.id) ? orderMap.get(a.id)! : -1;
      const indexB = orderMap.has(b.id) ? orderMap.get(b.id)! : -1;
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      return 0;
    });

    return pinnedUser ? [pinnedUser, ...sortedReorderable] : sortedReorderable;
  }, [users, activeRoleTab, customUserOrder, currentUser, activeBoardId, searchQuery, filteredTasks, sortByPressure, allTasksByUserId]);

  const scopedSearchTasks = useMemo(() => filteredTasks.filter(task => {
    const firstId = getTaskAssigneeIds(task)[0];
    const team = task.team || users.find(user => user.id === firstId)?.role || 'content';
    return (activeRoleTab === 'all' ? team === 'content' || team === 'design' : team === activeRoleTab);
  }), [filteredTasks, users, activeRoleTab]);
  const matchingPipelineCount = scopedSearchTasks.filter(task => task.status === 'pipeline').length;
  const matchingAssignedCount = scopedSearchTasks.filter(task => task.status !== 'pipeline' && task.status !== 'archived').length;

  const roleFilteredUsersRef = useRef(roleFilteredUsers);
  roleFilteredUsersRef.current = roleFilteredUsers;

  const prevTasksByUserIdRef = useRef<Map<string, Task[]>>(new Map());

  // Preserve member task array identities when search or a different lane changes.
  const tasksByUserId = useMemo(() => {
    const partitioned = filteredTasks === tasks ? allTasksByUserId : groupTasksByAssignee(filteredTasks);
    const prevMap = prevTasksByUserIdRef.current;
    const stablePartitioned = new Map<string, Task[]>();

    for (const [uId, newList] of partitioned.entries()) {
      const prevList = prevMap.get(uId);
      if (
        prevList &&
        prevList.length === newList.length &&
        prevList.every((t, i) => t === newList[i])
      ) {
        stablePartitioned.set(uId, prevList);
      } else {
        stablePartitioned.set(uId, newList);
      }
    }

    prevTasksByUserIdRef.current = stablePartitioned;
    return stablePartitioned;
  }, [allTasksByUserId, filteredTasks, tasks]);

  const memberHasVisibleWork = (userId: string) => tasksByUserId.get(userId)?.some(
    task => task.status !== 'pipeline' && task.status !== 'archived'
  ) ?? false;

  const priorityMembers = useMemo(() => roleFilteredUsers.map(user => ({
    user, score: quickWorkloadScore(allTasksByUserId.get(user.id) || []),
  })).filter(item => item.score >= 12).sort((a, b) => b.score - a.score), [roleFilteredUsers, allTasksByUserId]);
  const urgentTasks = useMemo(() => tasks.filter(task => {
    if (!['todo', 'in_progress'].includes(task.status)) return false;
    const days = getDaysRemaining(task.dueDate);
    if (days === null || days > 0) return false;
    if (activeRoleTab !== 'all' && task.team && task.team !== activeRoleTab) return false;
    return activeBoardId === 'all' || getTaskAssigneeIds(task).some(id => {
      const member = users.find(user => user.id === id);
      return member && (member.id === activeBoardId || member.creativeDirectorId === activeBoardId);
    });
  }).sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '')), [tasks, users, activeRoleTab, activeBoardId]);
  const myActiveTasks = useMemo(() => currentUser ? (allTasksByUserId.get(currentUser.id) || [])
    .filter(task => task.status === 'in_progress' || task.status === 'todo')
    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')) : [], [currentUser, allTasksByUserId]);

  // Global keyboard shortcuts (non-hijacking single-key shortcuts outside inputs)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const isEditable = Boolean(
        target && (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable
        )
      );
      if (isEditable || document.querySelector('[role="dialog"]')) return;

      if (e.key === '/') {
        const searchInput = document.getElementById('task-search-input') as HTMLInputElement | null;
        if (searchInput) {
          e.preventDefault();
          searchInput.focus();
          searchInput.select();
        }
      } else if (e.key === '1') {
        e.preventDefault();
        setActiveRoleTab('all');
      } else if (e.key === '2') {
        e.preventDefault();
        setActiveRoleTab('content');
      } else if (e.key === '3') {
        e.preventDefault();
        setActiveRoleTab('design');
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFreePoolOpen(prev => !prev);
      } else if (e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setAnalyticsModalOpen(true);
      } else if (e.key.toLowerCase() === 'n' && canCreatePipelineRef.current) {
        e.preventDefault();
        setDisciplineModalOpen(true);
      } else if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActiveRoleTab]);

  const handleEditTask = useCallback((task: Task) => {
    setTaskToEdit(task);
    setTaskModalOpen(true);
  }, []);

  const handleOpenAdjustBillableHours = useCallback((task: Task) => {
    setAdjustBillableTask(task);
  }, []);

  const handleSaveBillableHours = useCallback(
    async (taskId: string, newDurationMs: number, reason?: string) => {
      await adjustBillableHours(taskId, newDurationMs, reason);
    },
    [adjustBillableHours]
  );

  const currentTaskToEdit = useMemo(() => {
    if (!taskToEdit) return null;
    return tasks.find(t => t.id === taskToEdit.id) || taskToEdit;
  }, [taskToEdit, tasks]);

  const currentAdjustBillableTask = useMemo(() => {
    if (!adjustBillableTask) return null;
    return tasks.find(t => t.id === adjustBillableTask.id) || adjustBillableTask;
  }, [adjustBillableTask, tasks]);

  const handleOpenLogin = useCallback(() => {
    setIsNewAccountModal(false);
    setLoginModalOpen(true);
  }, []);

  const handleOpenNewUser = useCallback((prefill?: { name: string; email: string } | null) => {
    setNewMemberPrefill(prefill ?? null);
    setIsNewAccountModal(true);
    setLoginModalOpen(true);
  }, []);

  const handleOpenFirestore = useCallback(() => {
    setFirestoreModalOpen(true);
  }, []);

  const handleOpenWorkloadModal = useCallback((u: User) => {
    setWorkloadModalUser(u);
  }, []);

  const handleOpenDeleteUser = useCallback((u: User) => {
    setUserToDelete(u);
  }, []);

  const handleOpenDuplicateTask = useCallback((task: Task, targetUserId?: string, targetStatus?: TaskStatus) => {
    setDuplicateTargetUserId(targetUserId);
    setDuplicateTargetStatus(targetStatus);
    setTaskToDuplicate(task);
  }, []);

  const handleCloseDuplicateTask = useCallback(() => {
    setTaskToDuplicate(null);
    setDuplicateTargetUserId(undefined);
    setDuplicateTargetStatus(undefined);
  }, []);

  const handleDragTaskStart = useCallback(
    (draggedTask: Task, sourceUserId?: string) => {
      setActiveDragInfo({
        taskId: draggedTask.id,
        sourceUserId: sourceUserId || draggedTask.userId,
        sourceStatus: draggedTask.status,
        title: draggedTask.title,
        task: draggedTask,
        dueDate: draggedTask.dueDate,
      });
    },
    [setActiveDragInfo]
  );

  const handleDragTaskEnd = useCallback(() => {
    setActiveDragInfo(null);
    setIsHoveringDeleteZone(false);
  }, [setActiveDragInfo]);

  const handleRequestDeleteTask = useCallback((taskIdOrTask: string | Task, removeAssigneeId?: string) => {
    if (typeof taskIdOrTask === 'string') {
      const found = tasks.find(t => t.id === taskIdOrTask);
      if (found) setTaskToDeleteState({ task: found, targetUserId: removeAssigneeId });
    } else {
      setTaskToDeleteState({ task: taskIdOrTask, targetUserId: removeAssigneeId });
    }
  }, [tasks]);

  const handleConfirmDeleteTask = useCallback(async (taskId: string, removeAssigneeId?: string) => {
    await removeAssigneeOrDeleteTask(taskId, removeAssigneeId);
    setTaskToDeleteState(null);
  }, [removeAssigneeOrDeleteTask]);

  const handleDisciplineMismatch = useCallback((message: string) => {
    setWorkspaceNotice(message);
  }, []);

  useEffect(() => {
    if (!workspaceNotice) return;
    const timer = setTimeout(() => setWorkspaceNotice(null), 4500);
    return () => clearTimeout(timer);
  }, [workspaceNotice]);

  useEffect(() => {
    if (!undoToast) return;
    const timer = setTimeout(() => setUndoToast(null), 6000);
    return () => clearTimeout(timer);
  }, [undoToast]);

  const handleQuickAddTask = useCallback(
    async (
      userId: string,
      title: string,
      status: TaskStatus,
      cognitiveLoad?: 'low' | 'medium' | 'high',
      dueDate?: string
    ) => {
      await createTask({
        userId,
        title,
        status,
        cognitiveLoad,
        dueDate,
      });
    },
    [createTask]
  );

  const handleRescheduleTask = useCallback(
    async (taskId: string, newDueDate: string | undefined) => {
      const prevTask = tasks.find(t => t.id === taskId);
      const prevDueDate = prevTask?.dueDate;
      await updateTask(taskId, { dueDate: newDueDate });
      if (prevTask && prevDueDate !== newDueDate) {
        setUndoToast({
          message: `Rescheduled "${prevTask.title}"`,
          undo: async () => {
            await updateTask(taskId, { dueDate: prevDueDate });
          },
        });
      }
    },
    [tasks, updateTask]
  );

  const handleMoveTaskWithUndo = useCallback<typeof moveTask>(
    async (taskId, targetUserId, newStatus, newIndex, newDueDate, extraUpdates) => {
      const prevTask = tasks.find(t => t.id === taskId);
      const prevSnapshot = prevTask
        ? {
            userId: prevTask.userId || '',
            assigneeIds: getTaskAssigneeIds(prevTask),
            status: prevTask.status,
            order: prevTask.order,
            dueDate: prevTask.dueDate ?? null,
          }
        : null;
      await moveTask(taskId, targetUserId, newStatus, newIndex, newDueDate, extraUpdates);
      if (prevTask && prevSnapshot && (prevSnapshot.status !== newStatus || prevSnapshot.userId !== targetUserId)) {
        setUndoToast({
          message: `Moved "${prevTask.title}" to ${formatTaskStatus(newStatus)}`,
          undo: async () => {
            if (prevSnapshot.status === 'pipeline' && prevSnapshot.assigneeIds.length === 0) {
              await updateTask(taskId, {
                status: 'pipeline',
                userId: undefined,
                assigneeIds: [],
                dueDate: prevSnapshot.dueDate || undefined,
              });
            } else {
              await moveTask(
                taskId,
                prevSnapshot.userId || targetUserId,
                prevSnapshot.status,
                prevSnapshot.order,
                prevSnapshot.dueDate
              );
            }
          },
        });
      }
    },
    [tasks, moveTask, updateTask]
  );

  const moveQueueTask = async (task: Task, status: TaskStatus, dueDate?: string, contentDocLink?: string) => {
    if (!currentUser) return;
    setQueueBusy(true);
    setQueueError(null);
    try {
      await handleMoveTaskWithUndo(task.id, currentUser.id, status, undefined, dueDate, contentDocLink ? { contentDocLink } : undefined);
      setQueuePrompt(null);
    } catch (error) {
      setQueueError(error instanceof Error ? error.message : 'Could not update the task. Please try again.');
      setQueuePrompt(null);
    } finally {
      setQueueBusy(false);
    }
  };
  const handleQueueAction = (task: Task) => {
    if (!currentUser || queueBusy || !canEditUserTasks(currentUser.id)) return;
    const status: TaskStatus = task.status === 'todo' ? 'in_progress' : 'done';
    if (status === 'done' && (task.team ? task.team === 'content' : currentUser.role === 'content')) {
      setQueuePrompt({ task, status, kind: 'link' });
    } else if (!task.dueDate?.trim()) {
      setQueuePrompt({ task, status, kind: 'deadline' });
    } else if (status === 'in_progress' && myActiveTasks.filter(item => item.status === 'in_progress' && item.id !== task.id).length >= 2) {
      setQueuePrompt({ task, status, kind: 'wip' });
    } else {
      void moveQueueTask(task, status);
    }
  };

  const handleUpdateTaskTitle = useCallback(
    async (taskId: string, newTitle: string) => {
      await updateTask(taskId, { title: newTitle });
    },
    [updateTask]
  );

  const handleMoveUserUp = useCallback((userId: string) => {
    // Current user account is pinned to the top and cannot be reordered
    const currentUid = currentUserRef.current?.id;
    if (userId === currentUid) return;

    const currentList = roleFilteredUsersRef.current.map(u => u.id);
    const reorderable = currentList.filter(id => id !== currentUid);
    const idx = reorderable.indexOf(userId);
    if (idx <= 0) return;

    const nextReorderable = [...reorderable];
    [nextReorderable[idx - 1], nextReorderable[idx]] = [nextReorderable[idx], nextReorderable[idx - 1]];
    const nextList = currentUid && currentList.includes(currentUid) ? [currentUid, ...nextReorderable] : nextReorderable;

    setSortByPressure(false);
    setCustomUserOrder(nextList);
    try {
      localStorage.setItem('zenflow_user_order_v1', JSON.stringify(nextList));
    } catch { }
  }, []);

  const handleMoveUserDown = useCallback((userId: string) => {
    // Current user account is pinned to the top and cannot be reordered
    const currentUid = currentUserRef.current?.id;
    if (userId === currentUid) return;

    const currentList = roleFilteredUsersRef.current.map(u => u.id);
    const reorderable = currentList.filter(id => id !== currentUid);
    const idx = reorderable.indexOf(userId);
    if (idx === -1 || idx >= reorderable.length - 1) return;

    const nextReorderable = [...reorderable];
    [nextReorderable[idx + 1], nextReorderable[idx]] = [nextReorderable[idx], nextReorderable[idx + 1]];
    const nextList = currentUid && currentList.includes(currentUid) ? [currentUid, ...nextReorderable] : nextReorderable;

    setSortByPressure(false);
    setCustomUserOrder(nextList);
    try {
      localStorage.setItem('zenflow_user_order_v1', JSON.stringify(nextList));
    } catch { }
  }, []);

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-[var(--canvas)] flex flex-col items-center justify-center p-4 transition-colors">
        <div className="flex flex-col items-center gap-3.5 text-center">
          <div
            id="zenflow-loading-logo"
            className="flex h-11 w-11 items-center justify-center rounded-[9px] bg-[#121418] dark:bg-[#1e2430] border border-[#262b36] dark:border-white/10 text-blue-500 shrink-0"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M 4.5 7.2 C 8.5 4.8, 14 9.6, 19.5 7 L 4.5 17 C 10 14.4, 15.5 19.2, 19.5 16.8" />
            </svg>
          </div>
          <div className="flex items-baseline justify-center leading-none">
            <span className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              zen
            </span>
            <span className="font-flowy text-3xl font-bold text-[#1d4ed8] dark:text-blue-400 ml-0.5 select-none">
              Flow
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <Loader2 className="w-3.5 h-3.5 text-[#1d4ed8] dark:text-blue-400 animate-spin" />
            <span>Verifying session...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`min-h-screen bg-[var(--canvas)] text-[var(--text-primary)] font-sans antialiased transition-colors relative ${currentUser ? 'workspace-shell' : 'overflow-hidden pointer-events-none select-none filter blur-[2px]'}`}>
        <a
          href="#main-workspace"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-3 focus:py-1.5 focus:rounded-[6px] focus:bg-[var(--accent)] focus:text-white focus:text-xs focus:font-medium focus:shadow-lg"
        >
          Skip to workspace
        </a>
        {currentUser && (
          <nav className="workspace-jump-bar" aria-label="Workspace sections">
            {WORKSPACE_SECTIONS.filter(({ id }) => id !== 'member-lanes' || roleFilteredUsers.length > 0).map(({ id, label }) => (
              <a key={id} href={`#${id}`} aria-current={currentSection === id ? 'location' : undefined}
                onClick={event => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  const target = document.getElementById(id);
                  const workspace = workspaceScrollRef.current;
                  if (!target || !workspace) return;
                  event.preventDefault();
                  const headerBottom = workspace.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
                  workspace.scrollTop += target.getBoundingClientRect().top - headerBottom - 12;
                  sectionJump.current = { id, scrollTop: workspace.scrollTop };
                  target.focus({ preventScroll: true });
                  setCurrentSection(id);
                }}
              >
                {label}
              </a>
            ))}
          </nav>
        )}
        <div ref={workspaceScrollRef} className="workspace-scroll">
        {/* Sticky Header */}
        <Header
          onOpenLoginModal={handleOpenLogin}
          onOpenNewUserModal={handleOpenNewUser}
          onOpenFirestoreModal={handleOpenFirestore}
          onOpenSetupModal={() => setSetupChecklistOpen(true)}
          onOpenShortcutsModal={() => setShortcutsOpen(true)}
        />

        {/* Pinned Marquee Ribbon (renders its own sticky frosted container only when urgent tasks exist) */}
        <div className={canAssignTask || (!canAssignTask && !canCreatePipelineTask) ? 'hidden sm:block' : ''}>
        <MarqueeRibbon
          tasks={tasks}
          users={users}
          activeRoleTab={activeRoleTab}
          activeBoardId={activeBoardId}
          onTaskClick={handleEditTask}
        />
        </div>

        {/* Main Workspace Container */}
        <main
          id="main-workspace"
          tabIndex={-1}
          className="mx-auto max-w-[1400px] px-4 py-4 sm:px-6 lg:px-8 pb-8"
        >

          {!searchQuery.trim() && canAssignTask && (
            <section aria-label="Workload exceptions" className="ledger-frame mb-2.5 px-3 py-2 sm:hidden">
              <h2 className="text-xs font-bold text-[var(--text-primary)]">Workload exceptions</h2>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {urgentTasks.map(task => {
                  const overdue = (getDaysRemaining(task.dueDate) ?? 0) < 0;
                  const assigneeNames = getTaskAssigneeIds(task)
                    .map(id => users.find(user => user.id === id)?.name)
                    .filter(Boolean).join(', ');
                  return <button key={task.id} type="button" className={`button-secondary max-w-full min-w-0 whitespace-normal break-words text-left text-xs ${overdue ? '!border-[var(--danger-border)] !bg-[var(--danger-soft)] !text-red-700 dark:!text-red-300' : ''}`} onClick={() => handleEditTask(task)}>
                    <span>{task.title} · {assigneeNames || 'Unassigned'} · {overdue ? 'Overdue' : 'Due today'}</span>
                  </button>;
                })}
                {priorityMembers.map(({ user, score }) => <button key={user.id} type="button" onClick={() => setWorkloadModalUser(user)} className="button-secondary max-w-full min-w-0 whitespace-normal break-words text-left text-xs">
                  {user.name} · {score} / 12 points · View workload
                </button>)}
                {priorityMembers.length === 0 && urgentTasks.length === 0 && <p className="text-xs text-[var(--text-secondary)]">No workload or deadline exceptions need attention.</p>}
              </div>
            </section>
          )}
          {!searchQuery.trim() && canCreatePipelineTask && !canAssignTask && (
            <section className="ledger-frame mb-3 px-4 py-3 sm:hidden" aria-label="Brief intake">
              <h2 className="text-sm font-semibold">Brief intake</h2>
              <button type="button" className="button-primary mt-2" onClick={() => setDisciplineModalOpen(true)}>New Brief</button>
            </section>
          )}
          {!searchQuery.trim() && !canAssignTask && currentUser && (currentUser.role === 'content' || currentUser.role === 'design') && (
            <section aria-label="Your work" className="ledger-frame mb-3 px-4 py-3 sm:hidden">
              <h2 className="text-xs font-bold text-[var(--text-primary)]">Your current and upcoming work</h2>
              {myActiveTasks.length ? <div className="mt-2 space-y-2">{(showAllMyTasks ? myActiveTasks : myActiveTasks.slice(0, 3)).map(task => (
                <div key={task.id} className="flex flex-wrap items-center gap-2">
                  <button type="button" className="button-secondary text-xs text-left justify-start break-words flex-1" onClick={() => handleEditTask(task)}>{task.title} · {task.status === 'in_progress' ? 'In Progress' : 'To Do'}{task.dueDate ? ` · Due ${formatDateOnly(task.dueDate)}` : ''}</button>
                  {canEditUserTasks(currentUser.id) && <button type="button" className="button-secondary text-xs" disabled={queueBusy} aria-label={`${task.status === 'todo' ? 'Start' : 'Complete'} ${task.title}`} onClick={() => handleQueueAction(task)}>{task.status === 'todo' ? 'Start' : 'Complete'}</button>}
                </div>
              ))}{myActiveTasks.length > 3 && <button type="button" className="button-secondary text-xs" aria-expanded={showAllMyTasks} onClick={() => setShowAllMyTasks(value => !value)}>{showAllMyTasks ? 'Show fewer tasks' : `View all my tasks (${myActiveTasks.length})`}</button>}</div> : <p className="mt-1 text-xs text-[var(--text-secondary)]">No current or upcoming tasks.</p>}
              {queueError && <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">{queueError} Try the action again.</p>}
            </section>
          )}
          {/* Overview Bar */}
          <OverviewBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onOpenAnalytics={() => setAnalyticsModalOpen(true)}
            sortByPressure={sortByPressure}
            onToggleSortByPressure={() => {
              const next = !sortByPressure;
              setSortByPressure(next);
              if (next) {
                requestAnimationFrame(() => {
                  const firstOverloaded = roleFilteredUsersRef.current.find(u => {
                    const list = allTasksByUserId.get(u.id) || [];
                    return quickWorkloadScore(list) >= 12 || list.filter(t => t.status === 'in_progress').length > 2;
                  });
                  if (firstOverloaded) {
                    document.getElementById(`swimlane-${firstOverloaded.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                });
              }
            }}
            freePool={
              <FreePoolContainer
                users={users}
                tasks={tasks}
                activeRoleTab={activeRoleTab}
                onAddTask={handleOpenAddTask}
                onAssignBrief={canAssignTask ? (brief, targetUserId) => {
                  setAssignmentPresetUserId(targetUserId);
                  setSelectedTaskForAssignment(brief);
                } : undefined}
                canAddTask={canEditUserTasks}
                onSelectUser={handleSelectFreeResource}
                isExpanded={freePoolOpen}
                onExpandedChange={setFreePoolOpen}
              />
            }
          />

          {/* Onboarding Checklist */}
          <OnboardingChecklist
            forceOpen={setupChecklistOpen}
            onCloseForceOpen={() => setSetupChecklistOpen(false)}
          />

          {/* Search Results Summary & Cross-Tab Navigation Ribbon */}
          {searchQuery.trim() && (
            <div className="mb-4 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                <Search className="h-3.5 w-3.5 text-[#1d4ed8] dark:text-blue-400 shrink-0" />
                <span className="tabular-nums">
                  {activeBoardId === 'all' ? 'All clusters' : 'Selected cluster'} · Results for &ldquo;<span className="font-semibold text-[var(--text-primary)]">{searchQuery.trim()}</span>&rdquo;:{' '}
                  <span className="font-semibold text-[#1d4ed8] dark:text-blue-400">{matchingPipelineCount} pipeline brief{matchingPipelineCount === 1 ? '' : 's'}</span> ·{' '}
                  <span className="font-semibold text-[#1d4ed8] dark:text-blue-400">{matchingAssignedCount} assigned task{matchingAssignedCount === 1 ? '' : 's'}</span> · {roleFilteredUsers.length} member{roleFilteredUsers.length === 1 ? '' : 's'}.
                </span>
              </div>

              {/* Cross-role matches links */}
              {searchRoleMatches && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-[var(--text-secondary)]">Teams:</span>
                  {(['all', 'content', 'design'] as const).map(role => {
                    const count =
                      role === 'all'
                        ? (searchRoleMatches.content || 0) + (searchRoleMatches.design || 0)
                        : searchRoleMatches[role] || 0;
                    if (count === 0 && role !== activeRoleTab) return null;
                    const roleLabel = role === 'all' ? 'All' : role.charAt(0).toUpperCase() + role.slice(1);
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setActiveRoleTab(role)}
                        className={`px-2 py-0.5 rounded-[5px] text-[11px] font-semibold tabular-nums transition-colors cursor-pointer ${
                          role === activeRoleTab
                            ? 'bg-[#1d4ed8] dark:bg-[#3b82f6] text-white'
                            : 'bg-[var(--surface-subtle)] text-[var(--text-primary)] hover:bg-[var(--border)] border border-[var(--border)]'
                        }`}
                        style={{ minHeight: 'auto' }}
                      >
                        {roleLabel} ({count} {count === 1 ? 'match' : 'matches'})
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {workspaceNotice && (
            <div className="callout callout-warning mb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span className="font-medium">{workspaceNotice}</span>
              </div>
              <button
                type="button"
                aria-label="Dismiss notice"
                onClick={() => setWorkspaceNotice(null)}
                className="rounded-[5px] p-1 hover:bg-amber-500/15 transition-colors cursor-pointer"
                style={{ minHeight: 'auto' }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Centralized Pipeline */}
          {searchQuery.trim() && activeBoardId !== 'all' && matchingPipelineCount === 0 && (
            <p className="text-xs mb-2">No briefs match in this cluster. <button type="button" className="underline" onClick={() => setActiveBoardId('all')}>Search all clusters</button></p>
          )}
          {roleFilteredUsers.length > 0 && (
            <div id="pipeline-shortcut" tabIndex={-1} className="mb-2 flex scroll-mt-28 justify-end sm:hidden">
              <a href="#member-lanes" className="button-secondary text-xs">Members</a>
            </div>
          )}
          <div role="status" aria-live="polite">
            {createdBrief && (
              <div className="callout mb-2 flex items-center justify-between gap-2">
                <p className="wrap-anywhere">“{createdBrief}” added to Pipeline for assignment.</p>
                <button type="button" aria-label="Dismiss brief confirmation" onClick={() => setCreatedBrief(null)} className="icon-button shrink-0">
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
          <TeamPipeline
            roleFilter={activeRoleTab}
            tasks={searchQuery.trim() ? scopedSearchTasks : tasks}
            users={users}
            globalSearch={searchQuery}
            assignmentNotice={assignmentNotice?.fromPipeline ? assignmentNotice : null}
            onClearSearch={() => setSearchQuery('')}
            onOpenCreateModal={() => setDisciplineModalOpen(true)}
            onOpenAssignmentModal={task => {
              assignmentFromPipeline.current = true;
              setSelectedTaskForAssignment(task);
            }}
            onEditTask={handleEditTask}
            onDeleteTask={handleRequestDeleteTask}
            onDragTaskStart={handleDragTaskStart}
            onDragTaskEnd={handleDragTaskEnd}
          />

          {/* User Swimlanes List */}
          {roleFilteredUsers.length === 0 && (!searchQuery.trim() || matchingPipelineCount === 0) ? (
            <div className="ledger-frame flex flex-col items-center justify-center p-12 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-[7px] bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text-secondary)] mb-3">
                {searchQuery.trim() ? (
                  <Search className="h-5 w-5 text-[#1d4ed8] dark:text-blue-400" />
                ) : activeRoleTab === 'design' ? (
                  <Palette className="h-5 w-5 text-[#1d4ed8] dark:text-blue-400" />
                ) : (
                  <FileText className="h-5 w-5 text-[#1d4ed8] dark:text-blue-400" />
                )}
              </div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                {searchQuery.trim()
                  ? `No matching tasks, clients, projects, or members found in ${activeRoleTab === 'all' ? 'All Teams' : activeRoleTab.charAt(0).toUpperCase() + activeRoleTab.slice(1)}`
                  : activeRoleTab === 'all'
                  ? 'No Content or Design members yet'
                  : `No members in ${activeRoleTab === 'content' ? 'Content' : 'Design'} yet`}
              </h3>
              <p className="mt-1 text-xs text-[var(--text-secondary)] max-w-sm">
                {searchQuery.trim()
                  ? 'Try searching with different keywords, check the filter tabs above, or clear the search query.'
                  : activeRoleTab === 'all'
                  ? 'Add team members with the Content or Design role to populate the workspace.'
                  : `Add a new member with the ${activeRoleTab} role to generate their dedicated swimlane.`}
              </p>
              {searchQuery.trim() ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="button-secondary mt-4"
                >
                  Clear Search
                </button>
              ) : canManageMembers && (
                <button
                  type="button"
                  onClick={() => handleOpenNewUser()}
                  className="button-primary mt-4"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  <span>Add {activeRoleTab === 'design' ? 'Design' : activeRoleTab === 'content' ? 'Content' : 'Team'} Member</span>
                </button>
              )}
            </div>
          ) : roleFilteredUsers.length > 0 ? (
            <section id="member-lanes" aria-label="Member lanes" tabIndex={-1} className="space-y-4 scroll-mt-28">
              <div className="hidden items-center justify-between gap-3 sm:flex">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">Member lanes</h2>
                <div className="flex items-center gap-3">
                  <label className="inline-flex min-h-[var(--control-height)] cursor-pointer items-center gap-2 text-xs text-[var(--text-secondary)]">
                    <input type="checkbox" checked={membersWithWork} onChange={event => setMembersWithWork(event.target.checked)} />
                    Members with work
                  </label>
                </div>
              </div>
              {membersWithWork && !roleFilteredUsers.some(user => memberHasVisibleWork(user.id)) && (
                <p className="hidden py-3 text-xs text-[var(--text-secondary)] sm:block">No members have work in the current view.</p>
              )}
              <div className="flex justify-start sm:hidden">
                <a href="#pipeline-shortcut" className="button-secondary text-xs">Back to Pipeline</a>
              </div>
              {roleFilteredUsers.map((user, index) => {
                const isCurrent = currentUser?.id === user.id;
                const hasPinnedTop = roleFilteredUsers[0]?.id === currentUser?.id;
                const canMoveUp = !isCurrent && (hasPinnedTop ? index > 1 : index > 0);
                const canMoveDown = !isCurrent && index < roleFilteredUsers.length - 1;

                return (
                  <div key={user.id} className={membersWithWork && !memberHasVisibleWork(user.id) ? 'sm:hidden' : undefined}>
                    <Swimlane
                      user={user}
                      tasks={tasksByUserId.get(user.id) || EMPTY_TASKS}
                      metricTasks={allTasksByUserId.get(user.id) || EMPTY_TASKS}
                      activeDragInfo={activeDragInfo}
                      onDragTaskStart={handleDragTaskStart}
                      onDragTaskEnd={handleDragTaskEnd}
                      onAddTask={handleOpenAddTask}
                      onQuickAddTask={handleQuickAddTask}
                      onEditTask={handleEditTask}
                      onRescheduleTask={handleRescheduleTask}
                      onAdjustBillableHours={handleOpenAdjustBillableHours}
                      onUpdateTaskTitle={handleUpdateTaskTitle}
                      onDeleteTask={handleRequestDeleteTask}
                      onEditUser={setEditingUser}
                      onDeleteUser={handleOpenDeleteUser}
                      onMoveTask={handleMoveTaskWithUndo}
                      onDuplicateTask={handleOpenDuplicateTask}
                      onDisciplineMismatch={handleDisciplineMismatch}
                      onOpenWorkloadModal={handleOpenWorkloadModal}
                      isCurrentUser={isCurrent}
                      onMoveUserUp={handleMoveUserUp}
                      onMoveUserDown={handleMoveUserDown}
                      canMoveUp={canMoveUp}
                      canMoveDown={canMoveDown}
                    />
                  </div>
                );
              })}
            </section>
          ) : null}
        </main>
        </div>



        {/* Workspace Modals */}
        <TaskModal
          isOpen={taskModalOpen}
          onClose={() => setTaskModalOpen(false)}
          taskToEdit={currentTaskToEdit}
          defaultUserId={defaultTaskUserId}
          defaultStatus={defaultTaskStatus}
          onAdjustBillableHours={handleOpenAdjustBillableHours}
          onDuplicateTask={handleOpenDuplicateTask}
        />

        <BillableHoursModal
          isOpen={Boolean(adjustBillableTask)}
          task={currentAdjustBillableTask}
          onClose={() => setAdjustBillableTask(null)}
          onSave={handleSaveBillableHours}
        />

        <WorkloadModal
          isOpen={Boolean(workloadModalUser)}
          user={workloadModalUser}
          tasks={tasks}
          onClose={() => setWorkloadModalUser(null)}
          onSelectTask={taskId => {
            const target = tasks.find(t => t.id === taskId);
            if (target) {
              setTaskToEdit(target);
              setTaskModalOpen(true);
            }
          }}
        />

        <DeleteUserModal
          isOpen={Boolean(userToDelete)}
          user={userToDelete}
          tasks={tasks}
          onClose={() => setUserToDelete(null)}
          onConfirmDelete={deleteUser}
        />

        <FirestoreModal
          isOpen={firestoreModalOpen}
          onClose={() => setFirestoreModalOpen(false)}
        />



        <AnalyticsModal
          isOpen={analyticsModalOpen}
          onClose={() => setAnalyticsModalOpen(false)}
          onJumpToMember={member => {
            if (member.role === 'content' || member.role === 'design') {
              setActiveRoleTab(member.role);
            } else {
              setActiveRoleTab('all');
            }
            if (activeBoardId !== 'all') {
              const belongsToBoard =
                member.id === activeBoardId || member.creativeDirectorId === activeBoardId;
              if (!belongsToBoard) {
                setActiveBoardId('all');
              }
            }
            requestAnimationFrame(() => {
              const el = document.getElementById(`swimlane-${member.id}`);
              el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
          }}
        />

        <EditUserModal
          isOpen={Boolean(editingUser)}
          user={editingUser}
          onClose={() => setEditingUser(null)}
        />

        <DuplicateTaskModal
          isOpen={Boolean(taskToDuplicate)}
          task={taskToDuplicate}
          initialTargetUserId={duplicateTargetUserId}
          initialTargetStatus={duplicateTargetStatus}
          onClose={handleCloseDuplicateTask}
        />

        <DeleteTaskModal
          isOpen={Boolean(taskToDeleteState)}
          task={taskToDeleteState?.task || null}
          targetUserId={taskToDeleteState?.targetUserId}
          users={users}
          onClose={() => setTaskToDeleteState(null)}
          onConfirmDelete={handleConfirmDeleteTask}
        />

        <DisciplineTaskModal
          isOpen={disciplineModalOpen}
          onClose={() => setDisciplineModalOpen(false)}
          initialDiscipline={activeRoleTab}
          onCreated={setCreatedBrief}
        />

        <ContentLinkPromptModal isOpen={queuePrompt?.kind === 'link'} task={queuePrompt?.task || null} onClose={() => setQueuePrompt(null)} hasSiblingDesignTask={Boolean(queuePrompt?.task.parentTaskId && tasks.some(t => t.id !== queuePrompt.task.id && t.parentTaskId === queuePrompt.task.parentTaskId && t.team === 'design'))} onConfirm={link => { if (queuePrompt) void moveQueueTask(queuePrompt.task, queuePrompt.status, undefined, link); }} />
        <DeadlineDemandModal isOpen={queuePrompt?.kind === 'deadline'} task={queuePrompt?.task || null} targetStatus={queuePrompt?.status || null} targetUserName={currentUser?.name} onCancel={() => setQueuePrompt(null)} onConfirm={(_id, date) => { if (!queuePrompt) return; if (queuePrompt.status === 'in_progress' && myActiveTasks.filter(item => item.status === 'in_progress' && item.id !== queuePrompt.task.id).length >= 2) { setQueuePrompt({ ...queuePrompt, kind: 'wip' }); return; } void moveQueueTask(queuePrompt.task, queuePrompt.status, date); }} />
        <WipLimitModal isOpen={queuePrompt?.kind === 'wip'} user={currentUser} inProgressTasks={myActiveTasks.filter(task => task.status === 'in_progress')} onClose={() => setQueuePrompt(null)} />
        <TaskAssignmentModal
          isOpen={Boolean(selectedTaskForAssignment)}
          task={selectedTaskForAssignment}
          initialAssigneeId={assignmentPresetUserId}
          onAssigned={(taskId, member, destination) => {
            setAssignmentNotice({ taskId, member, destination, fromPipeline: assignmentFromPipeline.current });
            if (!assignmentFromPipeline.current) window.setTimeout(() => document.getElementById('assignment-result')?.focus(), 150);
          }}
          onClose={() => {
            assignmentFromPipeline.current = false;
            setSelectedTaskForAssignment(null);
            setAssignmentPresetUserId(undefined);
          }}
        />

        {assignmentNotice && (
          <div id="assignment-result" tabIndex={-1} role="status" aria-live="polite" className="free-pool-panel fixed bottom-4 left-4 z-40 flex flex-wrap items-center gap-3 rounded-[9px] border border-[var(--border)] bg-[var(--surface-raised)] p-3 text-xs text-[var(--text-primary)]">
            <span>{syncStatus === 'offline' ? 'Saved locally, pending sync' : assignmentNotice.member === 'Unassigned' ? 'Estimates saved' : 'Assignment saved'} · {assignmentNotice.member} · {assignmentNotice.destination}</span>
            <button type="button" className="button-secondary" onClick={() => {
              const task = tasks.find(item => item.id === assignmentNotice.taskId);
              if (task) handleEditTask(task);
              setAssignmentNotice(null);
            }}>View task</button>
            <button type="button" aria-label="Dismiss assignment confirmation" onClick={() => setAssignmentNotice(null)} className="icon-button"><X className="h-4 w-4" /></button>
          </div>
        )}
        {/* Undo Toast */}
        {undoToast && !activeDragInfo && (
          <div
            role="status"
            aria-live="polite"
            className="free-pool-panel fixed bottom-12 sm:bottom-4 left-4 z-40 flex items-center gap-2.5 rounded-[9px] border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-xs text-[var(--text-primary)] max-w-[calc(100vw-2rem)] sm:max-w-sm"
          >
            <span className="truncate font-medium">{undoToast.message}</span>
            <button
              type="button"
              onClick={async () => {
                const action = undoToast;
                setUndoToast(null);
                await action.undo().catch(err => {
                  setWorkspaceNotice(err instanceof Error ? err.message : 'Could not undo the last action. Check the task’s current state before trying again.');
                });
              }}
              className="inline-flex items-center gap-1 rounded-[5px] bg-[var(--accent-soft)] px-2 py-1 text-[11px] font-semibold text-[#1d4ed8] dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-500/25 shrink-0 cursor-pointer"
              style={{ minHeight: 'auto' }}
            >
              <RotateCcw className="h-3 w-3" />
              <span>Undo</span>
            </button>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => setUndoToast(null)}
              className="rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] shrink-0 cursor-pointer"
              style={{ minHeight: 'auto' }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Keyboard Shortcuts Reference Modal */}
        <AnimatePresence>
          {shortcutsOpen && (
            <div
              className="dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={e => {
                if (e.target === e.currentTarget) setShortcutsOpen(false);
              }}
            >
              <DialogPanel
                aria-label="Keyboard shortcuts"
                onClose={() => setShortcutsOpen(false)}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.15 }}
                onClick={e => e.stopPropagation()}
                className="w-full max-w-sm overflow-hidden"
              >
                <div className="dialog-header">
                  <div className="flex items-center gap-2">
                    <Keyboard className="h-4 w-4 text-[#1d4ed8] dark:text-blue-400" />
                    <h2 className="text-sm font-bold tracking-tight text-[var(--text-primary)]">Keyboard Shortcuts</h2>
                  </div>
                  <button
                    type="button"
                    aria-label="Close shortcuts"
                    onClick={() => setShortcutsOpen(false)}
                    className="icon-button shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <dl className="divide-y divide-[var(--border-subtle)] text-xs px-5 py-2">
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="text-[var(--text-secondary)]">Focus workspace search</dt>
                    <dd className="ledger-badge font-mono">/</dd>
                  </div>
                  {canCreatePipelineTask && (
                    <div className="flex items-center justify-between py-2.5">
                      <dt className="text-[var(--text-secondary)]">New pipeline brief</dt>
                      <dd className="ledger-badge font-mono">n</dd>
                    </div>
                  )}
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="text-[var(--text-secondary)]">Switch teams (All / Content / Design)</dt>
                    <dd className="ledger-badge font-mono">1 / 2 / 3</dd>
                  </div>
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="text-[var(--text-secondary)]">Toggle Free Pool</dt>
                    <dd className="ledger-badge font-mono">f</dd>
                  </div>
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="text-[var(--text-secondary)]">Open workspace analytics</dt>
                    <dd className="ledger-badge font-mono">a</dd>
                  </div>
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="text-[var(--text-secondary)]">Close active modal or popover</dt>
                    <dd className="ledger-badge font-mono">Esc</dd>
                  </div>
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="text-[var(--text-secondary)]">Open card details</dt>
                    <dd className="ledger-badge font-mono">Click title</dd>
                  </div>
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="text-[var(--text-secondary)]">Toggle shortcuts reference</dt>
                    <dd className="ledger-badge font-mono">?</dd>
                  </div>
                </dl>
              </DialogPanel>
            </div>
          )}
        </AnimatePresence>

        {/* Floating Drag-to-Delete Zone: Shown when a card is being dragged */}
        {activeDragInfo && (
          <div
            onDragOver={e => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setIsHoveringDeleteZone(true);
            }}
            onDragLeave={() => setIsHoveringDeleteZone(false)}
            onDrop={e => {
              e.preventDefault();
              setIsHoveringDeleteZone(false);
              if (activeDragInfo?.task) {
                handleRequestDeleteTask(activeDragInfo.task, activeDragInfo.sourceUserId);
                setActiveDragInfo(null);
              }
            }}
            className={`free-pool-panel fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-[9px] border transition-colors cursor-pointer select-none ${isHoveringDeleteZone
                ? 'bg-[var(--danger)] text-white border-[var(--danger)]'
                : 'bg-[var(--surface-raised)]/96 backdrop-blur-md text-red-700 dark:text-red-400 border-red-300 dark:border-red-500/40 hover:bg-red-50 dark:hover:bg-red-950/40'
              }`}
          >
            <Trash2 className="h-3.5 w-3.5 shrink-0" />
            <span className="text-xs font-semibold">Drop here to delete task</span>
          </div>
        )}
      </div>

      {/* Sign-In & Add-Member Modals */}
      <SignInModal
        isOpen={!currentUser || (loginModalOpen && !isNewAccountModal)}
        canDismiss={Boolean(currentUser)}
        onClose={() => setLoginModalOpen(false)}
      />
      <AddMemberModal
        isOpen={Boolean(currentUser && loginModalOpen && isNewAccountModal)}
        prefillMember={newMemberPrefill}
        onClose={() => {
          setLoginModalOpen(false);
          setNewMemberPrefill(null);
        }}
      />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <DashboardProvider>
        <DashboardContent />
      </DashboardProvider>
    </ErrorBoundary>
  );
}

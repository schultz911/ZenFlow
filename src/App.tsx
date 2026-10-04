import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { DashboardProvider, useDashboard } from './context/DashboardContext';
import { Header } from './components/Header';
import { OverviewBar } from './components/OverviewBar';
import { Swimlane } from './components/Swimlane';
import { LoginModal } from './components/LoginModal';
import { TaskModal } from './components/TaskModal';
import { WorkloadModal } from './components/WorkloadModal';
import { FirestoreModal } from './components/FirestoreModal';
import { DeleteUserModal } from './components/DeleteUserModal';
import { BillableHoursModal } from './components/BillableHoursModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MarqueeRibbon } from './components/MarqueeRibbon';
import { UnassignedListRibbon } from './components/UnassignedListRibbon';
import { EditUserModal } from './components/EditUserModal';
import { User, Task, TaskStatus } from './types';
import { UserPlus, FileText, Palette, Loader2 } from 'lucide-react';
import { testConnection } from './lib/firebase';

const EMPTY_TASKS: Task[] = [];

function DashboardContent() {
  useEffect(() => {
    // Validate Firestore connection on boot (as mandated by firebase-skill)
    testConnection();
  }, []);

  const {
    currentUser,
    isAuthChecking,
    users,
    tasks,
    activeRoleTab,
    activeDragInfo,
    setActiveDragInfo,
    moveTask,
    deleteTask,
    deleteUser,
    createTask,
    updateTask,
    adjustBillableHours,
    rescheduleTask,
    activeBoardId,
    showClickupPrompt,
    setShowClickupPrompt,
  } = useDashboard();

  // Modals state
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [isNewAccountModal, setIsNewAccountModal] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
  const [adjustBillableTask, setAdjustBillableTask] = useState<Task | null>(null);
  const [defaultTaskUserId, setDefaultTaskUserId] = useState<string | undefined>(undefined);
  const [defaultTaskStatus, setDefaultTaskStatus] = useState<TaskStatus | undefined>('todo');
  const [workloadModalUser, setWorkloadModalUser] = useState<User | null>(null);
  const [firestoreModalOpen, setFirestoreModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Stable refs for currentUser and users — allow keyboard effect and task modal handler to have empty dep arrays
  const currentUserRef = useRef(currentUser);
  const appUsersRef = useRef(users);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
  useEffect(() => { appUsersRef.current = users; }, [users]);

  // Task modal open handler — stabilized with empty deps; reads currentUser/users from refs
  const handleOpenAddTask = useCallback((userId?: string, status?: TaskStatus) => {
    setTaskToEdit(null);
    setDefaultTaskUserId(userId || currentUserRef.current?.id || appUsersRef.current[0]?.id);
    setDefaultTaskStatus(status || 'todo');
    setTaskModalOpen(true);
  }, []); // stable — reads from refs at call time

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

  // Filter users by role tab and active team board, and apply persistent custom ordering with current user pinned to top
  const roleFilteredUsers = useMemo(() => {
    let boardUsers = users;
    if (activeBoardId !== 'all') {
      boardUsers = users.filter(u => u.id === activeBoardId || u.creativeDirectorId === activeBoardId);
    }
    const filtered = boardUsers.filter(u => u.role === activeRoleTab);
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
  }, [users, activeRoleTab, customUserOrder, currentUser, activeBoardId]);

  const roleFilteredUsersRef = useRef(roleFilteredUsers);
  roleFilteredUsersRef.current = roleFilteredUsers;

  // Fast O(1) lookup map of user names for search queries
  const userNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of users) {
      map.set(u.id, u.name.toLowerCase());
    }
    return map;
  }, [users]);

  // Filter tasks by search query with deduplication - O(T + U) single pass
  const filteredTasks = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    if (!trimmed) return tasks;

    const map = new Map<string, Task>();
    for (const task of tasks) {
      if (!task || !task.id) continue;
      const matchesTitle = task.title.toLowerCase().includes(trimmed);
      const matchesDesc = task.description ? task.description.toLowerCase().includes(trimmed) : false;
      const userName = userNameMap.get(task.userId);
      const matchesUser = userName ? userName.includes(trimmed) : false;
      if (!matchesTitle && !matchesDesc && !matchesUser) continue;
      map.set(task.id, task);
    }
    return Array.from(map.values());
  }, [tasks, searchQuery, userNameMap]);

  const prevTasksByUserIdRef = useRef<Map<string, Task[]>>(new Map());

  // Partition tasks by userId with stable array references to prevent global Swimlane re-render cascades
  const tasksByUserId = useMemo(() => {
    const partitioned = new Map<string, Task[]>();
    for (const u of users) {
      partitioned.set(u.id, []);
    }
    for (const task of filteredTasks) {
      const userList = partitioned.get(task.userId);
      if (userList) {
        userList.push(task);
      } else {
        partitioned.set(task.userId, [task]);
      }
    }

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
  }, [users, filteredTasks]);

  // Global keyboard shortcut listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape: close all open modals
      if (e.key === 'Escape') {
        setLoginModalOpen(false);
        setTaskModalOpen(false);
        setWorkloadModalUser(null);
        setFirestoreModalOpen(false);
        setUserToDelete(null);
        setEditingUser(null);
        setAdjustBillableTask(null);
      }

      // Ctrl+N / Cmd+N: Quick create task
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleOpenAddTask();
      }

      // Ctrl+F / Cmd+F: Focus search input
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        const searchInput = document.getElementById('task-search-input') as HTMLInputElement | null;
        if (searchInput) {
          e.preventDefault();
          searchInput.focus();
          searchInput.select();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // stable — handleOpenAddTask reads from refs; Escape closures over stable setters

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

  const handleOpenNewUser = useCallback(() => {
    setIsNewAccountModal(true);
    setLoginModalOpen(true);
  }, []);

  const handleOpenWorkloadModal = useCallback((u: User) => {
    setWorkloadModalUser(u);
  }, []);

  const handleOpenDeleteUser = useCallback((u: User) => {
    setUserToDelete(u);
  }, []);

  const handleDragTaskStart = useCallback(
    (draggedTask: Task) => {
      setActiveDragInfo({
        taskId: draggedTask.id,
        sourceUserId: draggedTask.userId,
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
  }, [setActiveDragInfo]);

  const handleQuickAddTask = useCallback(
    async (
      userId: string,
      title: string,
      status: TaskStatus,
      cognitiveLoad: 'low' | 'medium' | 'high',
      dueDate?: string
    ) => {
      await createTask({ userId, title, status, cognitiveLoad, dueDate });
    },
    [createTask]
  );

  const handleRescheduleTask = useCallback(
    async (taskId: string, newDueDate: string | undefined) => {
      await rescheduleTask(taskId, newDueDate);
    },
    [rescheduleTask]
  );

  const handleUpdateTaskTitle = useCallback(
    async (taskId: string, newTitle: string) => {
      await updateTask(taskId, { title: newTitle });
    },
    [updateTask]
  );

  const handleMoveUserUp = useCallback((userId: string) => {
    // Current user account is pinned to the top and cannot be reordered
    if (userId === currentUserRef.current?.id) return;

    setCustomUserOrder(prev => {
      const currentList = roleFilteredUsersRef.current.map(u => u.id);
      const idx = currentList.indexOf(userId);
      const isPinnedTop = currentList[0] === currentUserRef.current?.id;
      const minIndex = isPinnedTop ? 2 : 1;
      if (idx < minIndex) return prev;

      const nextList = [...currentList];
      const temp = nextList[idx - 1];
      nextList[idx - 1] = nextList[idx];
      nextList[idx] = temp;
      try {
        localStorage.setItem('zenflow_user_order_v1', JSON.stringify(nextList));
      } catch {}
      return nextList;
    });
  }, []);

  const handleMoveUserDown = useCallback((userId: string) => {
    // Current user account is pinned to the top and cannot be reordered
    if (userId === currentUserRef.current?.id) return;

    setCustomUserOrder(prev => {
      const currentList = roleFilteredUsersRef.current.map(u => u.id);
      const idx = currentList.indexOf(userId);
      if (idx === -1 || idx >= currentList.length - 1) return prev;

      const nextList = [...currentList];
      const temp = nextList[idx + 1];
      nextList[idx + 1] = nextList[idx];
      nextList[idx] = temp;
      try {
        localStorage.setItem('zenflow_user_order_v1', JSON.stringify(nextList));
      } catch {}
      return nextList;
    });
  }, []);

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-4 selection:bg-blue-500/30 selection:text-white">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 shadow-xl shadow-blue-500/20">
            <span className="font-bold text-2xl text-white tracking-wider">ZF</span>
            <div className="absolute inset-0 rounded-2xl border border-white/20 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">zenFlow</h1>
            <p className="text-xs text-white/40 mt-1">Verifying Google authentication session...</p>
          </div>
          <Loader2 className="w-5 h-5 text-blue-500 animate-spin mt-2" />
        </div>
      </div>
    );
  }

  const isLoginOpen = !currentUser || loginModalOpen;

  return (
    <>
      <div className={`min-h-screen bg-neutral-50 dark:bg-[#0A0A0A] text-neutral-900 dark:text-[#E5E5E5] font-sans antialiased selection:bg-blue-500/30 selection:text-white transition-colors relative ${!currentUser ? 'overflow-hidden pointer-events-none select-none filter blur-[2px]' : ''}`}>
        {/* Sticky Header */}
        <Header
        onOpenLoginModal={handleOpenLogin}
        onOpenNewUserModal={handleOpenNewUser}
        onOpenFirestoreModal={() => setFirestoreModalOpen(true)}
      />

      {/* Pinned Ribbons — sticky just below the header */}
      <div className="sticky top-16 sm:top-20 z-20 w-full">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-2 space-y-1.5">
          <MarqueeRibbon
            tasks={tasks}
            users={users}
            onTaskClick={handleEditTask}
          />
          <UnassignedListRibbon
            tasks={tasks}
            users={users}
            onTaskClick={handleEditTask}
          />
        </div>
      </div>

      {/* Main Container */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">

        {/* Overview Bar */}
        <OverviewBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        {/* User Swimlanes List */}
        {roleFilteredUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-neutral-200 dark:border-white/5 bg-white dark:bg-[#0D0D0D] p-12 text-center shadow-sm dark:shadow-2xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100 dark:bg-[#141414] border border-neutral-200 dark:border-white/5 text-neutral-500 dark:text-white/50 mb-3">
              {activeRoleTab === 'content' ? (
                <FileText className="h-6 w-6 text-blue-500" />
              ) : (
                <Palette className="h-6 w-6 text-indigo-500" />
              )}
            </div>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white capitalize">
              No members in {activeRoleTab} yet
            </h3>
            <p className="mt-1 text-xs text-neutral-500 dark:text-white/40 max-w-sm">
              Add a new member with the {activeRoleTab} role to generate their dedicated swimlane.
            </p>
            <button
              onClick={handleOpenNewUser}
              className="mt-4 flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition-colors shadow-md shadow-blue-900/20"
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span className="capitalize">Add {activeRoleTab} Member</span>
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {roleFilteredUsers.map((user, index) => {
              const isCurrent = currentUser?.id === user.id;
              const hasPinnedTop = roleFilteredUsers[0]?.id === currentUser?.id;
              const canMoveUp = !isCurrent && (hasPinnedTop ? index > 1 : index > 0);
              const canMoveDown = !isCurrent && index < roleFilteredUsers.length - 1;

              return (
                <Swimlane
                  key={user.id}
                  user={user}
                  tasks={tasksByUserId.get(user.id) || EMPTY_TASKS}
                  activeDragInfo={activeDragInfo}
                  onDragTaskStart={handleDragTaskStart}
                  onDragTaskEnd={handleDragTaskEnd}
                  onAddTask={handleOpenAddTask}
                  onQuickAddTask={handleQuickAddTask}
                  onEditTask={handleEditTask}
                  onRescheduleTask={handleRescheduleTask}
                  onAdjustBillableHours={handleOpenAdjustBillableHours}
                  onUpdateTaskTitle={handleUpdateTaskTitle}
                  onDeleteTask={deleteTask}
                  onEditUser={setEditingUser}
                  onDeleteUser={handleOpenDeleteUser}
                  onMoveTask={moveTask}
                  onOpenWorkloadModal={handleOpenWorkloadModal}
                  isCurrentUser={isCurrent}
                  onMoveUserUp={handleMoveUserUp}
                  onMoveUserDown={handleMoveUserDown}
                  canMoveUp={canMoveUp}
                  canMoveDown={canMoveDown}
                />
              );
            })}
          </div>
        )}
      </main>

      {/* Workspace Modals */}
      <TaskModal
        isOpen={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        taskToEdit={currentTaskToEdit}
        defaultUserId={defaultTaskUserId}
        defaultStatus={defaultTaskStatus}
        onAdjustBillableHours={handleOpenAdjustBillableHours}
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
      />

      <DeleteUserModal
        isOpen={Boolean(userToDelete)}
        user={userToDelete}
        tasks={tasks}
        onClose={() => setUserToDelete(null)}
        onConfirmDelete={deleteUser}
      />

      <FirestoreModal
        isOpen={firestoreModalOpen || showClickupPrompt}
        onClose={() => {
          setFirestoreModalOpen(false);
          setShowClickupPrompt(false);
        }}
      />

      <EditUserModal
        isOpen={Boolean(editingUser)}
        user={editingUser}
        onClose={() => setEditingUser(null)}
      />
    </div>

    {/* Login & Auth Modal — always rendered crisp on top of the frosted board */}
    <LoginModal
      isOpen={isLoginOpen}
      onClose={() => setLoginModalOpen(false)}
      isNewAccountOnly={currentUser ? isNewAccountModal : false}
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

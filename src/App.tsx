import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { DashboardProvider, useDashboard } from './context/DashboardContext';
import { Header } from './components/Header';
import { OverviewBar } from './components/OverviewBar';
import { Swimlane } from './components/Swimlane';
import { LoginModal } from './components/LoginModal';
import { TaskModal } from './components/TaskModal';
import { WorkloadModal } from './components/WorkloadModal';
import { FirestoreModal } from './components/FirestoreModal';
import { DeleteUserModal } from './components/DeleteUserModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { User, Task, TaskStatus } from './types';
import { UserPlus, FileText, Palette } from 'lucide-react';
import { testConnection } from './lib/firebase';

const EMPTY_TASKS: Task[] = [];

function DashboardContent() {
  useEffect(() => {
    // Validate Firestore connection on boot (as mandated by firebase-skill)
    testConnection();
  }, []);

  const {
    currentUser,
    users,
    tasks,
    activeRoleTab,
    activeDragInfo,
    setActiveDragInfo,
    moveTask,
    deleteTask,
    deleteUser,
  } = useDashboard();

  // Modals state
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [isNewAccountModal, setIsNewAccountModal] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
  const [defaultTaskUserId, setDefaultTaskUserId] = useState<string | undefined>(undefined);
  const [defaultTaskStatus, setDefaultTaskStatus] = useState<TaskStatus | undefined>('todo');
  const [workloadModalUser, setWorkloadModalUser] = useState<User | null>(null);
  const [firestoreModalOpen, setFirestoreModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');

  // Filter users by role tab
  const roleFilteredUsers = useMemo(() => {
    return users.filter(u => u.role === activeRoleTab);
  }, [users, activeRoleTab]);

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
  }, [currentUser, users]);

  // Task modal handlers
  const handleOpenAddTask = useCallback((userId?: string, status?: TaskStatus) => {
    setTaskToEdit(null);
    setDefaultTaskUserId(userId || currentUser?.id || users[0]?.id);
    setDefaultTaskStatus(status || 'todo');
    setTaskModalOpen(true);
  }, [currentUser?.id, users]);

  const handleEditTask = useCallback((task: Task) => {
    setTaskToEdit(task);
    setTaskModalOpen(true);
  }, []);

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
      });
    },
    [setActiveDragInfo]
  );

  const handleDragTaskEnd = useCallback(() => {
    setActiveDragInfo(null);
  }, [setActiveDragInfo]);

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-[#0A0A0A] text-neutral-900 dark:text-[#E5E5E5] font-sans antialiased selection:bg-blue-500/30 selection:text-white transition-colors">
      {/* Sticky Top Header */}
      <Header
        onOpenLoginModal={handleOpenLogin}
        onOpenNewUserModal={handleOpenNewUser}
        onOpenFirestoreModal={() => setFirestoreModalOpen(true)}
      />

      {/* Main Container */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Overview Bar */}
        <OverviewBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onOpenNewTaskModal={() => handleOpenAddTask()}
          onOpenNewUserModal={handleOpenNewUser}
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
            {roleFilteredUsers.map(user => (
              <Swimlane
                key={user.id}
                user={user}
                tasks={tasksByUserId.get(user.id) || EMPTY_TASKS}
                activeDragInfo={activeDragInfo}
                onDragTaskStart={handleDragTaskStart}
                onDragTaskEnd={handleDragTaskEnd}
                onAddTask={handleOpenAddTask}
                onEditTask={handleEditTask}
                onDeleteTask={deleteTask}
                onDeleteUser={handleOpenDeleteUser}
                onMoveTask={moveTask}
                onOpenWorkloadModal={handleOpenWorkloadModal}
                isCurrentUser={currentUser?.id === user.id}
              />
            ))}
          </div>
        )}
      </main>

      {/* Modals */}
      <LoginModal
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        isNewAccountOnly={isNewAccountModal}
      />

      <TaskModal
        isOpen={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        taskToEdit={taskToEdit}
        defaultUserId={defaultTaskUserId}
        defaultStatus={defaultTaskStatus}
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
        isOpen={firestoreModalOpen}
        onClose={() => setFirestoreModalOpen(false)}
      />
    </div>
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

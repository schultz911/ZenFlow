import React, { useState, useMemo, useEffect } from 'react';
import { DashboardProvider, useDashboard } from './context/DashboardContext';
import { Header } from './components/Header';
import { OverviewBar } from './components/OverviewBar';
import { Swimlane } from './components/Swimlane';
import { LoginModal } from './components/LoginModal';
import { TaskModal } from './components/TaskModal';
import { WorkloadModal } from './components/WorkloadModal';
import { FirestoreModal } from './components/FirestoreModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { User, Task, TaskStatus } from './types';
import { UserPlus, FileText, Palette } from 'lucide-react';
import { testConnection } from './lib/firebase';

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
    moveTask,
    deleteTask,
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

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');

  // Filter users by role tab
  const roleFilteredUsers = useMemo(() => {
    return users.filter(u => u.role === activeRoleTab);
  }, [users, activeRoleTab]);

  // Filter tasks by search query
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = task.title.toLowerCase().includes(q);
        const matchesDesc = task.description ? task.description.toLowerCase().includes(q) : false;
        const taskUser = users.find(u => u.id === task.userId);
        const matchesUser = taskUser ? taskUser.name.toLowerCase().includes(q) : false;
        return matchesTitle || matchesDesc || matchesUser;
      }

      return true;
    });
  }, [tasks, searchQuery, users]);

  // Task modal handlers
  const handleOpenAddTask = (userId?: string, status?: TaskStatus) => {
    setTaskToEdit(null);
    setDefaultTaskUserId(userId || currentUser?.id || users[0]?.id);
    setDefaultTaskStatus(status || 'todo');
    setTaskModalOpen(true);
  };

  const handleEditTask = (task: Task) => {
    setTaskToEdit(task);
    setTaskModalOpen(true);
  };

  const handleOpenLogin = () => {
    setIsNewAccountModal(false);
    setLoginModalOpen(true);
  };

  const handleOpenNewUser = () => {
    setIsNewAccountModal(true);
    setLoginModalOpen(true);
  };

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
                tasks={filteredTasks}
                onAddTask={(uid, status) => handleOpenAddTask(uid, status)}
                onEditTask={handleEditTask}
                onDeleteTask={deleteTask}
                onMoveTask={moveTask}
                onOpenWorkloadModal={u => setWorkloadModalUser(u)}
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

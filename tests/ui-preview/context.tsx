import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Role, Task, User } from '../../src/types';

const date = new Date().toISOString();
const deadline = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10);
const fixtureUsers: User[] = [
  { id: 'preview-root', name: 'Alex Morgan', email: 'kiran.s@zensciences.com', role: 'content', isCreativeDirector: true, isAdministrator: true, createdAt: date, avatarColor: 'from-blue-600 to-indigo-600' },
  { id: 'preview-content', name: 'Sam Chen', email: 'sam@example.invalid', role: 'content', creativeDirectorId: 'preview-root', createdAt: date, avatarColor: 'from-teal-600 to-cyan-600' },
  { id: 'preview-design', name: 'Jordan Lee', email: 'jordan@example.invalid', role: 'design', creativeDirectorId: 'preview-root', createdAt: date },
];
const fixtureTasks: Task[] = [
  ...(['todo', 'in_progress', 'in_review', 'done'] as const).map((status, index) => ({
    id: `preview-task-${index}`, userId: 'preview-root', team: 'content' as Role,
    title: ['Write launch messaging', 'Refine the product narrative', 'Review campaign concepts', 'Publish editorial guidelines'][index],
    status, cognitiveLoad: 'medium' as const, order: index, dueDate: deadline,
    client: 'Acme Studio', project: 'Brand launch', estimatedHours: 8,
    inProgressDurationMs: 3 * 3600000, createdAt: date, updatedAt: date,
  })),
  { id: 'preview-pipeline', team: 'content', title: 'Prepare a content strategy for the next quarter', status: 'pipeline', cognitiveLoad: 'high', priority: 'high', order: 0, client: 'Acme Studio', project: 'Growth', createdAt: date, updatedAt: date },
];
const noop = async () => {};
const yes = () => true;
const Context = createContext<any>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const params = new URLSearchParams(location.search);
  const [darkMode, setDarkMode] = useState(params.get('theme') !== 'light');
  const [activeRoleTab, setActiveRoleTab] = useState<Role>('content');
  const [activeBoardId, setActiveBoardId] = useState('all');
  const [activeDragInfo, setActiveDragInfo] = useState(null);
  const [tasks, setTasks] = useState(fixtureTasks);
  const [users, setUsers] = useState(fixtureUsers);
  const superadmin = !params.has('member');
  useEffect(() => { document.documentElement.classList.toggle('dark', darkMode); }, [darkMode]);
  const value = {
    currentUser: users[superadmin ? 0 : 1], users, tasks, darkMode, setDarkMode, activeRoleTab, setActiveRoleTab,
    activeBoardId, setActiveBoardId, activeDragInfo, setActiveDragInfo, syncStatus: 'connected', isAuthChecking: false,
    isSuperadmin: superadmin, isAdministrator: superadmin, isCreativeDirector: superadmin, canManageMembers: superadmin,
    canSwitchBoards: superadmin, canCreatePipelineTask: superadmin, canAssignTask: superadmin,
    canManageUser: yes, canEditUserTasks: yes, creativeDirectors: [fixtureUsers[0]], clusterLeads: [],
    firestoreStatus: { mode: 'admin', serviceAccountFound: true, projectId: 'isolated-ui-fixture', databaseId: '(default)' },
    refreshFirestoreStatus: noop, syncWithFirestore: async () => ({ success: true, message: 'Fixture sync complete' }),
    fetchAuditLogs: async () => [], downloadAuditLogs: noop, logout: noop, setAuthError: noop,
    purgeAllDatabaseData: async () => {
      await new Promise(resolve => setTimeout(resolve, 250));
      if (params.has('error')) throw new Error('Preview failure: retry is available.');
      const deletedTaskCount = tasks.length;
      setTasks([]); setUsers([fixtureUsers[0]]);
      return { success: true, message: 'Fixture purge complete', deletedTaskCount, deletedUserCount: 2 };
    },
    updateTask: async (id: string, updates: Partial<Task>) => setTasks(previous => previous.map(task => task.id === id ? { ...task, ...updates } : task)),
    createTask: noop, createUser: noop, deleteTask: noop, deleteUser: noop, moveTask: noop, adjustBillableHours: noop,
    rescheduleTask: noop, duplicateTaskToBoard: noop, loginWithGoogle: noop,
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useDashboard = () => useContext(Context);

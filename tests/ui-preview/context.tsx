import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Task, User } from '../../src/types';
import { applyOptimisticTaskUpdate } from '../../src/domain/taskTransitions';

const dayIso = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const recentStartIso = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3600_000).toISOString();

export const fixtureUsers: User[] = [
  { id: 'cd-1', name: 'Kiran S', email: 'kiran.s@zensciences.com', role: 'content', avatarColor: 'from-blue-700 to-blue-800', isCreativeDirector: true, isAdministrator: true, createdAt: '2026-10-01T00:00:00Z' },
  { id: 'u-content', name: 'Ava Writer', email: 'ava@zensciences.com', role: 'content', avatarColor: 'from-emerald-700 to-emerald-800', creativeDirectorId: 'cd-1', createdAt: '2026-10-01T00:00:00Z' },
  { id: 'u-design', name: 'Mia Designer', email: 'mia@zensciences.com', role: 'design', avatarColor: 'from-slate-700 to-slate-800', creativeDirectorId: 'cd-1', createdAt: '2026-10-01T00:00:00Z' },
  { id: 'u-acct', name: 'Sam Account', email: 'sam@zensciences.com', role: 'account_manager', avatarColor: 'from-amber-600 to-amber-700', isAccountManager: true, creativeDirectorId: 'cd-1', createdAt: '2026-10-01T00:00:00Z' },
];

export const fixtureTasks: Task[] = [
  { id: 't-pipe-content', team: 'content', title: 'Q4 Brand Narrative (Content)', description: 'Shared Q4 campaign brief across content and design.', brandGuidelines: 'https://brand.example.com/guidelines', cognitiveLoad: 'medium', status: 'pipeline', order: 0, priority: 'high', client: 'Zen', project: 'Brand Refresh', estimatedHours: 6, parentTaskId: 'parent-1', parentTaskTitle: 'Q4 Brand Narrative', disciplineMetadata: { contentType: 'Article', contentSpecifications: '1200 words, executive tone', sourceContentReferences: ['https://example.com/brief'] }, createdAt: recentStartIso(48), updatedAt: recentStartIso(12) },
  { id: 't-pipe-design', team: 'design', title: 'Q4 Brand Narrative (Design)', description: 'Shared Q4 campaign brief across content and design.', brandGuidelines: 'https://brand.example.com/guidelines', cognitiveLoad: 'medium', status: 'pipeline', order: 1, priority: 'medium', client: 'Zen', project: 'Brand Refresh', estimatedHours: 8, parentTaskId: 'parent-1', parentTaskTitle: 'Q4 Brand Narrative', disciplineMetadata: { assetType: 'Carousel', designSpecifications: '6 slides 1080x1350', brandAssetsReferences: ['https://figma.com/file/demo'] }, createdAt: recentStartIso(48), updatedAt: recentStartIso(12) },
  { id: 't-kiran-1', userId: 'cd-1', assigneeIds: ['cd-1'], team: 'content', title: 'Executive Launch Deck Review', client: 'NovaPay', project: 'Series B', cognitiveLoad: 'medium', status: 'in_progress', order: 0, dueDate: dayIso(1), startDate: dayIso(-1), estimatedHours: 5, inProgressStartedAt: recentStartIso(1.5), inProgressDurationMs: 2 * 3600_000, createdAt: recentStartIso(30), updatedAt: recentStartIso(1) },
  { id: 't-kiran-2', userId: 'cd-1', assigneeIds: ['cd-1'], team: 'content', title: 'Partner Summit Script Outline', client: 'Apex Cloud', project: 'Keynote', cognitiveLoad: 'high', status: 'todo', order: 0, dueDate: dayIso(2), startDate: dayIso(0), estimatedHours: 6, createdAt: recentStartIso(24), updatedAt: recentStartIso(6) },
  { id: 't-kiran-3', userId: 'cd-1', assigneeIds: ['cd-1'], team: 'content', title: 'Q3 Case Study Editorial Sign-Off', client: 'VeloAI', project: 'Growth', cognitiveLoad: 'low', status: 'in_review', order: 0, dueDate: dayIso(3), startDate: dayIso(-2), estimatedHours: 3, inProgressDurationMs: 2.5 * 3600_000, createdAt: recentStartIso(50), updatedAt: recentStartIso(3) },
  { id: 't-active', userId: 'u-content', assigneeIds: ['u-content'], team: 'content', title: 'Homepage Narrative Rewrite', description: 'Refresh hero and CTA copy', client: 'NovaPay', project: 'Web Refresh', cognitiveLoad: 'high', status: 'in_progress', order: 0, dueDate: dayIso(-1), startDate: dayIso(-3), estimatedHours: 6, inProgressStartedAt: recentStartIso(1), inProgressDurationMs: 4 * 3600_000, createdAt: recentStartIso(72), updatedAt: recentStartIso(1) },
  { id: 't-ava-2', userId: 'u-content', assigneeIds: ['u-content'], team: 'content', title: 'Enterprise Security Whitepaper', client: 'Apex Cloud', project: 'Demand Gen', cognitiveLoad: 'high', status: 'in_progress', order: 1, dueDate: dayIso(0), startDate: dayIso(-2), estimatedHours: 8, inProgressStartedAt: recentStartIso(0.5), inProgressDurationMs: 5 * 3600_000, createdAt: recentStartIso(48), updatedAt: recentStartIso(1) },
  { id: 't-ava-3', userId: 'u-content', assigneeIds: ['u-content'], team: 'content', title: 'Product Architecture Blog Series', client: 'VeloAI', project: 'Launch', cognitiveLoad: 'high', status: 'todo', order: 0, dueDate: dayIso(1), startDate: dayIso(0), estimatedHours: 6, createdAt: recentStartIso(24), updatedAt: recentStartIso(2) },
  { id: 't-ava-4', userId: 'u-content', assigneeIds: ['u-content'], team: 'content', title: 'Analyst Briefing Messaging Pack', client: 'Zen', project: 'PR', cognitiveLoad: 'high', status: 'todo', order: 1, dueDate: dayIso(1), startDate: dayIso(0), estimatedHours: 5, createdAt: recentStartIso(20), updatedAt: recentStartIso(2) },
  { id: 't-ava-5', userId: 'u-content', assigneeIds: ['u-content'], team: 'content', title: 'Customer Onboarding Email Flow', client: 'NovaPay', project: 'Lifecycle', cognitiveLoad: 'high', status: 'in_progress', order: 2, dueDate: dayIso(1), startDate: dayIso(0), estimatedHours: 4, inProgressStartedAt: recentStartIso(0.5), inProgressDurationMs: 2 * 3600_000, createdAt: recentStartIso(18), updatedAt: recentStartIso(1) },
];

const PreviewContext = createContext<any>(null);

export const DashboardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [users] = useState<User[]>(fixtureUsers);
  const [tasks, setTasks] = useState<Task[]>(fixtureTasks);
  const [activeRoleTab, setActiveRoleTab] = useState<'all' | 'content' | 'design'>('all');
  const [activeBoardId, setActiveBoardId] = useState<string>('all');
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const theme = new URLSearchParams(window.location.search).get('theme');
    return theme === 'dark';
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);
  const [activeDragInfo, setActiveDragInfo] = useState<any>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const currentUser = fixtureUsers[0];
  const yes = () => true;
  const noopAsync = async () => ({});

  const value = {
    currentUser,
    users,
    tasks,
    accessRequests: [],
    dismissAccessRequest: noopAsync,
    creativeDirectors: [fixtureUsers[0]],
    clusterLeads: [],
    activeRoleTab,
    setActiveRoleTab,
    activeBoardId,
    setActiveBoardId,
    darkMode,
    setDarkMode,
    syncStatus: 'connected' as const,
    isLoading: false,
    firestoreStatus: { connected: true, mode: 'admin' as const, projectId: 'zenflow-preview', databaseId: '(default)', serviceAccountFound: true, totalUsers: fixtureUsers.length, totalTasks: fixtureTasks.length, lastError: null },
    activeDragInfo,
    setActiveDragInfo,
    refreshFirestoreStatus: noopAsync,
    isAuthChecking: false,
    authError,
    setAuthError,
    accessRequestNotice: null,
    setAccessRequestNotice: () => {},
    syncWithFirestore: async () => ({ success: true, message: 'ok' }),
    purgeAllDatabaseData: async () => ({ success: true, message: 'ok', deletedTaskCount: 0, deletedUserCount: 0 }),
    loginWithGoogle: async () => currentUser,
    logout: () => {},
    createUser: async (d: any) => ({ ...d, id: `u-${Date.now()}`, avatarColor: 'from-blue-500 to-cyan-500', createdAt: new Date().toISOString() }),
    updateUserProfile: async (id: string, u: any) => ({ ...fixtureUsers[0], id, ...u }),
    remapUserTasks: async () => ({ success: true, remappedCount: 0 }),
    deleteUser: noopAsync,
    isSuperadmin: true,
    isAdministrator: true,
    isBusinessLead: true,
    isCreativeDirector: true,
    isClusterLead: false,
    isTeamLead: true,
    isAccountManager: true,
    canManageMembers: true,
    canCreatePipelineTask: true,
    canAssignTask: true,
    canManageUser: yes,
    canEditUserTasks: yes,
    canSwitchBoards: true,
    isZensciencesUser: true,
    isClickupConnected: true,
    clickupMembers: [],
    loadClickupMembers: async () => [],
    clickupSpaces: [{ id: 'sp-1', name: 'ZenClient', private: false }],
    selectedClickupSpaceId: 'sp-1',
    spaceFoldersAndListsMap: { 'sp-1': { folders: [{ id: 'f-1', name: 'Campaigns', lists: [{ id: 'l-1', name: 'Q4 Launch' }] }], folderlessLists: [] } },
    getFoldersAndListsForSpace: async () => ({ folders: [{ id: 'f-1', name: 'Campaigns', lists: [{ id: 'l-1', name: 'Q4 Launch' }] }], folderlessLists: [] }),
    connectClickup: async () => ({ success: true }),
    disconnectClickup: () => {},
    setSelectedClickupSpaceId: noopAsync,
    createClickupSpace: async (name: string) => ({ id: 'sp-new', name, private: false }),
    createClickupList: async (name: string) => ({ id: 'l-new', name }),
    syncUserTasksWithClickUp: async () => ({ success: true, syncedCount: 0, archivedCount: 0, message: 'ok' }),
    clickupCustomFieldOptions: [{ id: 'opt-1', name: 'Campaign' }],
    clickupTaskTypeFieldId: 'cf-1',
    isLoadingTaskTypes: false,
    fetchClickupCustomFields: async () => [{ id: 'opt-1', name: 'Campaign' }],
    clickupWebhookStatus: { registered: true, webhookId: 'wh-1', totalEventsCount: 0, endpointUrl: '/api/clickup/webhook' },
    refreshClickupWebhookStatus: noopAsync,
    registerClickupWebhook: async () => ({ success: true, message: 'ok' }),
    fetchAuditLogs: async () => [],
    downloadAuditLogs: () => {},
    createPipelineBundle: async (data: any) => {
      const pid = `parent-${Date.now()}`;
      const created: Task[] = data.disciplines.map((disc: 'content' | 'design', i: number) => ({
        id: `t-${Date.now()}-${disc}-${i}`,
        team: disc,
        title: data.disciplines.length > 1 ? `${data.title} (${disc === 'content' ? 'Content' : 'Design'})` : data.title,
        description: data.description,
        brandGuidelines: data.brandGuidelines,
        cognitiveLoad: 'medium' as const,
        status: 'pipeline' as const,
        order: i,
        priority: data.priority || 'medium',
        parentTaskId: pid,
        parentTaskTitle: data.title,
        disciplineMetadata: data.disciplineSpecs?.[disc],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
      setTasks(prev => [...prev, ...created]);
      return { parentTask: { id: pid, title: data.title }, tasks: created };
    },
    createTask: async (data: any) => {
      const created: Task = { ...data, id: `t-${Date.now()}`, status: data.status || 'todo', order: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      setTasks(prev => [...prev, created]);
      return created;
    },
    updateTask: async (id: string, updates: any) => {
      let result: Task = fixtureTasks[0];
      setTasks(prev => {
        const next = applyOptimisticTaskUpdate(prev, id, updates);
        result = next.find(t => t.id === id) || fixtureTasks[0];
        return next;
      });
      return result;
    },
    adjustBillableHours: async (id: string, ms: number) => {
      let result: Task = fixtureTasks[0];
      setTasks(prev => prev.map(t => (t.id === id ? (result = { ...t, inProgressDurationMs: ms }) : t)));
      return result;
    },
    deleteTask: async (id: string) => setTasks(prev => prev.filter(t => t.id !== id)),
    removeAssigneeOrDeleteTask: async (id: string) => setTasks(prev => prev.filter(t => t.id !== id)),
    shareTaskWithUser: async (id: string) => fixtureTasks.find(t => t.id === id) || fixtureTasks[0],
    reassignTaskFromUser: async (id: string) => fixtureTasks.find(t => t.id === id) || fixtureTasks[0],
    moveTask: async () => {},
    reorderTasks: async () => {},
    duplicateTaskToBoard: async () => ({ task: fixtureTasks[0] }),
  };

  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
};

export const useAuth = () => useContext(PreviewContext);
export const useWorkspace = () => useContext(PreviewContext);
export const useClickUp = () => useContext(PreviewContext);
export const useBoardUi = () => useContext(PreviewContext);

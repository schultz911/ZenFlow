import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { exportWorkspaceXLS, exportWorkspaceJSON, getTaskBillableMs, IN_REVIEW_HOURLY_RATES } from '../utils/workload';
import { Task } from '../types';
import {
  Search,
  Plus,
  UserPlus,
  Download,
  AlertTriangle,
  FileSpreadsheet,
  FileCode,
} from 'lucide-react';

interface OverviewBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenNewTaskModal: () => void;
  onOpenNewUserModal: () => void;
}

// Lightweight score: computes only the raw workload number without allocating items[], labels, or proximity data
// Used exclusively for OverviewBar analytics — swimlanes use the full calculateUserWorkload separately
function quickWorkloadScore(userTasks: Task[]): number {
  let score = 0;
  for (const t of userTasks) {
    if (t.status === 'pipeline' || t.status === 'done' || t.status === 'archived') continue;
    if (t.status === 'in_review') {
      const rate = IN_REVIEW_HOURLY_RATES[t.cognitiveLoad] ?? 0.2;
      const billableHours = getTaskBillableMs(t) / (1000 * 60 * 60);
      score += billableHours * rate;
    } else {
      const cw = t.cognitiveLoad === 'high' ? 3 : t.cognitiveLoad === 'medium' ? 2 : 1;
      const sw = t.status === 'in_progress' ? 1 : (t.dueDate ? 1 : 0.5);
      score += sw * cw;
    }
  }
  return Math.round(score * 10) / 10;
}

export const OverviewBar: React.FC<OverviewBarProps> = ({
  searchQuery,
  onSearchChange,
  onOpenNewTaskModal,
  onOpenNewUserModal,
}) => {
  const { activeRoleTab, users, tasks } = useDashboard();
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Close export menu when clicking outside
  useEffect(() => {
    if (!showExportMenu) return;
    const handleOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showExportMenu]);

  // Synchronize local search state with parent
  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  // Debounce search updates to avoid redundant layout calculations on rapid typing
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== searchQuery) {
        onSearchChange(localSearch);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [localSearch, onSearchChange, searchQuery]);

  // Filter users by active tab
  const displayedUsers = useMemo(
    () => users.filter(u => u.role === activeRoleTab),
    [users, activeRoleTab]
  );

  // Calculate workload analytics & overload counts using indexed lookup (O(U+T))
  const { avgWorkload, overloadedMembersCount } = useMemo(() => {
    if (displayedUsers.length === 0) return { avgWorkload: 0, overloadedMembersCount: 0 };
    const tasksByUser = new Map<string, typeof tasks>();
    for (const t of tasks) {
      const arr = tasksByUser.get(t.userId);
      if (arr) arr.push(t);
      else tasksByUser.set(t.userId, [t]);
    }

    let overloaded = 0;
    const totalScores = displayedUsers.map(u => {
      const uTasks = tasksByUser.get(u.id) || [];
      const score = quickWorkloadScore(uTasks);
      if (score >= 12.0) overloaded++;
      return score;
    });

    const avg = Math.round((totalScores.reduce((a, b) => a + b, 0) / totalScores.length) * 10) / 10;
    return { avgWorkload: avg, overloadedMembersCount: overloaded };
  }, [displayedUsers, tasks]);

  // Single-pass computation for in_progress and todo counts filtered by active team role tab (O(U+T))
  const { inProgressCount, todoCount } = useMemo(() => {
    const userRoleMap = new Map(users.map(u => [u.id, u.role]));
    let inProgress = 0;
    let todo = 0;
    for (const t of tasks) {
      if (userRoleMap.get(t.userId) === activeRoleTab) {
        if (t.status === 'in_progress') inProgress++;
        else if (t.status === 'todo') todo++;
      }
    }
    return { inProgressCount: inProgress, todoCount: todo };
  }, [users, tasks, activeRoleTab]);

  return (
    <div className="mb-6 space-y-4">
      {/* Top Banner: Metrics & Team Velocity */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-neutral-200 dark:border-white/5 bg-white dark:bg-[#0D0D0D] p-5 sm:px-6 shadow-sm dark:shadow-2xl transition-colors">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white capitalize">
              {activeRoleTab === 'content' ? 'Content' : 'Design'}
            </h1>
            <span className="rounded-full bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 px-2.5 py-0.5 text-xs text-neutral-600 dark:text-white/50">
              {displayedUsers.length} {displayedUsers.length === 1 ? 'member' : 'members'}
            </span>

            {/* Cognitive Overload Threshold Alert Badge */}
            {overloadedMembersCount > 0 && (
              <span
                title={`${overloadedMembersCount} team member(s) exceed 12-point workload capacity.`}
                className="inline-flex items-center gap-1 rounded-full bg-red-500/10 border border-red-500/30 px-2.5 py-0.5 text-xs font-semibold text-red-500 dark:text-red-400 animate-pulse"
              >
                <AlertTriangle className="h-3 w-3" />
                <span>{overloadedMembersCount} Overloaded</span>
              </span>
            )}
          </div>
        </div>

        {/* Team Aggregate Badges with Add Member and New Task stacked next to To Do pill */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="rounded-xl border border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-[#141414] px-3.5 py-2">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 dark:text-white/40 block">
              Avg Workload
            </span>
            <span className="text-sm font-semibold text-neutral-900 dark:text-white">
              {avgWorkload} pts
            </span>
          </div>

          <div className="rounded-xl border border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-[#141414] px-3.5 py-2">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 dark:text-white/40 block">
              In Progress
            </span>
            <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
              {inProgressCount} tasks
            </span>
          </div>

          <div className="rounded-xl border border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-[#141414] px-3.5 py-2">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 dark:text-white/40 block">
              To Do
            </span>
            <span className="text-sm font-semibold text-neutral-800 dark:text-white/80">
              {todoCount} tasks
            </span>
          </div>

          {/* Add member and new task stacked one on top of the other right next to the To Do pill */}
          <div className="flex flex-col gap-1.5 justify-center">
            <button
              id="add-member-top-btn"
              onClick={onOpenNewUserModal}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-neutral-200 dark:border-white/10 bg-neutral-100 hover:bg-neutral-200 dark:bg-[#1A1A1A] dark:hover:bg-[#2A2A2A] dark:hover:border-white/20 px-3 py-1 text-xs font-medium text-neutral-800 dark:text-white transition-all shadow-xs cursor-pointer"
            >
              <UserPlus className="h-3 w-3 text-neutral-600 dark:text-white/60" />
              <span className="whitespace-nowrap">Add Member</span>
            </button>

            <button
              id="create-task-top-btn"
              onClick={onOpenNewTaskModal}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-1 text-xs font-semibold text-white shadow-md shadow-blue-900/20 transition-all cursor-pointer"
            >
              <Plus className="h-3 w-3" />
              <span className="whitespace-nowrap">New Task</span>
            </button>
          </div>
        </div>
      </div>

      {/* Search Bar & Export Audit Utilities */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Search input with debounced query */}
        <div className="relative w-full sm:w-80">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-400 dark:text-white/30">
            <Search className="h-3.5 w-3.5" />
          </div>
          <input
            id="task-search-input"
            type="text"
            value={localSearch}
            onChange={e => setLocalSearch(e.target.value)}
            placeholder="Search tasks, members (Ctrl+F)..."
            className="w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#141414] py-2 pl-9 pr-3 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-none transition-colors"
          />
          {localSearch && (
            <button
              onClick={() => {
                setLocalSearch('');
                onSearchChange('');
              }}
              className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-xs text-neutral-400 hover:text-neutral-900 dark:text-white/40 dark:hover:text-white cursor-pointer"
            >
              ×
            </button>
          )}
        </div>

        {/* Export Workspace Dropdown */}
        <div className="relative" ref={exportMenuRef}>
          <button
            id="export-workspace-btn"
            onClick={() => setShowExportMenu(prev => !prev)}
            className="flex items-center gap-1.5 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#141414] hover:bg-neutral-50 dark:hover:bg-white/5 px-3 py-2 text-xs font-medium text-neutral-700 dark:text-white/70 transition-colors shadow-xs cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export Report</span>
          </button>

          {showExportMenu && (
            <div className="absolute right-0 mt-1.5 w-52 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#0D0D0D] p-1.5 shadow-xl z-20">
              <button
                onClick={() => {
                  setShowExportMenu(false);
                  exportWorkspaceXLS(tasks, users);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-neutral-700 dark:text-white/80 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-500" />
                <span>Export Excel (.xls) Report</span>
              </button>
              <button
                onClick={() => {
                  setShowExportMenu(false);
                  exportWorkspaceJSON(tasks, users);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-neutral-700 dark:text-white/80 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
              >
                <FileCode className="h-3.5 w-3.5 text-blue-500" />
                <span>Export JSON Audit</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { exportWorkspaceXLS, exportWorkspaceJSON, quickWorkloadScore } from '../utils/workload';
import {
  Search,
  Download,
  AlertTriangle,
  FileSpreadsheet,
  FileCode,
  Users,
  ChevronDown,
  Check,
  ShieldCheck,
} from 'lucide-react';

interface OverviewBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export const OverviewBar: React.FC<OverviewBarProps> = ({
  searchQuery,
  onSearchChange,
}) => {
  const {
    activeRoleTab,
    users,
    tasks,
    canSwitchBoards,
    activeBoardId,
    setActiveBoardId,
    isSuperadmin,
    creativeDirectors,
    downloadAuditLogs,
  } = useDashboard();
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [isBoardDropdownOpen, setIsBoardDropdownOpen] = useState(false);
  const boardDropdownRef = useRef<HTMLDivElement>(null);

  // Close board dropdown when clicking outside
  useEffect(() => {
    if (!isBoardDropdownOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (boardDropdownRef.current && !boardDropdownRef.current.contains(e.target as Node)) {
        setIsBoardDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isBoardDropdownOpen]);

  const currentBoardLabel = useMemo(() => {
    if (activeBoardId === 'all') return 'All Teams';
    const cd = creativeDirectors.find(c => c.id === activeBoardId);
    return cd ? `${cd.name}'s Team` : 'Team Board';
  }, [activeBoardId, creativeDirectors]);

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

  // Filter users by active tab. Video and UI/UX are shared teams across all delivery teams so they don't filter by board
  const isSharedSection = activeRoleTab === 'video' || activeRoleTab === 'ui_ux';
  const displayedUsers = useMemo(() => {
    let boardUsers = users;
    if (activeBoardId !== 'all' && !isSharedSection) {
      boardUsers = users.filter(u => u.id === activeBoardId || u.creativeDirectorId === activeBoardId);
    }
    return boardUsers.filter(u => u.role === activeRoleTab);
  }, [users, activeRoleTab, activeBoardId, isSharedSection]);

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

  // Single-pass computation for in_progress and todo counts filtered by active board and team role tab (O(U+T))
  const { inProgressCount, todoCount } = useMemo(() => {
    const displayedUserIds = new Set(displayedUsers.map(u => u.id));
    let inProgress = 0;
    let todo = 0;
    for (const t of tasks) {
      if (displayedUserIds.has(t.userId)) {
        if (t.status === 'in_progress') inProgress++;
        else if (t.status === 'todo') todo++;
      }
    }
    return { inProgressCount: inProgress, todoCount: todo };
  }, [displayedUsers, tasks]);

  return (
    <div className="mb-6 space-y-4">
      {/* Top Banner: Metrics & Team Velocity */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-neutral-200 dark:border-white/5 bg-white dark:bg-[#0D0D0D] p-5 sm:px-6 shadow-sm dark:shadow-2xl transition-colors">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">
              {activeRoleTab === 'content'
                ? 'Content'
                : activeRoleTab === 'design'
                ? 'Design'
                : activeRoleTab === 'video'
                ? 'Video'
                : activeRoleTab === 'ui_ux'
                ? 'UI/UX'
                : activeRoleTab}
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

        {/* Right Action Utilities: Team Board Selector & Export Workspace */}
        <div className="flex items-center gap-2">
          {/* Team Board Selector (Superadmin & Creative Directors - hidden on shared teams Video & UI/UX) */}
          {canSwitchBoards && !isSharedSection && (
            <div className="relative" ref={boardDropdownRef}>
              <button
                id="board-selector-btn"
                onClick={() => setIsBoardDropdownOpen(prev => !prev)}
                className="flex items-center gap-1.5 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#141414] hover:bg-neutral-50 dark:hover:bg-white/5 px-3 py-2 text-xs font-medium text-neutral-800 dark:text-neutral-200 transition-colors shadow-xs cursor-pointer"
              >
                <Users className="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400" />
                <span className="max-w-[140px] truncate">{currentBoardLabel}</span>
                <ChevronDown className="h-3 w-3 text-neutral-400" />
              </button>

              {isBoardDropdownOpen && (
                <div className="absolute right-0 sm:left-0 sm:right-auto mt-1.5 w-52 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#0D0D0D] py-1.5 shadow-xl z-30">
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                    Select Team Board
                  </div>
                  {isSuperadmin && (
                    <button
                      onClick={() => {
                        setActiveBoardId('all');
                        setIsBoardDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left hover:bg-neutral-100 dark:hover:bg-white/5 cursor-pointer ${activeBoardId === 'all'
                          ? 'text-blue-600 dark:text-blue-400 font-semibold'
                          : 'text-neutral-700 dark:text-neutral-300'
                        }`}
                    >
                      <span>All Teams (Superadmin)</span>
                      {activeBoardId === 'all' && <Check className="h-3.5 w-3.5 text-blue-500" />}
                    </button>
                  )}
                  {creativeDirectors.map(cd => (
                    <button
                      key={cd.id}
                      onClick={() => {
                        setActiveBoardId(cd.id);
                        setIsBoardDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left hover:bg-neutral-100 dark:hover:bg-white/5 cursor-pointer ${activeBoardId === cd.id
                          ? 'text-blue-600 dark:text-blue-400 font-semibold'
                          : 'text-neutral-700 dark:text-neutral-300'
                        }`}
                    >
                      <span className="truncate">{cd.name}&apos;s Team</span>
                      {activeBoardId === cd.id && <Check className="h-3.5 w-3.5 shrink-0 text-blue-500" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Export Workspace Dropdown */}
          <div className="relative" ref={exportMenuRef}>
            <button
              id="export-workspace-btn"
              onClick={() => setShowExportMenu(prev => !prev)}
              title="Export workspace or audit reports"
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
                <button
                  id="export-audit-ndjson-btn"
                  onClick={() => {
                    setShowExportMenu(false);
                    downloadAuditLogs();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-neutral-700 dark:text-white/80 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer border-t border-neutral-100 dark:border-white/5 mt-1 pt-1.5"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-purple-500" />
                  <span>Compliance Audit (NDJSON)</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

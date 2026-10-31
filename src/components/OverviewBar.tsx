import { MetricBar } from './ui/MetricBar';
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useDashboard } from '../context/DashboardContext';
import {
  exportWorkspaceXLS,
  exportWorkspaceJSON,
  quickWorkloadScore,
  calculateTeamUtilization,
  calculateTasksEfficiency,
  formatHoursRatio,
} from '../utils/workload';
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
  BarChart3,
} from 'lucide-react';

interface OverviewBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenAnalytics: () => void;
}

export const OverviewBar: React.FC<OverviewBarProps> = ({
  searchQuery,
  onSearchChange,
  onOpenAnalytics,
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

  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (showExportMenu) { setShowExportMenu(false); document.getElementById('export-workspace-btn')?.focus(); }
      if (isBoardDropdownOpen) { setIsBoardDropdownOpen(false); document.getElementById('board-selector-btn')?.focus(); }
    };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [showExportMenu, isBoardDropdownOpen]);

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

  // Filter users by active tab. Video, UI/UX, and Research are shared teams across all delivery teams so they don't filter by board
  const isSharedSection = activeRoleTab === 'video' || activeRoleTab === 'ui_ux' || activeRoleTab === 'research';
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

  // Team tasks, utilization, and efficiency metrics
  const teamTasks = useMemo(() => {
    const displayedUserIds = new Set(displayedUsers.map(u => u.id));
    return tasks.filter(t => displayedUserIds.has(t.userId));
  }, [displayedUsers, tasks]);

  const teamUtilization = useMemo(() => {
    return calculateTeamUtilization(displayedUsers, tasks);
  }, [displayedUsers, tasks]);

  const teamEfficiency = useMemo(() => {
    return calculateTasksEfficiency(teamTasks);
  }, [teamTasks]);

  return (
    <div className="mb-5 space-y-4">
      <section className="surface p-4 sm:p-5" aria-label="Team overview">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h1 className="text-xl font-semibold tracking-tight">{activeRoleTab === 'ui_ux' ? 'UI/UX' : activeRoleTab.charAt(0).toUpperCase() + activeRoleTab.slice(1)}</h1>
            <span className="text-xs text-[var(--text-secondary)]">{displayedUsers.length} {displayedUsers.length === 1 ? 'member' : 'members'}</span>
          </div>
          {overloadedMembersCount > 0 && <span className="flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-300"><AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />{overloadedMembersCount} {overloadedMembersCount === 1 ? 'member needs' : 'members need'} workload review</span>}
        </div>
        <div className="grid grid-cols-6 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          <div className="metric-card col-span-3 sm:col-span-1">
            <h2 className="metric-label">Utilization</h2>
            <p className="metric-value mt-2">{teamUtilization.utilizationPercent}<span className="text-sm tracking-normal">%</span></p>
            <MetricBar label="Team utilization" value={teamUtilization.utilizationPercent} detail={`${teamUtilization.utilizedCount} of ${teamUtilization.totalCount} members assigned over 3 hours per day`} tone="green" />
            <p className="metric-detail">{teamUtilization.utilizedCount} of {teamUtilization.totalCount} above 3h/day</p>
          </div>
          <div className="metric-card col-span-3 sm:col-span-1">
            <h2 className="metric-label">Efficiency</h2>
            <p className="metric-value mt-2">{teamEfficiency.totalEstimatedHours > 0 ? <>{teamEfficiency.efficiencyPercent}<span className="text-sm tracking-normal">%</span></> : '—'}</p>
            <MetricBar label="Team efficiency" value={teamEfficiency.efficiencyPercent} detail={`${teamEfficiency.efficiencyPercent} percent; billable hours divided by estimated hours`} tone="blue" />
            <p className="metric-detail">{teamEfficiency.totalEstimatedHours > 0 ? formatHoursRatio(teamEfficiency.totalTimeTakenHours, teamEfficiency.totalEstimatedHours) : 'No estimates yet'}</p>
          </div>
          <div className="metric-card col-span-2 sm:col-span-1">
            <h2 className="metric-label">Avg workload</h2>
            <p className="metric-value mt-2">{avgWorkload}<span className="text-xs tracking-normal font-normal"> pts</span></p>
            <MetricBar label="Average workload" value={avgWorkload} max={12} detail={`${avgWorkload} points; overload threshold is 12 points`} tone={avgWorkload >= 12 ? 'red' : avgWorkload >= 8 ? 'amber' : 'blue'} />
            <p className="metric-detail">12 pts overload threshold</p>
          </div>
          <div className="metric-card col-span-2 sm:col-span-1">
            <h2 className="metric-label">In progress</h2>
            <p className="metric-value mt-2">{inProgressCount}</p>
            <MetricBar label="Assigned tasks in progress" value={inProgressCount} max={teamTasks.length || 1} detail={`${inProgressCount} of ${teamTasks.length} assigned tasks in progress`} />
            <p className="metric-detail">{teamTasks.length} assigned tasks total</p>
          </div>
          <div className="metric-card col-span-2 sm:col-span-1">
            <h2 className="metric-label">To do</h2>
            <p className="metric-value mt-2">{todoCount}</p>
            <MetricBar label="Assigned tasks to do" value={todoCount} max={teamTasks.length || 1} detail={`${todoCount} of ${teamTasks.length} assigned tasks to do`} tone="amber" />
            <p className="metric-detail">Ready to be picked up</p>
          </div>
        </div>
      </section>

      {/* Search Bar & Export Audit Utilities */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Search input with debounced query */}
        <div className="relative w-full sm:w-80">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[var(--text-secondary)]">
            <Search className="h-3.5 w-3.5" />
          </div>
          <input
            id="task-search-input"
            aria-label="Search tasks, members, clients, and projects"
            type="text"
            value={localSearch}
            onChange={e => setLocalSearch(e.target.value)}
            placeholder="Search tasks, members (Ctrl+F)..."
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] py-2 pl-9 pr-3 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-none transition-colors"
          />
          {localSearch && (
            <button
              aria-label="Clear workspace search"
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
        <div className="flex w-full sm:w-auto flex-wrap items-center gap-2">
          {/* Team Board Selector (Superadmin & Creative Directors - hidden on shared teams Video & UI/UX) */}
          {canSwitchBoards && !isSharedSection && (
            <div className="relative" ref={boardDropdownRef}>
              <button
                id="board-selector-btn"
                aria-expanded={isBoardDropdownOpen}
                onClick={() => setIsBoardDropdownOpen(prev => !prev)}
                className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-neutral-50 dark:hover:bg-white/5 px-3 py-2 text-xs font-medium text-neutral-800 dark:text-neutral-200 transition-colors shadow-xs cursor-pointer"
              >
                <Users className="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400" />
                <span className="max-w-[140px] truncate">{currentBoardLabel}</span>
                <ChevronDown className="h-3 w-3 text-neutral-400" />
              </button>

              {isBoardDropdownOpen && (
                <div className="absolute right-0 sm:left-0 sm:right-auto mt-1.5 w-52 rounded-xl border border-[var(--border)] bg-[var(--surface)] py-1.5 shadow-xl z-30">
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
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

          {/* View Analytics Modal Button */}
          <button
            id="view-analytics-btn"
            onClick={onOpenAnalytics}
            title="Open executive workspace analytics modal"
            className="flex items-center gap-1.5 rounded-xl border border-blue-500/30 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 px-3 py-2 text-xs font-semibold text-blue-600 dark:text-blue-400 transition-colors shadow-xs cursor-pointer"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            <span>View Analytics</span>
          </button>

          {/* Export Workspace Dropdown */}
          <div className="relative" ref={exportMenuRef}>
            <button
              id="export-workspace-btn"
              aria-expanded={showExportMenu}
              onClick={() => setShowExportMenu(prev => !prev)}
              title="Export workspace or audit reports"
              className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-neutral-50 dark:hover:bg-white/5 px-3 py-2 text-xs font-medium text-neutral-700 dark:text-white/70 transition-colors shadow-xs cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export Report</span>
            </button>

            {showExportMenu && (
              <div className="absolute right-0 mt-1.5 w-52 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-xl z-20">
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

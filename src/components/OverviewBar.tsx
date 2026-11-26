import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useAuth, useBoardUi, useWorkspace } from '../context/DashboardContext';
import {
  exportWorkspaceXLS,
  exportWorkspaceJSON,
  quickWorkloadScore,
  calculateTeamUtilization,
  calculateTasksEfficiency,
  formatHoursRatio,
  getTaskAssigneeIds,
  groupTasksByAssignee,
  getEfficiencyToneClass,
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
  X,
  Loader2,
  MoreHorizontal,
} from 'lucide-react';

interface OverviewBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenAnalytics: () => void;
  freePool: React.ReactNode;
}

export const OverviewBar: React.FC<OverviewBarProps> = ({
  searchQuery,
  onSearchChange,
  onOpenAnalytics,
  freePool,
}) => {
  const { canSwitchBoards, isSuperadmin } = useAuth();
  const { activeRoleTab, activeBoardId, setActiveBoardId } = useBoardUi();
  const {
    users,
    tasks,
    creativeDirectors,
    downloadAuditLogs,
  } = useWorkspace();
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [showMobileActionsMenu, setShowMobileActionsMenu] = useState(false);
  const mobileActionsMenuRef = useRef<HTMLDivElement>(null);
  const [isBoardDropdownOpen, setIsBoardDropdownOpen] = useState(false);
  const boardDropdownRef = useRef<HTMLDivElement>(null);
  const [mobileMetricsExpanded, setMobileMetricsExpanded] = useState(false);
  const isSearchPending = localSearch !== searchQuery;

  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (showExportMenu) { setShowExportMenu(false); document.getElementById('export-workspace-btn')?.focus(); }
      if (showMobileActionsMenu) { setShowMobileActionsMenu(false); document.getElementById('mobile-actions-menu-btn')?.focus(); }
      if (isBoardDropdownOpen) { setIsBoardDropdownOpen(false); document.getElementById('board-selector-btn')?.focus(); }
    };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [showExportMenu, showMobileActionsMenu, isBoardDropdownOpen]);

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

  useEffect(() => {
    if (!showExportMenu && !showMobileActionsMenu) return;
    const handleOutside = (e: MouseEvent) => {
      if (showExportMenu && exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
      if (showMobileActionsMenu && mobileActionsMenuRef.current && !mobileActionsMenuRef.current.contains(e.target as Node)) {
        setShowMobileActionsMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showExportMenu, showMobileActionsMenu]);

  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== searchQuery) {
        onSearchChange(localSearch);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [localSearch, onSearchChange, searchQuery]);

  const displayedUsers = useMemo(() => {
    let boardUsers = users;
    if (activeBoardId !== 'all') {
      boardUsers = users.filter(u => u.id === activeBoardId || u.creativeDirectorId === activeBoardId);
    }
    return boardUsers.filter(u =>
      activeRoleTab === 'all'
        ? (u.role === 'content' || u.role === 'design')
        : u.role === activeRoleTab
    );
  }, [users, activeRoleTab, activeBoardId]);

  const { avgWorkload, overloadedMembersCount } = useMemo(() => {
    if (displayedUsers.length === 0) return { avgWorkload: 0, overloadedMembersCount: 0 };
    const tasksByUser = groupTasksByAssignee(tasks);

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

  const teamTasks = useMemo(() => {
    const displayedUserIds = new Set(displayedUsers.map(u => u.id));
    return tasks.filter(t => getTaskAssigneeIds(t).some(id => displayedUserIds.has(id)));
  }, [displayedUsers, tasks]);

  const { inProgressCount, todoCount } = useMemo(() => {
    let inProgress = 0;
    let todo = 0;
    for (const t of teamTasks) {
      if (t.status === 'in_progress') inProgress++;
      else if (t.status === 'todo') todo++;
    }
    return { inProgressCount: inProgress, todoCount: todo };
  }, [teamTasks]);

  const teamUtilization = useMemo(() => {
    return calculateTeamUtilization(displayedUsers, tasks);
  }, [displayedUsers, tasks]);

  const teamEfficiency = useMemo(() => calculateTasksEfficiency(teamTasks, {
    memberIds: new Set(displayedUsers.map(user => user.id)),
  }), [displayedUsers, teamTasks]);

  return (
    <div className="mb-3.5 space-y-3">
      {/* Pure Typographic Single-Frame Ruled Swiss KPI Ledger */}
      <section className="ledger-frame" aria-label="Team overview">
        <div className="ledger-band flex flex-wrap items-center justify-between gap-2.5 px-4 py-2 sm:px-5">
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-lg font-bold tracking-tight text-[var(--text-primary)]">
              {activeRoleTab === 'all' ? 'All Teams' : activeRoleTab === 'content' ? 'Content' : 'Design'}
            </h1>
            <span className="text-xs font-medium text-[var(--text-secondary)] tabular-nums">
              {displayedUsers.length} {displayedUsers.length === 1 ? 'member' : 'members'}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {overloadedMembersCount > 0 && (
              <span className="ledger-alert-badge">
                <AlertTriangle aria-hidden="true" className="h-3 w-3 shrink-0" />
                <span>
                  {overloadedMembersCount} {overloadedMembersCount === 1 ? 'member over' : 'members over'} 12 pts load cap
                </span>
              </span>
            )}
            <button
              type="button"
              onClick={() => setMobileMetricsExpanded(prev => !prev)}
              aria-expanded={mobileMetricsExpanded}
              className="sm:hidden mobile-tap-control inline-flex items-center gap-1 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)] tabular-nums cursor-pointer"
            >
              <span>
                {teamUtilization.utilizationPercent}% util · {avgWorkload} pts
              </span>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${mobileMetricsExpanded ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        <div className={`${mobileMetricsExpanded ? 'grid' : 'hidden sm:grid'} ledger-kpi-grid`}>
          <div className="metric-card col-span-3 sm:col-span-1 border-b lg:border-b-0 border-r border-[var(--border-subtle)]">
            <p className="metric-label whitespace-nowrap">Utilization</p>
            <p className="metric-value mt-1 text-emerald-700 dark:text-emerald-400">
              {teamUtilization.utilizationPercent}
              <span className="text-sm font-semibold tracking-normal">%</span>
            </p>
            <p className="metric-detail">
              {teamUtilization.utilizedCount} of {teamUtilization.totalCount} at 3h/day or more
            </p>
          </div>

          <div className="metric-card col-span-3 sm:col-span-1 border-b lg:border-b-0 sm:border-r border-[var(--border-subtle)]">
            <p className="metric-label whitespace-nowrap">Efficiency</p>
            <p className={`metric-value mt-1 ${getEfficiencyToneClass(teamEfficiency.efficiencyPercent)}`}>
              {teamEfficiency.efficiencyPercent !== null ? (
                <>
                  {Math.round(teamEfficiency.efficiencyPercent)}
                  <span className="text-sm font-semibold tracking-normal">%</span>
                </>
              ) : (
                '—'
              )}
            </p>
            <p className="metric-detail" title="Estimated / billable hours on completed work">
              {teamEfficiency.efficiencyPercent !== null
                ? formatHoursRatio(teamEfficiency.estimatedHours, teamEfficiency.billableHours)
                : 'No measured work'}
            </p>
          </div>

          <div className="metric-card col-span-2 sm:col-span-1 sm:border-b lg:border-b-0 border-r border-[var(--border-subtle)]">
            <p className="metric-label whitespace-nowrap">Avg load</p>
            <p
              className={`metric-value mt-1 ${
                avgWorkload >= 12
                  ? 'text-red-600 dark:text-red-400'
                  : avgWorkload >= 8
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-[var(--text-primary)]'
              }`}
            >
              {avgWorkload}
              <span className="text-xs font-medium tracking-normal text-[var(--text-secondary)]"> pts</span>
            </p>
            <p className="metric-detail">Cap 12 pts</p>
          </div>

          <div className="metric-card col-span-2 sm:col-span-1 border-r border-[var(--border-subtle)]">
            <p className="metric-label whitespace-nowrap">In progress</p>
            <p className="metric-value mt-1 text-[var(--text-primary)]">{inProgressCount}</p>
            <p className="metric-detail">{teamTasks.length} assigned</p>
          </div>

          <div className="metric-card col-span-2 sm:col-span-2 lg:col-span-1">
            <p className="metric-label whitespace-nowrap">To do</p>
            <p className="metric-value mt-1 text-[var(--text-primary)]">{todoCount}</p>
            <p className="metric-detail">Ready</p>
          </div>
        </div>
        {freePool}
      </section>

      {/* Compact Toolbar: Search + Team Board + Free Pool + Analytics + Export */}
      <div className="flex items-center justify-between gap-2.5 flex-wrap">
        <div className="relative w-full sm:w-80">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[var(--text-muted)]">
            {isSearchPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#1d4ed8] dark:text-blue-400" />
            ) : (
              <Search className="h-3.5 w-3.5" />
            )}
          </div>
          <input
            id="task-search-input"
            aria-label="Search tasks, members, clients, and projects"
            type="text"
            value={localSearch}
            onChange={e => setLocalSearch(e.target.value)}
            placeholder="Search tasks, members, clients (/)..."
            className="mobile-tap-control w-full rounded-[7px] border border-[var(--border)] bg-[var(--surface)] py-1.5 pl-9 pr-9 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none transition-colors"
          />
          {localSearch && (
            <button
              type="button"
              aria-label="Clear workspace search"
              onClick={() => {
                setLocalSearch('');
                onSearchChange('');
              }}
              className="mobile-tap-control absolute inset-y-0 right-0 flex items-center justify-center w-9 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex w-full sm:w-auto flex-wrap items-center gap-2">
          {canSwitchBoards && (
            <div className="relative" ref={boardDropdownRef}>
              <button
                id="board-selector-btn"
                type="button"
                aria-expanded={isBoardDropdownOpen}
                onClick={() => setIsBoardDropdownOpen(prev => !prev)}
                className="button-secondary mobile-tap-control"
              >
                <Users className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                <span className="max-w-[140px] truncate">{currentBoardLabel}</span>
                <ChevronDown className="h-3 w-3 text-[var(--text-muted)]" />
              </button>

              {isBoardDropdownOpen && (
                <div className="menu-surface absolute right-0 sm:left-0 sm:right-auto mt-1.5 w-56 rounded-[9px] border border-[var(--border)] py-1 z-30">
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border-subtle)]">
                    Select Team Board
                  </div>
                  {isSuperadmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveBoardId('all');
                        setIsBoardDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left hover:bg-[var(--surface-subtle)] cursor-pointer ${
                        activeBoardId === 'all'
                          ? 'text-[#1d4ed8] dark:text-blue-400 font-semibold'
                          : 'text-[var(--text-primary)]'
                      }`}
                    >
                      <span>All Teams (Superadmin)</span>
                      {activeBoardId === 'all' && <Check className="h-3.5 w-3.5 text-[#1d4ed8] dark:text-blue-400" />}
                    </button>
                  )}
                  {creativeDirectors.map(cd => (
                    <button
                      key={cd.id}
                      type="button"
                      onClick={() => {
                        setActiveBoardId(cd.id);
                        setIsBoardDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left hover:bg-[var(--surface-subtle)] cursor-pointer ${
                        activeBoardId === cd.id
                          ? 'text-[#1d4ed8] dark:text-blue-400 font-semibold'
                          : 'text-[var(--text-primary)]'
                      }`}
                    >
                      <span className="truncate">{cd.name}&apos;s Team</span>
                      {activeBoardId === cd.id && <Check className="h-3.5 w-3.5 shrink-0 text-[#1d4ed8] dark:text-blue-400" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="relative sm:hidden" ref={mobileActionsMenuRef}>
            <button
              id="mobile-actions-menu-btn"
              type="button"
              aria-expanded={showMobileActionsMenu}
              aria-label="Analytics and export actions"
              onClick={() => setShowMobileActionsMenu(prev => !prev)}
              className="button-secondary mobile-tap-control"
            >
              <MoreHorizontal className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
              <span>More</span>
            </button>

            {showMobileActionsMenu && (
              <div aria-label="Analytics and export actions" className="menu-surface absolute right-0 mt-1.5 w-56 rounded-[9px] border border-[var(--border)] p-1 z-30">
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileActionsMenu(false);
                    onOpenAnalytics();
                  }}
                  className="menu-item cursor-pointer"
                >
                  <BarChart3 className="h-3.5 w-3.5 text-[#1d4ed8] dark:text-blue-400" />
                  <span>View Analytics</span>
                </button>
                <div className="my-1 border-t border-[var(--border-subtle)]" />
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileActionsMenu(false);
                    exportWorkspaceXLS(tasks, users);
                  }}
                  className="menu-item cursor-pointer"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Export Excel (.xls) Report</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileActionsMenu(false);
                    exportWorkspaceJSON(tasks, users);
                  }}
                  className="menu-item cursor-pointer"
                >
                  <FileCode className="h-3.5 w-3.5 text-[#1d4ed8] dark:text-blue-400" />
                  <span>Export JSON Audit</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileActionsMenu(false);
                    downloadAuditLogs();
                  }}
                  className="menu-item cursor-pointer"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Download SOC2 Audit (.ndjson)</span>
                </button>
              </div>
            )}
          </div>

          <button
            id="view-analytics-btn"
            type="button"
            onClick={onOpenAnalytics}
            title="Open executive workspace analytics modal"
            className="hidden sm:inline-flex button-secondary mobile-tap-control"
          >
            <BarChart3 className="h-3.5 w-3.5 text-[#1d4ed8] dark:text-blue-400" />
            <span>View Analytics</span>
          </button>

          <div className="relative hidden sm:block" ref={exportMenuRef}>
            <button
              id="export-workspace-btn"
              type="button"
              aria-expanded={showExportMenu}
              onClick={() => setShowExportMenu(prev => !prev)}
              title="Export workspace or audit reports"
              className="button-secondary mobile-tap-control"
            >
              <Download className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
              <span>Export Report</span>
            </button>

            {showExportMenu && (
              <div aria-label="Export options" className="menu-surface absolute right-0 mt-1.5 w-52 rounded-[9px] border border-[var(--border)] p-1 z-20">
                <button
                  type="button"
                  onClick={() => {
                    setShowExportMenu(false);
                    exportWorkspaceXLS(tasks, users);
                  }}
                  className="menu-item cursor-pointer"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Export Excel (.xls) Report</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowExportMenu(false);
                    exportWorkspaceJSON(tasks, users);
                  }}
                  className="menu-item cursor-pointer"
                >
                  <FileCode className="h-3.5 w-3.5 text-[#1d4ed8] dark:text-blue-400" />
                  <span>Export JSON Audit</span>
                </button>
                <button
                  id="export-audit-ndjson-btn"
                  type="button"
                  onClick={() => {
                    setShowExportMenu(false);
                    downloadAuditLogs();
                  }}
                  className="menu-item cursor-pointer"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Download SOC2 Audit (.ndjson)</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

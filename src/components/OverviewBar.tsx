import React from 'react';
import { useDashboard } from '../context/DashboardContext';
import { CognitiveLoad, Role } from '../types';
import { calculateUserWorkload, getCognitiveLoadLabel } from '../utils/workload';
import {
  Search,
  Plus,
  UserPlus,
  Brain,
} from 'lucide-react';

interface OverviewBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedLoadFilter: CognitiveLoad | 'all';
  onSelectLoadFilter: (filter: CognitiveLoad | 'all') => void;
  onOpenNewTaskModal: () => void;
  onOpenNewUserModal: () => void;
}

export const OverviewBar: React.FC<OverviewBarProps> = ({
  searchQuery,
  onSearchChange,
  selectedLoadFilter,
  onSelectLoadFilter,
  onOpenNewTaskModal,
  onOpenNewUserModal,
}) => {
  const { activeRoleTab, users, tasks } = useDashboard();

  // Filter users by active tab
  const displayedUsers = users.filter(u => u.role === activeRoleTab);

  const displayedTasks = tasks.filter(t => {
    const owner = users.find(u => u.id === t.userId);
    if (!owner) return false;
    return owner.role === activeRoleTab;
  });

  // Calculate average team workload score
  const totalScores = displayedUsers.map(u => {
    const uTasks = tasks.filter(t => t.userId === u.id);
    return calculateUserWorkload(uTasks).totalScore;
  });

  const avgWorkload = totalScores.length
    ? Math.round((totalScores.reduce((a, b) => a + b, 0) / totalScores.length) * 10) / 10
    : 0;

  const inProgressCount = displayedTasks.filter(t => t.status === 'in_progress').length;
  const todoCount = displayedTasks.filter(t => t.status === 'todo').length;

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
              className="flex items-center justify-center gap-1.5 rounded-lg border border-neutral-200 dark:border-white/10 bg-neutral-100 hover:bg-neutral-200 dark:bg-[#1A1A1A] dark:hover:bg-[#2A2A2A] dark:hover:border-white/20 px-3 py-1 text-xs font-medium text-neutral-800 dark:text-white transition-all shadow-xs"
            >
              <UserPlus className="h-3 w-3 text-neutral-600 dark:text-white/60" />
              <span className="whitespace-nowrap">Add Member</span>
            </button>

            <button
              id="create-task-top-btn"
              onClick={onOpenNewTaskModal}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-1 text-xs font-semibold text-white shadow-md shadow-blue-900/20 transition-all"
            >
              <Plus className="h-3 w-3" />
              <span className="whitespace-nowrap">New Task</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Search input */}
        <div className="relative w-full sm:w-80">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-400 dark:text-white/30">
            <Search className="h-3.5 w-3.5" />
          </div>
          <input
            id="task-search-input"
            type="text"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search tasks, members..."
            className="w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#141414] py-2 pl-9 pr-3 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-none transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-xs text-neutral-400 hover:text-neutral-900 dark:text-white/40 dark:hover:text-white"
            >
              ×
            </button>
          )}
        </div>

        {/* Cognitive Load quick filter with role-specific nomenclature */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
          <span className="text-[11px] uppercase tracking-wider text-neutral-500 dark:text-white/40 shrink-0 mr-1 flex items-center gap-1">
            <Brain className="h-3 w-3 text-neutral-400 dark:text-white/40" />
            <span>Load:</span>
          </span>

          <button
            onClick={() => onSelectLoadFilter('all')}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors shrink-0 ${
              selectedLoadFilter === 'all'
                ? 'bg-neutral-900 text-white dark:bg-[#2A2A2A] dark:text-white border border-neutral-800 dark:border-white/20'
                : 'bg-neutral-100 text-neutral-600 hover:text-neutral-900 dark:bg-[#141414] dark:text-white/40 dark:hover:text-white border border-neutral-200 dark:border-white/5'
            }`}
          >
            All Loads
          </button>

          <button
            onClick={() => onSelectLoadFilter('low')}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors shrink-0 border ${
              selectedLoadFilter === 'low'
                ? 'bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/40 shadow-xs'
                : 'bg-green-500/5 text-green-600/70 dark:text-green-400/60 border-green-500/15 hover:text-green-700 dark:hover:text-green-400'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            <span>{getCognitiveLoadLabel('low', activeRoleTab)}</span>
          </button>

          <button
            onClick={() => onSelectLoadFilter('medium')}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors shrink-0 border ${
              selectedLoadFilter === 'medium'
                ? 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/40 shadow-xs'
                : 'bg-yellow-500/5 text-yellow-600/70 dark:text-yellow-400/60 border-yellow-500/15 hover:text-yellow-700 dark:hover:text-yellow-400'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
            <span>{getCognitiveLoadLabel('medium', activeRoleTab)}</span>
          </button>

          <button
            onClick={() => onSelectLoadFilter('high')}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors shrink-0 border ${
              selectedLoadFilter === 'high'
                ? 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/40 shadow-xs'
                : 'bg-red-500/5 text-red-600/70 dark:text-red-400/60 border-red-500/15 hover:text-red-700 dark:hover:text-red-400'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            <span>{getCognitiveLoadLabel('high', activeRoleTab)}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

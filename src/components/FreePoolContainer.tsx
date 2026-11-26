import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User, Task, TaskStatus, RoleFilter } from '../types';
import { getUserTag, formatHours, getAssignedHoursByMemberAndDate, getTaskAssigneeIds, meetsDailyUtilizationTarget } from '../utils/workload';
import { getAnalyticsClock } from '../domain/analyticsDate';
import {
  Users,
  ChevronDown,
  ChevronUp,
  Plus,
  CheckCircle2,
  ArrowUpRight,
} from 'lucide-react';

interface FreePoolContainerProps {
  users: User[];
  tasks: Task[];
  onAddTask: (userId: string, status?: TaskStatus) => void;
  onSelectUser?: (user: User) => void;
}

export const FreePoolContainer: React.FC<FreePoolContainerProps> = ({
  users,
  tasks,
  onAddTask,
  onSelectUser,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    const mobile = window.matchMedia('(max-width: 639px)').matches;
    try {
      const saved = localStorage.getItem(mobile ? 'zenflow_freepool_expanded_mobile' : 'zenflow_freepool_expanded');
      return saved !== null ? saved === 'true' : false;
    } catch {
      return false;
    }
  });

  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');

  const toggleExpanded = () => {
    setIsExpanded(prev => {
      const next = !prev;
      try {
        localStorage.setItem(
          window.matchMedia('(max-width: 639px)').matches
            ? 'zenflow_freepool_expanded_mobile'
            : 'zenflow_freepool_expanded',
          String(next)
        );
      } catch {
        // ignore
      }
      return next;
    });
  };

  const { freeUsers, userStats } = useMemo(() => {
    const inReviewCounts = new Map<string, number>();
    const pipelineCounts = new Map<string, number>();

    for (const t of tasks) {
      if (!t) continue;
      for (const uid of getTaskAssigneeIds(t)) {
        if (t.status === 'in_review') {
          inReviewCounts.set(uid, (inReviewCounts.get(uid) || 0) + 1);
        } else if (t.status === 'pipeline') {
          pipelineCounts.set(uid, (pipelineCounts.get(uid) || 0) + 1);
        }
      }
    }

    const reportDate = getAnalyticsClock().date;
    const hoursByMember = getAssignedHoursByMemberAndDate(tasks, [reportDate], reportDate);
    const free: User[] = [];
    const stats = new Map<string, { inReview: number; pipeline: number; assignedHours: number }>();

    for (const u of users) {
      if (u.role !== 'content' && u.role !== 'design') continue;
      const assignedHours = hoursByMember.get(u.id)?.get(reportDate) ?? 0;
      stats.set(u.id, {
        inReview: inReviewCounts.get(u.id) || 0,
        pipeline: pipelineCounts.get(u.id) || 0,
        assignedHours,
      });

      if (!meetsDailyUtilizationTarget(assignedHours)) {
        free.push(u);
      }
    }

    return { freeUsers: free, userStats: stats };
  }, [users, tasks]);

  const filteredFreeUsers = useMemo(() => {
    if (roleFilter === 'all') return freeUsers;
    return freeUsers.filter(u => u.role === roleFilter);
  }, [freeUsers, roleFilter]);

  const contentCount = useMemo(() => freeUsers.filter(u => u.role === 'content').length, [freeUsers]);
  const designCount = useMemo(() => freeUsers.filter(u => u.role === 'design').length, [freeUsers]);

  return (
    <div className="fixed bottom-0 inset-x-0 sm:inset-x-auto sm:bottom-4 sm:right-4 z-40 select-none">
      <AnimatePresence mode="wait">
        {!isExpanded ? (
          <motion.button
            key="collapsed"
            type="button"
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.16, ease: [0.2, 0.7, 0.2, 1] }}
            onClick={toggleExpanded}
            className="free-pool-panel group flex w-full sm:w-auto items-center justify-between sm:justify-start gap-2.5 px-4 sm:px-3.5 py-2 rounded-none sm:rounded-[9px] bg-[#121418] dark:bg-[#1e2430] border-t sm:border border-[#2a303c] text-white hover:bg-[#1b1f27] dark:hover:bg-[#252c3b] transition-colors cursor-pointer"
            title="Click to view free resources pool"
          >
            <div className="flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
              <span className="text-xs font-semibold tracking-tight">Free Pool</span>
              <span className="tabular-nums text-[11px] font-semibold text-emerald-300">
                {freeUsers.length} under 3h/d
              </span>
            </div>
            <ChevronUp className="h-3.5 w-3.5 text-white/60 group-hover:text-white transition-colors" />
          </motion.button>
        ) : (
          <motion.div
            key="expanded"
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.18, ease: [0.2, 0.7, 0.2, 1] }}
            className="free-pool-panel w-full sm:w-88 sm:max-w-[calc(100vw-2rem)] rounded-t-[10px] sm:rounded-[10px] border-t sm:border border-[var(--border)] bg-[var(--surface)]/96 backdrop-blur-md overflow-hidden flex flex-col max-h-[440px]"
          >
            {/* Header Band */}
            <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#121418] dark:bg-[#1a1f2a] text-white border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                <span className="text-xs font-semibold tracking-tight">Free Pool</span>
                <span className="text-[11px] font-medium text-emerald-300 tabular-nums">
                  {freeUsers.length} available
                </span>
              </div>

              <button
                type="button"
                onClick={toggleExpanded}
                aria-label="Minimize Free Pool"
                className="p-1 rounded-[5px] hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
                title="Minimize Free Pool"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>

            {/* Sub-strip */}
            <div className="px-3.5 py-1.5 bg-[var(--surface-muted)] border-b border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] flex items-center justify-between">
              <span>Below 3h/day assigned</span>
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">Ready to assign</span>
            </div>

            {/* Role Filter Tabs */}
            <div className="free-pool-filters flex items-center gap-1 px-3.5 py-2 border-b border-[var(--border-subtle)] bg-[var(--surface)]">
              <button
                type="button"
                onClick={() => setRoleFilter('all')}
                className={`px-2.5 py-1 rounded-[6px] text-[11px] font-semibold transition-colors cursor-pointer tabular-nums ${
                  roleFilter === 'all'
                    ? 'bg-[#121418] dark:bg-white text-white dark:text-[#121418]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]'
                }`}
              >
                All ({freeUsers.length})
              </button>
              <button
                type="button"
                onClick={() => setRoleFilter('content')}
                className={`px-2.5 py-1 rounded-[6px] text-[11px] font-semibold transition-colors cursor-pointer tabular-nums ${
                  roleFilter === 'content'
                    ? 'bg-[#1d4ed8] text-white'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]'
                }`}
              >
                Content ({contentCount})
              </button>
              <button
                type="button"
                onClick={() => setRoleFilter('design')}
                className={`px-2.5 py-1 rounded-[6px] text-[11px] font-semibold transition-colors cursor-pointer tabular-nums ${
                  roleFilter === 'design'
                    ? 'bg-[#1d4ed8] text-white'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]'
                }`}
              >
                Design ({designCount})
              </button>
            </div>

            {/* Member List */}
            <div className="overflow-y-auto max-h-64 divide-y divide-[var(--border-subtle)]">
              {filteredFreeUsers.length === 0 ? (
                <div className="py-6 px-4 text-center">
                  <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-[7px] bg-[var(--surface-subtle)] text-[var(--text-secondary)] mb-2">
                    {freeUsers.length === 0 ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Users className="h-4 w-4" />
                    )}
                  </div>
                  <p className="text-xs font-semibold text-[var(--text-primary)]">
                    {freeUsers.length === 0 ? 'All resources fully utilized' : `No free ${roleFilter} members`}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--text-secondary)] max-w-xs mx-auto">
                    {freeUsers.length === 0
                      ? 'Every team member across all boards has > 3 hours estimated per day assigned.'
                      : 'Try switching to another role tab or wait for task assignments to update.'}
                  </p>
                </div>
              ) : (
                filteredFreeUsers.map(user => {
                  const stats = userStats.get(user.id);
                  const tagInfo = getUserTag(user);

                  return (
                    <div
                      key={user.id}
                      onClick={() => onSelectUser?.(user)}
                      className="group flex items-center justify-between px-3.5 py-2 hover:bg-[var(--surface-muted)] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <div className="relative shrink-0">
                          <div
                            className={`h-7 w-7 rounded-[6px] overflow-hidden text-xs font-semibold flex items-center justify-center text-white bg-gradient-to-br ${
                              user.avatarColor || 'from-blue-600 to-indigo-600'
                            }`}
                          >
                            {(user.name || '?').charAt(0).toUpperCase()}
                          </div>
                          <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-[var(--surface)] bg-emerald-500" />
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                              {user.name}
                            </span>
                            <span className="text-[11px] font-medium text-[var(--text-muted)] truncate">
                              {tagInfo.label}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] tabular-nums">
                            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                              {stats?.assignedHours !== undefined ? `${formatHours(stats.assignedHours)}/day` : '0h/day'}
                            </span>
                            <span>·</span>
                            {stats && stats.inReview > 0 ? (
                              <span>{stats.inReview} in review</span>
                            ) : stats && stats.pipeline > 0 ? (
                              <span>{stats.pipeline} in pipeline</span>
                            ) : (
                              <span>Under 3h/day</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            onAddTask(user.id, 'todo');
                          }}
                          className="flex items-center gap-1 px-2 py-1 rounded-[6px] bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] font-semibold transition-colors cursor-pointer"
                          title={`Assign task to ${user.name}`}
                        >
                          <Plus className="h-3 w-3" />
                          <span>Task</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onSelectUser?.(user)}
                          aria-label={`Jump to ${user.name}'s swimlane`}
                          className="p-1 rounded-[6px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors cursor-pointer"
                          title="View board swimlane"
                        >
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

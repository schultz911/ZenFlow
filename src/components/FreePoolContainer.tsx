import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { User, Task, TaskStatus, RoleFilter } from '../types';
import { getUserTag, formatHours, getAssignedHoursByMemberAndDate, getTaskAssigneeIds, meetsDailyUtilizationTarget } from '../utils/workload';
import { getAnalyticsClock } from '../domain/analyticsDate';
import {
  Users,
  X,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  CheckCircle2,
  ArrowUpRight,
} from 'lucide-react';

interface FreePoolContainerProps {
  users: User[];
  tasks: Task[];
  onAddTask: (userId: string, status?: TaskStatus) => void;
  onSelectUser?: (user: User) => void;
  isExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  isDocked: boolean;
  onDockedChange: (docked: boolean) => void;
}

export const FreePoolContainer: React.FC<FreePoolContainerProps> = ({
  users,
  tasks,
  onAddTask,
  onSelectUser,
  isExpanded,
  onExpandedChange,
  isDocked,
  onDockedChange,
}) => {
  const reduceMotion = useReducedMotion();
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);

  useEffect(() => {
    if (isExpanded) {
      closeRef.current?.focus({ preventScroll: true });
    }
  }, [isExpanded]);

  useEffect(() => {
    if (!isExpanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        restoreFocusRef.current = true;
        onExpandedChange(false);
      }
    };
    const onOutside = (e: MouseEvent) => {
      if ((!isDocked || !window.matchMedia('(min-width: 1280px)').matches) && containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onExpandedChange(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onOutside);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onOutside);
    };
  }, [isExpanded, isDocked, onExpandedChange]);

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
    <div ref={containerRef} className="free-pool-root">
      <button
        id="free-pool-trigger"
        ref={triggerRef}
        type="button"
        aria-expanded={isExpanded}
        aria-controls="free-pool-popover"
        onClick={() => onExpandedChange(!isExpanded)}
        className={`free-pool-handle ${isExpanded ? 'free-pool-handle-hidden' : ''}`}
      >
        Free pool <span className="tabular-nums">({freeUsers.length})</span>
      </button>

      <AnimatePresence onExitComplete={() => {
        if (restoreFocusRef.current) {
          restoreFocusRef.current = false;
          requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
          setTimeout(() => {
            if (document.activeElement === document.body && triggerRef.current?.getAttribute('aria-expanded') === 'false') {
              triggerRef.current.focus({ preventScroll: true });
            }
          }, 100);
        }
      }}>
        {isExpanded && (
          <motion.aside
            id="free-pool-popover"
            aria-label="Free Pool available capacity"
            initial={reduceMotion ? false : { x: '100%' }}
            animate={{ x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { x: '100%' }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.2, 0.7, 0.2, 1] }}
            className={`free-pool-panel free-pool-sidebar ${isDocked ? 'free-pool-sidebar-docked' : ''}`}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 bg-[#121418] dark:bg-[#1a1f2a] text-white border-b border-white/10">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">Free Pool</h2>
                <p className="text-xs text-emerald-300 tabular-nums">{freeUsers.length} available</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onDockedChange(!isDocked)}
                  aria-label={isDocked ? 'Undock Free Pool' : 'Dock Free Pool'}
                  aria-pressed={isDocked}
                  title={isDocked ? 'Undock Free Pool' : 'Dock Free Pool'}
                  className="free-pool-dock-control items-center justify-center h-10 w-10 rounded-[6px] text-white/80 hover:bg-white/10 hover:text-white cursor-pointer"
                >
                  {isDocked ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => { restoreFocusRef.current = true; onExpandedChange(false); }}
                  ref={closeRef}
                  aria-label="Close Free Pool"
                  className="flex items-center justify-center h-10 w-10 rounded-[6px] hover:bg-white/10 text-white/80 hover:text-white cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Sub-strip */}
            <div className="px-3.5 py-1.5 bg-[var(--surface-muted)] border-b border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] flex items-center justify-between">
              <span>Below 3h/day assigned</span>
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">Ready to assign</span>
            </div>

            {/* Role Filter Tabs (Unified Segmented Track) */}
            <div className="free-pool-filters px-3.5 py-2 border-b border-[var(--border-subtle)] bg-[var(--surface)]">
              <div className="segmented-track w-full">
                <button
                  type="button"
                  aria-pressed={roleFilter === 'all'}
                  onClick={() => setRoleFilter('all')}
                  className={`segmented-item flex-1 cursor-pointer tabular-nums ${
                    roleFilter === 'all' ? 'segmented-item-active' : ''
                  }`}
                >
                  All ({freeUsers.length})
                </button>
                <button
                  type="button"
                  aria-pressed={roleFilter === 'content'}
                  onClick={() => setRoleFilter('content')}
                  className={`segmented-item flex-1 cursor-pointer tabular-nums ${
                    roleFilter === 'content' ? 'segmented-item-active' : ''
                  }`}
                >
                  Content ({contentCount})
                </button>
                <button
                  type="button"
                  aria-pressed={roleFilter === 'design'}
                  onClick={() => setRoleFilter('design')}
                  className={`segmented-item flex-1 cursor-pointer tabular-nums ${
                    roleFilter === 'design' ? 'segmented-item-active' : ''
                  }`}
                >
                  Design ({designCount})
                </button>
              </div>
            </div>

            {/* Member List */}
            <div className="overflow-y-auto flex-1 min-h-0 divide-y divide-[var(--border-subtle)]">
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
                      ? 'All Content and Design members have at least 3 hours per day assigned.'
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
                      className="group flex items-center justify-between gap-2 px-3.5 py-2 hover:bg-[var(--surface-muted)] transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onExpandedChange(false);
                          onSelectUser?.(user);
                        }}
                        aria-label={`Jump to ${user.name}'s swimlane`}
                        className="flex flex-1 items-center gap-2.5 min-w-0 text-left cursor-pointer"
                        style={{ minHeight: 'auto' }}
                      >
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
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            onExpandedChange(false);
                            onAddTask(user.id, 'todo');
                          }}
                          className="free-pool-row-action flex items-center gap-1 px-2 py-1 rounded-[6px] bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] font-semibold transition-colors cursor-pointer"
                          title={`Assign task to ${user.name}`}
                        >
                          <Plus className="h-3 w-3" />
                          <span>Task</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            onExpandedChange(false);
                            onSelectUser?.(user);
                          }}
                          aria-label={`View ${user.name}'s swimlane`}
                          className="free-pool-row-action p-1 rounded-[6px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors cursor-pointer"
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
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
};

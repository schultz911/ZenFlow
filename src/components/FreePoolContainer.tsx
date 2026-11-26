import React, { useState, useMemo, useEffect, useRef } from 'react';
import { User, Task, TaskStatus, RoleFilter } from '../types';
import {
  DAILY_UTILIZATION_TARGET_HOURS,
  formatHours,
  getAssignedHoursByMemberAndDate,
  getTaskAssigneeIds,
  getUserTag,
  meetsDailyUtilizationTarget,
} from '../utils/workload';
import { getAnalyticsClock } from '../domain/analyticsDate';
import {
  UsersRound,
  X,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  ArrowUpRight,
} from 'lucide-react';

const targetHoursLabel = formatHours(DAILY_UTILIZATION_TARGET_HOURS);
const capacityScale = Array.from({ length: DAILY_UTILIZATION_TARGET_HOURS }, (_, hour) => hour);
const roleLabels: Record<RoleFilter, string> = { all: 'All', content: 'Content', design: 'Design' };

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
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isExpanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault();
        triggerRef.current?.focus({ preventScroll: true });
        onExpandedChange(false);
      }
    };
    const onOutside = (e: PointerEvent) => {
      if ((!isDocked || !window.matchMedia('(min-width: 1280px)').matches) && containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onExpandedChange(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onOutside);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onOutside);
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
  const roleOptions = [
    { role: 'all', count: freeUsers.length },
    { role: 'content', count: contentCount },
    { role: 'design', count: designCount },
  ] as const;

  return (
    <div ref={containerRef} className="free-pool-root" data-expanded={isExpanded} data-docked={isDocked}>
      <div className="free-pool-header">
        <div className="free-pool-heading" aria-hidden={!isExpanded}>
          <h2 id="free-pool-title" className="text-sm font-semibold">Free Pool</h2>
          <p className="text-xs text-white/75">Under {targetHoursLabel} assigned today</p>
        </div>
        <button
          id="free-pool-trigger"
          ref={triggerRef}
          type="button"
          aria-expanded={isExpanded}
          aria-controls="free-pool-popover"
          aria-label={isExpanded ? 'Close Free Pool' : `Free Pool, ${freeUsers.length} available`}
          title={isExpanded ? 'Close Free Pool' : 'Free Pool'}
          data-available={freeUsers.length > 0}
          onClick={() => onExpandedChange(!isExpanded)}
          className="free-pool-handle"
        >
          <span className="free-pool-handle-summary" aria-hidden="true">
            <UsersRound className="size-3.5 shrink-0" />
            <span className="free-pool-handle-count">{freeUsers.length > 99 ? '99+' : freeUsers.length}</span>
          </span>
          <X aria-hidden="true" className="free-pool-handle-close size-4" />
        </button>
        <button
          type="button"
          onClick={() => onDockedChange(!isDocked)}
          aria-label={isDocked ? 'Undock Free Pool' : 'Dock Free Pool'}
          aria-pressed={isDocked}
          aria-hidden={!isExpanded}
          title={isDocked ? 'Undock Free Pool' : 'Dock Free Pool'}
          disabled={!isExpanded}
          className="free-pool-dock-control items-center justify-center size-11 rounded-[6px] text-white/80 hover:bg-white/10 hover:text-white"
        >
          {isDocked ? <PanelRightOpen className="size-4" /> : <PanelRightClose className="size-4" />}
        </button>
      </div>

      <aside
        id="free-pool-popover"
        aria-labelledby="free-pool-title"
        inert={!isExpanded}
        className="free-pool-sidebar"
      >
        <div className="free-pool-content flex min-h-0 flex-1 flex-col">
          <div className="free-pool-filters px-3.5 py-2 border-b border-[var(--border-subtle)] bg-[var(--surface)]">
            <div className="segmented-track w-full" role="group" aria-label="Filter available members by discipline">
              {roleOptions.map(({ role, count }) => (
                <button
                  key={role}
                  type="button"
                  aria-pressed={roleFilter === role}
                  onClick={() => setRoleFilter(role)}
                  className={`segmented-item flex-1 tabular-nums ${roleFilter === role ? 'segmented-item-active' : ''}`}
                >
                  {roleLabels[role]} ({count})
                </button>
              ))}
            </div>
          </div>

          {/* Member List */}
          <div className="overflow-y-auto flex-1 min-h-0 divide-y divide-[var(--border-subtle)]">
            {filteredFreeUsers.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-[var(--text-secondary)]">
                {freeUsers.length === 0
                  ? 'No members available today.'
                  : `No ${roleLabels[roleFilter]} members available today.`}
              </p>
            ) : (
              filteredFreeUsers.map(user => {
                const stats = userStats.get(user.id);
                const tagInfo = getUserTag(user);
                const assignedHours = stats?.assignedHours ?? 0;
                const roundedHours = formatHours(assignedHours);
                const assignedHoursLabel = roundedHours === targetHoursLabel ? `<${targetHoursLabel}` : roundedHours;
                const hoursId = `free-pool-${user.id}-hours`;

                return (
                  <div
                    key={user.id}
                    className="flex items-center gap-3 px-3.5 py-2 hover:bg-[var(--surface-muted)] focus-within:bg-[var(--surface-muted)] transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onExpandedChange(false);
                        onSelectUser?.(user);
                      }}
                      aria-label={`Jump to ${user.name}'s swimlane`}
                      aria-describedby={hoursId}
                      className="free-pool-row-action group flex flex-1 items-center gap-2.5 min-w-0 rounded-[6px] text-left"
                    >
                      <span
                        aria-hidden="true"
                        className={`flex size-7 shrink-0 items-center justify-center rounded-[6px] bg-gradient-to-br text-xs font-semibold text-white ${
                          user.avatarColor || 'from-blue-600 to-indigo-600'
                        }`}
                      >
                        {(user.name || '?').charAt(0).toUpperCase()}
                      </span>

                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-[var(--text-primary)] truncate group-hover:underline group-focus-visible:underline">
                            {user.name}
                          </span>
                          <ArrowUpRight aria-hidden="true" className="size-3 shrink-0 text-[var(--text-secondary)]" />
                          <span className="text-[11px] text-[var(--text-secondary)] truncate">
                            {tagInfo.label}
                          </span>
                        </span>

                        <span id={hoursId} className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-[var(--text-secondary)] tabular-nums">
                          <span className="free-pool-hours-scale" aria-hidden="true">
                            {capacityScale.map(hour => (
                              <span key={hour}>
                                <span style={{ width: `${Math.max(0, Math.min(1, assignedHours - hour)) * 100}%` }} />
                              </span>
                            ))}
                          </span>
                          <span className="whitespace-nowrap">{assignedHoursLabel} assigned</span>
                          {stats && stats.inReview > 0 ? (
                            <span className="whitespace-nowrap">· {stats.inReview} in review</span>
                          ) : stats && stats.pipeline > 0 ? (
                            <span className="whitespace-nowrap">· {stats.pipeline} in pipeline</span>
                          ) : null}
                        </span>
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onExpandedChange(false);
                        onAddTask(user.id, 'todo');
                      }}
                      aria-label={`Add task for ${user.name}`}
                      className="free-pool-row-action flex shrink-0 items-center gap-1 rounded-[6px] bg-emerald-700 px-2.5 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-800 active:bg-emerald-900"
                    >
                      <Plus aria-hidden="true" className="size-3" />
                      Task
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </aside>
    </div>
  );
};

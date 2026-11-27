import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
import { handleRovingMenuKeyDown, useAnchoredPopover } from '../hooks/useAnchoredPopover';
import {
  UsersRound,
  ChevronDown,
  Plus,
  ArrowUpRight,
} from 'lucide-react';

const targetHoursLabel = formatHours(DAILY_UTILIZATION_TARGET_HOURS);
const capacityScale = Array.from({ length: DAILY_UTILIZATION_TARGET_HOURS }, (_, hour) => hour);
const roleLabels: Record<RoleFilter, string> = { all: 'All', content: 'Content', design: 'Design' };

interface FreePoolContainerProps {
  users: User[];
  tasks: Task[];
  activeRoleTab?: RoleFilter;
  onAddTask: (userId: string, status?: TaskStatus) => void;
  onAssignBrief?: (task: Task, targetUserId: string) => void;
  onSelectUser?: (user: User) => void;
  isExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

export const FreePoolContainer: React.FC<FreePoolContainerProps> = ({
  users,
  tasks,
  activeRoleTab = 'all',
  onAddTask,
  onAssignBrief,
  onSelectUser,
  isExpanded,
  onExpandedChange,
}) => {
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [dragOverUserId, setDragOverUserId] = useState<string | null>(null);
  const [pickerUserId, setPickerUserId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pickerTriggerRef = useRef<HTMLButtonElement>(null);
  const pickerMenuRef = useRef<HTMLDivElement>(null);

  const closePicker = useCallback(() => setPickerUserId(null), []);
  const { position: pickerPos } = useAnchoredPopover({
    isOpen: Boolean(pickerUserId && isExpanded),
    triggerRef: pickerTriggerRef,
    popoverRef: pickerMenuRef,
    onClose: closePicker,
    align: 'right',
    gap: 6,
    fallbackWidth: 240,
    fallbackHeight: 140,
  });

  useEffect(() => {
    if (!isExpanded) {
      setPickerUserId(null);
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && containerRef.current?.contains(event.target as Node)) {
        event.preventDefault();
        onExpandedChange(false);
        triggerRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isExpanded, onExpandedChange]);

  useEffect(() => {
    if (!pickerUserId || !isExpanded) return;
    const focusTimer = window.setTimeout(() => {
      const firstItem = pickerMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])');
      firstItem?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(focusTimer);
  }, [pickerUserId, isExpanded]);

  const { freeUsers, userStats, unassignedByTeam, unassignedTotal } = useMemo(() => {
    const inReviewCounts = new Map<string, number>();
    const pipelineCounts = new Map<string, number>();
    const unassignedContent: Task[] = [];
    const unassignedDesign: Task[] = [];

    for (const t of tasks) {
      if (!t) continue;
      const assignees = getTaskAssigneeIds(t);
      if (t.status === 'pipeline' && assignees.length === 0) {
        if (t.team === 'design') unassignedDesign.push(t);
        else unassignedContent.push(t);
      }
      for (const uid of assignees) {
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

    return {
      freeUsers: free,
      userStats: stats,
      unassignedByTeam: { content: unassignedContent, design: unassignedDesign },
      unassignedTotal: unassignedContent.length + unassignedDesign.length,
    };
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
    <div ref={containerRef} className="free-pool-root">
      <button
        id="free-pool-trigger"
        ref={triggerRef}
        type="button"
        aria-expanded={isExpanded}
        aria-controls="free-pool-popover"
        title="Show cross-board team capacity with under 3 hours/day assigned (Shortcut: f)"
        onClick={() => onExpandedChange(!isExpanded)}
        className="free-pool-trigger"
      >
        <UsersRound aria-hidden="true" className="size-3.5 shrink-0" />
        <span>Free Pool</span>
        <span className="free-pool-count">{freeUsers.length} available</span>
        {activeRoleTab !== 'all' && (
          <span className="hidden sm:inline text-[11px] font-medium text-[var(--text-secondary)]">
            · Cross-board ({activeRoleTab === 'content' ? contentCount : designCount} {roleLabels[activeRoleTab]})
          </span>
        )}
        <ChevronDown aria-hidden="true" className={`ml-auto size-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      <aside id="free-pool-popover" aria-label="Free Pool" hidden={!isExpanded}>
        <div className="free-pool-filters">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
            <span>Across boards · Under {targetHoursLabel} assigned today</span>
            {unassignedTotal > 0 && (
              <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                <span aria-hidden="true" className="hidden sm:inline mr-1">·</span>
                {unassignedTotal} unassigned pipeline brief{unassignedTotal === 1 ? '' : 's'} ready to assign{' '}
                <span className="hidden sm:inline">(drag here or click Assign brief)</span>
                <span className="sm:hidden">(tap Assign brief)</span>
              </span>
            )}
          </div>
          <div className="segmented-track" role="group" aria-label="Filter available members by discipline">
            {roleOptions.map(({ role, count }) => (
              <button
                key={role}
                type="button"
                aria-pressed={roleFilter === role}
                onClick={() => setRoleFilter(role)}
                className={`segmented-item tabular-nums ${roleFilter === role ? 'segmented-item-active' : ''}`}
              >
                {roleLabels[role]} ({count})
              </button>
            ))}
          </div>
        </div>

        <div className="free-pool-members" role="list" aria-label="Available members" tabIndex={0}>
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
              const matchingBriefs = user.role === 'design' ? unassignedByTeam.design : unassignedByTeam.content;
              const isDropTarget = dragOverUserId === user.id;

              return (
                <div
                  key={user.id}
                  role="listitem"
                  onDragOver={e => {
                    if (!onAssignBrief) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverUserId !== user.id) setDragOverUserId(user.id);
                  }}
                  onDragLeave={e => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node) && dragOverUserId === user.id) {
                      setDragOverUserId(null);
                    }
                  }}
                  onDrop={e => {
                    if (!onAssignBrief) return;
                    e.preventDefault();
                    setDragOverUserId(null);
                    let draggedTaskId = '';
                    try {
                      const raw = e.dataTransfer.getData('application/json');
                      if (raw) draggedTaskId = JSON.parse(raw).taskId || '';
                    } catch {
                      // fallback to text/plain
                    }
                    if (!draggedTaskId) draggedTaskId = e.dataTransfer.getData('text/plain');
                    const draggedTask = tasks.find(t => t.id === draggedTaskId);
                    if (draggedTask) {
                      onExpandedChange(false);
                      onAssignBrief(draggedTask, user.id);
                    }
                  }}
                  className={`free-pool-member transition-colors ${isDropTarget ? 'bg-[var(--accent-soft)]' : ''}`}
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
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-semibold text-[var(--text-primary)] truncate group-hover:underline group-focus-visible:underline">
                          {user.name}
                        </span>
                        <ArrowUpRight aria-hidden="true" className="size-3 shrink-0 text-[var(--text-secondary)]" />
                      </span>

                      <span id={hoursId} className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-[var(--text-secondary)] tabular-nums">
                        <span className="free-pool-hours-scale" aria-hidden="true">
                          {capacityScale.map(hour => (
                            <span key={hour}>
                              <span style={{ width: `${Math.max(0, Math.min(1, assignedHours - hour)) * 100}%` }} />
                            </span>
                          ))}
                        </span>
                        <span className="whitespace-nowrap">{tagInfo.label} · {assignedHoursLabel} assigned</span>
                        {stats && stats.inReview > 0 ? (
                          <span className="whitespace-nowrap">· {stats.inReview} in review</span>
                        ) : stats && stats.pipeline > 0 ? (
                          <span className="whitespace-nowrap">· {stats.pipeline} in pipeline</span>
                        ) : null}
                      </span>
                    </span>
                  </button>

                  <div className="flex items-center justify-end sm:justify-start gap-1.5 shrink-0 pl-9 sm:pl-0">
                    {onAssignBrief && matchingBriefs.length > 0 && (
                      <>
                        <button
                          ref={pickerUserId === user.id ? pickerTriggerRef : undefined}
                          type="button"
                          onClick={e => {
                            if (matchingBriefs.length === 1) {
                              setPickerUserId(null);
                              onExpandedChange(false);
                              onAssignBrief(matchingBriefs[0], user.id);
                            } else {
                              pickerTriggerRef.current = e.currentTarget;
                              setPickerUserId(prev => (prev === user.id ? null : user.id));
                            }
                          }}
                          aria-label={`Assign brief for ${user.name}`}
                          aria-haspopup={matchingBriefs.length > 1 ? 'menu' : undefined}
                          aria-expanded={matchingBriefs.length > 1 ? pickerUserId === user.id : undefined}
                          className="free-pool-row-action mobile-tap-control sm:min-h-0 flex shrink-0 items-center gap-1 rounded-[6px] bg-[var(--accent-soft)] px-2 text-[11px] font-semibold text-[#1d4ed8] dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-500/25 cursor-pointer"
                        >
                          <span>Assign brief{matchingBriefs.length > 1 ? ` (${matchingBriefs.length})` : ''}</span>
                        </button>
                        {pickerUserId === user.id && matchingBriefs.length > 1 && createPortal(
                          <div
                            ref={pickerMenuRef}
                            role="menu"
                            aria-label={`Select brief to assign to ${user.name}`}
                            style={
                              pickerPos
                                ? { top: `${pickerPos.top}px`, left: `${pickerPos.left}px` }
                                : { top: 0, left: 0, visibility: 'hidden' }
                            }
                            onKeyDown={e => {
                              handleRovingMenuKeyDown(e.nativeEvent, e.currentTarget);
                            }}
                            className="menu-surface fixed z-50 w-60 rounded-[8px] border border-[var(--border)] p-1 text-[var(--text-primary)]"
                          >
                            {matchingBriefs.map(brief => (
                              <button
                                key={brief.id}
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setPickerUserId(null);
                                  onExpandedChange(false);
                                  onAssignBrief(brief, user.id);
                                }}
                                className="menu-item cursor-pointer justify-between"
                              >
                                <span className="truncate">{brief.title}</span>
                                {brief.estimatedHours ? (
                                  <span className="text-[11px] text-[var(--text-muted)] tabular-nums shrink-0">{brief.estimatedHours}h</span>
                                ) : null}
                              </button>
                            ))}
                          </div>,
                          document.body
                        )}
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        onExpandedChange(false);
                        onAddTask(user.id, 'todo');
                      }}
                      aria-label={`Add task for ${user.name}`}
                      className="free-pool-row-action mobile-tap-control sm:min-h-0 flex shrink-0 items-center gap-1 rounded-[6px] border border-[var(--border)] px-2 text-[11px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
                    >
                      <Plus aria-hidden="true" className="size-3" />
                      Task
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
};

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Task, TaskStatus, Role } from '../types';
import { handleRovingMenuKeyDown, useAnchoredPopover } from '../hooks/useAnchoredPopover';
import { getDuePillInfo, formatDateOnly, formatCompletedDate, getCognitiveLoadLabel, getTaskBillableMs, formatBillableHours, formatBillableDetailed, getLocalOffsetDateKey, getTaskAssigneeCount, formatTaskStatus } from '../utils/workload';
import { getTaskTypeLabel, isValidHttpUrl } from '../utils/taskMetadata';
import {
  GripVertical,
  Clock,
  CheckCircle2,
  Edit2,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Archive,
  Timer,
  CopyPlus,
  CornerDownRight,
  ExternalLink,
  Link2,
  Users,
  MoreHorizontal,
  Flag,
  ArrowRight,
} from 'lucide-react';

interface TaskCardProps {
  task: Task;
  userRole?: Role;
  swimlaneUserId?: string;
  onEdit: (task: Task) => void;
  onUpdateTitle?: (taskId: string, newTitle: string) => void;
  onDelete: (taskId: string) => void;
  onMoveStatus: (taskId: string, newStatus: TaskStatus) => void;
  onReschedule?: (taskId: string, newDueDate: string | undefined) => void;
  onAdjustBillableHours?: (task: Task) => void;
  onDragStart?: (task: Task) => void;
  onDragEnd?: () => void;
  onDuplicateToBoard?: (task: Task) => void;
  canEdit?: boolean;
  isDraggable?: boolean;
}

const STATUS_SEQUENCE: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'done'];

export const TaskCard: React.FC<TaskCardProps> = React.memo(({
  task,
  userRole = 'content',
  swimlaneUserId,
  onEdit,
  onDelete,
  onMoveStatus,
  onReschedule,
  onAdjustBillableHours,
  onDragStart,
  onDragEnd,
  onDuplicateToBoard,
  canEdit = true,
  isDraggable = true,
}) => {
  const effectiveUserId = swimlaneUserId || task.userId;
  const canDuplicateToBoard = Boolean(onDuplicateToBoard);
  const effectivelyDraggable = isDraggable && canEdit;
  const assigneeCount = getTaskAssigneeCount(task);
  const sharedEstimatedHours =
    task.estimatedHours !== undefined && task.estimatedHours > 0
      ? Math.round((task.estimatedHours / assigneeCount) * 100) / 100
      : undefined;

  const [isDragging, setIsDragging] = useState(false);
  const [showSnoozeFlyout, setShowSnoozeFlyout] = useState(false);
  const [customDateDraft, setCustomDateDraft] = useState(task.dueDate || '');
  const snoozeRef = useRef<HTMLDivElement>(null);
  const snoozeTriggerRef = useRef<HTMLButtonElement>(null);
  const flyoutMenuRef = useRef<HTMLDivElement>(null);
  const closeSnoozeFlyout = useCallback(() => setShowSnoozeFlyout(false), []);
  const { position: flyoutPosition } = useAnchoredPopover({
    isOpen: showSnoozeFlyout && task.status !== 'done' && task.status !== 'archived',
    triggerRef: snoozeTriggerRef,
    popoverRef: flyoutMenuRef,
    onClose: closeSnoozeFlyout,
    align: 'left',
    gap: 4,
    fallbackWidth: 224,
    fallbackHeight: 240,
    dismissOnOutOfView: true,
  });

  // Synchronize draft date when flyout opens or task dueDate updates
  useEffect(() => {
    if (showSnoozeFlyout) {
      setCustomDateDraft(task.dueDate || '');
    }
  }, [showSnoozeFlyout, task.dueDate]);

  // Portaled mobile card overflow menu state
  const [cardMenu, setCardMenu] = useState<'actions' | 'move' | null>(null);
  const showMobileCardMenu = cardMenu !== null;
  const mobileCardMenuBtnRef = useRef<HTMLButtonElement>(null);
  const mobileCardMenuPopRef = useRef<HTMLDivElement>(null);
  const closeMobileCardMenu = useCallback(() => setCardMenu(null), []);
  const { position: mobileCardMenuPos, updatePosition: updateCardMenuPosition } = useAnchoredPopover({
    isOpen: showMobileCardMenu,
    triggerRef: mobileCardMenuBtnRef,
    popoverRef: mobileCardMenuPopRef,
    onClose: closeMobileCardMenu,
    align: 'right',
    gap: 4,
    fallbackWidth: 176,
    fallbackHeight: 132,
    dismissOnOutOfView: true,
  });

  useEffect(() => {
    if (!cardMenu) return;
    updateCardMenuPosition();
    const focusTimer = window.setTimeout(() => {
      const firstItem = mobileCardMenuPopRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])');
      firstItem?.focus({ preventScroll: true });
    }, 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        setCardMenu(null);
        return;
      }
      handleRovingMenuKeyDown(e, mobileCardMenuPopRef.current);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKey);
    };
  }, [cardMenu, updateCardMenuPosition]);

  // Live timer for in_progress billable hours
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (task.status === 'in_progress') {
      const interval = setInterval(() => setNow(Date.now()), 10000);
      return () => clearInterval(interval);
    }
  }, [task.status]);

  const billableMs = getTaskBillableMs(task, now);
  const sharedBillableMs = assigneeCount > 1 ? Math.round(billableMs / assigneeCount) : billableMs;

  // Focus first control and trap Tab inside Quick Reschedule popover
  useEffect(() => {
    if (!showSnoozeFlyout) return;
    const focusFrame = requestAnimationFrame(() => {
      const firstControl = flyoutMenuRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), input:not([disabled])'
      );
      firstControl?.focus({ preventScroll: true });
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && flyoutMenuRef.current) {
        const items = Array.from(
          flyoutMenuRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])')
        );
        if (items.length === 0) return;
        const idx = items.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && idx <= 0) {
          e.preventDefault();
          items.at(-1)?.focus();
        } else if (!e.shiftKey && (idx < 0 || idx === items.length - 1)) {
          e.preventDefault();
          items[0].focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [showSnoozeFlyout]);

  const isDoneOrArchived = task.status === 'done' || task.status === 'archived';
  const pillInfo = getDuePillInfo(task.dueDate);
  const cognitiveLabel = getCognitiveLoadLabel(task.cognitiveLoad, userRole);

  const handleApplyDate = (newDueDate: string) => {
    setShowSnoozeFlyout(false);
    if (onReschedule) {
      onReschedule(task.id, newDueDate);
    } else {
      onEdit({ ...task, dueDate: newDueDate });
    }
  };

  const handleSnooze = (daysToAdd: number) => {
    handleApplyDate(getLocalOffsetDateKey(daysToAdd));
  };

  const handleCustomDateSelect = (dateStr: string) => {
    if (!dateStr) return;
    handleApplyDate(dateStr);
  };

  // Next and Prev status for single-click progression
  const currentIdx = STATUS_SEQUENCE.indexOf(task.status);
  const nextStatus = currentIdx !== -1 && currentIdx < STATUS_SEQUENCE.length - 1 ? STATUS_SEQUENCE[currentIdx + 1] : null;
  const prevStatus = currentIdx > 0 ? STATUS_SEQUENCE[currentIdx - 1] : null;

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    const dragPayload = {
      taskId: task.id,
      status: task.status,
      userId: effectiveUserId,
      sourceUserId: effectiveUserId,
      order: task.order,
      title: task.title,
      dueDate: task.dueDate,
    };

    e.dataTransfer.setData('application/json', JSON.stringify(dragPayload));
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.effectAllowed = 'move';

    onDragStart?.(task);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    onDragEnd?.();
  };

  return (
    <motion.div
      id={`task-card-${effectiveUserId || 'unassigned'}-${task.id}`}
      initial={false}
      animate={{
        opacity: isDragging ? 0.35 : 1,
        scale: isDragging ? 0.985 : 1,
      }}
      transition={{ duration: 0.14, ease: [0.2, 0.7, 0.2, 1] }}
      draggable={effectivelyDraggable}
      onDragStartCapture={handleDragStart}
      onDragEndCapture={handleDragEnd}
      className={`task-card group relative p-2.5 select-none transform-gpu flex flex-col ${showSnoozeFlyout || showMobileCardMenu ? 'z-40' : 'z-0'
        } ${isDragging
          ? 'border-[#1d4ed8] dark:border-blue-400 bg-blue-50/50 dark:bg-blue-950/20 ring-2 ring-blue-500/20'
          : task.status === 'done'
            ? 'bg-[var(--surface-subtle)]'
            : ''
        }`}
    >
      {/* Task Title */}
      <div className="order-4 flex items-start justify-between gap-1.5">
        <h5 className="text-[13px] font-semibold leading-snug flex-1 min-w-0">
          <button
            type="button"
            onClick={() => onEdit(task)}
            title="Click to open task details"
            className={`mobile-tap-control sm:min-h-0 w-full text-left cursor-pointer rounded px-1 -mx-1 py-0.5 hover:bg-[var(--surface-subtle)] transition-colors group/title flex items-center justify-between gap-1.5 ${task.status === 'done'
              ? 'line-through text-[var(--text-secondary)] font-medium'
              : 'text-[var(--text-primary)] hover:text-[#1d4ed8] dark:hover:text-blue-400'
              }`}
          >
            <span className="break-words">{task.title}</span>
          </button>
        </h5>

      </div>

      {/* Top row: Drag grip, explicit load, shared ratio, and right-aligned tabular hours */}
      <div className={`order-1 flex flex-wrap items-center justify-between gap-y-1 mb-1 ${assigneeCount > 1 ? 'gap-1' : 'gap-1.5'}`}>
        <div className={`flex items-center min-w-0 flex-nowrap whitespace-nowrap text-[11px] ${assigneeCount > 1 ? 'gap-1' : 'gap-1.5'}`}>
          {canEdit && (
            <div
              title="Drag to move, reorder, or assign to another team member"
              className="hidden sm:block cursor-grab active:cursor-grabbing text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors shrink-0 -ml-1"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </div>
          )}

          {/* Explicit Cognitive Load Indicator */}
          <span
            title={`Cognitive Load: ${cognitiveLabel}`}
            className="inline-flex items-center gap-1 font-semibold text-[var(--text-secondary)] capitalize whitespace-nowrap"
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full shrink-0 ${task.cognitiveLoad === 'high'
                ? 'bg-red-600 dark:bg-red-400'
                : task.cognitiveLoad === 'medium'
                  ? 'bg-amber-600 dark:bg-amber-400'
                  : 'bg-emerald-600 dark:bg-emerald-400'
                }`}
            />
            <span
              className={
                task.cognitiveLoad === 'high'
                  ? 'text-red-700 dark:text-red-400'
                  : task.cognitiveLoad === 'medium'
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-[var(--text-secondary)]'
              }
            >
              {`${task.cognitiveLoad} load`}
            </span>
          </span>
        </div>

        {/* Top Right: Tabular Estimate / Billable Duration (never overlapped by hover actions) */}
        <div className={`flex items-center shrink-0 ${assigneeCount > 1 ? 'gap-1' : 'gap-1.5'}`}>

          {assigneeCount > 1 && (
            <span
              title={`Shared task across ${assigneeCount} assignees (workload & time divided evenly)`}
              className="inline-flex items-center gap-0.5 text-[11px] tabular-nums font-semibold text-emerald-700 dark:text-emerald-400 shrink-0"
            >
              <Users className="h-2.5 w-2.5" />
              <span>1/{assigneeCount}</span>
            </span>
          )}

          {sharedEstimatedHours !== undefined && (
            <span
              title={
                assigneeCount > 1
                  ? `Your share: ${sharedEstimatedHours}h (${task.estimatedHours}h total split across ${assigneeCount} assignees)`
                  : `Estimated: ${task.estimatedHours}h`
              }
              className={`text-[11px] font-medium tabular-nums shrink-0 ${
                task.status === 'done' ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]'
              }`}
            >
              {sharedEstimatedHours}h est
            </span>
          )}
          {billableMs > 0 || task.status === 'in_progress' ? (
            canEdit ? (
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onAdjustBillableHours?.(task);
                }}
                aria-label={
                  assigneeCount > 1
                    ? `Adjust billable duration for ${task.title} (${formatBillableHours(sharedBillableMs)} share of ${formatBillableHours(billableMs)} total)`
                    : `Adjust billable duration for ${task.title} (${formatBillableHours(sharedBillableMs)})`
                }
                title={
                  assigneeCount > 1
                    ? `Your billable share: ${formatBillableDetailed(sharedBillableMs)} (${formatBillableDetailed(billableMs)} total across ${assigneeCount} assignees) · Click to correct hours`
                    : `Billable Duration: ${formatBillableDetailed(sharedBillableMs)} · Click to correct hours`
                }
                className="mobile-tap-square sm:!min-w-0 sm:min-h-0 -my-2.5 sm:my-0 inline-flex items-center justify-center shrink-0 cursor-pointer group/timer"
              >
                <span
                  className={`inline-flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums select-none transition-colors ${task.status === 'in_progress'
                    ? 'bg-[var(--accent-soft)] text-[#1d4ed8] dark:text-blue-300 group-hover/timer:bg-blue-100 dark:group-hover/timer:bg-blue-500/25'
                    : 'text-[var(--text-secondary)] group-hover/timer:bg-[var(--surface-subtle)] group-hover/timer:text-[var(--text-primary)]'
                    }`}
                >
                  <Timer className={`h-2.5 w-2.5 ${task.status === 'in_progress' ? 'text-[#1d4ed8] dark:text-blue-400' : 'text-[var(--text-muted)] group-hover/timer:text-[#1d4ed8]'}`} />
                  <span>{formatBillableHours(sharedBillableMs)}</span>
                </span>
              </button>
            ) : (
              <span
                title={
                  assigneeCount > 1
                    ? `Billable share: ${formatBillableDetailed(sharedBillableMs)} (${formatBillableDetailed(billableMs)} total across ${assigneeCount} assignees)`
                    : `Billable Duration: ${formatBillableDetailed(sharedBillableMs)}`
                }
                className={`inline-flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums select-none shrink-0 ${
                  task.status === 'in_progress'
                    ? 'bg-[var(--accent-soft)] text-[#1d4ed8] dark:text-blue-300'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                <Timer className={`h-2.5 w-2.5 ${task.status === 'in_progress' ? 'text-[#1d4ed8] dark:text-blue-400' : 'text-[var(--text-secondary)]'}`} />
                <span>{formatBillableHours(sharedBillableMs)}</span>
              </span>
            )
          ) : canEdit ? (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onAdjustBillableHours?.(task);
              }}
              aria-label={`Log billable hours for ${task.title}`}
              title="Click to log billable hours"
              className="mobile-tap-square sm:!min-w-0 sm:min-h-0 -my-2.5 sm:my-0 inline-flex items-center justify-center shrink-0 cursor-pointer group/timer"
            >
              <span className="inline-flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-[11px] font-medium tabular-nums bg-[var(--surface-subtle)] border border-transparent group-hover/timer:border-[var(--border)] text-[var(--text-secondary)] group-hover/timer:text-[var(--text-primary)] transition-colors">
                <Timer className="h-2.5 w-2.5" />
                <span>0h</span>
              </span>
            </button>
          ) : null}
        {canEdit && (
          <div className="relative card-actions shrink-0">
            <button
              ref={mobileCardMenuBtnRef}
              type="button"
              aria-haspopup="menu"
              aria-expanded={showMobileCardMenu}
              aria-label={`Actions for ${task.title}`}
              title={`Task actions for ${task.title}`}
              onClick={e => {
                e.stopPropagation();
                setCardMenu(prev => prev ? null : 'actions');
              }}
              className="mobile-tap-square sm:!min-w-0 sm:!min-h-0 inline-flex items-center justify-center rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <MoreHorizontal className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            </button>
            {showMobileCardMenu && createPortal(
              <div
                ref={mobileCardMenuPopRef}
                role="menu"
                aria-label={`${cardMenu === 'move' ? 'Move' : 'Actions for'} ${task.title}`}
                style={
                  mobileCardMenuPos
                    ? { top: `${mobileCardMenuPos.top}px`, left: `${mobileCardMenuPos.left}px` }
                    : { top: 0, left: 0, visibility: 'hidden' }
                }
                onClick={e => e.stopPropagation()}
                className="menu-surface fixed z-50 w-44 rounded-[9px] border border-[var(--border)] p-1 text-[var(--text-primary)]"
              >
                {cardMenu === 'move' ? (
                  <>
                    <button type="button" role="menuitem" className="menu-item cursor-pointer" onClick={() => setCardMenu('actions')}>
                      <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />
                      Back to actions
                    </button>
                    {STATUS_SEQUENCE.filter(status => status !== task.status).map(status => (
                      <button key={status} type="button" role="menuitem" className="menu-item cursor-pointer"
                        onClick={() => {
                          const trigger = mobileCardMenuBtnRef.current;
                          const card = trigger?.closest<HTMLElement>('.task-card');
                          const lane = card?.closest<HTMLElement>('[id^="swimlane-"]');
                          trigger?.focus({ preventScroll: true });
                          setCardMenu(null);
                          onMoveStatus(task.id, status);
                          requestAnimationFrame(() => {
                            if (document.activeElement !== trigger && document.activeElement !== document.body) return;
                            const movedCard = card && Array.from(lane?.querySelectorAll<HTMLElement>(`#${CSS.escape(card.id)}`) ?? [])
                              .find(candidate => candidate !== card);
                            if (movedCard?.getClientRects().length) {
                              movedCard.querySelector<HTMLElement>('.card-actions button')?.focus();
                            } else if (movedCard || !trigger?.isConnected) {
                              lane?.focus({ preventScroll: true });
                            }
                          });
                        }}>
                        {formatTaskStatus(status)}
                      </button>
                    ))}
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setCardMenu(null);
                        onEdit(task);
                      }}
                      className="menu-item cursor-pointer"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      <span>Edit Details</span>
                    </button>
                    <button type="button" role="menuitem" className="menu-item cursor-pointer" onClick={() => setCardMenu('move')}>
                      <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                      <span>Move</span>
                    </button>
                    {canDuplicateToBoard && onDuplicateToBoard && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setCardMenu(null);
                          onDuplicateToBoard(task);
                        }}
                        className="menu-item cursor-pointer text-[#1d4ed8] dark:text-blue-400"
                      >
                        <CopyPlus className="h-3.5 w-3.5" />
                        <span>Create Subtask</span>
                      </button>
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setCardMenu(null);
                        onDelete(task.id);
                      }}
                      className="menu-item cursor-pointer text-red-600 dark:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete Task</span>
                    </button>
                  </>
                )}
              </div>,
              document.body
            )}
          </div>
        )}
        </div>
      </div>

      {/* Subtask Hierarchy Indicator */}
      {task.isSubtask && (
        <div
          className="order-3 mb-1 flex items-center gap-1 text-[11px] text-[#1d4ed8] dark:text-blue-400 font-medium truncate"
          title={`Subtask of: ${task.parentTaskTitle || 'Parent Task'}`}
        >
          <CornerDownRight className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{task.parentTaskTitle || 'Parent Task'}</span>
        </div>
      )}

      {getTaskTypeLabel(task, userRole) && (
        <div className="order-2 text-[11px] text-[var(--text-secondary)] break-words">
          {getTaskTypeLabel(task, userRole)}
        </div>
      )}

      {/* Client & Project Single Line */}
      {(task.client || task.project) && (
        <div className="order-3 mb-0.5 flex items-center gap-1 text-[11px] text-[var(--text-secondary)] truncate">
          {task.client && (
            <span className="font-semibold text-[var(--text-primary)] truncate">
              {task.client}
            </span>
          )}
          {task.client && task.project && (
            <span className={task.status === 'done' ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]'}>
              ·
            </span>
          )}
          {task.project && (
            <span className="truncate">
              {task.project}
            </span>
          )}
        </div>
      )}


      {/* Optional Context snippet */}
      {task.description && (
        <p className="order-5 mt-0.5 text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
          {task.description}
        </p>
      )}

      {/* Quiet External Links Row (replaces competing colored pill badges) */}
      {((task.brandGuidelines && isValidHttpUrl(task.brandGuidelines)) ||
        (task.contentDocLink && isValidHttpUrl(task.contentDocLink)) ||
        (task.clickupUrl && isValidHttpUrl(task.clickupUrl))) && (
        <div className="order-5 mt-1.5 flex items-center gap-2.5 flex-wrap text-[11px]" onClick={e => e.stopPropagation()}>
          {task.brandGuidelines && isValidHttpUrl(task.brandGuidelines) && (
            <a
              href={task.brandGuidelines}
              target="_blank"
              rel="noopener noreferrer"
              title={`Brand Guidelines: ${task.brandGuidelines}`}
              className="inline-flex items-center gap-1 font-medium text-[#1d4ed8] dark:text-blue-400 hover:underline"
            >
              <Link2 className="h-2.5 w-2.5 shrink-0" />
              <span>Brand</span>
              <ExternalLink className="h-2.5 w-2.5 shrink-0" />
            </a>
          )}
          {task.contentDocLink && isValidHttpUrl(task.contentDocLink) && (
            <a
              href={task.contentDocLink}
              target="_blank"
              rel="noopener noreferrer"
              title={`Content Doc: ${task.contentDocLink}`}
              className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
            >
              <Link2 className="h-2.5 w-2.5 shrink-0" />
              <span>Doc</span>
              <ExternalLink className="h-2.5 w-2.5 shrink-0" />
            </a>
          )}
          {task.clickupUrl && isValidHttpUrl(task.clickupUrl) && (
            <a
              href={task.clickupUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in ClickUp"
              className="inline-flex items-center gap-1 font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline"
            >
              <span>ClickUp</span>
              <ExternalLink className="h-2.5 w-2.5 shrink-0" />
            </a>
          )}
        </div>
      )}

      {/* Bottom Ruled Metadata Row: Deadline, Priority Flag & Quick Status Stepper */}
      <div className="order-5 mt-2 flex items-center justify-between gap-2 pt-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="relative flex items-center" ref={snoozeRef}>
          {isDoneOrArchived ? (
            <div
              title={
                task.completedAt
                  ? `Completed on ${new Date(task.completedAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}`
                  : 'Completed'
              }
              className="inline-flex items-center gap-1 text-[11px] leading-none font-medium tabular-nums text-[var(--text-secondary)] select-none"
            >
              <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{formatCompletedDate(task.completedAt || task.updatedAt)}</span>
            </div>
          ) : canEdit ? (
            <button
              ref={snoozeTriggerRef}
              type="button"
              aria-expanded={showSnoozeFlyout}
              onClick={e => {
                e.stopPropagation();
                setShowSnoozeFlyout(prev => !prev);
              }}
              title={`${pillInfo.label} — Click to adjust deadline`}
              className={`mobile-tap-control sm:min-h-0 inline-flex items-center gap-1 text-[11px] leading-none tabular-nums transition-colors cursor-pointer ${
                pillInfo.iconClass.includes('red')
                  ? 'font-bold text-red-600 dark:text-red-400'
                  : pillInfo.iconClass.includes('orange') || pillInfo.iconClass.includes('amber') || pillInfo.iconClass.includes('yellow')
                  ? 'font-semibold text-amber-700 dark:text-amber-400'
                  : 'font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Clock className="h-3 w-3 shrink-0" />
              <span>{formatDateOnly(task.dueDate)}</span>
            </button>
          ) : (
            <span
              title={pillInfo.label}
              className={`inline-flex items-center gap-1 text-[11px] leading-none tabular-nums select-none ${
                pillInfo.iconClass.includes('red')
                  ? 'font-bold text-red-600 dark:text-red-400'
                  : pillInfo.iconClass.includes('orange') || pillInfo.iconClass.includes('amber') || pillInfo.iconClass.includes('yellow')
                  ? 'font-semibold text-amber-700 dark:text-amber-400'
                  : 'font-medium text-[var(--text-secondary)]'
              }`}
            >
              <Clock className="h-3 w-3 shrink-0" />
              <span>{formatDateOnly(task.dueDate)}</span>
            </span>
          )}

          {/* Quick Reschedule Snooze Flyout Rendered via React Portal at high z-index (editable active columns only) */}
          {canEdit && !isDoneOrArchived && showSnoozeFlyout && createPortal(
            <div
              ref={flyoutMenuRef}
              role="dialog"
              aria-label="Quick reschedule deadline"
              style={
                flyoutPosition
                  ? { top: `${flyoutPosition.top}px`, left: `${flyoutPosition.left}px` }
                  : { top: 0, left: 0, visibility: 'hidden' }
              }
              onClick={e => e.stopPropagation()}
              className="menu-surface fixed z-[9999] w-64 sm:w-56 rounded-[9px] border border-[var(--border)] p-1.5 text-[var(--text-primary)]"
            >
              <div className="px-2 py-1 border-b border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider flex items-center justify-between">
                <span>Quick Reschedule</span>
                <Clock className="h-3 w-3 text-[#1d4ed8] dark:text-blue-400" />
              </div>
              <div className="mt-1 space-y-0.5">
                <button
                  type="button"
                  onClick={() => handleSnooze(0)}
                  className="mobile-tap-control sm:min-h-[28px] flex w-full items-center justify-between rounded-[6px] px-2 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] cursor-pointer transition-colors"
                >
                  <span>Today</span>
                  <span className="text-[11px] tabular-nums text-[var(--text-muted)]">+0d</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSnooze(1)}
                  className="mobile-tap-control sm:min-h-[28px] flex w-full items-center justify-between rounded-[6px] px-2 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] cursor-pointer transition-colors"
                >
                  <span>Tomorrow</span>
                  <span className="text-[11px] tabular-nums text-[var(--text-muted)]">+1d</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSnooze(3)}
                  className="mobile-tap-control sm:min-h-[28px] flex w-full items-center justify-between rounded-[6px] px-2 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] cursor-pointer transition-colors"
                >
                  <span>In 3 days</span>
                  <span className="text-[11px] tabular-nums text-[var(--text-muted)]">+3d</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSnooze(7)}
                  className="mobile-tap-control sm:min-h-[28px] flex w-full items-center justify-between rounded-[6px] px-2 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] cursor-pointer transition-colors"
                >
                  <span>Next week</span>
                  <span className="text-[11px] tabular-nums text-[var(--text-muted)]">+1w</span>
                </button>

                {/* Custom date picker input */}
                <div className="pt-1.5 mt-1 border-t border-[var(--border-subtle)] px-1.5 pb-1">
                  <label htmlFor={`snooze-date-${effectiveUserId || 'u'}-${task.id}`} className="block text-[11px] uppercase tracking-wider font-semibold text-[var(--text-secondary)] mb-1">
                    Pick Date
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      id={`snooze-date-${effectiveUserId || 'u'}-${task.id}`}
                      type="date"
                      aria-label="Custom deadline date"
                      value={customDateDraft}
                      onChange={e => setCustomDateDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && customDateDraft) {
                          e.preventDefault();
                          handleCustomDateSelect(customDateDraft);
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          setShowSnoozeFlyout(false);
                          snoozeTriggerRef.current?.focus({ preventScroll: true });
                        }
                      }}
                      className="mobile-tap-control sm:min-h-[28px] flex-1 min-w-0 rounded-[5px] border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-[11px] tabular-nums text-[var(--text-primary)] cursor-pointer focus:border-[var(--accent)] focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={!customDateDraft}
                      onClick={() => handleCustomDateSelect(customDateDraft)}
                      title="Set deadline"
                      className="mobile-tap-control sm:min-h-[28px] shrink-0 rounded-[5px] bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed"
                    >
                      Set
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )}
          </div>

          {task.priority && (
            <span
              title={`${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)} priority`}
              className={`inline-flex items-center gap-0.5 leading-none shrink-0 text-[11px] font-semibold capitalize ${
                task.priority === 'high'
                  ? 'text-red-600 dark:text-red-400'
                  : task.priority === 'medium'
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-[var(--text-muted)]'
              }`}
            >
              <Flag
                aria-hidden="true"
                className={`h-3 w-3 shrink-0 ${
                  task.priority === 'high'
                    ? 'fill-red-500/20'
                    : task.priority === 'medium'
                    ? 'fill-amber-500/20'
                    : ''
                }`}
              />
              <span>{task.priority === 'medium' ? 'Med' : task.priority}</span>
            </span>
          )}
        </div>

        {/* Quick status stepper button (hidden for read-only viewers) */}
        {canEdit && (
        <div className="flex items-center gap-1">
          {prevStatus && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onMoveStatus(task.id, prevStatus);
              }}
              title={`Move back to ${prevStatus.replace('_', ' ')}`}
              aria-label={`Move back to ${prevStatus.replace('_', ' ')}`}
              className="mobile-tap-square rounded-[5px] p-1 sm:min-h-0 min-w-[44px] sm:min-w-0 flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
          )}

          {nextStatus ? (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onMoveStatus(task.id, nextStatus);
              }}
              title={`Advance to ${nextStatus === 'done' ? 'Sent' : nextStatus.replace('_', ' ')}`}
              className="mobile-tap-control inline-flex items-center gap-0.5 rounded-[5px] bg-[var(--surface-subtle)] hover:bg-[var(--border)] px-2 sm:px-1.5 py-1 sm:py-0.5 sm:min-h-0 text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <span className="capitalize">{nextStatus === 'done' ? 'Sent' : nextStatus.replace('_', ' ')}</span>
              <ChevronRight className="h-2.5 w-2.5" />
            </button>
          ) : task.status === 'done' ? (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onMoveStatus(task.id, 'archived');
              }}
              title="Archive sent task"
              className="mobile-tap-control inline-flex items-center gap-1 rounded-[5px] bg-[var(--surface-subtle)] hover:bg-[var(--border)] px-2 sm:px-1.5 py-1 sm:py-0.5 sm:min-h-0 text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <Archive className="h-2.5 w-2.5" />
              <span>Archive</span>
            </button>
          ) : null}
        </div>
        )}
      </div>
    </motion.div>
  );
});

TaskCard.displayName = 'TaskCard';


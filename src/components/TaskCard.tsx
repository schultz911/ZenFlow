import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Task, TaskStatus, Role } from '../types';
import { getDuePillInfo, formatDateOnly, formatCompletedDate, getCognitiveLoadLabel, getTaskBillableMs, formatBillableHours, formatBillableDetailed, getLastDayOfMonth, getTaskAssigneeCount } from '../utils/workload';
import { isValidHttpUrl } from '../utils/taskMetadata';
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
  onUpdateTitle,
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
  const [flyoutPosition, setFlyoutPosition] = useState<{ top: number; left: number } | null>(null);
  const [customDateDraft, setCustomDateDraft] = useState(task.dueDate || '');
  const snoozeRef = useRef<HTMLDivElement>(null);
  const flyoutMenuRef = useRef<HTMLDivElement>(null);

  // Synchronize draft date when flyout opens or task dueDate updates
  useEffect(() => {
    if (showSnoozeFlyout) {
      setCustomDateDraft(task.dueDate || '');
    }
  }, [showSnoozeFlyout, task.dueDate]);

  // Inline Title Editing state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Live timer for in_progress billable hours
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (task.status === 'in_progress') {
      const interval = setInterval(() => setNow(Date.now()), 10000);
      return () => clearInterval(interval);
    }
  }, [task.status]);

  const billableMs = getTaskBillableMs(task, now);

  useEffect(() => {
    if (!isEditingTitle) {
      setTitleDraft(task.title);
    }
  }, [task.title, isEditingTitle]);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  const handleCommitTitle = useCallback(() => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== task.title) {
      if (onUpdateTitle) {
        onUpdateTitle(task.id, trimmed);
      } else {
        onEdit({ ...task, title: trimmed });
      }
    } else {
      setTitleDraft(task.title);
    }
    setIsEditingTitle(false);
  }, [titleDraft, task, onUpdateTitle, onEdit]);

  const handleCancelTitle = useCallback(() => {
    setTitleDraft(task.title);
    setIsEditingTitle(false);
  }, [task.title]);

  const updateFlyoutPosition = useCallback(() => {
    if (!snoozeRef.current) return;
    const rect = snoozeRef.current.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      setShowSnoozeFlyout(false);
      return;
    }
    const measuredHeight = flyoutMenuRef.current?.offsetHeight;
    const popupHeight = measuredHeight && measuredHeight > 50 ? measuredHeight : 226;
    const popupWidth = flyoutMenuRef.current?.offsetWidth || 208;
    const openAbove = rect.top >= popupHeight + 10;
    const top = openAbove ? rect.top - popupHeight - 4 : rect.bottom + 4;
    const left = Math.max(10, Math.min(rect.left, window.innerWidth - popupWidth - 10));
    setFlyoutPosition({ top, left });
  }, []);

  // Synchronously adjust flyout positioning to exact rendered height before paint
  useLayoutEffect(() => {
    if (showSnoozeFlyout) {
      updateFlyoutPosition();
    }
  }, [showSnoozeFlyout, updateFlyoutPosition]);

  // Dismiss snooze flyout on click outside; keep anchored on scroll/resize
  useEffect(() => {
    if (!showSnoozeFlyout) return;
    updateFlyoutPosition();

    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        snoozeRef.current && !snoozeRef.current.contains(target) &&
        flyoutMenuRef.current && !flyoutMenuRef.current.contains(target)
      ) {
        setShowSnoozeFlyout(false);
      }
    };

    const handleScroll = (e: Event) => {
      // Do not close or interrupt if scroll originates inside the flyout or datepicker
      if (e.target && flyoutMenuRef.current && flyoutMenuRef.current.contains(e.target as Node)) {
        return;
      }
      const targetEl = e.target as HTMLElement;
      if (targetEl && (targetEl.tagName === 'INPUT' || targetEl.getAttribute?.('type') === 'date')) {
        return;
      }
      updateFlyoutPosition();
    };

    const handleResize = () => {
      updateFlyoutPosition();
    };

    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);

    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [showSnoozeFlyout, updateFlyoutPosition]);

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
    const target = new Date();
    target.setDate(target.getDate() + daysToAdd);
    const yyyy = target.getFullYear();
    const mm = String(target.getMonth() + 1).padStart(2, '0');
    const dd = String(target.getDate()).padStart(2, '0');
    handleApplyDate(`${yyyy}-${mm}-${dd}`);
  };

  const handleEndOfMonth = () => {
    handleApplyDate(getLastDayOfMonth());
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
    if (isEditingTitle) {
      e.preventDefault();
      return;
    }
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
      id={`task-card-${task.id}`}
      initial={false}
      animate={{
        opacity: isDragging ? 0.35 : 1,
        scale: isDragging ? 0.985 : 1,
      }}
      transition={{ duration: 0.14, ease: [0.2, 0.7, 0.2, 1] }}
      draggable={effectivelyDraggable && !isEditingTitle}
      onDragStartCapture={handleDragStart}
      onDragEndCapture={handleDragEnd}
      className={`task-card group relative p-2.5 select-none transform-gpu ${showSnoozeFlyout ? 'z-40' : 'z-0'
        } ${isDragging
          ? 'border-[#1d4ed8] dark:border-blue-400 bg-blue-50/50 dark:bg-blue-950/20 ring-2 ring-blue-500/20'
          : task.status === 'done'
            ? 'bg-[var(--surface-muted)] opacity-70'
            : ''
        }`}
    >
      {/* Top row: Drag grip, quiet cognitive-load dot & label, shared ratio, and right-aligned tabular hours + hover actions */}
      <div className="flex items-center justify-between gap-1.5 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap text-[11px]">
          {canEdit && (
            <div
              title="Drag to move, reorder, or assign to another team member"
              className="cursor-grab active:cursor-grabbing text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors shrink-0 -ml-1"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </div>
          )}

          {/* Quiet Cognitive Load Indicator (no noisy pill box) */}
          <span
            title={`Cognitive Load: ${cognitiveLabel}`}
            className="inline-flex items-center gap-1 font-semibold text-[var(--text-secondary)] capitalize"
          >
            <span
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
              {task.cognitiveLoad}
            </span>
          </span>

          {assigneeCount > 1 && (
            <span
              title={`Shared task across ${assigneeCount} assignees (workload & time divided evenly)`}
              className="inline-flex items-center gap-0.5 tabular-nums font-semibold text-emerald-700 dark:text-emerald-400"
            >
              <span className="text-[var(--text-muted)] mr-0.5">·</span>
              <Users className="h-2.5 w-2.5" />
              <span>1/{assigneeCount}</span>
            </span>
          )}
        </div>

        {/* Top Right: Quick Hover Actions & Tabular Estimate / Billable Duration */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center card-actions opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity gap-0.5 shrink-0">
            {canDuplicateToBoard && onDuplicateToBoard && (
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onDuplicateToBoard(task);
                }}
                title="Create and assign subtask"
                className="rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[#1d4ed8] dark:hover:text-blue-400 transition-colors cursor-pointer"
              >
                <CopyPlus className="h-3 w-3" />
              </button>
            )}
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onEdit(task);
              }}
              title="Edit task details"
              className="rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <Edit2 className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onDelete(task.id);
              }}
              title="Delete task"
              className="rounded p-1 text-[var(--text-secondary)] hover:bg-red-50 dark:hover:bg-red-500/15 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>

          {sharedEstimatedHours !== undefined && (
            <span
              title={
                assigneeCount > 1
                  ? `Your share: ${sharedEstimatedHours}h (${task.estimatedHours}h total split across ${assigneeCount} assignees)`
                  : `Estimated: ${task.estimatedHours}h`
              }
              className="text-[11px] font-medium text-[var(--text-muted)] tabular-nums shrink-0"
            >
              {sharedEstimatedHours}h
            </span>
          )}
          {billableMs > 0 || task.status === 'in_progress' ? (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onAdjustBillableHours?.(task);
              }}
              title={`Billable Duration: ${formatBillableDetailed(billableMs)} · Click to correct hours`}
              className={`inline-flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums select-none transition-colors cursor-pointer shrink-0 group/timer ${task.status === 'in_progress'
                ? 'bg-[var(--accent-soft)] text-[#1d4ed8] dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-500/25'
                : 'text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]'
                }`}
            >
              <Timer className={`h-2.5 w-2.5 ${task.status === 'in_progress' ? 'text-[#1d4ed8] dark:text-blue-400' : 'text-[var(--text-muted)] group-hover/timer:text-[#1d4ed8]'}`} />
              <span>{formatBillableHours(billableMs)}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onAdjustBillableHours?.(task);
              }}
              title="Click to log billable hours"
              className="card-actions opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 inline-flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-[11px] font-medium tabular-nums border border-dashed border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] transition-colors cursor-pointer shrink-0"
            >
              <Timer className="h-2.5 w-2.5" />
              <span>0h</span>
            </button>
          )}
        </div>
      </div>

      {/* Subtask Hierarchy Indicator */}
      {task.isSubtask && (
        <div
          className="mb-1 flex items-center gap-1 text-[11px] text-[#1d4ed8] dark:text-blue-400 font-medium truncate"
          title={`Subtask of: ${task.parentTaskTitle || 'Parent Task'}`}
        >
          <CornerDownRight className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{task.parentTaskTitle || 'Parent Task'}</span>
        </div>
      )}

      {/* Client & Project Single Line */}
      {(task.client || task.project) && (
        <div className="mb-0.5 flex items-center gap-1 text-[11px] text-[var(--text-secondary)] truncate">
          {task.client && (
            <span className="font-semibold text-[var(--text-primary)] truncate">
              {task.client}
            </span>
          )}
          {task.client && task.project && <span className="text-[var(--text-muted)]">·</span>}
          {task.project && (
            <span className="truncate">
              {task.project}
            </span>
          )}
        </div>
      )}

      {/* Task Title (Inline Editable on click without modal) */}
      {isEditingTitle ? (
        <div className="my-1" onClick={e => e.stopPropagation()}>
          <input
            ref={titleInputRef}
            type="text"
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCommitTitle();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                handleCancelTitle();
              }
            }}
            onBlur={handleCommitTitle}
            className="w-full text-[13px] font-semibold leading-snug rounded-[5px] border border-[var(--accent)] bg-[var(--surface)] px-2 py-1 text-[var(--text-primary)] focus:outline-none"
          />
          <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] mt-1 px-0.5 select-none">
            <span>Enter to save</span>
            <span>Esc to cancel</span>
          </div>
        </div>
      ) : (
        <h4
          onClick={e => {
            e.stopPropagation();
            setIsEditingTitle(true);
          }}
          title="Click to edit task title directly"
          className={`text-[13px] font-semibold leading-snug cursor-text rounded px-1 -mx-1 py-0.5 hover:bg-[var(--surface-subtle)] transition-colors group/title flex items-center justify-between gap-1.5 ${task.status === 'done'
            ? 'line-through text-[var(--text-secondary)] font-medium'
            : 'text-[var(--text-primary)] hover:text-[#1d4ed8] dark:hover:text-blue-400'
            }`}
        >
          <span className="break-words">{task.title}</span>
          <Edit2 className="h-2.5 w-2.5 opacity-0 group-hover/title:opacity-60 shrink-0 text-[var(--text-secondary)]" />
        </h4>
      )}

      {/* Optional Context snippet */}
      {task.description && (
        <p className="mt-0.5 text-[11px] text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
          {task.description}
        </p>
      )}

      {/* Quiet External Links Row (replaces competing colored pill badges) */}
      {((task.brandGuidelines && isValidHttpUrl(task.brandGuidelines)) ||
        (task.contentDocLink && isValidHttpUrl(task.contentDocLink)) ||
        (task.clickupUrl && isValidHttpUrl(task.clickupUrl))) && (
        <div className="mt-1.5 flex items-center gap-2.5 flex-wrap text-[11px]" onClick={e => e.stopPropagation()}>
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

      {/* Bottom Ruled Metadata Row: Deadline & Quick Status Stepper */}
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-1.5">
        <div className="relative" ref={snoozeRef}>
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
              className="inline-flex items-center gap-1 text-[11px] font-medium tabular-nums text-[var(--text-secondary)] select-none"
            >
              <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{formatCompletedDate(task.completedAt || task.updatedAt)}</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                setShowSnoozeFlyout(prev => {
                  const next = !prev;
                  if (next) {
                    updateFlyoutPosition();
                  }
                  return next;
                });
              }}
              title={`${pillInfo.label} — Click to adjust deadline`}
              className={`inline-flex items-center gap-1 text-[11px] tabular-nums transition-colors cursor-pointer ${
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
          )}

          {/* Quick Reschedule Snooze Flyout Rendered via React Portal at high z-index (active columns only) */}
          {!isDoneOrArchived && showSnoozeFlyout && flyoutPosition && createPortal(
            <div
              ref={flyoutMenuRef}
              style={{ top: `${flyoutPosition.top}px`, left: `${flyoutPosition.left}px` }}
              onClick={e => e.stopPropagation()}
              className="fixed z-[9999] w-52 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-2xl text-neutral-900 dark:text-white animate-in fade-in zoom-in-95 duration-150"
            >
              <div className="px-2 py-1 border-b border-neutral-100 dark:border-white/5 text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider flex items-center justify-between">
                <span>Quick Reschedule</span>
                <Clock className="h-3 w-3 text-blue-500" />
              </div>
              <div className="mt-1 space-y-0.5">
                <button
                  type="button"
                  onClick={() => handleSnooze(1)}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-[11px] text-neutral-700 dark:text-white/80 hover:bg-neutral-100 dark:hover:bg-white/10 cursor-pointer transition-colors"
                >
                  <span>Tomorrow</span>
                  <span className="text-[11px] text-[var(--text-secondary)]">+1d</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSnooze(2)}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-[11px] text-neutral-700 dark:text-white/80 hover:bg-neutral-100 dark:hover:bg-white/10 cursor-pointer transition-colors"
                >
                  <span>In 2 days</span>
                  <span className="text-[11px] text-[var(--text-secondary)]">+2d</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSnooze(3)}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-[11px] text-neutral-700 dark:text-white/80 hover:bg-neutral-100 dark:hover:bg-white/10 cursor-pointer transition-colors"
                >
                  <span>In 3 days</span>
                  <span className="text-[11px] text-[var(--text-secondary)]">+3d</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSnooze(7)}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-[11px] text-neutral-700 dark:text-white/80 hover:bg-neutral-100 dark:hover:bg-white/10 cursor-pointer transition-colors"
                >
                  <span>Next week</span>
                  <span className="text-[11px] text-[var(--text-secondary)]">+7d</span>
                </button>
                <button
                  type="button"
                  onClick={handleEndOfMonth}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-[11px] text-neutral-700 dark:text-white/80 hover:bg-neutral-100 dark:hover:bg-white/10 cursor-pointer transition-colors"
                >
                  <span>Last day of month</span>
                  <span className="text-[11px] text-[var(--text-secondary)]">EOM</span>
                </button>

                {/* Custom date picker input */}
                <div className="pt-1.5 mt-1 border-t border-neutral-100 dark:border-white/5 px-2 pb-0.5">
                  <label className="block text-[11px] uppercase tracking-wider font-semibold text-[var(--text-secondary)] mb-1">
                    Pick Date
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="date"
                      value={customDateDraft}
                      onChange={e => setCustomDateDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && customDateDraft) {
                          e.preventDefault();
                          handleCustomDateSelect(customDateDraft);
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          setShowSnoozeFlyout(false);
                        }
                      }}
                      className="flex-1 min-w-0 rounded-md border border-[var(--border)] bg-neutral-50 dark:bg-white/5 px-1.5 py-1 text-[11px] text-neutral-800 dark:text-white/90 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      disabled={!customDateDraft}
                      onClick={() => handleCustomDateSelect(customDateDraft)}
                      title="Set deadline"
                      className="shrink-0 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white px-2 py-1 text-[11px] font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed shadow-2xs"
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

        {/* Quick status stepper button */}
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
              className="rounded-[5px] p-1 text-[var(--text-muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              style={{ minHeight: 'auto' }}
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
              className="inline-flex items-center gap-0.5 rounded-[5px] bg-[var(--surface-subtle)] hover:bg-[var(--border)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              style={{ minHeight: 'auto' }}
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
              title="Mark as complete"
              className="inline-flex items-center gap-1 rounded-[5px] bg-[var(--surface-subtle)] hover:bg-[var(--border)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              style={{ minHeight: 'auto' }}
            >
              <Archive className="h-2.5 w-2.5" />
              <span>Complete</span>
            </button>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
});

TaskCard.displayName = 'TaskCard';


import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Task, TaskStatus, Role } from '../types';
import { useDashboard } from '../context/DashboardContext';
import { getDuePillInfo, formatDateOnly, formatCompletedDate, getCognitiveLoadLabel, getTaskBillableMs, formatBillableHours, formatBillableDetailed, getLastDayOfMonth } from '../utils/workload';
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
  Folder,
  CopyPlus,
  CornerDownRight,
} from 'lucide-react';

interface TaskCardProps {
  task: Task;
  userRole?: Role;
  onEdit: (task: Task) => void;
  onUpdateTitle?: (taskId: string, newTitle: string) => void;
  onDelete: (taskId: string) => void;
  onMoveStatus: (taskId: string, newStatus: TaskStatus) => void;
  onReschedule?: (taskId: string, newDueDate: string | undefined) => void;
  onAdjustBillableHours?: (task: Task) => void;
  onDragStart?: (task: Task) => void;
  onDragEnd?: () => void;
  onDuplicateToBoard?: (task: Task) => void;
  isDraggable?: boolean;
}

const STATUS_SEQUENCE: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'done'];

export const TaskCard: React.FC<TaskCardProps> = React.memo(({
  task,
  userRole = 'content',
  onEdit,
  onUpdateTitle,
  onDelete,
  onMoveStatus,
  onReschedule,
  onAdjustBillableHours,
  onDragStart,
  onDragEnd,
  onDuplicateToBoard,
  isDraggable = true,
}) => {
  const { canEditUserTasks, isZensciencesUser, isSuperadmin, isCreativeDirector } = useDashboard();
  const canEdit = canEditUserTasks(task.userId);
  const canDuplicateToBoard = isSuperadmin || isCreativeDirector;
  const effectivelyDraggable = isDraggable && canEdit;

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
      userId: task.userId,
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
        scale: isDragging ? 0.98 : 1,
        rotate: isDragging ? 1.5 : 0,
      }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      whileTap={effectivelyDraggable && !isEditingTitle ? { scale: 0.985 } : undefined}
      draggable={effectivelyDraggable && !isEditingTitle}
      onDragStartCapture={handleDragStart}
      onDragEndCapture={handleDragEnd}
      className={`group relative rounded-xl border p-3 select-none transform-gpu transition-all duration-150 shadow-xs hover:shadow-md ${showSnoozeFlyout ? 'z-40' : 'z-0'
        } ${isDragging
          ? 'border-blue-500/60 bg-blue-50/50 dark:bg-blue-950/20 shadow-lg ring-2 ring-blue-500/20'
          : task.status === 'done'
            ? 'bg-neutral-50/80 dark:bg-[#141414] opacity-80 border-neutral-200 dark:border-white/5 hover:border-neutral-300 dark:hover:border-white/10'
            : 'bg-white dark:bg-[#1A1A1A] border-neutral-200 dark:border-white/5 hover:border-neutral-300 dark:hover:border-white/15 hover:bg-neutral-50/50 dark:hover:bg-[#202020]'
        }`}
    >
      {/* Top row: Drag grip, Due Clock icon badge & Cognitive load badge on same line, and Quick actions */}
      <div className="flex items-center justify-between gap-1.5 mb-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          {canEdit && (
            <div
              title="Drag to move, reorder, or assign to another team member"
              className="cursor-grab active:cursor-grabbing text-neutral-400 dark:text-white/20 group-hover:text-neutral-700 dark:group-hover:text-white/60 transition-colors shrink-0 p-0.5 -ml-1 rounded hover:bg-neutral-100 dark:hover:bg-white/5"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </div>
          )}

          {/* Cognitive Load Dot Badge (compact micro size) */}
          <span
            title={`Cognitive Load: ${cognitiveLabel}`}
            className="inline-flex items-center gap-1 rounded-full bg-neutral-100 dark:bg-white/5 px-1.5 py-0.5 text-[9px] font-medium text-neutral-600 dark:text-white/60 border border-neutral-200 dark:border-white/5"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${task.cognitiveLoad === 'high'
                ? 'bg-red-500'
                : task.cognitiveLoad === 'medium'
                  ? 'bg-yellow-500'
                  : 'bg-green-500'
                }`}
            />
            <span className="capitalize">{task.cognitiveLoad}</span>
          </span>
        </div>

        {/* Top Right: Actions & Billable Hours Badge */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Quick Edit (Modal), Duplicate & Delete icons */}
          <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-0.5 shrink-0">
            {canDuplicateToBoard && onDuplicateToBoard && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  onDuplicateToBoard(task);
                }}
                title="Create and assign subtask"
                className="rounded p-1 text-neutral-400 dark:text-white/40 hover:bg-blue-50 dark:hover:bg-blue-500/20 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
              >
                <CopyPlus className="h-3 w-3" />
              </button>
            )}
            <button
              onClick={e => {
                e.stopPropagation();
                onEdit(task);
              }}
              title="Edit task details"
              className="rounded p-1 text-neutral-400 dark:text-white/40 hover:bg-neutral-100 dark:hover:bg-white/10 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <Edit2 className="h-3 w-3" />
            </button>
            <button
              onClick={e => {
                e.stopPropagation();
                onDelete(task.id);
              }}
              title="Delete task"
              className="rounded p-1 text-neutral-400 dark:text-white/40 hover:bg-red-50 dark:hover:bg-red-500/20 hover:text-red-500 dark:hover:text-red-400 transition-colors cursor-pointer"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>

          {/* Billable Hours badge (top right of card - clickable to manually correct hours) */}
          {billableMs > 0 || task.status === 'in_progress' ? (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onAdjustBillableHours?.(task);
              }}
              title={`Billable Duration: ${formatBillableDetailed(billableMs)} · Click to correct hours`}
              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium border select-none transition-all cursor-pointer shrink-0 group/timer ${task.status === 'in_progress'
                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/30 shadow-2xs hover:bg-blue-100 dark:hover:bg-blue-900/50 hover:border-blue-400'
                : 'bg-neutral-100 dark:bg-white/5 text-neutral-500 dark:text-white/40 border-neutral-200/60 dark:border-white/5 hover:bg-neutral-200/80 dark:hover:bg-white/10 hover:text-neutral-800 dark:hover:text-white hover:border-neutral-300 dark:hover:border-white/20'
                }`}
            >
              <Timer className={`h-2.5 w-2.5 ${task.status === 'in_progress' ? 'text-blue-500 animate-pulse' : 'text-neutral-400 dark:text-white/30 group-hover/timer:text-blue-500'}`} />
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
              className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium border border-dashed border-neutral-300 dark:border-white/15 bg-neutral-50 dark:bg-white/5 text-neutral-400 dark:text-white/40 hover:bg-neutral-100 dark:hover:bg-white/10 hover:text-neutral-700 dark:hover:text-white hover:border-neutral-400 transition-all cursor-pointer shrink-0"
            >
              <Timer className="h-2.5 w-2.5 text-neutral-400 dark:text-white/30" />
              <span>0h</span>
            </button>
          )}
        </div>
      </div>

      {/* Subtask Hierarchy Indicator */}
      {task.isSubtask && (
        <div
          className="mb-1 flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 font-medium truncate"
          title={`Subtask of: ${task.parentTaskTitle || 'Parent Task'}`}
        >
          <CornerDownRight className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">Subtask of: {task.parentTaskTitle || 'Parent Task'}</span>
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
            className="w-full text-xs font-medium leading-snug rounded-md border border-blue-500 bg-white dark:bg-[#141414] px-2 py-1 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-xs"
          />
          <div className="flex items-center justify-between text-[9px] text-neutral-400 dark:text-white/40 mt-1 px-0.5 select-none">
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
          className={`text-xs font-medium leading-snug cursor-text rounded px-1 -mx-1 py-0.5 hover:bg-neutral-100/80 dark:hover:bg-white/5 transition-colors group/title flex items-center justify-between gap-1.5 ${task.status === 'done'
            ? 'line-through text-neutral-400 dark:text-white/30'
            : 'text-neutral-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400'
            }`}
        >
          <span className="break-words">{task.title}</span>
          <Edit2 className="h-2.5 w-2.5 opacity-0 group-hover/title:opacity-60 shrink-0 text-neutral-400 dark:text-white/40" />
        </h4>
      )}

      {/* ClickUp Destination Breadcrumb (Folder & List path) */}
      {task.clickupListName ? (
        <div className="mt-1 flex items-center gap-1 text-[10px] text-purple-600 dark:text-purple-400 font-medium truncate">
          <Folder className="w-2.5 h-2.5 shrink-0 opacity-70" />
          <span className="truncate">
            {task.clickupFolderName ? `${task.clickupFolderName} / ${task.clickupListName}` : task.clickupListName}
          </span>
        </div>
      ) : isZensciencesUser && task.status !== 'done' && task.status !== 'archived' ? (
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            onEdit(task);
          }}
          className="mt-0.5 inline-flex items-center gap-1 text-[9px] font-semibold text-amber-600 dark:text-amber-400 hover:underline"
        >
          <span>+ Assign ClickUp List</span>
        </button>
      ) : null}

      {/* Optional Context snippet */}
      {task.description && (
        <p className="mt-1 text-[11px] text-neutral-500 dark:text-white/40 line-clamp-2 leading-relaxed">
          {task.description}
        </p>
      )}

      {/* Bottom Row: Date display (deadline for active, completedAt for done/archived) & quick status stepper */}
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-neutral-100 dark:border-white/5 pt-2">
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
              className="inline-flex items-center gap-1.5 text-[10px] font-medium text-neutral-500 dark:text-white/40 py-0.5 select-none"
            >
              <CheckCircle2 className="h-3 w-3 text-green-600/70 dark:text-green-400/70 shrink-0" />
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
              className="inline-flex items-center gap-1.5 text-[10px] font-medium text-neutral-500 dark:text-white/40 hover:text-neutral-800 dark:hover:text-white/90 transition-colors cursor-pointer py-0.5"
            >
              <span
                className={`inline-flex items-center justify-center rounded-full p-0.5 border shrink-0 ${pillInfo.badgeClass}`}
                title={pillInfo.label}
              >
                <Clock className={`h-2.5 w-2.5 ${pillInfo.iconClass} shrink-0`} />
              </span>
              <span>{formatDateOnly(task.dueDate)}</span>
            </button>
          )}

          {/* Quick Reschedule Snooze Flyout Rendered via React Portal at high z-index (active columns only) */}
          {!isDoneOrArchived && showSnoozeFlyout && flyoutPosition && createPortal(
            <div
              ref={flyoutMenuRef}
              style={{ top: `${flyoutPosition.top}px`, left: `${flyoutPosition.left}px` }}
              onClick={e => e.stopPropagation()}
              className="fixed z-[9999] w-52 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121212] p-1.5 shadow-2xl text-neutral-900 dark:text-white animate-in fade-in zoom-in-95 duration-150"
            >
              <div className="px-2 py-1 border-b border-neutral-100 dark:border-white/5 text-[10px] font-semibold text-neutral-400 dark:text-white/40 uppercase tracking-wider flex items-center justify-between">
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
                  <span className="text-[10px] text-neutral-400 dark:text-white/40">+1d</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSnooze(2)}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-[11px] text-neutral-700 dark:text-white/80 hover:bg-neutral-100 dark:hover:bg-white/10 cursor-pointer transition-colors"
                >
                  <span>In 2 days</span>
                  <span className="text-[10px] text-neutral-400 dark:text-white/40">+2d</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSnooze(3)}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-[11px] text-neutral-700 dark:text-white/80 hover:bg-neutral-100 dark:hover:bg-white/10 cursor-pointer transition-colors"
                >
                  <span>In 3 days</span>
                  <span className="text-[10px] text-neutral-400 dark:text-white/40">+3d</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSnooze(7)}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-[11px] text-neutral-700 dark:text-white/80 hover:bg-neutral-100 dark:hover:bg-white/10 cursor-pointer transition-colors"
                >
                  <span>Next week</span>
                  <span className="text-[10px] text-neutral-400 dark:text-white/40">+7d</span>
                </button>
                <button
                  type="button"
                  onClick={handleEndOfMonth}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-[11px] text-neutral-700 dark:text-white/80 hover:bg-neutral-100 dark:hover:bg-white/10 cursor-pointer transition-colors"
                >
                  <span>Last day of month</span>
                  <span className="text-[10px] text-neutral-400 dark:text-white/40">EOM</span>
                </button>

                {/* Custom date picker input */}
                <div className="pt-1.5 mt-1 border-t border-neutral-100 dark:border-white/5 px-2 pb-0.5">
                  <label className="block text-[9px] uppercase tracking-wider font-semibold text-neutral-400 dark:text-white/40 mb-1">
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
                      className="flex-1 min-w-0 rounded-md border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-white/5 px-1.5 py-1 text-[11px] text-neutral-800 dark:text-white/90 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      disabled={!customDateDraft}
                      onClick={() => handleCustomDateSelect(customDateDraft)}
                      title="Set deadline"
                      className="shrink-0 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white px-2 py-1 text-[10px] font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed shadow-2xs"
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
              onClick={e => {
                e.stopPropagation();
                onMoveStatus(task.id, prevStatus);
              }}
              title={`Move back to ${prevStatus.replace('_', ' ')}`}
              className="rounded p-1 text-neutral-400 dark:text-white/40 hover:bg-neutral-100 dark:hover:bg-white/10 hover:text-neutral-800 dark:hover:text-white transition-colors cursor-pointer"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
          )}

          {nextStatus ? (
            <button
              onClick={e => {
                e.stopPropagation();
                onMoveStatus(task.id, nextStatus);
              }}
              title={`Advance to ${nextStatus === 'done' ? 'Sent' : nextStatus.replace('_', ' ')}`}
              className="inline-flex items-center gap-1 rounded-md bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 border border-neutral-200 dark:border-white/10 px-1.5 py-0.5 text-[10px] font-medium text-neutral-700 dark:text-white/70 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <span className="capitalize">{nextStatus === 'done' ? 'Sent' : nextStatus.replace('_', ' ')}</span>
              <ChevronRight className="h-2.5 w-2.5" />
            </button>
          ) : task.status === 'done' ? (
            <button
              onClick={e => {
                e.stopPropagation();
                onMoveStatus(task.id, 'archived');
              }}
              title="Mark Completed"
              className="inline-flex items-center gap-1 rounded-md bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 border border-neutral-200 dark:border-white/10 px-1.5 py-0.5 text-[10px] text-neutral-500 dark:text-white/40 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
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


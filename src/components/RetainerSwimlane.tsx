import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Task, User } from '../types';
import { formatBillableHours, formatDateOnly, getTaskBillableMs } from '../utils/workload';
import { handleRovingMenuKeyDown, useAnchoredPopover } from '../hooks/useAnchoredPopover';
import {
  Plus,
  Repeat,
  Edit2,
  Trash2,
  X,
  CopyPlus,
  MoreHorizontal,
  Flag,
} from 'lucide-react';

interface RetainerSwimlaneProps {
  user: User;
  tasks: Task[];
  canEdit?: boolean;
  defaultOpenAdd?: boolean;
  onQuickAdd: (
    userId: string,
    title: string
  ) => Promise<void>;
  onEditTask: (task: Task) => void;
  onUpdateTitle?: (taskId: string, newTitle: string) => void;
  onDeleteTask: (taskId: string) => void;
  onCreateSubtask: (task: Task) => void;
}

const RetainerSwimlaneComponent: React.FC<RetainerSwimlaneProps> = ({
  user,
  tasks,
  canEdit = true,
  defaultOpenAdd = false,
  onQuickAdd,
  onEditTask,
  onDeleteTask,
  onCreateSubtask,
}) => {
  const [isAdding, setIsAdding] = useState(defaultOpenAdd);
  useEffect(() => {
    if (defaultOpenAdd) setIsAdding(true);
  }, [defaultOpenAdd]);
  const [menuTask, setMenuTask] = useState<Task | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenuTask(null), []);
  const { position: menuPosition } = useAnchoredPopover({
    isOpen: Boolean(menuTask), triggerRef: menuTriggerRef, popoverRef: menuRef,
    onClose: closeMenu, align: 'right', gap: 4, dismissOnOutOfView: true,
  });
  useEffect(() => {
    if (!menuTask) return;
    const timer = window.setTimeout(() => menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus(), 0);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Tab') setMenuTask(null);
      else handleRovingMenuKeyDown(event, menuRef.current);
    };
    window.addEventListener('keydown', onKey);
    return () => { window.clearTimeout(timer); window.removeEventListener('keydown', onKey); };
  }, [menuTask]);
  const [newTitle, setNewTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const quickAddCardRef = useRef<HTMLDivElement>(null);
  const toggleBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);

  // Click outside to dismiss quick add in retainer
  useEffect(() => {
    if (!isAdding) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        (quickAddCardRef.current && quickAddCardRef.current.contains(target)) ||
        (toggleBtnRef.current && toggleBtnRef.current.contains(target))
      ) {
        return;
      }
      setIsAdding(false);
      setNewTitle('');
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isAdding]);

  const handleCommitAdd = async () => {
    const trimmed = newTitle.trim();
    if (!trimmed || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onQuickAdd(user.id, trimmed);
      setNewTitle('');
      setIsAdding(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="relative flex flex-col transition-colors h-full"
    >
      {/* Ongoing Header */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <Repeat className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] shrink-0">
            Ongoing
          </span>
          <span className="text-[11px] font-semibold tabular-nums text-[var(--text-muted)] shrink-0">
            {tasks.length}
          </span>
          <span className="hidden sm:inline-block text-[11px] text-[var(--text-muted)] truncate">
            · Unscheduled · Create subtasks to schedule
          </span>
        </div>

        {canEdit && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              ref={toggleBtnRef}
              type="button"
              onClick={() => {
                setIsAdding(prev => !prev);
                setNewTitle('');
              }}
              title={isAdding ? 'Cancel adding task' : 'Add ongoing task'}
              className={`mobile-tap-control sm:min-h-0 flex items-center gap-1 rounded-[5px] px-2 py-1 text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                isAdding
                  ? 'bg-[var(--surface-subtle)] text-[var(--text-primary)] border border-[var(--border)]'
                  : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
              }`}
            >
              {isAdding ? (
                <>
                  <X className="h-3 w-3 shrink-0" />
                  <span>Cancel</span>
                </>
              ) : (
                <>
                  <Plus className="h-3 w-3 shrink-0" />
                  <span>Add to Ongoing</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Inline Quick Add into Retainer */}
      {isAdding && (
        <motion.div
          ref={quickAddCardRef}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className="mb-2.5 rounded-[7px] border border-emerald-600/50 dark:border-emerald-400/50 bg-[var(--surface)] p-2.5 space-y-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCommitAdd();
              } else if (e.key === 'Escape') {
                setIsAdding(false);
              }
            }}
            placeholder="Ongoing task name... (Enter to save, Esc to cancel)"
            className="w-full rounded-[5px] border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-emerald-600 dark:focus:border-emerald-400 focus:outline-none"
          />

          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-[var(--text-muted)]">
              Create subtasks from this item to assign load, priority, hours &amp; deadlines
            </span>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={!newTitle.trim() || isSubmitting}
                onClick={handleCommitAdd}
                className="mobile-tap-control sm:min-h-0 rounded-[5px] bg-emerald-700 hover:bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors cursor-pointer disabled:opacity-40"
              >
                Add Ongoing
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Horizontally Scrollable Retainer Cards Container (only rendered when tasks exist or adding) */}
      {(tasks.length > 0 || isAdding) && (
        <div className="flex items-center gap-2 overflow-x-auto py-1 px-0.5 scroll-smooth">
          {tasks.map(task => {
            const metaLine = [task.client, task.project].filter(Boolean).join(' · ');
            const billedMs = getTaskBillableMs(task);

            return (
              <motion.div
                key={task.id}
                layout="position"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="task-card group relative flex flex-col gap-1 shrink-0 p-2.5 select-none w-56 sm:w-60"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    <Repeat aria-hidden="true" className="h-3 w-3" /> Ongoing
                  </span>
                  <div className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)] tabular-nums">
                    {task.estimatedHours !== undefined && task.estimatedHours > 0 && <span>{task.estimatedHours}h est</span>}
                    {billedMs > 0 && <span>{formatBillableHours(billedMs)} billed</span>}
                    {canEdit && (
                      <button type="button" aria-haspopup="menu" aria-expanded={menuTask?.id === task.id}
                        aria-label={`Actions for ${task.title}`}
                        onClick={event => {
                          menuTriggerRef.current = event.currentTarget;
                          setMenuTask(previous => previous?.id === task.id ? null : task);
                        }}
                        className="mobile-tap-square sm:!min-w-0 sm:!min-h-0 inline-flex items-center justify-center rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] cursor-pointer">
                        <MoreHorizontal className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div>
                {metaLine && <p className="text-[11px] text-[var(--text-secondary)] truncate" title={metaLine}>
                  {task.client}{task.client && task.project && ' · '}{task.project && <span className="font-semibold text-[var(--text-primary)]">{task.project}</span>}
                </p>}
                <h5 className="text-[13px] font-semibold leading-snug">
                  <button type="button" onClick={() => onEditTask(task)} title={`${task.title} · Click for details`}
                    className="mobile-tap-control sm:min-h-0 w-full text-left text-[var(--text-primary)] break-words whitespace-normal rounded px-1 -mx-1 py-0 flex items-start hover:bg-[var(--surface-subtle)] hover:text-[#1d4ed8] dark:hover:text-blue-400 cursor-pointer">
                    {task.title}
                  </button>
                </h5>
                </div>
                <div className="flex items-center justify-between gap-2 mt-auto">
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
                    {task.dueDate && <span>{formatDateOnly(task.dueDate)}</span>}
                    {task.priority && <span className="inline-flex items-center gap-0.5 capitalize"><Flag aria-hidden="true" className="h-3 w-3" />{task.priority}</span>}
                  </div>
                  {canEdit && (
                    <button type="button" onClick={() => onCreateSubtask(task)}
                      title="Create and schedule a subtask from this ongoing item"
                      aria-label={`Create subtask from ${task.title}`}
                      className="mobile-tap-control sm:min-h-0 inline-flex items-center gap-1 rounded-[5px] bg-[var(--accent-soft)] px-2 py-1 text-[11px] font-semibold text-[#1d4ed8] dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-500/25 cursor-pointer">
                      <CopyPlus className="h-3 w-3 shrink-0" /> Subtask
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
      {menuTask && createPortal(
        <div ref={menuRef} role="menu" aria-label={`Actions for ${menuTask.title}`}
          style={menuPosition ? { top: menuPosition.top, left: menuPosition.left } : { top: 0, left: 0, visibility: 'hidden' }}
          className="menu-surface fixed z-50 w-44 rounded-[9px] border border-[var(--border)] p-1 text-[var(--text-primary)]">
          <button type="button" role="menuitem" className="menu-item cursor-pointer" onClick={() => { const task = menuTask; closeMenu(); onEditTask(task); }}>
            <Edit2 className="h-3.5 w-3.5" /> Edit Details
          </button>
          <button type="button" role="menuitem" className="menu-item cursor-pointer text-red-600 dark:text-red-400" onClick={() => { const task = menuTask; closeMenu(); onDeleteTask(task.id); }}>
            <Trash2 className="h-3.5 w-3.5" /> Delete Task
          </button>
        </div>, document.body
      )}
    </div>
  );
};

function areRetainerPropsEqual(prev: RetainerSwimlaneProps, next: RetainerSwimlaneProps): boolean {
  if (prev.user !== next.user) return false;
  if (prev.canEdit !== next.canEdit) return false;
  if (prev.onQuickAdd !== next.onQuickAdd) return false;
  if (prev.onEditTask !== next.onEditTask) return false;
  if (prev.onUpdateTitle !== next.onUpdateTitle) return false;
  if (prev.onDeleteTask !== next.onDeleteTask) return false;
  if (prev.onCreateSubtask !== next.onCreateSubtask) return false;

  const prevTasks = prev.tasks;
  const nextTasks = next.tasks;
  if (prevTasks === nextTasks) return true;
  if (prevTasks.length !== nextTasks.length) return false;
  for (let i = 0; i < prevTasks.length; i++) {
    if (prevTasks[i] !== nextTasks[i]) return false;
  }
  return true;
}

export const RetainerSwimlane = React.memo(RetainerSwimlaneComponent, areRetainerPropsEqual);
RetainerSwimlane.displayName = 'RetainerSwimlane';

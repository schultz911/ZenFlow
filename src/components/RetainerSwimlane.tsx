import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Task, User, CognitiveLoad } from '../types';
import { getCognitiveLoadLabel } from '../utils/workload';
import {
  Plus,
  Repeat,
  Edit2,
  Trash2,
  X,
  CopyPlus,
} from 'lucide-react';

interface RetainerSwimlaneProps {
  user: User;
  tasks: Task[];
  onQuickAdd: (
    userId: string,
    title: string,
    cognitiveLoad: CognitiveLoad
  ) => Promise<void>;
  onEditTask: (task: Task) => void;
  onUpdateTitle?: (taskId: string, newTitle: string) => void;
  onDeleteTask: (taskId: string) => void;
  onCreateSubtask: (task: Task) => void;
}

const RetainerSwimlaneComponent: React.FC<RetainerSwimlaneProps> = ({
  user,
  tasks,
  onQuickAdd,
  onEditTask,
  onUpdateTitle,
  onDeleteTask,
  onCreateSubtask,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newLoad, setNewLoad] = useState<CognitiveLoad>('medium');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Inline title editing state for a retainer task
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

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
      await onQuickAdd(user.id, trimmed, newLoad);
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
            · No deadline · Zero workload
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            ref={toggleBtnRef}
            type="button"
            onClick={() => {
              setIsAdding(prev => !prev);
              setNewTitle('');
              setNewLoad('medium');
            }}
            title={isAdding ? 'Cancel adding task' : 'Add ongoing task'}
            className={`flex items-center gap-1 rounded-[5px] px-2 py-1 text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              isAdding
                ? 'bg-[var(--surface-subtle)] text-[var(--text-primary)] border border-[var(--border)]'
                : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
            }`}
            style={{ minHeight: 'auto' }}
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
            <div className="flex items-center gap-1">
              {(['low', 'medium', 'high'] as const).map(load => (
                <button
                  key={load}
                  type="button"
                  onClick={() => setNewLoad(load)}
                  className={`rounded-[5px] px-2 py-0.5 text-[11px] font-semibold border capitalize transition-colors cursor-pointer ${
                    newLoad === load
                      ? load === 'high'
                        ? 'bg-red-50 dark:bg-red-500/15 border-red-300 dark:border-red-500/40 text-red-700 dark:text-red-400'
                        : load === 'medium'
                        ? 'bg-amber-50 dark:bg-amber-500/15 border-amber-300 dark:border-amber-500/40 text-amber-700 dark:text-amber-400'
                        : 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400'
                      : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                  style={{ minHeight: 'auto' }}
                >
                  {load} load
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!newTitle.trim() || isSubmitting}
                onClick={handleCommitAdd}
                className="rounded-[5px] bg-emerald-700 hover:bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors cursor-pointer disabled:opacity-40"
                style={{ minHeight: 'auto' }}
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
            const isEditingThis = editingTaskId === task.id;
            const cognitiveLabel = getCognitiveLoadLabel(task.cognitiveLoad, user.role);

            return (
              <motion.div
                key={task.id}
                layout="position"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="task-card group relative flex items-start gap-2 shrink-0 px-2.5 py-1.5 select-none w-48 sm:w-52 max-w-[220px]"
              >
                {/* Fixed Retainer Indicator */}
                <div
                  title="Ongoing task"
                  className="flex h-5 w-5 items-center justify-center rounded-[5px] bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5"
                >
                  <Repeat className="h-3 w-3" />
                </div>

                {/* Task Title & Metadata */}
                <div className="min-w-0 flex-1">
                  {isEditingThis ? (
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <input
                        type="text"
                        autoFocus
                        value={editingTitle}
                        onChange={e => setEditingTitle(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const trimmed = editingTitle.trim();
                            if (trimmed && onUpdateTitle) {
                              onUpdateTitle(task.id, trimmed);
                            }
                            setEditingTaskId(null);
                          } else if (e.key === 'Escape') {
                            setEditingTaskId(null);
                          }
                        }}
                        onBlur={() => {
                          const trimmed = editingTitle.trim();
                          if (trimmed && onUpdateTitle) {
                            onUpdateTitle(task.id, trimmed);
                          }
                          setEditingTaskId(null);
                        }}
                        className="w-full rounded-[5px] border border-[var(--accent)] bg-[var(--surface)] px-1.5 py-0.5 text-xs text-[var(--text-primary)] focus:outline-none"
                      />
                    </div>
                  ) : (
                    <h5
                      onClick={e => {
                        e.stopPropagation();
                        setEditingTaskId(task.id);
                        setEditingTitle(task.title);
                      }}
                      title={task.title}
                      className="text-xs font-semibold text-[var(--text-primary)] break-words whitespace-normal hover:text-[#1d4ed8] dark:hover:text-blue-400 cursor-text leading-tight"
                    >
                      {task.title}
                    </h5>
                  )}

                  <div className="flex items-center gap-1.5 mt-0.5">
                    {/* Cognitive Load Indicator */}
                    <div className="flex items-center gap-1 shrink-0">
                      <span
                        className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                          task.cognitiveLoad === 'high'
                            ? 'bg-red-600 dark:bg-red-400'
                            : task.cognitiveLoad === 'medium'
                            ? 'bg-amber-600 dark:bg-amber-400'
                            : 'bg-emerald-600 dark:bg-emerald-400'
                        }`}
                      />
                      <span
                        title={`Cognitive Load: ${cognitiveLabel}`}
                        className="text-[11px] text-[var(--text-secondary)] capitalize"
                      >
                        {task.cognitiveLoad}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Quick actions on hover */}
                <div className="flex items-center card-actions opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      onCreateSubtask(task);
                    }}
                    title="Create subtask from this ongoing task"
                    className="rounded-[5px] p-1 text-[var(--text-secondary)] hover:text-[#1d4ed8] dark:hover:text-blue-400 hover:bg-[var(--surface-subtle)] transition-colors cursor-pointer"
                    style={{ minHeight: 'auto' }}
                  >
                    <CopyPlus className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      onEditTask(task);
                    }}
                    title="Open ongoing task details"
                    className="rounded-[5px] p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors cursor-pointer"
                    style={{ minHeight: 'auto' }}
                  >
                    <Edit2 className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      onDeleteTask(task.id);
                    }}
                    title="Delete ongoing task"
                    className="rounded-[5px] p-1 text-[var(--text-secondary)] hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/15 transition-colors cursor-pointer"
                    style={{ minHeight: 'auto' }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

function areRetainerPropsEqual(prev: RetainerSwimlaneProps, next: RetainerSwimlaneProps): boolean {
  if (prev.user !== next.user) return false;
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

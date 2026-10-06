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
  onQuickAdd: (userId: string, title: string, cognitiveLoad: CognitiveLoad) => Promise<void>;
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
      className="relative rounded-xl border border-neutral-200/80 dark:border-white/5 bg-neutral-100/60 dark:bg-[#111111] p-2.5 sm:p-3 transition-all"
    >
      {/* Retainer Header */}
      <div className="flex items-center justify-between gap-2 mb-2 px-1">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Repeat className="h-3 w-3" />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-700 dark:text-white/70">
            Retainer
          </span>
          <span className="rounded-full bg-neutral-200/80 dark:bg-white/10 px-2 py-0.2 text-[10px] font-semibold text-neutral-600 dark:text-white/50">
            {tasks.length}
          </span>
          <span className="hidden sm:inline-block text-[10px] text-neutral-400 dark:text-white/30">
            No deadline · Zero workload · In Progress on ClickUp
          </span>
        </div>

        <button
          ref={toggleBtnRef}
          type="button"
          onClick={() => {
            setIsAdding(prev => !prev);
            setNewTitle('');
            setNewLoad('medium');
          }}
          title={isAdding ? 'Cancel adding task' : 'Add task to retainer'}
          className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
            isAdding
              ? 'bg-neutral-200 dark:bg-white/10 text-neutral-700 dark:text-white'
              : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
          }`}
        >
          {isAdding ? (
            <>
              <X className="h-3 w-3" />
              <span>Cancel</span>
            </>
          ) : (
            <>
              <Plus className="h-3 w-3" />
              <span>Add to Retainer</span>
            </>
          )}
        </button>
      </div>

      {/* Inline Quick Add into Retainer */}
      {isAdding && (
        <motion.div
          ref={quickAddCardRef}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className="mb-2.5 rounded-xl border border-emerald-500/50 bg-white dark:bg-[#1A1A1A] p-2.5 shadow-sm space-y-2"
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
            placeholder="Retainer task name... (Enter to save, Esc to cancel)"
            className="w-full rounded-lg border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-[#121212] px-2.5 py-1.5 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-emerald-500 focus:outline-none"
          />

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              {(['low', 'medium', 'high'] as const).map(load => (
                <button
                  key={load}
                  type="button"
                  onClick={() => setNewLoad(load)}
                  className={`rounded px-2 py-0.5 text-[9px] font-medium border capitalize transition-all cursor-pointer ${
                    newLoad === load
                      ? load === 'high'
                        ? 'bg-red-500/15 border-red-500/40 text-red-500 font-semibold'
                        : load === 'medium'
                        ? 'bg-yellow-500/15 border-yellow-500/40 text-yellow-600 dark:text-yellow-400 font-semibold'
                        : 'bg-green-500/15 border-green-500/40 text-green-600 dark:text-green-400 font-semibold'
                      : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-white/40 dark:hover:text-white'
                  }`}
                >
                  {load} load
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={!newTitle.trim() || isSubmitting}
              onClick={handleCommitAdd}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1 text-[10px] font-semibold text-white shadow-xs transition-colors cursor-pointer disabled:opacity-40"
            >
              Add Retainer
            </button>
          </div>
        </motion.div>
      )}

      {/* Horizontally Scrollable Retainer Cards Container */}
      <div className="flex items-center gap-2.5 overflow-x-auto py-1 px-0.5 scroll-smooth min-h-[58px]">
        {tasks.length === 0 && !isAdding ? (
          <div
            onClick={() => setIsAdding(true)}
            className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-neutral-300/80 dark:border-white/10 text-neutral-400 dark:text-white/30 hover:border-emerald-400 dark:hover:border-emerald-500/40 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors px-4 py-2"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="text-[11px] font-medium">
              No retainer tasks · Click to add ongoing client retainers
            </span>
          </div>
        ) : (
          tasks.map(task => {
            const isEditingThis = editingTaskId === task.id;
            const cognitiveLabel = getCognitiveLoadLabel(task.cognitiveLoad, user.role);

            return (
              <motion.div
                key={task.id}
                layout="position"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15 }}
                className="group relative flex items-center gap-2 shrink-0 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#1A1A1A] px-3 py-2 shadow-2xs hover:shadow-md hover:border-emerald-400/50 dark:hover:border-emerald-500/30 transition-all select-none max-w-[320px]"
              >
                {/* Fixed Retainer Indicator */}
                <div
                  title="Retainer task stays in this column. Create subtasks to place actionable items in To Do."
                  className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0"
                >
                  <Repeat className="h-3 w-3" />
                </div>

                {/* Task Title */}
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
                        className="w-32 rounded border border-emerald-500 bg-white dark:bg-[#121212] px-1.5 py-0.5 text-xs text-neutral-900 dark:text-white focus:outline-none"
                      />
                    </div>
                  ) : (
                    <h5
                      onClick={e => {
                        e.stopPropagation();
                        setEditingTaskId(task.id);
                        setEditingTitle(task.title);
                      }}
                      title="Click to edit name directly"
                      className="text-xs font-medium text-neutral-900 dark:text-white truncate hover:text-emerald-600 dark:hover:text-emerald-400 cursor-text"
                    >
                      {task.title}
                    </h5>
                  )}

                  {/* Cognitive Load Indicator */}
                  <div className="flex items-center gap-1 mt-0.5">
                    <span
                      className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                        task.cognitiveLoad === 'high'
                          ? 'bg-red-500'
                          : task.cognitiveLoad === 'medium'
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                      }`}
                    />
                    <span
                      title={`Cognitive Load: ${cognitiveLabel}`}
                      className="text-[10px] text-neutral-500 dark:text-white/40 capitalize truncate"
                    >
                      {task.cognitiveLoad}
                    </span>
                  </div>
                </div>

                {/* Prominent Create Subtask Button */}
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    onCreateSubtask(task);
                  }}
                  title="Create a subtask from this retainer to place in To Do"
                  className="flex items-center gap-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 px-2 py-1 text-[10px] font-semibold border border-emerald-300/60 dark:border-emerald-600/30 transition-all cursor-pointer shadow-2xs shrink-0"
                >
                  <CopyPlus className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                  <span>+ Subtask</span>
                </button>

                {/* Quick actions on hover */}
                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-0.5 shrink-0 ml-0.5">
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      onEditTask(task);
                    }}
                    title="Open retainer task details"
                    className="rounded p-0.5 text-neutral-400 hover:text-neutral-900 dark:text-white/40 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors"
                  >
                    <Edit2 className="h-2.5 w-2.5" />
                  </button>
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      onDeleteTask(task.id);
                    }}
                    title="Delete retainer task"
                    className="rounded p-0.5 text-neutral-400 hover:text-red-500 dark:text-white/40 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/15 transition-colors"
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
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

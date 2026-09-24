import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Task, User, TaskStatus, CognitiveLoad } from '../types';
import { getCognitiveLoadLabel } from '../utils/workload';
import {
  GripVertical,
  Plus,
  Inbox,
  Edit2,
  Trash2,
  X,
  Check,
} from 'lucide-react';

interface PipelineSwimlaneProps {
  user: User;
  tasks: Task[];
  onQuickAdd: (userId: string, title: string, cognitiveLoad: CognitiveLoad) => Promise<void>;
  onDragStart?: (task: Task) => void;
  onDragEnd?: () => void;
  onMoveTask: (taskId: string, newStatus: TaskStatus) => void;
  onEditTask: (task: Task) => void;
  onUpdateTitle?: (taskId: string, newTitle: string) => void;
  onDeleteTask: (taskId: string) => void;
}

const PipelineSwimlaneComponent: React.FC<PipelineSwimlaneProps> = ({
  user,
  tasks,
  onQuickAdd,
  onDragStart,
  onDragEnd,
  onMoveTask,
  onEditTask,
  onUpdateTitle,
  onDeleteTask,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newLoad, setNewLoad] = useState<CognitiveLoad>('medium');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Inline title editing state for a pipeline task
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

  // Click outside to dismiss quick add in pipeline
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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (!isDragOver) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    let taskId = '';
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.taskId) taskId = parsed.taskId;
      }
    } catch {
      // ignore
    }

    if (!taskId) {
      taskId = e.dataTransfer.getData('text/plain').trim();
    }

    if (taskId) {
      onMoveTask(taskId, 'pipeline');
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative mx-4 sm:mx-6 mt-3 mb-1 rounded-xl border p-2.5 sm:p-3 transition-all ${
        isDragOver
          ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 ring-2 ring-indigo-500/30'
          : 'border-neutral-200/80 dark:border-white/5 bg-neutral-100/60 dark:bg-[#111111]'
      }`}
    >
      {/* Pipeline Header */}
      <div className="flex items-center justify-between gap-2 mb-2 px-1">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex h-5 w-5 items-center justify-center rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <Inbox className="h-3 w-3" />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-700 dark:text-white/70">
            Pipeline
          </span>
          <span className="rounded-full bg-neutral-200/80 dark:bg-white/10 px-2 py-0.2 text-[10px] font-semibold text-neutral-600 dark:text-white/50">
            {tasks.length}
          </span>
          <span className="hidden sm:inline-block text-[10px] text-neutral-400 dark:text-white/30">
            No deadline · Does not impact workload capacity
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
          className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
            isAdding
              ? 'bg-neutral-200 dark:bg-white/10 text-neutral-700 dark:text-white'
              : 'text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30'
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
              <span>Add to Pipeline</span>
            </>
          )}
        </button>
      </div>

      {/* Inline Quick Add into Pipeline */}
      {isAdding && (
        <motion.div
          ref={quickAddCardRef}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className="mb-2.5 rounded-xl border border-indigo-500/50 bg-white dark:bg-[#1A1A1A] p-2.5 shadow-sm space-y-2"
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
            placeholder="Pipeline task name... (Enter to save, Esc to cancel)"
            className="w-full rounded-lg border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-[#121212] px-2.5 py-1.5 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-indigo-500 focus:outline-none"
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
              className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-1 text-[10px] font-semibold text-white shadow-xs transition-colors cursor-pointer disabled:opacity-40"
            >
              Add Item
            </button>
          </div>
        </motion.div>
      )}

      {/* Horizontally Scrollable Cards Container */}
      <div className="flex items-center gap-2.5 overflow-x-auto py-1 px-0.5 scroll-smooth min-h-[58px]">
        {tasks.length === 0 && !isAdding ? (
          <div
            onClick={() => setIsAdding(true)}
            className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-neutral-300/80 dark:border-white/10 text-neutral-400 dark:text-white/30 hover:border-indigo-400 dark:hover:border-indigo-500/40 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors px-4 py-2"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="text-[11px] font-medium">
              Pipeline is empty · Drop unscheduled tasks here or click to add
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
                draggable={!isEditingThis}
                onDragStartCapture={(e: React.DragEvent) => {
                  if (isEditingThis) {
                    e.preventDefault();
                    return;
                  }
                  const dragPayload = {
                    taskId: task.id,
                    status: 'pipeline',
                    userId: user.id,
                    order: task.order,
                    title: task.title,
                    dueDate: task.dueDate,
                  };
                  e.dataTransfer.setData('application/json', JSON.stringify(dragPayload));
                  e.dataTransfer.setData('text/plain', task.id);
                  e.dataTransfer.effectAllowed = 'move';
                  onDragStart?.(task);
                }}
                onDragEndCapture={() => onDragEnd?.()}
                className="group relative flex items-center gap-2 shrink-0 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#1A1A1A] px-3 py-2 shadow-2xs hover:shadow-md hover:border-indigo-400/50 dark:hover:border-indigo-500/30 transition-all select-none cursor-grab active:cursor-grabbing max-w-[260px]"
              >
                {/* Drag Grip */}
                <div className="text-neutral-400 dark:text-white/20 group-hover:text-neutral-700 dark:group-hover:text-white/60 shrink-0">
                  <GripVertical className="h-3.5 w-3.5" />
                </div>

                {/* Task Title (only task name and cognitive load as requested) */}
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
                        className="w-32 rounded border border-indigo-500 bg-white dark:bg-[#121212] px-1.5 py-0.5 text-xs text-neutral-900 dark:text-white focus:outline-none"
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
                      className="text-xs font-medium text-neutral-900 dark:text-white truncate hover:text-indigo-600 dark:hover:text-indigo-400 cursor-text"
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

                {/* Quick actions on hover */}
                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-0.5 shrink-0 ml-1">
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      onEditTask(task);
                    }}
                    title="Open task modal"
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
                    title="Delete pipeline task"
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

function arePipelinePropsEqual(prev: PipelineSwimlaneProps, next: PipelineSwimlaneProps): boolean {
  if (prev.user !== next.user) return false;
  if (prev.onQuickAdd !== next.onQuickAdd) return false;
  if (prev.onDragStart !== next.onDragStart) return false;
  if (prev.onDragEnd !== next.onDragEnd) return false;
  if (prev.onMoveTask !== next.onMoveTask) return false;
  if (prev.onEditTask !== next.onEditTask) return false;
  if (prev.onUpdateTitle !== next.onUpdateTitle) return false;
  if (prev.onDeleteTask !== next.onDeleteTask) return false;

  const prevTasks = prev.tasks;
  const nextTasks = next.tasks;
  if (prevTasks === nextTasks) return true;
  if (prevTasks.length !== nextTasks.length) return false;
  for (let i = 0; i < prevTasks.length; i++) {
    if (prevTasks[i] !== nextTasks[i]) return false;
  }
  return true;
}

export const PipelineSwimlane = React.memo(PipelineSwimlaneComponent, arePipelinePropsEqual);
PipelineSwimlane.displayName = 'PipelineSwimlane';

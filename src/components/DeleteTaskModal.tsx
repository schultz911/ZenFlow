import React, { useState, useEffect } from 'react';
import { Task, User } from '../types';
import { AlertTriangle, Trash2, X, Loader2, CornerDownRight, ExternalLink } from 'lucide-react';

interface DeleteTaskModalProps {
  task: Task | null;
  users: User[];
  isOpen: boolean;
  onClose: () => void;
  onConfirmDelete: (taskId: string) => Promise<void> | void;
}

export const DeleteTaskModal: React.FC<DeleteTaskModalProps> = ({
  task,
  users,
  isOpen,
  onClose,
  onConfirmDelete,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isDeleting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDeleting, onClose]);

  if (!isOpen || !task) return null;

  const owner = users.find(u => u.id === task.userId);

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await onConfirmDelete(task.id);
      setIsDeleting(false);
      onClose();
    } catch (err) {
      console.error('Failed to delete task:', err);
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={e => {
        if (e.target === e.currentTarget && !isDeleting) onClose();
      }}
    >
      <div
        id="delete-task-modal"
        className="w-full max-w-md rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#0D0D0D] p-6 shadow-2xl transition-all text-neutral-900 dark:text-white"
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-neutral-100 dark:border-white/5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-500 dark:text-red-400 border border-red-500/20 shrink-0">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight text-neutral-900 dark:text-white">
                Delete Task
              </h2>
              <p className="text-xs text-neutral-500 dark:text-white/40 mt-0.5">
                Confirm Task Removal
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Task Details Card */}
        <div className="py-4 space-y-3">
          <div className="rounded-xl border border-neutral-200/80 dark:border-white/10 bg-neutral-50 dark:bg-[#161616] p-3.5 space-y-2">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-white/40">
                Task Name
              </span>
              <h4 className="text-xs font-bold text-neutral-900 dark:text-white mt-0.5 line-clamp-2">
                {task.title}
              </h4>
            </div>

            {task.isSubtask && (
              <div className="flex items-center gap-1.5 text-[11px] text-blue-600 dark:text-blue-400 font-medium">
                <CornerDownRight className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Subtask of: {task.parentTaskTitle || 'Parent Task'}</span>
              </div>
            )}

            <div className="flex items-center justify-between text-xs pt-1.5 border-t border-neutral-200/60 dark:border-white/5">
              <span className="text-neutral-500 dark:text-white/40">Owner</span>
              <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                {owner?.name || 'Unassigned'}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-500 dark:text-white/40">Status</span>
              <span className="font-medium capitalize text-neutral-700 dark:text-neutral-300">
                {task.status === 'done' ? 'Sent' : task.status === 'archived' ? 'Completed' : task.status.replace('_', ' ')}
              </span>
            </div>

            {task.clickupTaskId && (
              <div className="flex items-center gap-1.5 text-[11px] text-purple-600 dark:text-purple-400 pt-1 border-t border-neutral-200/60 dark:border-white/5">
                <ExternalLink className="h-3 w-3 shrink-0" />
                <span>Linked ClickUp Task #{task.clickupTaskId}</span>
              </div>
            )}
          </div>

          <div className="rounded-xl bg-red-50/80 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 p-3 text-xs text-red-600 dark:text-red-400">
            Are you sure you want to delete this task? This action cannot be undone.
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-neutral-100 dark:border-white/5">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-[#141414] px-4 py-2 text-xs font-medium text-neutral-600 dark:text-white/60 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-white/5 transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white px-4 py-2 text-xs font-semibold shadow-md shadow-red-900/20 transition-all cursor-pointer"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Deleting Task...</span>
              </>
            ) : (
              <>
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete Task</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

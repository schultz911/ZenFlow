import { DialogPanel } from './ui/DialogPanel';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Task, User } from '../types';
import { getTaskAssigneeIds } from '../utils/workload';
import { AlertTriangle, Trash2, X, Loader2, CornerDownRight } from 'lucide-react';

interface DeleteTaskModalProps {
  task: Task | null;
  users: User[];
  isOpen: boolean;
  targetUserId?: string;
  onClose: () => void;
  onConfirmDelete: (taskId: string, removeAssigneeId?: string) => Promise<void> | void;
}

export const DeleteTaskModal: React.FC<DeleteTaskModalProps> = ({
  task,
  users,
  isOpen,
  targetUserId,
  onClose,
  onConfirmDelete,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => setDeleteError(''), [isOpen, task?.id, targetUserId]);

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

  const assigneeIds = task ? getTaskAssigneeIds(task) : [];
  const isSharedRemoval = Boolean(task && targetUserId && assigneeIds.length > 1 && assigneeIds.includes(targetUserId));
  const owner = task ? users.find(u => u.id === (isSharedRemoval ? targetUserId : task.userId)) : null;

  const handleDelete = async () => {
    if (!task) return;
    setDeleteError('');
    try {
      setIsDeleting(true);
      await onConfirmDelete(task.id, isSharedRemoval ? targetUserId : undefined);
      setIsDeleting(false);
      onClose();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'The task could not be updated. Please try again.');
      setIsDeleting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && task && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
          onClick={e => {
            if (e.target === e.currentTarget && !isDeleting) onClose();
          }}
        >
          <DialogPanel aria-label="Delete task" onClose={onClose} busy={isDeleting}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.16, ease: [0.2, 0.7, 0.2, 1] }}
            onClick={e => e.stopPropagation()}
            id="delete-task-modal"
            className="w-full max-w-md my-auto overflow-hidden"
          >
            {/* Header */}
            <div className="dialog-header">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-[7px] bg-red-600/10 text-red-600 dark:text-red-400 border border-red-600/20 shrink-0">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <h2 className="text-sm font-bold tracking-tight text-[var(--text-primary)]">
                  {isSharedRemoval ? 'Remove Assignee from Task' : 'Delete Task'}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close dialog"
                onClick={onClose}
                disabled={isDeleting}
                className="icon-button shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Task Details Ledger */}
            <div className="p-5 space-y-3.5">
              <dl className="rounded-[7px] border border-[var(--border)] bg-[var(--surface-muted)] divide-y divide-[var(--border-subtle)] text-xs">
                <div className="px-3 py-2.5">
                  <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                    Task Name
                  </dt>
                  <dd className="text-xs font-semibold text-[var(--text-primary)] mt-0.5 line-clamp-2">
                    {task.title}
                  </dd>
                  {task.isSubtask && (
                    <div className="flex items-center gap-1.5 text-[11px] text-[#1d4ed8] dark:text-blue-400 font-medium mt-1">
                      <CornerDownRight className="h-3 w-3 shrink-0" />
                      <span className="truncate">Subtask of: {task.parentTaskTitle || 'Parent Task'}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between px-3 py-2">
                  <dt className="text-[var(--text-secondary)]">Owner</dt>
                  <dd className="font-semibold text-[var(--text-primary)]">
                    {owner?.name || 'Unassigned'}
                  </dd>
                </div>

                <div className="flex items-center justify-between px-3 py-2">
                  <dt className="text-[var(--text-secondary)]">Status</dt>
                  <dd className="font-medium capitalize text-[var(--text-primary)]">
                    {task.status === 'done' ? 'Sent' : task.status === 'archived' ? 'Completed' : task.status.replace('_', ' ')}
                  </dd>
                </div>
              </dl>

              <div className="callout callout-danger">
                {isSharedRemoval
                  ? `Remove ${owner?.name || 'this member'} from this shared task? It will remain active on the other ${assigneeIds.length - 1} assignee(s)' board(s).`
                  : 'Are you sure you want to delete this task? This action cannot be undone.'}
              </div>
              {deleteError && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{deleteError}</p>}
            </div>

            {/* Footer Actions */}
            <div className="dialog-footer">
              <button
                type="button"
                onClick={onClose}
                disabled={isDeleting}
                className="button-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="button-danger"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>{isSharedRemoval ? 'Removing...' : 'Deleting Task...'}</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{isSharedRemoval ? 'Remove Assignee' : 'Delete Task'}</span>
                  </>
                )}
              </button>
            </div>
          </DialogPanel>
    </motion.div>
  )}
</AnimatePresence>
  );
};

import { DialogPanel } from './ui/DialogPanel';
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User, Task } from '../types';
import { getUserTag } from '../utils/workload';
import { AlertTriangle, Trash2, X, Loader2 } from 'lucide-react';

interface DeleteUserModalProps {
  user: User | null;
  tasks: Task[];
  isOpen: boolean;
  onClose: () => void;
  onConfirmDelete: (userId: string) => Promise<void>;
}

export const DeleteUserModal: React.FC<DeleteUserModalProps> = ({
  user,
  tasks,
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

  const { userTasks, counts } = useMemo(() => {
    if (!user) return { userTasks: [], counts: { pipeline: 0, todo: 0, in_progress: 0, in_review: 0, done: 0, archived: 0 } };
    const list: Task[] = [];
    const c = { pipeline: 0, todo: 0, in_progress: 0, in_review: 0, done: 0, archived: 0 };
    for (const t of tasks) {
      if (t.userId === user.id) {
        list.push(t);
        if (t.status in c) {
          c[t.status as keyof typeof c]++;
        }
      }
    }
    return { userTasks: list, counts: c };
  }, [tasks, user]);

  const pipelineCount = counts.pipeline;
  const todoCount = counts.todo;
  const inProgressCount = counts.in_progress;
  const inReviewCount = counts.in_review;
  const doneCount = counts.done;
  const archivedCount = counts.archived;

  const handleDelete = async () => {
    if (!user) return;
    try {
      setIsDeleting(true);
      await onConfirmDelete(user.id);
      setIsDeleting(false);
      onClose();
    } catch (err) {
      console.error('Failed to delete user:', err);
      setIsDeleting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && user && (
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
          <DialogPanel aria-label="Delete team member" onClose={onClose} busy={isDeleting}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.16, ease: [0.2, 0.7, 0.2, 1] }}
            onClick={e => e.stopPropagation()}
            id="delete-user-modal"
            className="w-full max-w-md my-auto overflow-hidden"
          >
            {/* Header */}
            <div className="dialog-header">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-[7px] bg-red-600/10 text-red-600 dark:text-red-400 border border-red-600/20 shrink-0">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <h2 className="text-sm font-bold tracking-tight text-[var(--text-primary)]">
                  Delete Member
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

            <div className="p-5 space-y-4">
              {/* User Identity Strip */}
              <div className="rounded-[7px] border border-[var(--border)] bg-[var(--surface-muted)] p-3 flex items-center gap-3">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[7px] bg-gradient-to-tr ${
                    user.avatarColor || 'from-blue-600 to-indigo-600'
                  } text-white font-semibold text-xs`}
                >
                  {user.name
                    .split(' ')
                    .map(p => p[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                      {user.name}
                    </p>
                    <span className="ledger-badge">
                      {getUserTag(user).label}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
                    {user.email}
                  </p>
                </div>
              </div>

              {/* Tasks Deletion Warning & Breakdown */}
              <div className="space-y-3">
                <div className="callout callout-danger leading-relaxed">
                  <p className="font-semibold flex items-center gap-1.5 mb-1">
                    <Trash2 className="h-3.5 w-3.5 shrink-0" />
                    <span>Permanent Deletion Warning</span>
                  </p>
                  <p>
                    Deleting <strong>{user.name}</strong> will permanently erase their profile and all{' '}
                    <strong className="tabular-nums">{userTasks.length}</strong> associated task{userTasks.length === 1 ? '' : 's'}. This action cannot be reversed.
                  </p>
                </div>

                {userTasks.length > 0 && (
                  <div className="rounded-[7px] border border-[var(--border)] bg-[var(--surface-muted)] px-3.5 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-2 tabular-nums">
                      Tasks to be deleted ({userTasks.length} total)
                    </p>
                    <div className="flex flex-wrap gap-1.5 tabular-nums">
                      {pipelineCount > 0 && (
                        <span className="ledger-badge">Pipeline: {pipelineCount}</span>
                      )}
                      {todoCount > 0 && (
                        <span className="ledger-badge">To Do: {todoCount}</span>
                      )}
                      {inProgressCount > 0 && (
                        <span className="ledger-badge text-[#1d4ed8] dark:text-blue-400">In Progress: {inProgressCount}</span>
                      )}
                      {inReviewCount > 0 && (
                        <span className="ledger-badge text-amber-700 dark:text-amber-400">In Review: {inReviewCount}</span>
                      )}
                      {doneCount > 0 && (
                        <span className="ledger-badge text-emerald-700 dark:text-emerald-400">Sent: {doneCount}</span>
                      )}
                      {archivedCount > 0 && (
                        <span className="ledger-badge">Completed: {archivedCount}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
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
                id="confirm-delete-user-button"
                className="button-danger"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete User &amp; Tasks</span>
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

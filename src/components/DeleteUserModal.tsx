import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User, Task } from '../types';
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs overflow-y-auto"
          onClick={e => {
            if (e.target === e.currentTarget && !isDeleting) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={e => e.stopPropagation()}
            id="delete-user-modal"
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
                Delete Member
              </h2>
              <p className="text-xs text-neutral-500 dark:text-white/40 mt-0.5">
                Cascade User & Task Removal
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

        {/* User Card */}
        <div className="mt-4 rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-[#141414] p-3.5 flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr ${
              user.avatarColor || 'from-blue-600 to-indigo-600'
            } text-white font-semibold text-sm border border-neutral-200 dark:border-white/10 shadow-sm`}
          >
            {user.name
              .split(' ')
              .map(p => p[0])
              .join('')
              .toUpperCase()
              .slice(0, 2)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-neutral-900 dark:text-white truncate">
                {user.name}
              </p>
              <span className="rounded-full bg-neutral-200 dark:bg-white/5 border border-neutral-300 dark:border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-neutral-600 dark:text-white/40">
                {user.role}
              </span>
            </div>
            <p className="text-xs text-neutral-500 dark:text-white/40 truncate mt-0.5">
              {user.email}
            </p>
          </div>
        </div>

        {/* Tasks Deletion Warning & Breakdown */}
        <div className="mt-4 space-y-3">
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-600 dark:text-red-400 leading-relaxed">
            <p className="font-semibold flex items-center gap-1.5 mb-1">
              <Trash2 className="h-3.5 w-3.5 shrink-0" />
              <span>Permanent Deletion Warning</span>
            </p>
            <p>
              Deleting <strong>{user.name}</strong> will permanently erase their profile and all{' '}
              <strong>{userTasks.length}</strong> associated task{userTasks.length === 1 ? '' : 's'}. This action cannot be reversed.
            </p>
          </div>

          {userTasks.length > 0 && (
            <div className="rounded-xl border border-neutral-200 dark:border-white/5 bg-neutral-50/50 dark:bg-[#111111] p-3">
              <p className="text-[11px] font-medium text-neutral-500 dark:text-white/40 mb-2">
                Tasks to be deleted ({userTasks.length} total):
              </p>
              <div className="flex flex-wrap gap-1.5">
                {pipelineCount > 0 && (
                  <span className="rounded-md bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 text-[10px] text-indigo-600 dark:text-indigo-400">
                    Pipeline: {pipelineCount}
                  </span>
                )}
                {todoCount > 0 && (
                  <span className="rounded-md bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 px-2 py-0.5 text-[10px] text-neutral-600 dark:text-white/60">
                    To Do: {todoCount}
                  </span>
                )}
                {inProgressCount > 0 && (
                  <span className="rounded-md bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-[10px] text-blue-600 dark:text-blue-400">
                    In Progress: {inProgressCount}
                  </span>
                )}
                {inReviewCount > 0 && (
                  <span className="rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                    In Review: {inReviewCount}
                  </span>
                )}
                {doneCount > 0 && (
                  <span className="rounded-md bg-green-500/10 border border-green-500/20 px-2 py-0.5 text-[10px] text-green-600 dark:text-green-400">
                    Done: {doneCount}
                  </span>
                )}
                {archivedCount > 0 && (
                  <span className="rounded-md bg-neutral-200/60 dark:bg-white/5 border border-neutral-300 dark:border-white/10 px-2 py-0.5 text-[10px] text-neutral-500 dark:text-white/40">
                    Archived: {archivedCount}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="mt-6 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="rounded-xl border border-neutral-200 dark:border-white/10 px-4 py-2 text-xs font-medium text-neutral-700 dark:text-white/70 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            id="confirm-delete-user-button"
            className="flex items-center gap-1.5 rounded-xl bg-red-600 hover:bg-red-500 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-red-900/20 transition-all disabled:opacity-50 cursor-pointer"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete User & Tasks</span>
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>
  );
};

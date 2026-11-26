import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Task, User, TaskStatus } from '../types';
import { X, ArrowLeftRight, Users, GitBranch, AlertTriangle } from 'lucide-react';
import { getTaskAssigneeIds } from '../utils/workload';
import { DialogPanel } from './ui/DialogPanel';

interface CrossUserDropModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  sourceUser: User | null;
  targetUser: User | null;
  targetStatus: TaskStatus;
  onReassign: () => void;
  onDuplicateShare: () => void;
  onCreateSubtask: () => void;
}

export const CrossUserDropModal: React.FC<CrossUserDropModalProps> = ({
  isOpen,
  onClose,
  task,
  sourceUser,
  targetUser,
  onReassign,
  onDuplicateShare,
  onCreateSubtask,
}) => {
  const taskDiscipline = task ? (task.team || sourceUser?.role) : undefined;
  const isSameDiscipline = !taskDiscipline || !targetUser || taskDiscipline === targetUser.role;
  const existingAssignees = task ? getTaskAssigneeIds(task) : [];
  const isAlreadyAssignedToTarget = Boolean(targetUser && existingAssignees.includes(targetUser.id));
  const canReassign = isSameDiscipline && !isAlreadyAssignedToTarget;
  const canDuplicateShare = isSameDiscipline && !isAlreadyAssignedToTarget;

  return (
    <AnimatePresence>
      {isOpen && task && targetUser && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
          onClick={e => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <DialogPanel
            aria-label={`Move task to ${targetUser.name}`}
            onClose={onClose}
            busy={false}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.16, ease: [0.2, 0.7, 0.2, 1] }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md my-auto overflow-hidden"
          >
            <div className="dialog-header">
              <div className="min-w-0">
                <h3 className="text-sm font-bold tracking-tight text-[var(--text-primary)]">
                  Move Task to {targetUser.name}
                </h3>
                <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">
                  {task.title}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close dialog"
                onClick={onClose}
                className="icon-button shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              {!isSameDiscipline && (
                <div className="callout callout-warning flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    Cross-discipline drop ({taskDiscipline} &rarr; {targetUser.role}). Only Create Subtask is allowed across disciplines.
                  </span>
                </div>
              )}

              <div className="rounded-[7px] border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border-subtle)] overflow-hidden">
                <button
                  type="button"
                  disabled={!canReassign}
                  onClick={onReassign}
                  className={`w-full text-left px-3.5 py-3 transition-colors flex items-start gap-3 ${
                    canReassign
                      ? 'hover:bg-[var(--surface-muted)] cursor-pointer'
                      : 'opacity-45 cursor-not-allowed bg-[var(--surface-subtle)]'
                  }`}
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-[var(--accent-soft)] text-[#1d4ed8] dark:text-blue-400 mt-0.5">
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[var(--text-primary)]">
                      Reassign
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                      {isAlreadyAssignedToTarget
                        ? `${targetUser.name} is already assigned to this task.`
                        : !isSameDiscipline
                        ? 'Requires same discipline.'
                        : `Remove ${sourceUser?.name || 'current user'} and assign ${targetUser.name} instead.`}
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  disabled={!canDuplicateShare}
                  onClick={onDuplicateShare}
                  className={`w-full text-left px-3.5 py-3 transition-colors flex items-start gap-3 ${
                    canDuplicateShare
                      ? 'hover:bg-[var(--surface-muted)] cursor-pointer'
                      : 'opacity-45 cursor-not-allowed bg-[var(--surface-subtle)]'
                  }`}
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 mt-0.5">
                    <Users className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[var(--text-primary)]">
                      Duplicate (Share Assignee)
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                      {isAlreadyAssignedToTarget
                        ? `${targetUser.name} is already on this shared task.`
                        : !isSameDiscipline
                        ? 'Requires same discipline.'
                        : `Add ${targetUser.name} as an assignee on the same task and split workload & time estimates evenly across ${existingAssignees.length + 1} assignees.`}
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={onCreateSubtask}
                  className="w-full text-left px-3.5 py-3 transition-colors flex items-start gap-3 hover:bg-[var(--surface-muted)] cursor-pointer"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text-primary)] mt-0.5">
                    <GitBranch className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[var(--text-primary)]">
                      Create Subtask
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                      Open subtask creation for {targetUser.name} linked under this task.
                    </p>
                  </div>
                </button>
              </div>
            </div>

            <div className="dialog-footer">
              <button type="button" onClick={onClose} className="button-secondary">
                Cancel
              </button>
            </div>
          </DialogPanel>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

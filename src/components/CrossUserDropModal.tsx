import React from 'react';
import { Task, User, TaskStatus } from '../types';
import { X, ArrowLeftRight, Users, GitBranch, AlertTriangle } from 'lucide-react';
import { getTaskAssigneeIds } from '../utils/workload';

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
  if (!isOpen || !task || !targetUser) return null;

  const taskDiscipline = task.team || sourceUser?.role;
  const isSameDiscipline = !taskDiscipline || taskDiscipline === targetUser.role;
  const existingAssignees = getTaskAssigneeIds(task);
  const isAlreadyAssignedToTarget = existingAssignees.includes(targetUser.id);
  const canReassign = isSameDiscipline && !isAlreadyAssignedToTarget;
  const canDuplicateShare = isSameDiscipline && !isAlreadyAssignedToTarget;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#141414] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 dark:border-white/10 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
              Move Task to {targetUser.name}
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 truncate max-w-[320px]">
              {task.title}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/10 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-2.5">
          {!isSameDiscipline && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 mb-3">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Cross-discipline drop ({taskDiscipline} → {targetUser.role}). Only Create Subtask is allowed across disciplines.
              </span>
            </div>
          )}

          <button
            type="button"
            disabled={!canReassign}
            onClick={onReassign}
            className={`w-full text-left rounded-xl border p-3.5 transition-all flex items-start gap-3 ${
              canReassign
                ? 'border-neutral-200 dark:border-white/10 hover:border-neutral-400 dark:hover:border-white/30 hover:bg-neutral-50 dark:hover:bg-white/[0.04]'
                : 'border-neutral-100 dark:border-white/5 opacity-45 cursor-not-allowed bg-neutral-50/50 dark:bg-white/[0.01]'
            }`}
          >
            <div className="rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 p-2 shrink-0">
              <ArrowLeftRight className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-neutral-900 dark:text-white">
                Reassign
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
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
            className={`w-full text-left rounded-xl border p-3.5 transition-all flex items-start gap-3 ${
              canDuplicateShare
                ? 'border-neutral-200 dark:border-white/10 hover:border-neutral-400 dark:hover:border-white/30 hover:bg-neutral-50 dark:hover:bg-white/[0.04]'
                : 'border-neutral-100 dark:border-white/5 opacity-45 cursor-not-allowed bg-neutral-50/50 dark:bg-white/[0.01]'
            }`}
          >
            <div className="rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 p-2 shrink-0">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-neutral-900 dark:text-white">
                Duplicate (Share Assignee)
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
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
            className="w-full text-left rounded-xl border border-neutral-200 dark:border-white/10 hover:border-neutral-400 dark:hover:border-white/30 hover:bg-neutral-50 dark:hover:bg-white/[0.04] p-3.5 transition-all flex items-start gap-3"
          >
            <div className="rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 p-2 shrink-0">
              <GitBranch className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-neutral-900 dark:text-white">
                Create Subtask
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Open subtask creation for {targetUser.name} linked under this task.
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

import { DialogPanel } from './ui/DialogPanel';
import React, { useState, useEffect, useMemo } from 'react';
import { AnimatePresence } from 'motion/react';
import { useDashboard } from '../context/DashboardContext';
import { Task, CognitiveLoad } from '../types';
import {
  getUserDailyAssignedHours,
  COGNITIVE_LOAD_WEIGHTS,
  getUserTag,
} from '../utils/workload';
import {
  X,
  UserCheck,
  Brain,
  Clock,
  AlertCircle,
  ShieldAlert,
} from 'lucide-react';

interface TaskAssignmentModalProps {
  isOpen: boolean;
  task: Task | null;
  onClose: () => void;
}

export const TaskAssignmentModal: React.FC<TaskAssignmentModalProps> = ({
  isOpen,
  task,
  onClose,
}) => {
  const {
    users,
    tasks,
    updateTask,
    canAssignTask,
    creativeDirectors,
  } = useDashboard();

  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [cognitiveLoad, setCognitiveLoad] = useState<CognitiveLoad>('medium');
  const [estimatedHours, setEstimatedHours] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Resolved discipline for this task
  const taskDiscipline = useMemo(() => {
    if (!task) return 'content';
    if (task.team) return task.team;
    if (task.userId) {
      const owner = users.find(u => u.id === task.userId);
      if (owner?.role) return owner.role;
    }
    return 'content';
  }, [task, users]);

  // Strictly filter eligible members to matching discipline ACROSS ALL TEAMS
  const eligibleUsers = useMemo(() => {
    return users.filter(u => u.role === taskDiscipline);
  }, [users, taskDiscipline]);

  useEffect(() => {
    if (task) {
      setSelectedUserId(task.userId || '');
      setCognitiveLoad(task.cognitiveLoad || 'medium');
      setEstimatedHours(task.estimatedHours !== undefined ? String(task.estimatedHours) : '');
      setSubmitError(null);
    }
  }, [task]);

  const selectedUserObj = useMemo(() => {
    if (!selectedUserId) return null;
    return eligibleUsers.find(u => u.id === selectedUserId) || null;
  }, [selectedUserId, eligibleUsers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task || isSubmitting) return;

    if (!canAssignTask) {
      setSubmitError('Only Creative Directors and authorized leadership can assign tasks.');
      return;
    }

    if (selectedUserId) {
      const targetUser = users.find(u => u.id === selectedUserId);
      if (targetUser && targetUser.role && targetUser.role !== taskDiscipline) {
        setSubmitError(`Cannot assign task to a member of a different discipline (${targetUser.role} != ${taskDiscipline}).`);
        return;
      }
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const parsedHours = estimatedHours.trim() ? Math.max(0, parseFloat(estimatedHours)) : undefined;

    try {
      await updateTask(task.id, {
        userId: selectedUserId || undefined,
        cognitiveLoad,
        estimatedHours: parsedHours,
      });
      onClose();
    } catch (err: any) {
      console.error(err);
      setSubmitError(err?.message || 'Failed to update task assignment');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !task) return null;

  return (
    <AnimatePresence>
      <div className="dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/60 ">
        <DialogPanel aria-label="Assign task" onClose={onClose} busy={isSubmitting}
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-lg flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4 bg-neutral-50/50 dark:bg-white/[0.02]">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <UserCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
                  Assign Task & Workload Estimate
                </h3>
              </div>
            </div>
            <button aria-label="Close dialog"
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-neutral-400 hover:text-neutral-900 dark:text-white/40 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {submitError && (
              <div className="rounded-xl border border-red-500/20 bg-red-50 dark:bg-red-950/20 p-3 flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{submitError}</span>
              </div>
            )}

            {/* Task Snapshot */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3.5 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] uppercase font-semibold tracking-wider text-blue-600 dark:text-blue-400">
                  {taskDiscipline.toUpperCase()} DELIVERABLE
                </span>
                {task.priority && (
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase ${
                    task.priority === 'high'
                      ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                      : task.priority === 'medium'
                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                      : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  }`}>
                    {task.priority} Priority
                  </span>
                )}
              </div>
              <h4 className="text-sm font-semibold text-neutral-900 dark:text-white break-words">
                {task.title}
              </h4>
              {(task.client || task.project) && (
                <p className="text-xs text-[var(--text-secondary)]">
                  {[task.client, task.project].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>

            {/* Assignee Selection (Cross-Team Discipline Members Only) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-neutral-700 dark:text-white/80" htmlFor="taskassignmentmodal-field-1">
                  Assign To ({taskDiscipline.charAt(0).toUpperCase() + taskDiscipline.slice(1)} Discipline)
                </label>
                <span className="text-[11px] text-[var(--text-secondary)]">
                  {eligibleUsers.length} eligible member{eligibleUsers.length === 1 ? '' : 's'} across all teams
                </span>
              </div>

              {eligibleUsers.length === 0 ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  <span>No members found with role &ldquo;{taskDiscipline}&rdquo;. Please provision a member first.</span>
                </div>
              ) : (
                <select
                  value={selectedUserId}
                  onChange={e => setSelectedUserId(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3.5 py-2 text-xs text-neutral-900 dark:text-white focus:border-indigo-500 focus:outline-none" id="taskassignmentmodal-field-1"
                >
                  <option value="">-- Leave Unassigned in Pipeline --</option>
                  {eligibleUsers.map(user => {
                    const cdName = user.creativeDirectorId
                      ? creativeDirectors.find(c => c.id === user.creativeDirectorId)?.name || 'Team'
                      : 'Independent';
                    const dailyHours = getUserDailyAssignedHours(user, tasks);
                    const tag = getUserTag(user);
                    return (
                      <option key={user.id} value={user.id}>
                        {user.name} ({tag.label || user.designation || 'Member'}) — CD: {cdName} · {dailyHours}h/day active
                      </option>
                    );
                  })}
                </select>
              )}

              {selectedUserObj && (
                <div className="mt-2 flex items-center justify-between text-xs text-neutral-500 dark:text-white/50 bg-neutral-100/50 dark:bg-white/[0.03] px-3 py-1.5 rounded-lg border border-[var(--border)]">
                  <span>Selected: <strong className="text-neutral-800 dark:text-white">{selectedUserObj.name}</strong></span>
                  <span>Current Assigned: <strong className="text-indigo-600 dark:text-indigo-400">{getUserDailyAssignedHours(selectedUserObj, tasks)}h/day</strong></span>
                </div>
              )}
            </div>

            {/* Cognitive Load Specification */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-neutral-700 dark:text-white/80">
                  Cognitive Load (Mental Effort) <span className="text-red-500">*</span>
                </label>
                <span className="text-[11px] text-[var(--text-secondary)]">
                  Weight multiplier for capacity scoring
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(['low', 'medium', 'high'] as const).map(load => {
                  const weight = COGNITIVE_LOAD_WEIGHTS[load];
                  const isSelected = cognitiveLoad === load;
                  return (
                    <button
                      key={load}
                      type="button"
                      onClick={() => setCognitiveLoad(load)}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-semibold capitalize transition-all cursor-pointer ${
                        isSelected
                          ? load === 'high'
                            ? 'bg-red-500/15 border-red-500 text-red-600 dark:text-red-400 ring-2 ring-red-500/20'
                            : load === 'medium'
                            ? 'bg-amber-500/15 border-amber-500 text-amber-600 dark:text-amber-400 ring-2 ring-amber-500/20'
                            : 'bg-emerald-500/15 border-emerald-500 text-emerald-600 dark:text-emerald-400 ring-2 ring-emerald-500/20'
                          : 'border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:text-neutral-900 dark:hover:text-white'
                      }`}
                    >
                      <Brain className={`h-4 w-4 mb-1 ${
                        isSelected
                          ? load === 'high' ? 'text-red-500' : load === 'medium' ? 'text-amber-500' : 'text-emerald-500'
                          : 'text-neutral-400'
                      }`} />
                      <span>{load}</span>
                      <span className="text-[11px] font-normal opacity-70 mt-0.5">
                        Weight: {weight}x
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time Estimate Specification */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-neutral-700 dark:text-white/80" htmlFor="taskassignmentmodal-field-2">
                  Time Estimate (Hours)
                </label>
                <span className="text-[11px] text-[var(--text-secondary)]">
                  Used for workload & utilization splitting
                </span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={estimatedHours}
                  onChange={e => setEstimatedHours(e.target.value)}
                  placeholder="e.g. 4, 8, 16.5"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] pl-8 pr-12 py-2 text-xs text-neutral-900 dark:text-white focus:border-indigo-500 focus:outline-none" id="taskassignmentmodal-field-2"
                />
                <Clock className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-neutral-400" />
                <span className="absolute right-3 top-2 text-xs text-[var(--text-secondary)]">
                  hours
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-2">
                {[2, 4, 8, 16, 24].map(h => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setEstimatedHours(String(h))}
                    className="flex-1 py-1 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] text-[11px] font-semibold text-neutral-600 dark:text-white/60 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    {h}h
                  </button>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-[var(--border)] text-xs font-semibold text-neutral-700 dark:text-white/80 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-md shadow-indigo-500/20 transition-all cursor-pointer disabled:opacity-40"
              >
                {isSubmitting ? 'Saving...' : selectedUserId ? 'Confirm Assignment' : 'Save Estimates'}
              </button>
            </div>
          </form>
        </DialogPanel>
      </div>
    </AnimatePresence>
  );
};

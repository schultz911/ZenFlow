import { DialogPanel } from './ui/DialogPanel';
import { CognitiveLoadSelector } from './ui/CognitiveLoadSelector';
import { DateQuickPresets } from './ui/DateQuickPresets';
import React, { useState, useEffect, useMemo } from 'react';
import { AnimatePresence } from 'motion/react';
import { useAuth, useWorkspace } from '../context/DashboardContext';
import { Task, CognitiveLoad, Role } from '../types';
import {
  getUserDailyAssignedHours,
  formatHours,
  formatLocalDateKey,
  getLocalOffsetDateKey,
  groupTasksByAssignee,
  quickWorkloadScore,
  getUserTag,
} from '../utils/workload';
import {
  X,
  UserCheck,
  Clock,
  Calendar,
  AlertCircle,
  ShieldAlert,
  ChevronDown,
} from 'lucide-react';

interface TaskAssignmentModalProps {
  isOpen: boolean;
  task: Task | null;
  initialAssigneeId?: string;
  onClose: () => void;
}

export const TaskAssignmentModal: React.FC<TaskAssignmentModalProps> = ({
  isOpen,
  task,
  initialAssigneeId,
  onClose,
}) => {
  const { canAssignTask } = useAuth();
  const {
    users,
    tasks,
    updateTask,
    creativeDirectors,
  } = useWorkspace();

  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [cognitiveLoad, setCognitiveLoad] = useState<CognitiveLoad>('medium');
  const [estimatedHours, setEstimatedHours] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [keepInPipeline, setKeepInPipeline] = useState(false);
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
      setSelectedUserId(task.userId || initialAssigneeId || '');
      setCognitiveLoad(task.cognitiveLoad || 'medium');
      setEstimatedHours(task.estimatedHours !== undefined ? String(task.estimatedHours) : '');
      setDueDate(task.dueDate || getLocalOffsetDateKey(1));
      setKeepInPipeline(false);
      setSubmitError(null);
    }
  }, [task, initialAssigneeId]);

  const selectedUserObj = useMemo(() => {
    if (!selectedUserId) return null;
    return eligibleUsers.find(u => u.id === selectedUserId) || null;
  }, [selectedUserId, eligibleUsers]);

  const tasksByUser = useMemo(() => groupTasksByAssignee(tasks), [tasks]);

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

    const willMoveToTodo = Boolean(selectedUserId && !keepInPipeline);
    if (willMoveToTodo && !dueDate.trim()) {
      setSubmitError('A deadline is required to schedule this task into the member’s To Do lane.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const parsedHours = estimatedHours.trim() ? Math.max(0, parseFloat(estimatedHours)) : undefined;
    const todayIso = formatLocalDateKey();

    try {
      await updateTask(task.id, {
        userId: selectedUserId || undefined,
        assigneeIds: selectedUserId ? [selectedUserId] : [],
        status: willMoveToTodo ? 'todo' : 'pipeline',
        dueDate: willMoveToTodo ? dueDate.trim() : (dueDate.trim() || undefined),
        startDate: selectedUserId ? (task.startDate || todayIso) : undefined,
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
      <div
        className="dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        onClick={e => {
          if (e.target === e.currentTarget && !isSubmitting) onClose();
        }}
      >
        <DialogPanel aria-label="Assign task" onClose={onClose} busy={isSubmitting}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.16, ease: [0.2, 0.7, 0.2, 1] }}
          onClick={e => e.stopPropagation()}
          className="relative w-full max-w-lg my-auto flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="dialog-header">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-[var(--accent-soft)] text-[#1d4ed8] dark:text-blue-400">
                <UserCheck className="h-4 w-4" />
              </div>
              <h2 className="text-sm font-bold tracking-tight text-[var(--text-primary)]">
                Assign Task &amp; Workload Estimate
              </h2>
            </div>
            <button
              aria-label="Close dialog"
              type="button"
              onClick={onClose}
              className="icon-button shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="p-5 space-y-4">
              {submitError && (
                <div role="alert" className="callout callout-danger flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Task Snapshot */}
              <div className="rounded-[7px] border border-[var(--border)] bg-[var(--surface-muted)] px-3.5 py-3 space-y-1">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="uppercase font-bold tracking-wider text-[#1d4ed8] dark:text-blue-400">
                    {taskDiscipline} Deliverable
                  </span>
                  {task.priority && (
                    <span
                      className={`font-semibold capitalize ${
                        task.priority === 'high'
                          ? 'text-red-600 dark:text-red-400'
                          : task.priority === 'medium'
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      {task.priority} priority
                    </span>
                  )}
                </div>
                <h4 className="text-sm font-semibold text-[var(--text-primary)] break-words">
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
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label className="field-label !mb-0" htmlFor="taskassignmentmodal-field-1">
                    Assign To ({taskDiscipline.charAt(0).toUpperCase() + taskDiscipline.slice(1)})
                  </label>
                  <span className="text-[11px] tabular-nums text-[var(--text-secondary)]">
                    {eligibleUsers.length} eligible member{eligibleUsers.length === 1 ? '' : 's'}
                  </span>
                </div>

                {eligibleUsers.length === 0 ? (
                  <div className="callout callout-warning flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    <span>No members found with role &ldquo;{taskDiscipline}&rdquo;. Please provision a member first.</span>
                  </div>
                ) : (
                  <div className="relative">
                    <select
                      value={selectedUserId}
                      onChange={e => setSelectedUserId(e.target.value)}
                      className="field-control pr-8 cursor-pointer"
                      id="taskassignmentmodal-field-1"
                    >
                      <option value="">-- Leave Unassigned in Pipeline --</option>
                      {eligibleUsers.map(user => {
                        const cdName = user.creativeDirectorId
                          ? creativeDirectors.find(c => c.id === user.creativeDirectorId)?.name || 'Team'
                          : 'Independent';
                        const dailyHours = getUserDailyAssignedHours(user, tasks);
                        const loadScore = quickWorkloadScore(tasksByUser.get(user.id) || []);
                        const tag = getUserTag(user);
                        return (
                          <option key={user.id} value={user.id}>
                            {user.name} ({tag.label || user.designation || 'Member'}) — {cdName} · {loadScore}/12 pts · {formatHours(dailyHours)}/d
                          </option>
                        );
                      })}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
                  </div>
                )}

                {selectedUserObj && (() => {
                  const selectedLoad = quickWorkloadScore(tasksByUser.get(selectedUserObj.id) || []);
                  const selectedDailyHours = getUserDailyAssignedHours(selectedUserObj, tasks);
                  return (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-secondary)] bg-[var(--surface-muted)] px-3 py-1.5 rounded-[7px] border border-[var(--border)] tabular-nums">
                      <span>Selected: <strong className="text-[var(--text-primary)]">{selectedUserObj.name}</strong></span>
                      <div className="flex items-center gap-2.5">
                        <span className={selectedLoad >= 12 ? 'font-semibold text-red-600 dark:text-red-400' : ''}>
                          Load: <strong>{selectedLoad} / 12 pts</strong>
                        </span>
                        <span className="text-[var(--text-muted)]">·</span>
                        <span>Assigned: <strong className="text-[#1d4ed8] dark:text-blue-400">{formatHours(selectedDailyHours)}/day</strong></span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Cognitive Load Specification */}
              <CognitiveLoadSelector
                value={cognitiveLoad}
                onChange={setCognitiveLoad}
                role={(selectedUserObj?.role || taskDiscipline) as Role}
                required
              />

              {/* Deadline & Placement */}
              {selectedUserId && (
                <div className="space-y-2.5">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                      <label className="field-label !mb-0 flex items-center gap-1.5" htmlFor="taskassignmentmodal-deadline">
                        <Calendar className="h-3 w-3 text-[#1d4ed8] dark:text-blue-400" />
                        <span>
                          Deadline {!keepInPipeline && <span className="text-red-600 dark:text-red-400">*</span>}
                        </span>
                      </label>
                      <DateQuickPresets
                        value={dueDate}
                        onSelectDate={setDueDate}
                        includeToday
                        allowClear={keepInPipeline}
                      />
                    </div>
                    <input
                      id="taskassignmentmodal-deadline"
                      type="date"
                      required={!keepInPipeline}
                      value={dueDate}
                      onChange={e => setDueDate(e.target.value)}
                      className="field-control tabular-nums cursor-pointer"
                    />
                  </div>

                  <label className="flex items-center gap-2 rounded-[7px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--text-primary)] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={keepInPipeline}
                      onChange={e => setKeepInPipeline(e.target.checked)}
                      className="rounded border-[var(--border)] h-3.5 w-3.5"
                    />
                    <span>Keep in Team Pipeline as assigned (don&rsquo;t move to To Do yet)</span>
                  </label>
                </div>
              )}

              {/* Time Estimate Specification */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label className="field-label !mb-0" htmlFor="taskassignmentmodal-field-2">
                    Time Estimate (Hours)
                  </label>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    Split across working days
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
                    className="field-control pl-8 pr-12 tabular-nums"
                    id="taskassignmentmodal-field-2"
                  />
                  <Clock className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-[var(--text-muted)]">
                    hours
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-2">
                  {[2, 4, 8, 16].map(h => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setEstimatedHours(String(h))}
                      className={`mobile-tap-control sm:min-h-[28px] flex-1 py-1 rounded-[5px] border text-[11px] font-semibold tabular-nums transition-colors cursor-pointer ${
                        estimatedHours === String(h)
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[#1d4ed8] dark:text-blue-300'
                          : 'border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {h}h
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="dialog-footer">
              <button
                type="button"
                onClick={onClose}
                className="button-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="button-primary"
              >
                {isSubmitting
                  ? 'Saving...'
                  : selectedUserId
                    ? keepInPipeline
                      ? 'Assign in Pipeline'
                      : 'Assign & Move to To Do'
                    : 'Save Estimates'}
              </button>
            </div>
          </form>
        </DialogPanel>
      </div>
    </AnimatePresence>
  );
};

import { MetricHelp, loadHelp } from './MetricHelp';
import { DialogPanel } from './ui/DialogPanel';
import { CognitiveLoadSelector } from './ui/CognitiveLoadSelector';
import { DateQuickPresets } from './ui/DateQuickPresets';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AnimatePresence } from 'motion/react';
import { useAuth, useWorkspace } from '../context/DashboardContext';
import { getAnalyticsClock } from '../domain/analyticsDate';
import { useDiscardGuard } from '../hooks/useDiscardGuard';
import { Task, CognitiveLoad, Role } from '../types';
import {
  getUserDailyAssignedHours,
  getAssignedHoursByMemberAndDate,
  formatDateOnly,
  formatHours,
  formatLocalDateKey,
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
} from 'lucide-react';

interface TaskAssignmentModalProps {
  isOpen: boolean;
  task: Task | null;
  initialAssigneeId?: string;
  onClose: () => void;
  onAssigned: (taskId: string, member: string, destination: string) => void;
}

export const TaskAssignmentModal: React.FC<TaskAssignmentModalProps> = ({
  isOpen,
  task,
  initialAssigneeId,
  onClose,
  onAssigned,
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
  const [confirmOverload, setConfirmOverload] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const initialSnapshotRef = useRef<string>('');

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
    if (!isOpen || !task) {
      initialSnapshotRef.current = '';
      return;
    }
    const rawInitUser = task.userId || initialAssigneeId || '';
    const initUser = rawInitUser && eligibleUsers.some(u => u.id === rawInitUser) ? rawInitUser : '';
    const initLoad: CognitiveLoad = task.cognitiveLoad || 'medium';
    const initHours = task.estimatedHours !== undefined ? String(task.estimatedHours) : '';
    const initDue = task.dueDate || '';
    setSelectedUserId(initUser);
    setCognitiveLoad(initLoad);
    setEstimatedHours(initHours);
    setDueDate(initDue);
    setKeepInPipeline(false);
    setSubmitError(null);
    initialSnapshotRef.current = JSON.stringify([initUser, initLoad, initHours, initDue, false]);
  }, [isOpen, task, initialAssigneeId, eligibleUsers]);

  const isDirty = useMemo(() => {
    if (!isOpen || !task || !initialSnapshotRef.current) return false;
    return JSON.stringify([selectedUserId, cognitiveLoad, estimatedHours, dueDate, keepInPipeline]) !== initialSnapshotRef.current;
  }, [isOpen, task, selectedUserId, cognitiveLoad, estimatedHours, dueDate, keepInPipeline]);

  const { showDiscardConfirm, requestClose, confirmDiscard, resetDiscardConfirm } = useDiscardGuard(
    isDirty,
    isSubmitting,
    onClose
  );

  const selectedUserObj = useMemo(() => {
    if (!selectedUserId) return null;
    return eligibleUsers.find(u => u.id === selectedUserId) || null;
  }, [selectedUserId, eligibleUsers]);

  const tasksByUser = useMemo(() => groupTasksByAssignee(tasks), [tasks]);
  const today = getAnalyticsClock().date;
  const memberChoices = useMemo(() => {
    if (!isOpen) return [];
    const hoursByMember = getAssignedHoursByMemberAndDate(tasks, [today], today);
    return eligibleUsers.map(user => ({
      user,
      hours: hoursByMember.get(user.id)?.get(today) ?? 0,
      load: quickWorkloadScore(tasksByUser.get(user.id) ?? []),
    })).sort((a, b) => a.hours - b.hours || a.load - b.load || a.user.name.localeCompare(b.user.name));
  }, [isOpen, eligibleUsers, tasks, tasksByUser, today]);


  const projected = useMemo(() => {
    if (!task || !selectedUserObj) return null;
    const currentTasks = tasksByUser.get(selectedUserObj.id) || [];
    const hours = estimatedHours.trim() ? Number(estimatedHours) : undefined;
    const projectedTask: Task = { ...task, userId: selectedUserObj.id, assigneeIds: [selectedUserObj.id],
      status: keepInPipeline ? 'pipeline' : 'todo', dueDate: dueDate || undefined,
      startDate: task.startDate || formatLocalDateKey(), cognitiveLoad,
      estimatedHours: hours !== undefined && Number.isFinite(hours) ? Math.max(0, hours) : undefined };
    const projectedTasks = currentTasks.some(item => item.id === task.id)
      ? currentTasks.map(item => item.id === task.id ? projectedTask : item)
      : [...currentTasks, projectedTask];
    return {
      selectedLoad: quickWorkloadScore(currentTasks), projectedLoad: quickWorkloadScore(projectedTasks),
      selectedDailyHours: getUserDailyAssignedHours(selectedUserObj, currentTasks),
      projectedDailyHours: getUserDailyAssignedHours(selectedUserObj, projectedTasks),
    };
  }, [task, selectedUserObj, tasksByUser, estimatedHours, keepInPipeline, dueDate, cognitiveLoad]);
  const willOverload = Boolean(projected && (projected.projectedLoad >= 12 || projected.projectedDailyHours > 8));
  useEffect(() => {
    setConfirmOverload(false);
  }, [isOpen, task?.id, selectedUserId, cognitiveLoad, estimatedHours, dueDate, keepInPipeline,
    projected?.projectedLoad, projected?.projectedDailyHours]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task || isSubmitting) return;

    if (!canAssignTask) {
      setSubmitError('Ask a Creative Director, Business Lead, Cluster Lead or administrator to assign this task.');
      return;
    }

    if (selectedUserId) {
      const targetUser = users.find(u => u.id === selectedUserId);
      if (targetUser && targetUser.role && targetUser.role !== taskDiscipline) {
        setSubmitError(`Choose an eligible member from the ${taskDiscipline} team.`);
        return;
      }
    }

    const willMoveToTodo = Boolean(selectedUserId && !keepInPipeline);
    if (willMoveToTodo && !dueDate.trim()) {
      setSubmitError('Set a deadline in Schedule, or choose to keep the task in Team Pipeline.');
      return;
    }

    if (willOverload && !confirmOverload) {
      setSubmitError('Confirm the workload impact before assigning this task.');
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
        dueDate: willMoveToTodo
          ? dueDate.trim()
          : selectedUserId
            ? (dueDate.trim() || undefined)
            : (task.dueDate || undefined),
        startDate: selectedUserId ? (task.startDate || todayIso) : undefined,
        cognitiveLoad,
        estimatedHours: parsedHours,
      });
      onAssigned(task.id, selectedUserObj?.name || 'Unassigned', willMoveToTodo ? 'To Do' : 'Team Pipeline');
      onClose();
    } catch (err) {
      console.error(err);
      const status = err instanceof Error && 'status' in err ? err.status : undefined;
      if (status === 401) {
        setSubmitError('Your session expired. Sign in again, then reopen the brief in Pipeline.');
      } else if (status === 403) {
        setSubmitError('You don’t have permission to save this assignment. Ask a lead or administrator with access to the brief.');
      } else {
        setSubmitError('Could not save the assignment. Check the brief in Pipeline before trying again.');
      }
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
          if (e.target === e.currentTarget && !isSubmitting) requestClose();
        }}
      >
        <DialogPanel aria-label="Assign task" onClose={requestClose} busy={isSubmitting}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.16, ease: [0.2, 0.7, 0.2, 1] }}
          onClick={e => e.stopPropagation()}
          className="relative w-full max-w-5xl my-auto flex flex-col overflow-hidden"
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
              onClick={requestClose}
              className="icon-button shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            <div className="p-4 overflow-y-auto flex-1 space-y-3.5">
              {showDiscardConfirm && (
                <div role="alertdialog" aria-label="Discard unsaved assignment" className="callout callout-warning space-y-2">
                  <p className="text-xs font-semibold">Discard unsaved assignment?</p>
                  <p className="text-[11px] opacity-90">
                    You have unsubmitted assignment or estimate changes that will be lost if you close now.
                  </p>
                  <div className="flex gap-2 pt-1">
                    <button type="button" autoFocus onClick={resetDiscardConfirm} className="button-secondary">
                      Keep Editing
                    </button>
                    <button type="button" onClick={confirmDiscard} className="button-danger-outline">
                      Discard
                    </button>
                  </div>
                </div>
              )}

              {/* Task Snapshot */}
              <div className="rounded-[7px] border border-[var(--border)] bg-[var(--surface-muted)] px-3.5 py-2.5 space-y-0.5">
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
                <h3 className="text-sm font-semibold text-[var(--text-primary)] break-words">
                  {task.title}
                </h3>
                {(task.client || task.project || task.dueDate) && (
                  <p className="wrap-anywhere text-xs text-[var(--text-secondary)]">
                    {[task.client, task.project, task.dueDate && `Due ${formatDateOnly(task.dueDate)}`].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>

              <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
                <fieldset className="min-w-0" disabled={isSubmitting}>
                  <legend className="field-label">Member</legend>
                  {memberChoices.length === 0 ? (
                    <div className="callout callout-warning flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 shrink-0" />
                      <span>No eligible members in this discipline. You can save estimates in the pipeline.</span>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_3.5rem] gap-2 px-2 pb-1 text-xs text-[var(--text-secondary)]">
                        <span>{memberChoices.length} eligible</span>
                        <span className="text-right">Assigned today</span>
                        <span className="flex items-center justify-end gap-1.5">Load <MetricHelp label="About assignment load points" detail={loadHelp} /></span>
                      </div>
                      <div className="border-y border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
                        {memberChoices.map(({ user, hours, load }) => {
                          const lead = user.isCreativeDirector ? null : user.creativeDirectorId
                            ? creativeDirectors.find(director => director.id === user.creativeDirectorId)?.name || 'Team'
                            : 'Independent';
                          const nameId = `assignment-member-${user.id}-name`;
                          const capacityId = `assignment-member-${user.id}-capacity`;
                          return (
                            <label key={user.id} className="grid grid-cols-[minmax(0,1fr)_5.5rem_3.5rem] items-center gap-2 min-h-11 px-2 py-1 cursor-pointer has-checked:bg-[var(--accent-soft)] hover:bg-[var(--surface-subtle)]">
                              <span className="min-w-0 flex items-center gap-2">
                                <input type="radio" name="assignment-member" value={user.id}
                                  checked={selectedUserId === user.id} onChange={() => setSelectedUserId(user.id)}
                                  data-autofocus={selectedUserId === user.id ? '' : undefined}
                                  aria-labelledby={`${nameId} ${capacityId}`} className="shrink-0" />
                                <span id={nameId} className="min-w-0 break-words text-sm font-medium">
                                  {user.name}
                                  <span className="block text-xs font-normal text-[var(--text-secondary)]">
                                    {[getUserTag(user).label, lead].filter(Boolean).join(' · ')}
                                  </span>
                                </span>
                              </span>
                              <span className="text-right text-sm font-semibold tabular-nums" aria-hidden="true">{formatHours(hours)}</span>
                              <span className="text-right text-xs tabular-nums text-[var(--text-secondary)]" aria-hidden="true">{load} pts</span>
                              <span id={capacityId} className="sr-only">{formatHours(hours)} assigned today, {load} load points.</span>
                            </label>
                          );
                        })}
                      </div>
                      <label className="flex items-center gap-2 min-h-11 px-2 text-sm cursor-pointer">
                        <input type="radio" name="assignment-member" value="" checked={!selectedUserId}
                          data-autofocus={!selectedUserId ? '' : undefined}
                          onChange={() => {
                            setSelectedUserId('');
                            if (!task.dueDate) setDueDate('');
                          }} />
                        Leave unassigned in pipeline
                      </label>
                    </>
                  )}
                </fieldset>

                <div className="min-w-0 space-y-3.5">
                  <fieldset disabled={!selectedUserId || isSubmitting} aria-describedby={!selectedUserId ? 'assignment-destination-help' : undefined}>
                    <legend className="field-label">Destination</legend>
                    {!selectedUserId && <p id="assignment-destination-help" className="mb-1 text-xs text-[var(--text-secondary)]">Select a member to choose a destination. Estimates can be saved in Pipeline without assigning the brief.</p>}
                    <div className="grid sm:grid-cols-2 sm:gap-2">
                      <label className="flex items-center gap-2 text-xs min-h-11 sm:min-h-8">
                        <input type="radio" name="assignment-destination" checked={!keepInPipeline} onChange={() => setKeepInPipeline(false)} />
                        Move to To Do
                      </label>
                      <label className="flex items-center gap-2 text-xs min-h-11 sm:min-h-8">
                        <input type="radio" name="assignment-destination" checked={keepInPipeline} onChange={() => setKeepInPipeline(true)} />
                        Keep assigned in Team Pipeline
                      </label>
                    </div>
                  </fieldset>
                  <fieldset className="min-w-0 space-y-2.5 border-t border-[var(--border-subtle)] pt-2" disabled={isSubmitting}>
                    <legend className="field-label pr-2">Schedule</legend>
                    <CognitiveLoadSelector
                      value={cognitiveLoad}
                      onChange={setCognitiveLoad}
                      role={(selectedUserObj?.role || taskDiscipline) as Role}
                      required
                    />

                    {/* Deadline & Time Estimate side-by-side to keep modal compact on 700px laptops */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-start">
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <label className="field-label !mb-0 flex items-center gap-1.5" htmlFor="taskassignmentmodal-deadline">
                            <Calendar className="h-3 w-3 text-[#1d4ed8] dark:text-blue-400" />
                            <span>
                              Deadline {selectedUserId && !keepInPipeline && <span className="text-red-600 dark:text-red-400">*</span>}
                            </span>
                          </label>
                          {!selectedUserId && (
                            <span className="text-[11px] text-[var(--text-muted)] truncate">
                              Pick member first
                            </span>
                          )}
                        </div>
                        <input
                          id="taskassignmentmodal-deadline"
                          type="date"
                          disabled={!selectedUserId || isSubmitting}
                          required={Boolean(selectedUserId && !keepInPipeline)}
                          value={dueDate}
                          onChange={e => setDueDate(e.target.value)}
                          className="field-control tabular-nums cursor-pointer"
                        />
                        <DateQuickPresets
                          value={dueDate}
                          onSelectDate={setDueDate}
                          disabled={!selectedUserId || isSubmitting}
                          includeToday
                          allowClear={keepInPipeline}
                          compact
                          className="mt-1.5"
                        />
                      </div>

                      {/* Time Estimate Specification */}
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <label className="field-label !mb-0 whitespace-nowrap" htmlFor="taskassignmentmodal-field-2">
                            Time Estimate
                          </label>
                          <span className="text-[11px] text-[var(--text-secondary)] whitespace-nowrap">
                            Split across days
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
                        <div className="flex items-center gap-1.5 mt-1.5">
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
                  </fieldset>
                </div>
              </div>
            </div>
            {selectedUserObj && projected && (
              <section aria-labelledby="assignment-review-heading" className="shrink-0 space-y-1.5 border-t border-[var(--border-subtle)] px-4 py-2 text-xs text-[var(--text-secondary)]">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 id="assignment-review-heading" className="text-xs font-semibold text-[var(--text-primary)]">Review</h3>
                  <p className="wrap-anywhere text-[var(--text-primary)]">Selected member <strong>{selectedUserObj.name}</strong> · {keepInPipeline ? 'Team Pipeline' : 'To Do'}</p>
                  <button type="button" className="min-h-0 rounded text-[var(--accent)] underline underline-offset-2"
                    onClick={() => document.getElementById('taskassignmentmodal-deadline')?.focus()}>
                    {dueDate ? `Edit deadline · ${formatDateOnly(dueDate)}` : keepInPipeline ? 'Set optional deadline' : 'Set required deadline'}
                  </button>
                </div>
                <p className="tabular-nums">
                  Assigned today: <strong>{formatHours(projected.selectedDailyHours)}{dueDate && ` → ${formatHours(projected.projectedDailyHours)}`}</strong>
                  {!dueDate && ' · Projected: set a deadline'}
                  {' · '}Load: <strong>{projected.selectedLoad} → {projected.projectedLoad} / 12 pts</strong>
                  {dueDate && projected.projectedDailyHours > 8 && ' · Over 8h/day'}
                </p>
                {willOverload && (
                  <label className="flex items-start gap-2 font-medium text-red-700 dark:text-red-300">
                    <input type="checkbox" checked={confirmOverload} onChange={event => setConfirmOverload(event.target.checked)} />
                    <span>I understand the projected workload and want to assign this task.</span>
                  </label>
                )}
              </section>
            )}

            {submitError && (
              <div role="alert" className="callout callout-danger mx-4 my-2 shrink-0 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{submitError}</span>
              </div>
            )}

            {/* Footer */}
            <div className="dialog-footer">
              <button
                type="button"
                onClick={requestClose}
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
                    : 'Save estimates in Pipeline'}
              </button>
            </div>
          </form>
        </DialogPanel>
      </div>
    </AnimatePresence>
  );
};

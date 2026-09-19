import React, { useState, useEffect, useMemo } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { Task, CognitiveLoad, TaskStatus, TaskActivity } from '../types';
import { X, Calendar, Brain, Trash2, History, Clock, ArrowRight, CheckCircle2, UserCheck, PlusCircle } from 'lucide-react';

function formatActivityTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const now = Date.now();
    const diffMs = now - d.getTime();
    const diffMin = Math.floor(diffMs / (1000 * 60));
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return isoString;
  }
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '< 1m';
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  if (days > 0) return `${days}d ${remHours}h`;
  if (hours > 0) return `${hours}h`;
  const minutes = Math.floor(ms / (1000 * 60));
  return `${Math.max(1, minutes)}m`;
}

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskToEdit?: Task | null;
  defaultUserId?: string;
  defaultStatus?: TaskStatus;
}

export const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  onClose,
  taskToEdit,
  defaultUserId,
  defaultStatus = 'todo',
}) => {
  const { users, currentUser, createTask, updateTask, deleteTask } = useDashboard();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [userId, setUserId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [cognitiveLoad, setCognitiveLoad] = useState<CognitiveLoad>('medium');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  useEffect(() => {
    if (taskToEdit) {
      setTitle(taskToEdit.title);
      setDescription(taskToEdit.description || '');
      setUserId(taskToEdit.userId);
      setDueDate(taskToEdit.dueDate || '');
      setCognitiveLoad(taskToEdit.cognitiveLoad);
      setStatus(taskToEdit.status);
    } else {
      setTitle('');
      setDescription('');
      setUserId(defaultUserId || currentUser?.id || users[0]?.id || '');
      setDueDate('');
      setCognitiveLoad('medium');
      setStatus(defaultStatus);
    }
    setShowConfirmDelete(false);
  }, [taskToEdit, defaultUserId, defaultStatus, currentUser, users, isOpen]);

  const activities = useMemo(() => {
    return taskToEdit?.activityLog || [];
  }, [taskToEdit]);

  const cycleMetrics = useMemo(() => {
    if (!taskToEdit) return null;
    const startMs = taskToEdit.createdAt ? new Date(taskToEdit.createdAt).getTime() : 0;
    const endMs = taskToEdit.completedAt
      ? new Date(taskToEdit.completedAt).getTime()
      : (taskToEdit.status === 'done' ? Date.now() : Date.now());

    const totalLeadTimeMs = startMs > 0 ? Math.max(0, endMs - startMs) : 0;

    // Time in current status: find latest activity that changed status or created task
    const statusChangeAct = activities.find(a => a.action === 'status_change' || a.action === 'created');
    const statusStartMs = statusChangeAct ? new Date(statusChangeAct.timestamp).getTime() : startMs;
    const currentStatusMs = statusStartMs > 0 ? Math.max(0, Date.now() - statusStartMs) : 0;

    return {
      isDone: taskToEdit.status === 'done',
      totalLeadTimeStr: totalLeadTimeMs > 0 ? formatDuration(totalLeadTimeMs) : '< 1m',
      currentStatusStr: currentStatusMs > 0 ? formatDuration(currentStatusMs) : '< 1m',
      revisionCount: activities.length,
    };
  }, [taskToEdit, activities]);

  if (!isOpen) return null;

  const selectedUser = users.find(u => u.id === userId);
  const role = selectedUser?.role || 'content';

  // Helper for quick due dates
  const setQuickDate = (daysFromNow: number | null) => {
    if (daysFromNow === null) {
      setDueDate('');
      return;
    }
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setDueDate(`${yyyy}-${mm}-${dd}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !userId) return;

    setIsSubmitting(true);
    try {
      if (taskToEdit) {
        await updateTask(taskToEdit.id, {
          title: title.trim(),
          description: description.trim() || undefined,
          userId,
          dueDate: dueDate || undefined,
          cognitiveLoad,
          status,
        });
      } else {
        await createTask({
          userId,
          title: title.trim(),
          description: description.trim() || undefined,
          dueDate: dueDate || undefined,
          cognitiveLoad,
          status,
        });
      }
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!taskToEdit) return;
    setIsSubmitting(true);
    try {
      await deleteTask(taskToEdit.id);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-sm p-4">
      <div
        id="task-modal"
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#0D0D0D] p-6 shadow-2xl transition-all animate-in fade-in zoom-in-95 duration-200 text-neutral-900 dark:text-white"
      >
        <div className="flex items-center justify-between border-b border-neutral-100 dark:border-white/5 pb-3.5">
          <h2 className="text-base font-semibold tracking-tight text-neutral-900 dark:text-white">
            {taskToEdit ? 'Edit Task' : 'Create New Task'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Task Title */}
          <div>
            <label className="block text-xs uppercase tracking-wider font-semibold text-neutral-500 dark:text-white/40 mb-1.5">
              Task <span className="text-red-500">*</span>
            </label>
            <input
              id="task-title-input"
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Redesign navigation menu for mobile screens"
              className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#141414] py-2 px-3 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-none transition-colors"
              required
              autoFocus
            />
          </div>

          {/* Row: Assignee & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Assignee */}
            <div>
              <label className="block text-xs uppercase tracking-wider font-semibold text-neutral-500 dark:text-white/40 mb-1.5">
                Assignee
              </label>
              <select
                id="task-assignee-select"
                value={userId}
                onChange={e => setUserId(e.target.value)}
                className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#141414] py-2 px-2.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none transition-colors"
              >
                {users.length === 0 ? (
                  <option value="" disabled>
                    No members yet — please add a member first
                  </option>
                ) : (
                  users.map(u => (
                    <option key={u.id} value={u.id} className="bg-white dark:bg-[#141414] text-neutral-900 dark:text-white">
                      {u.name} ({u.role === 'content' ? 'Content' : 'Design'})
                    </option>
                  ))
                )}
              </select>
              {users.length === 0 && (
                <p className="mt-1 text-[11px] text-amber-500 dark:text-amber-400">
                  Please add at least one member before assigning tasks.
                </p>
              )}
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs uppercase tracking-wider font-semibold text-neutral-500 dark:text-white/40 mb-1.5">
                Status
              </label>
              <select
                id="task-status-select"
                value={status}
                onChange={e => setStatus(e.target.value as TaskStatus)}
                className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#141414] py-2 px-2.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none transition-colors capitalize"
              >
                <option value="todo" className="bg-white dark:bg-[#141414] text-neutral-900 dark:text-white">To Do</option>
                <option value="in_progress" className="bg-white dark:bg-[#141414] text-neutral-900 dark:text-white">In Progress</option>
                <option value="in_review" className="bg-white dark:bg-[#141414] text-neutral-900 dark:text-white">In Review</option>
                <option value="done" className="bg-white dark:bg-[#141414] text-neutral-900 dark:text-white">Done</option>
                <option value="archived" className="bg-white dark:bg-[#141414] text-neutral-900 dark:text-white">Archived</option>
              </select>
            </div>
          </div>

          {/* Cognitive Load Picker with role-specific definitions */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs uppercase tracking-wider font-semibold text-neutral-500 dark:text-white/40 flex items-center gap-1.5">
                <Brain className="h-3.5 w-3.5 text-neutral-400 dark:text-white/40" />
                <span>Cognitive Load</span>
              </label>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                id="cognitive-load-low"
                onClick={() => setCognitiveLoad('low')}
                className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all ${
                  cognitiveLoad === 'low'
                    ? 'border-green-500/50 bg-green-50 dark:bg-green-500/15 text-green-700 dark:text-green-400 ring-1 ring-green-500/30'
                    : 'border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-[#141414] text-neutral-600 dark:text-white/40 hover:text-neutral-900 dark:hover:text-white hover:border-neutral-300 dark:hover:border-white/10'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-xs font-semibold">Low</span>
                </div>
                <span className="text-[10px] text-neutral-500 dark:text-white/50 mt-1 leading-tight">
                  {role === 'content' ? 'Content Writing' : 'Adaptive Design'}
                </span>
              </button>

              <button
                type="button"
                id="cognitive-load-medium"
                onClick={() => setCognitiveLoad('medium')}
                className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all ${
                  cognitiveLoad === 'medium'
                    ? 'border-yellow-500/50 bg-yellow-50 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 ring-1 ring-yellow-500/30'
                    : 'border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-[#141414] text-neutral-600 dark:text-white/40 hover:text-neutral-900 dark:hover:text-white hover:border-neutral-300 dark:hover:border-white/10'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-yellow-500" />
                  <span className="text-xs font-semibold">Medium</span>
                </div>
                <span className="text-[10px] text-neutral-500 dark:text-white/50 mt-1 leading-tight">
                  {role === 'content' ? 'Creative Concept' : 'Conceptual Design'}
                </span>
              </button>

              <button
                type="button"
                id="cognitive-load-high"
                onClick={() => setCognitiveLoad('high')}
                className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all ${
                  cognitiveLoad === 'high'
                    ? 'border-red-500/50 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-400 ring-1 ring-red-500/30'
                    : 'border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-[#141414] text-neutral-600 dark:text-white/40 hover:text-neutral-900 dark:hover:text-white hover:border-neutral-300 dark:hover:border-white/10'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  <span className="text-xs font-semibold">High</span>
                </div>
                <span className="text-[10px] text-neutral-500 dark:text-white/50 mt-1 leading-tight">
                  {role === 'content' ? 'Strategy & Planning' : 'Identity Design'}
                </span>
              </button>
            </div>
          </div>

          {/* Due Date (no optional tag, no bottom note) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs uppercase tracking-wider font-semibold text-neutral-500 dark:text-white/40 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-neutral-400 dark:text-white/40" />
                <span>Due Date</span>
              </label>
              <div className="flex items-center gap-1 text-[10px]">
                <button
                  type="button"
                  onClick={() => setQuickDate(0)}
                  className="rounded px-1.5 py-0.5 text-neutral-500 hover:bg-neutral-100 dark:text-white/40 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setQuickDate(1)}
                  className="rounded px-1.5 py-0.5 text-neutral-500 hover:bg-neutral-100 dark:text-white/40 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white"
                >
                  Tomorrow
                </button>
                <button
                  type="button"
                  onClick={() => setQuickDate(3)}
                  className="rounded px-1.5 py-0.5 text-neutral-500 hover:bg-neutral-100 dark:text-white/40 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white"
                >
                  +3d
                </button>
                <button
                  type="button"
                  onClick={() => setQuickDate(7)}
                  className="rounded px-1.5 py-0.5 text-neutral-500 hover:bg-neutral-100 dark:text-white/40 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white"
                >
                  +1w
                </button>
                {dueDate && (
                  <button
                    type="button"
                    onClick={() => setQuickDate(null)}
                    className="rounded px-1.5 py-0.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <input
              id="task-due-date-input"
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#141414] py-2 px-3 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none transition-colors"
            />
          </div>

          {/* Context (if any) - moved to end */}
          <div>
            <label className="block text-xs uppercase tracking-wider font-semibold text-neutral-500 dark:text-white/40 mb-1.5">
              Context (if any)
            </label>
            <textarea
              id="task-description-input"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Key requirements, scope, or delivery specifications..."
              rows={2}
              className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#141414] py-2 px-3 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-none resize-none transition-colors"
            />
          </div>

          {/* Micro Activity Audit Trail & Cycle Time */}
          {taskToEdit && (
            <div className="pt-3 border-t border-neutral-100 dark:border-white/5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-white/40">
                  <History className="h-3.5 w-3.5 text-blue-500" />
                  <span>Activity & Cycle Time</span>
                </div>
                {cycleMetrics && (
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium text-neutral-400 dark:text-white/40">
                    <span className="flex items-center gap-1 bg-neutral-100 dark:bg-white/5 px-2 py-0.5 rounded-md border border-neutral-200/50 dark:border-white/5">
                      <Clock className="h-3 w-3 text-neutral-500 dark:text-white/50" />
                      {cycleMetrics.isDone ? 'Completed in:' : 'Lead time:'} <strong className="text-neutral-700 dark:text-white/80">{cycleMetrics.totalLeadTimeStr}</strong>
                    </span>
                    <span className="bg-neutral-100 dark:bg-white/5 px-2 py-0.5 rounded-md border border-neutral-200/50 dark:border-white/5">
                      In status: <strong className="text-neutral-700 dark:text-white/80">{cycleMetrics.currentStatusStr}</strong>
                    </span>
                  </div>
                )}
              </div>

              {activities.length === 0 ? (
                <div className="rounded-xl border border-neutral-200/70 dark:border-white/5 bg-neutral-50 dark:bg-[#121212] p-3 text-center text-[11px] text-neutral-400 dark:text-white/30">
                  Created {formatActivityTime(taskToEdit.createdAt || '')} • No modifications recorded yet
                </div>
              ) : (
                <div className="max-h-36 overflow-y-auto rounded-xl border border-neutral-200/70 dark:border-white/5 bg-neutral-50 dark:bg-[#121212] p-2.5 space-y-2 text-xs divide-y divide-neutral-100 dark:divide-white/5">
                  {activities.map(act => {
                    let IconComponent = Clock;
                    let iconBg = 'text-neutral-500 bg-neutral-200/60 dark:bg-white/10';

                    if (act.action === 'created') {
                      IconComponent = PlusCircle;
                      iconBg = 'text-blue-500 bg-blue-100 dark:bg-blue-500/10';
                    } else if (act.action === 'status_change') {
                      IconComponent = act.to === 'done' ? CheckCircle2 : ArrowRight;
                      iconBg = act.to === 'done'
                        ? 'text-emerald-500 bg-emerald-100 dark:bg-emerald-500/10'
                        : 'text-amber-500 bg-amber-100 dark:bg-amber-500/10';
                    } else if (act.action === 'reassigned') {
                      IconComponent = UserCheck;
                      iconBg = 'text-purple-500 bg-purple-100 dark:bg-purple-500/10';
                    } else if (act.action === 'rescheduled') {
                      IconComponent = Calendar;
                      iconBg = 'text-sky-500 bg-sky-100 dark:bg-sky-500/10';
                    }

                    return (
                      <div key={act.id} className="pt-1.5 first:pt-0 flex items-start gap-2.5">
                        <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${iconBg}`}>
                          <IconComponent className="h-3 w-3" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300 leading-snug">
                            {act.details || (
                              act.action === 'status_change'
                                ? `Moved to ${act.to?.replace('_', ' ')}`
                                : act.action === 'reassigned'
                                ? `Assigned to ${act.to}`
                                : act.action === 'rescheduled'
                                ? `Due date: ${act.to}`
                                : 'Task created'
                            )}
                          </p>
                          <span className="text-[10px] text-neutral-400 dark:text-white/30">
                            {formatActivityTime(act.timestamp)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 flex items-center justify-between pt-3 border-t border-neutral-100 dark:border-white/5">
            {taskToEdit ? (
              <div>
                {showConfirmDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-red-500 font-medium">Confirm?</span>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={isSubmitting}
                      className="rounded-xl bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 transition-colors"
                    >
                      Yes, Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowConfirmDelete(false)}
                      className="rounded-xl border border-neutral-300 dark:border-white/10 px-2.5 py-1.5 text-xs text-neutral-600 dark:text-white/40 hover:text-neutral-900 dark:hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowConfirmDelete(true)}
                    className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 p-1.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete Task</span>
                  </button>
                )}
              </div>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-[#141414] px-3.5 py-2 text-xs font-medium text-neutral-600 dark:text-white/50 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                id="task-submit-button"
                disabled={isSubmitting || !title.trim() || !userId}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-blue-900/20 hover:bg-blue-500 transition-colors disabled:opacity-50"
              >
                {taskToEdit ? 'Save Changes' : 'Create Task'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

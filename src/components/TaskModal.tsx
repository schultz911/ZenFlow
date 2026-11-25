import { DialogPanel } from './ui/DialogPanel';
import { LinkListInput } from './ui/LinkListInput';
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useDashboard } from '../context/DashboardContext';
import { Task, CognitiveLoad, TaskStatus, TaskDisciplineMetadata } from '../types';
import { getTaskBillableMs, formatBillableDetailed, getLastDayOfMonth, getUserTag, getTaskAssigneeIds } from '../utils/workload';
import { isValidHttpUrl, foldLegacyDisciplineMetadata } from '../utils/taskMetadata';
import {
  X,
  Calendar,
  Brain,
  Trash2,
  History,
  Clock,
  ArrowRight,
  CheckCircle2,
  UserCheck,
  PlusCircle,
  Timer,
  ChevronDown,
  CopyPlus,
  CornerDownRight,
  AlertCircle,
  Link2,
  ExternalLink,
  Users,
} from 'lucide-react';

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
  onAdjustBillableHours?: (task: Task) => void;
  onDuplicateTask?: (task: Task) => void;
}

export const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  onClose,
  taskToEdit,
  defaultUserId,
  defaultStatus = 'todo',
  onAdjustBillableHours,
  onDuplicateTask,
}) => {
  const {
    tasks,
    users,
    currentUser,
    createTask,
    updateTask,
    deleteTask,
    canEditUserTasks,
  } = useDashboard();

  const canDuplicate = Boolean(onDuplicateTask);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Delegated subtasks (if this task is a parent task with child subtasks)
  const delegatedSubtasks = useMemo(() => {
    if (!taskToEdit?.id) return [];
    return Array.isArray(tasks) ? tasks.filter(t => t && t.parentTaskId === taskToEdit.id) : [];
  }, [tasks, taskToEdit]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [brandGuidelines, setBrandGuidelines] = useState('');
  const [userId, setUserId] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState('');
  const [cognitiveLoad, setCognitiveLoad] = useState<CognitiveLoad>('medium');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [client, setClient] = useState('');
  const [project, setProject] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [contentDocLink, setContentDocLink] = useState('');
  const [contentType, setContentType] = useState('');
  const [contentSpecifications, setContentSpecifications] = useState('');
  const [sourceContentReferences, setSourceContentReferences] = useState<string[]>([]);
  const [assetType, setAssetType] = useState('');
  const [designSpecifications, setDesignSpecifications] = useState('');
  const [brandAssetsReferences, setBrandAssetsReferences] = useState<string[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  // Resolved discipline for this task
  const taskDiscipline = useMemo(() => {
    if (taskToEdit?.team) return taskToEdit.team;
    if (taskToEdit?.userId) {
      const owner = users.find(u => u.id === taskToEdit.userId);
      if (owner?.role) return owner.role;
    }
    return 'content';
  }, [taskToEdit, users]);

  // Eligible assignees across all teams restricted to matching discipline
  const eligibleUsers = useMemo(() => {
    const matched = users.filter(u => u.role === taskDiscipline);
    return matched.length > 0 ? matched : users;
  }, [users, taskDiscipline]);

  // Autocomplete suggestions from existing tasks
  const existingClients = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      if (t && t.client && t.client.trim()) set.add(t.client.trim());
    }
    return Array.from(set).sort();
  }, [tasks]);

  const existingProjects = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      if (t && t.project && t.project.trim()) set.add(t.project.trim());
    }
    return Array.from(set).sort();
  }, [tasks]);

  const canEdit = useMemo(() => {
    if (!taskToEdit) return true;
    const ids = getTaskAssigneeIds(taskToEdit);
    if (ids.length > 0) {
      return ids.some(id => canEditUserTasks(id));
    }
    return canEditUserTasks(taskToEdit.userId);
  }, [taskToEdit, canEditUserTasks]);

  useEffect(() => {
    if (taskToEdit) {
      setTitle(taskToEdit.title || '');
      setDescription(taskToEdit.description || '');
      setBrandGuidelines(taskToEdit.brandGuidelines || '');
      const ids = getTaskAssigneeIds(taskToEdit);
      setAssigneeIds(ids);
      setUserId(ids[0] || taskToEdit.userId || '');
      setDueDate(taskToEdit.dueDate || '');
      setCognitiveLoad(taskToEdit.cognitiveLoad || 'medium');
      setStatus(taskToEdit.status || 'todo');
      setClient(taskToEdit.client || '');
      setProject(taskToEdit.project || '');
      setEstimatedHours(taskToEdit.estimatedHours !== undefined ? String(taskToEdit.estimatedHours) : '');
      setPriority(taskToEdit.priority || 'medium');
      setContentDocLink(taskToEdit.contentDocLink || '');
      const folded = foldLegacyDisciplineMetadata(taskToEdit);
      setContentType(folded.contentType || '');
      setContentSpecifications(folded.contentSpecifications || '');
      setSourceContentReferences(folded.sourceContentReferences || []);
      setAssetType(folded.assetType || '');
      setDesignSpecifications(folded.designSpecifications || '');
      setBrandAssetsReferences(folded.brandAssetsReferences || []);
    } else {
      setTitle('');
      setDescription('');
      setBrandGuidelines('');
      const defaultUser = defaultUserId || currentUser?.id || users[0]?.id || '';
      setUserId(defaultUser);
      setAssigneeIds(defaultUser ? [defaultUser] : []);
      setDueDate('');
      setCognitiveLoad('medium');
      setStatus(defaultStatus || 'todo');
      setClient('');
      setProject('');
      setEstimatedHours('');
      setPriority('medium');
      setContentDocLink('');
      setContentType('');
      setContentSpecifications('');
      setSourceContentReferences([]);
      setAssetType('');
      setDesignSpecifications('');
      setBrandAssetsReferences([]);
    }
    setShowConfirmDelete(false);
    setSubmitError(null);
  }, [taskToEdit, defaultUserId, defaultStatus, currentUser, users]);

  // Activity log calculation
  const activities = useMemo(() => {
    if (!taskToEdit?.activityLog || !Array.isArray(taskToEdit.activityLog)) return [];
    return [...taskToEdit.activityLog].reverse();
  }, [taskToEdit]);

  // Cycle time & lead time metrics
  const cycleMetrics = useMemo(() => {
    if (!taskToEdit) return null;
    try {
      const createdTime = new Date(taskToEdit.createdAt).getTime();
      const now = Date.now();
      const completedTime = taskToEdit.completedAt ? new Date(taskToEdit.completedAt).getTime() : null;

      const totalLeadTimeMs = (completedTime || now) - createdTime;
      const totalLeadTimeStr = formatDuration(totalLeadTimeMs);

      let currentStatusDurationStr = '< 1m';
      if (taskToEdit.activityLog && Array.isArray(taskToEdit.activityLog) && taskToEdit.activityLog.length > 0) {
        const lastTransition = [...taskToEdit.activityLog].reverse().find(a => a && a.action === 'status_change');
        if (lastTransition) {
          const transTime = new Date(lastTransition.timestamp).getTime();
          currentStatusDurationStr = formatDuration(now - transTime);
        } else {
          currentStatusDurationStr = totalLeadTimeStr;
        }
      } else {
        currentStatusDurationStr = totalLeadTimeStr;
      }

      const totalBillableMs = getTaskBillableMs(taskToEdit);
      const billableDetailedStr = formatBillableDetailed(totalBillableMs);

      return {
        totalLeadTimeStr,
        currentStatusStr: currentStatusDurationStr,
        billableDetailedStr,
        isDone: taskToEdit.status === 'done' || taskToEdit.status === 'archived',
      };
    } catch {
      return null;
    }
  }, [taskToEdit]);

  // Quick date selector helpers
  const setQuickDate = (daysFromNow: number | null, isEndOfMonth: boolean = false) => {
    if (daysFromNow === null && !isEndOfMonth) {
      setDueDate('');
      return;
    }
    if (isEndOfMonth) {
      setDueDate(getLastDayOfMonth());
      return;
    }
    const d = new Date();
    d.setDate(d.getDate() + (daysFromNow || 0));
    setDueDate(d.toISOString().split('T')[0]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isDeadlineRequired = status !== 'pipeline' && status !== 'retainer';
    const isUserIdRequired = status !== 'pipeline';
    const effectiveAssignees = assigneeIds.length > 0 ? assigneeIds : (userId ? [userId] : []);
    if (!title.trim() || (isUserIdRequired && effectiveAssignees.length === 0) || (isDeadlineRequired && !dueDate.trim()) || !canEdit) return;

    const trimmedDocLink = contentDocLink.trim();
    if (taskDiscipline === 'content' && status === 'done') {
      if (!trimmedDocLink || !isValidHttpUrl(trimmedDocLink)) {
        setSubmitError('A valid Content document URL (http/https) is required before marking a Content task as Sent.');
        return;
      }
    }

    const trimmedBrandGuidelines = brandGuidelines.trim();
    if (trimmedBrandGuidelines && !isValidHttpUrl(trimmedBrandGuidelines)) {
      setSubmitError('Brand Guidelines must be a valid URL starting with http:// or https://.');
      return;
    }

    const nextDisciplineMetadata: TaskDisciplineMetadata | undefined = taskDiscipline === 'design'
      ? (assetType.trim() || designSpecifications.trim() || brandAssetsReferences.length > 0
          ? {
              assetType: assetType.trim() || undefined,
              designSpecifications: designSpecifications.trim() || undefined,
              brandAssetsReferences: brandAssetsReferences.length > 0 ? brandAssetsReferences : undefined,
            }
          : undefined)
      : (contentType.trim() || contentSpecifications.trim() || sourceContentReferences.length > 0
          ? {
              contentType: contentType.trim() || undefined,
              contentSpecifications: contentSpecifications.trim() || undefined,
              sourceContentReferences: sourceContentReferences.length > 0 ? sourceContentReferences : undefined,
            }
          : undefined);

    setIsSubmitting(true);
    setSubmitError(null);
    const finalDueDate = (status === 'pipeline' || status === 'retainer') ? undefined : (dueDate.trim() || undefined);
    const parsedEstimated = estimatedHours.trim() ? Math.max(0, parseFloat(estimatedHours)) : undefined;

    try {
      if (taskToEdit) {
        await updateTask(taskToEdit.id, {
          title: title.trim(),
          description: description.trim() || undefined,
          brandGuidelines: trimmedBrandGuidelines || undefined,
          userId: effectiveAssignees[0] || undefined,
          assigneeIds: effectiveAssignees,
          dueDate: finalDueDate,
          cognitiveLoad,
          status,
          client: client.trim() || undefined,
          project: project.trim() || undefined,
          estimatedHours: parsedEstimated,
          priority,
          contentDocLink: trimmedDocLink || undefined,
          disciplineMetadata: nextDisciplineMetadata,
        });
      } else {
        await createTask({
          userId: effectiveAssignees[0] || undefined,
          assigneeIds: effectiveAssignees,
          team: taskDiscipline,
          title: title.trim(),
          description: description.trim() || undefined,
          brandGuidelines: trimmedBrandGuidelines || undefined,
          dueDate: finalDueDate,
          cognitiveLoad,
          status,
          client: client.trim() || undefined,
          project: project.trim() || undefined,
          estimatedHours: parsedEstimated,
          priority,
          disciplineMetadata: nextDisciplineMetadata,
        });
      }
      onClose();
    } catch (err: any) {
      console.error(err);
      setSubmitError(err?.message || 'Failed to save task');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!taskToEdit || !canEdit) return;
    setIsSubmitting(true);
    try {
      await deleteTask(taskToEdit.id);
      onClose();
    } catch (err: any) {
      console.error(err);
      setSubmitError(err?.message || 'Failed to delete task');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 overflow-y-auto"
          onClick={e => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <DialogPanel aria-label="Task details" onClose={onClose} busy={isSubmitting}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={e => e.stopPropagation()}
            id="task-modal"
            className="w-full max-w-lg my-auto flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 dark:border-white/5 shrink-0 bg-[var(--surface)]">
              <div className="flex items-center gap-2.5">
                <h2 className="text-base font-semibold tracking-tight text-neutral-900 dark:text-white">
                  {taskToEdit ? 'Edit Task' : 'Create New Task'}
                </h2>
                {taskToEdit && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
                      taskToEdit.status === 'done'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        : taskToEdit.status === 'in_progress'
                        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                        : taskToEdit.status === 'in_review'
                        ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                        : taskToEdit.status === 'pipeline'
                        ? 'bg-neutral-500/10 text-neutral-600 dark:text-neutral-400 border border-neutral-500/20'
                        : taskToEdit.status === 'retainer'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        : 'bg-neutral-500/10 text-neutral-600 dark:text-neutral-400 border border-neutral-500/20'
                    }`}
                  >
                    {taskToEdit.status.replace('_', ' ')}
                  </span>
                )}
                {taskToEdit?.isSubtask && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                    <CornerDownRight className="w-2.5 h-2.5" />
                    <span>Subtask</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1">
                {taskToEdit && canDuplicate && (
                  <button
                    type="button"
                    onClick={() => onDuplicateTask?.(taskToEdit)}
                    title="Delegate subtask across boards"
                    className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-purple-600 dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-purple-400 transition-colors cursor-pointer mr-1"
                  >
                    <CopyPlus className="h-4 w-4" />
                  </button>
                )}

                {taskToEdit && canEdit && (
                  <button
                    type="button"
                    onClick={() => setShowConfirmDelete(!showConfirmDelete)}
                    title="Delete task"
                    className="rounded-lg p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:text-white/40 dark:hover:bg-red-950/20 dark:hover:text-red-400 transition-colors cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}

                <button
                  onClick={onClose}
                  aria-label="Close modal"
                  className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white transition-colors cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Subtask Breadcrumb if this task is a subtask */}
            {taskToEdit?.isSubtask && taskToEdit.parentTaskTitle && (
              <div className="px-6 py-2 bg-purple-50/50 dark:bg-purple-950/20 border-b border-purple-200/50 dark:border-purple-800/20 flex items-center gap-2 text-xs">
                <CornerDownRight className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                <span className="text-neutral-500 dark:text-neutral-400">Parent Task:</span>
                <span className="font-semibold text-purple-700 dark:text-purple-300 truncate">
                  {taskToEdit.parentTaskTitle}
                </span>
              </div>
            )}

            {/* Propagated Content Document Link, Brand Guidelines & ClickUp Link */}
            {(taskToEdit?.contentDocLink || taskToEdit?.brandGuidelines || taskToEdit?.clickupUrl) && (
              <div className="px-6 py-2.5 bg-emerald-50/60 dark:bg-emerald-950/20 border-b border-emerald-200/60 dark:border-emerald-800/20 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-3 min-w-0">
                  {taskToEdit?.brandGuidelines && (
                    <a
                      href={taskToEdit.brandGuidelines}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 font-semibold text-blue-700 dark:text-blue-300 hover:underline min-w-0"
                    >
                      <Link2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Brand Guidelines</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  )}
                  {taskToEdit?.contentDocLink && (
                    <a
                      href={taskToEdit.contentDocLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-300 hover:underline min-w-0"
                    >
                      <Link2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate max-w-[260px]">
                        Content Doc: {taskToEdit.contentDocLink}
                      </span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  )}
                </div>
                {taskToEdit?.clickupUrl && (
                  <a
                    href={taskToEdit.clickupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-purple-700 dark:text-purple-300 hover:underline shrink-0"
                  >
                    <span>Open in ClickUp</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}

            {/* Error Banner */}
            {submitError && (
              <div className="mx-6 mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-500/20 flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            {/* Delete Confirmation Banner */}
            {showConfirmDelete && (
              <div className="mx-6 mt-4 p-3.5 rounded-xl border border-red-500/30 bg-red-50 dark:bg-red-950/30 space-y-2">
                <p className="text-xs font-semibold text-red-700 dark:text-red-300">
                  Are you sure you want to delete this task?
                </p>
                <p className="text-[11px] text-red-600/80 dark:text-red-400/80">
                  This action cannot be undone. All activity logs and tracking history for this task will be permanently removed.
                </p>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isSubmitting}
                    className="rounded-lg bg-red-600 hover:bg-red-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors cursor-pointer"
                  >
                    Yes, Delete Task
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowConfirmDelete(false)}
                    className="rounded-lg border border-neutral-300 dark:border-white/10 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:text-white/80 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Form Body */}
            <form onSubmit={handleSubmit} className="px-6 py-5 overflow-y-auto flex-1 space-y-4">
              {/* Task Name */}
              <div>
                <label className="block text-xs uppercase tracking-wider font-semibold text-[var(--text-secondary)] mb-1.5" htmlFor="task-title-input">
                  Task Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="task-title-input"
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Redesign navigation menu for mobile screens"
                  className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-[var(--surface)] py-2 px-3 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-none transition-colors"
                  required
                  autoFocus
                />
              </div>

              {/* Assignee & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Assignee Selection */}
                <div>
                  <label className="block text-xs uppercase tracking-wider font-semibold text-[var(--text-secondary)] mb-1.5 flex items-center justify-between" htmlFor="task-assignee-select">
                    <span>Assignee {status !== 'pipeline' && <span className="text-red-500">*</span>}</span>
                    <span className="text-[11px] text-blue-500 font-medium capitalize">{taskDiscipline} Team</span>
                  </label>
                  <div className="relative">
                    <select
                      id="task-assignee-select"
                      value={userId}
                      onChange={e => {
                        const val = e.target.value;
                        setUserId(val);
                        if (!val) {
                          setAssigneeIds([]);
                        } else if (assigneeIds.length <= 1) {
                          setAssigneeIds([val]);
                        } else {
                          setAssigneeIds(prev => [val, ...prev.filter(id => id !== val)]);
                        }
                      }}
                      className="w-full appearance-none rounded-xl border border-neutral-300 dark:border-white/10 bg-[var(--surface)] py-2 pl-3 pr-8 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none transition-colors cursor-pointer"
                    >
                      <option value="">-- Unassigned in Team Pipeline --</option>
                      {eligibleUsers.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({getUserTag(u).label})
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-secondary)]" />
                  </div>
                  {assigneeIds.length > 1 && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <Users className="h-3 w-3 text-emerald-500 shrink-0" />
                      {assigneeIds.map(aid => {
                        const member = users.find(u => u.id === aid);
                        if (!member) return null;
                        return (
                          <span
                            key={aid}
                            className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300"
                          >
                            <span>{member.name}</span>
                            {canEdit && assigneeIds.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const next = assigneeIds.filter(id => id !== aid);
                                  setAssigneeIds(next);
                                  setUserId(next[0] || '');
                                }}
                                className="hover:text-red-500 cursor-pointer"
                              >
                                ×
                              </button>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Workflow Status */}
                <div>
                  <label className="block text-xs uppercase tracking-wider font-semibold text-[var(--text-secondary)] mb-1.5" htmlFor="task-status-select">
                    Status
                  </label>
                  <div className="relative">
                    <select
                      id="task-status-select"
                      value={status}
                      onChange={e => setStatus(e.target.value as TaskStatus)}
                      className="w-full appearance-none rounded-xl border border-neutral-300 dark:border-white/10 bg-[var(--surface)] py-2 pl-3 pr-8 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none transition-colors cursor-pointer"
                    >
                      <option value="pipeline">Pipeline (Backlog)</option>
                      <option value="retainer">Ongoing (No deadline)</option>
                      <option value="todo">To Do</option>
                      <option value="in_progress">In Progress</option>
                      <option value="in_review">In Review</option>
                      <option value="done">Done</option>
                      <option value="archived">Archived</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-secondary)]" />
                  </div>
                </div>
              </div>

              {/* Client & Project */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Client / Account */}
                <div>
                  <label className="block text-xs uppercase tracking-wider font-semibold text-[var(--text-secondary)] mb-1.5" htmlFor="task-client-input">
                    Client / Account
                  </label>
                  <input
                    id="task-client-input"
                    type="text"
                    list="client-suggestions"
                    value={client}
                    onChange={e => setClient(e.target.value)}
                    placeholder="e.g. Acme Corp"
                    className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-[var(--surface)] py-2 px-3 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-none transition-colors"
                  />
                  <datalist id="client-suggestions">
                    {existingClients.map(c => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>

                {/* Project */}
                <div>
                  <label className="block text-xs uppercase tracking-wider font-semibold text-[var(--text-secondary)] mb-1.5" htmlFor="task-project-input">
                    Project
                  </label>
                  <input
                    id="task-project-input"
                    type="text"
                    list="project-suggestions"
                    value={project}
                    onChange={e => setProject(e.target.value)}
                    placeholder="e.g. Q4 Rebrand"
                    className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-[var(--surface)] py-2 px-3 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-none transition-colors"
                  />
                  <datalist id="project-suggestions">
                    {existingProjects.map(p => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Estimated Time (Hours) */}
              <div>
                <label className="block text-xs uppercase tracking-wider font-semibold text-[var(--text-secondary)] mb-1.5 flex items-center justify-between" htmlFor="task-estimated-hours-input">
                  <span className="flex items-center gap-1.5">
                    <Timer className="h-3.5 w-3.5 text-blue-500" />
                    <span>Time Estimated (Hours)</span>
                  </span>
                  <span className="text-[11px] text-neutral-400 font-normal lowercase">
                    Split equally across working days until deadline
                  </span>
                </label>
                <div className="relative">
                  <input
                    id="task-estimated-hours-input"
                    type="number"
                    step="0.5"
                    min="0"
                    max="1000"
                    value={estimatedHours}
                    onChange={e => setEstimatedHours(e.target.value)}
                    placeholder="e.g. 6.0"
                    className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-[var(--surface)] py-2 pl-3 pr-8 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-none transition-colors"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[var(--text-secondary)]">
                    hrs
                  </span>
                </div>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-xs uppercase tracking-wider font-semibold text-[var(--text-secondary)] mb-1.5">
                  Priority
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['low', 'medium', 'high'] as const).map(p => {
                    const isSelected = priority === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPriority(p)}
                        className={`flex items-center justify-center py-1.5 rounded-xl border text-xs font-semibold capitalize transition-all cursor-pointer ${
                          isSelected
                            ? p === 'high'
                              ? 'bg-red-500/15 border-red-500 text-red-600 dark:text-red-400'
                              : p === 'medium'
                              ? 'bg-amber-500/15 border-amber-500 text-amber-600 dark:text-amber-400'
                              : 'bg-emerald-500/15 border-emerald-500 text-emerald-600 dark:text-emerald-400'
                            : 'border-[var(--border)] bg-neutral-50/50 dark:bg-white/5 text-[var(--text-secondary)]'
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Discipline Subtask Specifications (Editable) */}
              {(taskDiscipline === 'content' || taskDiscipline === 'design') && (
                <div className={`rounded-xl border p-3.5 space-y-3 text-xs ${
                  taskDiscipline === 'design'
                    ? 'border-indigo-500/20 bg-indigo-50/30 dark:bg-indigo-950/10'
                    : 'border-blue-500/20 bg-blue-50/30 dark:bg-blue-950/10'
                }`}>
                  <span className={`block text-[11px] uppercase font-semibold tracking-wider ${
                    taskDiscipline === 'design' ? 'text-indigo-600 dark:text-indigo-400' : 'text-blue-600 dark:text-blue-400'
                  }`}>
                    {taskDiscipline === 'design' ? 'Design Subtask Specifications' : 'Content Subtask Specifications'}
                  </span>

                  {taskDiscipline === 'design' ? (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1" htmlFor="task-design-asset-type">
                          Asset Type
                        </label>
                        <input
                          id="task-design-asset-type"
                          type="text"
                          value={assetType}
                          readOnly={!canEdit}
                          onChange={e => setAssetType(e.target.value)}
                          placeholder="e.g. Social Media Banner, Infographic"
                          className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-indigo-500 focus:outline-none read-only:opacity-80"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1" htmlFor="task-design-specs">
                          Design Specifications
                        </label>
                        <textarea
                          id="task-design-specs"
                          rows={3}
                          value={designSpecifications}
                          readOnly={!canEdit}
                          onChange={e => setDesignSpecifications(e.target.value)}
                          placeholder="Dimensions, aspect ratios, formats, quantity, visual notes..."
                          className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-2 text-xs text-neutral-900 dark:text-white focus:border-indigo-500 focus:outline-none resize-y read-only:opacity-80"
                        />
                      </div>
                      <LinkListInput
                        id="task-design-refs"
                        label="Brand Assets & References"
                        links={brandAssetsReferences}
                        onChange={setBrandAssetsReferences}
                        readOnly={!canEdit}
                        placeholder="https://..."
                        accent="indigo"
                      />
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1" htmlFor="task-content-type">
                          Content Type
                        </label>
                        <input
                          id="task-content-type"
                          type="text"
                          value={contentType}
                          readOnly={!canEdit}
                          onChange={e => setContentType(e.target.value)}
                          placeholder="e.g. Blog Post, Case Study, Whitepaper"
                          className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none read-only:opacity-80"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1" htmlFor="task-content-specs">
                          Content Specifications
                        </label>
                        <textarea
                          id="task-content-specs"
                          rows={3}
                          value={contentSpecifications}
                          readOnly={!canEdit}
                          onChange={e => setContentSpecifications(e.target.value)}
                          placeholder="Word count, deliverable format, tone of voice, keywords, CTA..."
                          className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-2 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none resize-y read-only:opacity-80"
                        />
                      </div>
                      <LinkListInput
                        id="task-content-refs"
                        label="Source Content & References"
                        links={sourceContentReferences}
                        onChange={setSourceContentReferences}
                        readOnly={!canEdit}
                        placeholder="https://..."
                        accent="blue"
                      />
                    </>
                  )}
                </div>
              )}

              {/* Cognitive Load */}
              <div>
                <label className="block text-xs uppercase tracking-wider font-semibold text-[var(--text-secondary)] mb-1.5 flex items-center gap-1.5">
                  <Brain className="h-3.5 w-3.5 text-indigo-500" />
                  <span>Cognitive Load</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['low', 'medium', 'high'] as const).map(level => {
                    const isSelected = cognitiveLoad === level;
                    return (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setCognitiveLoad(level)}
                        className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all cursor-pointer ${
                          isSelected
                            ? level === 'high'
                              ? 'border-red-500/40 bg-red-500/10 text-red-500 font-semibold shadow-xs'
                              : level === 'medium'
                              ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 font-semibold shadow-xs'
                              : 'border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400 font-semibold shadow-xs'
                            : 'border-[var(--border)] bg-neutral-50/50 dark:bg-white/5 text-[var(--text-secondary)] hover:border-neutral-300 dark:hover:border-white/15'
                        }`}
                      >
                        <span className="text-xs capitalize font-medium">{level}</span>
                        <span className="text-[11px] opacity-70">
                          {level === 'low' ? 'Quick win' : level === 'medium' ? 'Standard' : 'Complex'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Deadline */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs uppercase tracking-wider font-semibold text-[var(--text-secondary)] flex items-center gap-1.5" htmlFor="task-due-date-input">
                    <Calendar className="h-3.5 w-3.5 text-blue-500" />
                    <span>
                      Deadline {status !== 'pipeline' && status !== 'retainer' && <span className="text-red-500">*</span>}
                    </span>
                  </label>

                  {/* Quick Select Buttons */}
                  <div className="flex items-center gap-1 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setQuickDate(1)}
                      className="rounded px-1.5 py-0.5 text-neutral-500 hover:bg-neutral-100 dark:text-white/40 dark:hover:bg-white/5 cursor-pointer"
                    >
                      Tomorrow
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickDate(7)}
                      className="rounded px-1.5 py-0.5 text-neutral-500 hover:bg-neutral-100 dark:text-white/40 dark:hover:bg-white/5 cursor-pointer"
                    >
                      +1 Week
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickDate(null, true)}
                      className="rounded px-1.5 py-0.5 text-neutral-500 hover:bg-neutral-100 dark:text-white/40 dark:hover:bg-white/5 cursor-pointer"
                    >
                      Month End
                    </button>
                    {dueDate && (
                      <button
                        type="button"
                        onClick={() => setQuickDate(null)}
                        className="rounded px-1.5 py-0.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                <input
                  id="task-due-date-input"
                  type="date"
                  required={status !== 'pipeline' && status !== 'retainer'}
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className={`w-full rounded-xl border bg-[var(--surface)] py-2 px-3 text-xs text-neutral-900 dark:text-white focus:outline-none transition-colors ${
                    status !== 'pipeline' && status !== 'retainer' && !dueDate
                      ? 'border-amber-400 dark:border-amber-500/50 focus:border-amber-500'
                      : 'border-neutral-300 dark:border-white/10 focus:border-blue-500'
                  }`}
                />
                {status !== 'pipeline' && status !== 'retainer' && !dueDate && (
                  <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                    A deadline is required to add tasks directly into active workflow lanes.
                  </p>
                )}
              </div>

              {!canEdit && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-600 dark:text-amber-400">
                  Read-only view: You only have permission to edit tasks on your assigned board or swimlane.
                </div>
              )}

              {/* Content Document Link (Editable for Content tasks, or read-only clickable for sibling Design tasks) */}
              {(taskDiscipline === 'content' || Boolean(contentDocLink)) && (
                <div>
                  <label className="block text-xs uppercase tracking-wider font-semibold text-[var(--text-secondary)] mb-1.5 flex items-center justify-between" htmlFor="task-content-doc-link">
                    <span className="flex items-center gap-1.5">
                      <Link2 className="h-3.5 w-3.5 text-emerald-500" />
                      <span>
                        Content Document Link
                        {taskDiscipline === 'content' && status === 'done' && (
                          <span className="text-red-500 ml-0.5">*</span>
                        )}
                      </span>
                    </span>
                    {contentDocLink && (
                      <a
                        href={contentDocLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline normal-case"
                      >
                        <span>Open Link</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </label>
                  <input
                    id="task-content-doc-link"
                    type="url"
                    value={contentDocLink}
                    readOnly={taskDiscipline !== 'content'}
                    onChange={e => setContentDocLink(e.target.value)}
                    placeholder="https://docs.google.com/document/d/..."
                    className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-[var(--surface)] py-2 px-3 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-emerald-500 focus:outline-none transition-colors read-only:opacity-80"
                  />
                </div>
              )}

              {/* Parent-Linked Brief & Brand Guidelines */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs uppercase tracking-wider font-semibold text-[var(--text-secondary)]" htmlFor="task-description-input">
                    Brief
                  </label>
                  {taskToEdit?.isSubtask && (
                    <span className="text-[11px] text-purple-600 dark:text-purple-400 font-medium">
                      Synced with parent &amp; sibling
                    </span>
                  )}
                </div>
                <textarea
                  id="task-description-input"
                  value={description}
                  readOnly={!canEdit}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Campaign brief, objectives, audience, and core context..."
                  rows={4}
                  className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-[var(--surface)] py-2 px-3 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-none resize-y transition-colors read-only:opacity-80"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs uppercase tracking-wider font-semibold text-[var(--text-secondary)] flex items-center gap-1.5" htmlFor="task-brand-guidelines-input">
                    <Link2 className="h-3.5 w-3.5 text-blue-500" />
                    <span>Brand Guidelines Link</span>
                  </label>
                  <div className="flex items-center gap-2">
                    {taskToEdit?.isSubtask && (
                      <span className="text-[11px] text-purple-600 dark:text-purple-400 font-medium">
                        Synced with parent
                      </span>
                    )}
                    {brandGuidelines && isValidHttpUrl(brandGuidelines) && (
                      <a
                        href={brandGuidelines}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <span>Open Link</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
                <input
                  id="task-brand-guidelines-input"
                  type="url"
                  value={brandGuidelines}
                  readOnly={!canEdit}
                  onChange={e => setBrandGuidelines(e.target.value)}
                  placeholder="https://... (Brand book, Drive, Figma, Notion)"
                  className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-[var(--surface)] py-2 px-3 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-none transition-colors read-only:opacity-80"
                />
              </div>

              {/* Delegated Subtasks Preview (if this task has subtasks) */}
              {delegatedSubtasks.length > 0 && (
                <div className="pt-3 border-t border-neutral-100 dark:border-white/5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                      <CornerDownRight className="w-3.5 h-3.5" />
                      <span>Delegated Subtasks ({delegatedSubtasks.length})</span>
                    </span>
                  </div>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto rounded-xl border border-neutral-200/70 dark:border-white/5 bg-[var(--surface-muted)] p-2">
                    {delegatedSubtasks.map(st => {
                      const assignee = users.find(u => u.id === st.userId);
                      return (
                        <div
                          key={st.id}
                          className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-[var(--surface-raised)] border border-neutral-200/50 dark:border-white/5 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className={`flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-semibold text-white bg-gradient-to-br ${
                                assignee?.avatarColor || 'from-blue-600 to-indigo-600'
                              } shrink-0`}
                            >
                              {(assignee?.name || '?').charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium text-neutral-800 dark:text-white truncate">
                              {st.title}
                            </span>
                          </div>
                          <span className="text-[11px] px-1.5 py-0.5 rounded uppercase font-semibold bg-neutral-100 dark:bg-white/5 text-[var(--text-secondary)] shrink-0">
                            {typeof st.status === 'string' ? st.status.replace('_', ' ') : 'todo'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Activity Audit Trail & Cycle Time */}
              {taskToEdit && (
                <div className="pt-3 border-t border-neutral-100 dark:border-white/5 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      <History className="h-3.5 w-3.5 text-blue-500" />
                      <span>Activity & Cycle Time</span>
                    </div>
                    {cycleMetrics && (
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-[var(--text-secondary)]">
                        <span className="flex items-center gap-1 bg-neutral-100 dark:bg-white/5 px-2 py-0.5 rounded-md border border-neutral-200/50 dark:border-white/5">
                          <Clock className="h-3 w-3 text-neutral-500 dark:text-white/50" />
                          {cycleMetrics.isDone ? 'Completed in:' : 'Lead time:'} <strong className="text-neutral-700 dark:text-white/80">{cycleMetrics.totalLeadTimeStr}</strong>
                        </span>
                        <span className="bg-neutral-100 dark:bg-white/5 px-2 py-0.5 rounded-md border border-neutral-200/50 dark:border-white/5">
                          In status: <strong className="text-neutral-700 dark:text-white/80">{cycleMetrics.currentStatusStr}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => onAdjustBillableHours?.(taskToEdit)}
                          title="Click to manually correct billable hours"
                          className="flex items-center gap-1 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-md border border-blue-200/60 dark:border-blue-500/25 hover:bg-blue-100 dark:hover:bg-blue-900/50 hover:border-blue-400 transition-all cursor-pointer group"
                        >
                          <Timer className="h-3 w-3 text-blue-500 group-hover:scale-110 transition-transform" />
                          <span>Billable:</span>
                          <strong className="text-blue-700 dark:text-blue-300 underline decoration-blue-300 dark:decoration-blue-500 underline-offset-2">
                            {cycleMetrics.billableDetailedStr}
                          </strong>
                        </button>
                      </div>
                    )}
                  </div>

                  {activities.length === 0 ? (
                    <div className="rounded-xl border border-neutral-200/70 dark:border-white/5 bg-[var(--surface-muted)] p-3 text-center text-[11px] text-[var(--text-secondary)]">
                      Created {formatActivityTime(taskToEdit.createdAt || '')} • No modifications recorded yet
                    </div>
                  ) : (
                    <div className="max-h-36 overflow-y-auto rounded-xl border border-neutral-200/70 dark:border-white/5 bg-[var(--surface-muted)] p-2.5 space-y-2 text-xs divide-y divide-neutral-100 dark:divide-white/5">
                      {activities.map((act, actIdx) => {
                        if (!act) return null;
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
                        } else if (act.action === 'billable_adjusted') {
                          IconComponent = Timer;
                          iconBg = 'text-blue-500 bg-blue-100 dark:bg-blue-500/10';
                        }

                        const toStr = typeof act.to === 'string' ? act.to : (typeof act.to === 'object' && act.to ? JSON.stringify(act.to) : String(act.to ?? ''));
                        const fromStr = typeof act.from === 'string' ? act.from : (typeof act.from === 'object' && act.from ? JSON.stringify(act.from) : String(act.from ?? ''));

                        return (
                          <div key={act.id || actIdx} className="pt-2 first:pt-0 flex items-start gap-2">
                            <div className={`p-1 rounded-md shrink-0 mt-0.5 ${iconBg}`}>
                              <IconComponent className="h-3 w-3" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-neutral-800 dark:text-white/90 text-[11px] truncate">
                                {act.details || (
                                  act.action === 'created'
                                    ? 'Task created'
                                    : act.action === 'status_change'
                                    ? `Status changed from ${fromStr.replace('_', ' ')} to ${toStr.replace('_', ' ')}`
                                    : act.action === 'reassigned'
                                    ? `Reassigned to ${toStr}`
                                    : act.action === 'billable_adjusted'
                                    ? `Billable time set to ${toStr}`
                                    : act.action
                                )}
                              </p>
                              <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] mt-0.5">
                                <span>{act.actorName || 'System'}</span>
                                <span>•</span>
                                <span>{formatActivityTime(act.timestamp)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-neutral-100 dark:border-white/5">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-medium text-neutral-700 dark:text-white/80 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="task-submit-button"
                  type="submit"
                  disabled={isSubmitting || !title.trim() || (status !== 'pipeline' && assigneeIds.length === 0 && !userId) || (status !== 'pipeline' && status !== 'retainer' && !dueDate.trim()) || !canEdit}
                  className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-500 focus:outline-none transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <span>Saving...</span>
                  ) : (
                    <span>{taskToEdit ? 'Save Changes' : 'Create Task'}</span>
                  )}
                </button>
              </div>
            </form>
          </DialogPanel>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

import { DialogPanel } from './ui/DialogPanel';
import { CognitiveLoadSelector } from './ui/CognitiveLoadSelector';
import { PrioritySelector } from './ui/PrioritySelector';
import { ContentSpecFields, DesignSpecFields } from './forms/DisciplineSpecFields';
import React, { useState, useLayoutEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth, useWorkspace } from '../context/DashboardContext';
import { Task, CognitiveLoad, Role, TaskStatus, TaskDisciplineMetadata } from '../types';
import { getTaskBillableMs, formatBillableDetailed, formatLeadDuration, formatTaskStatus, formatDateOnly, getLocalOffsetDateKey, getUserTag, getTaskAssigneeIds, getCognitiveLoadLabel } from '../utils/workload';
import { isValidHttpUrl, foldLegacyDisciplineMetadata } from '../utils/taskMetadata';
import { DateQuickPresets } from './ui/DateQuickPresets';
import {
  X,
  Calendar,
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
    currentUser,
    canEditUserTasks,
    canAssignTask,
    isAdministrator,
  } = useAuth();
  const {
    tasks,
    users,
    creativeDirectors,
    createTask,
    updateTask,
    deleteTask,
  } = useWorkspace();

  const canDuplicate = Boolean(onDuplicateTask);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Delegated subtasks (if this task is a parent task with child subtasks)
  const delegatedSubtasks = useMemo(() => {
    if (!taskToEdit?.id) return [];
    return Array.isArray(tasks) ? tasks.filter(t => t && t.parentTaskId === taskToEdit.id) : [];
  }, [tasks, taskToEdit]);

  const [owningClusterId, setOwningClusterId] = useState('');
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
  const [showCoAssignPicker, setShowCoAssignPicker] = useState(false);
  const coAssignSelectRef = useRef<HTMLSelectElement>(null);
  const coAssignToggleRef = useRef<HTMLButtonElement>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'specs' | 'activity'>('details');

  useLayoutEffect(() => {
    if (showCoAssignPicker) {
      coAssignSelectRef.current?.focus({ preventScroll: true });
    }
  }, [showCoAssignPicker]);

  // Resolved discipline for this task
  const taskDiscipline = useMemo(() => {
    if (taskToEdit?.team) return taskToEdit.team;
    const ownerId = taskToEdit ? taskToEdit.userId : defaultUserId;
    return users.find(u => u.id === ownerId)?.role ?? 'content';
  }, [taskToEdit, defaultUserId, users]);

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

  const currentUserIdRef = useRef(currentUser?.id);
  const firstUserIdRef = useRef(users[0]?.id);
  currentUserIdRef.current = currentUser?.id;
  firstUserIdRef.current = users[0]?.id;

  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const initialSnapshotRef = useRef<string>('');

  const serializeFormState = (vals: {
    title: string;
    description: string;
    brandGuidelines: string;
    userId: string;
    assigneeIds: string[];
    dueDate: string;
    cognitiveLoad: CognitiveLoad;
    status: TaskStatus;
    client: string;
    project: string;
    estimatedHours: string;
    priority: 'low' | 'medium' | 'high';
    contentDocLink: string;
    contentType: string;
    contentSpecifications: string;
    sourceContentReferences: string[];
    assetType: string;
    designSpecifications: string;
    brandAssetsReferences: string[];
  }) =>
    JSON.stringify([
      vals.title,
      vals.description,
      vals.brandGuidelines,
      vals.userId,
      vals.assigneeIds,
      vals.dueDate,
      vals.cognitiveLoad,
      vals.status,
      vals.client,
      vals.project,
      vals.estimatedHours,
      vals.priority,
      vals.contentDocLink,
      vals.contentType,
      vals.contentSpecifications,
      vals.sourceContentReferences,
      vals.assetType,
      vals.designSpecifications,
      vals.brandAssetsReferences,
    ]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    if (taskToEdit) {
      const ids = getTaskAssigneeIds(taskToEdit);
      const folded = foldLegacyDisciplineMetadata(taskToEdit);
      const init = {
        title: taskToEdit.title || '',
        description: taskToEdit.description || '',
        brandGuidelines: taskToEdit.brandGuidelines || '',
        assigneeIds: ids,
        userId: ids[0] || taskToEdit.userId || '',
        dueDate: taskToEdit.dueDate || '',
        cognitiveLoad: (taskToEdit.cognitiveLoad || 'medium') as CognitiveLoad,
        status: (taskToEdit.status || 'todo') as TaskStatus,
        client: taskToEdit.client || '',
        project: taskToEdit.project || '',
        estimatedHours: taskToEdit.estimatedHours !== undefined ? String(taskToEdit.estimatedHours) : '',
        priority: (taskToEdit.priority || 'medium') as 'low' | 'medium' | 'high',
        contentDocLink: taskToEdit.contentDocLink || '',
        contentType: folded.contentType || '',
        contentSpecifications: folded.contentSpecifications || '',
        sourceContentReferences: folded.sourceContentReferences || [],
        assetType: folded.assetType || '',
        designSpecifications: folded.designSpecifications || '',
        brandAssetsReferences: folded.brandAssetsReferences || [],
      };
      setOwningClusterId(taskToEdit.owningClusterId || '');
      setTitle(init.title);
      setDescription(init.description);
      setBrandGuidelines(init.brandGuidelines);
      setAssigneeIds(init.assigneeIds);
      setUserId(init.userId);
      setDueDate(init.dueDate);
      setCognitiveLoad(init.cognitiveLoad);
      setStatus(init.status);
      setClient(init.client);
      setProject(init.project);
      setEstimatedHours(init.estimatedHours);
      setPriority(init.priority);
      setContentDocLink(init.contentDocLink);
      setContentType(init.contentType);
      setContentSpecifications(init.contentSpecifications);
      setSourceContentReferences(init.sourceContentReferences);
      setAssetType(init.assetType);
      setDesignSpecifications(init.designSpecifications);
      setBrandAssetsReferences(init.brandAssetsReferences);
      initialSnapshotRef.current = serializeFormState(init);
    } else {
      const defaultUser = defaultUserId || currentUserIdRef.current || firstUserIdRef.current || '';
      const init = {
        title: '',
        description: '',
        brandGuidelines: '',
        userId: defaultUser,
        assigneeIds: defaultUser ? [defaultUser] : [],
        dueDate: getLocalOffsetDateKey(1),
        cognitiveLoad: 'medium' as CognitiveLoad,
        status: (defaultStatus || 'todo') as TaskStatus,
        client: '',
        project: '',
        estimatedHours: '',
        priority: 'medium' as 'low' | 'medium' | 'high',
        contentDocLink: '',
        contentType: '',
        contentSpecifications: '',
        sourceContentReferences: [] as string[],
        assetType: '',
        designSpecifications: '',
        brandAssetsReferences: [] as string[],
      };
      setTitle(init.title);
      setDescription(init.description);
      setBrandGuidelines(init.brandGuidelines);
      setUserId(init.userId);
      setAssigneeIds(init.assigneeIds);
      setDueDate(init.dueDate);
      setCognitiveLoad(init.cognitiveLoad);
      setStatus(init.status);
      setClient(init.client);
      setProject(init.project);
      setEstimatedHours(init.estimatedHours);
      setPriority(init.priority);
      setContentDocLink(init.contentDocLink);
      setContentType(init.contentType);
      setContentSpecifications(init.contentSpecifications);
      setSourceContentReferences(init.sourceContentReferences);
      setAssetType(init.assetType);
      setDesignSpecifications(init.designSpecifications);
      setBrandAssetsReferences(init.brandAssetsReferences);
      initialSnapshotRef.current = serializeFormState(init);
    }
    setShowConfirmDelete(false);
    setShowDiscardConfirm(false);
    setShowCoAssignPicker(false);
    setSubmitError(null);
    setActiveTab('details');
  }, [isOpen, taskToEdit, defaultUserId, defaultStatus]);

  const isDirty = useMemo(() => {
    if (!isOpen || !initialSnapshotRef.current) return false;
    return serializeFormState({
      title,
      description,
      brandGuidelines,
      assigneeIds,
      userId,
      dueDate,
      cognitiveLoad,
      status,
      client,
      project,
      estimatedHours,
      priority,
      contentDocLink,
      contentType,
      contentSpecifications,
      sourceContentReferences,
      assetType,
      designSpecifications,
      brandAssetsReferences,
    }) !== initialSnapshotRef.current || (isAdministrator && Boolean(taskToEdit) && owningClusterId !== (taskToEdit?.owningClusterId || ''));
  }, [
    isOpen, isAdministrator, taskToEdit, owningClusterId, title, description, brandGuidelines, assigneeIds, userId, dueDate,
    cognitiveLoad, status, client, project, estimatedHours, priority, contentDocLink,
    contentType, contentSpecifications, sourceContentReferences, assetType,
    designSpecifications, brandAssetsReferences,
  ]);

  const requestClose = () => {
    if (isSubmitting) return;
    if (canEdit && isDirty && !showDiscardConfirm) {
      setShowDiscardConfirm(true);
      return;
    }
    setShowDiscardConfirm(false);
    onClose();
  };

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
      const totalLeadTimeStr = formatLeadDuration(totalLeadTimeMs, '< 1m');

      let currentStatusDurationStr = '< 1m';
      if (taskToEdit.activityLog && Array.isArray(taskToEdit.activityLog) && taskToEdit.activityLog.length > 0) {
        const lastTransition = [...taskToEdit.activityLog].reverse().find(a => a && a.action === 'status_change');
        if (lastTransition) {
          const transTime = new Date(lastTransition.timestamp).getTime();
          currentStatusDurationStr = formatLeadDuration(now - transTime, '< 1m');
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

  const isDeadlineRequired = status !== 'pipeline' && status !== 'retainer';
  const isUserIdRequired = status !== 'pipeline';
  const detailsIncomplete =
    !title.trim() ||
    (isUserIdRequired && assigneeIds.length === 0 && !userId) ||
    (isDeadlineRequired && !dueDate.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    const effectiveAssignees = assigneeIds.length > 0 ? assigneeIds : (userId ? [userId] : []);
    if (!title.trim()) {
      setActiveTab('details');
      setSubmitError('Task name is required on Details & Schedule.');
      return;
    }
    if (isUserIdRequired && effectiveAssignees.length === 0) {
      setActiveTab('details');
      setSubmitError('Select an assignee or set status to Pipeline.');
      return;
    }
    if (isDeadlineRequired && !dueDate.trim()) {
      setActiveTab('details');
      setSubmitError('A deadline is required for active workflow tasks on Details & Schedule.');
      return;
    }

    const trimmedDocLink = contentDocLink.trim();
    if (taskDiscipline === 'content' && status === 'done') {
      if (!trimmedDocLink || !isValidHttpUrl(trimmedDocLink)) {
        setActiveTab('specs');
        setSubmitError('A valid Content document URL (http/https) is required on Brief & Specs before marking a Content task as Sent.');
        setTimeout(() => document.getElementById('task-content-doc-link')?.focus(), 50);
        return;
      }
    }

    const trimmedBrandGuidelines = brandGuidelines.trim();
    if (trimmedBrandGuidelines && !isValidHttpUrl(trimmedBrandGuidelines)) {
      setActiveTab('specs');
      setSubmitError('Brand Guidelines must be a valid URL starting with http:// or https:// on Brief & Specs.');
      setTimeout(() => document.getElementById('task-brand-guidelines-input')?.focus(), 50);
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
    const isOngoing = status === 'retainer';
    const finalDueDate = (status === 'pipeline' || isOngoing) ? undefined : (dueDate.trim() || undefined);
    const parsedEstimated = isOngoing
      ? undefined
      : (estimatedHours.trim() ? Math.max(0, parseFloat(estimatedHours)) : undefined);
    const finalCognitiveLoad = isOngoing ? undefined : cognitiveLoad;
    const finalPriority = isOngoing ? undefined : priority;

    try {
      if (taskToEdit) {
        await updateTask(taskToEdit.id, {
          ...(isAdministrator && owningClusterId && owningClusterId !== taskToEdit.owningClusterId ? { owningClusterId } : {}),
          title: title.trim(),
          description: description.trim(),
          brandGuidelines: trimmedBrandGuidelines,
          userId: effectiveAssignees[0] || undefined,
          assigneeIds: effectiveAssignees,
          dueDate: finalDueDate,
          cognitiveLoad: finalCognitiveLoad,
          status,
          client: client.trim() || undefined,
          project: project.trim() || undefined,
          estimatedHours: parsedEstimated,
          priority: finalPriority,
          contentDocLink: trimmedDocLink || undefined,
          disciplineMetadata: nextDisciplineMetadata ?? ({} as TaskDisciplineMetadata),
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
          cognitiveLoad: finalCognitiveLoad,
          status,
          client: client.trim() || undefined,
          project: project.trim() || undefined,
          estimatedHours: parsedEstimated,
          priority: finalPriority,
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

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
          onClick={e => {
            if (e.target === e.currentTarget) requestClose();
          }}
        >
          <DialogPanel aria-label="Task details" onClose={requestClose} busy={isSubmitting}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.16, ease: [0.2, 0.7, 0.2, 1] }}
            onClick={e => e.stopPropagation()}
            id="task-modal"
            className="w-full max-w-xl my-auto flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="dialog-header">
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <h2 className="text-sm font-bold tracking-tight text-[var(--text-primary)]">
                  {taskToEdit ? 'Edit Task' : 'Create New Task'}
                </h2>
                {taskToEdit && (
                  <span
                    className={`rounded-[5px] px-1.5 py-0.5 text-[11px] font-semibold border ${
                      taskToEdit.status === 'done' || taskToEdit.status === 'retainer'
                        ? 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 border-emerald-600/25'
                        : taskToEdit.status === 'in_progress'
                        ? 'bg-[var(--accent-soft)] text-[#1d4ed8] dark:text-blue-300 border-[var(--accent)]/30'
                        : taskToEdit.status === 'in_review'
                        ? 'bg-amber-600/10 text-amber-700 dark:text-amber-400 border-amber-600/25'
                        : 'bg-[var(--surface-subtle)] text-[var(--text-secondary)] border-[var(--border)]'
                    }`}
                  >
                    {formatTaskStatus(taskToEdit.status)}
                  </span>
                )}
                {taskToEdit?.isSubtask && (
                  <span className="ledger-badge text-[#1d4ed8] dark:text-blue-400">
                    <CornerDownRight className="w-2.5 h-2.5" />
                    <span>Subtask</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {taskToEdit && canDuplicate && (
                  <button
                    type="button"
                    onClick={() => onDuplicateTask?.(taskToEdit)}
                    title="Delegate subtask across boards"
                    aria-label="Delegate subtask across boards"
                    className="icon-button"
                  >
                    <CopyPlus className="h-4 w-4" />
                  </button>
                )}

                {taskToEdit && canEdit && (
                  <button
                    type="button"
                    onClick={() => setShowConfirmDelete(!showConfirmDelete)}
                    title="Delete task"
                    aria-label="Delete task"
                    className="icon-button hover:!text-red-600 dark:hover:!text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}

                <div className="h-4 w-px bg-[var(--border)] mx-1 shrink-0" aria-hidden="true" />

                <button
                  type="button"
                  onClick={requestClose}
                  aria-label="Close modal"
                  title="Close task modal"
                  className="icon-button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Subtask Breadcrumb if this task is a subtask */}
            {taskToEdit?.isSubtask && taskToEdit.parentTaskTitle && (
              <div className="px-5 py-2 bg-[var(--accent-soft)] border-b border-[var(--border-subtle)] flex items-center gap-2 text-xs shrink-0">
                <CornerDownRight className="w-3.5 h-3.5 text-[#1d4ed8] dark:text-blue-400 shrink-0" />
                <span className="text-[var(--text-secondary)]">Parent Task:</span>
                <span className="font-semibold text-[var(--text-primary)] truncate">
                  {taskToEdit.parentTaskTitle}
                </span>
              </div>
            )}

            {/* Propagated Content Document Link, Brand Guidelines & ClickUp Link */}
            {((taskToEdit?.brandGuidelines && isValidHttpUrl(taskToEdit.brandGuidelines)) ||
              (taskToEdit?.contentDocLink && isValidHttpUrl(taskToEdit.contentDocLink)) ||
              (taskToEdit?.clickupUrl && isValidHttpUrl(taskToEdit.clickupUrl))) && (
              <div className="px-5 py-2 bg-[var(--surface-muted)] border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
                <div className="flex flex-wrap items-center gap-3 min-w-0">
                  {taskToEdit?.brandGuidelines && isValidHttpUrl(taskToEdit.brandGuidelines) && (
                    <a
                      href={taskToEdit.brandGuidelines}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 font-semibold text-[#1d4ed8] dark:text-blue-400 hover:underline min-w-0"
                    >
                      <Link2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Brand Guidelines</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  )}
                  {taskToEdit?.contentDocLink && isValidHttpUrl(taskToEdit.contentDocLink) && (
                    <a
                      href={taskToEdit.contentDocLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400 hover:underline min-w-0"
                    >
                      <Link2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate max-w-[240px]">
                        Content Doc: {taskToEdit.contentDocLink}
                      </span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  )}
                </div>
                {taskToEdit?.clickupUrl && isValidHttpUrl(taskToEdit.clickupUrl) && (
                  <a
                    href={taskToEdit.clickupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline shrink-0"
                  >
                    <span>Open in ClickUp</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}

            {/* Progressive Disclosure Tabs */}
            <div className="px-5 py-2 border-b border-[var(--border)] bg-[var(--surface)] shrink-0">
              <div
                className="segmented-track w-full"
                role="tablist"
                aria-label="Task detail sections"
                onKeyDown={e => {
                  const tabs = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
                  const idx = tabs.indexOf(document.activeElement as HTMLButtonElement);
                  if (idx === -1 || tabs.length === 0) return;
                  let nextIdx = -1;
                  if (e.key === 'ArrowRight') nextIdx = (idx + 1) % tabs.length;
                  else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + tabs.length) % tabs.length;
                  else if (e.key === 'Home') nextIdx = 0;
                  else if (e.key === 'End') nextIdx = tabs.length - 1;
                  if (nextIdx !== -1) {
                    e.preventDefault();
                    const nextTab = tabs[nextIdx];
                    nextTab.focus();
                    nextTab.click();
                  }
                }}
              >
                <button
                  id="task-tab-details"
                  type="button"
                  role="tab"
                  tabIndex={activeTab === 'details' ? 0 : -1}
                  aria-selected={activeTab === 'details'}
                  aria-controls="task-modal-tabpanel"
                  onClick={() => setActiveTab('details')}
                  className={`segmented-item flex-1 cursor-pointer gap-1.5 ${activeTab === 'details' ? 'segmented-item-active' : ''}`}
                >
                  <span>{status === 'retainer' ? 'Details' : 'Details & Schedule'}</span>
                  {detailsIncomplete && (
                    <span
                      title="Required field incomplete"
                      aria-label="Required field incomplete"
                      className="h-1.5 w-1.5 rounded-full bg-amber-600 dark:bg-amber-400 shrink-0"
                    />
                  )}
                </button>
                <button
                  id="task-tab-specs"
                  type="button"
                  role="tab"
                  tabIndex={activeTab === 'specs' ? 0 : -1}
                  aria-selected={activeTab === 'specs'}
                  aria-controls="task-modal-tabpanel"
                  onClick={() => setActiveTab('specs')}
                  className={`segmented-item flex-1 cursor-pointer ${activeTab === 'specs' ? 'segmented-item-active' : ''}`}
                >
                  Brief &amp; Specs
                </button>
                {taskToEdit && (
                  <button
                    id="task-tab-activity"
                    type="button"
                    role="tab"
                    tabIndex={activeTab === 'activity' ? 0 : -1}
                    aria-selected={activeTab === 'activity'}
                    aria-controls="task-modal-tabpanel"
                    onClick={() => setActiveTab('activity')}
                    className={`segmented-item flex-1 cursor-pointer tabular-nums ${activeTab === 'activity' ? 'segmented-item-active' : ''}`}
                  >
                    Activity ({activities.length})
                  </button>
                )}
              </div>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
              <div
                id="task-modal-tabpanel"
                role="tabpanel"
                aria-labelledby={`task-tab-${activeTab}`}
                className="px-5 py-4 overflow-y-auto flex-1 space-y-4 min-h-[340px]"
              >
                {showDiscardConfirm && (
                  <div role="alertdialog" aria-label="Discard unsaved changes" className="callout callout-warning space-y-2">
                    <p className="text-xs font-semibold">
                      Discard unsaved changes?
                    </p>
                    <p className="text-[11px] opacity-90">
                      You have unsaved edits on this task that will be lost if you close now.
                    </p>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button" autoFocus
                        onClick={() => setShowDiscardConfirm(false)}
                        className="button-secondary"
                      >
                        Keep Editing
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowDiscardConfirm(false);
                          onClose();
                        }}
                        className="button-danger"
                      >
                        Discard Changes
                      </button>
                    </div>
                  </div>
                )}

                {!canEdit && (
                  <div className="callout callout-info text-xs">
                    Read-only view: You can inspect briefs, links, and activity without editing specialist swimlanes.
                  </div>
                )}

                {/* Error Banner */}
                {submitError && (
                  <div role="alert" className="callout callout-danger flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{submitError}</span>
                  </div>
                )}

                {/* Delete Confirmation Banner */}
                {showConfirmDelete && (
                  <div className="callout callout-danger space-y-2">
                    <p className="text-xs font-semibold">
                      Are you sure you want to delete this task?
                    </p>
                    <p className="text-[11px] opacity-90">
                      This action cannot be undone. All activity logs and tracking history for this task will be permanently removed.
                    </p>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={isSubmitting}
                        className="button-danger"
                      >
                        Yes, Delete Task
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowConfirmDelete(false)}
                        className="button-secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {activeTab === 'details' && taskToEdit?.status === 'pipeline' && !canAssignTask && currentUser?.role === 'account_manager' && (
                  <p className="text-xs text-[var(--text-secondary)]">A Creative Director, Business Lead, Cluster Lead or administrator can assign this brief.</p>
                )}

                {activeTab === 'details' && !canEdit && (
                  <div className="rounded-[9px] border border-[var(--border)] bg-[var(--surface-muted)] overflow-hidden divide-y divide-[var(--border-subtle)] text-xs">
                    <div className="px-4 py-3 bg-[var(--surface)]">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Task Name</p>
                      <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{title || 'Untitled task'}</p>
                    </div>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[var(--border-subtle)]">
                      <div className="px-4 py-2.5">
                        <dt className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Assignee(s)</dt>
                        <dd className="mt-0.5 font-medium text-[var(--text-primary)]">
                          {assigneeIds.length > 0
                            ? assigneeIds.map(id => users.find(u => u.id === id)?.name).filter(Boolean).join(', ')
                            : 'Unassigned in Pipeline'}
                        </dd>
                      </div>
                      <div className="px-4 py-2.5">
                        <dt className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Status · Team</dt>
                        <dd className="mt-0.5 font-medium text-[var(--text-primary)] capitalize">
                          {formatTaskStatus(status)} · {taskDiscipline}
                        </dd>
                      </div>
                    </dl>
                    <dl className={`grid grid-cols-1 ${status === 'retainer' ? '' : 'sm:grid-cols-2 sm:divide-x'} divide-y sm:divide-y-0 divide-[var(--border-subtle)]`}>
                      <div className="px-4 py-2.5">
                        <dt className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Client · Project</dt>
                        <dd className="mt-0.5 font-medium text-[var(--text-primary)]">
                          {[client, project].filter(Boolean).join(' · ') || '—'}
                        </dd>
                      </div>
                      {status !== 'retainer' && (
                        <div className="px-4 py-2.5">
                          <dt className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Deadline</dt>
                          <dd className="mt-0.5 font-medium tabular-nums text-[var(--text-primary)]">
                            {dueDate ? formatDateOnly(dueDate) : 'No deadline'}
                          </dd>
                        </div>
                      )}
                    </dl>
                    {status !== 'retainer' && (
                      <dl className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[var(--border-subtle)]">
                        <div className="px-4 py-2.5">
                          <dt className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Priority</dt>
                          <dd className="mt-0.5 font-semibold capitalize text-[var(--text-primary)]">{priority}</dd>
                        </div>
                        <div className="px-4 py-2.5">
                          <dt className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Cognitive Load</dt>
                          <dd className="mt-0.5 font-semibold capitalize text-[var(--text-primary)]">
                            {cognitiveLoad} ({getCognitiveLoadLabel(cognitiveLoad, taskDiscipline as Role)})
                          </dd>
                        </div>
                        <div className="px-4 py-2.5">
                          <dt className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Estimated</dt>
                          <dd className="mt-0.5 font-semibold tabular-nums text-[var(--text-primary)]">
                            {estimatedHours ? `${estimatedHours}h` : '—'}
                          </dd>
                        </div>
                      </dl>
                    )}
                  </div>
                )}

                {activeTab === 'details' && canEdit && (
                  <fieldset disabled={!canEdit} className="space-y-4 m-0 p-0 border-0 min-w-0">
                {/* Task Name */}
                <div>
                  <label className="field-label" htmlFor="task-title-input">
                    Task Name <span className="text-red-600 dark:text-red-400">*</span>
                  </label>
                  <input
                    id="task-title-input"
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. Redesign navigation menu for mobile screens"
                    className="field-control"
                    required
                  />
                </div>

                {/* Assignee & Status */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Assignee Selection */}
                  {(canAssignTask || taskToEdit?.status !== 'pipeline') && <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="field-label !mb-0" htmlFor="task-assignee-select">
                        Assignee {status !== 'pipeline' && <span className="text-red-600 dark:text-red-400">*</span>}
                      </label>
                      <span className="text-[11px] text-[#1d4ed8] dark:text-blue-400 font-semibold capitalize">
                        {taskDiscipline} Team
                      </span>
                    </div>
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
                        className="field-control pr-8 cursor-pointer"
                      >
                        <option value="">-- Unassigned in Team Pipeline --</option>
                        {eligibleUsers.map(u => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({getUserTag(u).label})
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
                    </div>
                    {canEdit && assigneeIds.length > 0 && eligibleUsers.some(u => !assigneeIds.includes(u.id)) && (
                      showCoAssignPicker ? (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <Users className="h-3 w-3 text-emerald-700 dark:text-emerald-400 shrink-0" />
                          <div className="relative flex-1 min-w-0">
                            <select
                              ref={coAssignSelectRef}
                              aria-label="Share task with additional member"
                              value=""
                              onChange={e => {
                                const extraId = e.target.value;
                                if (extraId && !assigneeIds.includes(extraId)) {
                                  setAssigneeIds(prev => [...prev, extraId]);
                                }
                              }}
                              className="field-control sm:!py-1 sm:!text-[11px] pr-7 cursor-pointer"
                            >
                              <option value="">+ Co-assign teammate...</option>
                              {eligibleUsers
                                .filter(u => !assigneeIds.includes(u.id))
                                .map(u => (
                                  <option key={u.id} value={u.id}>
                                    {u.name} ({getUserTag(u).label})
                                  </option>
                                ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--text-muted)]" />
                          </div>
                          {assigneeIds.length <= 1 && (
                            <button
                              type="button"
                              aria-label="Hide co-assign selector"
                              title="Hide co-assign selector"
                              onClick={() => {
                                setShowCoAssignPicker(false);
                                requestAnimationFrame(() => coAssignToggleRef.current?.focus({ preventScroll: true }));
                              }}
                              className="icon-button sm:!h-7 sm:!w-7 border border-[var(--border)] bg-[var(--surface)] shrink-0"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <button
                          ref={coAssignToggleRef}
                          type="button"
                          onClick={() => setShowCoAssignPicker(true)}
                          className="mt-1.5 inline-flex items-center gap-1 min-h-[44px] sm:min-h-0 px-1 sm:px-0 text-[11px] font-medium text-[#1d4ed8] dark:text-blue-400 hover:underline cursor-pointer"
                        >
                          <Users className="h-3 w-3 text-emerald-700 dark:text-emerald-400 shrink-0" />
                          <span>+ Co-assign teammate</span>
                        </button>
                      )
                    )}
                    {assigneeIds.length > 1 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        <Users className="h-3 w-3 text-emerald-700 dark:text-emerald-400 shrink-0" />
                        {assigneeIds.map(aid => {
                          const member = users.find(u => u.id === aid);
                          if (!member) return null;
                          return (
                            <span
                              key={aid}
                              className="inline-flex items-center gap-1 rounded-[5px] bg-emerald-600/10 border border-emerald-600/25 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400"
                            >
                              <span>{member.name}</span>
                              {canEdit && assigneeIds.length > 1 && (
                                <button
                                  type="button"
                                  aria-label={`Remove ${member.name}`}
                                  title={`Remove ${member.name}`}
                                  onClick={() => {
                                    const next = assigneeIds.filter(id => id !== aid);
                                    setAssigneeIds(next);
                                    setUserId(next[0] || '');
                                  }}
                                  className="hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                                  style={{ minHeight: 'auto' }}
                                >
                                  ×
                                </button>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>}

                  {/* Workflow Status */}
                  <div>
                    <label className="field-label" htmlFor="task-status-select">
                      Status
                    </label>
                    <div className="relative">
                      <select
                        id="task-status-select"
                        disabled={!canAssignTask && taskToEdit?.status === 'pipeline'}
                        value={status}
                        onChange={e => setStatus(e.target.value as TaskStatus)}
                        className="field-control pr-8 cursor-pointer"
                      >
                        <option value="pipeline">Pipeline (Backlog)</option>
                        <option value="retainer">Ongoing (No deadline)</option>
                        <option value="todo">To Do</option>
                        <option value="in_progress">In Progress</option>
                        <option value="in_review">In Review</option>
                        <option value="done">Sent</option>
                        <option value="archived">Completed</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
                    </div>
                  </div>
                </div>

                {taskToEdit && (taskToEdit.parentTaskId || taskToEdit.status === 'pipeline') && <div>
                  <label className="field-label" htmlFor="task-owning-cluster">Owning cluster</label>
                  <select id="task-owning-cluster" className="field-control" value={owningClusterId} disabled={!isAdministrator} onChange={event => setOwningClusterId(event.target.value)}>
                    <option value="">Unassigned cluster</option>
                    {creativeDirectors.map(user => <option key={user.id} value={user.id}>{user.name}’s Team</option>)}
                  </select>
                  {!isAdministrator && <p className="text-xs text-[var(--text-secondary)] mt-1">An administrator can change the owning cluster.</p>}
                </div>}

                {/* Client & Project */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="field-label" htmlFor="task-client-input">
                      Client / Account
                    </label>
                    <input
                      id="task-client-input"
                      type="text"
                      list="client-suggestions"
                      value={client}
                      onChange={e => setClient(e.target.value)}
                      placeholder="e.g. Acme Corp"
                      className="field-control"
                    />
                    <datalist id="client-suggestions">
                      {existingClients.map(c => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className="field-label" htmlFor="task-project-input">
                      Project
                    </label>
                    <input
                      id="task-project-input"
                      type="text"
                      list="project-suggestions"
                      value={project}
                      onChange={e => setProject(e.target.value)}
                      placeholder="e.g. Q4 Rebrand"
                      className="field-control"
                    />
                    <datalist id="project-suggestions">
                      {existingProjects.map(p => (
                        <option key={p} value={p} />
                      ))}
                    </datalist>
                  </div>
                </div>

                {status === 'retainer' ? (
                  <div className="callout callout-info text-[11px]">
                    Ongoing tasks do not require time estimates, priority, cognitive load, or deadlines — only subtasks created from them carry those fields.
                  </div>
                ) : (
                  <>
                {/* Estimated Time & Priority */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <label className="field-label !mb-0 flex items-center gap-1.5" htmlFor="task-estimated-hours-input">
                      <Timer className="h-3 w-3 text-[#1d4ed8] dark:text-blue-400" />
                      <span>Time Estimated</span>
                    </label>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      Split across days
                    </span>
                  </div>
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
                      className="field-control pr-10 tabular-nums"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-[var(--text-muted)]">
                      hrs
                    </span>
                  </div>
                </div>

                {/* Priority */}
                <PrioritySelector
                  value={priority}
                  onChange={setPriority}
                  labelId="taskmodal-priority-label"
                />
                </div>

                {/* Cognitive Load */}
                <CognitiveLoadSelector
                  value={cognitiveLoad}
                  onChange={setCognitiveLoad}
                  role={taskDiscipline as Role}
                />

                {/* Deadline */}
                <div>
                  <label className="field-label flex items-center gap-1.5" htmlFor="task-due-date-input">
                    <Calendar className="h-3 w-3 text-[#1d4ed8] dark:text-blue-400" />
                    <span>
                      Deadline {status !== 'pipeline' && <span className="text-red-600 dark:text-red-400">*</span>}
                    </span>
                  </label>

                  <input
                    id="task-due-date-input"
                    type="date"
                    required={status !== 'pipeline'}
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className={`field-control tabular-nums cursor-pointer ${
                      status !== 'pipeline' && !dueDate
                        ? '!border-amber-600/60 dark:!border-amber-400/50'
                        : ''
                    }`}
                  />

                  <DateQuickPresets
                    value={dueDate}
                    onSelectDate={setDueDate}
                    allowClear={status === 'pipeline'}
                    className="mt-1.5"
                  />
                  {status !== 'pipeline' && !dueDate && (
                    <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                      A deadline is required to add tasks directly into active workflow lanes.
                    </p>
                  )}
                </div>
                  </>
                )}
                  </fieldset>
                )}

                {activeTab === 'specs' && (
                  <>
                {/* Discipline Subtask Specifications (Editable) */}
                {(taskDiscipline === 'content' || taskDiscipline === 'design') && (
                  taskDiscipline === 'design' ? (
                    <DesignSpecFields
                      idPrefix="task-modal"
                      assetType={assetType}
                      onChangeAssetType={setAssetType}
                      designSpecifications={designSpecifications}
                      onChangeDesignSpecifications={setDesignSpecifications}
                      brandAssetsReferences={brandAssetsReferences}
                      onChangeBrandAssetsReferences={setBrandAssetsReferences}
                      readOnly={!canEdit}
                      heading={taskToEdit?.isSubtask ? 'Design Subtask Specifications' : 'Design Specifications'}
                    />
                  ) : (
                    <ContentSpecFields
                      idPrefix="task-modal"
                      contentType={contentType}
                      onChangeContentType={setContentType}
                      contentSpecifications={contentSpecifications}
                      onChangeContentSpecifications={setContentSpecifications}
                      sourceContentReferences={sourceContentReferences}
                      onChangeSourceContentReferences={setSourceContentReferences}
                      readOnly={!canEdit}
                      heading={taskToEdit?.isSubtask ? 'Content Subtask Specifications' : 'Content Specifications'}
                    />
                  )
                )}

                {/* Content Document Link */}
                {(taskDiscipline === 'content' || Boolean(contentDocLink)) && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="field-label !mb-0 flex items-center gap-1.5" htmlFor="task-content-doc-link">
                        <Link2 className="h-3 w-3 text-emerald-700 dark:text-emerald-400" />
                        <span>
                          Content Document Link
                          {taskDiscipline === 'content' && status === 'done' && (
                            <span className="text-red-600 dark:text-red-400 ml-0.5">*</span>
                          )}
                        </span>
                      </label>
                      {contentDocLink && isValidHttpUrl(contentDocLink) && (
                        <a
                          href={contentDocLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                        >
                          <span>Open Link</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <input
                      id="task-content-doc-link"
                      type="url"
                      value={contentDocLink}
                      readOnly={taskDiscipline !== 'content'}
                      onChange={e => setContentDocLink(e.target.value)}
                      placeholder="https://docs.google.com/document/d/..."
                      className="field-control"
                    />
                  </div>
                )}

                {/* Parent-Linked Brief */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="field-label !mb-0" htmlFor="task-description-input">
                      Brief
                    </label>
                    {taskToEdit?.isSubtask && (
                      <span className="text-[11px] text-[#1d4ed8] dark:text-blue-400 font-medium">
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
                    className="field-control resize-y"
                  />
                </div>

                {/* Brand Guidelines Link */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="field-label !mb-0 flex items-center gap-1.5" htmlFor="task-brand-guidelines-input">
                      <Link2 className="h-3 w-3 text-[#1d4ed8] dark:text-blue-400" />
                      <span>Brand Guidelines Link</span>
                    </label>
                    <div className="flex items-center gap-2">
                      {taskToEdit?.isSubtask && (
                        <span className="text-[11px] text-[#1d4ed8] dark:text-blue-400 font-medium">
                          Synced with parent
                        </span>
                      )}
                      {brandGuidelines && isValidHttpUrl(brandGuidelines) && (
                        <a
                          href={brandGuidelines}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1d4ed8] dark:text-blue-400 hover:underline"
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
                    className="field-control"
                  />
                </div>
                  </>
                )}

                {activeTab === 'activity' && taskToEdit && (
                  <>
                {/* Delegated Subtasks Preview */}
                {delegatedSubtasks.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      <CornerDownRight className="w-3.5 h-3.5 text-[#1d4ed8] dark:text-blue-400" />
                      <span className="tabular-nums">Delegated Subtasks ({delegatedSubtasks.length})</span>
                    </div>
                    <div className="max-h-36 overflow-y-auto rounded-[7px] border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
                      {delegatedSubtasks.map(st => {
                        const assignee = users.find(u => u.id === st.userId);
                        return (
                          <div
                            key={st.id}
                            className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className={`flex h-5 w-5 items-center justify-center rounded-[5px] text-[11px] font-semibold text-white bg-gradient-to-br ${
                                  assignee?.avatarColor || 'from-blue-600 to-indigo-600'
                                } shrink-0`}
                              >
                                {(assignee?.name || '?').charAt(0).toUpperCase()}
                              </div>
                              <span className="font-medium text-[var(--text-primary)] truncate">
                                {st.title}
                              </span>
                            </div>
                            <span className="ledger-badge shrink-0">
                              {formatTaskStatus(st.status)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Activity Audit Trail & Cycle Time */}
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                        <History className="h-3.5 w-3.5 text-[#1d4ed8] dark:text-blue-400" />
                        <span>Activity &amp; Cycle Time</span>
                      </div>
                      {cycleMetrics && (
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium tabular-nums text-[var(--text-secondary)]">
                          <span className="ledger-badge">
                            <Clock className="h-3 w-3 text-[var(--text-muted)]" />
                            <span>{cycleMetrics.isDone ? 'Completed:' : 'Lead:'} <strong className="text-[var(--text-primary)]">{cycleMetrics.totalLeadTimeStr}</strong></span>
                          </span>
                          <span className="ledger-badge">
                            <span>In status: <strong className="text-[var(--text-primary)]">{cycleMetrics.currentStatusStr}</strong></span>
                          </span>
                          <button
                            type="button"
                            onClick={() => onAdjustBillableHours?.(taskToEdit)}
                            title="Click to manually correct billable hours"
                            className="inline-flex items-center gap-1 rounded-[5px] bg-[var(--accent-soft)] text-[#1d4ed8] dark:text-blue-300 border border-[var(--accent)]/30 px-2 py-0.5 text-[11px] font-semibold hover:bg-blue-100 dark:hover:bg-blue-500/25 transition-colors cursor-pointer"
                            style={{ minHeight: 'auto' }}
                          >
                            <Timer className="h-3 w-3" />
                            <span>Billable: {cycleMetrics.billableDetailedStr}</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {activities.length === 0 ? (
                      <div className="rounded-[7px] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-10 text-center space-y-1">
                        <p className="text-xs font-semibold text-[var(--text-primary)]">
                          Created {formatActivityTime(taskToEdit.createdAt || '')}
                        </p>
                        <p className="text-[11px] text-[var(--text-secondary)]">
                          Edits, status changes, reassignments, and logged hours will appear here.
                        </p>
                      </div>
                    ) : (
                      <div className="max-h-56 overflow-y-auto rounded-[7px] border border-[var(--border)] bg-[var(--surface-muted)] divide-y divide-[var(--border-subtle)] text-xs">
                        {activities.map((act, actIdx) => {
                          if (!act) return null;
                          let IconComponent = Clock;
                          let iconTone = 'text-[var(--text-secondary)] bg-[var(--surface-subtle)]';

                          if (act.action === 'created') {
                            IconComponent = PlusCircle;
                            iconTone = 'text-[#1d4ed8] dark:text-blue-400 bg-[var(--accent-soft)]';
                          } else if (act.action === 'status_change') {
                            IconComponent = act.to === 'done' ? CheckCircle2 : ArrowRight;
                            iconTone = act.to === 'done'
                              ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-600/10'
                              : 'text-amber-700 dark:text-amber-400 bg-amber-600/10';
                          } else if (act.action === 'reassigned') {
                            IconComponent = UserCheck;
                            iconTone = 'text-[#1d4ed8] dark:text-blue-400 bg-[var(--accent-soft)]';
                          } else if (act.action === 'billable_adjusted') {
                            IconComponent = Timer;
                            iconTone = 'text-[#1d4ed8] dark:text-blue-400 bg-[var(--accent-soft)]';
                          }

                          const toStr = typeof act.to === 'string' ? act.to : (typeof act.to === 'object' && act.to ? JSON.stringify(act.to) : String(act.to ?? ''));
                          const fromStr = typeof act.from === 'string' ? act.from : (typeof act.from === 'object' && act.from ? JSON.stringify(act.from) : String(act.from ?? ''));

                          return (
                            <div key={act.id || actIdx} className="px-3 py-2 flex items-start gap-2">
                              <div className={`p-1 rounded-[5px] shrink-0 mt-0.5 ${iconTone}`}>
                                <IconComponent className="h-3 w-3" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-[var(--text-primary)] text-[11px] truncate">
                                  {act.details || (
                                    act.action === 'created'
                                      ? 'Task created'
                                      : act.action === 'status_change'
                                      ? `Status changed from ${formatTaskStatus(fromStr)} to ${formatTaskStatus(toStr)}`
                                      : act.action === 'reassigned'
                                      ? `Reassigned to ${toStr}`
                                      : act.action === 'billable_adjusted'
                                      ? `Billable time set to ${toStr}`
                                      : act.action
                                  )}
                                </p>
                                <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] tabular-nums mt-0.5">
                                  <span>{act.actorName || 'System'}</span>
                                  <span>·</span>
                                  <span>{formatActivityTime(act.timestamp)}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  </>
                )}
              </div>

              {/* Footer Buttons */}
              <div className="dialog-footer">
                <button
                  type="button"
                  onClick={requestClose}
                  className="button-secondary"
                >
                  {canEdit && (activeTab !== 'activity' || isDirty) ? 'Cancel' : 'Close'}
                </button>
                {canEdit && (activeTab !== 'activity' || isDirty) && (
                  <button
                    id="task-submit-button"
                    type="submit"
                    disabled={isSubmitting}
                    className="button-primary"
                  >
                    <span>{isSubmitting ? 'Saving...' : taskToEdit ? 'Save Changes' : 'Create Task'}</span>
                  </button>
                )}
              </div>
            </form>
          </DialogPanel>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

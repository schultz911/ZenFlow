import { DialogPanel } from './ui/DialogPanel';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useBoardUi, useWorkspace } from '../context/DashboardContext';
import { CognitiveLoad, Task, TaskStatus, User } from '../types';
import {
  formatDateOnly,
  formatHours,
  formatLocalDateKey,
  formatTaskStatus,
  getLocalOffsetDateKey,
  getUserDailyAssignedHours,
  getUserTag,
  groupTasksByAssignee,
  quickWorkloadScore,
} from '../utils/workload';
import { DateQuickPresets } from './ui/DateQuickPresets';
import { CognitiveLoadSelector } from './ui/CognitiveLoadSelector';
import { PrioritySelector } from './ui/PrioritySelector';
import { useDiscardGuard } from '../hooks/useDiscardGuard';
import {
  X,
  CopyPlus,
  CheckCircle2,
  Layers,
  Loader2,
  AlertCircle,
  ArrowRight,
  UserCheck,
  GitFork,
  ChevronDown,
  Timer,
} from 'lucide-react';

interface DuplicateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  initialTargetUserId?: string;
  initialTargetStatus?: TaskStatus;
  onDuplicated?: (newTask: Task, targetUser: User) => void;
}

export const DuplicateTaskModal: React.FC<DuplicateTaskModalProps> = ({
  isOpen,
  onClose,
  task,
  initialTargetUserId,
  initialTargetStatus,
  onDuplicated,
}) => {
  const { setActiveBoardId } = useBoardUi();
  const {
    users,
    tasks,
    creativeDirectors,
    duplicateTaskToBoard,
  } = useWorkspace();

  const deliveryUsers = useMemo(
    () => users.filter(u => u.role === 'content' || u.role === 'design'),
    [users]
  );
  const tasksByUser = useMemo(() => groupTasksByAssignee(tasks), [tasks]);

  // Find source user and board
  const sourceUser = useMemo(() => {
    if (!task) return null;
    return users.find(u => u.id === task.userId) || null;
  }, [task, users]);

  const sourceBoard = useMemo(() => {
    if (!sourceUser) return null;
    return (
      creativeDirectors.find(
        cd => cd.id === sourceUser.creativeDirectorId || (sourceUser.isCreativeDirector && cd.id === sourceUser.id)
      ) || null
    );
  }, [sourceUser, creativeDirectors]);

  // Destination Boards list (delivery members only — excludes Accounts who have no swimlane)
  const availableBoards = useMemo(() => {
    const list: Array<{ id: string; name: string; memberCount: number }> = [];

    for (const cd of creativeDirectors) {
      const count = deliveryUsers.filter(u => u.id === cd.id || u.creativeDirectorId === cd.id).length;
      list.push({
        id: cd.id,
        name: `${cd.name}'s Team`,
        memberCount: count,
      });
    }

    const independentCount = deliveryUsers.filter(u => !u.creativeDirectorId && !u.isCreativeDirector).length;
    if (independentCount > 0) {
      list.push({
        id: 'independent',
        name: 'Independent / Direct Board',
        memberCount: independentCount,
      });
    }

    list.push({
      id: 'all',
      name: 'All Workspace Members',
      memberCount: deliveryUsers.length,
    });

    return list;
  }, [creativeDirectors, deliveryUsers]);

  // Selection states
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [subtaskTitle, setSubtaskTitle] = useState<string>('');
  const [targetStatus, setTargetStatus] = useState<TaskStatus>('todo');
  const [targetDueDate, setTargetDueDate] = useState<string>('');
  const [targetCognitiveLoad, setTargetCognitiveLoad] = useState<CognitiveLoad>('medium');
  const [targetPriority, setTargetPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [targetEstimatedHours, setTargetEstimatedHours] = useState<string>('');
  const [showMoreOptions, setShowMoreOptions] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    warning?: string;
    targetBoardId?: string;
    targetBoardName?: string;
  } | null>(null);

  // Initialize board and form when task changes or modal opens
  const initialSnapshotRef = useRef<string>('');
  useEffect(() => {
    if (!isOpen || !task) {
      setFeedback(null);
      setIsSubmitting(false);
      initialSnapshotRef.current = '';
      return;
    }

    const ownerFallback = task.status === 'retainer' ? sourceUser : null;
    const preselectedUser = initialTargetUserId
      ? users.find(u => u.id === initialTargetUserId) || ownerFallback
      : ownerFallback;

    let initBoardId = 'all';
    let initUserId = '';
    if (preselectedUser) {
      initBoardId = preselectedUser.isCreativeDirector
        ? preselectedUser.id
        : preselectedUser.creativeDirectorId
        ? preselectedUser.creativeDirectorId
        : availableBoards.some(b => b.id === 'independent')
        ? 'independent'
        : 'all';
      initUserId = preselectedUser.id;
    } else {
      // Default to a different board than source user's board
      const currentBoardId = sourceBoard?.id || '';
      const otherBoard = availableBoards.find(b => b.id !== currentBoardId && b.id !== 'all');
      initBoardId = otherBoard ? otherBoard.id : (availableBoards[0]?.id || 'all');
    }
    setSelectedBoardId(initBoardId);
    setSelectedUserId(initUserId);

    setSubtaskTitle(task.title);
    const resolvedStatus =
      initialTargetStatus && initialTargetStatus !== 'retainer' && initialTargetStatus !== 'pipeline'
        ? initialTargetStatus
        : task.status === 'retainer' || task.status === 'pipeline'
        ? 'todo'
        : task.status;
    setTargetStatus(resolvedStatus);
    const defaultDue = task.dueDate || (task.status === 'retainer' ? getLocalOffsetDateKey(1) : '');
    const defaultLoad: CognitiveLoad = task.cognitiveLoad || 'medium';
    const defaultPriority: 'low' | 'medium' | 'high' = task.priority || 'medium';
    const defaultEstimated = task.estimatedHours !== undefined ? String(task.estimatedHours) : '';
    setTargetDueDate(defaultDue);
    setTargetCognitiveLoad(defaultLoad);
    setTargetPriority(defaultPriority);
    setTargetEstimatedHours(defaultEstimated);
    setFeedback(null);
    initialSnapshotRef.current = JSON.stringify({
      subtaskTitle: task.title,
      targetStatus: resolvedStatus,
      targetDueDate: defaultDue,
      targetCognitiveLoad: defaultLoad,
      targetPriority: defaultPriority,
      targetEstimatedHours: defaultEstimated,
    });
  }, [isOpen, task, sourceUser, sourceBoard, availableBoards, initialTargetUserId, initialTargetStatus, users]);

  const isDirty = useMemo(() => {
    if (!isOpen || !task || !initialSnapshotRef.current || feedback?.type === 'success') return false;
    return JSON.stringify({
      subtaskTitle,
      targetStatus,
      targetDueDate,
      targetCognitiveLoad,
      targetPriority,
      targetEstimatedHours,
    }) !== initialSnapshotRef.current;
  }, [
    isOpen, task, feedback?.type, subtaskTitle, targetStatus, targetDueDate,
    targetCognitiveLoad, targetPriority, targetEstimatedHours,
  ]);

  const { showDiscardConfirm, requestClose, confirmDiscard, resetDiscardConfirm } = useDiscardGuard(
    isDirty,
    isSubmitting,
    onClose
  );

  // Compute eligible delivery members belonging to the selected board
  const availableUsers = useMemo(() => {
    if (!task) return [];
    let boardUsers: User[] = [];

    if (selectedBoardId === 'all') {
      boardUsers = deliveryUsers;
    } else if (selectedBoardId === 'independent') {
      boardUsers = deliveryUsers.filter(u => !u.creativeDirectorId && !u.isCreativeDirector);
    } else {
      boardUsers = deliveryUsers.filter(u => u.id === selectedBoardId || u.creativeDirectorId === selectedBoardId);
    }

    return boardUsers;
  }, [deliveryUsers, selectedBoardId, task]);

  // Synchronize selected user when available users list changes (prefer non-overloaded teammates for standard tasks)
  useEffect(() => {
    if (availableUsers.length > 0) {
      if (!availableUsers.some(u => u.id === selectedUserId)) {
        const preferred =
          task?.status !== 'retainer'
            ? availableUsers.find(
                u => u.id !== sourceUser?.id && quickWorkloadScore(tasksByUser.get(u.id) || []) < 12
              ) ||
              availableUsers.find(u => u.id !== sourceUser?.id) ||
              availableUsers[0]
            : availableUsers[0];
        setSelectedUserId(preferred.id);
      }
    } else {
      setSelectedUserId('');
    }
  }, [availableUsers, selectedUserId, task?.status, sourceUser?.id, tasksByUser]);

  const selectedTargetUser = useMemo(() => {
    return users.find(u => u.id === selectedUserId) || null;
  }, [users, selectedUserId]);

  const selectedBoardObj = useMemo(() => {
    return availableBoards.find(b => b.id === selectedBoardId) || null;
  }, [availableBoards, selectedBoardId]);

  // Submit duplication as subtask
  const handleDuplicate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task || !selectedUserId || isSubmitting) return;

    if (targetStatus !== 'pipeline' && targetStatus !== 'retainer' && !targetDueDate.trim()) {
      setFeedback({
        type: 'error',
        message: 'A deadline is required when placing subtasks into active workflow lanes.',
      });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const parsedEstimatedHours = targetEstimatedHours.trim()
        ? Math.max(0, parseFloat(targetEstimatedHours))
        : undefined;
      const res = await duplicateTaskToBoard({
        taskId: task.id,
        targetUserId: selectedUserId,
        title: subtaskTitle.trim() || undefined,
        targetStatus,
        targetDueDate: targetDueDate.trim() || undefined,
        targetCognitiveLoad,
        targetPriority,
        targetEstimatedHours: Number.isFinite(parsedEstimatedHours) ? parsedEstimatedHours : undefined,
      });

      const targetUserName = selectedTargetUser?.name || 'Selected user';
      const boardName = selectedBoardObj?.name || 'Destination board';

      setFeedback({
        type: 'success',
        message: `Subtask created under "${task.title}" on ${targetUserName}'s board!`,
        warning: res.warning,
        targetBoardId: selectedBoardId,
        targetBoardName: boardName,
      });

      if (selectedTargetUser && onDuplicated) {
        onDuplicated(res.task, selectedTargetUser);
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to create subtask on target board.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSwitchToDestinationBoard = () => {
    if (selectedBoardId && selectedBoardId !== 'independent') {
      setActiveBoardId(selectedBoardId);
    }
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && task && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
          onClick={e => {
            if (e.target === e.currentTarget) {
              requestClose();
            }
          }}
        >
          <DialogPanel aria-label="Duplicate task" onClose={requestClose} busy={isSubmitting}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.16, ease: [0.2, 0.7, 0.2, 1] }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-xl my-auto flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="dialog-header">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-[var(--accent-soft)] text-[#1d4ed8] dark:text-blue-400">
                  <CopyPlus className="h-4 w-4" />
                </div>
                <h2 className="text-sm font-bold tracking-tight text-[var(--text-primary)]">
                  Create and Assign Subtask
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close dialog"
                onClick={requestClose}
                className="icon-button shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleDuplicate} className="flex flex-col flex-1 min-h-0">
              <div className="p-5 overflow-y-auto flex-1 space-y-4">
                {showDiscardConfirm && (
                  <div role="alertdialog" aria-label="Discard unsaved subtask" className="callout callout-warning space-y-2">
                    <p className="text-xs font-semibold">Discard unsaved subtask?</p>
                    <p className="text-[11px] opacity-90">
                      You have unsubmitted subtask changes that will be lost if you close now.
                    </p>
                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={resetDiscardConfirm} className="button-secondary">
                        Keep Editing
                      </button>
                      <button type="button" onClick={confirmDiscard} className="button-danger-outline">
                        Discard
                      </button>
                    </div>
                  </div>
                )}
                {/* Source Parent Task Summary */}
                <div className="rounded-[7px] border border-[var(--border)] bg-[var(--surface-muted)] divide-y divide-[var(--border-subtle)]">
                  <div className="flex items-start justify-between gap-2 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                        Parent Task
                      </span>
                      <h3 className="text-xs font-semibold text-[var(--text-primary)] mt-0.5 truncate">
                        {task.title}
                      </h3>
                    </div>
                    {task.status === 'retainer' || !task.cognitiveLoad ? (
                      <span className="inline-flex items-center gap-1 rounded-[5px] bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5">
                        Ongoing
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold capitalize text-[var(--text-secondary)] shrink-0 mt-0.5">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            task.cognitiveLoad === 'high'
                              ? 'bg-red-600 dark:bg-red-400'
                              : task.cognitiveLoad === 'medium'
                              ? 'bg-amber-600 dark:bg-amber-400'
                              : 'bg-emerald-600 dark:bg-emerald-400'
                          }`}
                        />
                        <span>{task.cognitiveLoad} load</span>
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 divide-x divide-[var(--border-subtle)] text-[11px]">
                    <div className="flex items-center gap-1.5 px-3.5 py-2 min-w-0">
                      <span className="text-[var(--text-secondary)] shrink-0">Owner:</span>
                      <span className="font-semibold text-[var(--text-primary)] truncate">
                        {sourceUser?.name || 'Unassigned'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 px-3.5 py-2 min-w-0">
                      <span className="text-[var(--text-secondary)] shrink-0">Board:</span>
                      <span className="font-semibold text-[var(--text-primary)] truncate">
                        {sourceBoard ? `${sourceBoard.name}'s Team` : 'Direct / Independent'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Selection Steps */}
                <div className="space-y-3.5">
                  {/* Destination Board (hidden when only 1 board option exists) */}
                  {availableBoards.length > 1 && (
                  <div>
                    <label className="field-label flex items-center gap-1.5" htmlFor="duplicatetaskmodal-field-1">
                      <Layers className="h-3 w-3 text-[#1d4ed8] dark:text-blue-400" />
                      <span>Destination Board (Team)</span>
                    </label>
                    <div className="relative">
                      <select
                        autoFocus
                        value={selectedBoardId}
                        onChange={e => setSelectedBoardId(e.target.value)}
                        disabled={isSubmitting || feedback?.type === 'success'}
                        className="field-control pr-8 cursor-pointer"
                        id="duplicatetaskmodal-field-1"
                      >
                        {availableBoards.map(b => (
                          <option key={b.id} value={b.id}>
                            {b.name} ({b.memberCount} member{b.memberCount !== 1 ? 's' : ''})
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
                    </div>
                  </div>
                  )}

                  {/* Destination Assignee on that Board */}
                  <div>
                    <label className="field-label flex items-center gap-1.5" htmlFor="duplicatetaskmodal-field-2">
                      <UserCheck className="h-3 w-3 text-[#1d4ed8] dark:text-blue-400" />
                      <span>Subtask Owner</span>
                    </label>
                    {availableUsers.length > 0 ? (
                      <div className="space-y-2">
                        <div className="relative">
                          <select
                            value={selectedUserId}
                            onChange={e => setSelectedUserId(e.target.value)}
                            disabled={isSubmitting || feedback?.type === 'success'}
                            className="field-control pr-8 cursor-pointer"
                            id="duplicatetaskmodal-field-2"
                          >
                            {availableUsers.map(u => {
                              const loadScore = quickWorkloadScore(tasksByUser.get(u.id) || []);
                              const dailyHours = getUserDailyAssignedHours(u, tasks);
                              return (
                                <option key={u.id} value={u.id}>
                                  {u.name} ({getUserTag(u).label}) · {loadScore}/12 pts · {formatHours(dailyHours)}/d
                                </option>
                              );
                            })}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
                        </div>
                        {selectedTargetUser && (() => {
                          const currentTasks = tasksByUser.get(selectedTargetUser.id) || [];
                          const currentLoad = quickWorkloadScore(currentTasks);
                          const parsedProjectedHours = targetEstimatedHours.trim()
                            ? Math.max(0, parseFloat(targetEstimatedHours))
                            : undefined;
                          const projectedEstimatedHours =
                            parsedProjectedHours !== undefined && Number.isFinite(parsedProjectedHours)
                              ? parsedProjectedHours
                              : undefined;
                          const simulatedSubtask: Task = {
                            ...task,
                            id: '__projected_subtask__',
                            userId: selectedTargetUser.id,
                            assigneeIds: [selectedTargetUser.id],
                            status: targetStatus,
                            dueDate: targetDueDate.trim() || undefined,
                            startDate: formatLocalDateKey(),
                            cognitiveLoad: targetCognitiveLoad,
                            estimatedHours: projectedEstimatedHours,
                          };
                          const projectedTasks = [...currentTasks, simulatedSubtask];
                          const projectedLoad = quickWorkloadScore(projectedTasks);
                          const dailyHours = getUserDailyAssignedHours(selectedTargetUser, currentTasks);
                          const projectedDailyHours = getUserDailyAssignedHours(selectedTargetUser, projectedTasks);
                          const dailyHoursChanged = Math.abs(projectedDailyHours - dailyHours) >= 0.05;
                          const willOverload = projectedLoad >= 12;
                          return (
                            <div
                              className={`flex flex-wrap items-center justify-between gap-2 text-xs px-3 py-1.5 rounded-[7px] border tabular-nums ${
                                willOverload
                                  ? 'border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--text-primary)]'
                                  : 'border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)]'
                              }`}
                            >
                              <span>Selected: <strong className="text-[var(--text-primary)]">{selectedTargetUser.name}</strong></span>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={willOverload ? 'font-semibold text-red-600 dark:text-red-400' : ''}>
                                  Load:{' '}
                                  <strong>
                                    {projectedLoad !== currentLoad ? `${currentLoad} → ${projectedLoad}` : currentLoad} / 12 pts
                                  </strong>
                                  {willOverload && ' · Will overload'}
                                </span>
                                <span aria-hidden="true" className="hidden sm:inline text-[var(--text-muted)]">·</span>
                                <span>
                                  Assigned:{' '}
                                  <strong className="text-[#1d4ed8] dark:text-blue-400">
                                    {dailyHoursChanged
                                      ? `${formatHours(dailyHours)} → ${formatHours(projectedDailyHours)}`
                                      : formatHours(dailyHours)}
                                    /day
                                  </strong>
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    ) : (
                      <div className="callout callout-warning flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>No eligible members on this board. Please pick a different destination board.</span>
                      </div>
                    )}
                  </div>

                  {/* Step 3: Subtask Title */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="field-label !mb-0 flex items-center gap-1.5" htmlFor="duplicatetaskmodal-field-3">
                        <GitFork className="h-3 w-3 text-[#1d4ed8] dark:text-blue-400" />
                        <span>Subtask Title</span>
                      </label>
                      {subtaskTitle !== task.title && (
                        <button
                          type="button"
                          onClick={() => setSubtaskTitle(task.title)}
                          className="text-[11px] font-medium text-[#1d4ed8] dark:text-blue-400 hover:underline cursor-pointer"
                          style={{ minHeight: 'auto' }}
                        >
                          Reset to parent title
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={subtaskTitle}
                      onChange={e => setSubtaskTitle(e.target.value)}
                      placeholder={task.title}
                      disabled={isSubmitting || feedback?.type === 'success'}
                      className="field-control"
                      required
                      id="duplicatetaskmodal-field-3"
                    />
                  </div>

                  {/* Step 4: Deadline & Time Estimate */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="field-label !mb-0" htmlFor="duplicatetaskmodal-field-5">
                          Deadline {targetStatus !== 'pipeline' && targetStatus !== 'retainer' && <span className="text-red-600 dark:text-red-400">*</span>}
                        </label>
                        {targetDueDate && (
                          <span className="text-[11px] tabular-nums text-[#1d4ed8] dark:text-blue-400 font-semibold">
                            {formatDateOnly(targetDueDate)}
                          </span>
                        )}
                      </div>
                      <input
                        type="date"
                        required={targetStatus !== 'pipeline' && targetStatus !== 'retainer'}
                        value={targetDueDate}
                        onChange={e => setTargetDueDate(e.target.value)}
                        disabled={isSubmitting || feedback?.type === 'success'}
                        className={`field-control tabular-nums cursor-pointer ${
                          targetStatus !== 'pipeline' && targetStatus !== 'retainer' && !targetDueDate.trim()
                            ? '!border-amber-600/60 dark:!border-amber-400/50'
                            : ''
                        }`}
                        id="duplicatetaskmodal-field-5"
                      />
                      {targetStatus !== 'pipeline' && targetStatus !== 'retainer' && !targetDueDate.trim() && (
                        <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                          A deadline is required before scheduling into an active lane.
                        </p>
                      )}
                      <DateQuickPresets
                        value={targetDueDate}
                        onSelectDate={setTargetDueDate}
                        originalDate={task.dueDate || undefined}
                        disabled={isSubmitting || feedback?.type === 'success'}
                        compact
                        className="mt-1.5"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <label className="field-label !mb-0 flex items-center gap-1.5" htmlFor="duplicatetaskmodal-estimated-hours">
                          <Timer className="h-3 w-3 text-[#1d4ed8] dark:text-blue-400" />
                          <span>Time Estimate</span>
                        </label>
                        <span className="text-[11px] text-[var(--text-muted)]">Split across days</span>
                      </div>
                      <div className="relative">
                        <input
                          id="duplicatetaskmodal-estimated-hours"
                          type="number"
                          step="0.5"
                          min="0"
                          max="1000"
                          value={targetEstimatedHours}
                          onChange={e => setTargetEstimatedHours(e.target.value)}
                          disabled={isSubmitting || feedback?.type === 'success'}
                          placeholder="e.g. 4.0"
                          className="field-control pr-10 tabular-nums"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-[var(--text-muted)]">
                          hrs
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Progressive disclosure for Initial Status & Priority */}
                  <div className="pt-1">
                    <button
                      type="button"
                      aria-expanded={showMoreOptions}
                      onClick={() => setShowMoreOptions(prev => !prev)}
                      className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#1d4ed8] dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      <ChevronDown className={`h-3 w-3 transition-transform ${showMoreOptions ? 'rotate-180' : ''}`} />
                      <span>{showMoreOptions ? 'Hide extra options' : 'More options (Status & Priority)'}</span>
                    </button>

                    {showMoreOptions && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2.5">
                        <div>
                          <label className="field-label" htmlFor="duplicatetaskmodal-field-4">
                            Initial Status
                          </label>
                          <div className="relative">
                            <select
                              value={targetStatus}
                              onChange={e => setTargetStatus(e.target.value as TaskStatus)}
                              disabled={isSubmitting || feedback?.type === 'success'}
                              className="field-control pr-8 cursor-pointer"
                              id="duplicatetaskmodal-field-4"
                            >
                              {(task.status === 'done' || task.status === 'archived') && (
                                <option value={task.status}>{formatTaskStatus(task.status)} (Original)</option>
                              )}
                              {(['pipeline', 'todo', 'in_progress', 'in_review'] as TaskStatus[]).map(s => (
                                <option key={s} value={s}>
                                  {formatTaskStatus(s)}{task.status === s ? ' (Original)' : ''}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
                          </div>
                        </div>

                        <PrioritySelector
                          value={targetPriority}
                          onChange={setTargetPriority}
                          labelId="duplicatetaskmodal-priority-label"
                          disabled={isSubmitting || feedback?.type === 'success'}
                        />
                      </div>
                    )}
                  </div>

                  {/* Step 6: Subtask Cognitive Load */}
                  <CognitiveLoadSelector
                    value={targetCognitiveLoad}
                    onChange={setTargetCognitiveLoad}
                    role={selectedTargetUser?.role ?? task.team}
                    disabled={isSubmitting || feedback?.type === 'success'}
                  />
                </div>

                {/* Feedback Message */}
                {feedback && (
                  <div
                    role="status"
                    className={`callout flex items-start gap-2 ${
                      feedback.type === 'success' ? 'callout-success' : 'callout-danger'
                    }`}
                  >
                    {feedback.type === 'success' ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 space-y-1">
                      <p className="font-semibold">{feedback.message}</p>
                      {feedback.warning && (
                        <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                          Notice: {feedback.warning}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="dialog-footer !justify-between">
                <div>
                  {feedback?.type === 'success' && feedback.targetBoardId && (
                    <button
                      type="button"
                      onClick={handleSwitchToDestinationBoard}
                      className="button-emerald"
                    >
                      <span>Switch to {feedback.targetBoardName || 'Team'}</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={feedback?.type === 'success' ? onClose : requestClose}
                    className="button-secondary"
                  >
                    {feedback?.type === 'success' ? 'Close' : 'Cancel'}
                  </button>

                  {feedback?.type !== 'success' && (
                    <button
                      type="submit"
                      disabled={isSubmitting || !selectedUserId || (targetStatus !== 'pipeline' && !targetDueDate.trim())}
                      className="button-primary"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Creating...</span>
                        </>
                      ) : (
                        <>
                          <CopyPlus className="h-3.5 w-3.5" />
                          <span>Create Subtask</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </DialogPanel>
      </motion.div>
      )}
    </AnimatePresence>
  );
};

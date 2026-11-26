import { DialogPanel } from './ui/DialogPanel';
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useBoardUi, useWorkspace } from '../context/DashboardContext';
import { Task, TaskStatus, User } from '../types';
import { formatDateOnly, formatTaskStatus, getUserTag } from '../utils/workload';
import { DateQuickPresets } from './ui/DateQuickPresets';
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
    creativeDirectors,
    duplicateTaskToBoard,
  } = useWorkspace();

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

  // Destination Boards list
  const availableBoards = useMemo(() => {
    const list: Array<{ id: string; name: string; memberCount: number }> = [];

    for (const cd of creativeDirectors) {
      const count = users.filter(u => u.id === cd.id || u.creativeDirectorId === cd.id).length;
      list.push({
        id: cd.id,
        name: `${cd.name}'s Team`,
        memberCount: count,
      });
    }

    const independentCount = users.filter(u => !u.creativeDirectorId && !u.isCreativeDirector).length;
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
      memberCount: users.length,
    });

    return list;
  }, [creativeDirectors, users]);

  // Selection states
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [subtaskTitle, setSubtaskTitle] = useState<string>('');
  const [targetStatus, setTargetStatus] = useState<TaskStatus>('todo');
  const [targetDueDate, setTargetDueDate] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    warning?: string;
    targetBoardId?: string;
    targetBoardName?: string;
  } | null>(null);

  // Initialize board and form when task changes or modal opens
  useEffect(() => {
    if (!isOpen || !task) {
      setFeedback(null);
      setIsSubmitting(false);
      return;
    }

    const preselectedUser = initialTargetUserId
      ? users.find(u => u.id === initialTargetUserId) || null
      : null;

    if (preselectedUser) {
      const targetBoardId = preselectedUser.isCreativeDirector
        ? preselectedUser.id
        : preselectedUser.creativeDirectorId
        ? preselectedUser.creativeDirectorId
        : availableBoards.some(b => b.id === 'independent')
        ? 'independent'
        : 'all';
      setSelectedBoardId(targetBoardId);
      setSelectedUserId(preselectedUser.id);
    } else {
      // Default to a different board than source user's board
      const currentBoardId = sourceBoard?.id || '';
      const otherBoard = availableBoards.find(b => b.id !== currentBoardId && b.id !== 'all');
      const defaultBoardId = otherBoard ? otherBoard.id : (availableBoards[0]?.id || 'all');
      setSelectedBoardId(defaultBoardId);
      setSelectedUserId('');
    }

    setSubtaskTitle(task.title);
    const resolvedStatus =
      initialTargetStatus && initialTargetStatus !== 'retainer' && initialTargetStatus !== 'pipeline'
        ? initialTargetStatus
        : task.status === 'retainer' || task.status === 'pipeline'
        ? 'todo'
        : task.status;
    setTargetStatus(resolvedStatus);
    setTargetDueDate(task.dueDate || '');
    setFeedback(null);
  }, [isOpen, task, sourceBoard, availableBoards, initialTargetUserId, initialTargetStatus, users]);

  // Compute members belonging to the selected board
  const availableUsers = useMemo(() => {
    if (!task) return [];
    let boardUsers: User[] = [];

    if (selectedBoardId === 'all') {
      boardUsers = users;
    } else if (selectedBoardId === 'independent') {
      boardUsers = users.filter(u => !u.creativeDirectorId && !u.isCreativeDirector);
    } else {
      boardUsers = users.filter(u => u.id === selectedBoardId || u.creativeDirectorId === selectedBoardId);
    }

    // Return all eligible members on the board
    return boardUsers;
  }, [users, selectedBoardId, task]);

  // Synchronize selected user when available users list changes
  useEffect(() => {
    if (availableUsers.length > 0) {
      if (!availableUsers.some(u => u.id === selectedUserId)) {
        setSelectedUserId(availableUsers[0].id);
      }
    } else {
      setSelectedUserId('');
    }
  }, [availableUsers, selectedUserId]);

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
      const res = await duplicateTaskToBoard({
        taskId: task.id,
        targetUserId: selectedUserId,
        title: subtaskTitle.trim() || undefined,
        targetStatus,
        targetDueDate: targetDueDate.trim() || undefined,
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
            if (e.target === e.currentTarget && !isSubmitting) {
              onClose();
            }
          }}
        >
          <DialogPanel aria-label="Duplicate task" onClose={onClose} busy={isSubmitting}
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
                <h3 className="text-sm font-bold tracking-tight text-[var(--text-primary)]">
                  Create and Assign Subtask
                </h3>
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

            {/* Form */}
            <form onSubmit={handleDuplicate} className="flex flex-col flex-1 min-h-0">
              <div className="p-5 overflow-y-auto flex-1 space-y-4">
                {/* Source Parent Task Summary */}
                <div className="rounded-[7px] border border-[var(--border)] bg-[var(--surface-muted)] divide-y divide-[var(--border-subtle)]">
                  <div className="flex items-start justify-between gap-2 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                        Parent Task
                      </span>
                      <h4 className="text-xs font-semibold text-[var(--text-primary)] mt-0.5 truncate">
                        {task.title}
                      </h4>
                    </div>
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
                  {/* Step 1: Destination Board */}
                  <div>
                    <label className="field-label flex items-center gap-1.5" htmlFor="duplicatetaskmodal-field-1">
                      <Layers className="h-3 w-3 text-[#1d4ed8] dark:text-blue-400" />
                      <span>1. Destination Board (Team)</span>
                    </label>
                    <div className="relative">
                      <select
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

                  {/* Step 2: Destination Assignee on that Board */}
                  <div>
                    <label className="field-label flex items-center gap-1.5" htmlFor="duplicatetaskmodal-field-2">
                      <UserCheck className="h-3 w-3 text-[#1d4ed8] dark:text-blue-400" />
                      <span>2. Subtask Owner</span>
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
                            {availableUsers.map(u => (
                              <option key={u.id} value={u.id}>
                                {u.name} ({getUserTag(u).label}) — {u.email}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
                        </div>
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
                        <span>3. Subtask Title</span>
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

                  {/* Step 4: Workflow Initial Status & Due Date */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                          {task.status !== 'retainer' && (
                            <option value={task.status}>Keep Original ({formatTaskStatus(task.status)})</option>
                          )}
                          <option value="pipeline">Pipeline</option>
                          <option value="todo">To Do</option>
                          <option value="in_progress">In Progress</option>
                          <option value="in_review">In Review</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="field-label !mb-0" htmlFor="duplicatetaskmodal-field-5">
                          Deadline
                        </label>
                        {targetDueDate && (
                          <span className="text-[11px] tabular-nums text-[#1d4ed8] dark:text-blue-400 font-semibold">
                            {formatDateOnly(targetDueDate)}
                          </span>
                        )}
                      </div>
                      <input
                        type="date"
                        value={targetDueDate}
                        onChange={e => setTargetDueDate(e.target.value)}
                        disabled={isSubmitting || feedback?.type === 'success'}
                        className="field-control tabular-nums cursor-pointer"
                        id="duplicatetaskmodal-field-5"
                      />
                      <DateQuickPresets
                        value={targetDueDate}
                        onSelectDate={setTargetDueDate}
                        originalDate={task.dueDate || undefined}
                        disabled={isSubmitting || feedback?.type === 'success'}
                        className="mt-1.5"
                      />
                    </div>
                  </div>
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
                    onClick={onClose}
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

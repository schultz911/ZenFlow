import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useDashboard } from '../context/DashboardContext';
import { Task, TaskStatus, User } from '../types';
import { formatDateOnly, getLastDayOfMonth } from '../utils/workload';
import {
  X,
  CopyPlus,
  CheckCircle2,
  Layers,
  Loader2,
  AlertCircle,
  ExternalLink,
  ArrowRight,
  Shield,
  UserCheck,
  GitFork,
} from 'lucide-react';

interface DuplicateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  onDuplicated?: (newTask: Task, targetUser: User) => void;
}

export const DuplicateTaskModal: React.FC<DuplicateTaskModalProps> = ({
  isOpen,
  onClose,
  task,
  onDuplicated,
}) => {
  const {
    users,
    creativeDirectors,
    duplicateTaskToBoard,
    setActiveBoardId,
  } = useDashboard();

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
    clickupSubtaskCreated?: boolean;
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

    // Default to a different board than source user's board
    const currentBoardId = sourceBoard?.id || '';
    const otherBoard = availableBoards.find(b => b.id !== currentBoardId && b.id !== 'all');
    const defaultBoardId = otherBoard ? otherBoard.id : (availableBoards[0]?.id || 'all');

    setSelectedBoardId(defaultBoardId);
    setSubtaskTitle(task.title);
    setTargetStatus(task.status === 'retainer' || task.status === 'pipeline' ? 'todo' : task.status);
    setTargetDueDate(task.dueDate || '');
    setFeedback(null);
  }, [isOpen, task, sourceBoard, availableBoards]);

  // Compute members belonging to the selected board (excluding current task owner)
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

  // Quick preset deadline helpers
  const handleSetQuickDeadline = useCallback((daysAhead: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setTargetDueDate(`${yyyy}-${mm}-${dd}`);
  }, []);

  const handleSetEndOfMonth = useCallback(() => {
    setTargetDueDate(getLastDayOfMonth());
  }, []);

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
        clickupSubtaskCreated: res.clickupSubtaskCreated,
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

  // Escape key dismissal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  return (
    <AnimatePresence>
      {isOpen && task && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs overflow-y-auto"
          onClick={e => {
            if (e.target === e.currentTarget && !isSubmitting) {
              onClose();
            }
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-xl rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#141414] shadow-2xl p-6 relative overflow-hidden"
          >
          {/* Header */}
          <div className="flex items-start justify-between pb-4 border-b border-neutral-100 dark:border-white/5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 shadow-2xs">
                <CopyPlus className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                  <span>Create and Assign Subtask</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-500/20 px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                    <Shield className="h-2.5 w-2.5" />
                    CD & Superadmin
                  </span>
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Creates an independent subtask under this task on the recipient&apos;s board.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleDuplicate} className="space-y-4 pt-4">

            {/* Source Parent Task Summary Card */}
            <div className="rounded-xl border border-neutral-200/80 dark:border-white/10 bg-neutral-50 dark:bg-[#1A1A1A] p-3.5 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-white/40">
                    Parent Task
                  </span>
                  <h4 className="text-xs font-bold text-neutral-900 dark:text-white mt-0.5 line-clamp-1">
                    {task.title}
                  </h4>
                </div>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border ${task.cognitiveLoad === 'high'
                      ? 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/20'
                      : task.cognitiveLoad === 'medium'
                        ? 'bg-yellow-50 dark:bg-yellow-950/30 text-yellow-600 dark:text-yellow-400 border-yellow-200 dark:border-yellow-500/20'
                        : 'bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400 border-green-200 dark:border-green-500/20'
                    }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${task.cognitiveLoad === 'high'
                        ? 'bg-red-500'
                        : task.cognitiveLoad === 'medium'
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                      }`}
                  />
                  <span className="capitalize">{task.cognitiveLoad} load</span>
                </span>
              </div>

              {/* Source Owner & Board metadata */}
              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-neutral-200/50 dark:border-white/5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-neutral-400 dark:text-white/40 shrink-0">Parent Owner:</span>
                  <span className="font-semibold text-neutral-800 dark:text-white truncate">
                    {sourceUser?.name || 'Unassigned'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-neutral-400 dark:text-white/40 shrink-0">Parent Board:</span>
                  <span className="font-semibold text-neutral-800 dark:text-white truncate">
                    {sourceBoard ? `${sourceBoard.name}'s Team` : 'Direct / Independent'}
                  </span>
                </div>
              </div>

              {/* ClickUp Linkage Pill */}
              <div className="pt-1 border-t border-neutral-200/50 dark:border-white/5">
                {task.clickupTaskId ? (
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400 font-medium truncate">
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      <span className="truncate">Parent ClickUp Task #{task.clickupTaskId}</span>
                      {task.clickupListName && (
                        <span className="text-neutral-400 dark:text-white/40 text-[10px] shrink-0">
                          ({task.clickupFolderName ? `${task.clickupFolderName} / ` : ''}{task.clickupListName})
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold bg-purple-50 dark:bg-purple-950/30 px-1.5 py-0.5 rounded border border-purple-200 dark:border-purple-500/20 shrink-0">
                      Creates ClickUp Subtask
                    </span>
                  </div>
                ) : (
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-neutral-400" />
                    <span>Parent task is local to ZenFlow. Subtask will be created on ZenFlow board.</span>
                  </p>
                )}
              </div>
            </div>

            {/* Selection Steps */}
            <div className="space-y-3.5">
              {/* Step 1: Destination Board */}
              <div>
                <label className="block text-xs font-semibold text-neutral-900 dark:text-white mb-1.5 flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-blue-500" />
                  <span>1. Select Destination Board (Team)</span>
                </label>
                <select
                  value={selectedBoardId}
                  onChange={e => setSelectedBoardId(e.target.value)}
                  disabled={isSubmitting || feedback?.type === 'success'}
                  className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#1A1A1A] px-3 py-2 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none transition-colors cursor-pointer disabled:opacity-50"
                >
                  {availableBoards.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.memberCount} member{b.memberCount !== 1 ? 's' : ''})
                    </option>
                  ))}
                </select>
              </div>

              {/* Step 2: Destination Assignee on that Board */}
              <div>
                <label className="block text-xs font-semibold text-neutral-900 dark:text-white mb-1.5 flex items-center gap-1.5">
                  <UserCheck className="h-3.5 w-3.5 text-blue-500" />
                  <span>2. Select Subtask Owner on Destination Board</span>
                </label>
                {availableUsers.length > 0 ? (
                  <div className="space-y-1.5">
                    <select
                      value={selectedUserId}
                      onChange={e => setSelectedUserId(e.target.value)}
                      disabled={isSubmitting || feedback?.type === 'success'}
                      className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#1A1A1A] px-3 py-2 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {availableUsers.map(u => {
                        const hasClickup = Boolean(u.clickupUserId);
                        return (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.role.toUpperCase()}) — {u.email}{' '}
                            {hasClickup ? '✓ ClickUp Mapped' : '· ClickUp auto-match by email'}
                          </option>
                        );
                      })}
                    </select>

                    {/* Selected user preview pill */}
                    {selectedTargetUser && (
                      <div className="flex items-center justify-between rounded-lg bg-neutral-100 dark:bg-white/5 px-2.5 py-1.5 text-[11px] border border-neutral-200/60 dark:border-white/5">
                        <div className="flex items-center gap-2">
                          <div
                            className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-white bg-gradient-to-br ${selectedTargetUser.avatarColor || 'from-blue-600 to-indigo-600'
                              }`}
                          >
                            {selectedTargetUser.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-neutral-800 dark:text-neutral-200">
                            {selectedTargetUser.name}
                          </span>
                          <span className="rounded bg-neutral-200 dark:bg-white/10 px-1 py-0.2 text-[9px] uppercase font-semibold text-neutral-600 dark:text-neutral-300">
                            {selectedTargetUser.role}
                          </span>
                        </div>
                        {selectedTargetUser.clickupUserId ? (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            ClickUp ID: {selectedTargetUser.clickupUserId}
                          </span>
                        ) : (
                          <span className="text-[10px] text-blue-600 dark:text-blue-400 flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                            Match via {selectedTargetUser.email}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-50/30 dark:bg-amber-950/20 p-3 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>No eligible members on this board. Please pick a different destination board.</span>
                  </div>
                )}
              </div>

              {/* Step 3: Subtask Title */}
              <div>
                <label className="block text-xs font-semibold text-neutral-900 dark:text-white mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <GitFork className="h-3.5 w-3.5 text-blue-500" />
                    <span>3. Subtask Title</span>
                  </span>
                  {subtaskTitle !== task.title && (
                    <button
                      type="button"
                      onClick={() => setSubtaskTitle(task.title)}
                      className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      Reset to parent title
                    </button>
                  )}
                </label>
                <input
                  type="text"
                  value={subtaskTitle}
                  onChange={e => setSubtaskTitle(e.target.value)}
                  placeholder={task.title}
                  disabled={isSubmitting || feedback?.type === 'success'}
                  className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#1A1A1A] px-3 py-2 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none transition-colors disabled:opacity-50"
                  required
                />
              </div>

              {/* Step 4: Workflow Initial Status & Due Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-neutral-900 dark:text-white mb-1.5">
                    Initial Status on Board
                  </label>
                  <select
                    value={targetStatus}
                    onChange={e => setTargetStatus(e.target.value as TaskStatus)}
                    disabled={isSubmitting || feedback?.type === 'success'}
                    className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#1A1A1A] px-3 py-2 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none transition-colors cursor-pointer capitalize disabled:opacity-50"
                  >
                    {task.status !== 'retainer' && (
                      <option value={task.status}>Keep Original ({task.status.replace('_', ' ')})</option>
                    )}
                    <option value="pipeline">Pipeline</option>
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="in_review">In Review</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-900 dark:text-white mb-1.5 flex items-center justify-between">
                    <span>Deadline</span>
                    {targetDueDate && (
                      <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">
                        {formatDateOnly(targetDueDate)}
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      value={targetDueDate}
                      onChange={e => setTargetDueDate(e.target.value)}
                      disabled={isSubmitting || feedback?.type === 'success'}
                      className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#1A1A1A] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none transition-colors cursor-pointer disabled:opacity-50"
                    />
                  </div>
                  {/* Quick Preset Buttons */}
                  <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setTargetDueDate(task.dueDate || '')}
                      disabled={isSubmitting || feedback?.type === 'success'}
                      className="rounded px-1.5 py-0.5 text-[9px] font-medium bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
                    >
                      Original
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetQuickDeadline(1)}
                      disabled={isSubmitting || feedback?.type === 'success'}
                      className="rounded px-1.5 py-0.5 text-[9px] font-medium bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
                    >
                      +1d
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetQuickDeadline(3)}
                      disabled={isSubmitting || feedback?.type === 'success'}
                      className="rounded px-1.5 py-0.5 text-[9px] font-medium bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
                    >
                      +3d
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetQuickDeadline(7)}
                      disabled={isSubmitting || feedback?.type === 'success'}
                      className="rounded px-1.5 py-0.5 text-[9px] font-medium bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
                    >
                      +1w
                    </button>
                    <button
                      type="button"
                      onClick={handleSetEndOfMonth}
                      disabled={isSubmitting || feedback?.type === 'success'}
                      className="rounded px-1.5 py-0.5 text-[9px] font-medium bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
                    >
                      EOM
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Feedback Message */}
            {feedback && (
              <div
                className={`rounded-xl p-3 text-xs border ${feedback.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                    : 'bg-red-50 dark:bg-red-950/20 border-red-500/20 text-red-700 dark:text-red-300'
                  }`}
              >
                <div className="flex items-start gap-2">
                  {feedback.type === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                  )}
                  <div className="flex-1 space-y-1">
                    <p className="font-semibold">{feedback.message}</p>
                    {feedback.clickupSubtaskCreated && (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                        ✓ Dedicated subtask created under parent #{task.clickupTaskId} on ClickUp and assigned to {selectedTargetUser?.name}.
                      </p>
                    )}
                    {feedback.warning && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                        Notice: {feedback.warning}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between gap-2 pt-3 border-t border-neutral-100 dark:border-white/5">
              <div>
                {feedback?.type === 'success' && feedback.targetBoardId && (
                  <button
                    type="button"
                    onClick={handleSwitchToDestinationBoard}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  >
                    <span>Switch to {feedback.targetBoardName || 'Team'}</span>
                    <ArrowRight className="h-3 w-3" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-[#141414] px-4 py-2 text-xs font-medium text-neutral-600 dark:text-white/60 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-white/5 transition-colors cursor-pointer"
                >
                  {feedback?.type === 'success' ? 'Close' : 'Cancel'}
                </button>

                {feedback?.type !== 'success' && (
                  <button
                    type="submit"
                    disabled={isSubmitting || !selectedUserId || (targetStatus !== 'pipeline' && !targetDueDate.trim())}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white px-4 py-2 text-xs font-semibold shadow-md shadow-blue-900/20 transition-all cursor-pointer disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Creating...</span>
                      </>
                    ) : (
                      <>
                        <CopyPlus className="h-3.5 w-3.5" />
                        <span>Create</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </form>
        </motion.div>
      </motion.div>
      )}
    </AnimatePresence>
  );
};

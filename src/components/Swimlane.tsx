import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User, Task, TaskStatus, DragTaskInfo, CognitiveLoad } from '../types';
import { calculateUserWorkload, compareTasksByDeadline } from '../utils/workload';
import { TaskCard } from './TaskCard';
import { PipelineSwimlane } from './PipelineSwimlane';
import { DeadlineDemandModal } from './DeadlineDemandModal';
import { WipLimitModal } from './WipLimitModal';
import {
  Plus,
  Circle,
  Clock,
  CheckCircle2,
  HelpCircle,
  Archive,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Activity,
  UserCheck,
  ArrowDownToLine,
  Trash2,
  ArrowUp,
  ArrowDown,
  Calendar,
} from 'lucide-react';

interface SwimlaneProps {
  user: User;
  tasks: Task[];
  activeDragInfo?: DragTaskInfo | null;
  onDragTaskStart?: (task: Task) => void;
  onDragTaskEnd?: () => void;
  onAddTask: (userId: string, status?: TaskStatus) => void;
  onQuickAddTask?: (
    userId: string,
    title: string,
    status: TaskStatus,
    cognitiveLoad: 'low' | 'medium' | 'high',
    dueDate?: string
  ) => Promise<void>;
  onEditTask: (task: Task) => void;
  onRescheduleTask?: (taskId: string, newDueDate: string | undefined) => void;
  onAdjustBillableHours?: (task: Task) => void;
  onUpdateTaskTitle?: (taskId: string, newTitle: string) => void;
  onDeleteTask: (taskId: string) => void;
  onDeleteUser?: (user: User) => void;
  onMoveTask: (taskId: string, targetUserId: string, newStatus: TaskStatus, newIndex?: number, newDueDate?: string | null) => void;
  onOpenWorkloadModal: (user: User) => void;
  isCurrentUser: boolean;
  onMoveUserUp?: (userId: string) => void;
  onMoveUserDown?: (userId: string) => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}

interface ColumnConfig {
  status: TaskStatus;
  title: string;
  icon: React.ReactNode;
  headerColor: string;
  dotColor: string;
}

const COLUMNS: ColumnConfig[] = [
  {
    status: 'todo',
    title: 'To Do',
    icon: <Circle className="h-3 w-3 text-neutral-400 dark:text-white/40" />,
    headerColor: 'text-neutral-600 dark:text-white/50',
    dotColor: 'bg-neutral-400 dark:bg-white/40',
  },
  {
    status: 'in_progress',
    title: 'In Progress',
    icon: <Clock className="h-3 w-3 text-blue-600 dark:text-blue-400" />,
    headerColor: 'text-blue-600 dark:text-blue-400',
    dotColor: 'bg-blue-600 dark:bg-blue-400',
  },
  {
    status: 'in_review',
    title: 'In Review',
    icon: <Activity className="h-3 w-3 text-amber-600 dark:text-yellow-400" />,
    headerColor: 'text-amber-600 dark:text-yellow-400',
    dotColor: 'bg-amber-600 dark:bg-yellow-400',
  },
  {
    status: 'done',
    title: 'Done',
    icon: <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />,
    headerColor: 'text-green-600 dark:text-green-400',
    dotColor: 'bg-green-600 dark:bg-green-400',
  },
];

const SwimlaneComponent: React.FC<SwimlaneProps> = ({
  user,
  tasks,
  activeDragInfo,
  onDragTaskStart,
  onDragTaskEnd,
  onAddTask,
  onQuickAddTask,
  onEditTask,
  onRescheduleTask,
  onAdjustBillableHours,
  onUpdateTaskTitle,
  onDeleteTask,
  onDeleteUser,
  onMoveTask,
  onOpenWorkloadModal,
  isCurrentUser,
  onMoveUserUp,
  onMoveUserDown,
  canMoveUp,
  canMoveDown,
}) => {
  const [showArchived, setShowArchived] = useState(false);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [dragOverHeader, setDragOverHeader] = useState(false);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);

  // Collapsible Workspace State
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(`zenflow_collapse_${user.id}`) === 'true';
    } catch {
      return false;
    }
  });

  const toggleCollapse = useCallback(() => {
    setIsCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem(`zenflow_collapse_${user.id}`, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, [user.id]);

  // Deadline Demand Modal State
  const [demandModalTask, setDemandModalTask] = useState<Task | null>(null);
  const [demandModalTargetStatus, setDemandModalTargetStatus] = useState<TaskStatus | null>(null);
  const [demandModalTargetIndex, setDemandModalTargetIndex] = useState<number | undefined>(undefined);

  // In-Progress WIP Limit Modal State (Max 2 Tasks)
  const [showWipModal, setShowWipModal] = useState(false);

  // Inline Quick-Add state
  const [quickAddStatus, setQuickAddStatus] = useState<TaskStatus | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [quickAddLoad, setQuickAddLoad] = useState<'low' | 'medium' | 'high'>('medium');
  const [quickAddDueDate, setQuickAddDueDate] = useState<string>('');
  const [isSubmittingQuickAdd, setIsSubmittingQuickAdd] = useState(false);
  const quickAddCardRef = useRef<HTMLDivElement>(null);

  // Click outside to dismiss quick add in swimlane column
  useEffect(() => {
    if (!quickAddStatus) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;

      // If clicking inside the quick add card itself, keep it open
      if (quickAddCardRef.current && quickAddCardRef.current.contains(target)) {
        return;
      }

      // If clicking the column header toggle button for this active column, let the button's onClick handle it
      const el = target instanceof Element ? target : target.parentElement;
      if (el?.closest(`[data-quick-add-toggle="${quickAddStatus}"]`)) {
        return;
      }

      setQuickAddStatus(null);
      setQuickAddTitle('');
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [quickAddStatus]);

  const getPresetDateStr = useCallback((daysAhead: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const handleCommitQuickAdd = useCallback(async (status: TaskStatus) => {
    const trimmed = quickAddTitle.trim();
    const resolvedDueDate = quickAddDueDate || getPresetDateStr(1);
    if (!trimmed || !resolvedDueDate || isSubmittingQuickAdd) return;
    setIsSubmittingQuickAdd(true);
    try {
      if (onQuickAddTask) {
        await onQuickAddTask(user.id, trimmed, status, quickAddLoad, resolvedDueDate);
      }
      setQuickAddTitle('');
      setQuickAddDueDate(getPresetDateStr(1));
    } finally {
      setIsSubmittingQuickAdd(false);
    }
  }, [quickAddTitle, quickAddDueDate, getPresetDateStr, isSubmittingQuickAdd, onQuickAddTask, user.id, quickAddLoad]);

  const handleTaskDragStart = useCallback(
    (draggedTask: Task) => {
      onDragTaskStart?.(draggedTask);
    },
    [onDragTaskStart]
  );

  const handleTaskDragEnd = useCallback(() => {
    onDragTaskEnd?.();
  }, [onDragTaskEnd]);

  // Filter tasks belonging strictly to this user with strict key uniqueness
  const userTasks = useMemo(() => {
    const map = new Map<string, Task>();
    for (const t of tasks) {
      if (t && t.id && t.userId === user.id) {
        map.set(t.id, t);
      }
    }
    return Array.from(map.values());
  }, [tasks, user.id]);

  // Pre-index grouped columns in a single O(N) pass to avoid redundant filter+sort calls in the render loop
  const tasksByColumn = useMemo(() => {
    const grouped: Record<TaskStatus, Task[]> = {
      pipeline: [],
      todo: [],
      in_progress: [],
      in_review: [],
      done: [],
      archived: [],
    };
    for (const t of userTasks) {
      if (grouped[t.status]) {
        grouped[t.status].push(t);
      }
    }
    for (const status in grouped) {
      grouped[status as TaskStatus].sort((a, b) => compareTasksByDeadline(a, b, status));
    }
    return grouped;
  }, [userTasks]);

  const workload = useMemo(() => calculateUserWorkload(userTasks), [userTasks]);
  const archivedTasks = useMemo(() => tasksByColumn.archived, [tasksByColumn]);

  const isCrossUserDrag = Boolean(activeDragInfo && activeDragInfo.sourceUserId !== user.id);

  // Central move validator enforcing deadline demand and 2-task WIP limit
  const validateAndExecuteMove = useCallback(
    (taskId: string, targetStatus: TaskStatus, targetIndex?: number, fallbackTask?: Task) => {
      // Find the moving task in userTasks, tasks, activeDragInfo, or fallbackTask (cross-user drag)
      const task =
        tasks.find(t => t.id === taskId) ||
        userTasks.find(t => t.id === taskId) ||
        (activeDragInfo?.taskId === taskId ? activeDragInfo.task : undefined) ||
        fallbackTask;
      if (!task) return;

      // When moving any task to pipeline: clear its deadline immediately from its data
      if (targetStatus === 'pipeline') {
        onMoveTask(taskId, user.id, 'pipeline', targetIndex, null);
        return;
      }

      // Demand Deadline Check:
      // 1. Moving from in_review, done, or archived into todo or in_progress -> demand new deadline
      // 2. Moving from pipeline into active workflow -> demand new deadline
      // 3. Any move into active workflow if task has no deadline -> demand deadline
      const isTargetActive = ['todo', 'in_progress'].includes(targetStatus);
      const isFromReviewDoneArchived = ['in_review', 'done', 'archived'].includes(task.status);
      const isFromPipeline = task.status === 'pipeline';
      const hasNoDeadline = !task.dueDate || task.dueDate.trim() === '';
      const isActiveLane = ['todo', 'in_progress', 'in_review', 'done'].includes(targetStatus);

      const requiresDeadlinePrompt =
        (isFromReviewDoneArchived && isTargetActive) ||
        (isFromPipeline && isActiveLane) ||
        (isActiveLane && hasNoDeadline);

      if (requiresDeadlinePrompt) {
        setDemandModalTask(task);
        setDemandModalTargetStatus(targetStatus);
        setDemandModalTargetIndex(targetIndex);
        return;
      }

      // 2. WIP Limit Check (In Progress max 2):
      if (targetStatus === 'in_progress') {
        const otherInProgress = tasksByColumn.in_progress.filter(t => t.id !== taskId);
        if (otherInProgress.length >= 2) {
          setShowWipModal(true);
          return;
        }
      }

      // Otherwise valid: execute move
      onMoveTask(taskId, user.id, targetStatus, targetIndex);
    },
    [tasks, userTasks, activeDragInfo, tasksByColumn.in_progress, onMoveTask, user.id]
  );

  const handleConfirmDemandDeadline = useCallback(
    async (taskId: string, newDueDate: string) => {
      if (!demandModalTargetStatus) return;
      const targetStatus = demandModalTargetStatus;
      const targetIndex = demandModalTargetIndex;

      // Check WIP limit if target is in_progress
      if (targetStatus === 'in_progress') {
        const otherInProgress = tasksByColumn.in_progress.filter(t => t.id !== taskId);
        if (otherInProgress.length >= 2) {
          setDemandModalTask(null);
          setDemandModalTargetStatus(null);
          setDemandModalTargetIndex(undefined);
          setShowWipModal(true);
          return;
        }
      }

      // Perform atomic move with new deadline — eliminates race condition and enables instant rendering in To Do
      onMoveTask(taskId, user.id, targetStatus, targetIndex, newDueDate);

      setDemandModalTask(null);
      setDemandModalTargetStatus(null);
      setDemandModalTargetIndex(undefined);
    },
    [demandModalTargetStatus, demandModalTargetIndex, onMoveTask, tasksByColumn.in_progress, user.id]
  );

  const handleQuickAddPipeline = useCallback(
    async (targetUserId: string, title: string, cognitiveLoad: CognitiveLoad) => {
      if (onQuickAddTask) {
        await onQuickAddTask(targetUserId, title, 'pipeline', cognitiveLoad);
      }
    },
    [onQuickAddTask]
  );

  // Robust extraction of dragged task ID with JSON, text/plain, and Context fallbacks
  const extractDragData = (e: React.DragEvent) => {
    let taskId = '';
    let status: TaskStatus | undefined;
    let payloadTask: Task | undefined;

    // 1. Try application/json
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.taskId) taskId = parsed.taskId;
        if (parsed.status) status = parsed.status;
        if (parsed.taskId && parsed.title) {
          payloadTask = {
            id: parsed.taskId,
            userId: parsed.userId || user.id,
            title: parsed.title,
            status: parsed.status || 'todo',
            order: parsed.order ?? 0,
            cognitiveLoad: parsed.cognitiveLoad || 'medium',
            dueDate: parsed.dueDate,
            createdAt: parsed.createdAt || new Date().toISOString(),
            updatedAt: parsed.updatedAt || new Date().toISOString(),
          };
        }
      }
    } catch {
      // ignore
    }

    // 2. Try text/plain
    if (!taskId) {
      const plain = e.dataTransfer.getData('text/plain');
      if (plain) {
        taskId = plain.trim();
      }
    }

    // 3. Fallback to activeDragInfo from React Context
    if (!taskId && activeDragInfo) {
      taskId = activeDragInfo.taskId;
      status = activeDragInfo.sourceStatus;
    }

    const resolvedTask =
      tasks.find(t => t.id === taskId) ||
      userTasks.find(t => t.id === taskId) ||
      (activeDragInfo?.taskId === taskId ? activeDragInfo.task : undefined) ||
      payloadTask;

    return { taskId, status, task: resolvedTask };
  };

  const handleDragOverColumn = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumn !== status) {
      setDragOverColumn(status);
    }
  };

  const handleDragLeaveColumn = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverColumn(null);
    }
  };

  const handleHeaderDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (!dragOverHeader) {
      setDragOverHeader(true);
    }
  };

  const handleHeaderDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverHeader(false);
    }
  };

  const handleHeaderDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverHeader(false);
    setDragOverColumn(null);

    const { taskId, status, task } = extractDragData(e);
    if (!taskId) return;

    // Drop onto user header maintains original status (or default 'todo') and reassigns user
    const targetStatus = status || 'todo';
    validateAndExecuteMove(taskId, targetStatus, undefined, task);
  };

  const handleDropOnColumn = (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverColumn(null);
    setDragOverTaskId(null);

    const { taskId, task } = extractDragData(e);
    if (!taskId) return;

    // Assign to this user and move to target column status
    validateAndExecuteMove(taskId, targetStatus, undefined, task);
  };

  const handleDropOnTask = (e: React.DragEvent, targetTask: Task, targetStatus: TaskStatus) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverColumn(null);
    setDragOverTaskId(null);

    const { taskId, task } = extractDragData(e);
    if (!taskId || (taskId === targetTask.id && user.id === targetTask.userId)) return;

    // Calculate new index in this user's target status list using pre-indexed column tasks
    const tasksInTarget = (tasksByColumn[targetStatus] || []).filter(t => t.id !== taskId);
    const targetIdx = tasksInTarget.findIndex(t => t.id === targetTask.id);
    const newIndex = targetIdx !== -1 ? targetIdx : tasksInTarget.length;

    validateAndExecuteMove(taskId, targetStatus, newIndex, task);
  };

  const handleMoveStatus = useCallback(
    (taskId: string, newStatus: TaskStatus) => {
      validateAndExecuteMove(taskId, newStatus);
    },
    [validateAndExecuteMove]
  );

  return (
    <motion.div
      id={`swimlane-${user.id}`}
      layout="position"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`rounded-2xl border bg-white dark:bg-[#0D0D0D] shadow-sm dark:shadow-2xl transition-all ${
        dragOverHeader
          ? 'border-blue-500 ring-2 ring-blue-500/40 bg-blue-50/20 dark:bg-blue-950/10'
          : isCurrentUser
          ? 'border-blue-500/50 ring-1 ring-blue-500/20 shadow-blue-500/5'
          : 'border-neutral-200 dark:border-white/5'
      }`}
    >
      {/* Swimlane Header: User Info, Workload Score, Add Task, and User Drop Target */}
      <div
        onDragOver={handleHeaderDragOver}
        onDragLeave={handleHeaderDragLeave}
        onDrop={handleHeaderDrop}
        className={`relative flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-neutral-100 dark:border-white/5 p-4 sm:px-6 transition-colors rounded-t-2xl ${
          dragOverHeader
            ? 'bg-blue-50/80 dark:bg-blue-950/30'
            : ''
        }`}
      >
        {/* User Identity */}
        <div className="flex items-center gap-3.5">
          {/* User Workspace Reordering Buttons */}
            {(onMoveUserUp || onMoveUserDown) && (
              <div className="flex flex-col gap-0.5 border border-neutral-200/80 dark:border-white/10 rounded-lg p-0.5 bg-neutral-50 dark:bg-[#141414] shrink-0">
                <button
                  type="button"
                  disabled={!canMoveUp}
                  onClick={() => onMoveUserUp?.(user.id)}
                  title="Move workspace up"
                  className="p-1 rounded text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-white dark:hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <ArrowUp className="h-2.5 w-2.5" />
                </button>
                <button
                  type="button"
                  disabled={!canMoveDown}
                  onClick={() => onMoveUserDown?.(user.id)}
                  title="Move workspace down"
                  className="p-1 rounded text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-white dark:hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <ArrowDown className="h-2.5 w-2.5" />
                </button>
              </div>
            )}

            <div
              className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr ${
                user.avatarColor || 'from-blue-600 to-indigo-600'
              } text-white font-semibold text-sm border border-neutral-200 dark:border-white/10 shadow-sm`}
            >
              {user.name
                .split(' ')
                .map(p => p[0])
                .join('')
                .toUpperCase()
                .slice(0, 2)}
              {isCurrentUser && (
                <span
                  title="You are currently signed in as this user"
                  className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white dark:border-[#0D0D0D] bg-blue-500"
                />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold tracking-tight text-neutral-900 dark:text-white text-sm">
                  {user.name}
                </h3>
                {isCurrentUser && (
                  <span className="rounded-md bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    You
                  </span>
                )}
                <span className="rounded-full bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-neutral-500 dark:text-white/40">
                  {user.role === 'content' ? 'Content' : 'Design'}
                </span>

                {/* Collapsed Workspace Summary Pills */}
                {isCollapsed && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 px-2.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:text-white/60">
                    <span>{userTasks.length} tasks</span>
                    <span>·</span>
                    <span>{tasksByColumn.pipeline.length} pipeline</span>
                    <span>·</span>
                    <span className="font-semibold text-blue-600 dark:text-blue-400">{tasksByColumn.in_progress.length} active</span>
                  </span>
                )}

                {/* Cognitive Overload Alert Indicator */}
                {workload.level === 'overloaded' && (
                  <span
                    title="Cognitive capacity exceeded (>12 pts). Consider rebalancing tasks."
                    className="inline-flex items-center gap-1 rounded-full bg-red-500/10 border border-red-500/30 px-2 py-0.5 text-[10px] font-semibold text-red-500 dark:text-red-400 animate-pulse"
                  >
                    <Activity className="h-2.5 w-2.5" />
                    <span>Capacity Exceeded</span>
                  </span>
                )}

                {/* Cross-user drag indicator when dragging over header */}
                {isCrossUserDrag && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30 px-2 py-0.5 text-[10px] font-medium animate-pulse">
                    <UserCheck className="h-3 w-3" />
                    <span>Drop to reassign</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-500 dark:text-white/40 truncate max-w-xs mt-0.5">
                {user.email}
              </p>
            </div>
          </div>

          {/* Workload Score & Action Bar */}
          <div className="flex items-center gap-2.5 flex-wrap justify-between lg:justify-end">
            {/* Workload Score Pill (Interactive: opens formula breakdown) */}
            <button
              id={`workload-btn-${user.id}`}
              onClick={() => onOpenWorkloadModal(user)}
              title="Click to view workload breakdown"
              className={`flex items-center gap-2.5 rounded-xl border px-3 py-1.5 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer ${workload.badgeBg}`}
            >
              <div className="text-left">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-neutral-600 dark:text-white/40">
                    Workload Score
                  </span>
                  <HelpCircle className="h-3 w-3 text-neutral-400 dark:text-white/30" />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-base font-bold text-neutral-900 dark:text-white">
                    {workload.totalScore}
                  </span>
                  <span className={`text-[11px] font-semibold ${workload.badgeText}`}>
                    · {workload.levelLabel}
                  </span>
                </div>
              </div>

              {/* Micro capacity gauge */}
              <div className="h-1.5 w-12 rounded-full bg-neutral-200 dark:bg-white/10 overflow-hidden ml-1">
                <div
                  className={`h-full transition-all duration-300 ${
                    workload.level === 'overloaded'
                      ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                      : workload.level === 'heavy'
                      ? 'bg-yellow-500'
                      : workload.level === 'optimal'
                      ? 'bg-blue-500'
                      : 'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(100, (workload.totalScore / 14) * 100)}%` }}
                />
              </div>
            </button>

            {/* Add Task Button for this user */}
            <button
              id={`add-task-btn-${user.id}`}
              onClick={() => onAddTask(user.id, 'todo')}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-blue-900/20 transition-all cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Task</span>
            </button>

            {/* Delete User Button */}
            {onDeleteUser && (
              <button
                id={`delete-user-btn-${user.id}`}
                onClick={() => onDeleteUser(user)}
                title={`Delete ${user.name} and all associated tasks`}
                className="flex items-center justify-center rounded-xl p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 border border-neutral-200/60 dark:border-white/5 hover:border-red-500/20 transition-all cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}

            {/* Archived Toggle button if archived tasks exist */}
            {archivedTasks.length > 0 && (
              <button
                onClick={() => setShowArchived(prev => !prev)}
                className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-900 dark:text-white/50 dark:hover:text-white px-2.5 py-1.5 rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-[#141414] transition-colors cursor-pointer"
              >
                <Archive className="h-3.5 w-3.5" />
                <span>Archived ({archivedTasks.length})</span>
                {showArchived ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
            )}

            {/* Workspace Collapse / Expand Toggle Button */}
            <button
              id={`collapse-btn-${user.id}`}
              onClick={toggleCollapse}
              title={isCollapsed ? 'Expand workspace' : 'Collapse workspace'}
              className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900 dark:text-white/50 dark:hover:text-white p-2 rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-[#141414] hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
            >
              {isCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* Collapsible Workspace Body */}
        <AnimatePresence initial={false}>
          {!isCollapsed && (
            <motion.div
              key="workspace-body"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              {/* Horizontal Pipeline Swimlane at the top */}
              <PipelineSwimlane
                user={user}
                tasks={tasksByColumn.pipeline}
                onQuickAdd={handleQuickAddPipeline}
                onDragStart={handleTaskDragStart}
                onDragEnd={handleTaskDragEnd}
                onMoveTask={handleMoveStatus}
                onEditTask={onEditTask}
                onUpdateTitle={onUpdateTaskTitle}
                onDeleteTask={onDeleteTask}
              />

              {/* Sections sorted by status columns */}
              <div className="p-4 sm:p-6 overflow-x-auto">
                <div
                  className={`grid gap-4 min-w-[760px] ${
                    showArchived ? 'grid-cols-5' : 'grid-cols-4'
                  }`}
                >
                  {COLUMNS.map(col => {
                    const columnTasks = tasksByColumn[col.status] || [];
                    const isDropActive = dragOverColumn === col.status;

                    return (
                      <div
                        key={col.status}
                        onDragOver={e => handleDragOverColumn(e, col.status)}
                        onDragLeave={handleDragLeaveColumn}
                        onDrop={e => handleDropOnColumn(e, col.status)}
                        className={`flex flex-col rounded-xl border p-2.5 transition-all duration-200 min-h-[220px] ${
                          isDropActive
                            ? 'border-blue-500 bg-blue-50/70 dark:bg-[#1C1F2E] ring-2 ring-blue-500/30 shadow-md'
                            : 'border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-[#141414]'
                        }`}
                      >
                        {/* Status Column Header */}
                        <div className="flex items-center justify-between pb-2.5 mb-2 border-b border-neutral-200 dark:border-white/5 px-1">
                          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                            {col.icon}
                            <h4 className={`text-[11px] uppercase tracking-wider font-semibold truncate ${col.headerColor}`}>
                              {col.title}
                            </h4>
                            <span className="rounded-full px-1.5 py-0.2 text-[10px] border shrink-0 transition-colors bg-neutral-200 dark:bg-white/5 text-neutral-600 dark:text-white/40 border-neutral-300 dark:border-white/5">
                              {columnTasks.length}
                            </span>
                          </div>

                          <button
                            data-quick-add-toggle={col.status}
                            onClick={() => {
                              if (quickAddStatus === col.status) {
                                setQuickAddStatus(null);
                              } else {
                                setQuickAddStatus(col.status);
                                setQuickAddTitle('');
                                setQuickAddLoad('medium');
                                setQuickAddDueDate(getPresetDateStr(1));
                              }
                            }}
                            title={`Inline quick add to ${col.title}`}
                            className={`rounded-md p-1 transition-colors cursor-pointer shrink-0 ${
                              quickAddStatus === col.status
                                ? 'bg-blue-600 text-white shadow-xs'
                                : 'text-neutral-400 dark:text-white/30 hover:bg-neutral-200 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white'
                            }`}
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>

                        {/* Drop indicator banner when dragging from another user */}
                        {isDropActive && isCrossUserDrag && (
                          <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mb-2 rounded-lg p-2 text-center text-[10px] font-medium flex items-center justify-center gap-1.5 border bg-blue-600/10 border-blue-500/30 text-blue-600 dark:text-blue-400"
                          >
                            <ArrowDownToLine className="h-3 w-3" />
                            <span>
                              Assign to {user.name.split(' ')[0]} ({col.title})
                            </span>
                          </motion.div>
                        )}

                        {/* Tasks List (displays top 3 tasks comfortably, scrolls beyond 3 without expanding swimlane board) */}
                        <div className="flex-1 space-y-2.5 max-h-[385px] overflow-y-auto pt-1.5 pb-1.5 px-1 pr-1.5">
                          {/* Inline Quick-Add Card */}
                          {quickAddStatus === col.status && (
                            <motion.div
                              ref={quickAddCardRef}
                              initial={{ opacity: 0, y: -4, scale: 0.98 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: -4, scale: 0.98 }}
                              className="rounded-xl border border-blue-500/50 bg-white dark:bg-[#1C1C1C] p-2.5 shadow-md space-y-2 mb-2"
                            >
                              <input
                                type="text"
                                autoFocus
                                value={quickAddTitle}
                                onChange={e => setQuickAddTitle(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleCommitQuickAdd(col.status);
                                  } else if (e.key === 'Escape') {
                                    setQuickAddStatus(null);
                                  }
                                }}
                                placeholder="Task title... (Enter to save, Esc to cancel)"
                                className="w-full rounded-lg border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-[#121212] px-2.5 py-1.5 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-none"
                              />

                              {/* Quick Deadline Selector (Mandatory for main swimlanes) */}
                              <div className="flex items-center justify-between gap-1 text-[10px] pt-1.5 border-t border-neutral-100 dark:border-white/5">
                                <div className="flex items-center gap-1 text-neutral-500 dark:text-white/40 shrink-0">
                                  <Calendar className="h-3 w-3 text-amber-500 shrink-0" />
                                  <span className="font-semibold text-[10px] text-neutral-700 dark:text-white/70">Due *:</span>
                                </div>
                                <div className="flex items-center gap-1 flex-wrap justify-end">
                                  {([
                                    { label: 'Today', days: 0 },
                                    { label: 'Tomorrow', days: 1 },
                                    { label: '+3d', days: 3 },
                                    { label: '+7d', days: 7 },
                                  ]).map(preset => {
                                    const dateStr = getPresetDateStr(preset.days);
                                    const isSelected = quickAddDueDate === dateStr;
                                    return (
                                      <button
                                        key={preset.label}
                                        type="button"
                                        onClick={() => setQuickAddDueDate(dateStr)}
                                        className={`rounded px-1.5 py-0.5 text-[9px] font-medium border transition-colors cursor-pointer ${
                                          isSelected
                                            ? 'bg-blue-600 text-white border-blue-600 shadow-2xs font-semibold'
                                            : 'border-neutral-200 dark:border-white/10 text-neutral-600 dark:text-white/60 hover:bg-neutral-100 dark:hover:bg-white/5'
                                        }`}
                                      >
                                        {preset.label}
                                      </button>
                                    );
                                  })}
                                  <input
                                    type="date"
                                    value={quickAddDueDate}
                                    onChange={e => setQuickAddDueDate(e.target.value)}
                                    className="rounded border border-neutral-200 dark:border-white/10 bg-transparent px-1 py-0.5 text-[9px] text-neutral-800 dark:text-white/90 cursor-pointer focus:outline-none"
                                  />
                                </div>
                              </div>

                              <div className="flex items-center justify-between gap-1.5 pt-0.5">
                                <div className="flex items-center gap-1">
                                  {(['low', 'medium', 'high'] as const).map(load => (
                                    <button
                                      key={load}
                                      type="button"
                                      onClick={() => setQuickAddLoad(load)}
                                      className={`rounded px-1.5 py-0.5 text-[9px] font-medium border capitalize transition-all cursor-pointer ${
                                        quickAddLoad === load
                                          ? load === 'high'
                                            ? 'bg-red-500/15 border-red-500/40 text-red-500'
                                            : load === 'medium'
                                            ? 'bg-yellow-500/15 border-yellow-500/40 text-yellow-600 dark:text-yellow-400'
                                            : 'bg-green-500/15 border-green-500/40 text-green-600 dark:text-green-400'
                                          : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-white/40 dark:hover:text-white'
                                      }`}
                                    >
                                      {load}
                                    </button>
                                  ))}
                                </div>

                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setQuickAddStatus(null);
                                      onAddTask(user.id, col.status);
                                    }}
                                    title="Open full form with details & due date"
                                    className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                                  >
                                    Full form...
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!quickAddTitle.trim() || !quickAddDueDate || isSubmittingQuickAdd}
                                    onClick={() => handleCommitQuickAdd(col.status)}
                                    className="rounded-lg bg-blue-600 hover:bg-blue-500 px-2.5 py-1 text-[10px] font-semibold text-white shadow-xs transition-colors cursor-pointer disabled:opacity-40"
                                  >
                                    Add
                                  </button>
                                </div>
                              </div>
                            </motion.div>
                          )}

                          <AnimatePresence mode="popLayout">
                            {columnTasks.length === 0 && quickAddStatus !== col.status ? (
                              <motion.div
                                key="empty-dropzone"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => {
                                  setQuickAddStatus(col.status);
                                  setQuickAddTitle('');
                                  setQuickAddLoad('medium');
                                  setQuickAddDueDate(getPresetDateStr(1));
                                }}
                                className={`flex h-28 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-3 text-center transition-all ${
                                  isDropActive
                                    ? 'border-blue-500 bg-blue-100/50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 scale-[1.02]'
                                    : 'border-neutral-300 dark:border-white/10 text-neutral-400 dark:text-white/30 hover:border-neutral-400 dark:hover:border-white/20 hover:bg-neutral-100 dark:hover:bg-white/5'
                                }`}
                              >
                                <Plus className="h-4 w-4 mb-1 text-neutral-400 dark:text-white/30" />
                                <p className="text-[11px] font-medium text-neutral-600 dark:text-white/50">
                                  {isDropActive ? `Drop to assign to ${user.name.split(' ')[0]}` : 'No tasks'}
                                </p>
                                <p className="text-[10px] text-neutral-400 dark:text-white/30">
                                  {isDropActive ? `in ${col.title}` : 'Click for quick add or drop here'}
                                </p>
                              </motion.div>
                            ) : (
                              columnTasks.map(task => {
                                const isTaskDropTarget = dragOverTaskId === task.id;
                                return (
                                <motion.div
                                  key={task.id}
                                  layout="position"
                                  initial={{ opacity: 0, y: 6 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.95 }}
                                  transition={{ duration: 0.18, ease: 'easeOut' }}
                                  onDragOver={e => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (dragOverTaskId !== task.id) {
                                      setDragOverTaskId(task.id);
                                    }
                                  }}
                                  onDragLeave={e => {
                                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                      if (dragOverTaskId === task.id) setDragOverTaskId(null);
                                    }
                                  }}
                                  onDrop={e => handleDropOnTask(e, task, col.status)}
                                  className="relative"
                                >
                                  {/* Visual insertion line indicator */}
                                  {isTaskDropTarget && activeDragInfo && activeDragInfo.taskId !== task.id && (
                                    <motion.div
                                      layoutId="drop-indicator"
                                      className="absolute -top-1.5 left-0 right-0 h-1 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)] z-20 pointer-events-none"
                                    />
                                  )}
                                  <TaskCard
                                    task={task}
                                    userRole={user.role}
                                    onEdit={onEditTask}
                                    onUpdateTitle={onUpdateTaskTitle}
                                    onDelete={onDeleteTask}
                                    onMoveStatus={handleMoveStatus}
                                    onReschedule={onRescheduleTask}
                                    onAdjustBillableHours={onAdjustBillableHours}
                                    onDragStart={handleTaskDragStart}
                                    onDragEnd={handleTaskDragEnd}
                                  />
                                </motion.div>
                              );
                            })
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    );
                  })}

                  {/* Archived Column (conditional) */}
                  {showArchived && (
                    <div
                      onDragOver={e => handleDragOverColumn(e, 'archived')}
                      onDragLeave={handleDragLeaveColumn}
                      onDrop={e => handleDropOnColumn(e, 'archived')}
                      className={`flex flex-col rounded-xl border p-2.5 transition-all min-h-[220px] ${
                        dragOverColumn === 'archived'
                          ? 'border-blue-500 bg-blue-50/70 dark:bg-[#1C1F2E] ring-2 ring-blue-500/30'
                          : 'border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-[#141414]'
                      }`}
                    >
                      <div className="flex items-center justify-between pb-2.5 mb-2 border-b border-neutral-200 dark:border-white/5 px-1">
                        <div className="flex items-center gap-1.5 text-neutral-500 dark:text-white/40">
                          <Archive className="h-3 w-3" />
                          <h4 className="text-[11px] uppercase tracking-wider font-semibold text-neutral-500 dark:text-white/40">
                            Archived
                          </h4>
                          <span className="rounded-full bg-neutral-200 dark:bg-white/5 px-1.5 py-0.2 text-[10px] text-neutral-600 dark:text-white/40 border border-neutral-300 dark:border-white/5">
                            {archivedTasks.length}
                          </span>
                        </div>
                      </div>

                      {/* Archived Tasks List (aligned with 3-task max height) */}
                      <div className="flex-1 space-y-2.5 max-h-[385px] overflow-y-auto pt-1.5 pb-1.5 px-1 pr-1.5">
                        <AnimatePresence mode="popLayout">
                          {archivedTasks.length === 0 ? (
                            <motion.div
                              key="empty-archived"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="flex h-28 flex-col items-center justify-center rounded-lg border border-dashed border-neutral-300 dark:border-white/10 p-3 text-center text-[11px] text-neutral-400 dark:text-white/30"
                            >
                              <p>No archived tasks</p>
                            </motion.div>
                          ) : (
                            archivedTasks.map(task => (
                              <motion.div
                                key={task.id}
                                layout="position"
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.18, ease: 'easeOut' }}
                                className="relative"
                              >
                                <TaskCard
                                  task={task}
                                  userRole={user.role}
                                  onEdit={onEditTask}
                                  onUpdateTitle={onUpdateTaskTitle}
                                  onDelete={onDeleteTask}
                                  onMoveStatus={handleMoveStatus}
                                  onReschedule={onRescheduleTask}
                                  onAdjustBillableHours={onAdjustBillableHours}
                                  onDragStart={handleTaskDragStart}
                                  onDragEnd={handleTaskDragEnd}
                                />
                              </motion.div>
                            ))
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Deadline Demand Modal */}
        <DeadlineDemandModal
          isOpen={Boolean(demandModalTask)}
          task={demandModalTask}
          targetStatus={demandModalTargetStatus}
          targetUserName={user.name}
          onConfirm={handleConfirmDemandDeadline}
          onCancel={() => {
            setDemandModalTask(null);
            setDemandModalTargetStatus(null);
            setDemandModalTargetIndex(undefined);
          }}
        />

        {/* In-Progress WIP Limit Modal (Max 2 Tasks) */}
        <WipLimitModal
          isOpen={showWipModal}
          user={user}
          inProgressTasks={tasksByColumn.in_progress}
          onClose={() => setShowWipModal(false)}
          onMoveToTodo={taskId => onMoveTask(taskId, user.id, 'todo')}
          onMoveToDone={taskId => onMoveTask(taskId, user.id, 'done')}
        />
      </motion.div>
    );
  };

  function areSwimlanePropsEqual(prev: SwimlaneProps, next: SwimlaneProps): boolean {
    if (prev.user !== next.user) return false;
    if (prev.isCurrentUser !== next.isCurrentUser) return false;
    if (prev.activeDragInfo !== next.activeDragInfo) return false;
    if (prev.onAddTask !== next.onAddTask) return false;
    if (prev.onQuickAddTask !== next.onQuickAddTask) return false;
    if (prev.onEditTask !== next.onEditTask) return false;
    if (prev.onRescheduleTask !== next.onRescheduleTask) return false;
    if (prev.onAdjustBillableHours !== next.onAdjustBillableHours) return false;
    if (prev.onUpdateTaskTitle !== next.onUpdateTaskTitle) return false;
    if (prev.onDeleteTask !== next.onDeleteTask) return false;
    if (prev.onDeleteUser !== next.onDeleteUser) return false;
    if (prev.onMoveTask !== next.onMoveTask) return false;
    if (prev.onOpenWorkloadModal !== next.onOpenWorkloadModal) return false;
    if (prev.onDragTaskStart !== next.onDragTaskStart) return false;
    if (prev.onDragTaskEnd !== next.onDragTaskEnd) return false;
    if (prev.onMoveUserUp !== next.onMoveUserUp) return false;
    if (prev.onMoveUserDown !== next.onMoveUserDown) return false;
    if (prev.canMoveUp !== next.canMoveUp) return false;
    if (prev.canMoveDown !== next.canMoveDown) return false;

    const prevTasks = prev.tasks;
    const nextTasks = next.tasks;
    if (prevTasks === nextTasks) return true;
    if (prevTasks.length !== nextTasks.length) return false;
    for (let i = 0; i < prevTasks.length; i++) {
      if (prevTasks[i] !== nextTasks[i]) return false;
    }
    return true;
  }

export const Swimlane = React.memo(SwimlaneComponent, areSwimlanePropsEqual);
Swimlane.displayName = 'Swimlane';

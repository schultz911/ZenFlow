import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { User, Task, TaskStatus, DragTaskInfo, CognitiveLoad } from '../types';
import { handleRovingMenuKeyDown, useAnchoredPopover } from '../hooks/useAnchoredPopover';
import {
  calculateUserWorkload,
  compareTasksByDeadline,
  getUserTag,
  calculateTasksEfficiency,
  formatHoursRatio,
  getEfficiencyToneClass,
  getLocalOffsetDateKey,
  isTaskAssignedToUser,
} from '../utils/workload';
import { DateQuickPresets } from './ui/DateQuickPresets';
import { TaskCard } from './TaskCard';
import { RetainerSwimlane } from './RetainerSwimlane';
import { DeadlineDemandModal } from './DeadlineDemandModal';
import { WipLimitModal } from './WipLimitModal';
import { PipelineMovePromptModal } from './PipelineMovePromptModal';
import { CrossUserDropModal } from './CrossUserDropModal';
import { ContentLinkPromptModal } from './ContentLinkPromptModal';
import {
  Plus,
  Circle,
  Clock,
  CheckCircle2,
  HelpCircle,
  Archive,
  ChevronDown,
  ChevronUp,
  Activity,
  UserCheck,
  ArrowDownToLine,
  Trash2,
  ArrowUp,
  ArrowDown,
  Calendar,
  UserCog,
  MoreHorizontal,
} from 'lucide-react';
import { useAuth, useWorkspace } from '../context/DashboardContext';

interface SwimlaneProps {
  user: User;
  tasks: Task[];
  metricTasks?: Task[];
  activeDragInfo?: DragTaskInfo | null;
  onDragTaskStart?: (task: Task, sourceUserId?: string) => void;
  onDragTaskEnd?: () => void;
  onAddTask: (userId: string, status?: TaskStatus) => void;
  onQuickAddTask?: (
    userId: string,
    title: string,
    status: TaskStatus,
    cognitiveLoad?: 'low' | 'medium' | 'high',
    dueDate?: string
  ) => Promise<void>;
  onEditTask: (task: Task) => void;
  onRescheduleTask?: (taskId: string, newDueDate: string | undefined) => void;
  onAdjustBillableHours?: (task: Task) => void;
  onUpdateTaskTitle?: (taskId: string, newTitle: string) => void;
  onDeleteTask: (taskId: string, removeAssigneeId?: string) => void;
  onEditUser?: (user: User) => void;
  onDeleteUser?: (user: User) => void;
  onMoveTask: (
    taskId: string,
    targetUserId: string,
    newStatus: TaskStatus,
    newIndex?: number,
    newDueDate?: string | null,
    extraUpdates?: {
      startDate?: string;
      estimatedHours?: number;
      cognitiveLoad?: CognitiveLoad;
      contentDocLink?: string;
      sourceUserId?: string;
    }
  ) => void;
  onOpenWorkloadModal: (user: User) => void;
  onDuplicateTask?: (task: Task, initialTargetUserId?: string, initialTargetStatus?: TaskStatus) => void;
  onDisciplineMismatch?: (message: string) => void;
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
    icon: <Circle className="h-3 w-3 text-[var(--text-muted)]" />,
    headerColor: 'text-[var(--text-secondary)]',
    dotColor: 'bg-[var(--text-muted)]',
  },
  {
    status: 'in_progress',
    title: 'In Progress',
    icon: <Clock className="h-3 w-3 text-[#1d4ed8] dark:text-blue-400" />,
    headerColor: 'text-[#1d4ed8] dark:text-blue-400',
    dotColor: 'bg-[#1d4ed8] dark:bg-blue-400',
  },
  {
    status: 'in_review',
    title: 'In Review',
    icon: <Activity className="h-3 w-3 text-amber-700 dark:text-amber-400" />,
    headerColor: 'text-amber-700 dark:text-amber-400',
    dotColor: 'bg-amber-600 dark:bg-amber-400',
  },
  {
    status: 'done',
    title: 'Sent',
    icon: <CheckCircle2 className="h-3 w-3 text-emerald-700 dark:text-emerald-400" />,
    headerColor: 'text-emerald-700 dark:text-emerald-400',
    dotColor: 'bg-emerald-600 dark:bg-emerald-400',
  },
];

function ColumnScrollArea({
  children,
  taskCount,
  unconstrained = false,
}: {
  children: React.ReactNode;
  taskCount: number;
  unconstrained?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hasMoreBelow, setHasMoreBelow] = useState(false);

  const checkOverflow = useCallback(() => {
    if (unconstrained) {
      setHasMoreBelow(false);
      return;
    }
    const el = scrollRef.current;
    if (!el) return;
    setHasMoreBelow(el.scrollHeight - el.clientHeight - el.scrollTop > 6);
  }, [unconstrained]);

  useEffect(() => {
    checkOverflow();
    if (unconstrained) return;
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(checkOverflow);
    ro.observe(el);
    return () => ro.disconnect();
  }, [checkOverflow, taskCount, unconstrained]);

  return (
    <>
      <div
        ref={scrollRef}
        onScroll={checkOverflow}
        className={`flex-1 space-y-2 pt-0.5 pb-1 pr-0.5 ${
          unconstrained ? '' : 'max-h-[385px] overflow-y-auto'
        }`}
      >
        {children}
      </div>
      {hasMoreBelow && (
        <div className="pt-1.5 mt-1 border-t border-[var(--border-subtle)] text-center text-xs font-medium text-[var(--text-muted)] tabular-nums select-none">
          More tasks below ({taskCount} total) · Scroll
        </div>
      )}
    </>
  );
}

const SwimlaneComponent: React.FC<SwimlaneProps> = ({
  user,
  tasks,
  metricTasks = tasks,
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
  onEditUser,
  onDeleteUser,
  onMoveTask,
  onDuplicateTask,
  onOpenWorkloadModal,
  onDisciplineMismatch,
  isCurrentUser,
  onMoveUserUp,
  onMoveUserDown,
  canMoveUp,
  canMoveDown,
}) => {
  const { canManageUser, canEditUserTasks } = useAuth();
  const {
    tasks: allWorkspaceTasks,
    users,
    shareTaskWithUser,
    reassignTaskFromUser,
  } = useWorkspace();

  const canEdit = useMemo(() => canEditUserTasks(user.id), [canEditUserTasks, user.id]);

  const [showArchived, setShowArchived] = useState(false);
  const [mobileStage, setMobileStage] = useState<TaskStatus>('in_progress');
  const [showEmptyOngoing, setShowEmptyOngoing] = useState(false);
  const [memberMenuOpen, setMemberMenuOpen] = useState(false);
  const memberMenuBtnRef = useRef<HTMLButtonElement>(null);
  const memberMenuPopRef = useRef<HTMLDivElement>(null);
  const closeMemberMenu = useCallback(() => setMemberMenuOpen(false), []);
  const { position: memberMenuPos } = useAnchoredPopover({
    isOpen: memberMenuOpen,
    triggerRef: memberMenuBtnRef,
    popoverRef: memberMenuPopRef,
    onClose: closeMemberMenu,
    align: 'right',
    gap: 6,
    fallbackWidth: 208,
    fallbackHeight: 96,
  });
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

  // Pipeline -> Swimlane Prompt Modal State
  const [pipelinePromptState, setPipelinePromptState] = useState<{
    task: Task;
    targetStatus: TaskStatus;
    targetIndex?: number;
  } | null>(null);

  // Cross-User Assigned Drop Modal State
  const [crossUserDropState, setCrossUserDropState] = useState<{
    task: Task;
    sourceUser: User | null;
    targetStatus: TaskStatus;
  } | null>(null);

  // Content -> Sent Link Prompt Modal State
  const [contentLinkPromptState, setContentLinkPromptState] = useState<{
    task: Task;
    targetIndex?: number;
  } | null>(null);

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

  const handleCommitQuickAdd = useCallback(async (status: TaskStatus) => {
    const trimmed = quickAddTitle.trim();
    const resolvedDueDate = quickAddDueDate || getLocalOffsetDateKey(1);
    if (!trimmed || !resolvedDueDate || isSubmittingQuickAdd) return;
    setIsSubmittingQuickAdd(true);
    try {
      if (onQuickAddTask) {
        await onQuickAddTask(user.id, trimmed, status, quickAddLoad, resolvedDueDate);
      }
      setQuickAddTitle('');
      setQuickAddDueDate(getLocalOffsetDateKey(1));
    } finally {
      setIsSubmittingQuickAdd(false);
    }
  }, [quickAddTitle, quickAddDueDate, isSubmittingQuickAdd, onQuickAddTask, user.id, quickAddLoad]);

  useEffect(() => {
    if (!memberMenuOpen) return;
    const focusTimer = window.setTimeout(() => {
      const firstItem = memberMenuPopRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])');
      firstItem?.focus();
    }, 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        setMemberMenuOpen(false);
        return;
      }
      handleRovingMenuKeyDown(e, memberMenuPopRef.current);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKey);
    };
  }, [memberMenuOpen]);

  const handleTaskDragStart = useCallback(
    (draggedTask: Task) => {
      onDragTaskStart?.(draggedTask, user.id);
    },
    [onDragTaskStart, user.id]
  );

  const handleTaskDragEnd = useCallback(() => {
    onDragTaskEnd?.();
  }, [onDragTaskEnd]);

  const handleCardDelete = useCallback(
    (taskId: string) => {
      onDeleteTask(taskId, user.id);
    },
    [onDeleteTask, user.id]
  );

  const handleCardDuplicate = useCallback(
    (cardTask: Task) => {
      onDuplicateTask?.(cardTask);
    },
    [onDuplicateTask]
  );

  // Filter tasks belonging to this user (including shared multi-assignee tasks)
  const userTasks = useMemo(() => {
    const map = new Map<string, Task>();
    for (const t of tasks) {
      if (t && t.id && isTaskAssignedToUser(t, user.id)) {
        map.set(t.id, t);
      }
    }
    return Array.from(map.values());
  }, [tasks, user.id]);

  // Pre-index grouped columns in a single O(N) pass to avoid redundant filter+sort calls in the render loop
  const tasksByColumn = useMemo(() => {
    const grouped: Record<TaskStatus, Task[]> = {
      pipeline: [],
      retainer: [],
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

  const workload = useMemo(() => calculateUserWorkload(metricTasks), [metricTasks]);
  const userEfficiency = useMemo(() => calculateTasksEfficiency(metricTasks, {
    memberIds: new Set([user.id]),
  }), [metricTasks, user.id]);
  const archivedTasks = useMemo(() => tasksByColumn.archived, [tasksByColumn]);

  const isCrossUserDrag = Boolean(activeDragInfo && activeDragInfo.sourceUserId && activeDragInfo.sourceUserId !== user.id);

  // Central move validator enforcing pipeline prompt, cross-user options, content link prompt, deadline demand and WIP limit
  const validateAndExecuteMove = useCallback(
    (taskId: string, targetStatus: TaskStatus, targetIndex?: number, fallbackTask?: Task, dragSourceUserId?: string) => {
      const task =
        allWorkspaceTasks.find(t => t.id === taskId) ||
        tasks.find(t => t.id === taskId) ||
        userTasks.find(t => t.id === taskId) ||
        (activeDragInfo?.taskId === taskId ? activeDragInfo.task : undefined) ||
        fallbackTask;
      if (!task) return;

      // Retainer task cards cannot be moved to main swimlanes and cards cannot be moved into retainer
      if (task.status === 'retainer' || targetStatus === 'retainer') {
        return;
      }

      // Moving back to pipeline unassigns & clears deadline
      if (targetStatus === 'pipeline') {
        onMoveTask(taskId, user.id, 'pipeline', targetIndex, null);
        return;
      }

      // 1. Pipeline -> Swimlane Drop
      if (task.status === 'pipeline') {
        if (task.team && task.team !== user.role) {
          onDisciplineMismatch?.(
            `Cannot assign a ${task.team} pipeline deliverable to ${user.name} (${user.role}).`
          );
          return;
        }
        if (targetStatus === 'in_progress') {
          const otherInProgress = tasksByColumn.in_progress.filter(t => t.id !== taskId);
          if (otherInProgress.length >= 2) {
            setShowWipModal(true);
            return;
          }
        }
        setPipelinePromptState({ task, targetStatus, targetIndex });
        return;
      }

      // 2. Cross-user drag of an already-assigned task (target user is not yet assigned)
      const isAlreadyAssignedHere = isTaskAssignedToUser(task, user.id);
      if (!isAlreadyAssignedHere) {
        const resolvedSourceId = dragSourceUserId || activeDragInfo?.sourceUserId || task.userId;
        const sourceUser = users.find(u => u.id === resolvedSourceId) || null;
        setCrossUserDropState({ task, sourceUser, targetStatus });
        return;
      }

      // 3. Content task moved to Sent ('done') requires Content document URL prompt
      const isContentTask = task.team ? task.team === 'content' : user.role === 'content';
      if (targetStatus === 'done' && task.status !== 'done' && isContentTask) {
        setContentLinkPromptState({ task, targetIndex });
        return;
      }

      // 4. Demand Deadline Check:
      const isTargetActive = ['todo', 'in_progress'].includes(targetStatus);
      const isFromReviewDoneArchived = ['in_review', 'done', 'archived'].includes(task.status);
      const hasNoDeadline = !task.dueDate || task.dueDate.trim() === '';
      const isActiveLane = ['todo', 'in_progress', 'in_review', 'done'].includes(targetStatus);

      const requiresDeadlinePrompt =
        (isFromReviewDoneArchived && isTargetActive) ||
        (isActiveLane && hasNoDeadline);

      if (requiresDeadlinePrompt) {
        setDemandModalTask(task);
        setDemandModalTargetStatus(targetStatus);
        setDemandModalTargetIndex(targetIndex);
        return;
      }

      // 5. WIP Limit Check (In Progress max 2):
      if (targetStatus === 'in_progress') {
        const otherInProgress = tasksByColumn.in_progress.filter(t => t.id !== taskId);
        if (otherInProgress.length >= 2) {
          setShowWipModal(true);
          return;
        }
      }

      onMoveTask(taskId, user.id, targetStatus, targetIndex, undefined, {
        sourceUserId: dragSourceUserId || activeDragInfo?.sourceUserId,
      });
    },
    [
      allWorkspaceTasks,
      tasks,
      userTasks,
      activeDragInfo,
      tasksByColumn.in_progress,
      onMoveTask,
      user.id,
      user.name,
      user.role,
      users,
      onDisciplineMismatch,
    ]
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

  const handleQuickAddRetainer = useCallback(
    async (
      targetUserId: string,
      title: string
    ) => {
      if (onQuickAddTask) {
        await onQuickAddTask(targetUserId, title, 'retainer');
      }
    },
    [onQuickAddTask]
  );

  // Robust extraction of dragged task ID with JSON, text/plain, and Context fallbacks
  const extractDragData = (e: React.DragEvent) => {
    let taskId = '';
    let status: TaskStatus | undefined;
    let sourceUserId: string | undefined;
    let payloadTask: Task | undefined;

    // 1. Try application/json
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.taskId) taskId = parsed.taskId;
        if (parsed.status) status = parsed.status;
        if (parsed.sourceUserId || parsed.userId) sourceUserId = parsed.sourceUserId || parsed.userId;
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
      sourceUserId = activeDragInfo.sourceUserId;
    }

    const resolvedTask =
      allWorkspaceTasks.find(t => t.id === taskId) ||
      tasks.find(t => t.id === taskId) ||
      userTasks.find(t => t.id === taskId) ||
      (activeDragInfo?.taskId === taskId ? activeDragInfo.task : undefined) ||
      payloadTask;

    return { taskId, status, sourceUserId, task: resolvedTask };
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

    const { taskId, status, sourceUserId, task } = extractDragData(e);
    if (!taskId) return;

    // Drop onto user header maintains original status (or default 'todo') and assigns/moves user
    const targetStatus = !status || status === 'pipeline' || status === 'retainer' ? 'todo' : status;
    validateAndExecuteMove(taskId, targetStatus, undefined, task, sourceUserId);
  };

  const handleDropOnColumn = (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverColumn(null);
    setDragOverTaskId(null);

    const { taskId, sourceUserId, task } = extractDragData(e);
    if (!taskId) return;

    // Assign to this user and move to target column status
    validateAndExecuteMove(taskId, targetStatus, undefined, task, sourceUserId);
  };

  const handleDropOnTask = (e: React.DragEvent, targetTask: Task, targetStatus: TaskStatus) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverColumn(null);
    setDragOverTaskId(null);

    const { taskId, sourceUserId, task } = extractDragData(e);
    if (!taskId || (taskId === targetTask.id && isTaskAssignedToUser(targetTask, user.id))) return;

    // Calculate new index in this user's target status list using pre-indexed column tasks
    const tasksInTarget = (tasksByColumn[targetStatus] || []).filter(t => t.id !== taskId);
    const targetIdx = tasksInTarget.findIndex(t => t.id === targetTask.id);
    const newIndex = targetIdx !== -1 ? targetIdx : tasksInTarget.length;

    validateAndExecuteMove(taskId, targetStatus, newIndex, task, sourceUserId);
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
      tabIndex={-1}
      aria-label={`${user.name} workspace`}
      layout="position"
      initial={false}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      className={`ledger-frame transition-colors ${
        dragOverHeader
          ? 'border-[#1d4ed8] dark:border-blue-400 ring-2 ring-blue-500/25'
          : ''
      }`}
    >
      {/* Swimlane Ruled Header Band: click bar anywhere outside controls to collapse/expand */}
      <div
        onClick={e => {
          if ((e.target as HTMLElement).closest('button, a, input, select')) return;
          toggleCollapse();
        }}
        title={isCollapsed ? `Click bar to expand ${user.name}'s workspace` : `Click bar to collapse ${user.name}'s workspace`}
        onDragOver={handleHeaderDragOver}
        onDragLeave={handleHeaderDragLeave}
        onDrop={handleHeaderDrop}
        className={`ledger-band relative flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-4 py-2 sm:px-5 transition-colors cursor-pointer select-none ${
          isCollapsed ? 'border-b-0' : ''
        } ${
          dragOverHeader
            ? 'bg-blue-50/70 dark:bg-blue-950/30'
            : ''
        }`}
      >
        {/* User Identity + Mobile Top-Right Actions (2 rows max on mobile) */}
        <div className="flex items-start sm:items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            {(onMoveUserUp || onMoveUserDown) && !isCurrentUser && (
              <div className="hidden sm:flex flex-col border border-[var(--border)] rounded-[6px] bg-[var(--surface)] overflow-hidden shrink-0">
                <button
                  type="button"
                  disabled={!canMoveUp}
                  onClick={() => onMoveUserUp?.(user.id)}
                  title="Move workspace up"
                  aria-label={`Move ${user.name} up`}
                  className="flex items-center justify-center px-1 py-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] disabled:opacity-25 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <ArrowUp className="h-2.5 w-2.5" />
                </button>
                <button
                  type="button"
                  disabled={!canMoveDown}
                  onClick={() => onMoveUserDown?.(user.id)}
                  title="Move workspace down"
                  aria-label={`Move ${user.name} down`}
                  className="flex items-center justify-center px-1 py-0.5 border-t border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] disabled:opacity-25 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <ArrowDown className="h-2.5 w-2.5" />
                </button>
              </div>
            )}

            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-gradient-to-tr ${
                user.avatarColor || 'from-blue-600 to-indigo-600'
              } text-white font-semibold text-xs`}
            >
              {user.name
                .split(' ')
                .map(p => p[0])
                .join('')
                .toUpperCase()
                .slice(0, 2)}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold tracking-tight text-[var(--text-primary)] text-sm">
                  {user.name}
                </h3>
                {isCurrentUser && (
                  <span className="rounded-[4px] bg-[var(--accent-soft)] px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[#1d4ed8] dark:text-blue-300">
                    You
                  </span>
                )}
                <span className="text-xs font-medium text-[var(--text-secondary)]">
                  {getUserTag(user).label}
                </span>

                {isCollapsed && (
                  <span className="text-[11px] font-medium text-[var(--text-secondary)] tabular-nums">
                    · {userTasks.length} tasks · {tasksByColumn.in_progress.length} active
                  </span>
                )}

                {isCrossUserDrag && (
                  <span className="inline-flex items-center gap-1 rounded-[5px] bg-[var(--accent-soft)] text-[#1d4ed8] dark:text-blue-300 px-2 py-0.5 text-[11px] font-semibold">
                    <UserCheck className="h-3 w-3" />
                    <span>Drop to reassign</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-secondary)] truncate max-w-xs">
                {user.email}
              </p>
            </div>
          </div>

          {/* Mobile Row-1 Right: ... + Collapse buttons (eliminates 3rd header row on <640px) */}
          <div className="flex sm:hidden items-center gap-1.5 shrink-0">
            {(
              (canEdit && tasksByColumn.retainer.length === 0 && !isCollapsed) ||
              (onEditUser && canManageUser(user)) ||
              (onDeleteUser && canManageUser(user) && !isCurrentUser) ||
              archivedTasks.length > 0
            ) && (
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={memberMenuOpen}
                aria-controls={`member-actions-menu-${user.id}`}
                aria-label={`More actions for ${user.name}`}
                title={`Member options for ${user.name}`}
                onClick={e => {
                  memberMenuBtnRef.current = e.currentTarget;
                  setMemberMenuOpen(prev => !prev);
                }}
                className={`icon-button border border-[var(--border)] bg-[var(--surface)] relative ${
                  showArchived ? 'text-[#1d4ed8] dark:text-blue-400 border-[var(--accent)]' : ''
                }`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              aria-expanded={!isCollapsed}
              aria-controls={`swimlane-body-${user.id}`}
              onClick={toggleCollapse}
              title={isCollapsed ? 'Expand workspace' : 'Collapse workspace'}
              aria-label={isCollapsed ? `Expand ${user.name}'s workspace` : `Collapse ${user.name}'s workspace`}
              className="icon-button border border-[var(--border)] bg-[var(--surface)]"
            >
              {isCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* Inline Ruled Telemetry (Load | Efficiency) & Action Controls */}
        <div className="flex items-center gap-3 flex-wrap justify-between lg:justify-end">
          <div className="flex items-center divide-x divide-[var(--border)]">
            <button
              id={`workload-btn-${user.id}`}
              type="button"
              onClick={() => onOpenWorkloadModal(user)}
              title="Click to view workload breakdown"
              className="mobile-tap-control sm:min-h-0 flex items-center gap-1.5 pr-3 text-left hover:text-[#1d4ed8] dark:hover:text-blue-400 transition-colors cursor-pointer"
            >
              {workload.level === 'overloaded' ? (
                <span className="ledger-alert-badge">
                  <Activity aria-hidden="true" className="h-3 w-3 shrink-0" />
                  <span>{workload.totalScore} / 12 pts · Overload</span>
                  <HelpCircle aria-hidden="true" className="h-3 w-3 shrink-0 ml-0.5 opacity-90" />
                </span>
              ) : (
                <>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Load
                  </span>
                  <span className="text-xs font-bold tabular-nums text-[var(--text-primary)]">
                    {workload.totalScore}
                  </span>
                  <span className={`text-[11px] font-semibold ${workload.badgeText}`}>
                    {workload.levelLabel}
                  </span>
                  <HelpCircle className="h-3 w-3 text-[var(--text-muted)]" />
                </>
              )}
            </button>

            <div
              title="Estimated vs. billable hours on completed work"
              className="flex items-center gap-1.5 pl-3 select-none tabular-nums whitespace-nowrap"
            >
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Eff
              </span>
              <span className={`text-xs font-bold ${getEfficiencyToneClass(userEfficiency.efficiencyPercent)}`}>
                {userEfficiency.efficiencyPercent !== null ? `${Math.round(userEfficiency.efficiencyPercent)}%` : '—'}
              </span>
              {userEfficiency.efficiencyPercent !== null && (
                <span className="text-[11px] text-[var(--text-secondary)] whitespace-nowrap">
                  {formatHoursRatio(userEfficiency.estimatedHours, userEfficiency.billableHours)}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {canEdit && (
              <button
                id={`add-task-btn-${user.id}`}
                type="button"
                onClick={() => onAddTask(user.id, 'todo')}
                title={`Add task to ${user.name}`}
                className="button-secondary mobile-tap-control"
              >
                <Plus className="h-3.5 w-3.5 text-[#1d4ed8] dark:text-blue-400" />
                <span>Add Task</span>
              </button>
            )}

            {(
              (canEdit && tasksByColumn.retainer.length === 0 && !isCollapsed) ||
              (onEditUser && canManageUser(user)) ||
              (onDeleteUser && canManageUser(user) && !isCurrentUser) ||
              archivedTasks.length > 0
            ) && (
              <button
                id={`member-actions-btn-${user.id}`}
                ref={memberMenuBtnRef}
                type="button"
                aria-haspopup="menu"
                aria-expanded={memberMenuOpen}
                aria-controls={`member-actions-menu-${user.id}`}
                aria-label={`More actions for ${user.name}`}
                title={`Member options for ${user.name}`}
                onClick={e => {
                  memberMenuBtnRef.current = e.currentTarget;
                  setMemberMenuOpen(prev => !prev);
                }}
                className={`hidden sm:inline-flex icon-button border border-[var(--border)] bg-[var(--surface)] relative ${
                  showArchived ? 'text-[#1d4ed8] dark:text-blue-400 border-[var(--accent)]' : ''
                }`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            )}

            <button
              id={`collapse-btn-${user.id}`}
              type="button"
              aria-expanded={!isCollapsed}
              aria-controls={`swimlane-body-${user.id}`}
              onClick={toggleCollapse}
              title={isCollapsed ? 'Expand workspace' : 'Collapse workspace'}
              aria-label={isCollapsed ? `Expand ${user.name}'s workspace` : `Collapse ${user.name}'s workspace`}
              className="hidden sm:inline-flex icon-button border border-[var(--border)] bg-[var(--surface)]"
            >
              {isCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            </button>
          </div>

          {memberMenuOpen && createPortal(
            <div
              id={`member-actions-menu-${user.id}`}
              ref={memberMenuPopRef}
              role="menu"
              aria-label={`${user.name} actions`}
              style={
                memberMenuPos
                  ? { top: `${memberMenuPos.top}px`, left: `${memberMenuPos.left}px` }
                  : { top: 0, left: 0, visibility: 'hidden' }
              }
              className="menu-surface fixed z-50 w-52 rounded-[9px] border border-[var(--border)] p-1 text-[var(--text-primary)]"
            >
              {(onMoveUserUp || onMoveUserDown) && !isCurrentUser && (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!canMoveUp}
                    onClick={() => {
                      setMemberMenuOpen(false);
                      onMoveUserUp?.(user.id);
                    }}
                    className="menu-item sm:hidden mobile-tap-control disabled:opacity-40 cursor-pointer"
                  >
                    <ArrowUp className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                    <span>Move Workspace Up</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!canMoveDown}
                    onClick={() => {
                      setMemberMenuOpen(false);
                      onMoveUserDown?.(user.id);
                    }}
                    className="menu-item sm:hidden mobile-tap-control disabled:opacity-40 cursor-pointer"
                  >
                    <ArrowDown className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                    <span>Move Workspace Down</span>
                  </button>
                </>
              )}
              {canEdit && tasksByColumn.retainer.length === 0 && !isCollapsed && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMemberMenuOpen(false);
                    setShowEmptyOngoing(prev => !prev);
                  }}
                  className="menu-item cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" />
                  <span>{showEmptyOngoing ? 'Hide Ongoing Strip' : 'Add Ongoing Task'}</span>
                </button>
              )}

              {archivedTasks.length > 0 && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMemberMenuOpen(false);
                    setShowArchived(prev => !prev);
                  }}
                  className="menu-item justify-between cursor-pointer tabular-nums"
                >
                  <span className="flex items-center gap-2">
                    <Archive className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                    <span>{showArchived ? 'Hide Archived' : 'Show Archived'}</span>
                  </span>
                  <span className="ledger-badge">{archivedTasks.length}</span>
                </button>
              )}

              {onEditUser && canManageUser(user) && (
                <button
                  id={`edit-user-btn-${user.id}`}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMemberMenuOpen(false);
                    onEditUser(user);
                  }}
                  className="menu-item cursor-pointer"
                >
                  <UserCog className="h-3.5 w-3.5 text-[#1d4ed8] dark:text-blue-400" />
                  <span>Edit Member Profile</span>
                </button>
              )}

              {onDeleteUser && canManageUser(user) && !isCurrentUser && (
                <>
                  <div role="separator" className="my-1 border-t border-[var(--border-subtle)]" />
                  <button
                    id={`delete-user-btn-${user.id}`}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMemberMenuOpen(false);
                      onDeleteUser(user);
                    }}
                    className="menu-item !text-red-600 dark:!text-red-400 hover:!bg-red-50 dark:hover:!bg-red-500/10 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete Member</span>
                  </button>
                </>
              )}
            </div>,
            document.body
          )}
        </div>
      </div>

      {/* Collapsible Workspace Body */}
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            id={`swimlane-body-${user.id}`}
            key="workspace-body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: [0.2, 0.7, 0.2, 1] }}
            className="overflow-hidden"
          >
            {/* Retainer Swimlane (hidden when empty unless toggled) */}
            {(tasksByColumn.retainer.length > 0 || showEmptyOngoing) && (
              <div className="px-4 sm:px-5 pt-2.5 pb-2 border-b border-[var(--border-subtle)] bg-[var(--surface)]">
                <RetainerSwimlane
                  user={user}
                  tasks={tasksByColumn.retainer}
                  canEdit={canEdit}
                  defaultOpenAdd={showEmptyOngoing && tasksByColumn.retainer.length === 0}
                  onQuickAdd={handleQuickAddRetainer}
                  onEditTask={onEditTask}
                  onUpdateTitle={onUpdateTaskTitle}
                  onDeleteTask={onDeleteTask}
                  onCreateSubtask={onDuplicateTask || onEditTask}
                />
              </div>
            )}

            <div className="sm:hidden flex overflow-x-auto border-b border-[var(--border-subtle)] px-2" role="group" aria-label={`${user.name} task stages`}>
              {COLUMNS.map(column => (
                <button key={column.status} type="button" aria-pressed={mobileStage === column.status}
                  onClick={() => setMobileStage(column.status)}
                  className={`mobile-tap-control shrink-0 px-2 text-xs font-semibold ${mobileStage === column.status ? 'text-[#1d4ed8] dark:text-blue-300 border-b-2 border-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}>
                  {column.title} <span className="tabular-nums">{tasksByColumn[column.status]?.length || 0}</span>
                </button>
              ))}
            </div>
            {/* Ruled 4/5-Column Ledger Grid (no nested rounded boxes) */}
            <div className="board-columns-scroll overflow-x-auto bg-[var(--surface)]">
              <div
                className={`board-columns ${
                  showArchived ? 'board-columns-with-archive' : ''
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
                      className={`board-column-cell ${mobileStage === col.status ? 'flex' : 'hidden sm:flex'} flex-col transition-colors duration-150 ${
                        isDropActive
                          ? 'bg-blue-50/70 dark:bg-blue-950/25'
                          : 'bg-[var(--surface)]'
                      }`}
                    >
                      {/* Status Column Header */}
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border-subtle)]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {col.icon}
                          <h4 className={`text-[11px] uppercase tracking-wider font-bold truncate ${col.headerColor}`}>
                            {col.title}
                          </h4>
                          {col.status === 'in_progress' && columnTasks.length > 2 ? (
                            <span
                              title="In-Progress WIP limit (2 tasks) exceeded"
                              className="text-[11px] font-bold tabular-nums text-red-600 dark:text-red-400"
                            >
                              {columnTasks.length}/2
                            </span>
                          ) : (
                            <span className="text-[11px] font-semibold tabular-nums text-[var(--text-muted)]">
                              {columnTasks.length}
                            </span>
                          )}
                        </div>

                        {canEdit && (
                          <button
                            type="button"
                            data-quick-add-toggle={col.status}
                            onClick={() => {
                              if (quickAddStatus === col.status) {
                                setQuickAddStatus(null);
                              } else {
                                setQuickAddStatus(col.status);
                                setQuickAddTitle('');
                                setQuickAddLoad('medium');
                                setQuickAddDueDate(getLocalOffsetDateKey(1));
                              }
                            }}
                            title={`Inline quick add to ${col.title}`}
                            aria-label={`Quick add to ${col.title}`}
                            className={`mobile-tap-square sm:min-w-0 sm:min-h-0 flex items-center justify-center rounded-[5px] p-1 transition-colors cursor-pointer shrink-0 ${
                              quickAddStatus === col.status
                                ? 'bg-[#1d4ed8] text-white'
                                : 'text-[var(--text-muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]'
                            }`}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      {isDropActive && isCrossUserDrag && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mb-2 rounded-[6px] p-2 text-center text-[11px] font-semibold flex items-center justify-center gap-1.5 border border-[#1d4ed8]/30 bg-[var(--accent-soft)] text-[#1d4ed8] dark:text-blue-300"
                        >
                          <ArrowDownToLine className="h-3 w-3" />
                          <span>
                            Assign to {user.name.split(' ')[0]} ({col.title})
                          </span>
                        </motion.div>
                      )}

                      <ColumnScrollArea
                        taskCount={columnTasks.length}
                        unconstrained={col.status === 'in_progress' || col.status === 'in_review'}
                      >
                        {quickAddStatus === col.status && canEdit && (
                          <motion.div
                            ref={quickAddCardRef}
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            className="rounded-[7px] border border-[var(--accent)] bg-[var(--surface)] p-2.5 space-y-2 mb-2"
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
                              className="w-full rounded-[5px] border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
                            />

                            <div className="space-y-1.5 pt-1.5 border-t border-[var(--border-subtle)]">
                              <div className="flex items-center justify-between gap-1 text-[11px] text-[var(--text-secondary)]">
                                <span className="inline-flex items-center gap-1 font-semibold text-[var(--text-primary)]">
                                  <Calendar className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
                                  Due *
                                </span>
                                <input
                                  type="date"
                                  value={quickAddDueDate}
                                  onChange={e => setQuickAddDueDate(e.target.value)}
                                  className="rounded-[5px] border border-[var(--border)] bg-transparent px-1.5 py-0.5 text-[11px] tabular-nums text-[var(--text-primary)] cursor-pointer focus:outline-none"
                                  style={{ minHeight: 'auto' }}
                                />
                              </div>
                              <DateQuickPresets
                                value={quickAddDueDate}
                                onSelectDate={setQuickAddDueDate}
                                includeToday
                              />
                            </div>

                            <div className="flex items-center justify-between gap-1.5 pt-0.5">
                              <div className="flex items-center gap-1">
                                {(['low', 'medium', 'high'] as const).map(load => (
                                  <button
                                    key={load}
                                    type="button"
                                    onClick={() => setQuickAddLoad(load)}
                                    className={`rounded-[5px] px-1.5 py-0.5 text-[11px] font-semibold border capitalize transition-colors cursor-pointer ${
                                      quickAddLoad === load
                                        ? load === 'high'
                                          ? 'bg-red-50 dark:bg-red-500/15 border-red-300 dark:border-red-500/40 text-red-700 dark:text-red-400'
                                          : load === 'medium'
                                          ? 'bg-amber-50 dark:bg-amber-500/15 border-amber-300 dark:border-amber-500/40 text-amber-700 dark:text-amber-400'
                                          : 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400'
                                        : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                    }`}
                                    style={{ minHeight: 'auto' }}
                                  >
                                    {load}
                                  </button>
                                ))}
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setQuickAddStatus(null);
                                    onAddTask(user.id, col.status);
                                  }}
                                  title="Open full form with details & due date"
                                  className="text-[11px] font-medium text-[#1d4ed8] dark:text-blue-400 hover:underline cursor-pointer"
                                  style={{ minHeight: 'auto' }}
                                >
                                  Full form
                                </button>
                                <button
                                  type="button"
                                  disabled={!quickAddTitle.trim() || !quickAddDueDate || isSubmittingQuickAdd}
                                  onClick={() => handleCommitQuickAdd(col.status)}
                                  className="rounded-[5px] bg-[#1d4ed8] hover:bg-[#1e40af] px-2.5 py-1 text-[11px] font-semibold text-white transition-colors cursor-pointer disabled:opacity-40"
                                  style={{ minHeight: 'auto' }}
                                >
                                  Add
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        )}

                        <AnimatePresence mode="popLayout">
                          {columnTasks.length === 0 && quickAddStatus !== col.status ? (
                            canEdit ? (
                              <motion.button
                                key="empty-dropzone"
                                type="button"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => {
                                  setQuickAddStatus(col.status);
                                  setQuickAddTitle('');
                                  setQuickAddLoad('medium');
                                  setQuickAddDueDate(getLocalOffsetDateKey(1));
                                }}
                                aria-label={`Add task to ${col.title} for ${user.name}`}
                                className={`flex w-full h-12 cursor-pointer flex-col items-center justify-center rounded-[7px] px-3 py-2 text-center transition-colors ${
                                  isDropActive
                                    ? 'border border-dashed border-[#1d4ed8] bg-[var(--accent-soft)] text-[#1d4ed8] dark:text-blue-300'
                                    : 'text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-secondary)]'
                                }`}
                              >
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium">
                                  <Plus className="h-3 w-3" />
                                  <span>{isDropActive ? `Drop in ${col.title}` : 'Add or drop'}</span>
                                </span>
                              </motion.button>
                            ) : (
                              <div
                                key="empty-readonly"
                                className="flex w-full h-20 items-center justify-center rounded-[7px] p-3 text-center text-[11px] text-[var(--text-muted)] select-none"
                              >
                                <span>No tasks in {col.title}</span>
                              </div>
                            )
                          ) : (
                            columnTasks.map(task => {
                              const isTaskDropTarget = dragOverTaskId === task.id;
                              return (
                                <motion.div
                                  key={task.id}
                                  layout="position"
                                  initial={false}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0, scale: 0.96 }}
                                  transition={{ duration: 0.15 }}
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
                                  {isTaskDropTarget && activeDragInfo && activeDragInfo.taskId !== task.id && (
                                    <motion.div
                                      layoutId="drop-indicator"
                                      className="absolute -top-1 left-0 right-0 h-0.5 bg-[#1d4ed8] dark:bg-blue-400 z-20 pointer-events-none"
                                    />
                                  )}
                                  <TaskCard
                                    task={task}
                                    userRole={user.role}
                                    swimlaneUserId={user.id}
                                    onEdit={onEditTask}
                                    onUpdateTitle={onUpdateTaskTitle}
                                    onDelete={handleCardDelete}
                                    onMoveStatus={handleMoveStatus}
                                    onReschedule={onRescheduleTask}
                                    onAdjustBillableHours={onAdjustBillableHours}
                                    onDuplicateToBoard={onDuplicateTask ? handleCardDuplicate : undefined}
                                    canEdit={canEdit}
                                    onDragStart={handleTaskDragStart}
                                    onDragEnd={handleTaskDragEnd}
                                  />
                                </motion.div>
                              );
                            })
                          )}
                        </AnimatePresence>
                      </ColumnScrollArea>
                    </div>
                  );
                })}

                {/* Archived Column (conditional) */}
                {showArchived && (
                  <div
                    onDragOver={e => handleDragOverColumn(e, 'archived')}
                    onDragLeave={handleDragLeaveColumn}
                    onDrop={e => handleDropOnColumn(e, 'archived')}
                    className={`board-column-cell flex flex-col transition-colors ${
                      dragOverColumn === 'archived'
                        ? 'bg-blue-50/70 dark:bg-blue-950/25'
                        : 'bg-[var(--surface-muted)]'
                    }`}
                  >
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border-subtle)]">
                      <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                        <Archive className="h-3 w-3" />
                        <h4 className="text-[11px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">
                          Completed
                        </h4>
                        <span className="text-[11px] font-semibold tabular-nums text-[var(--text-muted)]">
                          {archivedTasks.length}
                        </span>
                      </div>
                    </div>

                    <div className="flex-1 space-y-2 max-h-[385px] overflow-y-auto pt-0.5 pb-1 pr-0.5">
                      <AnimatePresence mode="popLayout">
                        {archivedTasks.length === 0 ? (
                          <motion.div
                            key="empty-archived"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex h-24 flex-col items-center justify-center rounded-[7px] border border-dashed border-[var(--border)] p-3 text-center text-[11px] text-[var(--text-secondary)]"
                          >
                            <p>No completed tasks</p>
                          </motion.div>
                        ) : (
                          archivedTasks.map(task => (
                            <motion.div
                              key={task.id}
                              layout="position"
                              initial={false}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0, scale: 0.96 }}
                              transition={{ duration: 0.15 }}
                              className="relative"
                            >
                              <TaskCard
                                task={task}
                                userRole={user.role}
                                swimlaneUserId={user.id}
                                onEdit={onEditTask}
                                onUpdateTitle={onUpdateTaskTitle}
                                onDelete={handleCardDelete}
                                onMoveStatus={handleMoveStatus}
                                onReschedule={onRescheduleTask}
                                onAdjustBillableHours={onAdjustBillableHours}
                                onDuplicateToBoard={onDuplicateTask ? handleCardDuplicate : undefined}
                                canEdit={canEdit}
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

        {/* Pipeline -> Swimlane Prompt Modal */}
        <PipelineMovePromptModal
          isOpen={Boolean(pipelinePromptState)}
          onClose={() => setPipelinePromptState(null)}
          task={pipelinePromptState?.task || null}
          targetUser={user}
          onConfirm={({ startDate, estimatedHours, cognitiveLoad, dueDate }) => {
            if (!pipelinePromptState) return;
            const { task: pTask, targetStatus, targetIndex } = pipelinePromptState;
            setPipelinePromptState(null);
            if (targetStatus === 'in_progress') {
              const otherInProgress = tasksByColumn.in_progress.filter(t => t.id !== pTask.id);
              if (otherInProgress.length >= 2) {
                setShowWipModal(true);
                return;
              }
            }
            onMoveTask(pTask.id, user.id, targetStatus, targetIndex, dueDate ?? pTask.dueDate ?? null, {
              startDate,
              estimatedHours,
              cognitiveLoad,
            });
          }}
        />

        {/* Cross-User Assigned Drop Prompt Modal */}
        <CrossUserDropModal
          isOpen={Boolean(crossUserDropState)}
          onClose={() => setCrossUserDropState(null)}
          task={crossUserDropState?.task || null}
          sourceUser={crossUserDropState?.sourceUser || null}
          targetUser={user}
          targetStatus={crossUserDropState?.targetStatus || 'todo'}
          onReassign={async () => {
            if (!crossUserDropState) return;
            const { task: dTask, sourceUser, targetStatus } = crossUserDropState;
            setCrossUserDropState(null);
            const fromUserId = sourceUser?.id || dTask.userId;
            await reassignTaskFromUser(dTask.id, fromUserId, user.id, targetStatus, dTask.dueDate).catch(err => {
              onDisciplineMismatch?.(err?.message || 'Failed to reassign task');
            });
          }}
          onDuplicateShare={async () => {
            if (!crossUserDropState) return;
            const { task: dTask } = crossUserDropState;
            setCrossUserDropState(null);
            await shareTaskWithUser(dTask.id, user.id).catch(err => {
              onDisciplineMismatch?.(err?.message || 'Failed to share task');
            });
          }}
          onCreateSubtask={() => {
            if (!crossUserDropState) return;
            const { task: dTask, targetStatus } = crossUserDropState;
            setCrossUserDropState(null);
            onDuplicateTask?.(dTask, user.id, targetStatus);
          }}
        />

        {/* Content -> Sent Document Link Prompt Modal */}
        <ContentLinkPromptModal
          isOpen={Boolean(contentLinkPromptState)}
          onClose={() => setContentLinkPromptState(null)}
          task={contentLinkPromptState?.task || null}
          hasSiblingDesignTask={Boolean(
            contentLinkPromptState?.task?.parentTaskId &&
              allWorkspaceTasks.some(
                t =>
                  t.id !== contentLinkPromptState.task.id &&
                  t.parentTaskId === contentLinkPromptState.task.parentTaskId &&
                  t.team === 'design'
              )
          )}
          onConfirm={(contentDocLink) => {
            if (!contentLinkPromptState) return;
            const { task: cTask, targetIndex } = contentLinkPromptState;
            setContentLinkPromptState(null);
            onMoveTask(cTask.id, user.id, 'done', targetIndex, undefined, { contentDocLink });
          }}
        />

        {/* In-Progress WIP Limit Modal (Max 2 Tasks) */}
        <WipLimitModal
          isOpen={showWipModal}
          user={user}
          inProgressTasks={tasksByColumn.in_progress}
          onClose={() => setShowWipModal(false)}
          onMoveToTodo={taskId => onMoveTask(taskId, user.id, 'todo')}
          onMoveToDone={taskId => validateAndExecuteMove(taskId, 'done')}
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
    if (prev.onEditUser !== next.onEditUser) return false;
    if (prev.onDeleteUser !== next.onDeleteUser) return false;
    if (prev.onMoveTask !== next.onMoveTask) return false;
    if (prev.onOpenWorkloadModal !== next.onOpenWorkloadModal) return false;
    if (prev.onDuplicateTask !== next.onDuplicateTask) return false;
    if (prev.onDisciplineMismatch !== next.onDisciplineMismatch) return false;
    if (prev.onDragTaskStart !== next.onDragTaskStart) return false;
    if (prev.onDragTaskEnd !== next.onDragTaskEnd) return false;
    if (prev.onMoveUserUp !== next.onMoveUserUp) return false;
    if (prev.onMoveUserDown !== next.onMoveUserDown) return false;
    if (prev.canMoveUp !== next.canMoveUp) return false;
    if (prev.canMoveDown !== next.canMoveDown) return false;

    return sameTasks(prev.tasks, next.tasks) &&
      sameTasks(prev.metricTasks ?? prev.tasks, next.metricTasks ?? next.tasks);
  }

function sameTasks(previous: Task[], next: Task[]) {
  return previous === next || (previous.length === next.length && previous.every((task, index) => task === next[index]));
}

export const Swimlane = React.memo(SwimlaneComponent, areSwimlanePropsEqual);
Swimlane.displayName = 'Swimlane';

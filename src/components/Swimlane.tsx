import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User, Task, TaskStatus } from '../types';
import { calculateUserWorkload } from '../utils/workload';
import { useDashboard } from '../context/DashboardContext';
import { TaskCard } from './TaskCard';
import {
  Plus,
  Circle,
  Clock,
  CheckCircle2,
  HelpCircle,
  Archive,
  ChevronDown,
  ChevronRight,
  Activity,
  UserCheck,
  ArrowDownToLine,
} from 'lucide-react';

interface SwimlaneProps {
  user: User;
  tasks: Task[];
  onAddTask: (userId: string, status?: TaskStatus) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onMoveTask: (taskId: string, targetUserId: string, newStatus: TaskStatus, newIndex?: number) => void;
  onOpenWorkloadModal: (user: User) => void;
  isCurrentUser: boolean;
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

export const Swimlane: React.FC<SwimlaneProps> = React.memo(({
  user,
  tasks,
  onAddTask,
  onEditTask,
  onDeleteTask,
  onMoveTask,
  onOpenWorkloadModal,
  isCurrentUser,
}) => {
  const { activeDragInfo, setActiveDragInfo } = useDashboard();
  const [showArchived, setShowArchived] = useState(false);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [dragOverHeader, setDragOverHeader] = useState(false);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);

  const handleTaskDragStart = useCallback(
    (draggedTask: Task) => {
      setActiveDragInfo({
        taskId: draggedTask.id,
        sourceUserId: draggedTask.userId,
        sourceStatus: draggedTask.status,
        title: draggedTask.title,
      });
    },
    [setActiveDragInfo]
  );

  const handleTaskDragEnd = useCallback(() => {
    setActiveDragInfo(null);
  }, [setActiveDragInfo]);

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
      grouped[status as TaskStatus].sort((a, b) => a.order - b.order);
    }
    return grouped;
  }, [userTasks]);

  const workload = useMemo(() => calculateUserWorkload(userTasks), [userTasks]);
  const archivedTasks = useMemo(() => tasksByColumn.archived, [tasksByColumn]);

  const isCrossUserDrag = Boolean(activeDragInfo && activeDragInfo.sourceUserId !== user.id);

  // Robust extraction of dragged task ID with JSON, text/plain, and Context fallbacks
  const extractDragData = (e: React.DragEvent) => {
    let taskId = '';
    let status: TaskStatus | undefined;

    // 1. Try application/json
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.taskId) taskId = parsed.taskId;
        if (parsed.status) status = parsed.status;
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

    return { taskId, status };
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
    setDragOverHeader(true);
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

    const { taskId, status } = extractDragData(e);
    if (!taskId) return;

    // Drop onto user header maintains original status (or default 'todo') and reassigns user
    const targetStatus = status || 'todo';
    onMoveTask(taskId, user.id, targetStatus);
  };

  const handleDropOnColumn = (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverColumn(null);
    setDragOverTaskId(null);

    const { taskId } = extractDragData(e);
    if (!taskId) return;

    // Assign to this user and move to target column status
    onMoveTask(taskId, user.id, targetStatus);
  };

  const handleDropOnTask = (e: React.DragEvent, targetTask: Task, targetStatus: TaskStatus) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverColumn(null);
    setDragOverTaskId(null);

    const { taskId } = extractDragData(e);
    if (!taskId || (taskId === targetTask.id && user.id === targetTask.userId)) return;

    // Calculate new index in this user's target status list
    const tasksInTarget = userTasks
      .filter(t => t.status === targetStatus && t.id !== taskId)
      .sort((a, b) => a.order - b.order);
    const targetIdx = tasksInTarget.findIndex(t => t.id === targetTask.id);
    const newIndex = targetIdx !== -1 ? targetIdx : tasksInTarget.length;

    onMoveTask(taskId, user.id, targetStatus, newIndex);
  };

  const handleMoveStatus = useCallback(
    (taskId: string, newStatus: TaskStatus) => {
      onMoveTask(taskId, user.id, newStatus);
    },
    [onMoveTask, user.id]
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
        <div className="flex items-center gap-3 flex-wrap justify-between lg:justify-end">
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
        </div>
      </div>

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
                  <div className="flex items-center gap-1.5 min-w-0">
                    {col.icon}
                    <h4 className={`text-[11px] uppercase tracking-wider font-semibold truncate ${col.headerColor}`}>
                      {col.title}
                    </h4>
                    <span className="rounded-full bg-neutral-200 dark:bg-white/5 px-1.5 py-0.2 text-[10px] text-neutral-600 dark:text-white/40 border border-neutral-300 dark:border-white/5 shrink-0">
                      {columnTasks.length}
                    </span>
                  </div>

                  <button
                    onClick={() => onAddTask(user.id, col.status)}
                    title={`Add task to ${col.title}`}
                    className="rounded-md p-1 text-neutral-400 dark:text-white/30 hover:bg-neutral-200 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer shrink-0"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>

                {/* Drop indicator banner when dragging from another user */}
                {isDropActive && isCrossUserDrag && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-2 rounded-lg bg-blue-600/10 border border-blue-500/30 p-2 text-center text-[10px] font-medium text-blue-600 dark:text-blue-400 flex items-center justify-center gap-1.5"
                  >
                    <ArrowDownToLine className="h-3 w-3" />
                    <span>Assign to {user.name.split(' ')[0]} ({col.title})</span>
                  </motion.div>
                )}

                {/* Tasks List */}
                <div className="flex-1 space-y-2.5">
                  <AnimatePresence mode="popLayout">
                    {columnTasks.length === 0 ? (
                      <motion.div
                        key="empty-dropzone"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => onAddTask(user.id, col.status)}
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
                          {isDropActive ? `in ${col.title}` : 'Drop here or click +'}
                        </p>
                      </motion.div>
                    ) : (
                      columnTasks.map(task => {
                        const isTaskDropTarget = dragOverTaskId === task.id;
                        return (
                          <div
                            key={task.id}
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
                              onDelete={onDeleteTask}
                              onMoveStatus={handleMoveStatus}
                              onDragStart={handleTaskDragStart}
                              onDragEnd={handleTaskDragEnd}
                            />
                          </div>
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

              <div className="flex-1 space-y-2.5">
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
                      <TaskCard
                        key={task.id}
                        task={task}
                        userRole={user.role}
                        onEdit={onEditTask}
                        onDelete={onDeleteTask}
                        onMoveStatus={handleMoveStatus}
                        onDragStart={handleTaskDragStart}
                        onDragEnd={handleTaskDragEnd}
                      />
                    ))
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
});

Swimlane.displayName = 'Swimlane';

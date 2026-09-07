import React, { useState } from 'react';
import { User, Task, TaskStatus } from '../types';
import { calculateUserWorkload } from '../utils/workload';
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
  Eye,
  Activity,
  Layers,
} from 'lucide-react';

interface SwimlaneProps {
  user: User;
  tasks: Task[];
  onAddTask: (userId: string, status?: TaskStatus) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onMoveTaskStatus: (taskId: string, newStatus: TaskStatus, newIndex?: number) => void;
  onReorderTasks: (updates: Array<{ id: string; status: TaskStatus; order: number }>) => void;
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

export const Swimlane: React.FC<SwimlaneProps> = ({
  user,
  tasks,
  onAddTask,
  onEditTask,
  onDeleteTask,
  onMoveTaskStatus,
  onReorderTasks,
  onOpenWorkloadModal,
  isCurrentUser,
}) => {
  const [showArchived, setShowArchived] = useState(false);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);

  // Filter tasks belonging strictly to this user
  const userTasks = tasks.filter(t => t.userId === user.id);
  const workload = calculateUserWorkload(userTasks);

  const archivedTasks = userTasks.filter(t => t.status === 'archived');

  const handleDragOver = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumn !== status) {
      setDragOverColumn(status);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only reset if leaving the column container
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverColumn(null);
      setDragOverTaskId(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    setDragOverTaskId(null);

    const rawData = e.dataTransfer.getData('application/json');
    if (!rawData) return;

    try {
      const data = JSON.parse(rawData);
      const { taskId } = data;

      if (!taskId) return;

      // Move task to target status
      onMoveTaskStatus(taskId, targetStatus);
    } catch (err) {
      console.error('Failed to parse drag data:', err);
    }
  };

  const handleDropOnTask = (e: React.DragEvent, targetTask: Task, targetStatus: TaskStatus) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverColumn(null);
    setDragOverTaskId(null);

    const rawData = e.dataTransfer.getData('application/json');
    if (!rawData) return;

    try {
      const data = JSON.parse(rawData);
      const { taskId } = data;
      if (!taskId || taskId === targetTask.id) return;

      // Reorder: place dragged task before or after targetTask
      const tasksInTarget = userTasks
        .filter(t => t.status === targetStatus && t.id !== taskId)
        .sort((a, b) => a.order - b.order);

      const targetIdx = tasksInTarget.findIndex(t => t.id === targetTask.id);
      const newIndex = targetIdx !== -1 ? targetIdx : tasksInTarget.length;

      onMoveTaskStatus(taskId, targetStatus, newIndex);
    } catch (err) {
      console.error('Failed to reorder task:', err);
    }
  };

  return (
    <div
      id={`swimlane-${user.id}`}
      className={`rounded-2xl border bg-white dark:bg-[#0D0D0D] shadow-sm dark:shadow-2xl transition-all ${
        isCurrentUser
          ? 'border-blue-500/50 ring-1 ring-blue-500/20 shadow-blue-500/5'
          : 'border-neutral-200 dark:border-white/5'
      }`}
    >
      {/* Swimlane Header: User Info, Workload Score, Add Task */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-neutral-100 dark:border-white/5 p-4 sm:px-6">
        
        {/* User Identity */}
        <div className="flex items-center gap-3.5">
          <div
            className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr ${
              user.avatarColor || 'from-blue-600 to-indigo-600'
            } text-white font-semibold text-sm border border-neutral-200 dark:border-white/10`}
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
            className={`flex items-center gap-2.5 rounded-xl border px-3 py-1.5 transition-all hover:scale-[1.02] active:scale-[0.98] ${workload.badgeBg}`}
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
                className={`h-full ${
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
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-blue-900/20 transition-all"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Task</span>
          </button>

          {/* Archived Toggle button if archived tasks exist */}
          {archivedTasks.length > 0 && (
            <button
              onClick={() => setShowArchived(prev => !prev)}
              className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-900 dark:text-white/50 dark:hover:text-white px-2.5 py-1.5 rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-[#141414] transition-colors"
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

      {/* Sections sorted by status headers */}
      <div className="p-4 sm:p-6 overflow-x-auto">
        <div className={`grid gap-4 min-w-[760px] ${
          showArchived ? 'grid-cols-5' : 'grid-cols-4'
        }`}>
          {COLUMNS.map(col => {
            const columnTasks = userTasks
              .filter(t => t.status === col.status)
              .sort((a, b) => a.order - b.order);

            const isDropActive = dragOverColumn === col.status;

            return (
              <div
                key={col.status}
                onDragOver={e => handleDragOver(e, col.status)}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDrop(e, col.status)}
                className={`flex flex-col rounded-xl border p-2.5 transition-all min-h-[220px] ${
                  isDropActive
                    ? 'border-blue-500/60 bg-blue-50/50 dark:bg-[#1A1A1A] ring-2 ring-blue-500/20'
                    : 'border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-[#141414]'
                }`}
              >
                {/* Status Column Header */}
                <div className="flex items-center justify-between pb-2.5 mb-2 border-b border-neutral-200 dark:border-white/5 px-1">
                  <div className="flex items-center gap-1.5">
                    {col.icon}
                    <h4 className={`text-[11px] uppercase tracking-wider font-semibold ${col.headerColor}`}>
                      {col.title}
                    </h4>
                    <span className="rounded-full bg-neutral-200 dark:bg-white/5 px-1.5 py-0.2 text-[10px] text-neutral-600 dark:text-white/40 border border-neutral-300 dark:border-white/5">
                      {columnTasks.length}
                    </span>
                  </div>

                  <button
                    onClick={() => onAddTask(user.id, col.status)}
                    title={`Add task to ${col.title}`}
                    className="rounded-md p-1 text-neutral-400 dark:text-white/30 hover:bg-neutral-200 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>

                {/* Tasks List */}
                <div className="flex-1 space-y-2.5">
                  {columnTasks.length === 0 ? (
                    <div
                      onClick={() => onAddTask(user.id, col.status)}
                      className={`flex h-28 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-3 text-center transition-colors ${
                        isDropActive
                          ? 'border-blue-500 bg-blue-50 dark:bg-[#1A1A1A]'
                          : 'border-neutral-300 dark:border-white/10 text-neutral-400 dark:text-white/30 hover:border-neutral-400 dark:hover:border-white/20 hover:bg-neutral-100 dark:hover:bg-white/5'
                      }`}
                    >
                      <Plus className="h-4 w-4 mb-1 text-neutral-400 dark:text-white/30" />
                      <p className="text-[11px] font-medium text-neutral-500 dark:text-white/40">No tasks</p>
                      <p className="text-[10px] text-neutral-400 dark:text-white/20">Drop here or click +</p>
                    </div>
                  ) : (
                    columnTasks.map(task => (
                      <div
                        key={task.id}
                        onDragOver={e => {
                          e.preventDefault();
                          setDragOverTaskId(task.id);
                        }}
                        onDrop={e => handleDropOnTask(e, task, col.status)}
                      >
                        <TaskCard
                          task={task}
                          onEdit={onEditTask}
                          onDelete={onDeleteTask}
                          onMoveStatus={onMoveTaskStatus}
                        />
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}

          {/* Archived Column (conditional) */}
          {showArchived && (
            <div
              onDragOver={e => handleDragOver(e, 'archived')}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, 'archived')}
              className={`flex flex-col rounded-xl border p-2.5 transition-all min-h-[220px] ${
                dragOverColumn === 'archived'
                  ? 'border-blue-500/60 bg-blue-50/50 dark:bg-[#1A1A1A] ring-2 ring-blue-500/20'
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
                {archivedTasks.length === 0 ? (
                  <div className="flex h-28 flex-col items-center justify-center rounded-lg border border-dashed border-neutral-300 dark:border-white/10 p-3 text-center text-[11px] text-neutral-400 dark:text-white/30">
                    <p>No archived tasks</p>
                  </div>
                ) : (
                  archivedTasks.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onEdit={onEditTask}
                      onDelete={onDeleteTask}
                      onMoveStatus={onMoveTaskStatus}
                    />
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

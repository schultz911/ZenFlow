import React, { useState } from 'react';
import { Task, TaskStatus } from '../types';
import { getDuePillInfo, formatDateOnly } from '../utils/workload';
import {
  GripVertical,
  Clock,
  Calendar,
  Edit2,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Archive,
} from 'lucide-react';

interface TaskCardProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onMoveStatus: (taskId: string, newStatus: TaskStatus) => void;
  isDraggable?: boolean;
}

const STATUS_SEQUENCE: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'done'];

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  onEdit,
  onDelete,
  onMoveStatus,
  isDraggable = true,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const pillInfo = getDuePillInfo(task.dueDate);

  // Next and Prev status for single-click progression
  const currentIdx = STATUS_SEQUENCE.indexOf(task.status);
  const nextStatus = currentIdx !== -1 && currentIdx < STATUS_SEQUENCE.length - 1 ? STATUS_SEQUENCE[currentIdx + 1] : null;
  const prevStatus = currentIdx > 0 ? STATUS_SEQUENCE[currentIdx - 1] : null;

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({
        taskId: task.id,
        status: task.status,
        userId: task.userId,
        order: task.order,
      })
    );
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  return (
    <div
      id={`task-card-${task.id}`}
      draggable={isDraggable}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={`group relative rounded-xl border p-3 transition-all duration-200 shadow-xs ${
        isDragging
          ? 'opacity-40 scale-95 border-dashed border-neutral-400 dark:border-white/30 bg-neutral-100 dark:bg-[#1A1A1A]'
          : task.status === 'done'
          ? 'bg-neutral-50/80 dark:bg-[#141414] opacity-75 border-neutral-200 dark:border-white/5 hover:border-neutral-300 dark:hover:border-white/10'
          : 'bg-white dark:bg-[#1A1A1A] border-neutral-200 dark:border-white/5 hover:border-neutral-300 dark:hover:border-white/15 hover:bg-neutral-50/50 dark:hover:bg-[#202020]'
      }`}
    >
      {/* Top row: Drag grip, urgency pill badge, and quick actions */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <div
            title="Drag to reorder or change status"
            className="cursor-grab active:cursor-grabbing text-neutral-400 dark:text-white/20 group-hover:text-neutral-700 dark:group-hover:text-white/60 transition-colors shrink-0"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </div>

          {/* Due / Overdue Colored Pill Badge */}
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium border ${pillInfo.badgeClass} truncate`}
          >
            <Clock className={`h-3 w-3 ${pillInfo.iconClass} shrink-0`} />
            <span className="truncate">{pillInfo.label}</span>
          </span>
        </div>

        {/* Quick Edit & Delete icons */}
        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-0.5 shrink-0">
          <button
            onClick={() => onEdit(task)}
            title="Edit Task"
            className="rounded p-1 text-neutral-400 dark:text-white/40 hover:bg-neutral-100 dark:hover:bg-white/10 hover:text-neutral-900 dark:hover:text-white transition-colors"
          >
            <Edit2 className="h-3 w-3" />
          </button>
          <button
            onClick={() => onDelete(task.id)}
            title="Delete Task"
            className="rounded p-1 text-neutral-400 dark:text-white/40 hover:bg-red-50 dark:hover:bg-red-500/20 hover:text-red-500 dark:hover:text-red-400 transition-colors"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Task Title */}
      <h4
        onClick={() => onEdit(task)}
        className={`text-xs font-medium leading-snug cursor-pointer transition-colors ${
          task.status === 'done'
            ? 'line-through text-neutral-400 dark:text-white/30'
            : 'text-neutral-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400'
        }`}
      >
        {task.title}
      </h4>

      {/* Bottom Row: Due date (standardized across all cards) & quick status stepper */}
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-neutral-100 dark:border-white/5 pt-2">
        <div className="flex items-center gap-1.5 text-[10px] text-neutral-500 dark:text-white/40">
          <Calendar className="h-3 w-3 text-neutral-400 dark:text-white/30" />
          <span>{formatDateOnly(task.dueDate)}</span>
        </div>

        {/* Quick status stepper button */}
        <div className="flex items-center gap-1">
          {prevStatus && (
            <button
              onClick={() => onMoveStatus(task.id, prevStatus)}
              title={`Move back to ${prevStatus.replace('_', ' ')}`}
              className="rounded p-1 text-neutral-400 dark:text-white/40 hover:bg-neutral-100 dark:hover:bg-white/10 hover:text-neutral-800 dark:hover:text-white transition-colors"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
          )}

          {nextStatus ? (
            <button
              onClick={() => onMoveStatus(task.id, nextStatus)}
              title={`Advance to ${nextStatus.replace('_', ' ')}`}
              className="inline-flex items-center gap-1 rounded-md bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 border border-neutral-200 dark:border-white/10 px-1.5 py-0.5 text-[10px] font-medium text-neutral-700 dark:text-white/70 hover:text-neutral-900 dark:hover:text-white transition-colors"
            >
              <span className="capitalize">{nextStatus.replace('_', ' ')}</span>
              <ChevronRight className="h-2.5 w-2.5" />
            </button>
          ) : task.status === 'done' ? (
            <button
              onClick={() => onMoveStatus(task.id, 'archived')}
              title="Archive this completed task"
              className="inline-flex items-center gap-1 rounded-md bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 border border-neutral-200 dark:border-white/10 px-1.5 py-0.5 text-[10px] text-neutral-500 dark:text-white/40 hover:text-neutral-900 dark:hover:text-white transition-colors"
            >
              <Archive className="h-2.5 w-2.5" />
              <span>Archive</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

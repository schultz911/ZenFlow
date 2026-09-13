import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Task, TaskStatus, Role } from '../types';
import { getDuePillInfo, formatDateOnly, getCognitiveLoadLabel } from '../utils/workload';
import { useDashboard } from '../context/DashboardContext';
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
  userRole?: Role;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onMoveStatus: (taskId: string, newStatus: TaskStatus) => void;
  isDraggable?: boolean;
}

const STATUS_SEQUENCE: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'done'];

export const TaskCard: React.FC<TaskCardProps> = React.memo(({
  task,
  userRole,
  onEdit,
  onDelete,
  onMoveStatus,
  isDraggable = true,
}) => {
  const { setActiveDragInfo, users } = useDashboard();
  const [isDragging, setIsDragging] = useState(false);

  const resolvedRole = userRole || users.find(u => u.id === task.userId)?.role || 'content';
  const pillInfo = getDuePillInfo(task.dueDate);
  const cognitiveLabel = getCognitiveLoadLabel(task.cognitiveLoad, resolvedRole);

  // Next and Prev status for single-click progression
  const currentIdx = STATUS_SEQUENCE.indexOf(task.status);
  const nextStatus = currentIdx !== -1 && currentIdx < STATUS_SEQUENCE.length - 1 ? STATUS_SEQUENCE[currentIdx + 1] : null;
  const prevStatus = currentIdx > 0 ? STATUS_SEQUENCE[currentIdx - 1] : null;

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    const dragPayload = {
      taskId: task.id,
      status: task.status,
      userId: task.userId,
      order: task.order,
      title: task.title,
    };

    e.dataTransfer.setData('application/json', JSON.stringify(dragPayload));
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.effectAllowed = 'move';

    setActiveDragInfo({
      taskId: task.id,
      sourceUserId: task.userId,
      sourceStatus: task.status,
      title: task.title,
    });
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    setActiveDragInfo(null);
  };

  return (
    <motion.div
      id={`task-card-${task.id}`}
      layout
      layoutId={`task-${task.id}`}
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{
        opacity: isDragging ? 0.35 : 1,
        y: 0,
        scale: isDragging ? 0.96 : 1,
        rotate: isDragging ? 1.5 : 0,
      }}
      exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.15 } }}
      transition={{
        type: 'spring',
        stiffness: 400,
        damping: 28,
        mass: 0.8,
      }}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.98 }}
      draggable={isDraggable}
      onDragStartCapture={handleDragStart}
      onDragEndCapture={handleDragEnd}
      className={`group relative rounded-xl border p-3 select-none transition-colors shadow-xs ${
        isDragging
          ? 'border-blue-500/60 bg-blue-50/50 dark:bg-blue-950/20 shadow-lg ring-2 ring-blue-500/20'
          : task.status === 'done'
          ? 'bg-neutral-50/80 dark:bg-[#141414] opacity-80 border-neutral-200 dark:border-white/5 hover:border-neutral-300 dark:hover:border-white/10'
          : 'bg-white dark:bg-[#1A1A1A] border-neutral-200 dark:border-white/5 hover:border-neutral-300 dark:hover:border-white/15 hover:bg-neutral-50/50 dark:hover:bg-[#202020]'
      }`}
    >
      {/* Top row: Drag grip, Due Clock icon badge & Cognitive load badge on same line, and Quick actions */}
      <div className="flex items-center justify-between gap-1.5 mb-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <div
            title="Drag to move, reorder, or assign to another team member"
            className="cursor-grab active:cursor-grabbing text-neutral-400 dark:text-white/20 group-hover:text-neutral-700 dark:group-hover:text-white/60 transition-colors shrink-0 p-0.5 -ml-1 rounded hover:bg-neutral-100 dark:hover:bg-white/5"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </div>

          {/* Due Clock Icon Badge (color-coded, compact micro size) */}
          <span
            title={pillInfo.label}
            className={`inline-flex items-center justify-center rounded-full p-1 border ${pillInfo.badgeClass}`}
          >
            <Clock className={`h-2.5 w-2.5 ${pillInfo.iconClass} shrink-0`} />
          </span>

          {/* Cognitive Load Dot Badge (compact micro size) */}
          <span
            title={`Cognitive Load: ${cognitiveLabel}`}
            className="inline-flex items-center gap-1 rounded-full bg-neutral-100 dark:bg-white/5 px-1.5 py-0.5 text-[9px] font-medium text-neutral-600 dark:text-white/60 border border-neutral-200 dark:border-white/5"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                task.cognitiveLoad === 'high'
                  ? 'bg-red-500'
                  : task.cognitiveLoad === 'medium'
                  ? 'bg-yellow-500'
                  : 'bg-green-500'
              }`}
            />
            <span className="capitalize">{task.cognitiveLoad}</span>
          </span>
        </div>

        {/* Quick Edit & Delete icons */}
        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-0.5 shrink-0">
          <button
            onClick={e => {
              e.stopPropagation();
              onEdit(task);
            }}
            title="Edit Task"
            className="rounded p-1 text-neutral-400 dark:text-white/40 hover:bg-neutral-100 dark:hover:bg-white/10 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            <Edit2 className="h-3 w-3" />
          </button>
          <button
            onClick={e => {
              e.stopPropagation();
              onDelete(task.id);
            }}
            title="Delete Task"
            className="rounded p-1 text-neutral-400 dark:text-white/40 hover:bg-red-50 dark:hover:bg-red-500/20 hover:text-red-500 dark:hover:text-red-400 transition-colors cursor-pointer"
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

      {/* Optional Context snippet */}
      {task.description && (
        <p className="mt-1 text-[11px] text-neutral-500 dark:text-white/40 line-clamp-2 leading-relaxed">
          {task.description}
        </p>
      )}

      {/* Bottom Row: Due date & quick status stepper */}
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-neutral-100 dark:border-white/5 pt-2">
        <div className="flex items-center gap-1 text-[10px] text-neutral-500 dark:text-white/40">
          <Calendar className="h-3 w-3 text-neutral-400 dark:text-white/30" />
          <span>{formatDateOnly(task.dueDate)}</span>
        </div>

        {/* Quick status stepper button */}
        <div className="flex items-center gap-1">
          {prevStatus && (
            <button
              onClick={e => {
                e.stopPropagation();
                onMoveStatus(task.id, prevStatus);
              }}
              title={`Move back to ${prevStatus.replace('_', ' ')}`}
              className="rounded p-1 text-neutral-400 dark:text-white/40 hover:bg-neutral-100 dark:hover:bg-white/10 hover:text-neutral-800 dark:hover:text-white transition-colors cursor-pointer"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
          )}

          {nextStatus ? (
            <button
              onClick={e => {
                e.stopPropagation();
                onMoveStatus(task.id, nextStatus);
              }}
              title={`Advance to ${nextStatus.replace('_', ' ')}`}
              className="inline-flex items-center gap-1 rounded-md bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 border border-neutral-200 dark:border-white/10 px-1.5 py-0.5 text-[10px] font-medium text-neutral-700 dark:text-white/70 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <span className="capitalize">{nextStatus.replace('_', ' ')}</span>
              <ChevronRight className="h-2.5 w-2.5" />
            </button>
          ) : task.status === 'done' ? (
            <button
              onClick={e => {
                e.stopPropagation();
                onMoveStatus(task.id, 'archived');
              }}
              title="Archive this completed task"
              className="inline-flex items-center gap-1 rounded-md bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 border border-neutral-200 dark:border-white/10 px-1.5 py-0.5 text-[10px] text-neutral-500 dark:text-white/40 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <Archive className="h-2.5 w-2.5" />
              <span>Archive</span>
            </button>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
});

TaskCard.displayName = 'TaskCard';


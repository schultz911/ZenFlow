import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User, Task } from '../types';
import { calculateUserWorkload, formatDueDate, getCognitiveLoadLabel, calculateWeeklyVelocity } from '../utils/workload';
import { X, TrendingUp, Clock, CheckCircle2 } from 'lucide-react';

interface WorkloadModalProps {
  user: User | null;
  tasks: Task[];
  isOpen: boolean;
  onClose: () => void;
}

export const WorkloadModal: React.FC<WorkloadModalProps> = ({
  user,
  tasks,
  isOpen,
  onClose,
}) => {
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  const userTasks = useMemo(() => {
    if (!isOpen || !user) return [];
    return tasks.filter(t => t.userId === user.id);
  }, [isOpen, tasks, user]);

  const workload = useMemo(() => {
    if (!isOpen || !user) return null;
    return calculateUserWorkload(userTasks);
  }, [isOpen, user, userTasks]);

  const velocity = useMemo(() => {
    if (!isOpen || !user) return null;
    return calculateWeeklyVelocity(userTasks);
  }, [isOpen, user, userTasks]);

  // Escape key dismissal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const maxBarHeight = 65;
  const maxCountScale = Math.max(3, velocity?.maxDayCount || 3);
  const activeHoverDay = velocity?.days.find(d => d.dateStr === hoveredDate);

  return (
    <AnimatePresence>
      {isOpen && user && workload && velocity && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs overflow-y-auto"
          onClick={e => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={e => e.stopPropagation()}
            id="workload-breakdown-modal"
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#0D0D0D] p-6 shadow-2xl transition-all text-neutral-900 dark:text-white"
          >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-neutral-100 dark:border-white/5 pb-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-tr ${
                user.avatarColor || 'from-blue-600 to-indigo-600'
              } text-white font-semibold text-sm border border-neutral-200 dark:border-white/10`}
            >
              {user.name
                .split(' ')
                .map(p => p[0])
                .join('')
                .toUpperCase()
                .slice(0, 2)}
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight text-neutral-900 dark:text-white flex items-center gap-2">
                <span>{user.name}</span>
                <span className="rounded-full bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-neutral-600 dark:text-white/40">
                  {user.role === 'content' ? 'Content' : 'Design'}
                </span>
              </h2>
              <p className="text-xs text-neutral-500 dark:text-white/40 mt-0.5">
                Workload Analytics & Task Overview
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Workload Score Banner */}
        <div className="mt-4 rounded-xl border border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-[#141414] p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-neutral-500 dark:text-white/40">
                Current Workload Index
              </span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-white">
                  {workload.totalScore}
                </span>
                <span className="text-xs text-neutral-500 dark:text-white/40">
                  points
                </span>
                <span className={`ml-2 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${workload.badgeBg} ${workload.badgeText}`}>
                  {workload.levelLabel}
                </span>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="flex items-center gap-4 text-xs border-t sm:border-t-0 sm:border-l border-neutral-200 dark:border-white/5 pt-2 sm:pt-0 sm:pl-4">
              <div>
                <p className="text-neutral-500 dark:text-white/40 text-[10px] uppercase tracking-wider">In Progress</p>
                <p className="font-semibold text-blue-600 dark:text-blue-400 mt-0.5">{workload.inProgressCount} tasks</p>
              </div>
              <div>
                <p className="text-neutral-500 dark:text-white/40 text-[10px] uppercase tracking-wider">To Do (Deadline)</p>
                <p className="font-semibold text-neutral-800 dark:text-white/80 mt-0.5">{workload.todoWithDeadlineCount} tasks</p>
              </div>
              <div>
                <p className="text-neutral-500 dark:text-white/40 text-[10px] uppercase tracking-wider">To Do (No Date)</p>
                <p className="font-semibold text-neutral-500 dark:text-white/40 mt-0.5">{workload.todoNoDeadlineCount} tasks</p>
              </div>
              <div>
                <p className="text-neutral-500 dark:text-white/40 text-[10px] uppercase tracking-wider">In Review</p>
                <p className="font-semibold text-purple-600 dark:text-purple-400 mt-0.5">{workload.inReviewCount} tasks</p>
              </div>
            </div>
          </div>

          {/* Visual capacity indicator */}
          <div className="mt-4">
            <div className="flex justify-between text-[10px] text-neutral-500 dark:text-white/40 mb-1.5 font-medium">
              <span>Light (0 - 3.9)</span>
              <span>Optimal (4 - 7.9)</span>
              <span>Heavy (8 - 11.9)</span>
              <span>Overload (12+)</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-white/10">
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
                style={{ width: `${Math.min(100, (workload.totalScore / 16) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* 7-Day Velocity & Throughput Micro-Sparkline */}
        <div className="mt-4 rounded-xl border border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-[#141414] p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-neutral-200/60 dark:border-white/5">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <TrendingUp className="h-3.5 w-3.5" />
              </div>
              <h3 className="text-xs uppercase tracking-wider font-semibold text-neutral-900 dark:text-white">
                7-Day Throughput Velocity
              </h3>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                <span>{velocity.totalCompleted7d} {velocity.totalCompleted7d === 1 ? 'task' : 'tasks'} cleared</span>
                <span className="text-[10px] opacity-75">({velocity.totalPointsCleared7d} pts)</span>
              </span>
              {velocity.avgLeadTimeStr && (
                <span
                  title="Average lead time from task creation to completion"
                  className="inline-flex items-center gap-1 rounded-full bg-neutral-200/70 dark:bg-white/5 border border-neutral-300 dark:border-white/10 px-2.5 py-0.5 text-[11px] font-medium text-neutral-700 dark:text-white/70"
                >
                  <Clock className="h-3 w-3 text-neutral-400 dark:text-white/40" />
                  <span>Avg Lead Time: {velocity.avgLeadTimeStr}</span>
                </span>
              )}
            </div>
          </div>

          {/* SVG Vector Sparkline Bar Chart */}
          <div className="mt-4 relative">
            <svg viewBox="0 0 560 135" className="w-full h-auto max-h-[160px] overflow-visible">
              <defs>
                <linearGradient id="emeraldBarGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#059669" />
                </linearGradient>
                <linearGradient id="todayBarGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#2563eb" />
                </linearGradient>
              </defs>

              {/* Grid Baseline */}
              <line x1="8" y1="96" x2="552" y2="96" stroke="currentColor" className="text-neutral-200 dark:text-white/10" strokeWidth="1" strokeDasharray="3 3" />

              {velocity.days.map((day, i) => {
                const colWidth = 56;
                const slotGap = 22;
                const slotX = 12 + i * (colWidth + slotGap);
                const barWidth = 44;
                const barX = slotX + (colWidth - barWidth) / 2;

                const hasCompleted = day.completedCount > 0;
                const barH = hasCompleted
                  ? Math.max(12, (day.completedCount / maxCountScale) * maxBarHeight)
                  : 4;
                const barY = 96 - barH;
                const isHovered = hoveredDate === day.dateStr;

                return (
                  <g
                    key={day.dateStr}
                    className="cursor-pointer group"
                    onMouseEnter={() => setHoveredDate(day.dateStr)}
                    onMouseLeave={() => setHoveredDate(null)}
                  >
                    {/* Background hover pillar */}
                    <rect
                      x={slotX}
                      y={8}
                      width={colWidth}
                      height={120}
                      rx={8}
                      className={`transition-colors ${
                        isHovered
                          ? 'fill-neutral-200/50 dark:fill-white/10'
                          : 'fill-transparent'
                      }`}
                    />

                    {/* Bar Pill */}
                    <rect
                      x={barX}
                      y={barY}
                      width={barWidth}
                      height={barH}
                      rx={hasCompleted ? 6 : 2}
                      className={`transition-all duration-200 ${
                        isHovered ? 'filter drop-shadow-[0_2px_8px_rgba(16,185,129,0.3)]' : ''
                      }`}
                      fill={
                        hasCompleted
                          ? day.isToday
                            ? 'url(#todayBarGrad)'
                            : 'url(#emeraldBarGrad)'
                          : 'currentColor'
                      }
                      opacity={hasCompleted ? (isHovered ? 1 : 0.9) : 0.15}
                    />

                    {/* Numerical Count on top of bar */}
                    {hasCompleted && (
                      <text
                        x={barX + barWidth / 2}
                        y={barY - 6}
                        textAnchor="middle"
                        className="text-[11px] font-bold fill-neutral-800 dark:fill-white select-none transition-all"
                      >
                        {day.completedCount}
                      </text>
                    )}

                    {/* Day label (Mon / Tue / Today) */}
                    <text
                      x={slotX + colWidth / 2}
                      y={112}
                      textAnchor="middle"
                      className={`text-[10px] select-none transition-colors ${
                        day.isToday
                          ? 'font-bold fill-blue-600 dark:fill-blue-400'
                          : isHovered
                          ? 'font-semibold fill-neutral-900 dark:fill-white'
                          : 'font-medium fill-neutral-500 dark:fill-white/40'
                      }`}
                    >
                      {day.dayLabel}
                    </text>

                    {/* Calendar date under day label (e.g. 19) */}
                    <text
                      x={slotX + colWidth / 2}
                      y={124}
                      textAnchor="middle"
                      className="text-[9px] fill-neutral-400 dark:fill-white/30 select-none"
                    >
                      {day.displayDate.split(' ')[1]}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Dynamic Hover Tooltip Banner */}
            <div className="min-h-[22px] mt-1 text-center">
              {activeHoverDay ? (
                <p className="text-[11px] font-medium text-neutral-700 dark:text-white/80 animate-in fade-in duration-100">
                  <span className="font-semibold text-neutral-900 dark:text-white">{activeHoverDay.displayDate} ({activeHoverDay.dayLabel}):</span>{' '}
                  {activeHoverDay.completedCount > 0 ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                      {activeHoverDay.completedCount} {activeHoverDay.completedCount === 1 ? 'task' : 'tasks'} completed ({activeHoverDay.completedPoints} cognitive points)
                    </span>
                  ) : (
                    <span className="text-neutral-400 dark:text-white/40">No completed tasks</span>
                  )}
                </p>
              ) : !velocity.hasData ? (
                <p className="text-[11px] text-neutral-400 dark:text-white/40">
                  No completed tasks in the last 7 days. Completing tasks will chart throughput here.
                </p>
              ) : (
                <p className="text-[10px] text-neutral-400 dark:text-white/40">
                  Hover over bars to view daily task completions and cognitive output.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Task by Task Breakdown Table: Active Tasks */}
        <div className="mt-5">
          <h3 className="text-xs uppercase tracking-wider font-semibold text-neutral-500 dark:text-white/40 mb-2">
            Active Tasks ({workload.items.length})
          </h3>
          {workload.items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-neutral-200 dark:border-white/10 p-4 text-center text-xs text-neutral-400 dark:text-white/30">
              No active tasks contributing to workload score.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-[#141414]">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-100 dark:bg-[#1A1A1A] text-[10px] uppercase tracking-wider text-neutral-500 dark:text-white/40 border-b border-neutral-200 dark:border-white/5">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Task</th>
                    <th className="py-2.5 px-3 font-semibold">Status</th>
                    <th className="py-2.5 px-3 font-semibold">Cognitive Load</th>
                    <th className="py-2.5 px-3 font-semibold">Due Date & Proximity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-white/5">
                  {workload.items.map(item => {
                    const dueInfo = formatDueDate(item.dueDate);
                    const loadLabel = getCognitiveLoadLabel(item.cognitiveLoad, user.role);

                    return (
                      <tr key={item.taskId} className="hover:bg-neutral-100/50 dark:hover:bg-white/5 transition-colors">
                        <td className="py-2 px-3 font-medium text-neutral-900 dark:text-white max-w-[180px] truncate">
                          {item.title}
                        </td>
                        <td className="py-2 px-3">
                          <span className="rounded bg-neutral-200/70 dark:bg-white/5 border border-neutral-300 dark:border-white/10 px-1.5 py-0.5 text-[10px] capitalize text-neutral-700 dark:text-white/70">
                            {item.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <span className="capitalize text-[11px] text-neutral-700 dark:text-white/70 font-medium">
                            {loadLabel}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-neutral-600 dark:text-white/60">
                          {item.status === 'in_review' ? (
                            <span className="text-purple-600 dark:text-purple-400 font-medium text-[11px]">
                              {item.billableHours !== undefined ? `${item.billableHours}h` : '0h'} billable ({item.calculatedScore} pts)
                            </span>
                          ) : item.hasDeadline ? (
                            <span className={dueInfo.isOverdue ? 'text-red-500 font-medium' : dueInfo.isToday ? 'text-yellow-600 dark:text-yellow-400 font-medium' : ''}>
                              {dueInfo.text}
                            </span>
                          ) : (
                            <span className="text-neutral-400 dark:text-white/30">None</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-blue-900/20 transition-all"
          >
            Close Breakdown
          </button>
        </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

import { DialogPanel } from './ui/DialogPanel';
import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User, Task } from '../types';
import { calculateUserWorkload, formatDueDate, formatTaskStatus, getCognitiveLoadLabel, calculateWeeklyVelocity, getUserTag, isTaskAssignedToUser, COGNITIVE_LOAD_WEIGHTS } from '../utils/workload';
import { X, TrendingUp, Clock, CheckCircle2 } from 'lucide-react';

interface WorkloadModalProps {
  user: User | null;
  tasks: Task[];
  isOpen: boolean;
  onClose: () => void;
  onSelectTask?: (taskId: string) => void;
}

export const WorkloadModal: React.FC<WorkloadModalProps> = ({
  user,
  tasks,
  isOpen,
  onClose,
  onSelectTask,
}) => {
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  const userTasks = useMemo(() => {
    if (!isOpen || !user) return [];
    return tasks.filter(t => isTaskAssignedToUser(t, user.id));
  }, [isOpen, tasks, user]);

  const workload = useMemo(() => {
    if (!isOpen || !user) return null;
    return calculateUserWorkload(userTasks);
  }, [isOpen, user, userTasks]);

  const velocity = useMemo(() => {
    if (!isOpen || !user) return null;
    return calculateWeeklyVelocity(userTasks);
  }, [isOpen, user, userTasks]);

  const maxBarHeight = 65;
  const maxCountScale = Math.max(3, velocity?.maxDayCount || 3);
  const activeHoverDay = velocity?.days?.find(d => d.dateStr === hoveredDate);

  return (
    <AnimatePresence>
      {isOpen && user && workload && velocity && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
          onClick={e => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <DialogPanel aria-label="Member workload" onClose={onClose} busy={false}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.16, ease: [0.2, 0.7, 0.2, 1] }}
            onClick={e => e.stopPropagation()}
            id="workload-breakdown-modal"
            className="w-full max-w-2xl my-auto flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="dialog-header">
              <div className="flex items-center gap-2.5 min-w-0">
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
                    <h2 className="text-sm font-bold tracking-tight text-[var(--text-primary)] truncate">
                      {user.name}
                    </h2>
                    <span className="ledger-badge">
                      {getUserTag(user).label}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] truncate">{user.email}</p>
                </div>
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

            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {/* Workload Score Ledger Frame */}
              <div className="ledger-frame">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3.5 bg-[var(--surface)]">
                  <div>
                    <span className="metric-label">Current Workload Index</span>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="metric-value text-[var(--text-primary)]">
                        {workload.totalScore}
                      </span>
                      <span className="text-xs text-[var(--text-secondary)]">pts</span>
                      {workload.level === 'overloaded' ? (
                        <span className="ledger-alert-badge ml-1">{workload.levelLabel}</span>
                      ) : (
                        <span className={`ml-1 text-xs font-semibold ${workload.badgeText}`}>
                          {workload.levelLabel}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Ruled Quick Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-[var(--border-subtle)] border-t sm:border-t-0 sm:border-l border-[var(--border-subtle)] pt-2.5 sm:pt-0 sm:pl-3 gap-y-2 text-xs tabular-nums">
                    <div className="pr-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">In Progress</p>
                      <p className={`font-semibold mt-0.5 ${workload.inProgressCount > 2 ? 'text-red-600 dark:text-red-400 font-bold' : 'text-[#1d4ed8] dark:text-blue-400'}`}>
                        {workload.inProgressCount > 2 ? `${workload.inProgressCount}/2` : workload.inProgressCount}
                      </p>
                    </div>
                    <div className="px-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">To Do (Dated)</p>
                      <p className="font-semibold text-[var(--text-primary)] mt-0.5">{workload.todoWithDeadlineCount}</p>
                    </div>
                    <div className="px-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">To Do (Undated)</p>
                      <p className="font-semibold text-[var(--text-secondary)] mt-0.5">{workload.todoNoDeadlineCount}</p>
                    </div>
                    <div className="pl-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">In Review</p>
                      <p className="font-semibold text-amber-700 dark:text-amber-400 mt-0.5">{workload.inReviewCount}</p>
                    </div>
                  </div>
                </div>

                {/* Visual capacity indicator */}
                <div className="px-4 py-3 bg-[var(--surface-muted)] border-t border-[var(--border-subtle)]">
                  <div className="flex justify-between text-[11px] tabular-nums text-[var(--text-secondary)] mb-1.5 font-medium">
                    <span>Light (0–3.9)</span>
                    <span>Optimal (4–7.9)</span>
                    <span>Heavy (8–11.9)</span>
                    <span>Overload (12+)</span>
                  </div>
                  <div className="metric-track !mt-0">
                    <div
                      className={`metric-fill ${
                        workload.level === 'overloaded'
                          ? '!bg-[var(--danger)]'
                          : workload.level === 'heavy'
                          ? '!bg-amber-600 dark:!bg-amber-400'
                          : workload.level === 'optimal'
                          ? '!bg-[var(--accent)]'
                          : '!bg-[var(--success)]'
                      }`}
                      style={{ width: `${workload.progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* 7-Day Velocity & Throughput */}
              <div className="ledger-frame">
                <div className="ledger-band flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" />
                    <h3 className="text-[11px] uppercase tracking-wider font-bold text-[var(--text-primary)]">
                      7-Day Throughput Velocity
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap tabular-nums">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>{velocity.totalCompleted7d} {velocity.totalCompleted7d === 1 ? 'task' : 'tasks'} cleared</span>
                      <span className="text-[var(--text-muted)] font-medium">({velocity.totalPointsCleared7d} pts)</span>
                    </span>
                    {velocity.avgLeadTimeStr && (
                      <span
                        title="Average lead time from task creation to completion"
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-secondary)]"
                      >
                        <span className="text-[var(--text-muted)]">·</span>
                        <Clock className="h-3 w-3 text-[var(--text-muted)]" />
                        <span>Avg Lead: {velocity.avgLeadTimeStr}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* SVG Bar Chart */}
                <div className="p-4 bg-[var(--surface)] relative">
                  <svg viewBox="0 0 560 135" className="w-full h-auto max-h-[155px] overflow-visible">
                    <line x1="8" y1="96" x2="552" y2="96" stroke="var(--border)" strokeWidth="1" />

                    {velocity.days.map((day, i) => {
                      const colWidth = 56;
                      const slotGap = 22;
                      const slotX = 12 + i * (colWidth + slotGap);
                      const barWidth = 40;
                      const barX = slotX + (colWidth - barWidth) / 2;

                      const hasCompleted = day.completedCount > 0;
                      const barH = hasCompleted
                        ? Math.max(10, (day.completedCount / maxCountScale) * maxBarHeight)
                        : 3;
                      const barY = 96 - barH;
                      const isHovered = hoveredDate === day.dateStr;

                      return (
                        <g
                          key={day.dateStr}
                          role="img"
                          tabIndex={0}
                          aria-label={`${day.displayDate} (${day.dayLabel}): ${day.completedCount} completed (${day.completedPoints} points)`}
                          className="group focus:outline-none"
                          onMouseEnter={() => setHoveredDate(day.dateStr)}
                          onMouseLeave={() => setHoveredDate(null)}
                          onFocus={() => setHoveredDate(day.dateStr)}
                          onBlur={() => setHoveredDate(null)}
                        >
                          <rect
                            x={slotX}
                            y={8}
                            width={colWidth}
                            height={120}
                            rx={6}
                            fill={isHovered ? 'var(--surface-subtle)' : 'transparent'}
                          />

                          <rect
                            x={barX}
                            y={barY}
                            width={barWidth}
                            height={barH}
                            rx={hasCompleted ? 4 : 1.5}
                            fill={
                              hasCompleted
                                ? day.isToday
                                  ? 'var(--accent)'
                                  : 'var(--success)'
                                : 'var(--border)'
                            }
                            opacity={hasCompleted ? (isHovered ? 1 : 0.88) : 0.7}
                          />

                          <text
                            x={barX + barWidth / 2}
                            y={hasCompleted ? barY - 6 : 86}
                            textAnchor="middle"
                            fill={hasCompleted ? 'var(--text-primary)' : 'var(--text-muted)'}
                            className={`text-[11px] tabular-nums select-none ${hasCompleted ? 'font-semibold' : 'font-medium opacity-70'}`}
                          >
                            {day.completedCount}
                          </text>

                          <text
                            x={slotX + colWidth / 2}
                            y={112}
                            textAnchor="middle"
                            fill={day.isToday ? 'var(--accent)' : isHovered ? 'var(--text-primary)' : 'var(--text-secondary)'}
                            className={`text-[11px] select-none ${day.isToday || isHovered ? 'font-semibold' : 'font-medium'}`}
                          >
                            {day.dayLabel}
                          </text>

                          <text
                            x={slotX + colWidth / 2}
                            y={124}
                            textAnchor="middle"
                            fill="var(--text-muted)"
                            className="text-[11px] tabular-nums select-none"
                          >
                            {day.displayDate.split(' ')[1]}
                          </text>
                        </g>
                      );
                    })}
                  </svg>

                  {/* Dynamic Hover Readout */}
                  <div className="min-h-[20px] mt-1.5 text-center tabular-nums">
                    {activeHoverDay ? (
                      <p className="text-[11px] font-medium text-[var(--text-secondary)]">
                        <span className="font-semibold text-[var(--text-primary)]">{activeHoverDay.displayDate} ({activeHoverDay.dayLabel}):</span>{' '}
                        {activeHoverDay.completedCount > 0 ? (
                          <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                            {activeHoverDay.completedCount} {activeHoverDay.completedCount === 1 ? 'task' : 'tasks'} completed ({activeHoverDay.completedPoints} pts)
                          </span>
                        ) : (
                          <span>No completed tasks</span>
                        )}
                      </p>
                    ) : !velocity.hasData ? (
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        No completed tasks in the last 7 days.
                      </p>
                    ) : (
                      <p className="text-[11px] text-[var(--text-muted)]">
                        Hover or focus bars to inspect daily completions and points.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Task by Task Breakdown Table */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  <h3 className="field-label !mb-0 tabular-nums">
                    Active Tasks ({workload.items.length})
                  </h3>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    Score = Cognitive load weight × Deadline proximity (12 pts cap)
                  </span>
                </div>
                {workload.items.length === 0 ? (
                  <p className="rounded-[7px] border border-dashed border-[var(--border)] p-4 text-center text-xs text-[var(--text-secondary)]">
                    No active tasks contributing to workload score.
                  </p>
                ) : (
                  <div role="region" aria-label="Active task workload breakdown. Scroll horizontally to see all columns." tabIndex={0} className="overflow-x-auto rounded-[7px] border border-[var(--border)] bg-[var(--surface)]">
                    <table className="w-full min-w-[560px] text-left text-xs">
                      <thead className="bg-[var(--surface-muted)] text-[11px] uppercase tracking-wider text-[var(--text-secondary)] border-b border-[var(--border)]">
                        <tr>
                          <th scope="col" className="py-2 px-3 font-semibold">Task</th>
                          <th scope="col" className="py-2 px-3 font-semibold whitespace-nowrap">Status</th>
                          <th scope="col" className="py-2 px-3 font-semibold">Cognitive Load</th>
                          <th scope="col" className="py-2 px-3 font-semibold whitespace-nowrap">Points</th>
                          <th scope="col" className="py-2 px-3 font-semibold">Due Date &amp; Proximity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)]">
                        {workload.items.map(item => {
                          const dueInfo = formatDueDate(item.dueDate);
                          const loadLabel = getCognitiveLoadLabel(item.cognitiveLoad, user.role);
                          const itemPoints = Math.round(item.calculatedScore * 100) / 100;

                          return (
                            <tr key={item.taskId} className="hover:bg-[var(--surface-muted)] transition-colors">
                              <td
                                title={item.title}
                                className="py-2 px-3 font-semibold text-[var(--text-primary)] max-w-[240px] truncate"
                              >
                                {onSelectTask ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onClose();
                                      onSelectTask(item.taskId);
                                    }}
                                    title={`Open "${item.title}" to edit or reassign`}
                                    className="text-left font-semibold text-[#1d4ed8] dark:text-blue-400 hover:underline truncate max-w-full block cursor-pointer"
                                  >
                                    {item.title}
                                  </button>
                                ) : (
                                  item.title
                                )}
                              </td>
                              <td className="py-2 px-3 whitespace-nowrap">
                                <span className="ledger-badge whitespace-nowrap">
                                  {formatTaskStatus(item.status)}
                                </span>
                              </td>
                              <td className="py-2 px-3">
                                <span className="text-[11px] text-[var(--text-primary)] font-medium">
                                  {loadLabel}
                                </span>
                                <span className="ml-1.5 text-[11px] text-[var(--text-muted)] capitalize tabular-nums">
                                  · {item.cognitiveLoad} ({COGNITIVE_LOAD_WEIGHTS[item.cognitiveLoad]}x)
                                </span>
                              </td>
                              <td className="py-2 px-3 whitespace-nowrap tabular-nums font-bold text-[var(--text-primary)]">
                                {itemPoints} pts
                              </td>
                              <td className="py-2 px-3 tabular-nums text-[var(--text-secondary)]">
                                {item.status === 'in_review' ? (
                                  <span className="text-amber-700 dark:text-amber-400 font-semibold text-[11px]">
                                    {item.billableHours !== undefined ? `${item.billableHours}h` : '0h'} billable
                                  </span>
                                ) : item.hasDeadline ? (
                                  <span className={dueInfo.isOverdue ? 'text-red-600 dark:text-red-400 font-semibold' : dueInfo.isToday ? 'text-amber-700 dark:text-amber-400 font-semibold' : ''}>
                                    {dueInfo.text}
                                  </span>
                                ) : (
                                  <span className="text-[var(--text-muted)]">None</span>
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
            </div>

            <div className="dialog-footer">
              <button
                type="button"
                data-autofocus
                onClick={onClose}
                className="button-primary"
              >
                Close Breakdown
              </button>
            </div>
          </DialogPanel>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

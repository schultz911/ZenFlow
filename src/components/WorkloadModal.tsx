import React from 'react';
import { User, Task } from '../types';
import { calculateUserWorkload, formatDueDate, getCognitiveLoadLabel } from '../utils/workload';
import { X, HelpCircle } from 'lucide-react';

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
  if (!isOpen || !user) return null;

  const userTasks = tasks.filter(t => t.userId === user.id);
  const workload = calculateUserWorkload(userTasks);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-sm p-4">
      <div
        id="workload-breakdown-modal"
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#0D0D0D] p-6 shadow-2xl transition-all animate-in fade-in zoom-in-95 duration-200 text-neutral-900 dark:text-white"
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
                    <th className="py-2.5 px-3 text-right font-semibold">Task Score</th>
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
                          {item.hasDeadline ? (
                            <span className={dueInfo.isOverdue ? 'text-red-500 font-medium' : dueInfo.isToday ? 'text-yellow-600 dark:text-yellow-400 font-medium' : ''}>
                              {dueInfo.text}
                            </span>
                          ) : (
                            <span className="text-neutral-400 dark:text-white/30">None</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-neutral-900 dark:text-white">
                          +{item.calculatedScore}
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
      </div>
    </div>
  );
};

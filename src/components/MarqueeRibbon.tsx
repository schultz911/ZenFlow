import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Task, User } from '../types';
import { getDaysRemaining } from '../utils/workload';
import { AlertTriangle, Clock } from 'lucide-react';

interface MarqueeRibbonProps {
  tasks: Task[];
  users: User[];
  onTaskClick: (task: Task) => void;
}

export const MarqueeRibbon: React.FC<MarqueeRibbonProps> = React.memo(({
  tasks,
  users,
  onTaskClick,
}) => {
  const userMap = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);

  // Single-pass filter: compute days once per task, derive counts inline — eliminates 2× redundant getDaysRemaining calls
  const { urgentTasks, overdueCount, dueTodayCount } = useMemo(() => {
    const filtered: Array<Task & { days: number }> = [];
    let overdue = 0;
    for (const t of tasks) {
      if (!t || t.status === 'done' || t.status === 'archived' || t.status === 'pipeline' || t.status === 'in_review') continue;
      const days = getDaysRemaining(t.dueDate);
      if (days !== null && days <= 0) {
        filtered.push({ ...t, days });
        if (days < 0) overdue++;
      }
    }
    filtered.sort((a, b) => a.days - b.days);
    return { urgentTasks: filtered, overdueCount: overdue, dueTodayCount: filtered.length - overdue };
  }, [tasks]);

  // Dynamically detect whether unique tasks exceed the container's viewport
  useEffect(() => {
    const checkOverflow = () => {
      if (!containerRef.current || !contentRef.current) return;
      const containerWidth = containerRef.current.clientWidth;
      const contentWidth = contentRef.current.scrollWidth;
      const uniqueWidth = shouldScroll ? contentWidth / 2 : contentWidth;
      setShouldScroll(uniqueWidth > containerWidth + 4);
    };

    checkOverflow();

    const ro = new ResizeObserver(() => {
      checkOverflow();
    });

    if (containerRef.current) ro.observe(containerRef.current);
    if (contentRef.current) ro.observe(contentRef.current);

    return () => ro.disconnect();
  }, [urgentTasks, shouldScroll]);

  if (urgentTasks.length === 0) {
    return null;
  }

  // Duplicate tasks for continuous seamless marquee ONLY if unique tasks exceed the viewport.
  // When they fit, render unique tasks once without repetition or animation.
  const displayList = shouldScroll ? [...urgentTasks, ...urgentTasks] : urgentTasks;

  return (
    <div
      id="due-tasks-marquee-ribbon"
      className="flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 dark:bg-red-950/20 px-3 py-2 text-xs shadow-xs backdrop-blur-sm overflow-hidden"
    >
      {/* Fixed Alert Pill on the Left */}
      <div className="flex items-center gap-1.5 rounded-xl bg-red-600 px-2.5 py-1 text-white shadow-xs shrink-0 z-10 select-none">
        <AlertTriangle className="h-3.5 w-3.5 animate-pulse" />
        <span className="text-[11px] font-bold uppercase tracking-wider">
          {overdueCount > 0 ? `${overdueCount} Overdue` : `${dueTodayCount} Due Today`}
        </span>
      </div>

      {/* Marquee Ticker (animates only when tasks exceed viewport) */}
      <div ref={containerRef} className="flex-1 overflow-hidden relative">
        <div
          ref={contentRef}
          className={`${
            shouldScroll ? 'animate-marquee gap-3 py-0.5' : 'flex items-center gap-3 py-0.5 overflow-x-auto no-scrollbar'
          }`}
        >
          {displayList.map((task, idx) => {
            const user = userMap.get(task.userId);
            // Use pre-computed days from useMemo — no redundant getDaysRemaining call
            const isOverdue = task.days < 0;

            return (
              <button
                key={`${task.id}-${idx}`}
                type="button"
                onClick={() => onTaskClick(task)}
                title={`Click to inspect or reschedule "${task.title}" (Assigned to ${user?.name || 'Unassigned'})`}
                className="flex items-center gap-2 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121212] hover:border-blue-500 dark:hover:border-blue-400 px-3 py-1 shadow-xs hover:shadow-md transition-all cursor-pointer shrink-0 group"
              >
                {/* Assignee Avatar & Name */}
                <div className="flex items-center gap-1.5">
                  <div
                    className={`h-4.5 w-4.5 rounded-full bg-gradient-to-tr ${
                      user?.avatarColor || 'from-blue-600 to-indigo-600'
                    } text-[9px] font-bold text-white flex items-center justify-center shrink-0 border border-white/10`}
                  >
                    {user?.name ? user.name[0].toUpperCase() : '?'}
                  </div>
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200 max-w-[110px] truncate text-[11px]">
                    {user?.name || 'Unassigned'}
                  </span>
                </div>

                <span className="text-neutral-300 dark:text-white/20 text-[10px]">•</span>

                {/* Task Title */}
                <span className="text-neutral-700 dark:text-white/80 max-w-[200px] truncate text-[11px] group-hover:text-blue-500 transition-colors">
                  {task.title}
                </span>

                {/* Urgency Badge */}
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${
                    isOverdue
                      ? 'bg-red-50 text-red-600 border-red-200 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/20'
                      : 'bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-500/15 dark:text-orange-400 dark:border-orange-500/20'
                  }`}
                >
                  <Clock className="h-2.5 w-2.5" />
                  <span>{isOverdue ? `${Math.abs(task.days)}d overdue` : 'Due Today'}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
});

MarqueeRibbon.displayName = 'MarqueeRibbon';


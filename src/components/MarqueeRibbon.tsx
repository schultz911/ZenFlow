import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Task, User } from '../types';
import { getDaysRemaining, getTaskAssigneeIds } from '../utils/workload';
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

  useEffect(() => {
    const checkOverflow = () => {
      if (!containerRef.current || !contentRef.current) return;
      if (window.matchMedia('(max-width: 639px)').matches) {
        setShouldScroll(false);
        return;
      }
      const containerWidth = containerRef.current.clientWidth;
      const contentWidth = contentRef.current.scrollWidth;
      const uniqueWidth = shouldScroll ? contentWidth / 2 : contentWidth;
      setShouldScroll(uniqueWidth > containerWidth + 8);
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

  const displayList = shouldScroll ? [...urgentTasks, ...urgentTasks] : urgentTasks;

  return (
    <div className="sticky top-[var(--header-height)] z-20 w-full bg-[var(--canvas)]/96 backdrop-blur-md border-b border-[var(--border-subtle)]">
      <div className="marquee-ribbon-layout mx-auto max-w-[1400px] py-1.5 [--ribbon-gutter:1rem] sm:[--ribbon-gutter:1.5rem] lg:[--ribbon-gutter:2rem]">
        <div
          id="due-tasks-marquee-ribbon"
          className="flex items-center gap-2 sm:gap-3 rounded-[10px] border border-red-200 dark:border-red-500/35 bg-[#fef2f2] dark:bg-[#231418] px-2.5 sm:px-3 py-1.5 text-xs overflow-hidden"
        >
          <div className="ledger-alert-badge shrink-0 z-10 select-none">
            <AlertTriangle aria-hidden="true" className="h-3 w-3 shrink-0" />
            <span className="uppercase tracking-wider">
              {overdueCount > 0 ? `${overdueCount} Overdue` : `${dueTodayCount} Due Today`}
            </span>
          </div>

          <div ref={containerRef} className="min-w-0 flex-1 overflow-hidden relative">
            <div
              ref={contentRef}
              className={`${
                shouldScroll
                  ? 'animate-marquee items-center divide-x divide-red-200/80 dark:divide-red-500/25'
                  : 'flex items-center divide-x divide-red-200/80 dark:divide-red-500/25 overflow-x-auto no-scrollbar'
              }`}
            >
              {displayList.map((task, idx) => {
                const isClone = shouldScroll && idx >= urgentTasks.length;
                const firstUid = getTaskAssigneeIds(task)[0];
                const user = firstUid ? userMap.get(firstUid) : undefined;
                const isOverdue = task.days < 0;

                return (
                  <button
                    key={`${task.id}-${idx}`}
                    type="button"
                    aria-hidden={isClone || undefined}
                    tabIndex={isClone ? -1 : undefined}
                    onClick={() => onTaskClick(task)}
                    title={`Click to inspect or reschedule "${task.title}" (Assigned to ${user?.name || 'Unassigned'})`}
                    className="mobile-tap-control flex items-center gap-1.5 px-2.5 first:pl-0.5 py-1.5 sm:py-0.5 sm:min-h-0 text-left transition-colors cursor-pointer shrink-0 group max-w-full"
                  >
                    <span className="font-semibold text-[var(--text-primary)] max-w-[70px] sm:max-w-[110px] truncate text-[11px]">
                      {user?.name || 'Unassigned'}
                    </span>
                    <span className="text-[var(--text-muted)] text-[11px] shrink-0">·</span>
                    <span className="text-[var(--text-secondary)] max-w-[92px] sm:max-w-[200px] truncate text-[11px] group-hover:text-[#1d4ed8] dark:group-hover:text-blue-400 transition-colors">
                      {task.title}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 tabular-nums text-[11px] font-semibold shrink-0 whitespace-nowrap ${
                        isOverdue
                          ? 'text-red-700 dark:text-red-400'
                          : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      <Clock aria-hidden="true" className="h-2.5 w-2.5 shrink-0" />
                      <span>{isOverdue ? `${Math.abs(task.days)}d late` : 'Today'}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

MarqueeRibbon.displayName = 'MarqueeRibbon';

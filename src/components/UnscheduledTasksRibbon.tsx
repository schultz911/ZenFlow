import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Task, User } from '../types';
import { getCognitiveLoadLabel } from '../utils/workload';
import { CalendarClock, Calendar, Clock } from 'lucide-react';

interface UnscheduledTasksRibbonProps {
  currentUser: User | null;
  tasks: Task[];
  users: User[];
  onTaskClick: (task: Task) => void;
  onReschedule?: (taskId: string, newDueDate: string | undefined) => void;
}

export const UnscheduledTasksRibbon: React.FC<UnscheduledTasksRibbonProps> = React.memo(({
  currentUser,
  tasks,
  users,
  onTaskClick,
  onReschedule,
}) => {
  const userMap = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);

  // Active unscheduled tasks ONLY for the active user (excluding done/archived)
  const myUnscheduledTasks = useMemo(() => {
    if (!currentUser) return [];
    return tasks.filter(t => t.userId === currentUser.id && !t.dueDate && t.status !== 'done' && t.status !== 'archived' && t.status !== 'pipeline' && t.status !== 'in_review');
  }, [tasks, currentUser]);


  // Quick Reschedule Flyout State for the ribbon items
  const [activeFlyoutTaskId, setActiveFlyoutTaskId] = useState<string | null>(null);
  const [flyoutPosition, setFlyoutPosition] = useState<{ top: number; left: number } | null>(null);
  const flyoutMenuRef = useRef<HTMLDivElement>(null);

  const openFlyout = useCallback((taskId: string, buttonElement: HTMLElement) => {
    const rect = buttonElement.getBoundingClientRect();
    const popupHeight = 240;
    const popupWidth = 192;
    const openAbove = rect.top >= popupHeight + 10;
    const top = openAbove ? rect.top - popupHeight - 6 : rect.bottom + 6;
    const left = Math.max(10, Math.min(rect.left, window.innerWidth - popupWidth - 10));
    setFlyoutPosition({ top, left });
    setActiveFlyoutTaskId(taskId);
  }, []);

  const closeFlyout = useCallback(() => {
    setActiveFlyoutTaskId(null);
    setFlyoutPosition(null);
  }, []);

  // Dismiss flyout on outside click or scroll
  useEffect(() => {
    if (!activeFlyoutTaskId) return;

    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (flyoutMenuRef.current && !flyoutMenuRef.current.contains(target)) {
        closeFlyout();
      }
    };

    const handleScrollOrResize = () => {
      closeFlyout();
    };

    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [activeFlyoutTaskId, closeFlyout]);

  const handleQuickSnooze = useCallback((taskId: string, daysToAdd: number) => {
    const target = new Date();
    target.setDate(target.getDate() + daysToAdd);
    const yyyy = target.getFullYear();
    const mm = String(target.getMonth() + 1).padStart(2, '0');
    const dd = String(target.getDate()).padStart(2, '0');
    const newDueDate = `${yyyy}-${mm}-${dd}`;
    closeFlyout();
    onReschedule?.(taskId, newDueDate);
  }, [closeFlyout, onReschedule]);

  const handleCustomDateSelect = useCallback((taskId: string, dateStr: string) => {
    closeFlyout();
    onReschedule?.(taskId, dateStr || undefined);
  }, [closeFlyout, onReschedule]);

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
  }, [myUnscheduledTasks, shouldScroll]);

  // Duplicate tasks for seamless marquee ONLY if tasks exceed viewport width
  const displayList = shouldScroll ? [...myUnscheduledTasks, ...myUnscheduledTasks] : myUnscheduledTasks;

  // Gate: Render nothing if no user is logged in or active user has no unscheduled tasks
  if (!currentUser || myUnscheduledTasks.length === 0) {
    return null;
  }

  return (
    <div
      id="unscheduled-tasks-prompt-ribbon"
      className="mb-4 flex items-center gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/5 dark:bg-amber-950/20 px-3 py-2 text-xs shadow-xs backdrop-blur-sm overflow-hidden"
    >
      {/* Left Alert Pill & Prompt */}
      <div className="flex items-center gap-2 shrink-0 z-10 select-none">
        <div className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-2.5 py-1 text-white shadow-xs">
          <CalendarClock className="h-3.5 w-3.5" />
          <span className="text-[11px] font-bold uppercase tracking-wider">
            Set Deadlines
          </span>
        </div>

        {/* Personalized prompt directed strictly to the logged in user */}
        <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-neutral-600 dark:text-white/70">
          <span>
            Hi <strong className="font-semibold text-neutral-900 dark:text-white">{currentUser.name}</strong>,
          </span>
          <span>
            you have <strong className="font-bold text-amber-600 dark:text-amber-400">{myUnscheduledTasks.length}</strong> unscheduled {myUnscheduledTasks.length === 1 ? 'task' : 'tasks'}:
          </span>
        </div>
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
            const cognitiveLabel = getCognitiveLoadLabel(task.cognitiveLoad, user?.role);

            return (
              <div
                key={`${task.id}-${idx}`}
                className="flex items-center gap-2 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121212] hover:border-amber-500/60 dark:hover:border-amber-400/60 pl-3 pr-2 py-1 shadow-xs hover:shadow-md transition-all shrink-0 group"
              >
                {/* Assignee Avatar & Name */}
                <div
                  className="flex items-center gap-1.5 cursor-pointer"
                  onClick={() => onTaskClick(task)}
                >
                  <div
                    className={`h-4.5 w-4.5 rounded-full bg-gradient-to-tr ${
                      user?.avatarColor || 'from-amber-600 to-orange-600'
                    } text-[9px] font-bold text-white flex items-center justify-center shrink-0 border border-white/10`}
                  >
                    {user?.name ? user.name[0].toUpperCase() : '?'}
                  </div>
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200 max-w-[100px] truncate text-[11px]">
                    {user?.name || 'Unassigned'}
                  </span>
                </div>

                <span className="text-neutral-300 dark:text-white/20 text-[10px]">•</span>

                {/* Task Title */}
                <button
                  type="button"
                  onClick={() => onTaskClick(task)}
                  title={`Click to open "${task.title}" and set deadline`}
                  className="text-neutral-700 dark:text-white/80 max-w-[180px] truncate text-[11px] font-medium text-left hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer"
                >
                  {task.title}
                </button>

                {/* Cognitive load dot */}
                <span
                  title={`Cognitive Load: ${cognitiveLabel}`}
                  className="inline-flex items-center gap-1 rounded-full bg-neutral-100 dark:bg-white/5 px-1.5 py-0.5 text-[9px] font-medium text-neutral-600 dark:text-white/60 border border-neutral-200 dark:border-white/5 shrink-0"
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

                {/* Direct "+ Set Deadline" Action Button */}
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    openFlyout(task.id, e.currentTarget);
                  }}
                  title="Quick-set deadline for this task"
                  className="inline-flex items-center gap-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 px-2 py-0.5 text-[10px] font-medium transition-colors cursor-pointer shrink-0"
                >
                  <Calendar className="h-2.5 w-2.5 shrink-0" />
                  <span>+ Set</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Reschedule Datepicker Popover */}
      {activeFlyoutTaskId && flyoutPosition && createPortal(
        <div
          ref={flyoutMenuRef}
          style={{ top: `${flyoutPosition.top}px`, left: `${flyoutPosition.left}px` }}
          onClick={e => e.stopPropagation()}
          className="fixed z-[9999] w-48 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121212] p-1.5 shadow-2xl text-neutral-900 dark:text-white animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="px-2 py-1 border-b border-neutral-100 dark:border-white/5 text-[10px] font-semibold text-neutral-400 dark:text-white/40 uppercase tracking-wider flex items-center justify-between">
            <span>Set Deadline</span>
            <Clock className="h-3 w-3 text-amber-500" />
          </div>
          <div className="mt-1 space-y-0.5">
            <button
              type="button"
              onClick={() => handleQuickSnooze(activeFlyoutTaskId, 0)}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-[11px] text-neutral-700 dark:text-white/80 hover:bg-neutral-100 dark:hover:bg-white/10 cursor-pointer transition-colors"
            >
              <span>Due Today</span>
              <span className="text-[10px] font-semibold text-amber-500">Today</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickSnooze(activeFlyoutTaskId, 1)}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-[11px] text-neutral-700 dark:text-white/80 hover:bg-neutral-100 dark:hover:bg-white/10 cursor-pointer transition-colors"
            >
              <span>Tomorrow</span>
              <span className="text-[10px] text-neutral-400 dark:text-white/40">+1d</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickSnooze(activeFlyoutTaskId, 2)}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-[11px] text-neutral-700 dark:text-white/80 hover:bg-neutral-100 dark:hover:bg-white/10 cursor-pointer transition-colors"
            >
              <span>In 2 days</span>
              <span className="text-[10px] text-neutral-400 dark:text-white/40">+2d</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickSnooze(activeFlyoutTaskId, 3)}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-[11px] text-neutral-700 dark:text-white/80 hover:bg-neutral-100 dark:hover:bg-white/10 cursor-pointer transition-colors"
            >
              <span>In 3 days</span>
              <span className="text-[10px] text-neutral-400 dark:text-white/40">+3d</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickSnooze(activeFlyoutTaskId, 7)}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-[11px] text-neutral-700 dark:text-white/80 hover:bg-neutral-100 dark:hover:bg-white/10 cursor-pointer transition-colors"
            >
              <span>Next week</span>
              <span className="text-[10px] text-neutral-400 dark:text-white/40">+7d</span>
            </button>

            {/* Custom date picker input */}
            <div className="pt-1 mt-1 border-t border-neutral-100 dark:border-white/5 px-2">
              <label className="block text-[9px] uppercase tracking-wider font-semibold text-neutral-400 dark:text-white/40 mb-1">
                Pick Custom Date
              </label>
              <input
                type="date"
                onChange={e => {
                  if (e.target.value) {
                    handleCustomDateSelect(activeFlyoutTaskId, e.target.value);
                  }
                }}
                className="w-full rounded-md border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-white/5 px-1.5 py-1 text-[11px] text-neutral-800 dark:text-white/90 cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
});

UnscheduledTasksRibbon.displayName = 'UnscheduledTasksRibbon';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User, Task, TaskStatus } from '../types';
import { getUserTag } from '../utils/workload';
import {
  Users,
  ChevronDown,
  ChevronUp,
  Plus,
  CheckCircle2,
  Sparkles,
  ArrowUpRight,
} from 'lucide-react';

interface FreePoolContainerProps {
  users: User[];
  tasks: Task[];
  onAddTask: (userId: string, status?: TaskStatus) => void;
  onSelectUser?: (user: User) => void;
}

export const FreePoolContainer: React.FC<FreePoolContainerProps> = ({
  users,
  tasks,
  onAddTask,
  onSelectUser,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('zenflow_freepool_expanded');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const [roleFilter, setRoleFilter] = useState<'all' | 'content' | 'design' | 'video' | 'ui_ux'>('all');

  const toggleExpanded = () => {
    setIsExpanded(prev => {
      const next = !prev;
      try {
        localStorage.setItem('zenflow_freepool_expanded', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Compute active task counts (To-Do + In Progress) for each user across ALL boards
  const { freeUsers, userStats } = useMemo(() => {
    const activeCounts = new Map<string, number>();
    const inReviewCounts = new Map<string, number>();
    const pipelineCounts = new Map<string, number>();

    for (const t of tasks) {
      if (!t || !t.userId) continue;
      if (t.status === 'todo' || t.status === 'in_progress') {
        activeCounts.set(t.userId, (activeCounts.get(t.userId) || 0) + 1);
      } else if (t.status === 'in_review') {
        inReviewCounts.set(t.userId, (inReviewCounts.get(t.userId) || 0) + 1);
      } else if (t.status === 'pipeline') {
        pipelineCounts.set(t.userId, (pipelineCounts.get(t.userId) || 0) + 1);
      }
    }

    const free: User[] = [];
    const stats = new Map<string, { inReview: number; pipeline: number }>();

    for (const u of users) {
      const active = activeCounts.get(u.id) || 0;
      stats.set(u.id, {
        inReview: inReviewCounts.get(u.id) || 0,
        pipeline: pipelineCounts.get(u.id) || 0,
      });

      // Free pool: resources with ZERO tasks in To-Do and In Progress
      if (active === 0) {
        free.push(u);
      }
    }

    return { freeUsers: free, userStats: stats };
  }, [users, tasks]);

  // Filtered by selected role tab
  const filteredFreeUsers = useMemo(() => {
    if (roleFilter === 'all') return freeUsers;
    return freeUsers.filter(u => u.role === roleFilter);
  }, [freeUsers, roleFilter]);

  const contentCount = useMemo(() => freeUsers.filter(u => u.role === 'content').length, [freeUsers]);
  const designCount = useMemo(() => freeUsers.filter(u => u.role === 'design').length, [freeUsers]);
  const videoCount = useMemo(() => freeUsers.filter(u => u.role === 'video').length, [freeUsers]);
  const uiUxCount = useMemo(() => freeUsers.filter(u => u.role === 'ui_ux').length, [freeUsers]);

  return (
    <div className="fixed bottom-5 right-5 z-40 select-none">
      <AnimatePresence mode="wait">
        {!isExpanded ? (
          /* Collapsed Pill Button */
          <motion.button
            key="collapsed"
            type="button"
            layout
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={toggleExpanded}
            className="group flex items-center gap-2.5 px-3.5 py-2 rounded-full border border-neutral-200/90 dark:border-white/10 bg-white/95 dark:bg-[#141414]/95 backdrop-blur-md shadow-lg hover:shadow-xl dark:shadow-black/40 hover:border-emerald-500/50 transition-all cursor-pointer"
            title="Click to view free resources pool"
          >
            {/* Pulsing Emerald Dot */}
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>

            <span className="text-xs font-semibold text-neutral-900 dark:text-white">
              Free Pool
            </span>

            <span className="flex items-center justify-center px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40">
              {freeUsers.length}
            </span>

            {/* Micro stacked avatar previews */}
            {freeUsers.length > 0 && (
              <div className="flex -space-x-1.5 overflow-hidden ml-0.5">
                {freeUsers.slice(0, 3).map(u => (
                  <div
                    key={u.id}
                    className={`inline-flex items-center justify-center h-4.5 w-4.5 rounded-full ring-1 ring-white dark:ring-[#141414] overflow-hidden text-[9px] font-bold text-white bg-gradient-to-br ${
                      u.avatarColor || 'from-blue-600 to-indigo-600'
                    }`}
                  >
                    {(u.name || '?').charAt(0).toUpperCase()}
                  </div>
                ))}
                {freeUsers.length > 3 && (
                  <div className="inline-flex items-center justify-center h-4.5 w-4.5 rounded-full ring-1 ring-white dark:ring-[#141414] bg-neutral-100 dark:bg-neutral-800 text-[8px] font-bold text-neutral-500 dark:text-white/60">
                    +{freeUsers.length - 3}
                  </div>
                )}
              </div>
            )}

            <ChevronUp className="h-3.5 w-3.5 text-neutral-400 dark:text-white/40 group-hover:text-neutral-700 dark:group-hover:text-white transition-colors" />
          </motion.button>
        ) : (
          /* Expanded Floating Container */
          <motion.div
            key="expanded"
            layout
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="w-80 sm:w-88 rounded-2xl border border-neutral-200/90 dark:border-white/10 bg-white/95 dark:bg-[#121212]/95 backdrop-blur-md shadow-2xl dark:shadow-black/70 overflow-hidden flex flex-col max-h-[460px]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-neutral-100 dark:border-white/5 bg-neutral-50/70 dark:bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-bold text-neutral-900 dark:text-white flex items-center gap-1.5">
                  <span>Free Pool</span>
                  <Sparkles className="h-3 w-3 text-emerald-500" />
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100/80 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300/40 dark:border-emerald-700/40">
                  {freeUsers.length} Available
                </span>
              </div>

              <button
                type="button"
                onClick={toggleExpanded}
                className="p-1 rounded-lg hover:bg-neutral-200/60 dark:hover:bg-white/10 text-neutral-400 dark:text-white/40 hover:text-neutral-700 dark:hover:text-white transition-colors cursor-pointer"
                title="Minimize Free Pool"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>

            {/* Context Subtitle */}
            <div className="px-3.5 py-1.5 bg-emerald-50/40 dark:bg-emerald-950/20 border-b border-emerald-100/40 dark:border-emerald-900/20 text-[10px] text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
              <span>0 tasks in To-Do & In Progress across boards</span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">Ready to assign</span>
            </div>

            {/* Role Filter Tabs */}
            <div className="flex items-center gap-1 px-3.5 py-2 border-b border-neutral-100 dark:border-white/5 bg-white dark:bg-[#121212]">
              <button
                type="button"
                onClick={() => setRoleFilter('all')}
                className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-all cursor-pointer ${
                  roleFilter === 'all'
                    ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-xs'
                    : 'text-neutral-500 dark:text-white/50 hover:bg-neutral-100 dark:hover:bg-white/5'
                }`}
              >
                All ({freeUsers.length})
              </button>
              <button
                type="button"
                onClick={() => setRoleFilter('content')}
                className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-all cursor-pointer ${
                  roleFilter === 'content'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-neutral-500 dark:text-white/50 hover:bg-neutral-100 dark:hover:bg-white/5'
                }`}
              >
                Content ({contentCount})
              </button>
              <button
                type="button"
                onClick={() => setRoleFilter('design')}
                className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-all cursor-pointer ${
                  roleFilter === 'design'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-neutral-500 dark:text-white/50 hover:bg-neutral-100 dark:hover:bg-white/5'
                }`}
              >
                Design ({designCount})
              </button>
              <button
                type="button"
                onClick={() => setRoleFilter('video')}
                className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-all cursor-pointer ${
                  roleFilter === 'video'
                    ? 'bg-violet-600 text-white shadow-xs'
                    : 'text-neutral-500 dark:text-white/50 hover:bg-neutral-100 dark:hover:bg-white/5'
                }`}
              >
                Video ({videoCount})
              </button>
              <button
                type="button"
                onClick={() => setRoleFilter('ui_ux')}
                className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-all cursor-pointer ${
                  roleFilter === 'ui_ux'
                    ? 'bg-cyan-600 text-white shadow-xs'
                    : 'text-neutral-500 dark:text-white/50 hover:bg-neutral-100 dark:hover:bg-white/5'
                }`}
              >
                UI/UX ({uiUxCount})
              </button>
            </div>

            {/* Member List */}
            <div className="overflow-y-auto max-h-64 divide-y divide-neutral-100 dark:divide-white/5 p-1.5">
              {filteredFreeUsers.length === 0 ? (
                <div className="py-6 px-4 text-center">
                  <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 dark:bg-white/5 text-neutral-400 dark:text-white/30 mb-2">
                    {freeUsers.length === 0 ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <Users className="h-5 w-5" />
                    )}
                  </div>
                  <p className="text-xs font-semibold text-neutral-800 dark:text-white">
                    {freeUsers.length === 0 ? 'All resources are active' : `No free ${roleFilter} members`}
                  </p>
                  <p className="mt-0.5 text-[10px] text-neutral-500 dark:text-white/40 max-w-xs mx-auto">
                    {freeUsers.length === 0
                      ? 'Every team member across all boards has active tasks in To-Do or In Progress.'
                      : `Try switching to another role tab or wait for tasks to complete.`}
                  </p>
                </div>
              ) : (
                filteredFreeUsers.map(user => {
                  const stats = userStats.get(user.id);
                  const tagInfo = getUserTag(user);

                  return (
                    <div
                      key={user.id}
                      onClick={() => onSelectUser?.(user)}
                      className="group flex items-center justify-between p-2 rounded-xl hover:bg-neutral-50 dark:hover:bg-white/[0.04] transition-colors cursor-pointer"
                    >
                      {/* Left: Avatar + Details */}
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <div className="relative shrink-0">
                          <div
                            className={`h-7 w-7 rounded-full overflow-hidden text-xs font-bold flex items-center justify-center text-white bg-gradient-to-br ${
                              user.avatarColor || 'from-blue-600 to-indigo-600'
                            }`}
                          >
                            {(user.name || '?').charAt(0).toUpperCase()}
                          </div>
                          {/* Live Available Dot */}
                          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-[#121212] bg-emerald-500" />
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-neutral-900 dark:text-white truncate">
                              {user.name}
                            </span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[9px] uppercase tracking-wider border ${tagInfo.badgeClass}`}
                            >
                              {tagInfo.label}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 text-[10px] text-neutral-400 dark:text-white/40 mt-0.5">
                            {stats && stats.inReview > 0 ? (
                              <span>{stats.inReview} in review</span>
                            ) : stats && stats.pipeline > 0 ? (
                              <span>{stats.pipeline} in pipeline</span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium">All lanes clear</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Quick Action Buttons */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            onAddTask(user.id, 'todo');
                          }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-semibold shadow-xs transition-colors cursor-pointer"
                          title={`Assign task to ${user.name}`}
                        >
                          <Plus className="h-3 w-3" />
                          <span>Task</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onSelectUser?.(user)}
                          className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                          title="View board swimlane"
                        >
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

import { Task, WorkloadBreakdown, TaskScoreItem, CognitiveLoad, Role } from '../types';

export const COGNITIVE_LOAD_WEIGHTS: Record<CognitiveLoad, number> = {
  low: 1.0,
  medium: 2.0,
  high: 3.0,
};

/**
 * Returns role-tailored cognitive load naming
 * Content: Low (Content Writing), Medium (Creative Concept), High (Strategy and Planning)
 * Design: Low (Adaptive Design), Medium (Conceptual Design), High (Identity Design)
 */
export function getCognitiveLoadLabel(load: CognitiveLoad, role: Role = 'content'): string {
  if (role === 'design') {
    switch (load) {
      case 'low':
        return 'Adaptive Design';
      case 'medium':
        return 'Conceptual Design';
      case 'high':
        return 'Identity Design';
      default:
        return 'Conceptual Design';
    }
  } else {
    // Content
    switch (load) {
      case 'low':
        return 'Content Writing';
      case 'medium':
        return 'Creative Concept';
      case 'high':
        return 'Strategy and Planning';
      default:
        return 'Creative Concept';
    }
  }
}

/**
 * Calculates days remaining from today (local time) to the task's due date.
 * Negative number means overdue.
 */
export function getDaysRemaining(dueDateStr?: string): number | null {
  if (!dueDateStr) return null;
  const targetDate = new Date(dueDateStr + 'T23:59:59');
  if (isNaN(targetDate.getTime())) return null;

  const now = new Date();
  const diffTime = targetDate.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Proximity to deadline multiplier based on urgency.
 */
export function getProximityMultiplier(daysRemaining: number | null): number {
  if (daysRemaining === null) return 1.0;
  if (daysRemaining < 0) return 1.5; // Overdue: 1.5x urgency
  if (daysRemaining <= 1) return 1.4; // Due today/tomorrow: 1.4x
  if (daysRemaining <= 3) return 1.25; // Due within 3 days: 1.25x
  if (daysRemaining <= 7) return 1.1; // Due this week: 1.1x
  return 1.0; // > 1 week away
}

/**
 * Formats due date nicely for visual display.
 */
export function formatDueDate(dueDateStr?: string): { text: string; isOverdue: boolean; isToday: boolean; isSoon: boolean } {
  if (!dueDateStr) return { text: 'No deadline', isOverdue: false, isToday: false, isSoon: false };

  const days = getDaysRemaining(dueDateStr);
  const parts = dueDateStr.split('-');
  const dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const formatted = `${monthNames[dateObj.getMonth()]} ${dateObj.getDate()}`;

  if (days === null) {
    return { text: formatted, isOverdue: false, isToday: false, isSoon: false };
  }

  if (days < 0) {
    return { text: `${formatted} (${Math.abs(days)}d overdue)`, isOverdue: true, isToday: false, isSoon: false };
  }
  if (days === 0) {
    return { text: `${formatted} (Today)`, isOverdue: false, isToday: true, isSoon: true };
  }
  if (days === 1) {
    return { text: `${formatted} (Tomorrow)`, isOverdue: false, isToday: false, isSoon: true };
  }
  if (days <= 3) {
    return { text: `${formatted} (in ${days}d)`, isOverdue: false, isToday: false, isSoon: true };
  }

  return { text: formatted, isOverdue: false, isToday: false, isSoon: false };
}

export interface DuePillInfo {
  label: string;
  badgeClass: string;
  iconClass: string;
  isOverdue: boolean;
}

/**
 * Formats just the calendar date for bottom-left display (e.g., 'Sep 5', or 'No deadline').
 */
export function formatDateOnly(dueDateStr?: string): string {
  if (!dueDateStr) return 'No deadline';
  const parts = dueDateStr.split('-');
  if (parts.length < 3) return dueDateStr;
  const dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  if (isNaN(dateObj.getTime())) return dueDateStr;
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[dateObj.getMonth()]} ${dateObj.getDate()}`;
}

/**
 * Formats the completion date for bottom-left display on done/archived cards (e.g., 'Sep 19' or 'Completed').
 */
export function formatCompletedDate(completedAtStr?: string): string {
  if (!completedAtStr) return 'Completed';
  const dateObj = new Date(completedAtStr);
  if (isNaN(dateObj.getTime())) return 'Completed';
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[dateObj.getMonth()]} ${dateObj.getDate()}`;
}

/**
 * Default comparator for column tasks:
 * Sorts by deadline from nearest to farthest, placing tasks with no deadline at the bottom.
 * If deadlines are equal (or both absent), breaks ties cleanly:
 * - In done/archived: most recently completed first (completedAt descending), then task order.
 * - In active columns: task order.
 */
export function compareTasksByDeadline(a: Task, b: Task, status?: string): number {
  const currentStatus = status || a.status;

  // Pipeline tasks have no deadline; sort strictly by order
  if (currentStatus === 'pipeline') {
    return (a.order ?? 0) - (b.order ?? 0);
  }

  // 1. Both have dueDate: sort ascending by dueDate (nearest deadline first)
  if (a.dueDate && b.dueDate) {
    const cmp = a.dueDate.localeCompare(b.dueDate);
    if (cmp !== 0) return cmp;
    if ((currentStatus === 'done' || currentStatus === 'archived') && a.completedAt && b.completedAt) {
      const timeDiff = new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
      if (timeDiff !== 0) return timeDiff;
    }
    return (a.order ?? 0) - (b.order ?? 0);
  }

  // 2. Nearest to farthest / no deadline: task with dueDate comes before task without dueDate
  if (a.dueDate && !b.dueDate) return -1;
  if (!a.dueDate && b.dueDate) return 1;

  // 3. Neither has dueDate:
  if (currentStatus === 'done' || currentStatus === 'archived') {
    const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
    const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
    if (aTime !== bTime) {
      return bTime - aTime;
    }
  }

  return (a.order ?? 0) - (b.order ?? 0);
}

/**
 * Provides color mappings and labels for the due date chip and clock icon based on proximity:
 * - Red: Overdue (< 0 days)
 * - Orange: 2, 1, or today (0 - 2 days)
 * - Yellow: > 2 days (3 - 4 days)
 * - Green: > 4 days (5 - 7 days)
 * - Grey: > 7 days or no deadline
 */
export function getDateChipStyle(dueDateStr?: string): DuePillInfo {
  if (!dueDateStr) {
    return {
      label: 'No deadline',
      badgeClass: 'bg-neutral-100 text-neutral-500 border-neutral-200 dark:bg-white/5 dark:text-white/40 dark:border-white/10',
      iconClass: 'text-neutral-400 dark:text-white/30',
      isOverdue: false,
    };
  }

  const days = getDaysRemaining(dueDateStr);

  if (days === null) {
    return {
      label: 'No deadline',
      badgeClass: 'bg-neutral-100 text-neutral-500 border-neutral-200 dark:bg-white/5 dark:text-white/40 dark:border-white/10',
      iconClass: 'text-neutral-400 dark:text-white/30',
      isOverdue: false,
    };
  }

  // Red for overdue (< 0 days)
  if (days < 0) {
    return {
      label: `Overdue (${Math.abs(days)}d)`,
      badgeClass: 'bg-red-50 text-red-600 border-red-200 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/20',
      iconClass: 'text-red-500 dark:text-red-400',
      isOverdue: true,
    };
  }

  // Orange for 2, 1, or today (0 - 2 days)
  if (days <= 2) {
    const label = days === 0 ? 'Due Today' : days === 1 ? 'Due Tomorrow' : 'Due in 2 days';
    return {
      label,
      badgeClass: 'bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-500/15 dark:text-orange-400 dark:border-orange-500/20',
      iconClass: 'text-orange-500 dark:text-orange-400',
      isOverdue: false,
    };
  }

  // Yellow for > 2 days (3 - 4 days)
  if (days <= 4) {
    return {
      label: `Due in ${days} days`,
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-yellow-500/15 dark:text-yellow-400 dark:border-yellow-500/20',
      iconClass: 'text-amber-500 dark:text-yellow-400',
      isOverdue: false,
    };
  }

  // Green for > 4 days (5 - 7 days)
  if (days <= 7) {
    return {
      label: `Due in ${days} days`,
      badgeClass: 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20',
      iconClass: 'text-emerald-500 dark:text-emerald-400',
      isOverdue: false,
    };
  }

  // Grey for > 7 days
  return {
    label: `Due in ${days} days`,
    badgeClass: 'bg-neutral-100 text-neutral-500 border-neutral-200 dark:bg-white/5 dark:text-white/40 dark:border-white/10',
    iconClass: 'text-neutral-400 dark:text-white/30',
    isOverdue: false,
  };
}

export function getDuePillInfo(dueDateStr?: string): DuePillInfo {
  return getDateChipStyle(dueDateStr);
}

/**
 * Calculates the total duration in milliseconds that a task has spent in the 'in_progress' swimlane.
 * Combines stored inProgressDurationMs with the active session if the task is currently 'in_progress'.
 * Falls back to computing from activityLog if inProgressDurationMs is not yet initialized.
 */
export function getTaskBillableMs(task: Task, nowMs: number = Date.now()): number {
  let totalMs = typeof task.inProgressDurationMs === 'number' ? task.inProgressDurationMs : 0;

  // Active in-progress session
  if (task.status === 'in_progress') {
    if (task.inProgressStartedAt) {
      const startMs = new Date(task.inProgressStartedAt).getTime();
      if (!isNaN(startMs) && nowMs >= startMs) {
        totalMs += (nowMs - startMs);
      }
    } else {
      const fallbackStart = task.updatedAt ? new Date(task.updatedAt).getTime() : new Date(task.createdAt).getTime();
      if (!isNaN(fallbackStart) && nowMs >= fallbackStart) {
        totalMs += (nowMs - fallbackStart);
      }
    }
  }

  // If no duration was recorded and task has an activityLog, compute from historical status changes
  if (totalMs === 0 && task.activityLog && task.activityLog.length > 0) {
    let activeStartMs: number | null = null;
    const sortedActivities = [...task.activityLog].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    for (const act of sortedActivities) {
      const actTime = new Date(act.timestamp).getTime();
      if (isNaN(actTime)) continue;

      if ((act.action === 'status_change' && act.to === 'in_progress') || (act.action === 'created' && act.to === 'in_progress')) {
        activeStartMs = actTime;
      } else if (activeStartMs !== null && act.action === 'status_change' && act.from === 'in_progress') {
        totalMs += Math.max(0, actTime - activeStartMs);
        activeStartMs = null;
      }
    }

    if (activeStartMs !== null && task.status === 'in_progress') {
      totalMs += Math.max(0, nowMs - activeStartMs);
    }
  }

  return totalMs;
}

/**
 * Formats duration milliseconds into clean billable hours:
 * - < 1 minute: "0.0 hrs" (or "< 1m")
 * - Formats as decimal hours, e.g., "1.5 hrs" or "0.2 hrs"
 */
export function formatBillableHours(ms: number): string {
  if (ms <= 0) return '0.0 hrs';
  const hours = ms / (1000 * 60 * 60);
  if (hours < 0.1) {
    const mins = Math.max(1, Math.round(ms / (1000 * 60)));
    return `${mins}m`;
  }
  return `${hours.toFixed(1)} hrs`;
}

/**
 * Returns detailed breakdown string (e.g. "2h 15m 30s")
 */
export function formatBillableDetailed(ms: number): string {
  if (ms <= 0) return '0m';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Calculates a detailed workload score and breakdown for a user's task set.
 * Status weights:
 * - pipeline: 0.0 (does not contribute to score)
 * - in progress: 1.0
 * - in review: 0.25
 * - to do with deadline: 1.0
 * - to do with no deadline: 0.5
 * - done / archived: 0.0
 */
export function calculateUserWorkload(userTasks: Task[]): WorkloadBreakdown {
  let totalScore = 0;
  let pipelineCount = 0;
  let inProgressCount = 0;
  let todoWithDeadlineCount = 0;
  let todoNoDeadlineCount = 0;
  let inReviewCount = 0;
  let doneCount = 0;
  let archivedCount = 0;
  let overdueCount = 0;

  const items: TaskScoreItem[] = [];

  for (const task of userTasks) {
    // Pipeline tasks do not have deadlines and do not contribute to workload score
    if (task.status === 'pipeline') {
      pipelineCount++;
      continue;
    }
    if (task.status === 'done') {
      doneCount++;
      continue;
    }
    if (task.status === 'archived') {
      archivedCount++;
      continue;
    }

    const hasDeadline = Boolean(task.dueDate && task.dueDate.trim() !== '');
    const daysRemaining = getDaysRemaining(task.dueDate);
    const cognitiveWeight = COGNITIVE_LOAD_WEIGHTS[task.cognitiveLoad] || 1.0;

    let statusWeight = 0;
    if (task.status === 'in_progress') {
      statusWeight = 1.0; // In progress: 1.0
      inProgressCount++;
    } else if (task.status === 'todo') {
      if (hasDeadline) {
        statusWeight = 1.0; // To do with deadline: 1.0
        todoWithDeadlineCount++;
      } else {
        statusWeight = 0.5; // To do with no deadline: 0.5
        todoNoDeadlineCount++;
      }
    } else if (task.status === 'in_review') {
      statusWeight = 0.25; // In review: 0.25
      inReviewCount++;
    }

    const proximityMultiplier = hasDeadline ? getProximityMultiplier(daysRemaining) : 1.0;
    if (daysRemaining !== null && daysRemaining < 0) {
      overdueCount++;
    }

    const taskScore = statusWeight * cognitiveWeight * proximityMultiplier;
    totalScore += taskScore;

    items.push({
      taskId: task.id,
      title: task.title,
      status: task.status,
      cognitiveLoad: task.cognitiveLoad,
      hasDeadline,
      dueDate: task.dueDate,
      daysRemaining,
      statusWeight,
      cognitiveWeight,
      proximityMultiplier,
      calculatedScore: Math.round(taskScore * 100) / 100,
    });
  }

  const roundedScore = Math.round(totalScore * 10) / 10;

  // Classify workload capacity levels
  let level: 'light' | 'optimal' | 'heavy' | 'overloaded' = 'light';
  let levelLabel = 'Light Load';
  let levelColor = 'text-green-400';
  let badgeBg = 'bg-green-500/10 border-green-500/20';
  let badgeText = 'text-green-400';
  let progressPercent = Math.min(100, Math.round((roundedScore / 12) * 100));

  if (roundedScore >= 12.0) {
    level = 'overloaded';
    levelLabel = 'Overloaded';
    levelColor = 'text-red-400';
    badgeBg = 'bg-red-500/10 border-red-500/20';
    badgeText = 'text-red-400';
    progressPercent = 100;
  } else if (roundedScore >= 8.0) {
    level = 'heavy';
    levelLabel = 'Heavy Load';
    levelColor = 'text-yellow-400';
    badgeBg = 'bg-yellow-500/10 border-yellow-500/20';
    badgeText = 'text-yellow-400';
  } else if (roundedScore >= 4.0) {
    level = 'optimal';
    levelLabel = 'Optimal Load';
    levelColor = 'text-blue-400';
    badgeBg = 'bg-blue-500/10 border-blue-500/20';
    badgeText = 'text-blue-400';
  }

  return {
    totalScore: roundedScore,
    pipelineCount,
    inProgressCount,
    todoWithDeadlineCount,
    todoNoDeadlineCount,
    inReviewCount,
    doneCount,
    archivedCount,
    overdueCount,
    items,
    level,
    levelLabel,
    levelColor,
    badgeBg,
    badgeText,
    progressPercent,
  };
}

/**
 * Generates and downloads a clean CSV report of all workspace tasks with workload metrics
 */
export function exportWorkspaceCSV(tasks: Task[], users: { id: string; name: string; email: string; role: Role }[]) {
  const userMap = new Map(users.map(u => [u.id, u]));
  const headers = ['Task ID', 'Title', 'Status', 'Cognitive Load', 'Assignee Name', 'Assignee Email', 'Role', 'Due Date', 'Created At'];
  
  const rows = tasks.map(t => {
    const user = userMap.get(t.userId);
    return [
      `"${t.id}"`,
      `"${(t.title || '').replace(/"/g, '""')}"`,
      `"${t.status}"`,
      `"${t.cognitiveLoad}"`,
      `"${(user?.name || 'Unassigned').replace(/"/g, '""')}"`,
      `"${user?.email || ''}"`,
      `"${user?.role || ''}"`,
      `"${t.dueDate || 'None'}"`,
      `"${t.createdAt}"`,
    ].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `zenflow-workspace-${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generates and downloads a complete JSON audit file
 */
export function exportWorkspaceJSON(tasks: Task[], users: { id: string; name: string; email: string; role: Role }[]) {
  const payload = {
    exportedAt: new Date().toISOString(),
    totalUsers: users.length,
    totalTasks: tasks.length,
    users,
    tasks,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `zenflow-workspace-backup-${new Date().toISOString().slice(0, 10)}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface DailyThroughput {
  dateStr: string;
  dayLabel: string;
  displayDate: string;
  completedCount: number;
  completedPoints: number;
  isToday: boolean;
}

export interface WeeklyVelocityMetrics {
  days: DailyThroughput[];
  totalCompleted7d: number;
  totalPointsCleared7d: number;
  avgLeadTimeStr: string | null;
  peakDayLabel: string | null;
  maxDayCount: number;
  hasData: boolean;
}

export function formatLeadDuration(ms: number): string {
  if (ms <= 0) return '< 1h';
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  if (days > 0) return `${days}d ${remHours}h`;
  if (hours > 0) return `${hours}h`;
  const minutes = Math.floor(ms / (1000 * 60));
  return `${Math.max(1, minutes)}m`;
}

/**
 * Calculates 7-day throughput velocity, completed task counts, and cleared cognitive load points.
 */
export function calculateWeeklyVelocity(userTasks: Task[]): WeeklyVelocityMetrics {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const now = new Date();
  const days: DailyThroughput[] = [];

  // Construct trailing 7 calendar days (from 6 days ago up to today)
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(now.getDate() - i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    const dayLabel = i === 0 ? 'Today' : dayNames[d.getDay()];
    const displayDate = `${monthNames[d.getMonth()]} ${d.getDate()}`;

    days.push({
      dateStr,
      dayLabel,
      displayDate,
      completedCount: 0,
      completedPoints: 0,
      isToday: i === 0,
    });
  }

  const daysMap = new Map<string, DailyThroughput>();
  for (const day of days) {
    daysMap.set(day.dateStr, day);
  }

  let totalCompleted7d = 0;
  let totalPointsCleared7d = 0;
  let totalLeadTimeMs = 0;
  let leadTimeCount = 0;

  for (const task of userTasks) {
    if (task.status !== 'done' && task.status !== 'archived') continue;

    let completionDateStr: string | null = null;
    let completedTimestampMs: number | null = null;

    if (task.completedAt) {
      const d = new Date(task.completedAt);
      if (!isNaN(d.getTime())) {
        completedTimestampMs = d.getTime();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        completionDateStr = `${yyyy}-${mm}-${dd}`;
      }
    }

    if (!completionDateStr && task.activityLog && task.activityLog.length > 0) {
      const doneAct = task.activityLog.find(
        a => (a.action === 'status_change' && a.to === 'done') || (a.action === 'created' && task.status === 'done')
      );
      if (doneAct) {
        const d = new Date(doneAct.timestamp);
        if (!isNaN(d.getTime())) {
          completedTimestampMs = d.getTime();
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          completionDateStr = `${yyyy}-${mm}-${dd}`;
        }
      }
    }

    if (!completionDateStr && task.status === 'done' && task.updatedAt) {
      const d = new Date(task.updatedAt);
      if (!isNaN(d.getTime())) {
        completedTimestampMs = d.getTime();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        completionDateStr = `${yyyy}-${mm}-${dd}`;
      }
    }

    if (completionDateStr && daysMap.has(completionDateStr)) {
      const dayEntry = daysMap.get(completionDateStr)!;
      dayEntry.completedCount++;
      const points = COGNITIVE_LOAD_WEIGHTS[task.cognitiveLoad] || 1.0;
      dayEntry.completedPoints += points;

      totalCompleted7d++;
      totalPointsCleared7d += points;

      if (task.createdAt && completedTimestampMs) {
        const createMs = new Date(task.createdAt).getTime();
        if (!isNaN(createMs) && completedTimestampMs >= createMs) {
          totalLeadTimeMs += (completedTimestampMs - createMs);
          leadTimeCount++;
        }
      }
    }
  }

  let peakDayLabel: string | null = null;
  let maxDayCount = 0;
  for (const day of days) {
    if (day.completedCount > maxDayCount) {
      maxDayCount = day.completedCount;
      peakDayLabel = day.displayDate;
    }
  }

  const avgLeadTimeStr = leadTimeCount > 0
    ? formatLeadDuration(Math.round(totalLeadTimeMs / leadTimeCount))
    : null;

  return {
    days,
    totalCompleted7d,
    totalPointsCleared7d: Math.round(totalPointsCleared7d * 10) / 10,
    avgLeadTimeStr,
    peakDayLabel,
    maxDayCount,
    hasData: totalCompleted7d > 0,
  };
}


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
 * Provides color mappings for the due clock icon:
 * - Red: Overdue (< 0 days)
 * - Amber: Due today / tomorrow (0 - 1 days)
 * - Green: Due in 2-3 days (2 - 3 days)
 * - Blue: Due this week (4 - 7 days)
 * - Grey: > 7 days or no deadline
 */
export function getDuePillInfo(dueDateStr?: string): DuePillInfo {
  if (!dueDateStr) {
    return {
      label: 'No deadline',
      badgeClass: 'bg-neutral-100 text-neutral-400 border-neutral-200 dark:bg-white/5 dark:text-white/30 dark:border-white/5',
      iconClass: 'text-neutral-400 dark:text-white/30',
      isOverdue: false,
    };
  }

  const days = getDaysRemaining(dueDateStr);

  if (days === null) {
    return {
      label: 'No deadline',
      badgeClass: 'bg-neutral-100 text-neutral-400 border-neutral-200 dark:bg-white/5 dark:text-white/30 dark:border-white/5',
      iconClass: 'text-neutral-400 dark:text-white/30',
      isOverdue: false,
    };
  }

  // Red for overdue
  if (days < 0) {
    return {
      label: `Overdue (${Math.abs(days)}d)`,
      badgeClass: 'bg-red-50 text-red-600 border-red-200 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/20',
      iconClass: 'text-red-500 dark:text-red-400',
      isOverdue: true,
    };
  }

  // Amber for due today / tomorrow
  if (days <= 1) {
    return {
      label: days === 0 ? 'Due Today' : 'Due Tomorrow',
      badgeClass: 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/20',
      iconClass: 'text-amber-500 dark:text-amber-400',
      isOverdue: false,
    };
  }

  // Green for due in 2-3 days
  if (days <= 3) {
    return {
      label: `Due in ${days} days`,
      badgeClass: 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20',
      iconClass: 'text-emerald-500 dark:text-emerald-400',
      isOverdue: false,
    };
  }

  // Blue for due this week (4-7 days)
  if (days <= 7) {
    return {
      label: `Due this week (${days}d)`,
      badgeClass: 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-500/20',
      iconClass: 'text-blue-500 dark:text-blue-400',
      isOverdue: false,
    };
  }

  // Grey for > 7 days
  return {
    label: `Due in ${days} days`,
    badgeClass: 'bg-neutral-100 text-neutral-400 border-neutral-200 dark:bg-white/5 dark:text-white/30 dark:border-white/5',
    iconClass: 'text-neutral-400 dark:text-white/30',
    isOverdue: false,
  };
}

/**
 * Calculates a detailed workload score and breakdown for a user's task set.
 * Status weights:
 * - in progress: 1.0
 * - in review: 0.25
 * - to do with deadline: 1.0
 * - to do with no deadline: 0.5
 * - done / archived: 0.0
 */
export function calculateUserWorkload(userTasks: Task[]): WorkloadBreakdown {
  let totalScore = 0;
  let inProgressCount = 0;
  let todoWithDeadlineCount = 0;
  let todoNoDeadlineCount = 0;
  let inReviewCount = 0;
  let doneCount = 0;
  let archivedCount = 0;
  let overdueCount = 0;

  const items: TaskScoreItem[] = [];

  for (const task of userTasks) {
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

import type { CognitiveLoad, Task, TaskActivity, TaskOrderUpdate, TaskStatus } from '../types';
import { getAssigneeIds } from './permissions';

export { getAssigneeIds as getTaskAssigneeIds };

export function formatBillableHours(ms: number): string {
  if (ms <= 0) return '0h';
  const hours = ms / (1000 * 60 * 60);
  if (hours < 0.1) {
    const mins = Math.max(1, Math.round(ms / (1000 * 60)));
    return `${mins}m`;
  }
  return `${parseFloat(hours.toFixed(1))}h`;
}

export function hasCanonicalParent(task: Pick<Task, 'parentTaskId'>, tasks: readonly Pick<Task, 'id'>[]): boolean {
  return Boolean(task.parentTaskId && !tasks.some(other => other.id === task.parentTaskId));
}

export interface TaskUpdateInput {
  title?: string;
  description?: string;
  brandGuidelines?: string;
  dueDate?: string;
  startDate?: string;
  cognitiveLoad?: CognitiveLoad;
  status?: TaskStatus;
  userId?: string;
  assigneeIds?: string[];
  order?: number;
  completedAt?: string;
  inProgressDurationMs?: number;
  inProgressStartedAt?: string;
  adjustmentReason?: string;
  actorName?: string;
  client?: string;
  project?: string;
  estimatedHours?: number;
  team?: Task['team'];
  priority?: Task['priority'];
  attachments?: string[];
  disciplineMetadata?: Task['disciplineMetadata'];
  contentDocLink?: string;
  clickupSpaceId?: string;
  clickupSpaceName?: string;
  clickupFolderId?: string;
  clickupFolderName?: string;
  clickupListId?: string;
  clickupListName?: string;
  clickupTaskType?: string;
  clickupTaskTypeId?: string;
  clickupTaskTypeFieldId?: string;
}

export function computeStatusTransitionTimers(
  current: Pick<Task, 'status' | 'completedAt' | 'inProgressStartedAt' | 'inProgressDurationMs'>,
  nextStatus: TaskStatus | undefined,
  now: Date,
  overrides?: {
    completedAt?: string;
    inProgressDurationMs?: number;
    inProgressStartedAt?: string;
  }
) {
  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  let completedAt = overrides?.completedAt !== undefined ? (overrides.completedAt || undefined) : current.completedAt;
  let inProgressStartedAt = current.inProgressStartedAt;
  let inProgressDurationMs = typeof current.inProgressDurationMs === 'number' ? current.inProgressDurationMs : 0;

  if (overrides?.inProgressDurationMs !== undefined) {
    inProgressDurationMs = Math.max(0, Math.round(overrides.inProgressDurationMs));
    if (overrides.inProgressStartedAt !== undefined) {
      inProgressStartedAt = overrides.inProgressStartedAt;
    } else if ((nextStatus || current.status) === 'in_progress') {
      inProgressStartedAt = nowIso;
    } else {
      inProgressStartedAt = undefined;
    }
  } else if (nextStatus !== undefined) {
    if (nextStatus === 'done' && current.status !== 'done' && !overrides?.completedAt) {
      completedAt = nowIso;
    } else if (nextStatus !== 'done') {
      completedAt = undefined;
    }

    if (nextStatus === 'in_progress' && current.status !== 'in_progress') {
      inProgressStartedAt = nowIso;
    } else if (nextStatus !== 'in_progress' && current.status === 'in_progress') {
      if (current.inProgressStartedAt) {
        const sessionMs = Math.max(0, nowMs - new Date(current.inProgressStartedAt).getTime());
        inProgressDurationMs += sessionMs;
      }
      inProgressStartedAt = undefined;
    }
  }

  return { completedAt, inProgressStartedAt, inProgressDurationMs };
}

export function applyOptimisticTaskUpdate(
  tasks: readonly Task[],
  id: string,
  updates: Partial<Task>,
  now: Date = new Date()
): Task[] {
  const target = tasks.find(t => t.id === id);
  if (!target) return [...tasks];
  const nowIso = now.toISOString();
  const linkToPropagate = updates.contentDocLink || target.contentDocLink;
  const isContentDoneUpdate = Boolean(
    (updates.team || target.team) === 'content' &&
      linkToPropagate &&
      (updates.status === 'done' || (updates.contentDocLink && updates.contentDocLink !== target.contentDocLink))
  );
  const briefChanged =
    updates.description !== undefined && (updates.description || undefined) !== (target.description || undefined);
  const brandChanged =
    updates.brandGuidelines !== undefined &&
    (updates.brandGuidelines || undefined) !== (target.brandGuidelines || undefined);
  const canonicalParent = hasCanonicalParent(target, tasks);
  const syncParentFields = Boolean(canonicalParent && (briefChanged || brandChanged));

  return tasks.map(t => {
    if (t.id === id) {
      const timers = computeStatusTransitionTimers(t, updates.status, now, {
        completedAt: updates.completedAt,
        inProgressDurationMs: updates.inProgressDurationMs,
        inProgressStartedAt: updates.inProgressStartedAt,
      });
      const nextStatus = updates.status ?? t.status;
      const finalDueDate =
        nextStatus === 'pipeline' || nextStatus === 'retainer'
          ? undefined
          : updates.dueDate !== undefined
          ? updates.dueDate || undefined
          : t.dueDate;
      const nextAssigneeIds = Array.isArray(updates.assigneeIds)
        ? Array.from(new Set(updates.assigneeIds.filter(Boolean)))
        : updates.userId !== undefined
        ? updates.userId
          ? [updates.userId]
          : []
        : getAssigneeIds(t);
      const nextStartDate =
        nextStatus === 'pipeline'
          ? undefined
          : updates.startDate !== undefined
          ? updates.startDate
          : t.startDate || (t.status === 'pipeline' && updates.status ? nowIso.slice(0, 10) : undefined);

      return {
        ...t,
        ...updates,
        description: updates.description !== undefined ? updates.description || undefined : t.description,
        brandGuidelines: updates.brandGuidelines !== undefined ? updates.brandGuidelines || undefined : t.brandGuidelines,
        disciplineMetadata:
          updates.disciplineMetadata !== undefined
            ? updates.disciplineMetadata && Object.keys(updates.disciplineMetadata).length > 0
              ? updates.disciplineMetadata
              : undefined
            : t.disciplineMetadata,
        assigneeIds: nextAssigneeIds,
        userId: nextAssigneeIds[0] || undefined,
        startDate: nextStartDate,
        dueDate: finalDueDate,
        ...timers,
        updatedAt: nowIso,
      };
    }

    const isSibling =
      (target.parentTaskId && t.parentTaskId === target.parentTaskId) ||
      (target.clickupParentTaskId && t.clickupParentTaskId === target.clickupParentTaskId);
    if (!isSibling) return t;

    let nextSibling = t;
    let modified = false;
    if (isContentDoneUpdate && t.team === 'design' && linkToPropagate) {
      nextSibling = { ...nextSibling, contentDocLink: linkToPropagate };
      modified = true;
    }
    if (syncParentFields && t.parentTaskId === target.parentTaskId) {
      nextSibling = {
        ...nextSibling,
        ...(briefChanged ? { description: updates.description || undefined } : {}),
        ...(brandChanged ? { brandGuidelines: updates.brandGuidelines || undefined } : {}),
      };
      modified = true;
    }
    return modified ? { ...nextSibling, updatedAt: nowIso } : t;
  });
}

export function applyOptimisticTaskReorder(
  tasks: readonly Task[],
  updates: readonly TaskOrderUpdate[],
  now: Date = new Date()
): Task[] {
  const nowIso = now.toISOString();
  const updateMap = new Map(updates.map(u => [u.id, u]));
  const contentLinkPropagations: Array<{ source: Task; link: string }> = [];

  const nextTasks = tasks.map(t => {
    const u = updateMap.get(t.id);
    if (!u) return t;
    const nextStatus = u.status || t.status;
    const timers = computeStatusTransitionTimers(t, u.status, now);
    const nextAssigneeIds = Array.isArray(u.assigneeIds)
      ? Array.from(new Set(u.assigneeIds.filter(Boolean)))
      : u.userId !== undefined
      ? u.userId
        ? [u.userId]
        : []
      : getAssigneeIds(t);
    const resolvedDueDate =
      nextStatus === 'pipeline' || nextStatus === 'retainer'
        ? undefined
        : u.dueDate !== undefined
        ? u.dueDate || undefined
        : t.dueDate;
    const resolvedStartDate =
      nextStatus === 'pipeline'
        ? undefined
        : u.startDate !== undefined
        ? u.startDate || undefined
        : t.startDate || (t.status === 'pipeline' ? nowIso.slice(0, 10) : undefined);
    const nextDocLink = u.contentDocLink !== undefined ? u.contentDocLink || undefined : t.contentDocLink;

    if (t.team === 'content' && nextStatus === 'done' && nextDocLink) {
      contentLinkPropagations.push({ source: t, link: nextDocLink });
    }

    return {
      ...t,
      status: nextStatus,
      order: typeof u.order === 'number' ? u.order : t.order,
      assigneeIds: nextAssigneeIds,
      userId: nextAssigneeIds[0] || undefined,
      dueDate: resolvedDueDate,
      startDate: resolvedStartDate,
      estimatedHours: u.estimatedHours !== undefined ? u.estimatedHours : t.estimatedHours,
      cognitiveLoad: u.cognitiveLoad !== undefined ? u.cognitiveLoad : t.cognitiveLoad,
      contentDocLink: nextDocLink,
      ...timers,
      updatedAt: nowIso,
    };
  });

  if (contentLinkPropagations.length === 0) return nextTasks;
  return nextTasks.map(t => {
    if (t.team !== 'design') return t;
    const match = contentLinkPropagations.find(
      ({ source }) =>
        source.id !== t.id &&
        ((source.parentTaskId && t.parentTaskId === source.parentTaskId) ||
          (source.clickupParentTaskId && t.clickupParentTaskId === source.clickupParentTaskId))
    );
    return match ? { ...t, contentDocLink: match.link, updatedAt: nowIso } : t;
  });
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function archiveExpiredDoneTasks(tasks: Task[], now: Date = new Date()): Task[] {
  const nowMs = now.getTime();
  const nowIso = now.toISOString();
  const newlyArchived: Task[] = [];

  for (const task of tasks) {
    if (task.status === 'done') {
      const doneDateStr = task.completedAt || task.updatedAt || task.createdAt;
      if (!doneDateStr) continue;
      const doneTime = new Date(doneDateStr).getTime();
      if (!isNaN(doneTime) && nowMs - doneTime >= SEVEN_DAYS_MS) {
        task.status = 'archived';
        task.updatedAt = nowIso;
        if (!Array.isArray(task.activityLog)) task.activityLog = [];
        const act: TaskActivity = {
          id: `act-${nowMs}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: nowIso,
          action: 'status_change',
          from: 'done',
          to: 'archived',
          actorName: 'System',
          details: 'Automatically archived after 7 days in Done',
        };
        task.activityLog.unshift(act);
        task.activityLog = task.activityLog.slice(0, 15);
        newlyArchived.push(task);
      }
    }
  }
  return newlyArchived;
}

export function removeUserFromTaskList(tasks: readonly Task[], removedUserId: string, nowIso: string = new Date().toISOString()): {
  keptTasks: Task[];
  updatedTasks: Task[];
  deletedTaskIds: string[];
} {
  const keptTasks: Task[] = [];
  const updatedTasks: Task[] = [];
  const deletedTaskIds: string[] = [];

  for (const t of tasks) {
    const assignees = getAssigneeIds(t);
    if (!assignees.includes(removedUserId)) {
      keptTasks.push(t);
      continue;
    }
    const remaining = assignees.filter(uid => uid !== removedUserId);
    if (remaining.length > 0) {
      const next: Task = { ...t, assigneeIds: remaining, userId: remaining[0], updatedAt: nowIso };
      keptTasks.push(next);
      updatedTasks.push(next);
    } else {
      deletedTaskIds.push(t.id);
    }
  }

  return { keptTasks, updatedTasks, deletedTaskIds };
}

export function taskMatchesAnyUserRef(task: Pick<Task, 'userId' | 'assigneeIds'>, idsOrEmails: readonly string[]): boolean {
  const targets = new Set(idsOrEmails.filter(Boolean).map(v => v.toLowerCase()));
  if (targets.size === 0) return false;
  if (task.userId && targets.has(task.userId.toLowerCase())) return true;
  if (Array.isArray(task.assigneeIds)) {
    return task.assigneeIds.some(id => Boolean(id) && targets.has(id.toLowerCase()));
  }
  return false;
}

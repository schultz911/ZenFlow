import type { Express, Request, Response } from 'express';
import type { ParentTask, Task, User } from '../../src/types';
import { canAssignToDiscipline, canCreatePipelineTask } from '../../src/domain/permissions';
import {
  computeStatusTransitionTimers,
  formatBillableHours,
  getTaskAssigneeIds,
} from '../../src/domain/taskTransitions';
import { buildParentClickupMarkdown, buildSubtaskClickupMarkdown } from '../clickup';
import {
  sanitizeDisciplineMetadata,
  sanitizeString,
  validateHttpUrl,
  type RouteDeps,
} from './validation';

const UUID_PATTERN = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

export function registerTaskRoutes(app: Express, deps: RouteDeps) {
  const { repo, clickup, broadcastEvent, workspaceWrite } = deps;
  const queueClickUpWrite = (write: () => Promise<unknown>) => {
    void repo.runMutation(async () => {
      if (!repo.purgeNeedsRetry()) await write();
    }).catch(error => console.error('[ClickUp] Deferred sync failed:', error));
  };

  app.get('/api/tasks', (req: Request, res: Response) => {
    void repo.runMutation(() => repo.maybeArchive(archived => broadcastEvent('tasks_reordered', archived)));
    const etag = `W/"zenflow-tasks-${repo.getRevision()}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }
    res.json(repo.getTasks());
  });

  app.post('/api/tasks/pipeline-bundle', workspaceWrite(async (req: Request, res: Response) => {
    const caller: User | undefined = res.locals.caller;
    if (!canCreatePipelineTask(caller)) {
      return res.status(403).json({ error: 'Only Accounts team members and users with authorized special roles can create pipeline tasks' });
    }

    const body = req.body || {};
    const cleanTitle = sanitizeString(body.title);
    if (!cleanTitle) return res.status(400).json({ error: 'Task title is required' });

    const rawDiscs: Array<'content' | 'design'> = Array.isArray(body.disciplines)
      ? body.disciplines.filter((d: unknown): d is 'content' | 'design' => d === 'content' || d === 'design')
      : [];
    const validDisciplines = Array.from(new Set<'content' | 'design'>(rawDiscs));
    if (validDisciplines.length === 0) {
      return res.status(400).json({ error: 'Select at least one requirement (Content or Design)' });
    }

    const brandCheck = validateHttpUrl(body.brandGuidelines);
    if (brandCheck.error) return res.status(400).json({ error: `Brand Guidelines: ${brandCheck.error}` });

    const sanitizedDisciplineSpecs: Record<string, Record<string, any> | undefined> = {};
    for (const disc of validDisciplines) {
      const rawSpec = body.disciplineSpecs && typeof body.disciplineSpecs === 'object' ? body.disciplineSpecs[disc] : undefined;
      if (rawSpec !== undefined) {
        const checked = sanitizeDisciplineMetadata(rawSpec);
        if (checked.error) return res.status(400).json({ error: checked.error });
        sanitizedDisciplineSpecs[disc] = checked.value;
      }
    }

    const cleanDescription = body.description ? sanitizeString(body.description, 10000) : undefined;
    const cleanBrandGuidelines = brandCheck.value;
    const cleanSpaceName = body.clickupSpaceName ? sanitizeString(body.clickupSpaceName) : undefined;
    const cleanListName = body.clickupListName ? sanitizeString(body.clickupListName) : undefined;
    const cleanClient = body.client ? sanitizeString(body.client) : cleanSpaceName;
    const cleanProject = body.project ? sanitizeString(body.project) : cleanListName;
    const cleanPriority = ['low', 'medium', 'high'].includes(body.priority) ? body.priority : 'medium';
    const cleanDueDate = body.dueDate ? sanitizeString(body.dueDate) : undefined;
    const cleanListId = body.clickupListId ? sanitizeString(body.clickupListId) : undefined;
    const cleanSpaceId = body.clickupSpaceId ? sanitizeString(body.clickupSpaceId) : undefined;
    const cleanFolderId = body.clickupFolderId ? sanitizeString(body.clickupFolderId) : undefined;
    const cleanFolderName = body.clickupFolderName ? sanitizeString(body.clickupFolderName) : undefined;
    const cleanTaskType = body.clickupTaskType ? sanitizeString(body.clickupTaskType) : undefined;
    const cleanTaskTypeId = body.clickupTaskTypeId ? sanitizeString(body.clickupTaskTypeId) : undefined;
    const cleanTaskTypeFieldId = body.clickupTaskTypeFieldId ? sanitizeString(body.clickupTaskTypeFieldId) : undefined;

    const token = clickup.resolveToken(caller);
    const store = repo.getStore();
    const requestId = body.requestId;
    if (requestId !== undefined && (typeof requestId !== 'string' || !UUID_PATTERN.test(requestId))) {
      return res.status(400).json({ error: 'Invalid pipeline creation ID' });
    }
    const now = new Date().toISOString();
    const parentTaskId = requestId
      ? `parent-${caller!.id}-${requestId}`
      : `parent-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const previousParent = store.parentTasks.find(parent => parent.id === parentTaskId);
    const parentTask: ParentTask = previousParent ?? {
      id: parentTaskId,
      title: cleanTitle,
      brief: cleanDescription,
      brandGuidelines: cleanBrandGuidelines,
      createdAt: now,
      updatedAt: now,
    };

    const createdTasks: Task[] = previousParent ? store.tasks.filter(task => task.parentTaskId === parentTaskId) : [];
    for (const disc of previousParent ? [] : validDisciplines) {
      const existingInPipeline = store.tasks.filter(t => t.team === disc && t.status === 'pipeline');
      const maxOrder = existingInPipeline.reduce((max, t) => Math.max(max, t.order ?? 0), -1);
      const discLabel = disc === 'content' ? 'Content' : 'Design';
      const subtaskId = `${parentTaskId}-${disc}`;
      const discMeta = sanitizedDisciplineSpecs[disc];
      createdTasks.push({
        id: subtaskId,
        userId: undefined,
        assigneeIds: [],
        team: disc,
        title: validDisciplines.length > 1 ? `${cleanTitle} (${discLabel})` : cleanTitle,
        description: cleanDescription,
        brandGuidelines: cleanBrandGuidelines,
        dueDate: undefined,
        cognitiveLoad: 'medium',
        status: 'pipeline',
        order: maxOrder + 1,
        client: cleanClient,
        project: cleanProject,
        priority: cleanPriority,
        disciplineMetadata: discMeta,
        parentTaskId,
        parentTaskTitle: cleanTitle,
        clickupSpaceId: cleanSpaceId,
        clickupSpaceName: cleanSpaceName,
        clickupFolderId: cleanFolderId,
        clickupFolderName: cleanFolderName,
        clickupListId: cleanListId,
        clickupListName: cleanListName,
        clickupTaskType: cleanTaskType,
        clickupTaskTypeId: cleanTaskTypeId,
        clickupTaskTypeFieldId: cleanTaskTypeFieldId,
        createdAt: now,
        updatedAt: now,
        activityLog: [
          {
            id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            timestamp: now,
            action: 'created',
            actorName: caller?.name,
            details: `Pipeline deliverable created (${discLabel})`,
          },
        ],
      });
    }

    if (!previousParent) {
      try {
        await repo.savePipelineBundle(parentTask, createdTasks);
      } catch {
        return res.status(503).json({ error: 'Cloud storage write failed; pipeline bundle was not saved. Please retry.' });
      }
      store.parentTasks.push(parentTask);
      store.tasks.push(...createdTasks);
      repo.saveLocal();
      for (const task of createdTasks) broadcastEvent('task_created', task);
      repo.appendAuditLog({
        category: 'task',
        action: 'pipeline_bundle_created',
        actor: { id: caller?.id, name: caller?.name, email: caller?.email, ip: req.ip },
        targetId: parentTask.id,
        targetType: 'task',
        details: `Pipeline bundle "${cleanTitle}" created for ${validDisciplines.join(', ')}`,
      });
    }

    const listId = createdTasks[0]?.clickupListId;
    if (token && listId) {
      const syncError = () => res.status(502).json({
        error: 'Saved in ZenFlow. ClickUp sync is incomplete. Retry to finish sending this bundle.',
      });
      const uncertainSync = () => res.status(409).json({
        error: 'Saved in ZenFlow. ClickUp did not confirm the creation. Check ClickUp before creating another copy.',
      });
      try {
        if (!parentTask.clickupParentTaskId) {
          if (parentTask.clickupCreationPending) return uncertainSync();
          parentTask.clickupCreationPending = true;
          try {
            await repo.saveParentTask(parentTask);
          } catch (error) {
            delete parentTask.clickupCreationPending;
            throw error;
          }
          repo.saveLocal();
          const remote = await clickup.createRemoteParentTask({
            token, listId, title: parentTask.title, dueDate: cleanDueDate,
            markdown: buildParentClickupMarkdown(parentTask.brief, parentTask.brandGuidelines),
            taskTypeFieldId: createdTasks[0].clickupTaskTypeFieldId,
            taskTypeId: createdTasks[0].clickupTaskTypeId,
          });
          if (remote.uncertain) return uncertainSync();
          delete parentTask.clickupCreationPending;
          if (!remote.clickupParentTaskId) {
            repo.saveLocal();
            await repo.saveParentTask(parentTask);
            return syncError();
          }
          parentTask.clickupParentTaskId = remote.clickupParentTaskId;
          parentTask.lastSyncedClickupDescHash = remote.descHash;
        }
        repo.saveLocal();
        await repo.saveParentTask(parentTask);
        for (const task of createdTasks) {
          if (!task.clickupTaskId) {
            if (task.clickupCreationPending) return uncertainSync();
            task.clickupCreationPending = true;
            try {
              await repo.saveTask(task);
            } catch (error) {
              delete task.clickupCreationPending;
              throw error;
            }
            repo.saveLocal();
            const remote = await clickup.createRemoteSubtask({
              token, listId, title: parentTask.title, dueDate: cleanDueDate,
              discLabel: task.team === 'content' ? 'Content' : 'Design',
              clickupParentTaskId: parentTask.clickupParentTaskId,
              markdown: buildSubtaskClickupMarkdown(task.team, task.disciplineMetadata),
              taskTypeFieldId: task.clickupTaskTypeFieldId,
              taskTypeId: task.clickupTaskTypeId,
            });
            if (remote.uncertain) return uncertainSync();
            delete task.clickupCreationPending;
            if (!remote.clickupTaskId) {
              repo.saveLocal();
              await repo.saveTask(task);
              return syncError();
            }
            task.clickupTaskId = remote.clickupTaskId;
            task.clickupParentTaskId = parentTask.clickupParentTaskId;
            task.clickupUrl = remote.clickupUrl;
            task.lastSyncedClickupDescHash = remote.descHash;
          }
          repo.saveLocal();
          await repo.saveTask(task);
          broadcastEvent('task_updated', task);
        }
      } catch {
        return syncError();
      }
    }

    res.status(previousParent ? 200 : 201).json({
      parentTaskId: parentTask.id,
      clickupParentTaskId: parentTask.clickupParentTaskId,
      parentTask,
      tasks: createdTasks,
    });
  }));

  app.post('/api/tasks', workspaceWrite(async (req: Request, res: Response) => {
    const body = req.body || {};
    const store = repo.getStore();
    const caller: User | undefined = res.locals.caller;
    const idPrefix = `task-${caller?.id}-`;
    if (body.id !== undefined) {
      if (!caller || typeof body.id !== 'string' || !body.id.startsWith(idPrefix) ||
          !UUID_PATTERN.test(body.id.slice(idPrefix.length))) {
        return res.status(400).json({ error: 'Invalid task creation ID' });
      }
      const existing = store.tasks.find(task => task.id === body.id);
      if (existing) return res.status(200).json(existing);
    }
    const cleanTitle = sanitizeString(body.title);
    if (!cleanTitle) return res.status(400).json({ error: 'Title is required' });

    const rawAssigneeIds: string[] = Array.isArray(body.assigneeIds)
      ? Array.from(new Set(body.assigneeIds.filter((uid: unknown): uid is string => typeof uid === 'string' && Boolean(uid.trim()))))
      : body.userId
      ? [String(body.userId)]
      : [];

    const firstUser = rawAssigneeIds[0] ? store.users.find(u => u.id === rawAssigneeIds[0]) : undefined;
    const resolvedTeam: Task['team'] =
      body.team === 'content' || body.team === 'design'
        ? body.team
        : firstUser?.role === 'content' || firstUser?.role === 'design'
        ? firstUser.role
        : undefined;

    for (const uid of rawAssigneeIds) {
      const member = store.users.find(u => u.id === uid);
      if (!member) return res.status(404).json({ error: `Assignee not found: ${uid}` });
      if (!canAssignToDiscipline(resolvedTeam, member)) {
        return res.status(400).json({ error: `Cannot assign task to a user of a different discipline (${member.role} != ${resolvedTeam})` });
      }
    }

    if (rawAssigneeIds.length === 0 && !canCreatePipelineTask(caller)) {
      return res.status(403).json({ error: 'Only authorized roles can create unassigned pipeline tasks' });
    }

    const brandCheck = validateHttpUrl(body.brandGuidelines);
    if (brandCheck.error) return res.status(400).json({ error: `Brand Guidelines: ${brandCheck.error}` });

    const metaCheck = sanitizeDisciplineMetadata(body.disciplineMetadata);
    if (metaCheck.error) return res.status(400).json({ error: metaCheck.error });

    const validStatus: Task['status'] = ['pipeline', 'retainer', 'todo', 'in_progress', 'in_review', 'done', 'archived'].includes(body.status)
      ? body.status
      : 'pipeline';
    const isOngoing = validStatus === 'retainer';
    const validLoad: Task['cognitiveLoad'] = isOngoing
      ? undefined
      : ['low', 'medium', 'high'].includes(body.cognitiveLoad)
      ? body.cognitiveLoad
      : 'medium';
    const parsedDueDate =
      validStatus === 'pipeline' || isOngoing
        ? undefined
        : body.dueDate
        ? sanitizeString(body.dueDate)
        : undefined;

    const now = new Date();
    const nowIso = now.toISOString();
    const timers = computeStatusTransitionTimers({ status: 'pipeline', inProgressDurationMs: 0 }, validStatus, now);

    const siblingPool = store.tasks.filter(t => t.status === validStatus);
    const maxOrder = siblingPool.reduce((max, t) => Math.max(max, t.order ?? 0), -1);

    const newTask: Task = {
      id: body.id ?? `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      userId: rawAssigneeIds[0] || undefined,
      assigneeIds: rawAssigneeIds,
      team: resolvedTeam,
      title: cleanTitle,
      description: body.description ? sanitizeString(body.description, 10000) : undefined,
      brandGuidelines: brandCheck.value,
      dueDate: parsedDueDate,
      startDate:
        validStatus === 'pipeline'
          ? undefined
          : body.startDate
          ? sanitizeString(body.startDate)
          : nowIso.slice(0, 10),
      cognitiveLoad: validLoad,
      status: validStatus,
      order: maxOrder + 1,
      completedAt: timers.completedAt,
      inProgressStartedAt: timers.inProgressStartedAt,
      inProgressDurationMs: timers.inProgressDurationMs,
      client: body.client ? sanitizeString(body.client) : undefined,
      project: body.project ? sanitizeString(body.project) : undefined,
      estimatedHours:
        !isOngoing && typeof body.estimatedHours === 'number' && !isNaN(body.estimatedHours) && body.estimatedHours >= 0
          ? Math.round(body.estimatedHours * 10) / 10
          : undefined,
      priority: !isOngoing && ['low', 'medium', 'high'].includes(body.priority) ? body.priority : undefined,
      attachments: Array.isArray(body.attachments)
        ? body.attachments.filter((a: any) => typeof a === 'string' && a.trim()).map((a: string) => sanitizeString(a.trim()))
        : undefined,
      disciplineMetadata: metaCheck.value,
      parentTaskId: body.parentTaskId ? sanitizeString(body.parentTaskId) : undefined,
      parentTaskTitle: body.parentTaskTitle ? sanitizeString(body.parentTaskTitle) : undefined,
      clickupParentTaskId: body.clickupParentTaskId ? sanitizeString(body.clickupParentTaskId) : undefined,
      clickupSpaceId: body.clickupSpaceId ? sanitizeString(body.clickupSpaceId) : undefined,
      clickupSpaceName: body.clickupSpaceName ? sanitizeString(body.clickupSpaceName) : undefined,
      clickupFolderId: body.clickupFolderId ? sanitizeString(body.clickupFolderId) : undefined,
      clickupFolderName: body.clickupFolderName ? sanitizeString(body.clickupFolderName) : undefined,
      clickupListId: body.clickupListId ? sanitizeString(body.clickupListId) : undefined,
      clickupListName: body.clickupListName ? sanitizeString(body.clickupListName) : undefined,
      clickupTaskType: body.clickupTaskType ? sanitizeString(body.clickupTaskType) : undefined,
      clickupTaskTypeId: body.clickupTaskTypeId ? sanitizeString(body.clickupTaskTypeId) : undefined,
      clickupTaskTypeFieldId: body.clickupTaskTypeFieldId ? sanitizeString(body.clickupTaskTypeFieldId) : undefined,
      createdAt: nowIso,
      updatedAt: nowIso,
      activityLog: [
        {
          id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: nowIso,
          action: 'created',
          actorName: caller?.name,
          details: rawAssigneeIds.length === 0 ? 'Task created in unassigned pipeline' : 'Task created',
        },
      ],
    };

    try {
      await repo.saveTask(newTask);
    } catch {
      return res.status(503).json({ error: 'Cloud storage write failed; task was not created. Please retry.' });
    }

    store.tasks.push(newTask);
    repo.saveLocal();
    broadcastEvent('task_created', newTask);
    repo.appendAuditLog({
      category: 'task',
      action: 'task_created',
      actor: { id: caller?.id, email: caller?.email, ip: req.ip },
      targetId: newTask.id,
      targetType: 'task',
      details: `Task "${newTask.title}" created`,
    });

    const token = clickup.resolveToken(caller);
    if (token) {
      queueClickUpWrite(() => repo.getTasks().includes(newTask)
        ? clickup.syncTaskToClickUp(newTask, token, firstUser, caller?.id) : Promise.resolve());
    }

    res.status(201).json(newTask);
  }));

  app.post('/api/tasks/:id/duplicate', workspaceWrite(async (req: Request, res: Response) => {
    const id = String(req.params.id || '');
    const store = repo.getStore();
    const sourceTask = store.tasks.find(t => t.id === id);
    if (!sourceTask) return res.status(404).json({ error: 'Source task not found' });

    const body = req.body || {};
    const targetUser = store.users.find(u => u.id === body.targetUserId);
    if (!targetUser) return res.status(404).json({ error: 'Target user not found' });

    const requestedStatus = body.targetStatus ?? body.status;
    const requestedDueDate = body.targetDueDate ?? body.dueDate;
    const validStatus: Task['status'] = ['pipeline', 'retainer', 'todo', 'in_progress', 'in_review', 'done'].includes(requestedStatus)
      ? requestedStatus
      : 'todo';
    const parsedDueDate =
      validStatus === 'pipeline' || validStatus === 'retainer'
        ? undefined
        : requestedDueDate
        ? sanitizeString(requestedDueDate)
        : undefined;

    const now = new Date();
    const nowIso = now.toISOString();
    const timers = computeStatusTransitionTimers({ status: 'pipeline', inProgressDurationMs: 0 }, validStatus, now);
    const maxOrder = store.tasks
      .filter(t => getTaskAssigneeIds(t).includes(targetUser.id) && t.status === validStatus)
      .reduce((max, t) => Math.max(max, t.order ?? 0), -1);

    const isTargetOngoing = validStatus === 'retainer';
    const duplicatedEstimatedHours =
      isTargetOngoing
        ? undefined
        : typeof body.targetEstimatedHours === 'number' && !isNaN(body.targetEstimatedHours) && body.targetEstimatedHours >= 0
        ? Math.round(body.targetEstimatedHours * 10) / 10
        : sourceTask.estimatedHours;
    const duplicatedPriority = isTargetOngoing
      ? undefined
      : ['low', 'medium', 'high'].includes(body.targetPriority)
      ? body.targetPriority
      : sourceTask.priority;

    const duplicated: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      userId: targetUser.id,
      assigneeIds: [targetUser.id],
      team:
        targetUser.role === 'content' || targetUser.role === 'design'
          ? targetUser.role
          : sourceTask.team,
      title: body.title ? sanitizeString(body.title) : sourceTask.title,
      description:
        body.description !== undefined
          ? body.description
            ? sanitizeString(body.description, 10000)
            : undefined
          : sourceTask.description,
      brandGuidelines: sourceTask.brandGuidelines,
      disciplineMetadata: sourceTask.disciplineMetadata,
      dueDate: parsedDueDate,
      startDate: validStatus === 'pipeline' ? undefined : nowIso.slice(0, 10),
      cognitiveLoad: isTargetOngoing
        ? undefined
        : ['low', 'medium', 'high'].includes(body.targetCognitiveLoad)
        ? body.targetCognitiveLoad
        : sourceTask.cognitiveLoad || 'medium',
      status: validStatus,
      order: maxOrder + 1,
      completedAt: timers.completedAt,
      inProgressStartedAt: timers.inProgressStartedAt,
      inProgressDurationMs: timers.inProgressDurationMs,
      client: sourceTask.client,
      project: sourceTask.project,
      estimatedHours: duplicatedEstimatedHours,
      priority: duplicatedPriority,
      isSubtask: true,
      parentTaskId: sourceTask.parentTaskId || sourceTask.id,
      parentTaskTitle: sourceTask.parentTaskTitle || sourceTask.title,
      clickupParentTaskId: sourceTask.clickupParentTaskId || sourceTask.clickupTaskId,
      clickupSpaceId: targetUser.selectedClickupSpaceId || sourceTask.clickupSpaceId,
      clickupSpaceName: targetUser.selectedClickupSpaceName || sourceTask.clickupSpaceName,
      clickupListId: sourceTask.clickupListId,
      clickupListName: sourceTask.clickupListName,
      createdAt: nowIso,
      updatedAt: nowIso,
      activityLog: [
        {
          id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: nowIso,
          action: 'created',
          actorName: res.locals.caller?.name,
          details: `Duplicated as subtask to ${targetUser.name}'s board`,
        },
      ],
    };

    try {
      await repo.saveTask(duplicated);
    } catch {
      return res.status(503).json({ error: 'Cloud storage write failed; subtask was not created. Please retry.' });
    }

    store.tasks.push(duplicated);
    repo.saveLocal();
    broadcastEvent('task_created', duplicated);

    const token = clickup.resolveToken(res.locals.caller);
    if (token) {
      await clickup.syncTaskToClickUp(duplicated, token, targetUser, res.locals.caller?.id).catch(() => {});
    }

    res.status(201).json({ task: duplicated });
  }));

  app.put('/api/tasks/:id', workspaceWrite(async (req: Request, res: Response) => {
    const id = String(req.params.id || '');
    const store = repo.getStore();
    const taskIndex = store.tasks.findIndex(t => t.id === id);
    if (taskIndex === -1) return res.status(404).json({ error: 'Task not found' });

    const currentTask = store.tasks[taskIndex];
    const body = req.body || {};
    const caller: User | undefined = res.locals.caller;
    const now = new Date();
    const nowIso = now.toISOString();

    const currentAssigneeIds = getTaskAssigneeIds(currentTask);
    let nextAssigneeIds = currentAssigneeIds;
    if (Array.isArray(body.assigneeIds)) {
      nextAssigneeIds = Array.from(
        new Set(body.assigneeIds.filter((uid: unknown): uid is string => typeof uid === 'string' && store.users.some(u => u.id === uid)))
      );
    } else if (body.userId !== undefined) {
      nextAssigneeIds = body.userId && store.users.some(u => u.id === body.userId) ? [String(body.userId)] : [];
    }
    const nextPrimaryUserId = nextAssigneeIds[0] || undefined;

    const validStatuses: Task['status'][] = ['pipeline', 'retainer', 'todo', 'in_progress', 'in_review', 'done', 'archived'];
    const targetStatus: Task['status'] = body.status && validStatuses.includes(body.status) ? body.status : currentTask.status;

    const resolvedTeam: Task['team'] =
      body.team === 'content' || body.team === 'design' ? body.team : currentTask.team;
    let cleanContentDocLink = currentTask.contentDocLink;
    if (body.contentDocLink !== undefined) {
      const contentDocCheck = validateHttpUrl(body.contentDocLink);
      if (contentDocCheck.error) {
        return res.status(400).json({ error: `Content Document Link: ${contentDocCheck.error}` });
      }
      cleanContentDocLink = contentDocCheck.value;
    }

    if (targetStatus === 'done' && currentTask.status !== 'done' && resolvedTeam === 'content') {
      if (!cleanContentDocLink || !/^https?:\/\/\S+/i.test(cleanContentDocLink)) {
        return res.status(400).json({ error: 'A valid Content Document link (http/https) is required when marking a Content task as Sent.' });
      }
    }

    let nextBrandGuidelines = currentTask.brandGuidelines;
    if (body.brandGuidelines !== undefined) {
      const brandCheck = validateHttpUrl(body.brandGuidelines);
      if (brandCheck.error) return res.status(400).json({ error: `Brand Guidelines: ${brandCheck.error}` });
      nextBrandGuidelines = brandCheck.value;
    }

    let nextDisciplineMetadata = currentTask.disciplineMetadata;
    if (body.disciplineMetadata !== undefined) {
      const metaCheck = sanitizeDisciplineMetadata(body.disciplineMetadata);
      if (metaCheck.error) return res.status(400).json({ error: metaCheck.error });
      nextDisciplineMetadata = metaCheck.value;
    }

    const parsedDurationMs =
      body.inProgressDurationMs !== undefined && !isNaN(Number(body.inProgressDurationMs))
        ? Math.max(0, Math.round(Number(body.inProgressDurationMs)))
        : undefined;
    const previousBillableMs = typeof currentTask.inProgressDurationMs === 'number' ? currentTask.inProgressDurationMs : 0;

    const timers = computeStatusTransitionTimers(currentTask, body.status, now, {
      completedAt: body.completedAt,
      inProgressDurationMs: parsedDurationMs,
      inProgressStartedAt: body.inProgressStartedAt,
    });

    const activityEntries = Array.isArray(currentTask.activityLog) ? [...currentTask.activityLog] : [];
    const makeAct = (action: Task['activityLog'][number]['action'], details: string, from?: string, to?: string) => {
      activityEntries.unshift({
        id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: nowIso,
        action,
        from,
        to,
        actorName: body.actorName ? sanitizeString(body.actorName) : caller?.name,
        details,
      });
    };

    if (parsedDurationMs !== undefined && parsedDurationMs !== previousBillableMs) {
      const fromStr = formatBillableHours(previousBillableMs);
      const toStr = formatBillableHours(parsedDurationMs);
      const reasonText =
        typeof body.adjustmentReason === 'string' && body.adjustmentReason.trim()
          ? ` (${sanitizeString(body.adjustmentReason.trim())})`
          : '';
      makeAct('billable_adjusted', `Billable hours adjusted from ${fromStr} to ${toStr}${reasonText}`, fromStr, toStr);
    }

    if (body.status !== undefined && body.status !== currentTask.status) {
      makeAct(
        'status_change',
        `Status changed: ${currentTask.status.replace('_', ' ')} → ${targetStatus.replace('_', ' ')}`,
        currentTask.status,
        targetStatus
      );
    }

    if (JSON.stringify(nextAssigneeIds) !== JSON.stringify(currentAssigneeIds)) {
      const formatNames = (ids: string[]) =>
        ids.length > 0 ? ids.map(uid => store.users.find(u => u.id === uid)?.name || uid).join(', ') : 'Unassigned';
      const oldLabel = formatNames(currentAssigneeIds);
      const newLabel = formatNames(nextAssigneeIds);
      makeAct(
        'reassigned',
        oldLabel === 'Unassigned' ? `Assigned to ${newLabel}` : `Assignees updated from ${oldLabel} to ${newLabel}`,
        oldLabel,
        newLabel
      );
    }

    if (targetStatus !== 'retainer' && body.cognitiveLoad && body.cognitiveLoad !== currentTask.cognitiveLoad) {
      makeAct(
        'updated',
        `Cognitive load updated from ${currentTask.cognitiveLoad || 'unset'} to ${body.cognitiveLoad}`,
        currentTask.cognitiveLoad,
        body.cognitiveLoad
      );
    }

    const resolvedDueDate =
      targetStatus === 'pipeline' || targetStatus === 'retainer'
        ? undefined
        : body.dueDate !== undefined
        ? body.dueDate
          ? sanitizeString(body.dueDate)
          : undefined
        : currentTask.dueDate;

    if (resolvedDueDate !== currentTask.dueDate) {
      makeAct(
        'rescheduled',
        resolvedDueDate ? `Due date changed from ${currentTask.dueDate || 'None'} to ${resolvedDueDate}` : 'Deadline removed upon moving to pipeline',
        currentTask.dueDate || 'None',
        resolvedDueDate || 'None'
      );
    }

    const resolvedStartDate =
      targetStatus === 'pipeline'
        ? undefined
        : body.startDate !== undefined
        ? body.startDate
          ? sanitizeString(body.startDate)
          : undefined
        : currentTask.startDate || (currentTask.status === 'pipeline' ? nowIso.slice(0, 10) : undefined);

    const isOngoingTarget = targetStatus === 'retainer';
    const parsedEstimatedHours =
      isOngoingTarget
        ? undefined
        : body.estimatedHours !== undefined
        ? !isNaN(Number(body.estimatedHours)) && Number(body.estimatedHours) >= 0
          ? Math.round(Number(body.estimatedHours) * 10) / 10
          : undefined
        : currentTask.estimatedHours;

    const nextDescription =
      body.description !== undefined
        ? body.description
          ? sanitizeString(body.description, 10000)
          : undefined
        : currentTask.description;

    const briefOrBrandChanged =
      (nextDescription || undefined) !== (currentTask.description || undefined) ||
      (nextBrandGuidelines || undefined) !== (currentTask.brandGuidelines || undefined);
    const specsChanged =
      JSON.stringify(nextDisciplineMetadata || null) !== JSON.stringify(currentTask.disciplineMetadata || null);

    const updatedTask: Task = {
      ...currentTask,
      team: resolvedTeam,
      title: body.title !== undefined ? sanitizeString(body.title) : currentTask.title,
      description: nextDescription,
      brandGuidelines: nextBrandGuidelines,
      dueDate: resolvedDueDate,
      startDate: resolvedStartDate,
      cognitiveLoad:
        isOngoingTarget
          ? undefined
          : body.cognitiveLoad && ['low', 'medium', 'high'].includes(body.cognitiveLoad)
          ? body.cognitiveLoad
          : currentTask.cognitiveLoad || 'medium',
      status: targetStatus,
      userId: nextPrimaryUserId,
      assigneeIds: nextAssigneeIds,
      order: typeof body.order === 'number' ? body.order : currentTask.order,
      completedAt: timers.completedAt,
      inProgressStartedAt: timers.inProgressStartedAt,
      inProgressDurationMs: timers.inProgressDurationMs,
      client: body.client !== undefined ? (body.client ? sanitizeString(body.client) : undefined) : currentTask.client,
      project: body.project !== undefined ? (body.project ? sanitizeString(body.project) : undefined) : currentTask.project,
      estimatedHours: parsedEstimatedHours,
      priority:
        isOngoingTarget
          ? undefined
          : body.priority !== undefined && ['low', 'medium', 'high'].includes(body.priority)
          ? body.priority
          : currentTask.priority,
      attachments:
        body.attachments !== undefined
          ? Array.isArray(body.attachments)
            ? body.attachments.filter((a: any) => typeof a === 'string' && a.trim()).map((a: string) => sanitizeString(a.trim()))
            : undefined
          : currentTask.attachments,
      disciplineMetadata: nextDisciplineMetadata,
      contentDocLink: cleanContentDocLink || undefined,
      clickupSpaceId:
        body.clickupSpaceId !== undefined
          ? body.clickupSpaceId
            ? sanitizeString(body.clickupSpaceId)
            : undefined
          : currentTask.clickupSpaceId,
      clickupSpaceName:
        body.clickupSpaceName !== undefined
          ? body.clickupSpaceName
            ? sanitizeString(body.clickupSpaceName)
            : undefined
          : currentTask.clickupSpaceName,
      clickupFolderId:
        body.clickupFolderId !== undefined
          ? body.clickupFolderId
            ? sanitizeString(body.clickupFolderId)
            : undefined
          : currentTask.clickupFolderId,
      clickupFolderName:
        body.clickupFolderName !== undefined
          ? body.clickupFolderName
            ? sanitizeString(body.clickupFolderName)
            : undefined
          : currentTask.clickupFolderName,
      clickupListId:
        body.clickupListId !== undefined
          ? body.clickupListId
            ? sanitizeString(body.clickupListId)
            : undefined
          : currentTask.clickupListId,
      clickupListName:
        body.clickupListName !== undefined
          ? body.clickupListName
            ? sanitizeString(body.clickupListName)
            : undefined
          : currentTask.clickupListName,
      clickupTaskType:
        body.clickupTaskType !== undefined
          ? body.clickupTaskType
            ? sanitizeString(body.clickupTaskType)
            : undefined
          : currentTask.clickupTaskType,
      clickupTaskTypeId:
        body.clickupTaskTypeId !== undefined
          ? body.clickupTaskTypeId
            ? sanitizeString(body.clickupTaskTypeId)
            : undefined
          : currentTask.clickupTaskTypeId,
      clickupTaskTypeFieldId:
        body.clickupTaskTypeFieldId !== undefined
          ? body.clickupTaskTypeFieldId
            ? sanitizeString(body.clickupTaskTypeFieldId)
            : undefined
          : currentTask.clickupTaskTypeFieldId,
      updatedAt: nowIso,
      activityLog: activityEntries.slice(0, 15),
    };

    const cuToken = clickup.resolveToken(caller);
    const siblingBroadcasts: Task[] = [];
    const siblingSnapshots = new Map<Task, Task>();
    const snapshotSibling = (sib: Task) => {
      if (!siblingSnapshots.has(sib)) {
        siblingSnapshots.set(sib, { ...sib, activityLog: sib.activityLog ? [...sib.activityLog] : undefined });
      }
    };

    const hasCanonicalParent = Boolean(
      updatedTask.parentTaskId && !store.tasks.some(t => t.id === updatedTask.parentTaskId)
    );

    let parentToSave: ParentTask | undefined;
    let prevParentSnapshot: ParentTask | undefined;
    let createdNewParent = false;
    if (briefOrBrandChanged && hasCanonicalParent && updatedTask.parentTaskId) {
      if (!Array.isArray(store.parentTasks)) store.parentTasks = [];
      let parent = store.parentTasks.find(p => p.id === updatedTask.parentTaskId);
      if (!parent) {
        parent = {
          id: updatedTask.parentTaskId,
          title: updatedTask.parentTaskTitle || updatedTask.title.replace(/\s+\((Content|Design)\)$/i, ''),
          brief: nextDescription,
          brandGuidelines: nextBrandGuidelines,
          clickupParentTaskId: updatedTask.clickupParentTaskId,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        createdNewParent = true;
      } else {
        prevParentSnapshot = { ...parent };
        parent.brief = nextDescription;
        parent.brandGuidelines = nextBrandGuidelines;
        parent.updatedAt = nowIso;
      }
      parentToSave = parent;

      for (const sib of store.tasks) {
        if (sib.id === updatedTask.id || sib.parentTaskId !== updatedTask.parentTaskId) continue;
        snapshotSibling(sib);
        sib.description = nextDescription;
        sib.brandGuidelines = nextBrandGuidelines;
        sib.updatedAt = nowIso;
        if (!sib.activityLog) sib.activityLog = [];
        sib.activityLog.unshift({
          id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: nowIso,
          action: 'updated',
          actorName: caller?.name,
          details: 'Shared Brief / Brand Guidelines synced from sibling subtask',
        });
        sib.activityLog = sib.activityLog.slice(0, 15);
        siblingBroadcasts.push(sib);
      }
    }

    const linkToPropagate = updatedTask.contentDocLink;
    const syncedDocToOwnTask = Boolean(
      updatedTask.team === 'content' &&
        linkToPropagate &&
        (updatedTask.status === 'done' || body.contentDocLink !== undefined)
    );
    const contentDocSiblings: Task[] = [];
    if (syncedDocToOwnTask && linkToPropagate) {
      const siblings = store.tasks.filter(
        t =>
          t.id !== updatedTask.id &&
          t.team === 'design' &&
          ((updatedTask.parentTaskId && t.parentTaskId === updatedTask.parentTaskId) ||
            (updatedTask.clickupParentTaskId && t.clickupParentTaskId === updatedTask.clickupParentTaskId))
      );
      for (const sib of siblings) {
        snapshotSibling(sib);
        sib.contentDocLink = linkToPropagate;
        sib.updatedAt = nowIso;
        if (!sib.activityLog) sib.activityLog = [];
        sib.activityLog.unshift({
          id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: nowIso,
          action: 'updated',
          details: `Content Document link synced from Content subtask: ${linkToPropagate}`,
        });
        sib.activityLog = sib.activityLog.slice(0, 15);
        if (!siblingBroadcasts.includes(sib)) siblingBroadcasts.push(sib);
        contentDocSiblings.push(sib);
      }
    }

    try {
      if (parentToSave) await repo.saveParentTask(parentToSave);
      if (siblingBroadcasts.length > 0) {
        await repo.batchSaveTasks([updatedTask, ...siblingBroadcasts]);
      } else {
        await repo.saveTask(updatedTask);
      }
    } catch {
      if (parentToSave && prevParentSnapshot) Object.assign(parentToSave, prevParentSnapshot);
      for (const [sib, snap] of siblingSnapshots.entries()) Object.assign(sib, snap);
      return res.status(503).json({ error: 'Cloud storage write failed; task update was not saved. Please retry.' });
    }

    if (parentToSave && createdNewParent) {
      store.parentTasks.push(parentToSave);
    }
    store.tasks[taskIndex] = updatedTask;
    repo.saveLocal();
    if (siblingBroadcasts.length > 0) {
      broadcastEvent('tasks_reordered', siblingBroadcasts);
    }
    broadcastEvent('task_updated', updatedTask);

    const includeSpecsInTaskSync = specsChanged && !(syncedDocToOwnTask && body.contentDocLink !== undefined);
    if (cuToken) queueClickUpWrite(async () => {
      if (parentToSave?.clickupParentTaskId && repo.getParentTasks().includes(parentToSave)) {
        await clickup.syncParentDescriptionToClickUp(parentToSave, cuToken);
      }
      if (!repo.getTasks().includes(updatedTask)) return;
      if (syncedDocToOwnTask && linkToPropagate) {
        await Promise.all([
          ...contentDocSiblings.filter(task => repo.getTasks().includes(task))
            .map(task => clickup.syncContentLinkToClickUp(task, linkToPropagate, cuToken)),
          ...(body.contentDocLink !== undefined ? [clickup.syncContentLinkToClickUp(updatedTask, linkToPropagate, cuToken)] : []),
        ]);
      }
      await clickup.syncTaskToClickUp(updatedTask, cuToken, undefined, caller?.id, includeSpecsInTaskSync);
    });

    res.json(updatedTask);
  }));

  app.delete('/api/tasks/:id', workspaceWrite(async (req: Request, res: Response) => {
    const id = String(req.params.id || '');
    const removeAssigneeId = typeof req.query.removeAssigneeId === 'string' ? req.query.removeAssigneeId : undefined;
    if (req.query.removeAssigneeId !== undefined && !removeAssigneeId?.trim()) {
      return res.status(400).json({ error: 'An assignee ID is required to remove an assignee' });
    }
    const store = repo.getStore();
    const taskIndex = store.tasks.findIndex(t => t.id === id);
    if (taskIndex === -1) return res.status(404).json({ error: 'Task not found' });

    const task = store.tasks[taskIndex];
    if (removeAssigneeId) {
      const assignees = getTaskAssigneeIds(task);
      const remaining = assignees.filter(uid => uid !== removeAssigneeId);
      if (remaining.length === assignees.length) {
        return res.json({ success: true, task, partialUnassign: true });
      }
      if (remaining.length === 0) {
        return res.status(409).json({ error: 'This task now has one assignee. Refresh the board before deciding whether to delete it.' });
      }
      const updatedTask: Task = {
        ...task,
        assigneeIds: remaining,
        userId: remaining[0],
        updatedAt: new Date().toISOString(),
      };
      try {
        await repo.saveTask(updatedTask);
      } catch {
        return res.status(503).json({ error: 'Cloud storage write failed; assignee was not removed. Please retry.' });
      }
      const currentIndex = store.tasks.findIndex(t => t.id === id);
      if (currentIndex < 0) return res.status(409).json({ error: 'Task changed while removing the assignee' });
      store.tasks[currentIndex] = updatedTask;
      repo.saveLocal();
      broadcastEvent('task_updated', updatedTask);
      return res.json({ success: true, task: updatedTask, partialUnassign: true });
    }

    const removed = store.tasks[taskIndex];
    const shouldDeleteParent = Boolean(
      removed.parentTaskId &&
        Array.isArray(store.parentTasks) &&
        !store.tasks.some(t => t.id !== removed.id && t.parentTaskId === removed.parentTaskId)
    );

    try {
      await repo.deleteTask(removed.id);
      if (shouldDeleteParent && removed.parentTaskId) {
        await repo.deleteParentTask(removed.parentTaskId);
      }
    } catch {
      return res.status(503).json({ error: 'Cloud storage write failed; task was not deleted. Please retry.' });
    }

    store.tasks.splice(taskIndex, 1);
    if (shouldDeleteParent && removed.parentTaskId) {
      store.parentTasks = store.parentTasks.filter(p => p.id !== removed.parentTaskId);
    }

    repo.saveLocal();
    broadcastEvent('task_deleted', { id: removed.id });
    repo.appendAuditLog({
      category: 'task',
      action: 'task_deleted',
      actor: { id: res.locals.caller?.id, email: res.locals.caller?.email, ip: req.ip },
      targetId: removed.id,
      targetType: 'task',
      details: `Task "${removed.title}" deleted`,
    });

    res.json({ success: true, deletedTask: removed });
  }));

  app.post('/api/tasks/reorder', workspaceWrite(async (req: Request, res: Response) => {
    const { updates } = req.body || {};
    if (!Array.isArray(updates)) return res.status(400).json({ error: 'Updates array is required' });

    const store = repo.getStore();
    const caller: User | undefined = res.locals.caller;
    const cuToken = clickup.resolveToken(caller);
    const taskMap = new Map(store.tasks.map(t => [t.id, t]));
    const userMap = new Map(store.users.map(u => [u.id, u]));

    for (const update of updates) {
      if (!update || typeof update !== 'object' || !update.id) continue;
      if (update.contentDocLink !== undefined) {
        const docCheck = validateHttpUrl(update.contentDocLink);
        if (docCheck.error) {
          return res.status(400).json({ error: `Content Document Link: ${docCheck.error}` });
        }
      }
      const task = taskMap.get(update.id);
      if (!task) continue;
      if (update.status === 'done' && task.status !== 'done') {
        const disc = task.team || (task.userId ? userMap.get(task.userId)?.role : undefined);
        if (disc === 'content') {
          const link = typeof update.contentDocLink === 'string' ? update.contentDocLink.trim() : task.contentDocLink || '';
          if (!link || !/^https?:\/\/\S+/i.test(link)) {
            return res.status(400).json({
              error: 'A valid Content Document link (http/https) is required when marking a Content task as Sent.',
            });
          }
        }
      }
    }

    const modifiedTasks: Task[] = [];
    const siblingUpdates: Task[] = [];
    const rollbackSnapshots = new Map<Task, Task>();
    const snapshotTask = (t: Task) => {
      if (!rollbackSnapshots.has(t)) {
        rollbackSnapshots.set(t, { ...t, activityLog: t.activityLog ? [...t.activityLog] : undefined });
      }
    };
    const contentLinkSyncs: Array<{ task: Task; link: string }> = [];
    const now = new Date();
    const nowIso = now.toISOString();

    for (const update of updates) {
      if (!update || typeof update !== 'object' || !update.id) continue;
      const task = taskMap.get(update.id);
      if (!task) continue;

      snapshotTask(task);
      if (!task.activityLog) task.activityLog = [];
      const previousStatus = task.status;

      if (Array.isArray(update.assigneeIds)) {
        const filteredIds: string[] = update.assigneeIds.filter(
          (uid: unknown): uid is string => typeof uid === 'string' && userMap.has(uid)
        );
        const nextIds = Array.from(new Set(filteredIds));
        task.assigneeIds = nextIds;
        task.userId = nextIds[0] || undefined;
      } else if (update.userId && typeof update.userId === 'string' && userMap.has(update.userId) && update.userId !== task.userId) {
        const oldUser = task.userId ? userMap.get(task.userId)?.name || task.userId : 'Unassigned';
        const newUser = userMap.get(update.userId)?.name || update.userId;
        task.activityLog.unshift({
          id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: nowIso,
          action: 'reassigned',
          from: oldUser,
          to: newUser,
          details: oldUser === 'Unassigned' ? `Assigned to ${newUser}` : `Reassigned from ${oldUser} to ${newUser}`,
        });
        task.userId = update.userId;
        task.assigneeIds = [update.userId];
      }

      if (update.cognitiveLoad && ['low', 'medium', 'high'].includes(update.cognitiveLoad)) {
        task.cognitiveLoad = update.cognitiveLoad;
      }
      if (update.estimatedHours !== undefined && !isNaN(Number(update.estimatedHours)) && Number(update.estimatedHours) >= 0) {
        task.estimatedHours = Math.round(Number(update.estimatedHours) * 10) / 10;
      }
      if (typeof update.contentDocLink === 'string' && update.contentDocLink.trim()) {
        task.contentDocLink = update.contentDocLink.trim();
      }

      if (
        update.status &&
        ['pipeline', 'retainer', 'todo', 'in_progress', 'in_review', 'done', 'archived'].includes(update.status) &&
        update.status !== task.status
      ) {
        const timers = computeStatusTransitionTimers(task, update.status, now);
        task.activityLog.unshift({
          id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: nowIso,
          action: 'status_change',
          from: task.status,
          to: update.status,
          details: `Moved from ${task.status.replace('_', ' ')} to ${update.status.replace('_', ' ')}`,
        });
        task.completedAt = timers.completedAt;
        task.inProgressStartedAt = timers.inProgressStartedAt;
        task.inProgressDurationMs = timers.inProgressDurationMs;
        task.status = update.status;
      }

      if (task.status === 'pipeline') {
        task.startDate = undefined;
      } else if (update.startDate !== undefined) {
        task.startDate = update.startDate ? sanitizeString(update.startDate) : undefined;
      } else if (previousStatus === 'pipeline' && !task.startDate) {
        task.startDate = nowIso.slice(0, 10);
      }

      if (typeof update.order === 'number') task.order = update.order;

      if (task.status === 'pipeline' || task.status === 'retainer') {
        if (task.dueDate) {
          task.activityLog.unshift({
            id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            timestamp: nowIso,
            action: 'rescheduled',
            from: task.dueDate,
            to: 'None',
            details: 'Deadline removed upon moving to pipeline',
          });
          task.dueDate = undefined;
        }
      } else if (update.dueDate !== undefined) {
        const newDate = update.dueDate ? sanitizeString(update.dueDate) : undefined;
        if (newDate !== task.dueDate) {
          task.activityLog.unshift({
            id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            timestamp: nowIso,
            action: 'rescheduled',
            from: task.dueDate || 'None',
            to: newDate || 'None',
            details: newDate ? `Due date set to ${newDate}` : 'Deadline removed',
          });
          task.dueDate = newDate;
        }
      }

      if (task.activityLog.length > 15) task.activityLog = task.activityLog.slice(0, 15);
      task.updatedAt = nowIso;
      modifiedTasks.push(task);

      const before = rollbackSnapshots.get(task)!;
      if (task.team === 'content' && task.status === 'done' && task.contentDocLink &&
          (before.status !== task.status || before.contentDocLink !== task.contentDocLink)) {
        const siblings = store.tasks.filter(
          t =>
            t.id !== task.id &&
            t.team === 'design' &&
            ((task.parentTaskId && t.parentTaskId === task.parentTaskId) ||
              (task.clickupParentTaskId && t.clickupParentTaskId === task.clickupParentTaskId))
        );
        for (const sib of siblings) {
          snapshotTask(sib);
          sib.contentDocLink = task.contentDocLink;
          sib.updatedAt = nowIso;
          if (!Array.isArray(sib.activityLog)) sib.activityLog = [];
          sib.activityLog.unshift({
            id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            timestamp: nowIso,
            action: 'updated',
            details: `Content Document link synced from Content subtask: ${task.contentDocLink}`,
          });
          sib.activityLog = sib.activityLog.slice(0, 15);
          siblingUpdates.push(sib);
          contentLinkSyncs.push({ task: sib, link: task.contentDocLink });
        }
        contentLinkSyncs.push({ task, link: task.contentDocLink });
      }
    }

    const allChanged = [...modifiedTasks, ...siblingUpdates];
    try {
      if (allChanged.length > 0) {
        await repo.batchSaveTasks(allChanged);
      }
    } catch {
      for (const [task, snap] of rollbackSnapshots.entries()) Object.assign(task, snap);
      return res.status(503).json({ error: 'Cloud storage write failed; task reorder was not saved. Please retry.' });
    }

    repo.saveLocal();
    broadcastEvent('tasks_reordered', allChanged);
    const clickupChanges = [...new Set(modifiedTasks)].filter(task => {
      const before = rollbackSnapshots.get(task)!;
      const priorAssignees = getTaskAssigneeIds(before);
      const assignees = getTaskAssigneeIds(task);
      return before.status !== task.status || before.dueDate !== task.dueDate ||
        before.cognitiveLoad !== task.cognitiveLoad || before.estimatedHours !== task.estimatedHours ||
        before.contentDocLink !== task.contentDocLink ||
        priorAssignees.length !== assignees.length ||
        priorAssignees.some((id, index) => id !== assignees[index]);
    });
    if (cuToken && (contentLinkSyncs.length || clickupChanges.length)) queueClickUpWrite(async () => {
      for (const { task, link } of contentLinkSyncs) {
        if (repo.getTasks().includes(task)) await clickup.syncContentLinkToClickUp(task, link, cuToken);
      }
      for (const task of clickupChanges) {
        if (repo.getTasks().includes(task)) await clickup.syncTaskToClickUp(task, cuToken, undefined, caller?.id);
      }
    });

    res.json({ success: true, tasks: modifiedTasks });
  }));
}

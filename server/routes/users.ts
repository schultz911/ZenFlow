import type { Express, Request, Response } from 'express';
import type { Task, User } from '../../src/types';
import {
  deriveMemberDesignation,
  getSuperadminEmail,
  isAdminMember,
  isBusinessLead,
  isSuperadmin as isSuperadminUser,
  VALID_ROLES,
} from '../../src/domain/permissions';
import {
  getTaskAssigneeIds,
  removeUserFromTaskList,
  taskMatchesAnyUserRef,
} from '../../src/domain/taskTransitions';
import { encryptSecret } from '../crypto';
import { AVATAR_COLORS, sanitizeString, type RouteDeps } from './validation';

function remapTaskAssignees(task: Task, sourceRefs: string[], targetUserId: string): string[] {
  const lowered = new Set(sourceRefs.filter(Boolean).map(r => r.toLowerCase()));
  const assignees = getTaskAssigneeIds(task);
  const remapped = Array.from(
    new Set(assignees.map(uid => (lowered.has(uid.toLowerCase()) ? targetUserId : uid)))
  );
  return remapped.length > 0 ? remapped : [targetUserId];
}

export function registerUserRoutes(app: Express, deps: RouteDeps) {
  const { repo, broadcastEvent } = deps;

  app.post('/api/auth/verify-email', (req: Request, res: Response) => {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const cleanEmail = sanitizeString(email).toLowerCase();
    repo.deduplicateUsers();
    let user = repo.getUsers().find(u => u.email.toLowerCase() === cleanEmail);
    if (!user && cleanEmail === getSuperadminEmail()) {
      user = repo.ensureSuperadmin();
      broadcastEvent('user_created', user);
    }
    if (!user) return res.status(404).json({ error: 'No account registered with this email address' });
    res.json({ user });
  });

  app.get('/api/users', (req: Request, res: Response) => {
    repo.deduplicateUsers();
    const etag = `W/"zenflow-users-${repo.getRevision()}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }
    res.json(repo.getUsers());
  });

  app.post('/api/users', async (req: Request, res: Response) => {
    const body = req.body || {};
    const cleanName = sanitizeString(body.name);
    const cleanEmail = sanitizeString(body.email).toLowerCase();
    if (!cleanName || !cleanEmail) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    const store = repo.getStore();
    if (store.users.some(u => u.email.toLowerCase() === cleanEmail)) {
      return res.status(409).json({ error: 'A team member with this email already exists' });
    }

    const validRole = VALID_ROLES.includes(body.role) ? body.role : undefined;
    const isAdminFlag = Boolean(body.isAdministrator || validRole === 'administrator');
    const isBusinessFlag = Boolean(body.isBusinessLead);
    const isCDFlag = Boolean(body.isCreativeDirector);
    const isClusterFlag = Boolean(body.isClusterLead);
    const isTeamLeadFlag = Boolean(body.isTeamLead);
    const isAcctFlag = Boolean(body.isAccountManager || validRole === 'account_manager');

    const derivedDesignation = deriveMemberDesignation({
      role: validRole,
      isAdministrator: isAdminFlag,
      isBusinessLead: isBusinessFlag,
      isCreativeDirector: isCDFlag,
      isClusterLead: isClusterFlag,
      isTeamLead: isTeamLeadFlag,
    });

    const newUser: User = {
      id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: cleanName,
      email: cleanEmail,
      role: validRole,
      avatarColor: AVATAR_COLORS[store.users.length % AVATAR_COLORS.length],
      isAdministrator: isAdminFlag || undefined,
      isBusinessLead: isBusinessFlag || undefined,
      isCreativeDirector: isCDFlag || undefined,
      isClusterLead: isClusterFlag || undefined,
      isTeamLead: isTeamLeadFlag || undefined,
      isAccountManager: isAcctFlag || undefined,
      isContentLead: Boolean(body.isContentLead) || undefined,
      isArtDirector: Boolean(body.isArtDirector) || undefined,
      isContentSpecialist: Boolean(body.isContentSpecialist) || undefined,
      isBrandDesigner: Boolean(body.isBrandDesigner) || undefined,
      designation: derivedDesignation || (body.designation ? sanitizeString(body.designation) : undefined),
      creativeDirectorId: isBusinessFlag ? undefined : body.creativeDirectorId ? sanitizeString(body.creativeDirectorId) : undefined,
      clusterLeadId: isBusinessFlag ? undefined : body.clusterLeadId ? sanitizeString(body.clusterLeadId) : undefined,
      clickupUserId: body.clickupUserId ? sanitizeString(body.clickupUserId) : undefined,
      clickupUsername: body.clickupUsername ? sanitizeString(body.clickupUsername) : undefined,
      createdAt: new Date().toISOString(),
    };

    store.users.push(newUser);
    try {
      await repo.saveUser(newUser);
    } catch {
      store.users = store.users.filter(u => u.id !== newUser.id);
      return res.status(503).json({ error: 'Cloud storage write failed; team member was not saved. Please retry.' });
    }

    repo.saveLocal();
    broadcastEvent('user_created', newUser);
    repo.appendAuditLog({
      category: 'user',
      action: 'user_created',
      actor: { id: res.locals.caller?.id, email: res.locals.caller?.email, ip: req.ip },
      targetId: newUser.id,
      targetType: 'user',
      details: `Team member "${newUser.name}" (${newUser.email}) added`,
    });

    res.status(201).json(newUser);
  });

  app.put('/api/users/:id', async (req: Request, res: Response) => {
    const id = String(req.params.id || '');
    const store = repo.getStore();
    const userIndex = store.users.findIndex(u => u.id === id);
    if (userIndex === -1) return res.status(404).json({ error: 'User not found' });

    const current = store.users[userIndex];
    const body = req.body || {};
    const caller: User | undefined = res.locals.caller;
    const isCallerSuper = isSuperadminUser(caller);

    let nextEmail = current.email;
    if (body.email !== undefined) {
      const cleanEmail = sanitizeString(body.email).toLowerCase().trim();
      const currentEmail = current.email.toLowerCase().trim();

      if (cleanEmail !== currentEmail) {
        if (!isCallerSuper) {
          return res.status(403).json({ error: 'Only the Superadmin can edit user email addresses' });
        }
        if (currentEmail === getSuperadminEmail()) {
          return res.status(400).json({ error: 'The primary Superadmin email address cannot be modified' });
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!cleanEmail || !emailRegex.test(cleanEmail)) {
          return res.status(400).json({ error: 'A valid email address is required' });
        }

        const existingTargetUser = store.users.find(
          u => u.id !== current.id && u.email.toLowerCase().trim() === cleanEmail
        );

        if (existingTargetUser) {
          const oldUserId = current.id;
          const oldEmail = current.email;
          const nowIso = new Date().toISOString();
          const prevTargetSnapshot = { ...existingTargetUser };
          const tasksToRemap = store.tasks.filter(t => taskMatchesAnyUserRef(t, [oldUserId, oldEmail, cleanEmail]));
          const prevTasksSnapshot = tasksToRemap.map(t => ({ task: t, snapshot: { ...t } }));

          for (const task of tasksToRemap) {
            const remapped = remapTaskAssignees(task, [oldUserId, oldEmail, cleanEmail], existingTargetUser.id);
            task.assigneeIds = remapped;
            task.userId = remapped[0];
            task.updatedAt = nowIso;
          }

          if (body.name !== undefined && sanitizeString(body.name)) existingTargetUser.name = sanitizeString(body.name);
          if (body.role !== undefined && VALID_ROLES.includes(body.role)) existingTargetUser.role = body.role;
          if (!existingTargetUser.clickupApiKey && current.clickupApiKey) existingTargetUser.clickupApiKey = current.clickupApiKey;
          if (!existingTargetUser.clickupUserId && current.clickupUserId) {
            existingTargetUser.clickupUserId = current.clickupUserId;
            existingTargetUser.clickupUsername = current.clickupUsername;
          }

          try {
            await repo.saveUser(existingTargetUser);
            if (tasksToRemap.length > 0) await repo.batchSaveTasks(tasksToRemap);
            await repo.deleteUser(oldUserId);
          } catch {
            Object.assign(existingTargetUser, prevTargetSnapshot);
            for (const { task, snapshot } of prevTasksSnapshot) Object.assign(task, snapshot);
            return res.status(503).json({ error: 'Cloud storage write failed during user merge. Please retry.' });
          }

          store.users = store.users.filter(u => u.id !== oldUserId);
          repo.saveLocal();
          broadcastEvent('user_deleted', { id: oldUserId, taskIds: [] });
          if (tasksToRemap.length > 0) broadcastEvent('tasks_reordered', tasksToRemap);
          broadcastEvent('sync_all', { users: store.users, tasks: store.tasks });

          repo.appendAuditLog({
            category: 'user',
            action: 'user_merged',
            actor: { id: caller?.id, email: caller?.email, ip: req.ip },
            targetId: existingTargetUser.id,
            targetType: 'user',
            details: `Superadmin merged ${oldEmail} (${oldUserId}) into ${existingTargetUser.email} (${tasksToRemap.length} tasks remapped)`,
          });

          return res.json({
            merged: true,
            user: existingTargetUser,
            deletedUserId: oldUserId,
            remappedCount: tasksToRemap.length,
          });
        }

        nextEmail = cleanEmail;
      }
    }

    const nextRole =
      body.role === null || body.role === ''
        ? undefined
        : body.role !== undefined && VALID_ROLES.includes(body.role)
        ? body.role
        : current.role;

    const nextIsBusinessLead = body.isBusinessLead !== undefined ? Boolean(body.isBusinessLead) : current.isBusinessLead;
    const nextIsAdministrator =
      body.isAdministrator !== undefined ? Boolean(body.isAdministrator) : current.isAdministrator;
    const nextIsCD =
      body.isCreativeDirector !== undefined ? Boolean(body.isCreativeDirector) : current.isCreativeDirector;
    const nextIsCluster = body.isClusterLead !== undefined ? Boolean(body.isClusterLead) : current.isClusterLead;
    const nextIsTeamLead = body.isTeamLead !== undefined ? Boolean(body.isTeamLead) : current.isTeamLead;

    const updated: User = {
      ...current,
      email: nextEmail,
      name: body.name !== undefined && sanitizeString(body.name) ? sanitizeString(body.name) : current.name,
      role: nextRole,
      isAdministrator: nextIsAdministrator || nextRole === 'administrator' || undefined,
      isBusinessLead: nextIsBusinessLead || undefined,
      isCreativeDirector: nextIsCD || undefined,
      isClusterLead: nextIsCluster || undefined,
      isTeamLead: nextIsTeamLead || undefined,
      isAccountManager:
        (body.isAccountManager !== undefined ? Boolean(body.isAccountManager) : current.isAccountManager) ||
        nextRole === 'account_manager' ||
        undefined,
      isContentLead: body.isContentLead !== undefined ? Boolean(body.isContentLead) || undefined : current.isContentLead,
      isArtDirector: body.isArtDirector !== undefined ? Boolean(body.isArtDirector) || undefined : current.isArtDirector,
      isContentSpecialist:
        body.isContentSpecialist !== undefined ? Boolean(body.isContentSpecialist) || undefined : current.isContentSpecialist,
      isBrandDesigner:
        body.isBrandDesigner !== undefined ? Boolean(body.isBrandDesigner) || undefined : current.isBrandDesigner,
      creativeDirectorId: nextIsBusinessLead
        ? undefined
        : body.creativeDirectorId !== undefined
        ? body.creativeDirectorId
          ? sanitizeString(body.creativeDirectorId)
          : undefined
        : current.creativeDirectorId,
      clusterLeadId: nextIsBusinessLead
        ? undefined
        : body.clusterLeadId !== undefined
        ? body.clusterLeadId
          ? sanitizeString(body.clusterLeadId)
          : undefined
        : current.clusterLeadId,
      clickupApiKey:
        body.clickupApiKey !== undefined
          ? encryptSecret(String(body.clickupApiKey).trim())
          : current.clickupApiKey,
      selectedClickupSpaceId:
        body.selectedClickupSpaceId !== undefined
          ? sanitizeString(body.selectedClickupSpaceId) || undefined
          : current.selectedClickupSpaceId,
      selectedClickupSpaceName:
        body.selectedClickupSpaceName !== undefined
          ? sanitizeString(body.selectedClickupSpaceName) || undefined
          : current.selectedClickupSpaceName,
      clickupUserId:
        body.clickupUserId !== undefined ? sanitizeString(body.clickupUserId) || undefined : current.clickupUserId,
      clickupUsername:
        body.clickupUsername !== undefined ? sanitizeString(body.clickupUsername) || undefined : current.clickupUsername,
    };

    const isCallerPrivileged = isCallerSuper || isAdminMember(caller) || isBusinessLead(caller);
    updated.designation =
      deriveMemberDesignation({
        role: updated.role,
        isAdministrator: updated.isAdministrator,
        isBusinessLead: updated.isBusinessLead,
        isCreativeDirector: updated.isCreativeDirector,
        isClusterLead: updated.isClusterLead,
        isTeamLead: updated.isTeamLead,
      }) ||
      (isCallerPrivileged && body.designation !== undefined
        ? sanitizeString(body.designation) || undefined
        : updated.designation);

    try {
      await repo.saveUser(updated);
    } catch {
      return res.status(503).json({ error: 'Cloud storage write failed; profile update was not saved. Please retry.' });
    }

    store.users[userIndex] = updated;
    repo.saveLocal();
    broadcastEvent('user_updated', updated);

    res.json(updated);
  });

  app.post('/api/users/remap-tasks', async (req: Request, res: Response) => {
    const caller: User | undefined = res.locals.caller;
    if (!isSuperadminUser(caller)) {
      return res.status(403).json({ error: 'Only the Superadmin can remap tasks across users' });
    }

    const { fromUserId, fromEmail, toUserId, deleteSourceUser } = req.body || {};
    const store = repo.getStore();
    const targetUser = store.users.find(u => u.id === toUserId);
    if (!targetUser) return res.status(404).json({ error: 'Target user not found' });

    const effectiveFromEmail = fromEmail ? sanitizeString(fromEmail).toLowerCase() : '';
    const sourceUser = store.users.find(
      u => (fromUserId && u.id === fromUserId) || (effectiveFromEmail && u.email.toLowerCase() === effectiveFromEmail)
    );
    const effectiveFromId = sourceUser?.id || (fromUserId ? sanitizeString(fromUserId) : '');
    const refs = [effectiveFromId, effectiveFromEmail, sourceUser?.email || ''].filter(Boolean);
    if (refs.length === 0) return res.status(400).json({ error: 'Source user or email is required' });

    const nowIso = new Date().toISOString();
    const fromLabel = sourceUser ? `${sourceUser.name} (${sourceUser.email})` : effectiveFromEmail || effectiveFromId;
    const tasksToRemap = store.tasks.filter(t => taskMatchesAnyUserRef(t, refs));
    const prevTasksSnapshot = tasksToRemap.map(t => ({
      task: t,
      snapshot: { ...t, activityLog: t.activityLog ? [...t.activityLog] : undefined },
    }));

    for (const task of tasksToRemap) {
      const remapped = remapTaskAssignees(task, refs, targetUser.id);
      task.assigneeIds = remapped;
      task.userId = remapped[0];
      task.updatedAt = nowIso;
      if (!task.activityLog) task.activityLog = [];
      task.activityLog.unshift({
        id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: nowIso,
        action: 'reassigned',
        from: fromLabel,
        to: `${targetUser.name} (${targetUser.email})`,
        details: `Task manually remapped from ${fromLabel} to ${targetUser.name} by Superadmin`,
      });
      task.activityLog = task.activityLog.slice(0, 15);
    }

    let deletedSourceUserId: string | undefined;
    try {
      if (tasksToRemap.length > 0) await repo.batchSaveTasks(tasksToRemap);
      if (deleteSourceUser && sourceUser && !isSuperadminUser(sourceUser)) {
        await repo.deleteUser(sourceUser.id);
        store.users = store.users.filter(u => u.id !== sourceUser.id);
        deletedSourceUserId = sourceUser.id;
      }
    } catch {
      for (const { task, snapshot } of prevTasksSnapshot) Object.assign(task, snapshot);
      return res.status(503).json({ error: 'Cloud storage write failed during task remap. Please retry.' });
    }

    repo.saveLocal();
    repo.appendAuditLog({
      category: 'user',
      action: 'tasks_manually_remapped',
      actor: { ip: req.ip, email: caller?.email },
      targetId: targetUser.id,
      targetType: 'user',
      details: `Superadmin remapped ${tasksToRemap.length} task(s) from ${fromLabel} to ${targetUser.name} (${targetUser.email})`,
      metadata: {
        fromUserId: effectiveFromId,
        fromEmail: effectiveFromEmail,
        toUserId: targetUser.id,
        toEmail: targetUser.email,
        remappedCount: tasksToRemap.length,
        deletedSourceUser: Boolean(deletedSourceUserId),
      },
    });

    if (deletedSourceUserId) broadcastEvent('user_deleted', { id: deletedSourceUserId });
    if (tasksToRemap.length > 0) broadcastEvent('tasks_reordered', tasksToRemap);
    broadcastEvent('sync_all', { users: store.users, tasks: store.tasks });

    res.json({
      success: true,
      remappedCount: tasksToRemap.length,
      targetUser,
      deletedSourceUserId,
    });
  });

  app.delete('/api/users/:id', async (req: Request, res: Response) => {
    const id = String(req.params.id || '');
    const store = repo.getStore();
    const userIndex = store.users.findIndex(u => u.id === id);
    if (userIndex === -1) return res.status(404).json({ error: 'User not found' });

    const removedUser = store.users[userIndex];
    const { keptTasks, updatedTasks, deletedTaskIds } = removeUserFromTaskList(store.tasks, id);

    try {
      await repo.deleteUser(removedUser.id);
      if (deletedTaskIds.length > 0) await repo.batchDeleteTasks(deletedTaskIds);
      if (updatedTasks.length > 0) await repo.batchSaveTasks(updatedTasks);
    } catch {
      return res.status(503).json({ error: 'Cloud storage write failed; user deletion was not completed. Please retry.' });
    }

    store.users.splice(userIndex, 1);
    store.tasks = keptTasks;
    repo.saveLocal();

    if (updatedTasks.length > 0) {
      broadcastEvent('tasks_reordered', updatedTasks);
    }
    broadcastEvent('user_deleted', { id: removedUser.id, taskIds: deletedTaskIds });
    repo.appendAuditLog({
      category: 'user',
      action: 'user_deleted',
      actor: { id: res.locals.caller?.id, email: res.locals.caller?.email, ip: req.ip },
      targetId: removedUser.id,
      targetType: 'user',
      details: `User account "${removedUser.name}" (${removedUser.email}) deleted and ${deletedTaskIds.length} associated task(s) purged`,
      metadata: { deletedTaskCount: deletedTaskIds.length },
    });
    res.json({ success: true, deletedUser: removedUser, deletedTaskCount: deletedTaskIds.length });
  });
}

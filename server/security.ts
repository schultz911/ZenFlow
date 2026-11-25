import type { Request, Response, NextFunction } from 'express';
import { getTaskAssigneeIds } from '../src/domain/taskTransitions';
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  SUPERADMIN_EMAIL,
  type MemberLike as Member,
  isSuperadmin,
  isAdminMember,
  isBusinessLead,
  isCreativeDirector,
  isClusterLead,
  isAccountsMember,
  hasAuthorizedSpecialRole,
  canCreatePipelineTask,
  canManageMembers,
  canEdit,
  canEditTask,
  canAssignToDiscipline,
} from '../src/domain/permissions';

export {
  SUPERADMIN_EMAIL,
  type Member,
  isSuperadmin,
  isAccountsMember,
  hasAuthorizedSpecialRole,
  canCreatePipelineTask,
  canEdit,
};
export const SESSION_COOKIE = 'zenflow_identity';
export interface Identity { email?: string; email_verified?: boolean; exp: number; firebase?: { sign_in_provider?: string } }

// Explicit response fields: future credential fields are private by default.
export function publicMember(user: any) {
  const result: Record<string, any> = {};
  for (const key of [
    'id', 'name', 'email', 'role', 'avatarColor', 'createdAt', 'order', 'designation',
    'isCreativeDirector', 'creativeDirectorId',
    'isAdministrator', 'isBusinessLead', 'isClusterLead', 'isTeamLead', 'isAccountManager',
    'isContentLead', 'isArtDirector', 'isContentSpecialist', 'isBrandDesigner', 'clusterLeadId',
    'selectedClickupSpaceId', 'selectedClickupSpaceName', 'clickupUserId', 'clickupUsername',
  ]) {
    if (user[key] !== undefined) result[key] = user[key];
  }
  result.clickupConnected = Boolean(user.clickupApiKey || user.clickupConnected);
  return result;
}
export function redactPayload(value: any): any {
  if (Array.isArray(value)) return value.map(redactPayload);
  if (!value || typeof value !== 'object') return value;
  if (typeof value.id === 'string' && typeof value.email === 'string' && (typeof value.role === 'string' || value.role === undefined)) {
    return publicMember(value);
  }
  // Task fields are explicitly constructed by handlers and contain no credentials.
  if ((typeof value.userId === 'string' || value.userId === undefined || value.userId === null) && typeof value.title === 'string' &&
    !['secret', 'private_key', 'clickupApiKey'].some(key => key in value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !['secret', 'private_key', 'clickupApiKey'].includes(key))
    .map(([key, item]) => [key, redactPayload(item)]));
}
export function validSignature(raw: Buffer | undefined, signature: unknown, secret: string | undefined): boolean {
  if (!raw || !secret || typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  return timingSafeEqual(createHmac('sha256', secret).update(raw).digest(), Buffer.from(signature, 'hex'));
}
export function readCookie(req: Request): string {
  const part = req.headers.cookie?.split(';').find(item => item.trim().startsWith(`${SESSION_COOKIE}=`));
  try { return part ? decodeURIComponent(part.trim().slice(SESSION_COOKIE.length + 1)) : ''; } catch { return ''; }
}
export function sameOriginMutation(req: Request): boolean {
  if (req.get('x-zenflow-request') !== '1') return false;
  const origin = req.get('origin');
  if (!origin) return true; // CLI/non-browser callers still require the non-simple header.
  try { return new URL(origin).origin === `${req.protocol}://${req.get('host')}`; } catch { return false; }
}

const CLICKUP_SELF_EDIT_KEYS = new Set([
  'clickupApiKey',
  'selectedClickupSpaceId',
  'selectedClickupSpaceName',
  'clickupUserId',
  'clickupUsername',
]);

export function createApiSecurity(options: {
  getStore: () => { users: Member[]; tasks: { id: string; userId?: string; assigneeIds?: string[]; team?: string; status?: string }[] };
  verify: (token: string) => Promise<Identity>;
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const routePath = req.path.replace(/\/+$/, '') || '/';
    if (req.method === 'GET' && routePath === '/health') return next();
    // ClickUp inbound webhook uses HMAC signature verification instead of a Google session.
    if (req.method === 'POST' && routePath === '/clickup/webhook') return next();
    const bearer = req.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
    const token = bearer || readCookie(req);
    if (!token) return res.status(401).json({ error: 'Google authentication required' });
    if (!['GET', 'HEAD'].includes(req.method) && !bearer && !sameOriginMutation(req)) return res.status(403).json({ error: 'Invalid request origin' });
    try {
      const identity = await options.verify(token);
      if (!identity.email_verified || identity.firebase?.sign_in_provider !== 'google.com' || !identity.email || identity.exp * 1000 <= Date.now()) {
        return res.status(401).json({ error: 'A verified Google identity is required' });
      }
      const store = options.getStore();
      const caller = store.users.find(user => user.email.toLowerCase() === identity.email!.toLowerCase());
      if (!caller) return res.status(403).json({ error: 'Account not registered in ZenFlow' });
      res.locals.caller = caller;
      res.locals.identityExpiresAt = identity.exp * 1000;
      const superadmin = isSuperadmin(caller);
      const isCallerAdmin = isAdminMember(caller) || isBusinessLead(caller);
      const isCallerCD = isCreativeDirector(caller);
      const isCallerClusterLead = isClusterLead(caller);
      const manager = canManageMembers(caller);
      const denied = () => res.status(403).json({ error: 'You do not have permission for this operation' });
      const owner = (id: unknown) => store.users.find(user => user.id === id);
      const edit = (id: unknown) => canEdit(caller, owner(id));
      const canEditTaskLocal = (task: { userId?: string; assigneeIds?: string[]; status?: string } | undefined) =>
        canEditTask(caller, task, store.users);
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      req.body = body;

      if (routePath.startsWith('/audit/') && !manager) return denied();
      if (routePath.startsWith('/firestore/') && req.method !== 'GET' && !superadmin) return denied();
      if (routePath === '/clickup/webhook/register' && !superadmin) return denied();
      if (routePath.startsWith('/clickup/webhook/') && req.method === 'DELETE' && !superadmin) return denied();
      if (routePath === '/clickup/sync-user-tasks' && !edit(body.userId)) return denied();
      if (routePath === '/auth/login' || routePath === '/auth/verify-email') body.email = caller.email;

      if (routePath === '/users/remap-tasks' && !superadmin) return denied();
      if (routePath === '/users' && req.method === 'POST') {
        if (!manager) return denied();
        const existing = store.users.find(user => user.email.toLowerCase() === String(body.email || '').toLowerCase());
        if (!superadmin && !isCallerAdmin && (body.role === 'administrator' || body.isAdministrator)) return denied();
        if (!superadmin && !isCallerAdmin && (body.isCreativeDirector || (existing && (!edit(existing.id) || existing.isCreativeDirector)))) return denied();
        if (!superadmin && !isCallerAdmin && isCallerCD && !body.creativeDirectorId) body.creativeDirectorId = caller.id;
        if (!superadmin && !isCallerAdmin && isCallerClusterLead && !body.clusterLeadId) body.clusterLeadId = caller.id;
      }
      const userMatch = routePath.match(/^\/users\/([^/]+)$/);
      if (userMatch && ['PUT', 'DELETE'].includes(req.method)) {
        const target = owner(decodeURIComponent(userMatch[1]));
        if (target && !edit(target.id)) return denied();
        if (req.method === 'DELETE' && (!manager || (target && isSuperadmin(target)))) return denied();
        if (req.method === 'PUT') {
          const onlyClickupSelfFields = Object.keys(body).length > 0 && Object.keys(body).every(key => CLICKUP_SELF_EDIT_KEYS.has(key));
          if (!superadmin && !isCallerAdmin && (body.role === 'administrator' || body.isAdministrator)) return denied();
          if (!superadmin && !isCallerAdmin && (body.email !== undefined || body.isCreativeDirector !== undefined)) return denied();
          if (!manager && !(onlyClickupSelfFields && target?.id === caller.id)) return denied();
          if (!superadmin && !isCallerAdmin && body.creativeDirectorId !== undefined && body.creativeDirectorId !== caller.id) return denied();
          if (body.clickupApiKey !== undefined && target?.id !== caller.id && !superadmin) return denied();
        }
      }
      if (routePath === '/tasks/pipeline-bundle' && req.method === 'POST') {
        if (!canCreatePipelineTask(caller)) return denied();
      }
      if (routePath === '/tasks' && req.method === 'POST') {
        const isPipeline = body.status === 'pipeline' || !body.userId;
        if (isPipeline) {
          if (!canCreatePipelineTask(caller)) return denied();
        } else {
          if (!edit(body.userId) && !canCreatePipelineTask(caller)) return denied();
        }
      }
      // Delegation (/tasks/:id/duplicate) is intentionally available to every authenticated member, across boards.
      const taskMatch = routePath.match(/^\/tasks\/([^/]+)$/);
      if (taskMatch && ['PUT', 'DELETE'].includes(req.method)) {
        const task = store.tasks.find(item => item.id === decodeURIComponent(taskMatch[1]));
        const isPipeline = task ? (task.status === 'pipeline' || getTaskAssigneeIds(task).length === 0) : false;
        if (task) {
          if (isPipeline && (isCallerCD || isCallerAdmin || isCallerClusterLead)) {
            // Leadership can edit and assign pipeline tasks across all teams
          } else if (!canEditTaskLocal(task)) {
            return denied();
          }
        }
        if (req.method === 'PUT') {
          const requestedAssignees: string[] = [];
          if (Array.isArray(body.assigneeIds)) {
            for (const uid of body.assigneeIds) {
              if (typeof uid === 'string' && uid.trim()) requestedAssignees.push(uid.trim());
            }
          } else if (typeof body.userId === 'string' && body.userId.trim()) {
            requestedAssignees.push(body.userId.trim());
          }
          const existingAssignees = new Set(getTaskAssigneeIds(task));
          for (const uid of requestedAssignees) {
            if (isCallerCD || isCallerAdmin || isCallerClusterLead) {
              const targetUser = store.users.find(u => u.id === uid);
              const taskTeam = (task as any)?.team || (task?.userId && store.users.find(u => u.id === task.userId)?.role);
              if (!canAssignToDiscipline(taskTeam, targetUser)) {
                return res.status(400).json({ error: `Cannot assign task to a user of a different discipline (${targetUser?.role} != ${taskTeam})` });
              }
            } else if (!existingAssignees.has(uid) && !edit(uid)) {
              return denied();
            }
          }
        }
      }
      if (routePath === '/tasks/reorder' && req.method === 'POST' && Array.isArray(body.updates)) {
        const tasks = new Map(store.tasks.map(task => [task.id, task]));
        for (const update of body.updates) {
          if (!update || typeof update !== 'object') continue;
          const task = tasks.get(update.id);
          const isPipeline = task ? (task.status === 'pipeline' || getTaskAssigneeIds(task).length === 0) : false;
          if (task && !(isPipeline && (isCallerCD || isCallerAdmin || isCallerClusterLead)) && !canEditTaskLocal(task)) {
            return denied();
          }
          if (update.userId !== undefined && !(isPipeline && (isCallerCD || isCallerAdmin || isCallerClusterLead)) && !edit(update.userId)) {
            return denied();
          }
        }
      }

      // Existing integration handlers consume these values; overwrite every caller assertion.
      req.headers['x-caller-user-id'] = caller.id;
      req.headers['x-caller-email'] = caller.email;
      req.headers['x-is-superadmin'] = String(superadmin);
      req.headers.issuperadmin = String(superadmin);
      body.callerUserId = caller.id;
      body.callerEmail = caller.email;
      body.isSuperadmin = superadmin;
      const savedKey = (caller as any).clickupApiKey || (store.users.find(user => (user as any).clickupApiKey) as any)?.clickupApiKey;
      if (routePath !== '/clickup/verify') {
        req.headers['x-clickup-api-key'] = savedKey || '';
        body.apiKey = savedKey || '';
        if (!routePath.startsWith('/users')) body.clickupApiKey = savedKey || '';
        delete req.query.apiKey;
      }
      const json = res.json.bind(res);
      res.json = ((value: any) => json(redactPayload(value))) as Response['json'];
      res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');
      return next();
    } catch {
      return res.status(401).json({ error: 'Google session expired or invalid' });
    }
  };
}

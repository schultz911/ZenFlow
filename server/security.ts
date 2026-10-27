import type { Request, Response, NextFunction } from 'express';

export const SUPERADMIN_EMAIL = 'kiran.s@zensciences.com';
export const SESSION_COOKIE = 'zenflow_identity';
export interface Member {
  id: string; email: string; isCreativeDirector?: boolean; creativeDirectorId?: string;
}
export interface Identity { email?: string; email_verified?: boolean; exp: number; firebase?: { sign_in_provider?: string } }
export const isSuperadmin = (user: Member) => user.email.toLowerCase() === SUPERADMIN_EMAIL;
export const canEdit = (caller: Member, owner: Member | undefined) => Boolean(owner && (
  isSuperadmin(caller) || caller.id === owner.id || (caller.isCreativeDirector && owner.creativeDirectorId === caller.id)
));

// Explicit response fields: future credential fields are private by default.
export function publicMember(user: any) {
  const result: Record<string, any> = {};
  for (const key of ['id', 'name', 'email', 'role', 'avatarColor', 'createdAt', 'order', 'isCreativeDirector',
    'creativeDirectorId']) {
    if (user[key] !== undefined) result[key] = user[key];
  }
  return result;
}
export function redactPayload(value: any): any {
  if (Array.isArray(value)) return value.map(redactPayload);
  if (!value || typeof value !== 'object') return value;
  if (typeof value.id === 'string' && typeof value.email === 'string' && typeof value.role === 'string') return publicMember(value);
  // Task fields are explicitly constructed by handlers and contain no credentials.
  // Preserve task arrays/objects without copying every activity record on each SSE event.
  if (typeof value.userId === 'string' && typeof value.title === 'string' &&
    !['secret', 'private_key', 'clickupApiKey'].some(key => key in value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !['secret', 'private_key', 'clickupApiKey'].includes(key))
    .map(([key, item]) => [key, redactPayload(item)]));
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

export function createApiSecurity(options: {
  getStore: () => { users: Member[]; tasks: { id: string; userId: string }[] };
  verify: (token: string) => Promise<Identity>;
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const routePath = req.path.replace(/\/+$/, '') || '/';
    if ((req.method === 'GET' && routePath === '/health')) return next();
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
      const manager = superadmin || Boolean(caller.isCreativeDirector);
      const denied = () => res.status(403).json({ error: 'You do not have permission for this operation' });
      const owner = (id: unknown) => store.users.find(user => user.id === id);
      const edit = (id: unknown) => canEdit(caller, owner(id));
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      req.body = body;

      if (routePath.startsWith('/audit/') && !manager) return denied();
      if (routePath.startsWith('/firestore/') && req.method !== 'GET' && !superadmin) return denied();
      if (routePath === '/auth/login' || routePath === '/auth/verify-email') body.email = caller.email;

      if (routePath === '/users/remap-tasks' && !superadmin) return denied();
      if (routePath === '/users' && req.method === 'POST') {
        if (!manager) return denied();
        const existing = store.users.find(user => user.email.toLowerCase() === String(body.email || '').toLowerCase());
        if (!superadmin && (body.isCreativeDirector || (existing && (!edit(existing.id) || existing.isCreativeDirector)))) return denied();
        if (!superadmin) body.creativeDirectorId = caller.id;
      }
      const userMatch = routePath.match(/^\/users\/([^/]+)$/);
      if (userMatch && ['PUT', 'DELETE'].includes(req.method)) {
        const target = owner(decodeURIComponent(userMatch[1]));
        if (target && !edit(target.id)) return denied();
        if (req.method === 'DELETE' && (!manager || (target && isSuperadmin(target)))) return denied();
        if (req.method === 'PUT') {
          if (!superadmin && (body.email !== undefined || body.isCreativeDirector !== undefined)) return denied();
          if (!manager) return denied();
          if (!superadmin && body.creativeDirectorId !== undefined && body.creativeDirectorId !== caller.id) return denied();
        }
      }
      if (routePath === '/tasks' && req.method === 'POST' && !edit(body.userId)) return denied();
      // Delegation is intentionally available to every authenticated member, across boards.
      const taskMatch = routePath.match(/^\/tasks\/([^/]+)$/);
      if (taskMatch && ['PUT', 'DELETE'].includes(req.method)) {
        const task = store.tasks.find(item => item.id === decodeURIComponent(taskMatch[1]));
        if (task && !edit(task.userId)) return denied();
        if (body.userId !== undefined && !edit(body.userId)) return denied();
      }
      if (routePath === '/tasks/reorder' && req.method === 'POST' && Array.isArray(body.updates)) {
        // Validate the entire batch before the existing handler can mutate any task.
        const tasks = new Map(store.tasks.map(task => [task.id, task]));
        for (const update of body.updates) {
          if (!update || typeof update !== 'object') continue;
          const task = tasks.get(update.id);
          if ((task && !edit(task.userId)) || (update.userId !== undefined && !edit(update.userId))) return denied();
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
      const json = res.json.bind(res);
      res.json = ((value: any) => json(redactPayload(value))) as Response['json'];
      res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');
      return next();
    } catch {
      return res.status(401).json({ error: 'Google session expired or invalid' });
    }
  };
}

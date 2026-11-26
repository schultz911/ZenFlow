import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import compression from 'compression';
import type { ParentTask, Task, User } from '../src/types';
import {
  canAssignToDiscipline,
  canCreatePipelineTask,
  deriveMemberDesignation,
  isAdminMember,
  isBusinessLead,
  isSuperadmin as isSuperadminUser,
  getSuperadminEmail,
  VALID_ROLES,
} from '../src/domain/permissions';
import { encryptSecret } from './crypto';
import {
  computeStatusTransitionTimers,
  formatBillableHours,
  getTaskAssigneeIds,
  removeUserFromTaskList,
  taskMatchesAnyUserRef,
} from '../src/domain/taskTransitions';
import {
  createApiSecurity,
  publicMember,
  redactPayload,
  sameOriginMutation,
  SESSION_COOKIE,
  type Identity,
} from './security';
import type { WorkspaceRepository } from './store';
import type { ClickUpService } from './clickup';
import { writeSse } from './resources';

export const AVATAR_COLORS = [
  'from-blue-500 to-cyan-500',
  'from-purple-500 to-pink-500',
  'from-amber-500 to-orange-500',
  'from-emerald-500 to-teal-500',
  'from-rose-500 to-red-500',
  'from-indigo-500 to-blue-500',
];

export function sanitizeString(input: unknown, maxLen = 1000): string {
  if (typeof input !== 'string') return '';
  return input.trim().replace(/[<>]/g, '').slice(0, maxLen);
}

export function validateHttpUrl(input: unknown): { value?: string; error?: string } {
  if (input === undefined || input === null) return { value: undefined };
  if (typeof input !== 'string') return { error: 'Link must be a valid URL string' };
  const trimmed = input.trim();
  if (!trimmed) return { value: undefined };
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { error: 'URL must start with http:// or https://' };
    }
    return { value: trimmed.slice(0, 1000) };
  } catch {
    return { error: `Invalid URL: ${trimmed}` };
  }
}

export function sanitizeUrlList(raw: unknown): { value?: string[]; error?: string } {
  if (!Array.isArray(raw)) return { value: undefined };
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string' || !item.trim()) continue;
    const checked = validateHttpUrl(item);
    if (checked.error) return { error: checked.error };
    if (checked.value && !seen.has(checked.value)) {
      seen.add(checked.value);
      cleaned.push(checked.value);
    }
  }
  return { value: cleaned.length > 0 ? cleaned : undefined };
}

export function sanitizeDisciplineMetadata(raw: unknown): { value?: Record<string, any>; error?: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { value: undefined };
  const src = raw as Record<string, unknown>;
  const out: Record<string, any> = {};

  if (typeof src.contentType === 'string' && src.contentType.trim()) {
    out.contentType = sanitizeString(src.contentType, 300);
  }
  if (typeof src.contentSpecifications === 'string' && src.contentSpecifications.trim()) {
    out.contentSpecifications = sanitizeString(src.contentSpecifications, 10000);
  }
  if (src.sourceContentReferences !== undefined) {
    const refs = sanitizeUrlList(src.sourceContentReferences);
    if (refs.error) return { error: `Source Content & References: ${refs.error}` };
    if (refs.value) out.sourceContentReferences = refs.value;
  }

  if (typeof src.assetType === 'string' && src.assetType.trim()) {
    out.assetType = sanitizeString(src.assetType, 300);
  }
  if (typeof src.designSpecifications === 'string' && src.designSpecifications.trim()) {
    out.designSpecifications = sanitizeString(src.designSpecifications, 10000);
  }
  if (src.brandAssetsReferences !== undefined) {
    const refs = sanitizeUrlList(src.brandAssetsReferences);
    if (refs.error) return { error: `Brand Assets & References: ${refs.error}` };
    if (refs.value) out.brandAssetsReferences = refs.value;
  }

  return { value: Object.keys(out).length > 0 ? out : undefined };
}

const MAX_RATE_LIMIT_KEYS = 10_000;

function createRateLimiter(maxRequests: number, windowMs: number) {
  const records = new Map<string, number[]>();
  let lastPrune = Date.now();
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    if (now - lastPrune > windowMs || records.size >= MAX_RATE_LIMIT_KEYS) {
      for (const [key, timestamps] of records.entries()) {
        const active = timestamps.filter(ts => now - ts < windowMs);
        if (active.length === 0) records.delete(key);
        else records.set(key, active);
      }
      if (records.size >= MAX_RATE_LIMIT_KEYS) records.clear();
      lastPrune = now;
    }
    const recent = (records.get(ip) || []).filter(ts => now - ts < windowMs);
    if (recent.length >= maxRequests) {
      return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }
    recent.push(now);
    records.set(ip, recent);
    next();
  };
}

export interface SseHub {
  broadcastEvent: (type: string, payload: any) => void;
  handleEvents: (req: Request, res: Response, initialSnapshot?: { users: any[]; tasks: any[] }) => void;
  getClients: () => Array<{ id: string; res: Response }>;
  closeAll: () => void;
}

export function createSseHub(maxClients = 100): SseHub {
  let clients: Array<{ id: string; res: Response }> = [];

  const broadcastEvent = (type: string, payload: any) => {
    const safePayload =
      type === 'user_created' || type === 'user_updated'
        ? publicMember(payload)
        : type === 'sync_all' && payload?.users
        ? { ...payload, users: payload.users.map(publicMember) }
        : payload;
    const message = `event: update\ndata: ${JSON.stringify({ type, payload: safePayload, timestamp: new Date().toISOString() })}\n\n`;
    clients = clients.filter(c => writeSse(c.res, message));
  };

  const handleEvents = (req: Request, res: Response, initialSnapshot?: { users: any[]; tasks: any[] }) => {
    if (clients.length >= maxClients) {
      return res.status(503).json({ error: 'Too many active realtime listeners' });
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const id = `sse-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    clients.push({ id, res });
    let initialChunk = `event: init\ndata: ${JSON.stringify({ connected: true })}\n\n`;
    if (initialSnapshot) {
      initialChunk += `event: snapshot\ndata: ${JSON.stringify({
        users: initialSnapshot.users.map(publicMember),
        tasks: initialSnapshot.tasks,
      })}\n\n`;
    }
    writeSse(res, initialChunk);

    const keepAlive = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(keepAlive);
      }
    }, 30000);
    keepAlive.unref?.();

    req.on('close', () => {
      clearInterval(keepAlive);
      clients = clients.filter(c => c.id !== id);
    });
  };

  const closeAll = () => {
    for (const c of clients) {
      try {
        c.res.write('event: shutdown\ndata: {"reason":"server_shutdown"}\n\n');
        c.res.end();
      } catch {
        // ignore
      }
    }
    clients = [];
  };

  return { broadcastEvent, handleEvents, getClients: () => clients, closeAll };
}

export interface ServerAppDeps {
  repo: WorkspaceRepository;
  clickup: ClickUpService;
  verifyIdentity: (token: string) => Promise<Identity>;
  sseHub: SseHub;
  enableRequestLogging?: boolean;
}

export function createServerApp(deps: ServerAppDeps): Express {
  const { repo, clickup, verifyIdentity, sseHub, enableRequestLogging = true } = deps;
  const { broadcastEvent } = sseHub;

  const app = express();
  app.disable('x-powered-by');
  app.set('case sensitive routing', true);
  app.set('trust proxy', 1);

  app.use(
    compression({
      filter: (req: Request, res: Response) => {
        if (req.headers['x-no-compression'] || req.path === '/api/events') {
          return false;
        }
        return compression.filter(req, res);
      },
      threshold: 1024,
    })
  );

  const isProd = process.env.NODE_ENV === 'production';
  const scriptSrc = isProd ? "script-src 'self' https://apis.google.com" : "script-src 'self' 'unsafe-inline' https://apis.google.com";
  const cspHeader = `default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://lh3.googleusercontent.com https://*.googleusercontent.com; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://api.clickup.com; frame-src 'self' https://*.firebaseapp.com https://accounts.google.com; frame-ancestors 'none'; object-src 'none'; base-uri 'self';`;

  app.use((req: Request, res: Response, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    if (req.secure) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    res.setHeader('Content-Security-Policy', cspHeader);
    next();
  });

  if (enableRequestLogging) {
    app.use((req: Request, res: Response, next) => {
      const t0 = Date.now();
      res.on('finish', () => {
        if (req.path.startsWith('/api/') && req.path !== '/api/events') {
          console.log(
            JSON.stringify({
              method: req.method,
              path: req.path,
              status: res.statusCode,
              ms: Date.now() - t0,
              ip: req.ip,
            })
          );
        }
      });
      next();
    });
  }

  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buffer) => {
        if (req.url?.split('?')[0].replace(/\/+$/, '') === '/api/clickup/webhook') {
          (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
        }
      },
    })
  );

  const authLimiter = createRateLimiter(20, 60 * 1000);
  const firestoreLimiter = createRateLimiter(10, 60 * 1000);
  const apiGeneralLimiter = createRateLimiter(120, 60 * 1000);

  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/events' || req.path === '/clickup/webhook') return next();
    return apiGeneralLimiter(req, res, next);
  });

  // Cookie session exchange & logout
  app.post('/api/auth/session', authLimiter, async (req: Request, res: Response) => {
    if (!sameOriginMutation(req)) return res.status(403).json({ error: 'Invalid request origin' });
    const token = req.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
    if (!token) return res.status(401).json({ error: 'Google identity required' });
    try {
      const identity = await verifyIdentity(token);
      if (
        !identity.email_verified ||
        identity.firebase?.sign_in_provider !== 'google.com' ||
        identity.exp * 1000 <= Date.now()
      ) {
        return res.status(401).json({ error: 'Verified Google identity required' });
      }
      const cleanIdentityEmail = identity.email?.trim().toLowerCase();
      const superEmail = getSuperadminEmail();
      let user = repo.getUsers().find(m => m.email.toLowerCase() === cleanIdentityEmail);
      if (!user && cleanIdentityEmail === superEmail) {
        user = repo.ensureSuperadmin();
        broadcastEvent('user_created', user);
        repo.appendAuditLog({
          category: 'security',
          action: 'superadmin_bootstrapped',
          actor: { id: user.id, name: user.name, email: user.email, ip: req.ip },
          targetId: user.id,
          targetType: 'user',
          details: `Superadmin bootstrap account initialized for ${superEmail}`,
        });
      }
      if (!user) return res.status(403).json({ error: 'Account not registered in ZenFlow' });
      res.setHeader('Cache-Control', 'no-store');
      res.cookie(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: req.secure,
        sameSite: 'strict',
        path: '/api',
        maxAge: Math.max(0, identity.exp * 1000 - Date.now()),
      });
      res.json({ user: redactPayload(user) });
    } catch {
      res.status(401).json({ error: 'Google session expired or invalid' });
    }
  });

  app.delete('/api/auth/session', (req: Request, res: Response) => {
    if (!sameOriginMutation(req)) return res.status(403).json({ error: 'Invalid request origin' });
    res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: req.secure, sameSite: 'strict', path: '/api' });
    res.status(204).end();
  });

  app.use('/api', createApiSecurity({ getStore: () => repo.getStore(), verify: verifyIdentity, ensureSuperadmin: () => repo.ensureSuperadmin() }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  app.get('/api/state', (req: Request, res: Response) => {
    repo.maybeArchive(archived => broadcastEvent('tasks_reordered', archived));
    repo.deduplicateUsers();
    const etag = `W/"zenflow-rev-${repo.getRevision()}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }
    const store = repo.getStore();
    res.json({ users: store.users, tasks: store.tasks });
  });

  app.post('/api/auth/login', authLimiter, (req: Request, res: Response) => {
    const { name, email, role } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const cleanEmail = sanitizeString(email).toLowerCase();
    const cleanName = name ? sanitizeString(name) : '';
    const cleanRole = (role === 'design' ? 'design' : 'content') as 'content' | 'design';

    repo.deduplicateUsers();
    const store = repo.getStore();
    const existingUser = store.users.find(u => u.email.toLowerCase() === cleanEmail);

    if (existingUser) {
      if (cleanName && existingUser.name !== cleanName) {
        existingUser.name = cleanName;
        repo.saveLocal();
        repo.saveUser(existingUser).catch(e => console.error('Firestore user update err:', e));
        broadcastEvent('user_updated', existingUser);
      }
      repo.appendAuditLog({
        category: 'security',
        action: 'user_login',
        actor: { id: existingUser.id, name: existingUser.name, email: existingUser.email, ip: req.ip },
        targetId: existingUser.id,
        targetType: 'user',
        details: `User "${existingUser.name}" logged in successfully (${cleanEmail})`,
      });
      return res.json({ user: existingUser, isNew: false });
    }

    const superEmail = getSuperadminEmail();
    if (cleanEmail === superEmail) {
      const superadmin: User = {
        id: 'user-superadmin-kiran',
        name: cleanName || 'Kiran S',
        email: superEmail,
        role: cleanRole,
        avatarColor: 'from-blue-600 to-indigo-600',
        isCreativeDirector: true,
        createdAt: new Date().toISOString(),
      };
      store.users.unshift(superadmin);
      repo.saveLocal();
      repo.saveUser(superadmin).catch(e => console.error('Firestore user create err:', e));
      broadcastEvent('user_created', superadmin);
      repo.appendAuditLog({
        category: 'security',
        action: 'superadmin_bootstrapped',
        actor: { id: superadmin.id, name: superadmin.name, email: superadmin.email, ip: req.ip },
        targetId: superadmin.id,
        targetType: 'user',
        details: `Superadmin bootstrap account initialized for ${superEmail}`,
      });
      return res.status(201).json({ user: superadmin, isNew: true });
    }

    repo.appendAuditLog({
      category: 'security',
      action: 'unauthorized_login_attempt',
      actor: { email: cleanEmail, ip: req.ip },
      targetId: 'auth',
      targetType: 'workspace',
      details: `Unauthorized login rejected for unregistered email: ${cleanEmail}`,
    });
    return res.status(403).json({
      error:
        `Account not registered. Only team members with an existing ZenFlow account are authorized to log in. Please contact ${superEmail} to be added.`,
    });
  });

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

  app.post('/api/users', (req: Request, res: Response) => {
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
    repo.saveLocal();
    repo.saveUser(newUser).catch(e => console.error('Firestore user create err:', e));
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
          const tasksToRemap = store.tasks.filter(t => taskMatchesAnyUserRef(t, [oldUserId, oldEmail, cleanEmail]));

          for (const task of tasksToRemap) {
            const assignees = getTaskAssigneeIds(task);
            const remapped = Array.from(
              new Set(
                assignees.map(uid =>
                  uid === oldUserId ||
                  uid.toLowerCase() === oldEmail.toLowerCase() ||
                  uid.toLowerCase() === cleanEmail
                    ? existingTargetUser.id
                    : uid
                )
              )
            );
            task.assigneeIds = remapped.length > 0 ? remapped : [existingTargetUser.id];
            task.userId = task.assigneeIds[0];
            task.updatedAt = nowIso;
          }

          if (body.name !== undefined && sanitizeString(body.name)) existingTargetUser.name = sanitizeString(body.name);
          if (body.role !== undefined && VALID_ROLES.includes(body.role)) existingTargetUser.role = body.role;
          if (!existingTargetUser.clickupApiKey && current.clickupApiKey) existingTargetUser.clickupApiKey = current.clickupApiKey;
          if (!existingTargetUser.clickupUserId && current.clickupUserId) {
            existingTargetUser.clickupUserId = current.clickupUserId;
            existingTargetUser.clickupUsername = current.clickupUsername;
          }

          store.users = store.users.filter(u => u.id !== oldUserId);
          repo.saveLocal();
          await repo.saveUser(existingTargetUser);
          if (tasksToRemap.length > 0) await repo.batchSaveTasks(tasksToRemap);
          await repo.deleteUser(oldUserId);

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

        current.email = cleanEmail;
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

    store.users[userIndex] = updated;
    repo.saveLocal();
    await repo.saveUser(updated);
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

    for (const task of tasksToRemap) {
      task.userId = targetUser.id;
      task.assigneeIds = [targetUser.id];
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
    }

    if (tasksToRemap.length > 0) await repo.batchSaveTasks(tasksToRemap);

    let deletedSourceUserId: string | undefined;
    if (deleteSourceUser && sourceUser && !isSuperadminUser(sourceUser)) {
      store.users = store.users.filter(u => u.id !== sourceUser.id);
      deletedSourceUserId = sourceUser.id;
      await repo.deleteUser(sourceUser.id);
      broadcastEvent('user_deleted', { id: sourceUser.id });
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

    if (tasksToRemap.length > 0) broadcastEvent('tasks_reordered', tasksToRemap);
    broadcastEvent('sync_all', { users: store.users, tasks: store.tasks });

    res.json({
      success: true,
      remappedCount: tasksToRemap.length,
      targetUser,
      deletedSourceUserId,
    });
  });

  app.delete('/api/users/:id', (req: Request, res: Response) => {
    const id = String(req.params.id || '');
    const store = repo.getStore();
    const userIndex = store.users.findIndex(u => u.id === id);
    if (userIndex === -1) return res.status(404).json({ error: 'User not found' });

    const removedUser = store.users.splice(userIndex, 1)[0];
    const { keptTasks, updatedTasks, deletedTaskIds } = removeUserFromTaskList(store.tasks, id);
    store.tasks = keptTasks;
    repo.saveLocal();

    repo.deleteUser(removedUser.id).catch(e => console.error('Firestore user delete err:', e));
    if (deletedTaskIds.length > 0) {
      repo.batchDeleteTasks(deletedTaskIds).catch(e => console.error('Firestore batch delete tasks err:', e));
    }
    if (updatedTasks.length > 0) {
      repo.batchSaveTasks(updatedTasks).catch(e => console.error('Firestore batch save shared tasks err:', e));
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

  app.get('/api/tasks', (req: Request, res: Response) => {
    repo.maybeArchive(archived => broadcastEvent('tasks_reordered', archived));
    const etag = `W/"zenflow-tasks-${repo.getRevision()}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }
    res.json(repo.getTasks());
  });

  app.post('/api/tasks/pipeline-bundle', async (req: Request, res: Response) => {
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

    const token = clickup.resolveToken({ req, caller });
    const { buildParentClickupMarkdown, buildSubtaskClickupMarkdown } = await import('./clickup');
    const parentMarkdown = buildParentClickupMarkdown(cleanDescription, cleanBrandGuidelines);
    const remoteParent =
      token && cleanListId
        ? await clickup.createRemoteParentTask({
            token,
            listId: cleanListId,
            title: cleanTitle,
            markdown: parentMarkdown,
            dueDate: cleanDueDate,
            taskTypeFieldId: cleanTaskTypeFieldId,
            taskTypeId: cleanTaskTypeId,
          })
        : {};

    const store = repo.getStore();
    const now = new Date().toISOString();
    const parentTaskId = `parent-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const parentTask: ParentTask = {
      id: parentTaskId,
      title: cleanTitle,
      brief: cleanDescription,
      brandGuidelines: cleanBrandGuidelines,
      clickupParentTaskId: remoteParent.clickupParentTaskId,
      lastSyncedClickupDescHash: remoteParent.descHash,
      createdAt: now,
      updatedAt: now,
    };
    if (!Array.isArray(store.parentTasks)) store.parentTasks = [];
    store.parentTasks.push(parentTask);
    repo.saveParentTask(parentTask).catch(e => console.error('Firestore bundle parent save err:', e));

    const createdTasks: Task[] = [];
    for (const disc of validDisciplines) {
      const existingInPipeline = store.tasks.filter(t => t.team === disc && t.status === 'pipeline');
      const maxOrder = existingInPipeline.reduce((max, t) => Math.max(max, t.order ?? 0), -1);
      const discLabel = disc === 'content' ? 'Content' : 'Design';
      const subtaskId = `task-${Date.now()}-${disc.slice(0, 3)}-${Math.random().toString(36).substring(2, 6)}`;
      const discMeta = sanitizedDisciplineSpecs[disc];
      const subMarkdown = buildSubtaskClickupMarkdown(disc, discMeta);
      const remoteSub =
        token && cleanListId
          ? await clickup.createRemoteSubtask({
              token,
              listId: cleanListId,
              title: cleanTitle,
              discLabel,
              clickupParentTaskId: remoteParent.clickupParentTaskId,
              parentClickupUrl: remoteParent.clickupUrl,
              markdown: subMarkdown,
              dueDate: cleanDueDate,
              taskTypeFieldId: cleanTaskTypeFieldId,
              taskTypeId: cleanTaskTypeId,
            })
          : { clickupUrl: remoteParent.clickupUrl };

      const subtask: Task = {
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
        clickupTaskId: remoteSub.clickupTaskId,
        clickupParentTaskId: remoteParent.clickupParentTaskId,
        clickupUrl: remoteSub.clickupUrl,
        clickupSpaceId: cleanSpaceId,
        clickupSpaceName: cleanSpaceName,
        clickupFolderId: cleanFolderId,
        clickupFolderName: cleanFolderName,
        clickupListId: cleanListId,
        clickupListName: cleanListName,
        clickupTaskType: cleanTaskType,
        clickupTaskTypeId: cleanTaskTypeId,
        clickupTaskTypeFieldId: cleanTaskTypeFieldId,
        lastSyncedClickupDescHash: remoteSub.descHash,
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
      };

      store.tasks.push(subtask);
      createdTasks.push(subtask);
      repo.saveTask(subtask).catch(e => console.error('Firestore bundle task save err:', e));
      broadcastEvent('task_created', subtask);
    }

    repo.saveLocal();
    repo.appendAuditLog({
      category: 'task',
      action: 'pipeline_bundle_created',
      actor: { id: caller?.id, name: caller?.name, email: caller?.email, ip: req.ip },
      targetId: parentTask.id,
      targetType: 'task',
      details: `Pipeline bundle "${cleanTitle}" created for ${validDisciplines.join(', ')}`,
    });

    res.status(201).json({
      parentTaskId: parentTask.id,
      clickupParentTaskId: parentTask.clickupParentTaskId,
      parentTask,
      tasks: createdTasks,
    });
  });

  app.post('/api/tasks', (req: Request, res: Response) => {
    const body = req.body || {};
    const store = repo.getStore();
    const caller: User | undefined = res.locals.caller;
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
    const validLoad: Task['cognitiveLoad'] = ['low', 'medium', 'high'].includes(body.cognitiveLoad)
      ? body.cognitiveLoad
      : 'medium';
    const parsedDueDate =
      validStatus === 'pipeline' || validStatus === 'retainer'
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
      id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
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
        typeof body.estimatedHours === 'number' && !isNaN(body.estimatedHours) && body.estimatedHours >= 0
          ? Math.round(body.estimatedHours * 10) / 10
          : undefined,
      priority: ['low', 'medium', 'high'].includes(body.priority) ? body.priority : undefined,
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

    store.tasks.push(newTask);
    repo.saveLocal();
    repo.saveTask(newTask).catch(e => console.error('Firestore task create err:', e));
    broadcastEvent('task_created', newTask);
    repo.appendAuditLog({
      category: 'task',
      action: 'task_created',
      actor: { id: caller?.id, email: caller?.email, ip: req.ip },
      targetId: newTask.id,
      targetType: 'task',
      details: `Task "${newTask.title}" created`,
    });

    const token = clickup.resolveToken({ req, caller, fallbackToAnyUser: false });
    if (token) {
      clickup.syncTaskToClickUp(newTask, token, firstUser, caller?.id).catch(() => {});
    }

    res.status(201).json(newTask);
  });

  app.post('/api/tasks/:id/duplicate', async (req: Request, res: Response) => {
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
      cognitiveLoad: ['low', 'medium', 'high'].includes(body.targetCognitiveLoad)
        ? body.targetCognitiveLoad
        : sourceTask.cognitiveLoad,
      status: validStatus,
      order: maxOrder + 1,
      completedAt: timers.completedAt,
      inProgressStartedAt: timers.inProgressStartedAt,
      inProgressDurationMs: timers.inProgressDurationMs,
      client: sourceTask.client,
      project: sourceTask.project,
      estimatedHours: sourceTask.estimatedHours,
      priority: sourceTask.priority,
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

    store.tasks.push(duplicated);
    repo.saveLocal();
    await repo.saveTask(duplicated);
    broadcastEvent('task_created', duplicated);

    const token = clickup.resolveToken({ req, caller: res.locals.caller, taskUser: targetUser, fallbackToAnyUser: false });
    if (token) {
      await clickup.syncTaskToClickUp(duplicated, token, targetUser, res.locals.caller?.id).catch(() => {});
    }

    res.status(201).json({ task: duplicated });
  });

  app.put('/api/tasks/:id', (req: Request, res: Response) => {
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

    if (body.cognitiveLoad && body.cognitiveLoad !== currentTask.cognitiveLoad) {
      makeAct(
        'updated',
        `Cognitive load updated from ${currentTask.cognitiveLoad} to ${body.cognitiveLoad}`,
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

    const parsedEstimatedHours =
      body.estimatedHours !== undefined
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
        body.cognitiveLoad && ['low', 'medium', 'high'].includes(body.cognitiveLoad)
          ? body.cognitiveLoad
          : currentTask.cognitiveLoad,
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
        body.priority !== undefined && ['low', 'medium', 'high'].includes(body.priority)
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

    store.tasks[taskIndex] = updatedTask;

    const cuToken = clickup.resolveToken({ req, caller, fallbackToAnyUser: false });
    const siblingBroadcasts: Task[] = [];
    const hasCanonicalParent = Boolean(
      updatedTask.parentTaskId && !store.tasks.some(t => t.id === updatedTask.parentTaskId)
    );

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
        store.parentTasks.push(parent);
      } else {
        parent.brief = nextDescription;
        parent.brandGuidelines = nextBrandGuidelines;
        parent.updatedAt = nowIso;
      }
      repo.saveParentTask(parent).catch(e => console.error('Firestore parent update err:', e));

      for (const sib of store.tasks) {
        if (sib.id === updatedTask.id || sib.parentTaskId !== updatedTask.parentTaskId) continue;
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

      const parentCuToken = cuToken || clickup.resolveToken({ fallbackToAnyUser: true });
      if (parentCuToken && parent.clickupParentTaskId) {
        clickup.syncParentDescriptionToClickUp(parent, parentCuToken).catch(() => {});
      }
    }

    const linkToPropagate = updatedTask.contentDocLink;
    const syncedDocToOwnTask = Boolean(
      updatedTask.team === 'content' &&
        linkToPropagate &&
        (updatedTask.status === 'done' || body.contentDocLink !== undefined)
    );
    if (syncedDocToOwnTask) {
      const siblings = store.tasks.filter(
        t =>
          t.id !== updatedTask.id &&
          t.team === 'design' &&
          ((updatedTask.parentTaskId && t.parentTaskId === updatedTask.parentTaskId) ||
            (updatedTask.clickupParentTaskId && t.clickupParentTaskId === updatedTask.clickupParentTaskId))
      );
      for (const sib of siblings) {
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
        clickup.syncContentLinkToClickUp(sib, linkToPropagate, cuToken).catch(() => {});
      }
      if (body.contentDocLink !== undefined) {
        clickup.syncContentLinkToClickUp(updatedTask, linkToPropagate, cuToken).catch(() => {});
      }
    }

    repo.saveLocal();
    if (siblingBroadcasts.length > 0) {
      repo.batchSaveTasks([updatedTask, ...siblingBroadcasts]).catch(e => console.error('Firestore batch task save err:', e));
      broadcastEvent('tasks_reordered', siblingBroadcasts);
    } else {
      repo.saveTask(updatedTask).catch(e => console.error('Firestore task update err:', e));
    }
    broadcastEvent('task_updated', updatedTask);

    const includeSpecsInTaskSync = specsChanged && !(syncedDocToOwnTask && body.contentDocLink !== undefined);
    if (cuToken || includeSpecsInTaskSync || updatedTask.clickupTaskId) {
      clickup.syncTaskToClickUp(updatedTask, cuToken, undefined, caller?.id, includeSpecsInTaskSync).catch(() => {});
    }

    res.json(updatedTask);
  });

  app.delete('/api/tasks/:id', (req: Request, res: Response) => {
    const id = String(req.params.id || '');
    const removeAssigneeId = typeof req.query.removeAssigneeId === 'string' ? req.query.removeAssigneeId : undefined;
    const store = repo.getStore();
    const taskIndex = store.tasks.findIndex(t => t.id === id);
    if (taskIndex === -1) return res.status(404).json({ error: 'Task not found' });

    const task = store.tasks[taskIndex];
    if (removeAssigneeId) {
      const assignees = getTaskAssigneeIds(task);
      const remaining = assignees.filter(uid => uid !== removeAssigneeId);
      if (remaining.length > 0 && remaining.length < assignees.length) {
        task.assigneeIds = remaining;
        task.userId = remaining[0];
        task.updatedAt = new Date().toISOString();
        repo.saveLocal();
        repo.saveTask(task).catch(e => console.error('Firestore partial unassign err:', e));
        broadcastEvent('task_updated', task);
        return res.json({ success: true, task, partialUnassign: true });
      }
    }

    const removed = store.tasks.splice(taskIndex, 1)[0];
    if (removed.parentTaskId && Array.isArray(store.parentTasks)) {
      const remainingSiblings = store.tasks.some(t => t.parentTaskId === removed.parentTaskId);
      if (!remainingSiblings) {
        store.parentTasks = store.parentTasks.filter(p => p.id !== removed.parentTaskId);
        repo.deleteParentTask(removed.parentTaskId).catch(e => console.error('Firestore parent delete err:', e));
      }
    }

    repo.saveLocal();
    repo.deleteTask(removed.id).catch(e => console.error('Firestore task delete err:', e));
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
  });

  app.post('/api/tasks/reorder', (req: Request, res: Response) => {
    const { updates } = req.body || {};
    if (!Array.isArray(updates)) return res.status(400).json({ error: 'Updates array is required' });

    const store = repo.getStore();
    const caller: User | undefined = res.locals.caller;
    const cuToken = clickup.resolveToken({ req, caller, fallbackToAnyUser: false });
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
    const now = new Date();
    const nowIso = now.toISOString();

    for (const update of updates) {
      if (!update || typeof update !== 'object' || !update.id) continue;
      const task = taskMap.get(update.id);
      if (!task) continue;

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

      if (task.team === 'content' && task.status === 'done' && task.contentDocLink) {
        const siblings = store.tasks.filter(
          t =>
            t.id !== task.id &&
            t.team === 'design' &&
            ((task.parentTaskId && t.parentTaskId === task.parentTaskId) ||
              (task.clickupParentTaskId && t.clickupParentTaskId === task.clickupParentTaskId))
        );
        for (const sib of siblings) {
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
          clickup.syncContentLinkToClickUp(sib, task.contentDocLink, cuToken).catch(() => {});
        }
        clickup.syncContentLinkToClickUp(task, task.contentDocLink, cuToken).catch(() => {});
      }

      clickup.syncTaskToClickUp(task, cuToken, undefined, caller?.id).catch(() => {});
    }

    repo.saveLocal();
    const allChanged = [...modifiedTasks, ...siblingUpdates];
    if (allChanged.length > 0) {
      repo.batchSaveTasks(allChanged).catch(e => console.error('Firestore batch reorder err:', e));
    }
    broadcastEvent('tasks_reordered', allChanged);
    res.json({ success: true, tasks: modifiedTasks });
  });

  app.get('/api/analytics/snapshots', (_req: Request, res: Response) => {
    res.json(repo.loadAnalyticsSnapshots());
  });

  app.post('/api/analytics/snapshots', async (req: Request, res: Response) => {
    const snapshot = req.body;
    if (!snapshot || typeof snapshot.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(snapshot.id)) {
      return res.status(400).json({ error: 'Valid snapshot payload with safe alphanumeric id is required' });
    }
    const existing = repo.loadAnalyticsSnapshots().find((s: any) => s?.id === snapshot.id);
    if (existing?.locked) {
      return res.status(409).json({ error: 'Locked analytics snapshots cannot be modified' });
    }
    await repo.saveAnalyticsSnapshot(snapshot);
    res.json({ success: true, snapshot });
  });

  clickup.registerRoutes(app);

  app.get('/api/audit/logs', (req: Request, res: Response) => {
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
    const logs = repo.getRecentAuditLogs().slice(0, limit);
    res.json({ logs });
  });

  app.get('/api/audit/download', (_req: Request, res: Response) => {
    const logs = repo.readAllAuditLogs();
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Content-Disposition', 'attachment; filename="zenflow-audit.ndjson"');
    res.send(logs.map(entry => JSON.stringify(entry)).join('\n') + (logs.length ? '\n' : ''));
  });

  app.get('/api/audit/stats', (_req: Request, res: Response) => {
    const logs = repo.readAllAuditLogs();
    res.json({ total: logs.length, latestTimestamp: logs[0]?.timestamp || null });
  });

  app.get('/api/firestore/status', (_req: Request, res: Response) => {
    const status = repo.getFirestoreStatus();
    const store = repo.getStore();
    res.json({
      connected: status.connected,
      mode: 'admin',
      projectId: process.env.FIREBASE_PROJECT_ID || 'zenflow-prod',
      databaseId: '(default)',
      serviceAccountFound: status.hasLocalKey || status.connected,
      totalUsers: store.users.length,
      totalTasks: store.tasks.length,
      lastError: status.lastError,
      lastSyncTime: new Date().toISOString(),
    });
  });

  app.post('/api/firestore/credentials', firestoreLimiter, async (req: Request, res: Response) => {
    const rawKey = req.body?.serviceAccountKey;
    if (!rawKey) return res.status(400).json({ error: 'Service account JSON is required' });
    try {
      const parsed = typeof rawKey === 'string' ? JSON.parse(rawKey) : rawKey;
      const result = await repo.saveCredentials(parsed);
      if (!result.ok) return res.status(400).json({ error: result.error || 'Failed to connect Firestore' });
      const syncRes = await repo.syncRemote();
      broadcastEvent('sync_all', { users: repo.getUsers(), tasks: repo.getTasks() });
      return res.json({ success: true, message: 'Firestore connected and synchronized!', ...syncRes });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Invalid Service Account JSON' });
    }
  });

  app.post('/api/firestore/sync', firestoreLimiter, async (_req: Request, res: Response) => {
    const result = await repo.syncRemote();
    broadcastEvent('sync_all', { users: repo.getUsers(), tasks: repo.getTasks() });
    res.json({
      success: result.synced,
      message: result.synced ? 'Workspace synchronized with Firestore' : 'Firestore sync skipped (offline)',
    });
  });

  app.post('/api/firestore/purge', firestoreLimiter, async (req: Request, res: Response) => {
    const caller: User | undefined = res.locals.caller;
    if (!isSuperadminUser(caller)) {
      return res.status(403).json({ error: 'Only the Superadmin can purge database collections' });
    }

    const result = await repo.purgeAll();
    repo.appendAuditLog({
      category: 'security',
      action: 'database_purged',
      actor: { id: caller?.id, name: caller?.name, email: caller?.email, ip: req.ip },
      targetId: 'workspace',
      targetType: 'workspace',
      details: `Superadmin purged ${result.deletedTasks} tasks and ${result.deletedUsers} users (retained ${result.retainedUser.email})`,
      metadata: {
        deletedTasks: result.deletedTasks,
        deletedUsers: result.deletedUsers,
        retainedEmail: result.retainedUser.email,
      },
    });

    broadcastEvent('sync_all', { users: repo.getUsers(), tasks: repo.getTasks() });
    res.json({
      success: true,
      message: `Purged ${result.deletedTasks} task(s) and ${result.deletedUsers} user account(s).`,
      deletedTaskCount: result.deletedTasks,
      deletedUserCount: result.deletedUsers,
      retainedUser: publicMember(result.retainedUser),
    });
  });

  app.get('/api/events', (req: Request, res: Response) => {
    const store = repo.getStore();
    sseHub.handleEvents(req, res, { users: store.users, tasks: store.tasks });
  });

  return app;
}

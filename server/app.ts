import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import compression from 'compression';
import { canManageMembers, getSuperadminEmail } from '../src/domain/permissions';
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
import { registerUserRoutes } from './routes/users';
import { registerTaskRoutes } from './routes/tasks';
import { registerAdminRoutes } from './routes/admin';
import { sanitizeString } from './routes/validation';
import { isAnalyticsDate } from '../src/domain/analyticsDate';

export {
  AVATAR_COLORS,
  sanitizeString,
  validateHttpUrl,
  sanitizeUrlList,
  sanitizeDisciplineMetadata,
} from './routes/validation';

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
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000))));
      return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }
    recent.push(now);
    records.set(ip, recent);
    next();
  };
}

export interface SseHub {
  broadcastEvent: (type: string, payload: any) => void;
  handleEvents: (
    req: Request,
    res: Response,
    initialSnapshot: { users: any[]; tasks: any[] },
    access: { expiresAt: number; currentMember: () => ReturnType<WorkspaceRepository['getUsers']>[number] | undefined }
  ) => void;
  getClients: () => Array<{ id: string; res: Response }>;
  closeAll: () => void;
}

export function createSseHub(maxClients = 100): SseHub {
  type StreamAccess = Parameters<SseHub['handleEvents']>[3];
  let clients: Array<{ id: string; res: Response; access: StreamAccess }> = [];

  const authorizedMember = (res: Response, access: StreamAccess) => {
    const member = Date.now() < access.expiresAt ? access.currentMember() : undefined;
    if (!member) res.end();
    return member;
  };

  const broadcastEvent = (type: string, payload: any) => {
    const safePayload =
      type === 'user_created' || type === 'user_updated'
        ? publicMember(payload)
        : type === 'sync_all' && payload?.users
        ? { ...payload, users: payload.users.map(publicMember) }
        : payload;
    const message = `event: update\ndata: ${JSON.stringify({ type, payload: safePayload, timestamp: new Date().toISOString() })}\n\n`;
    const managersOnly = type === 'access_request_created' || type === 'access_request_updated';
    clients = clients.filter(c => {
      const member = authorizedMember(c.res, c.access);
      if (!member) return false;
      return managersOnly && !canManageMembers(member) ? true : writeSse(c.res, message);
    });
  };

  const handleEvents = (
    req: Request,
    res: Response,
    initialSnapshot: { users: any[]; tasks: any[] },
    access: StreamAccess
  ) => {
    if (clients.length >= maxClients) {
      return res.status(503).json({ error: 'Too many active realtime listeners' });
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const id = `sse-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    clients.push({ id, res, access });
    let initialChunk = `event: init\ndata: ${JSON.stringify({ connected: true })}\n\n`;
    if (initialSnapshot) {
      initialChunk += `event: snapshot\ndata: ${JSON.stringify({
        users: initialSnapshot.users.map(publicMember),
        tasks: initialSnapshot.tasks,
      })}\n\n`;
    }
    writeSse(res, initialChunk);

    const keepAlive = setInterval(() => {
      if (!authorizedMember(res, access) || !writeSse(res, ': ping\n\n')) {
        clearInterval(keepAlive);
      }
    }, 30000);
    keepAlive.unref?.();
    const expiry = setTimeout(() => res.end(), Math.max(0, access.expiresAt - Date.now()));
    expiry.unref?.();

    req.on('close', () => {
      clearInterval(keepAlive);
      clearTimeout(expiry);
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
  const apiSecurity = createApiSecurity({
    getStore: () => repo.getStore(),
    verify: verifyIdentity,
    ensureSuperadmin: () => repo.ensureSuperadmin(),
  });
  const workspaceWrite: import('./routes/validation').RouteDeps['workspaceWrite'] =
    (handler, options) => (req, res, next) => {
      void repo.runMutation(async () => {
        if (res.destroyed) return;
        if (res.locals.caller) {
          req.body = res.locals.authorizationBody;
          let authorized = false;
          await apiSecurity(req, res, () => { authorized = true; });
          if (!authorized) return;
        }
        if (!options?.purge && repo.purgeNeedsRetry()) {
          return res.status(503).json({ error: 'Workspace writes are paused until the database purge is retried.' });
        }
        return handler(req, res, next);
      }).catch(next);
    };
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

  const verifyGoogleBearer = async (
    req: Request,
    res: Response
  ): Promise<{ token: string; identity: Identity } | null> => {
    if (!sameOriginMutation(req)) {
      res.status(403).json({ error: 'Invalid request origin' });
      return null;
    }
    const token = req.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
    if (!token) {
      res.status(401).json({ error: 'Google identity required' });
      return null;
    }
    try {
      const identity = await verifyIdentity(token);
      if (
        !identity.email_verified ||
        identity.firebase?.sign_in_provider !== 'google.com' ||
        identity.exp * 1000 <= Date.now()
      ) {
        res.status(401).json({ error: 'Verified Google identity required' });
        return null;
      }
      return { token, identity };
    } catch {
      res.status(401).json({ error: 'Google session expired or invalid' });
      return null;
    }
  };

  app.post('/api/auth/session', authLimiter, async (req: Request, res: Response) => {
    const auth = await verifyGoogleBearer(req, res);
    if (!auth) return;
    const { token, identity } = auth;
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
  });

  app.delete('/api/auth/session', (req: Request, res: Response) => {
    if (!sameOriginMutation(req)) return res.status(403).json({ error: 'Invalid request origin' });
    res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: req.secure, sameSite: 'strict', path: '/api' });
    res.status(204).end();
  });

  app.post('/api/auth/request-access', authLimiter, workspaceWrite(async (req: Request, res: Response) => {
    const auth = await verifyGoogleBearer(req, res);
    if (!auth) return;
    const { identity } = auth;
    const cleanEmail = identity.email?.trim().toLowerCase() || '';
    if (!cleanEmail.endsWith('@zensciences.com')) {
      return res.status(403).json({ error: 'Only @zensciences.com Google accounts are permitted to request access.' });
    }
    const existingUser = repo.getUsers().find(u => u.email.toLowerCase() === cleanEmail);
    if (existingUser) {
      return res.json({ status: 'already_registered' });
    }
    const requests = repo.getAccessRequests();
    const existingPending = requests.find(
      r => r.email.toLowerCase() === cleanEmail && r.status === 'pending'
    );
    if (existingPending) {
      return res.json({ request: existingPending, deduplicated: true });
    }
    const displayName = sanitizeString(req.body?.name) || cleanEmail.split('@')[0];
    const accessReq = {
      id: `req-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      email: cleanEmail,
      name: displayName,
      status: 'pending' as const,
      requestedAt: new Date().toISOString(),
    };
    requests.push(accessReq);
    try {
      await repo.saveAccessRequest(accessReq);
    } catch {
      const idx = requests.indexOf(accessReq);
      if (idx !== -1) requests.splice(idx, 1);
      return res.status(503).json({ error: 'Cloud storage write failed; access request was not saved. Please retry.' });
    }
    repo.saveLocal();
    broadcastEvent('access_request_created', accessReq);
    repo.appendAuditLog({
      category: 'security',
      action: 'access_request_created',
      actor: { email: cleanEmail, name: displayName, ip: req.ip },
      targetId: accessReq.id,
      targetType: 'user',
      details: `Access request submitted by ${cleanEmail}`,
    });
    return res.status(201).json({ request: accessReq, deduplicated: false });
  }));

  app.use('/api', apiSecurity);

  app.get('/api/health', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  app.get('/api/analytics/snapshots', async (req, res) => {
    const { start, end } = req.query;
    if (!isAnalyticsDate(start) || !isAnalyticsDate(end) || start > end) {
      return res.status(400).json({ error: 'Select a valid date range' });
    }
    try {
      return res.json({ snapshot: await repo.loadAnalyticsSnapshot(start, end) });
    } catch (error) {
      console.error('[Analytics] Snapshot could not be loaded:', error);
      return res.status(503).json({ error: 'Historical analytics are temporarily unavailable' });
    }
  });

  app.get('/api/state', (req: Request, res: Response) => {
    void repo.runMutation(async () => {
      await repo.maybeArchive(archived => broadcastEvent('tasks_reordered', archived));
      await repo.deduplicateUsers();
    });
    const etag = `W/"zenflow-rev-${repo.getRevision()}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }
    const store = repo.getStore();
    res.json({ users: store.users, tasks: store.tasks });
  });

  const routeDeps = { repo, clickup, broadcastEvent, firestoreLimiter, workspaceWrite };
  registerUserRoutes(app, routeDeps);
  registerTaskRoutes(app, routeDeps);
  clickup.registerRoutes(app);
  registerAdminRoutes(app, routeDeps);

  app.get('/api/events', (req: Request, res: Response) => {
    const store = repo.getStore();
    const { id, email } = res.locals.caller;
    sseHub.handleEvents(
      req,
      res,
      { users: store.users, tasks: store.tasks },
      { expiresAt: res.locals.identityExpiresAt, currentMember: () => store.users.find(u => u.id === id && u.email === email) }
    );
  });

  return app;
}

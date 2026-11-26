import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import compression from 'compression';
import { getSuperadminEmail } from '../src/domain/permissions';
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

  const routeDeps = { repo, clickup, broadcastEvent, firestoreLimiter };
  registerUserRoutes(app, routeDeps);
  registerTaskRoutes(app, routeDeps);
  clickup.registerRoutes(app);
  registerAdminRoutes(app, routeDeps);

  app.get('/api/events', (req: Request, res: Response) => {
    const store = repo.getStore();
    sseHub.handleEvents(req, res, { users: store.users, tasks: store.tasks });
  });

  return app;
}

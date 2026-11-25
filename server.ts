import express, { type Request, type Response } from 'express';
import path from 'node:path';
import type { Identity } from './server/security';
import { createCloudDiskPersistenceAdapter, createWorkspaceRepository } from './server/store';
import { createClickUpService } from './server/clickup';
import { createServerApp, createSseHub, sanitizeString } from './server/app';
import { WebhookRegistry } from './server/webhooks';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const DATA_DIR = process.env.ZENFLOW_DATA_DIR || path.join(process.cwd(), 'data');

async function verifyFirebaseIdToken(idToken: string): Promise<Identity> {
  const adminModule: any = await import('firebase-admin');
  const admin = adminModule.default || adminModule;
  if (!admin.apps?.length) {
    throw new Error('Firebase Admin not initialized');
  }
  const decoded = await admin.auth().verifyIdToken(idToken, true);
  return {
    email: decoded.email,
    email_verified: decoded.email_verified,
    exp: decoded.exp,
    firebase: { sign_in_provider: decoded.firebase?.sign_in_provider },
  };
}

async function startServer() {
  const adapter = createCloudDiskPersistenceAdapter(DATA_DIR);
  const repo = createWorkspaceRepository(adapter);
  const webhookRegistry = new WebhookRegistry(path.join(DATA_DIR, 'webhooks.json'));
  const sseHub = createSseHub();

  await repo.init();
  await webhookRegistry.load(repo.getWebhookDb());

  const clickup = createClickUpService({
    repo,
    webhookRegistry,
    broadcastEvent: sseHub.broadcastEvent,
    sanitizeString,
  });

  const app = createServerApp({
    repo,
    clickup,
    verifyIdentity: verifyFirebaseIdToken,
    sseHub,
  });

  // Periodic background sweep to auto-archive Done tasks older than 7 days
  setInterval(() => {
    repo.archiveExpiredDoneTasks(archived => sseHub.broadcastEvent('tasks_reordered', archived));
  }, 60 * 60 * 1000).unref();

  const serveStaticFiles = () => {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(
      express.static(distPath, {
        setHeaders: (res, filePath) => {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else {
            res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');
          }
        },
      })
    );
    app.get('*', (_req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  };

  if (process.env.NODE_ENV !== 'production') {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (err) {
      console.warn('[Server] Vite dev server unavailable, falling back to static asset serving:', err);
      serveStaticFiles();
    }
  } else {
    serveStaticFiles();
  }

  app.use((err: any, _req: Request, res: Response, _next: () => void) => {
    console.error('[Server Error]:', err);
    if (res.headersSent) return;
    res.status(500).json({ error: 'Internal Server Error' });
  });

  const serverInstance = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Team Management Server running on port ${PORT}`);
  });

  const handleShutdown = (signal: string) => {
    console.log(`[Process] Received ${signal}. Executing zero-loss graceful shutdown...`);
    repo.flushSync();
    sseHub.closeAll();

    serverInstance.close(() => {
      console.log('[Process] HTTP server terminated cleanly.');
      process.exit(0);
    });

    setTimeout(() => {
      console.warn('[Process] Forced exit after timeout.');
      process.exit(0);
    }, 5000);
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

startServer();

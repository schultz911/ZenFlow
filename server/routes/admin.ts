import fs from 'node:fs';
import type { Express, Request, Response } from 'express';
import type { User } from '../../src/types';
import { isSuperadmin as isSuperadminUser } from '../../src/domain/permissions';
import { publicMember } from '../security';
import type { RouteDeps } from './validation';

export function registerAdminRoutes(app: Express, deps: RouteDeps) {
  const { repo, broadcastEvent, firestoreLimiter, workspaceWrite } = deps;

  app.get('/api/audit/logs', (req: Request, res: Response) => {
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
    const logs = repo.getRecentAuditLogs().slice(0, limit);
    res.json({ logs });
  });

  app.get('/api/audit/download', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Content-Disposition', 'attachment; filename="zenflow-audit.ndjson"');
    const filePath = repo.getAuditLogFilePath();
    if (filePath) {
      if (!fs.existsSync(filePath)) {
        return res.status(200).send('');
      }
      const stream = fs.createReadStream(filePath);
      stream.on('error', () => {
        if (!res.headersSent) res.status(500).end();
        else res.end();
      });
      stream.pipe(res);
      return;
    }
    const logs = repo.readAllAuditLogs();
    res.send(logs.map(entry => JSON.stringify(entry)).join('\n') + (logs.length ? '\n' : ''));
  });

  app.get('/api/firestore/status', (_req: Request, res: Response) => {
    const status = repo.getFirestoreStatus();
    const store = repo.getStore();
    res.json({
      connected: status.connected,
      mode: status.connected ? 'admin' : 'local',
      projectId: process.env.FIREBASE_PROJECT_ID || 'zenflow-prod',
      databaseId: '(default)',
      serviceAccountFound: status.hasLocalKey || status.connected,
      totalUsers: store.users.length,
      totalTasks: store.tasks.length,
      lastError: status.lastError,
      lastSyncTime: status.lastSyncTime,
    });
  });

  app.post('/api/firestore/credentials', firestoreLimiter, workspaceWrite(async (req: Request, res: Response) => {
    const rawKey = req.body?.serviceAccountKey;
    if (!rawKey) return res.status(400).json({ error: 'Service account JSON is required' });
    try {
      const parsed = typeof rawKey === 'string' ? JSON.parse(rawKey) : rawKey;
      const result = await repo.saveCredentials(parsed);
      if (!result.ok) return res.status(400).json({ error: result.error || 'Failed to connect Firestore' });
      const syncRes = await repo.syncRemote();
      if (!syncRes.synced) return res.status(503).json({ error: 'Firestore credentials were saved, but the workspace could not be synchronized' });
      broadcastEvent('sync_all', { users: repo.getUsers(), tasks: repo.getTasks() });
      return res.json({ success: true, message: 'Firestore connected and synchronized!', ...syncRes });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Invalid Service Account JSON' });
    }
  }));

  app.post('/api/firestore/sync', firestoreLimiter, workspaceWrite(async (_req: Request, res: Response) => {
    const result = await repo.syncRemote();
    if (result.synced) broadcastEvent('sync_all', { users: repo.getUsers(), tasks: repo.getTasks() });
    res.json({
      success: result.synced,
      message: result.synced ? 'Workspace synchronized with Firestore' : 'Firestore sync skipped (offline)',
    });
  }));

  app.post('/api/firestore/purge', firestoreLimiter, workspaceWrite(async (req: Request, res: Response) => {
    const caller: User | undefined = res.locals.caller;
    if (!isSuperadminUser(caller)) {
      return res.status(403).json({ error: 'Only the Superadmin can purge database collections' });
    }

    let result: Awaited<ReturnType<typeof repo.purgeAll>>;
    try {
      result = await repo.purgeAll();
    } catch (error) {
      console.error('[Database purge] Incomplete:', error);
      return res.status(503).json({
        error: 'Database purge did not finish. Workspace writes are paused. Retry the purge to finish.',
      });
    }
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
  }, { purge: true }));
}

import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import type { RequestHandler, Response } from 'express';
import { once } from 'node:events';

export interface WorkspaceData { users: any[]; tasks: any[] }
export interface WorkspaceSnapshot { store: WorkspaceData; revision: number }

// Strip retired integration metadata without changing native IDs, ownership or history.
export function nativeData(value: any): any {
  if (Array.isArray(value)) return value.map(nativeData);
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Date || typeof value.toDate === 'function') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key, item]) => item !== undefined && !/clickup/i.test(key))
    .map(([key, item]) => [key, nativeData(item)]));
}

export class FirestoreWorkspace {
  constructor(readonly db: Firestore) {}
  private get revisionRef() { return this.db.doc('workspace/state'); }

  async load(): Promise<WorkspaceSnapshot> {
    return this.db.runTransaction(async tx => {
      const [revision, users, tasks] = await Promise.all([
        tx.get(this.revisionRef), tx.get(this.db.collection('users')), tx.get(this.db.collection('tasks')),
      ]);
      return {
        revision: revision.data()?.revision || 0,
        store: {
          users: users.docs.map(doc => nativeData({ ...doc.data(), id: doc.id })),
          tasks: tasks.docs.map(doc => nativeData({ ...doc.data(), id: doc.id })),
        },
      };
    }, { readOnly: true });
  }

  async bootstrap() {
    // No local seed import: an empty database remains an empty workspace with its owner.
    await this.db.runTransaction(async tx => {
      const users = await tx.get(this.db.collection('users'));
      if (!users.docs.some(doc => String(doc.data().email).toLowerCase() === 'kiran.s@zensciences.com')) {
        tx.create(this.db.doc('users/user-superadmin-kiran'), {
          id: 'user-superadmin-kiran', name: 'Kiran S', email: 'kiran.s@zensciences.com',
          role: 'content', isCreativeDirector: true, createdAt: new Date().toISOString(),
          avatarColor: 'from-blue-600 to-indigo-600',
        });
      }
    });
  }

  async migrate() {
    const marker = this.db.doc('workspace/native-v1');
    if ((await marker.get()).exists) return;
    // Back up native data and remove retired credentials/links atomically per document.
    // Update-time preconditions prevent overwriting changes made during deployment overlap.
    const counts: Record<string, number> = {};
    for (const collection of ['users', 'tasks']) {
      const snapshot = await this.db.collection(collection).get();
      counts[collection] = snapshot.size;
      for (let offset = 0; offset < snapshot.size; offset += 200) {
        const batch = this.db.batch();
        for (const doc of snapshot.docs.slice(offset, offset + 200)) {
          // Preserve original task metadata for recovery, excluding saved credentials.
          const backup = Object.fromEntries(Object.entries({ ...doc.data(), id: doc.id })
            .filter(([key]) => !/apikey|secret|token/i.test(key)));
          batch.set(this.db.doc(`workspace_backups/native-v1/${collection}/${doc.id}`), backup);
          batch.update(doc.ref, { id: doc.id, ...Object.fromEntries(Object.entries(doc.data())
            .filter(([key]) => /clickup/i.test(key)).map(([key]) => [key, FieldValue.delete()])),
          }, { lastUpdateTime: doc.updateTime });
        }
        await batch.commit();
      }
    }
    await this.db.doc('server_secrets/clickup_webhooks').delete();
    await marker.set({ completedAt: new Date().toISOString(), counts });
    console.log('[Firestore migration] Native workspace ready:', counts);
  }

  async commit(before: WorkspaceSnapshot, after: WorkspaceData, audit: any[]): Promise<number> {
    const changes: Array<{ path: string; data?: any }> = [];
    for (const collection of ['users', 'tasks'] as const) {
      const previous = new Map(before.store[collection].map(doc => [doc.id, doc]));
      for (const doc of after[collection]) {
        if (!doc.id || doc.id.includes('/')) throw new Error('Invalid document ID');
        const data = nativeData(doc);
        if (JSON.stringify(previous.get(doc.id)) !== JSON.stringify(data)) changes.push({ path: `${collection}/${doc.id}`, data });
        previous.delete(doc.id);
      }
      for (const id of previous.keys()) changes.push({ path: `${collection}/${id}` });
    }
    if (!changes.length && !audit.length) return before.revision;
    // Bound one user operation to an atomic Firestore commit, including its audit records.
    if (changes.length + audit.length + 1 > 500) throw new Error('Operation exceeds atomic workspace write limit');
    return this.db.runTransaction(async tx => {
      const current = await tx.get(this.revisionRef);
      if ((current.data()?.revision || 0) !== before.revision) throw new Error('Workspace changed; retry the operation');
      for (const change of changes) {
        if (change.data) tx.set(this.db.doc(change.path), change.data);
        else tx.delete(this.db.doc(change.path));
      }
      for (const entry of audit) tx.create(this.db.doc(`compliance_audit_logs/${entry.id}`), nativeData(entry));
      const revision = before.revision + 1;
      tx.set(this.revisionRef, { revision, updatedAt: new Date().toISOString() });
      return revision;
    });
  }

  async recentAudit(limit: number) {
    const snapshot = await this.db.collection('compliance_audit_logs').orderBy('timestamp', 'desc').limit(limit).get();
    return snapshot.docs.map(doc => nativeData(doc.data()));
  }

  async downloadAudit(res: Response) {
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    while (!res.destroyed) {
      let query = this.db.collection('compliance_audit_logs').orderBy('timestamp').limit(200);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      if (page.empty) break;
      for (const doc of page.docs) {
        if (res.destroyed) return;
        if (!res.write(JSON.stringify(nativeData(doc.data())) + '\n')) {
          await Promise.race([once(res, 'drain'), once(res, 'close')]);
        }
      }
      cursor = page.docs.at(-1);
    }
    res.end();
  }
}

// Existing workflow handlers run against a fresh snapshot under a process-local lock.
// A database revision check also prevents lost writes across overlapping deployments.
// The response and queued SSE events become visible only after the atomic commit.
export function workspaceMiddleware(options: {
  workspace: FirestoreWorkspace; getStore: () => WorkspaceData; setStore: (store: WorkspaceData) => void;
  begin: (revision: number) => void; audit: () => any[]; committed: (revision: number) => void; failed: (error?: unknown) => void;
}): RequestHandler {
  let tail: Promise<void> = Promise.resolve();
  return async (req, res, next) => {
    if (req.path === '/health') return next();
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    let released = false;
    const unlock = () => { if (!released) { released = true; release(); } };
    const json = res.json.bind(res);
    let snapshot: WorkspaceSnapshot;
    try {
      snapshot = await options.workspace.load();
      options.setStore(structuredClone(snapshot.store));
      options.begin(snapshot.revision);
    } catch (error) {
      console.error('[Firestore read failed]', error);
      options.failed(error); unlock();
      res.status(503); json({ error: 'Workspace database unavailable. Please retry.' }); return;
    }
    let responding = false;
    res.json = ((body: any) => {
      if (responding) return res;
      responding = true;
      const status = res.statusCode;
      void (async () => {
        try {
          if (status < 400) {
            const revision = await options.workspace.commit(snapshot, options.getStore(), options.audit());
            options.committed(revision);
          } else { options.setStore(snapshot.store); options.failed(); }
          res.statusCode = status;
          json(body);
        } catch (error) {
          console.error('[Firestore commit failed]', error);
          options.setStore(snapshot.store); options.failed(error);
          res.removeHeader('ETag'); res.status(503);
          json({ error: 'Workspace changes could not be saved. Please retry.' });
        } finally { unlock(); }
      })();
      return res;
    }) as Response['json'];
    // SSE and read-only downloads own their stream after the handler starts.
    if (req.method === 'GET' && ['/events', '/audit/download'].includes(req.path)) {
      options.failed(); next(); unlock(); return;
    }
    res.once('finish', () => { if (!responding) { options.failed(); unlock(); } });
    next();
  };
}

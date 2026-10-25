import fs from 'node:fs';
import path from 'node:path';

export interface WebhookRegistration { id: string; secret: string; endpoint: string }
export class WebhookRegistry {
  private registrations = new Map<string, WebhookRegistration>();
  constructor(private file: string) {}
  async load(db?: any) {
    const disk = await fs.promises.readFile(this.file, 'utf8').then(JSON.parse).catch((error: any) => {
      if (error.code !== 'ENOENT') console.warn('[Webhook] Cannot load local registrations');
      return [];
    });
    const cloud = db ? await db.collection('server_secrets').doc('clickup_webhooks').get().then((snapshot: any) => snapshot.data()?.registrations || []) : [];
    for (const item of [...disk, ...cloud]) {
      if (typeof item.id === 'string' && typeof item.secret === 'string' && item.secret) this.registrations.set(item.id, item);
    }
  }
  get(id: unknown) { return typeof id === 'string' ? this.registrations.get(id) : undefined; }
  latest() { return [...this.registrations.values()].at(-1); }
  async save(registration: WebhookRegistration, db?: any) {
    const previous = this.registrations.get(registration.id);
    this.registrations.set(registration.id, registration);
    try { await this.persist(db); } catch (error) {
      if (previous) this.registrations.set(registration.id, previous); else this.registrations.delete(registration.id);
      throw error;
    }
  }
  async remove(id: string, db?: any) {
    this.registrations.delete(id);
    await this.persist(db);
  }
  private async persist(db?: any) {
    const registrations = [...this.registrations.values()];
    // Cloud copy survives redeployment; private local copy supports local-only deployments.
    if (db) await db.collection('server_secrets').doc('clickup_webhooks').set({ registrations });
    await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    await fs.promises.writeFile(temporary, JSON.stringify(registrations), { mode: 0o600 });
    await fs.promises.rename(temporary, this.file);
  }
}

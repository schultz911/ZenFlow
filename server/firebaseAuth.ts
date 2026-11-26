import fs from 'node:fs';
import path from 'node:path';
import { getApps as getAdminApps, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import type { Identity } from './security';

const IDENTITY_APP_NAME = 'zenflow-identity';

export function resolveFirebaseProjectId(cwd: string = process.cwd()): string {
  const envProjectId = (process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || '').trim();
  if (envProjectId) return envProjectId;
  try {
    const cfgPath = path.join(cwd, 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      if (typeof parsed?.projectId === 'string' && parsed.projectId.trim()) {
        return parsed.projectId.trim();
      }
    }
  } catch {
    // Fall back to default project ID when config file is absent or unreadable.
  }
  return 'zen-flow-7173d';
}

export async function verifyFirebaseIdToken(idToken: string): Promise<Identity> {
  // Identity trust is independent of configurable Firestore credentials.
  const identityApp =
    getAdminApps().find(app => app.name === IDENTITY_APP_NAME) ||
    initializeAdminApp({ projectId: resolveFirebaseProjectId() }, IDENTITY_APP_NAME);
  const decoded = await getAdminAuth(identityApp).verifyIdToken(idToken);
  return {
    email: decoded.email,
    email_verified: decoded.email_verified,
    exp: decoded.exp,
    firebase: { sign_in_provider: decoded.firebase?.sign_in_provider },
  };
}

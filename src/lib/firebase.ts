import type { FirebaseApp } from 'firebase/app';
import type { Firestore } from 'firebase/firestore';
import appletConfig from '../../firebase-applet-config.json';

// Default config loaded from firebase-applet-config.json or Vite environment variables
const localConfig: Record<string, any> = appletConfig || {};

export const firebaseConfig = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY as string) || localConfig.apiKey || '',
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string) || localConfig.authDomain || '',
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID as string) || localConfig.projectId || '',
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string) || localConfig.storageBucket || '',
  messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string) || localConfig.messagingSenderId || '',
  appId: (import.meta.env.VITE_FIREBASE_APP_ID as string) || localConfig.appId || '',
  firestoreDatabaseId: (import.meta.env.VITE_FIREBASE_DATABASE_ID as string) || localConfig.firestoreDatabaseId || undefined,
};

let appInstance: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;
let authInstance: any = null;

export async function getClientDb(): Promise<Firestore | null> {
  if (dbInstance) return dbInstance;
  if (firebaseConfig.apiKey && firebaseConfig.projectId) {
    try {
      const { initializeApp, getApps, getApp } = await import('firebase/app');
      const { getFirestore } = await import('firebase/firestore');
      appInstance = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
      dbInstance = firebaseConfig.firestoreDatabaseId
        ? getFirestore(appInstance, firebaseConfig.firestoreDatabaseId)
        : getFirestore(appInstance);
      return dbInstance;
    } catch (err) {
      console.warn('Firebase client initialization warning:', err);
    }
  }
  return null;
}

export async function getFirebaseAuth(): Promise<any> {
  if (authInstance) return authInstance;
  if (firebaseConfig.apiKey && firebaseConfig.projectId) {
    try {
      const { initializeApp, getApps, getApp } = await import('firebase/app');
      const { getAuth } = await import('firebase/auth');
      appInstance = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
      authInstance = getAuth(appInstance);
      return authInstance;
    } catch (err) {
      console.warn('Firebase Auth initialization warning:', err);
    }
  }
  return null;
}

export async function signInWithGoogle(): Promise<{ email: string; name: string; photoURL?: string }> {
  const auth = await getFirebaseAuth();
  if (!auth) {
    throw new Error('Firebase Auth is not initialized');
  }
  const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  return {
    email: result.user.email || '',
    name: result.user.displayName || result.user.email?.split('@')[0] || 'Member',
    photoURL: result.user.photoURL || undefined,
  };
}

export async function signOutFirebase(): Promise<void> {
  try {
    const auth = await getFirebaseAuth();
    if (auth) {
      const { signOut } = await import('firebase/auth');
      await signOut(auth);
    }
  } catch (err) {
    console.warn('Firebase signOut warning:', err);
  }
}

let inFlightStatusPromise: Promise<boolean> | null = null;

/**
 * Validates connection to Firestore at app initialization (mandated by firebase-skill).
 * Uses server-side API verification first, falling back to on-demand dynamic client SDK only if needed.
 * Deduplicates in-flight status requests to prevent redundant network egress on boot.
 */
export async function testConnection(): Promise<boolean> {
  if (inFlightStatusPromise) return inFlightStatusPromise;

  inFlightStatusPromise = (async () => {
    try {
      const res = await fetch('/api/firestore/status');
      if (res.ok) {
        const status = await res.json();
        return !!status.connected;
      }
    } catch {
      // ignore
    }

    try {
      const clientDb = await getClientDb();
      if (!clientDb) return false;
      const { doc, getDocFromServer } = await import('firebase/firestore');
      await getDocFromServer(doc(clientDb, 'test', 'connection'));
      return true;
    } catch {
      // Fail silently without dumping unhandled errors to console
      return false;
    } finally {
      setTimeout(() => {
        inFlightStatusPromise = null;
      }, 5000);
    }
  })();

  return inFlightStatusPromise;
}

import { apiFetch } from './api';
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
    throw new Error('Firebase Auth is not initialized. Please verify your internet connection.');
  }

  // Auto-redirect if user is on 127.0.0.1 instead of localhost (Firebase only authorizes localhost by default)
  if (typeof window !== 'undefined' && window.location.hostname === '127.0.0.1') {
    const localhostUrl = window.location.href.replace('127.0.0.1', 'localhost');
    console.warn(`[Firebase Auth] Domain 127.0.0.1 is not in Firebase authorized domains. Redirecting to ${localhostUrl}`);
    window.location.href = localhostUrl;
    throw new Error('Redirecting to http://localhost:3000 for Google OAuth authorization...');
  }

  try {
    const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, provider);
    return {
      email: result.user.email || '',
      name: result.user.displayName || result.user.email?.split('@')[0] || 'Member',
      photoURL: result.user.photoURL || undefined,
    };
  } catch (err: any) {
    console.error('[Firebase Auth Error]:', err);
    const code = err?.code || '';
    const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'current domain';

    if (code === 'auth/unauthorized-domain') {
      throw new Error(
        `Firebase Authorization Error: Domain "${currentHost}" is not in the authorized domains list for project "zen-flow-7173d". Please ensure you are opening http://localhost:3000, or add "${currentHost}" to Firebase Console -> Authentication -> Settings -> Authorized domains.`
      );
    }
    if (code === 'auth/operation-not-allowed') {
      throw new Error(
        'Google Sign-In is not enabled for project "zen-flow-7173d". Please enable Google in Firebase Console -> Authentication -> Sign-in method.'
      );
    }
    if (code === 'auth/configuration-not-found') {
      throw new Error(
        'Firebase Authentication is not configured for project "zen-flow-7173d". Please check the Firebase console setup.'
      );
    }
    if (code === 'auth/popup-blocked') {
      throw new Error('Sign-in popup was blocked by your browser. Please allow popups for localhost:3000 and try again.');
    }
    if (code === 'auth/popup-closed-by-user') {
      throw new Error('Sign-in cancelled: The popup window was closed before completing Google login.');
    }
    if (code === 'auth/cancelled-popup-request') {
      throw new Error('Sign-in cancelled: Multiple popup requests were initiated simultaneously.');
    }
    throw new Error(err?.message || `Google authentication failed (${code || 'unknown error'}). Please try again.`);
  }
}

export async function onFirebaseAuthStateChanged(callback: (user: any) => void): Promise<() => void> {
  const auth = await getFirebaseAuth();
  if (!auth) {
    callback(null);
    return () => {};
  }
  const { onIdTokenChanged } = await import('firebase/auth');
  return onIdTokenChanged(auth, callback);
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
      const res = await apiFetch('/api/firestore/status');
      if (!res.ok) return false;
      return Boolean((await res.json()).connected);
    } catch { return false; }
    finally { setTimeout(() => { inFlightStatusPromise = null; }, 5000); }
  })();
  return inFlightStatusPromise;
}

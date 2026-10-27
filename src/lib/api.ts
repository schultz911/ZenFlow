import { getFirebaseAuth } from './firebase';

let sessionToken = '';
let sessionMemberId = '';
let sessionRequest: Promise<void> | null = null;
let generation = 0;
export const getApiMemberId = () => sessionMemberId;

// Migrate old shared storage once, retaining offline work under its original owner.
try {
  const cached = JSON.parse(localStorage.getItem('team_dash_current_user_v1') || 'null');
  const legacyQueue = localStorage.getItem('zenflow_mutation_queue_v1');
  if (legacyQueue && cached?.id) {
    const queue = JSON.parse(legacyQueue);
    if (Array.isArray(queue)) localStorage.setItem(`zenflow_mutation_queue_v1:${cached.id}`, JSON.stringify(queue));
  }
  localStorage.removeItem('zenflow_mutation_queue_v1');
} catch { /* Browser storage may be unavailable. */ }

export async function ensureApiSession(): Promise<void> {
  const auth = await getFirebaseAuth();
  const user = auth?.currentUser;
  if (!user) throw new Error('Google authentication required');
  const token = await user.getIdToken();
  if (token === sessionToken && sessionMemberId) return;
  if (sessionRequest) {
    await sessionRequest;
    return ensureApiSession();
  }
  const started = generation;
  sessionRequest = (async () => {
    const response = await window.fetch('/api/auth/session', {
      method: 'POST', credentials: 'same-origin',
      headers: { Authorization: `Bearer ${token}`, 'x-zenflow-request': '1' },
    });
    if (!response.ok) throw new Error((await response.json()).error || 'Google session rejected');
    const data = await response.json();
    if (generation !== started || auth.currentUser?.uid !== user.uid) throw new Error('Google session changed');
    sessionToken = token;
    sessionMemberId = data.user.id;
  })();
  try { await sessionRequest; } finally { sessionRequest = null; }
}

export async function clearApiSession(): Promise<void> {
  generation++;
  sessionToken = '';
  sessionMemberId = '';
  // Finish an exchange already in flight before deleting its cookie.
  await sessionRequest?.catch(() => {});
  await window.fetch('/api/auth/session', { method: 'DELETE', credentials: 'same-origin', headers: { 'x-zenflow-request': '1' } });
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  await ensureApiSession();
  const headers = new Headers(init.headers);
  headers.set('x-zenflow-request', '1');
  headers.delete('x-is-superadmin');
  headers.delete('x-caller-email');
  headers.delete('x-caller-user-id');
  return window.fetch(input, { ...init, headers, credentials: 'same-origin' });
}

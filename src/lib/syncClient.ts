import { apiFetch as fetch, ensureApiSession, getApiMemberId } from './api';
import type { QueuedMutation, RealtimeEvent } from '../types';

const OFFLINE_QUEUE_KEY = 'zenflow_mutation_queue_v1';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_QUEUE_SIZE = 100;

export function loadMutationQueue(): QueuedMutation[] {
  try {
    const memberId = getApiMemberId();
    if (!memberId) return [];
    const raw = localStorage.getItem(`${OFFLINE_QUEUE_KEY}:${memberId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return [];
}

export function saveMutationQueue(queue: QueuedMutation[]): void {
  try {
    const memberId = getApiMemberId();
    if (!memberId) return;
    if (queue.length > 0) {
      localStorage.setItem(`${OFFLINE_QUEUE_KEY}:${memberId}`, JSON.stringify(queue));
    } else {
      localStorage.removeItem(`${OFFLINE_QUEUE_KEY}:${memberId}`);
    }
  } catch {
    // ignore storage errors
  }
}

export function enqueueMutation(mutation: Omit<QueuedMutation, 'id' | 'timestamp' | 'retryCount'>): void {
  const now = Date.now();
  const queue = loadMutationQueue().filter(m => now - m.timestamp < SEVEN_DAYS_MS);
  queue.push({
    ...mutation,
    id: `mut-${now}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: now,
    retryCount: 0,
  });
  saveMutationQueue(queue.length > MAX_QUEUE_SIZE ? queue.slice(-MAX_QUEUE_SIZE) : queue);
}

export async function replayMutationQueue(): Promise<{ completed: boolean; hadItems: boolean }> {
  const replayOwner = getApiMemberId();
  if (!replayOwner) return { completed: false, hadItems: false };

  const queue = loadMutationQueue();
  if (queue.length === 0) return { completed: true, hadItems: false };

  const remainingQueue: QueuedMutation[] = [];

  for (let i = 0; i < queue.length; i++) {
    if (getApiMemberId() !== replayOwner) break;
    const item = queue[i];

    if ((item.retryCount ?? 0) >= 5) {
      console.warn('[Offline Queue] Dropping permanently failed mutation after 5 retries:', item.type, item.endpoint);
      continue;
    }

    try {
      const res = await fetch(item.endpoint, {
        method: item.method,
        headers: { 'Content-Type': 'application/json' },
        body: item.payload ? JSON.stringify(item.payload) : undefined,
      });
      if (res.status === 401 || res.status === 403) {
        remainingQueue.push(...queue.slice(i));
        break;
      }
      if (!res.ok && res.status >= 400 && res.status < 500) {
        console.warn(`[Offline Queue] Discarding client error (${res.status}) for:`, item);
      } else if (!res.ok) {
        item.retryCount = (item.retryCount || 0) + 1;
        remainingQueue.push(item, ...queue.slice(i + 1));
        break;
      }
    } catch {
      item.retryCount = (item.retryCount || 0) + 1;
      remainingQueue.push(item, ...queue.slice(i + 1));
      break;
    }
  }

  if (getApiMemberId() === replayOwner) {
    const replayIds = new Set(queue.map(item => item.id));
    const appended = loadMutationQueue().filter(item => !replayIds.has(item.id));
    saveMutationQueue([...remainingQueue, ...appended]);
  }

  return {
    completed: remainingQueue.length === 0 && getApiMemberId() === replayOwner,
    hadItems: true,
  };
}

export interface RealtimeConnectionHandlers {
  onStatusChange: (status: 'connected' | 'connecting' | 'offline') => void;
  onSnapshot: (rawSnapshot: any) => void;
  onEvent: (event: RealtimeEvent) => void;
}

export function subscribeRealtimeEvents(handlers: RealtimeConnectionHandlers): () => void {
  let eventSource: EventSource | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let isMounted = true;

  async function connectSSE() {
    if (!isMounted) return;
    try {
      await ensureApiSession();
      if (!isMounted) return;
      eventSource = new EventSource('/api/events');

      eventSource.onopen = () => {
        if (isMounted) handlers.onStatusChange('connected');
      };

      eventSource.addEventListener('init', () => {
        if (isMounted) handlers.onStatusChange('connected');
      });

      eventSource.addEventListener('snapshot', (e: MessageEvent) => {
        if (!isMounted) return;
        try {
          handlers.onSnapshot(JSON.parse(e.data));
        } catch {
          handlers.onStatusChange('offline');
        }
      });

      eventSource.addEventListener('update', (e: MessageEvent) => {
        if (!isMounted) return;
        try {
          const event: RealtimeEvent = JSON.parse(e.data);
          handlers.onEvent(event);
        } catch (err) {
          console.error('Error handling SSE update:', err);
        }
      });

      eventSource.onerror = () => {
        if (!isMounted) return;
        handlers.onStatusChange('connecting');
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        reconnectTimeout = setTimeout(connectSSE, 3000);
      };
    } catch {
      if (!isMounted) return;
      handlers.onStatusChange('offline');
      reconnectTimeout = setTimeout(connectSSE, 5000);
    }
  }

  connectSSE();

  return () => {
    isMounted = false;
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
  };
}

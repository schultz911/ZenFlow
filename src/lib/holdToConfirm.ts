export type HoldState = {
  phase: 'idle' | 'holding' | 'submitting' | 'success' | 'error';
  progress: number;
  remaining: number;
  feedback: string;
};

interface HoldClock {
  now: () => number;
  request: (callback: FrameRequestCallback) => number;
  cancel: (id: number) => void;
}

// One clock drives both the countdown and fill; only a completed hold can submit.
export function createHoldToConfirm(confirm: () => Promise<void>, duration = 5000, clock: HoldClock = {
  now: () => performance.now(),
  request: callback => requestAnimationFrame(callback),
  cancel: id => cancelAnimationFrame(id),
}) {
  let state: HoldState = { phase: 'idle', progress: 0, remaining: Math.ceil(duration / 1000), feedback: '' };
  let startedAt: number | null = null;
  let frame: number | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: HoldState) => {
    state = next;
    listeners.forEach(listener => listener());
  };
  const stopFrame = () => {
    if (frame !== null) clock.cancel(frame);
    frame = null;
  };
  const submit = async () => {
    stopFrame();
    startedAt = null;
    publish({ phase: 'submitting', progress: 1, remaining: 0, feedback: 'Purging database. Please wait.' });
    try {
      await confirm();
      publish({ phase: 'success', progress: 1, remaining: 0, feedback: 'Database purged successfully.' });
    } catch {
      publish({ phase: 'error', progress: 0, remaining: Math.ceil(duration / 1000), feedback: 'Purge failed. Hold again to retry.' });
    }
  };
  const tick = () => {
    if (startedAt === null || state.phase !== 'holding') return;
    const elapsed = Math.max(0, clock.now() - startedAt);
    if (elapsed >= duration) {
      void submit();
      return;
    }
    publish({ phase: 'holding', progress: elapsed / duration, remaining: Math.ceil((duration - elapsed) / 1000), feedback: '' });
    frame = clock.request(tick);
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    start: () => {
      if (state.phase === 'holding' || state.phase === 'submitting' || state.phase === 'success') return false;
      startedAt = clock.now();
      publish({ phase: 'holding', progress: 0, remaining: Math.ceil(duration / 1000), feedback: '' });
      frame = clock.request(tick);
      return true;
    },
    cancel: (feedback = 'Hold canceled. Press and hold again for the full five seconds.') => {
      if (state.phase !== 'holding') return;
      stopFrame();
      startedAt = null;
      publish({ phase: 'idle', progress: 0, remaining: Math.ceil(duration / 1000), feedback });
    },
  };
}

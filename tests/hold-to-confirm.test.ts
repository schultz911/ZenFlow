import assert from 'node:assert/strict';
import test from 'node:test';
import { createHoldToConfirm } from '../src/lib/holdToConfirm';

function fixture(confirm: () => Promise<void> = async () => {}) {
  let now = 0;
  let id = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  const hold = createHoldToConfirm(confirm, 5000, {
    now: () => now,
    request: callback => { callbacks.set(++id, callback); return id; },
    cancel: frame => { callbacks.delete(frame); },
  });
  return {
    hold,
    advance: (time: number) => {
      now = time;
      const pending = [...callbacks.values()];
      callbacks.clear();
      pending.forEach(callback => callback(now));
    },
    pendingFrames: () => callbacks.size,
  };
}

test('hold countdown starts at five and shares progress timing; 4999ms cannot submit', async () => {
  let submissions = 0;
  const f = fixture(async () => { submissions++; });
  assert.equal(f.hold.getSnapshot().remaining, 5);
  f.hold.start();
  f.advance(1000);
  assert.equal(f.hold.getSnapshot().remaining, 4);
  assert.equal(f.hold.getSnapshot().progress, .2);
  f.advance(4999);
  assert.equal(submissions, 0);
  assert.equal(f.hold.getSnapshot().remaining, 1);
  f.advance(5000);
  assert.equal(submissions, 1);
  await Promise.resolve();
  assert.equal(f.hold.getSnapshot().phase, 'success');
});

test('every cancellation discards elapsed time and restarts a full five seconds', () => {
  let submissions = 0;
  const f = fixture(async () => { submissions++; });
  let now = 0;
  for (const reason of ['Released early', 'Pointer outside', 'Pointer canceled', 'Focus lost', 'Page hidden', 'Unmounted', 'Disabled']) {
    f.hold.start();
    now += 4000;
    f.advance(now);
    assert.equal(f.hold.getSnapshot().progress, .8);
    f.hold.cancel(reason);
    assert.deepEqual(f.hold.getSnapshot(), { phase: 'idle', progress: 0, remaining: 5, feedback: reason });
    assert.equal(f.pendingFrames(), 0);
  }
  f.hold.start();
  f.advance(now + 4999);
  assert.equal(submissions, 0);
  f.advance(now + 5000);
  assert.equal(submissions, 1);
});

test('repeat starts, release after completion, and pending/successful submissions cannot duplicate purge', async () => {
  let submissions = 0;
  let resolve!: () => void;
  const f = fixture(() => { submissions++; return new Promise<void>(done => { resolve = done; }); });
  assert.equal(f.hold.start(), true);
  assert.equal(f.hold.start(), false);
  f.advance(5000);
  assert.equal(f.hold.getSnapshot().phase, 'submitting');
  f.hold.cancel();
  assert.equal(f.hold.start(), false);
  f.advance(20000);
  assert.equal(submissions, 1);
  resolve();
  await Promise.resolve();
  assert.equal(f.hold.getSnapshot().phase, 'success');
  assert.equal(f.hold.start(), false);
});

test('a failed submission resets progress and permits a new full hold', async () => {
  let submissions = 0;
  const f = fixture(async () => { if (++submissions === 1) throw new Error('offline'); });
  f.hold.start();
  f.advance(5000);
  await Promise.resolve();
  assert.equal(f.hold.getSnapshot().phase, 'error');
  assert.equal(f.hold.getSnapshot().progress, 0);
  assert.equal(f.hold.getSnapshot().remaining, 5);
  assert.equal(f.hold.start(), true);
  f.advance(9999);
  assert.equal(submissions, 1);
  f.advance(10000);
  await Promise.resolve();
  assert.equal(submissions, 2);
  assert.equal(f.hold.getSnapshot().phase, 'success');
});

test('unsubscribed listeners receive no further frame or completion updates', async () => {
  const f = fixture();
  let updates = 0;
  const unsubscribe = f.hold.subscribe(() => { updates++; });
  f.hold.start();
  assert.equal(updates, 1);
  unsubscribe();
  f.advance(5000);
  await Promise.resolve();
  assert.equal(updates, 1);
});

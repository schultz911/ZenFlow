import { createRoot } from 'react-dom/client';
import { AnimatePresence, motion } from 'motion/react';
import { HoldToPurgeButton } from '../../src/components/HoldToPurgeButton';
import '../../src/index.css';

// Real DOM + React event wiring checks. Timings are shortened here; the Node
// suite separately verifies the exact 5000ms boundary with an injected clock.
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const fixture = document.getElementById('fixture')!;
const root = createRoot(fixture);
let submissions = 0;
let fail = false;
const confirm = async () => { submissions++; if (fail) throw new Error('simulated failure'); };
const render = async (disabled = false, duration = 220) => {
  root.render(<HoldToPurgeButton key={submissions + ':' + fail} onPurgeConfirm={confirm} holdDurationMs={duration} disabled={disabled} />);
  await wait(40);
  const button = fixture.querySelector('button')!;
  // Synthetic events do not create OS pointer capture. Stub capture on this
  // fixture only; native capture is exercised in the interactive preview.
  button.setPointerCapture = () => {};
  button.hasPointerCapture = () => false;
  return button;
};
const pointer = (button: HTMLElement, type: string, extra: PointerEventInit = {}) => {
  const rect = button.getBoundingClientRect();
  button.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, isPrimary: true, button: 0, clientX: rect.x + 20, clientY: rect.y + 20, ...extra }));
};
const key = (button: HTMLElement, type: string, value: string, repeat = false) => button.dispatchEvent(new KeyboardEvent(type, { bubbles: true, key: value, repeat }));
const reset = () => {
  assert(fixture.querySelector('.hold-confirm-fill')?.getAttribute('style')?.includes('scaleX(0)'), 'progress did not reset');
  assert(submissions === 0, 'canceled hold submitted');
};

const checks: Array<[string, () => Promise<void>]> = [
  ['Default button starts at 5 and a click cannot confirm', async () => {
    const button = await render(false, 5000);
    assert(button.textContent?.endsWith('5'), 'initial countdown is not 5');
    pointer(button, 'pointerdown'); pointer(button, 'pointerup'); await wait(20); reset();
  }],
  ['Moving outside pointer capture cancels and reentry cannot resume', async () => {
    const button = await render(); pointer(button, 'pointerdown'); await wait(80);
    assert(!fixture.querySelector('.hold-confirm-fill')?.getAttribute('style')?.includes('scaleX(0);'), 'progress never started');
    pointer(button, 'pointermove', { clientX: -20 }); pointer(button, 'pointermove'); await wait(250); reset();
  }],
  ['Touch cancel, lost capture, and focus loss reset the hold', async () => {
    for (const reason of ['pointercancel', 'lostpointercapture', 'blur']) {
      const button = await render(); pointer(button, 'pointerdown', { pointerType: 'touch' }); await wait(50);
      if (reason === 'blur') window.dispatchEvent(new Event('blur'));
      else pointer(button, reason, { pointerType: 'touch' });
      await wait(20); reset();
    }
  }],
  ['Space and Enter early releases cancel; unrelated key releases do not', async () => {
    for (const value of [' ', 'Enter']) {
      const button = await render(); key(button, 'keydown', value); await wait(60);
      key(button, 'keyup', value === ' ' ? 'Enter' : ' '); await wait(10);
      assert(button.textContent?.includes('Keep holding'), 'unrelated key canceled the hold');
      key(button, 'keyup', value); await wait(20); reset();
    }
  }],
  ['Disabling a held control prevents completion', async () => {
    const button = await render(); pointer(button, 'pointerdown'); await wait(60);
    await render(true); await wait(250); reset();
  }],
  ['Closing during an exit animation cancels before the completion frame', async () => {
    const renderPresence = (open: boolean) => root.render(<AnimatePresence>{open && <motion.div key="exit" exit={{ opacity: 0 }} transition={{ duration: .4 }}><HoldToPurgeButton onPurgeConfirm={confirm} holdDurationMs={220} /></motion.div>}</AnimatePresence>);
    renderPresence(true); await wait(40);
    const button = fixture.querySelector('button')!; button.setPointerCapture = () => {};
    pointer(button, 'pointerdown'); await wait(80); renderPresence(false); await wait(300);
    assert(submissions === 0, 'an exiting modal submitted'); await wait(200);
  }],
  ['Full keyboard hold submits once and blocks repeated keys and pointer input', async () => {
    const button = await render(); key(button, 'keydown', 'Enter'); await wait(90); key(button, 'keydown', 'Enter', true);
    await wait(190); assert(submissions === 1, 'full hold did not submit once');
    key(button, 'keyup', 'Enter'); pointer(button, 'pointerdown'); await wait(250);
    assert(submissions === 1, 'duplicate submission');
    assert(button.textContent === 'Database purged', 'success state missing');
  }],
  ['Errors restore the countdown and require a new complete hold to retry', async () => {
    submissions = 0; fail = true;
    const button = await render(); pointer(button, 'pointerdown'); await wait(280); pointer(button, 'pointerup');
    assert(submissions === 1 && button.textContent?.includes('Hold to purge'), 'error did not allow retry');
    assert(document.activeElement === button, 'error did not restore focus to retry');
    fail = false; pointer(button, 'pointerdown'); await wait(280); pointer(button, 'pointerup');
    assert(submissions === 2 && button.textContent === 'Database purged', 'retry did not succeed');
  }],
];

document.getElementById('run')!.onclick = async event => {
  (event.currentTarget as HTMLButtonElement).disabled = true;
  const results = document.getElementById('results')!;
  results.textContent = '';
  let passed = 0;
  for (const [name, check] of checks) {
    const item = document.createElement('li');
    try { await check(); item.textContent = `PASS: ${name}`; passed++; }
    catch (error) { item.textContent = `FAIL: ${name}: ${String(error)}`; }
    results.append(item);
    root.render(null); await wait(30); submissions = 0; fail = false;
  }
  const summary = document.createElement('p');
  summary.id = 'summary'; summary.textContent = `${passed}/${checks.length} browser interaction checks passed`;
  results.after(summary);
};

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PREVIEW_URL = 'http://127.0.0.1:4175/tests/ui-preview/index.html';
const CHECKS_URL = 'http://127.0.0.1:4175/tests/ui-preview/checks.html';

async function startPreviewServer() {
  const proc = spawn('node', ['--import', 'tsx', 'tests/ui-preview.ts'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  proc.stdout.on('data', chunk => { logs += chunk.toString(); });
  proc.stderr.on('data', chunk => { logs += chunk.toString(); });

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      throw new Error(`UI preview server exited early (${proc.exitCode}): ${logs}`);
    }
    try {
      const res = await fetch(PREVIEW_URL);
      if (res.ok) return { proc, stop: async () => { proc.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); } };
    } catch {
      // waiting for server bind
    }
    await new Promise(r => setTimeout(r, 150));
  }
  proc.kill('SIGTERM');
  throw new Error(`Timed out waiting for UI preview server: ${logs}`);
}

const server = await startPreviewServer();
const browser = await chromium.launch({ headless: true });

try {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  const attachErrorListeners = (page: import('playwright').Page, label: string) => {
    page.on('pageerror', err => pageErrors.push(`[${label}] pageerror: ${err.message}`));
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(`[${label}] console.error: ${msg.text()}`);
    });
  };

  // 1. Real DOM/React checks on checks.html
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    attachErrorListeners(page, 'checks.html');
    await page.goto(CHECKS_URL, { waitUntil: 'networkidle' });
    await page.click('#run');
    await page.waitForSelector('#summary', { timeout: 15000 });
    const summary = await page.textContent('#summary');
    const items = await page.$$eval('#results li', els => els.map(e => e.textContent || ''));
    assert.equal(summary?.trim(), '8/8 browser interaction checks passed', `Unexpected summary: ${summary}\n${items.join('\n')}`);
    assert.equal(items.length, 8);
    for (const item of items) {
      assert.match(item, /^PASS:/, `Check failed: ${item}`);
    }
    console.log(`Browser checks.html: ${summary}`);
    await context.close();
  }

  // 2. OnboardingChecklist.tsx live DOM/React transitions, <select> styling, Space sync, and close/dismiss
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    attachErrorListeners(page, 'onboarding');
    await page.goto(`${PREVIEW_URL}?onboarding=fresh`, { waitUntil: 'networkidle' });

    const checklist = page.locator('#workspace-onboarding-checklist');
    await checklist.waitFor({ state: 'visible' });
    assert.match((await checklist.textContent()) || '', /0\/3 complete/);
    assert.match((await checklist.textContent()) || '', /Skip for now/);

    // Invalid API key error handling
    const apiKeyInput = checklist.locator('input[aria-label="Personal ClickUp API key"]');
    await apiKeyInput.fill('invalid');
    await checklist.getByRole('button', { name: 'Connect' }).click();
    await checklist.getByText('Invalid ClickUp API Key').waitFor({ state: 'visible' });
    assert.match((await checklist.textContent()) || '', /0\/3 complete/);

    // Step 1 -> Step 2 transition
    await apiKeyInput.fill('pk_live_e2e_123');
    await checklist.getByRole('button', { name: 'Connect' }).click();
    await checklist.getByText('1/3 complete').waitFor({ state: 'visible' });
    await checklist.getByText('Connected and verified against ClickUp.').waitFor({ state: 'visible' });
    await checklist.getByText('Matched ClickUp profile: Kiran S').waitFor({ state: 'visible' });

    // <select> styling and Space selection persistence
    const spaceSelect = checklist.locator('select[aria-label="Default ClickUp Space"]');
    await spaceSelect.waitFor({ state: 'visible' });
    const lightStyles = await spaceSelect.evaluate(el => {
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        height: rect.height,
        borderTopWidth: cs.borderTopWidth,
        borderRadius: cs.borderRadius,
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        fontSize: cs.fontSize,
        optionCount: (el as HTMLSelectElement).options.length,
      };
    });
    assert.equal(lightStyles.optionCount, 2);
    assert.ok(lightStyles.height >= 32, `Expected select height >= 32, got ${lightStyles.height}`);
    assert.notEqual(lightStyles.borderTopWidth, '0px');
    assert.notEqual(lightStyles.color, lightStyles.backgroundColor);

    await spaceSelect.selectOption('sp-2');
    await page.waitForTimeout(150);
    assert.equal(await spaceSelect.inputValue(), 'sp-2', 'Selected space should persist and not snap back to sp-1');

    // Verify dark mode <select> contrast/theme update
    await page.click('#theme-toggle');
    await page.waitForTimeout(100);
    const darkStyles = await spaceSelect.evaluate(el => {
      const cs = getComputedStyle(el);
      return {
        isDark: document.documentElement.classList.contains('dark'),
        color: cs.color,
        backgroundColor: cs.backgroundColor,
      };
    });
    assert.equal(darkStyles.isDark, true);
    assert.notEqual(darkStyles.color, lightStyles.color);
    assert.notEqual(darkStyles.backgroundColor, lightStyles.backgroundColor);

    // Step 2 -> Step 3 auto-webhook transition
    await checklist.getByRole('button', { name: 'Sync Tasks' }).click();
    await checklist.waitFor({ state: 'detached' });
    await page.click('#user-profile-menu-button');
    await page.getByRole('menuitem', { name: 'Workspace Setup' }).click();
    await checklist.waitFor({ state: 'visible' });
    await checklist.getByText('3/3 complete').waitFor({ state: 'visible' });
    await checklist.getByText('Sent 2 task(s) to ClickUp.').waitFor({ state: 'visible' });
    await checklist.getByText('Real-time updates active for workspace changes.').waitFor({ state: 'visible' });
    await checklist.getByRole('button', { name: 'Sync Again' }).waitFor({ state: 'visible' });
    await checklist.getByRole('button', { name: 'Close' }).waitFor({ state: 'visible' });

    // Close / Dismiss persistence and reopen via menu (forceOpen)
    await checklist.getByRole('button', { name: 'Close' }).click();
    await checklist.waitFor({ state: 'detached' });

    const storage = await page.evaluate(() => ({
      dismissed: localStorage.getItem('zenflow_onboarding_dismissed_v1_cd-1'),
      synced: localStorage.getItem('zenflow_onboarding_synced_v1_cd-1'),
    }));
    assert.equal(storage.dismissed, 'true');
    assert.equal(storage.synced, 'true');

    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await checklist.count(), 0, 'Dismissed checklist should remain closed across reload');

    await page.click('#user-profile-menu-button');
    await page.getByRole('menuitem', { name: 'Workspace Setup' }).click();
    await checklist.waitFor({ state: 'visible' });
    // The fresh preview fixture resets its mocked connection on reload.
    await checklist.getByText('0/3 complete').waitFor({ state: 'visible' });
    await checklist.getByRole('button', { name: 'Skip for now' }).click();
    await checklist.waitFor({ state: 'detached' });

    console.log('Browser OnboardingChecklist: Step 1->2->3 transitions, <select> styling, Space sync, and dismiss/reopen passed.');
    await context.close();
  }

  // 3. Main UI preview + mobile iframe sanity check
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    attachErrorListeners(page, 'ui-preview');
    await page.goto(PREVIEW_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('#zenflow-logo');
    await page.click('#tab-content');
    await page.click('#tab-design');
    await page.click('#tab-all');
    await page.click('#connection-status-button');
    await page.waitForSelector('text=Database & Compliance');
    await page.keyboard.press('Escape');

    const overview = page.getByRole('region', { name: 'Team overview' });
    await overview.getByText('(10h / 6h)', { exact: true }).waitFor();
    const ava = page.locator('#swimlane-u-content');
    await ava.getByText('(5h / 3h)', { exact: true }).waitFor();
    await page.locator('#task-search-input').fill('Homepage Narrative Rewrite');
    await ava.getByText('Completed Editorial Brief').waitFor({ state: 'hidden' });
    await ava.getByText('167%', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Clear workspace search' }).click();

    await page.getByRole('button', { name: 'View Analytics' }).click();
    const analytics = page.getByRole('dialog', { name: 'Workspace analytics' });
    const efficiency = analytics.getByRole('meter', { name: 'Workspace efficiency' });
    assert.match(await efficiency.getAttribute('aria-valuetext') ?? '', /^167 percent/);
    await analytics.getByLabel('Analytics scope').selectOption('user');
    await analytics.getByLabel('Analytics member').selectOption('u-content');
    await analytics.getByText('(5h / 3h)', { exact: true }).waitFor();
    await analytics.getByLabel('Analytics scope').selectOption('all');
    await page.getByRole('button', { name: 'Calendar Tool' }).click();
    await page.getByLabel('Analytics start date').fill('2026-01-08');
    await page.getByText('No historical snapshot was saved for this period.').waitFor({ state: 'visible' });
    assert.equal(await page.getByText('Total Employees', { exact: true }).count(), 0);
    await page.getByLabel('Analytics start date').fill('2026-01-09');
    await page.getByText('Locked snapshot · 2026-01-09').waitFor({ state: 'visible' });
    await page.getByText('Cumulative metrics as of 2026-01-09.').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');

    const freePoolToggle = page.locator('#free-pool-trigger');
    const freePool = page.getByRole('complementary', { name: 'Free Pool' });
    await freePoolToggle.focus();
    await page.keyboard.press('Enter');
    await freePool.waitFor();
    assert.equal(await freePoolToggle.getAttribute('aria-expanded'), 'true');
    assert.equal(await freePoolToggle.evaluate(el => document.activeElement === el), true);
    assert.equal(await freePoolToggle.evaluate(el => Boolean(el.closest('[aria-label="Team overview"]'))), true);
    await freePool.getByRole('button', { name: 'Content (0)' }).click();
    await freePool.getByText('No Content members available today.').waitFor();
    await freePool.getByRole('button', { name: 'All (1)' }).click();
    await page.locator('#task-search-input').click();
    assert.equal(await freePoolToggle.getAttribute('aria-expanded'), 'true');
    await freePool.getByRole('button', { name: /^All / }).focus();
    await page.keyboard.press('Escape');
    await freePool.waitFor({ state: 'hidden' });
    assert.equal(await freePoolToggle.getAttribute('aria-expanded'), 'false');
    assert.equal(await freePoolToggle.evaluate(el => document.activeElement === el), true);
    await page.keyboard.press('Space');
    await freePool.getByRole('button', { name: 'Add task for Mia Designer' }).click();
    const taskDetails = page.getByRole('dialog', { name: 'Task details' });
    await taskDetails.getByText('design Team', { exact: true }).waitFor();
    assert.equal(await taskDetails.locator('#task-assignee-select').inputValue(), 'u-design');
    await taskDetails.getByRole('button', { name: 'Close modal' }).click();
    await taskDetails.waitFor({ state: 'detached' });

    // Free Pool -> Pipeline brief assignment bridge & wide cue
    await freePoolToggle.click();
    await freePool.waitFor({ state: 'visible' });
    await freePool.getByRole('button', { name: /Assign brief for Mia Designer/i }).click();
    const assignDialog = page.getByRole('dialog', { name: 'Assign task' });
    await assignDialog.waitFor({ state: 'visible' });
    assert.equal(await assignDialog.locator('#taskassignmentmodal-field-1').inputValue(), 'u-design');
    await page.keyboard.press('Escape');
    await assignDialog.waitFor({ state: 'detached' });
    await page.keyboard.press('Escape');

    // OverviewBar polish: Sort overloaded action cue, All Clusters dropdown label, standardized Eff cue
    await overview.getByRole('button', { name: /Sort overloaded first/i }).waitFor();
    await page.getByRole('button', { name: /All Clusters/i }).waitFor();
    await overview.getByText(/under est/i).waitFor();

    // DisciplineTaskModal focus + discard guard
    await page.getByRole('button', { name: /New Brief/i }).first().click();
    const newBriefDialog = page.getByRole('dialog', { name: 'Create pipeline requirement' });
    await newBriefDialog.waitFor({ state: 'visible' });
    assert.equal(await newBriefDialog.locator('#disciplinetaskmodal-field-1').evaluate(el => el === document.activeElement), true, 'New Brief should focus title input, not close button');
    await newBriefDialog.locator('#disciplinetaskmodal-field-1').fill('Draft Unsaved Campaign');
    await page.locator('.dialog-backdrop').first().click({ position: { x: 10, y: 10 } });
    await newBriefDialog.getByRole('alertdialog', { name: /Discard unsaved/i }).waitFor({ state: 'visible' });
    await newBriefDialog.getByRole('button', { name: /Discard/i }).click();
    await newBriefDialog.waitFor({ state: 'detached' });

    // Ongoing card layout + DuplicateTaskModal defaults + clean heading/labels
    await page.locator('#member-actions-btn-cd-1').click();
    await page.locator('#member-actions-menu-cd-1').getByRole('menuitem', { name: 'Add Ongoing Task' }).click();
    await page.getByPlaceholder(/Ongoing task name/i).fill('Ongoing Weekly Newsletter');
    await page.getByRole('button', { name: /^Add Ongoing$/i }).click();
    const ongoingCard = page.locator('#swimlane-cd-1 .task-card', { hasText: 'Ongoing Weekly Newsletter' });
    await ongoingCard.waitFor({ state: 'visible' });
    const ongoingTitleWidth = await ongoingCard.locator('h5 button').evaluate(el => el.getBoundingClientRect().width);
    assert.ok(ongoingTitleWidth > 120, `Ongoing title should not be crushed (got ${ongoingTitleWidth}px)`);
    await ongoingCard.getByRole('button', { name: /Subtask/i }).click();
    const dupDialog = page.getByRole('dialog', { name: 'Duplicate task' });
    await dupDialog.waitFor({ state: 'visible' });
    assert.equal(await dupDialog.locator('h2').count(), 1, 'DuplicateTaskModal should use h2 heading');
    assert.equal(await dupDialog.locator('#duplicatetaskmodal-field-2').inputValue(), 'cd-1', 'Ongoing subtask should default to parent owner');
    assert.ok((await dupDialog.locator('#duplicatetaskmodal-field-5').inputValue()).length > 0, 'Ongoing subtask should prefill tomorrow deadline');
    await page.keyboard.press('Escape');
    await dupDialog.waitFor({ state: 'detached' });

    // TaskCard double-click inline rename
    await page.locator('#task-card-cd-1-t-kiran-2 h5 button').dblclick();
    await page.locator('#task-card-cd-1-t-kiran-2 input[type="text"]').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');

    // Mobile 390x844 viewport checks (touch targets >= 44px & Ongoing not crushed)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(100);
    const mobileOngoingTitleWidth = await ongoingCard.locator('h5 button').evaluate(el => el.getBoundingClientRect().width);
    assert.ok(mobileOngoingTitleWidth > 100, `Mobile ongoing title should not crush (got ${mobileOngoingTitleWidth}px)`);
    const reorderUpHeight = await page.locator('#swimlane-u-content button[aria-label*="Move"]').first().evaluate(el => el.getBoundingClientRect().height);
    assert.ok(reorderUpHeight >= 44, `Mobile reorder button height should be >= 44px (got ${reorderUpHeight}px)`);

    await page.goto(`${PREVIEW_URL}?width=390`, { waitUntil: 'networkidle' });
    const iframe = page.locator('iframe[title="390px responsive preview"]');
    await iframe.waitFor({ state: 'visible' });
    console.log('Browser UI preview: desktop tabs, compliance, scoped efficiency, historical analytics, Free Pool task handoff, and 390px responsive iframe passed.');
    await context.close();
  }

  assert.deepEqual(pageErrors, [], `Uncaught page errors:\n${pageErrors.join('\n')}`);
  assert.deepEqual(consoleErrors, [], `Console errors:\n${consoleErrors.join('\n')}`);
} finally {
  await browser.close();
  await server.stop();
}

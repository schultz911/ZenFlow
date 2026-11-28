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

    // Mobile (<640px) shows slim #mobile-onboarding-banner while keeping full #workspace-onboarding-checklist collapsed until tapped
    await page.evaluate(() => localStorage.removeItem('zenflow_onboarding_dismissed_v1_cd-1'));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await checklist.isVisible(), false, 'OnboardingChecklist must stay hidden below sm: unless opened via Setup');
    await page.locator('#mobile-onboarding-banner').waitFor({ state: 'visible' });

    console.log('Browser OnboardingChecklist: Step 1->2->3 transitions, <select> styling, Space sync, mobile deferral, and dismiss/reopen passed.');
    await context.close();
  }

  // 3. Main UI preview + mobile iframe sanity check
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    attachErrorListeners(page, 'ui-preview');
    await page.clock.setFixedTime(new Date('2026-11-26T10:00:00.000Z'));
    await page.goto(PREVIEW_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('#zenflow-logo');
    await page.click('#tab-content');
    await page.click('#tab-design');
    await page.click('#tab-all');
    await page.click('#connection-status-button');
    await page.waitForSelector('text=Database & Compliance');
    await page.keyboard.press('Escape');
    await page.getByText('Database & Compliance', { exact: true }).waitFor({ state: 'hidden' });

    const overview = page.getByRole('region', { name: 'Team overview' });
    await overview.getByText(/10h est\. \/ 6h billable · 4h under estimate/).waitFor();
    await overview.getByText(/2 of 3 assigned 3h\+ today/).waitFor();
    const efficiencyHelp = overview.getByRole('button', { name: 'About efficiency' });
    await efficiencyHelp.press('Enter');
    await overview.getByRole('button', { name: 'About efficiency', expanded: true }).waitFor();
    const detailId = await efficiencyHelp.getAttribute('aria-controls');
    assert.ok(detailId);
    const efficiencyDetail = page.locator(`[id="${detailId}"]`);
    await efficiencyDetail.waitFor({ state: 'visible' });
    assert.match(await efficiencyDetail.innerText(), /100% means on estimate/);
    await page.keyboard.press('Escape');
    assert.equal(await efficiencyHelp.getAttribute('aria-expanded'), 'false');
    assert.equal(await efficiencyHelp.evaluate(button => document.activeElement === button), true);
    const ava = page.locator('#swimlane-u-content');
    await ava.getByText('(5h / 3h)', { exact: true }).waitFor();
    await page.locator('#task-search-input').fill('Homepage Narrative Rewrite');
    await ava.getByText('Completed Editorial Brief').waitFor({ state: 'hidden' });
    await ava.getByText('167%', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Clear workspace search' }).click();

    await page.getByRole('button', { name: 'View Analytics' }).click();
    const analytics = page.getByRole('dialog', { name: 'Workspace analytics' });
    await analytics.getByText(/Assigned 3h\+ on 2026-11-26/).waitFor();
    await analytics.getByText(/10h est\. \/ 6h billable · 4h under estimate/).waitFor();
    const efficiency = analytics.getByRole('meter', { name: 'Workspace efficiency' });
    assert.match(await efficiency.getAttribute('aria-valuetext') ?? '', /^167 percent/);
    await analytics.getByLabel('Analytics scope').selectOption('user');
    await analytics.getByLabel('Analytics member').selectOption('u-content');
    await analytics.getByText(/5h est\. \/ 3h billable · 2h under estimate/).waitFor();
    await analytics.getByLabel('Analytics scope').selectOption('all');
    assert.ok((await analytics.getByText('Est / Bill', { exact: true }).count()) >= 2, 'AnalyticsModal should label Sections 3 & 4 columns as Est / Bill');
    assert.equal(await analytics.getByText('Billable / Est', { exact: true }).count(), 0, 'AnalyticsModal should not mix Billable / Est wording');
    await page.getByRole('button', { name: 'Date Range' }).click();
    await page.getByLabel('Analytics start date').fill('2026-01-08');
    await page.getByLabel('Analytics end date').fill('2026-01-08');
    await page.getByText('No historical snapshot was saved for this period.').waitFor({ state: 'visible' });
    assert.equal(await page.getByText('Total Employees', { exact: true }).count(), 0);
    await page.getByLabel('Analytics end date').fill('2026-01-09');
    await page.getByLabel('Analytics start date').fill('2026-01-09');
    await page.getByText('Locked snapshot · 2026-01-09').waitFor({ state: 'visible' });
    await page.getByText('Cumulative metrics as of 2026-01-09.').waitFor({ state: 'visible' });
    await analytics.getByRole('button', { name: /^Close$/i }).click();
    await analytics.waitFor({ state: 'detached' });

    const freePoolToggle = page.locator('#free-pool-trigger');
    const freePool = page.getByRole('complementary', { name: 'Free Pool' });
    assert.match(await freePoolToggle.innerText(), /under 3h today/);
    await freePoolToggle.focus();
    await page.keyboard.press('Enter');
    await freePool.waitFor();
    assert.equal(await freePoolToggle.getAttribute('aria-expanded'), 'true');
    assert.equal(await freePoolToggle.evaluate(el => document.activeElement === el), true);
    assert.equal(await freePoolToggle.evaluate(el => Boolean(el.closest('[aria-label="Team overview"]'))), true);
    await freePool.getByRole('button', { name: 'Content (0)' }).click();
    await freePool.getByText('No Content members have under 3h assigned today.').waitFor();
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

    // Free Pool -> Pipeline brief assignment bridge & portaled multi-brief menu (P1-1, P1-4)
    await freePoolToggle.click();
    await freePool.waitFor({ state: 'visible' });
    const assignBriefBtn = freePool.getByRole('button', { name: /Assign brief for Mia Designer/i });
    await assignBriefBtn.click();
    const assignDialog = page.getByRole('dialog', { name: 'Assign task' });
    await assignDialog.waitFor({ state: 'visible' });
    assert.equal(await assignDialog.locator('input[name="assignment-member"]:checked').inputValue(), 'u-design');
    // P2-3 / P2-4: reserved deadline visible upfront, H3 heading (no H4 skip), discard guard
    await assignDialog.getByRole('heading', { level: 3, name: 'Review' }).waitFor();
    assert.equal(await assignDialog.locator('#taskassignmentmodal-deadline').isDisabled(), false);
    await assignDialog.locator('#taskassignmentmodal-field-2').fill('10');
    await page.keyboard.press('Escape');
    await assignDialog.getByRole('alertdialog', { name: /Discard unsaved assignment/i }).waitFor({ state: 'visible' });
    await assignDialog.getByRole('button', { name: /^Discard$/i }).click();
    await assignDialog.waitFor({ state: 'detached' });
    await page.keyboard.press('Escape');

    // Header profile menu & OverviewBar Export menu ARIA + ArrowDown entry (P1-6, P2-5)
    const profileBtn = page.locator('#user-profile-menu-button');
    assert.equal(await profileBtn.getAttribute('aria-haspopup'), 'menu');
    await profileBtn.focus();
    await page.keyboard.press('ArrowDown');
    await page.locator('#user-profile-menu').waitFor({ state: 'visible' });
    assert.equal(
      await page.locator('#user-profile-menu [role="menuitem"]').first().evaluate(el => el === document.activeElement),
      true,
      'ArrowDown on Header profile button should focus first menuitem'
    );
    await page.keyboard.press('Escape');

    const exportBtn = page.locator('#export-workspace-btn');
    await exportBtn.focus();
    await page.keyboard.press('ArrowDown');
    await page.locator('#export-workspace-menu').waitFor({ state: 'visible' });
    assert.equal(
      await page.locator('#export-workspace-menu [role="menuitem"]').first().evaluate(el => el === document.activeElement),
      true,
      'ArrowDown on Export Report button should focus first menuitem'
    );
    await page.keyboard.press('Escape');
    await page.locator('#export-workspace-menu').waitFor({ state: 'detached' });

    // Shared card top-row alignment (P1-3)
    const sharedTopMetrics = await page.locator('#task-card-cd-1-t-kiran-1').evaluate(card => {
      const grip = card.querySelector('svg.lucide-grip-vertical')?.getBoundingClientRect();
      const load = card.querySelector('span[title^="Cognitive Load:"]')?.getBoundingClientRect();
      if (!grip || !load) return null;
      return Math.abs((grip.top + grip.height / 2) - (load.top + load.height / 2));
    });
    assert.ok(sharedTopMetrics !== null && sharedTopMetrics <= 4, `Shared card grip and load should stay on same row (delta=${sharedTopMetrics}px)`);

    // TaskModal tablist ArrowLeft keeps focus on tab & co-assign behind toggle (P1-5)
    await page.locator('#task-card-cd-1-t-kiran-2 h5 button').click();
    const editDialog = page.getByRole('dialog', { name: 'Task details' });
    await editDialog.waitFor({ state: 'visible' });
    await editDialog.getByRole('button', { name: /\+ Co-assign teammate/i }).waitFor({ state: 'visible' });
    await page.locator('#task-tab-details').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#task-tab-specs').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('ArrowLeft');
    assert.equal(
      await page.locator('#task-tab-details').evaluate(el => el === document.activeElement),
      true,
      'ArrowLeft back to Details & Schedule must keep focus on #task-tab-details'
    );
    assert.equal(await editDialog.getByRole('button', { name: /^Clear$/i }).count(), 0, 'Active To Do task must not offer deadline Clear');
    await page.locator('#task-tab-activity').click();
    const activityPanelHeight = await page.locator('#task-modal-tabpanel').evaluate(el => el.getBoundingClientRect().height);
    assert.ok(activityPanelHeight >= 339, `Activity tab panel should retain min-h-[340px] (got ${activityPanelHeight}px)`);
    await page.keyboard.press('Escape');
    await editDialog.waitFor({ state: 'detached' });

    // OverviewBar polish: Sort overloaded action cue, All Clusters dropdown label, standardized Eff cue
    await overview.getByRole('button', { name: /Sort overloaded first/i }).waitFor();
    await page.getByRole('button', { name: /All Clusters/i }).waitFor();
    await overview.getByText(/10h est\. \/ 6h billable/i).waitFor();

    // DisciplineTaskModal focus + discard guard + neutral placeholders + aria-pressed/0-selection guard (P2-5, P2-7)
    await page.getByRole('button', { name: /New Brief/i }).first().click();
    const newBriefDialog = page.getByRole('dialog', { name: 'Create pipeline requirement' });
    await newBriefDialog.waitFor({ state: 'visible' });
    assert.equal(await newBriefDialog.locator('#disciplinetaskmodal-field-1').evaluate(el => el === document.activeElement), true, 'New Brief should focus title input, not close button');
    assert.equal(await newBriefDialog.locator('#disciplinetaskmodal-field-3').getAttribute('placeholder'), 'e.g. Acme Corp');
    const contentToggle = newBriefDialog.getByRole('button', { name: /^Content$/i });
    const designToggle = newBriefDialog.getByRole('button', { name: /^Design$/i });
    assert.equal(await contentToggle.getAttribute('aria-pressed'), 'true');
    await contentToggle.click();
    if ((await designToggle.getAttribute('aria-pressed')) === 'true') await designToggle.click();
    assert.equal(await newBriefDialog.locator('button[type="submit"]').isDisabled(), true, '0 selected disciplines must disable submit');
    await contentToggle.click();
    assert.equal(await newBriefDialog.locator('button[type="submit"]').isDisabled(), true, 'A cluster is required');
    await newBriefDialog.getByLabel('Owning cluster').selectOption('cd-1');
    assert.equal(await newBriefDialog.locator('button[type="submit"]').isDisabled(), false);
    await newBriefDialog.locator('#disciplinetaskmodal-field-1').fill('Draft Unsaved Campaign');
    await page.locator('.dialog-backdrop').first().click({ position: { x: 10, y: 10 } });
    await newBriefDialog.getByRole('alertdialog', { name: /Discard unsaved/i }).waitFor({ state: 'visible' });
    await newBriefDialog.getByRole('button', { name: /Discard/i }).click();
    await newBriefDialog.waitFor({ state: 'detached' });

    // TaskAssignmentModal P0-1 footer visibility on 700px laptop + P1-3 blank No-deadline + P2-5 CD label
    await page.setViewportSize({ width: 1440, height: 700 });
    await page.locator('#team-pipeline-body .task-card').first().getByRole('button', { name: /^Assign$/i }).click();
    const assignDialog2 = page.getByRole('dialog', { name: 'Assign task' });
    await assignDialog2.waitFor({ state: 'visible' });
    assert.equal(await assignDialog2.locator('#taskassignmentmodal-deadline').inputValue(), '', 'Unassigned No-deadline brief should not prefill Tomorrow');
    assert.equal(await assignDialog2.locator('#taskassignmentmodal-deadline').isDisabled(), true);
    const kiranOptionText = await assignDialog2.locator('#assignment-member-cd-1-name').textContent();
    assert.ok(kiranOptionText && !kiranOptionText.includes('Independent'), `Creative Director should not be labeled Independent (got ${kiranOptionText})`);
    const sortedMembers = await assignDialog2.getByRole('group', { name: 'Member', exact: true }).getByRole('radio').all();
    assert.match(await sortedMembers[0].ariaSnapshot(), /Kiran S/);
    assert.match(await sortedMembers[1].ariaSnapshot(), /Ava Writer/);
    assert.match(await sortedMembers[2].ariaSnapshot(), /Leave unassigned in pipeline.*checked/);
    await sortedMembers[2].focus();
    await page.keyboard.press('ArrowUp');
    assert.equal(await sortedMembers[1].isChecked(), true);
    assert.match(await sortedMembers[1].ariaSnapshot(), /10.2h assigned today, 12.8 load points/);
    assert.equal(await assignDialog2.locator('#taskassignmentmodal-deadline').inputValue(), '', 'Selecting a teammate must leave the deadline for the lead to choose');
    await assignDialog2.getByRole('button', { name: 'Tomorrow', exact: true }).click();
    assert.ok((await assignDialog2.locator('#taskassignmentmodal-deadline').inputValue()).length > 0, 'A deadline preset should set the selected date');
    await assignDialog2.locator('#taskassignmentmodal-field-2').fill('8');
    const summaryText = await assignDialog2.locator('form').textContent();
    assert.match(summaryText || '', /Assigned today:\s*[\d.]+h\s*→\s*[\d.]+h/, 'Assign preview should project Assigned daily hours delta');
    const submitVisibility = await assignDialog2.evaluate(dialog => {
      const dr = dialog.getBoundingClientRect();
      const btn = dialog.querySelector('button[type="submit"]')!.getBoundingClientRect();
      const preset16h = Array.from(dialog.querySelectorAll('button')).find(b => b.textContent?.trim() === '16h')?.getBoundingClientRect();
      return {
        inDialog: btn.bottom <= dr.bottom + 1,
        inViewport: btn.bottom <= window.innerHeight + 1,
        presetVisible: Boolean(preset16h && preset16h.bottom <= dr.bottom + 1 && preset16h.bottom <= window.innerHeight + 1),
      };
    });
    assert.deepEqual(submitVisibility, { inDialog: true, inViewport: true, presetVisible: true }, 'TaskAssignmentModal presets & submit footer must stay visible at 1440x700');
    await page.keyboard.press('Escape');
    await assignDialog2.getByRole('button', { name: /^Discard$/i }).click();
    await assignDialog2.waitFor({ state: 'detached' });
    await page.setViewportSize({ width: 1440, height: 900 });

    // Ongoing card layout + anchored member menu proximity (P1-2) + DuplicateTaskModal defaults
    const memberBtn = page.locator('#member-actions-btn-cd-1');
    await memberBtn.click();
    const memberMenu = page.locator('#member-actions-menu-cd-1');
    await memberMenu.waitFor({ state: 'visible' });
    const menuGapPx = await page.evaluate(() => {
      const btn = document.getElementById('member-actions-btn-cd-1')!.getBoundingClientRect();
      const menu = document.getElementById('member-actions-menu-cd-1')!.getBoundingClientRect();
      return menu.top >= btn.bottom ? menu.top - btn.bottom : btn.top - menu.bottom;
    });
    assert.ok(menuGapPx >= 0 && menuGapPx <= 16, `Member menu should anchor cleanly near trigger (gap=${menuGapPx}px)`);
    await memberMenu.getByRole('menuitem', { name: 'Add Ongoing Task' }).click();
    await page.getByPlaceholder(/Ongoing task name/i).fill('Ongoing Weekly Newsletter');
    await page.getByRole('button', { name: /^Add Ongoing$/i }).click();
    const ongoingCard = page.locator('#swimlane-cd-1 .task-card', { hasText: 'Ongoing Weekly Newsletter' });
    await ongoingCard.waitFor({ state: 'visible' });
    const ongoingActions = ongoingCard.getByRole('button', { name: 'Actions for Ongoing Weekly Newsletter' });
    await ongoingActions.click();
    const ongoingMenu = page.getByRole('menu', { name: 'Actions for Ongoing Weekly Newsletter' });
    await ongoingMenu.getByRole('menuitem', { name: 'Edit Details' }).waitFor();
    await ongoingMenu.getByRole('menuitem', { name: 'Delete Task' }).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await ongoingActions.evaluate(el => el === document.activeElement), true, 'Escape restores focus to ongoing card menu');
    const ongoingTitleWidth = await ongoingCard.locator('h5 button').evaluate(el => el.getBoundingClientRect().width);
    assert.ok(ongoingTitleWidth > 120, `Ongoing title should not be crushed (got ${ongoingTitleWidth}px)`);
    await ongoingCard.getByRole('button', { name: /Subtask/i }).click();
    const dupDialog = page.getByRole('dialog', { name: 'Duplicate task' });
    await dupDialog.waitFor({ state: 'visible' });
    assert.equal(await dupDialog.locator('h2').count(), 1, 'DuplicateTaskModal should use h2 heading');
    assert.equal(await dupDialog.locator('h3').count(), 1, 'DuplicateTaskModal should use h3 heading without skipping');
    assert.equal(await dupDialog.locator('#duplicatetaskmodal-field-2').inputValue(), 'cd-1', 'Ongoing subtask should default to parent owner');
    assert.ok((await dupDialog.locator('#duplicatetaskmodal-field-5').inputValue()).length > 0, 'Ongoing subtask should prefill tomorrow deadline');
    await page.keyboard.press('Escape');
    await dupDialog.waitFor({ state: 'detached' });

    // Standard task delegation excludes Account Managers, prefers non-overloaded teammate, and deduplicates status options (P1-1, P2-3)
    await page.locator('#task-card-cd-1-t-kiran-2 button[aria-label^="Actions for"]').click();
    const desktopCardMenu = page.locator('body > [role="menu"][aria-label^="Actions for"]');
    await desktopCardMenu.waitFor({ state: 'visible' });
    await desktopCardMenu.getByRole('menuitem', { name: 'Create Subtask' }).click();
    await dupDialog.waitFor({ state: 'visible' });
    const dupOwnerOptions = await dupDialog.locator('#duplicatetaskmodal-field-2 option').allTextContents();
    assert.equal(dupOwnerOptions.some(t => /Account/i.test(t)), false, 'DuplicateTaskModal must exclude non-delivery Account Managers');
    assert.equal(await dupDialog.locator('#duplicatetaskmodal-field-2').inputValue(), 'u-design', 'Standard task delegation should prefer non-overloaded teammate over overloaded Ava');
    await dupDialog.getByRole('button', { name: /More options/i }).click();
    const dupStatusValues = await dupDialog.locator('#duplicatetaskmodal-field-4 option').evaluateAll(opts => opts.map(o => (o as HTMLOptionElement).value));
    assert.equal(new Set(dupStatusValues).size, dupStatusValues.length, `DuplicateTaskModal Initial Status should have no duplicate values: ${JSON.stringify(dupStatusValues)}`);
    await page.keyboard.press('Escape');
    await dupDialog.waitFor({ state: 'detached' });

    // P0: Desktop TaskCard title precedes utility/billable controls in DOM order and billable button is never overlapped
    const cardFocusOrder = await page.locator('#task-card-cd-1-t-kiran-2').evaluate(card => {
      const focusables = Array.from(card.querySelectorAll<HTMLElement>('button, a'));
      const titleIdx = focusables.findIndex(el => Boolean(el.closest('h5')));
      const billableIdx = focusables.findIndex(el => (el.getAttribute('aria-label') || '').includes('billable'));
      const menuIdx = focusables.findIndex(el => (el.getAttribute('aria-label') || '').startsWith('Actions for'));
      return { titleIdx, billableIdx, menuIdx };
    });
    assert.ok(cardFocusOrder.titleIdx === 0 && cardFocusOrder.menuIdx > cardFocusOrder.titleIdx && cardFocusOrder.billableIdx > cardFocusOrder.titleIdx, `Card Tab order must start at title: ${JSON.stringify(cardFocusOrder)}`);

    // TaskCard single-click opens TaskModal instantaneously (0ms, no double-click inline rename) + Co-assign focus transfer (P1-4, P1-5, P3-3)
    await page.locator('#task-card-cd-1-t-kiran-2 h5 button').click();
    await editDialog.waitFor({ state: 'visible' });
    await editDialog.getByRole('button', { name: /\+ Co-assign teammate/i }).click();
    assert.equal(
      await editDialog.locator('select[aria-label="Share task with additional member"]').evaluate(el => el === document.activeElement),
      true,
      'Clicking + Co-assign teammate must move focus into the newly revealed select'
    );
    await editDialog.getByRole('button', { name: 'Hide co-assign selector' }).click();
    await page.keyboard.press('Escape');
    await editDialog.waitFor({ state: 'detached' });

    // WorkloadModal labels and Close Breakdown autofocus guard
    await page.locator('#workload-btn-cd-1').click();
    const workloadDialog = page.locator('#workload-breakdown-modal');
    await workloadDialog.waitFor({ state: 'visible' });
    await workloadDialog.getByText('To Do (Dated)', { exact: true }).waitFor({ state: 'visible' });
    await workloadDialog.getByText('To Do (Undated)', { exact: true }).waitFor({ state: 'visible' });
    const closeBreakdownBtn = workloadDialog.getByRole('button', { name: 'Close Breakdown' });
    assert.equal(
      await closeBreakdownBtn.evaluate(el => el === document.activeElement),
      true,
      'Opening WorkloadModal should focus Close Breakdown button instead of an SVG chart bar'
    );
    await closeBreakdownBtn.click();
    await workloadDialog.waitFor({ state: 'detached' });

    // Sort overloaded first -> clicking manual reorder exits pressure sort immediately (P2-4)
    const sortBtn = overview.getByRole('button', { name: /at least 12 points/i });
    await sortBtn.click();
    assert.equal(await sortBtn.getAttribute('aria-pressed'), 'true');
    await page.locator('#swimlane-u-content button[aria-label="Move Ava Writer down"]').click();
    assert.equal(await sortBtn.getAttribute('aria-pressed'), 'false', 'Manual swimlane reorder should exit Sort overloaded first');

    // Mobile 390x844 viewport checks (touch targets >= 44x44 including menu items, portaled card menu, Ongoing not crushed)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(100);
    const mobileOngoingTitleWidth = await ongoingCard.locator('h5 button').evaluate(el => el.getBoundingClientRect().width);
    assert.ok(mobileOngoingTitleWidth > 100, `Mobile ongoing title should not crush (got ${mobileOngoingTitleWidth}px)`);
    assert.equal(
      await page.locator('#swimlane-u-content button[aria-label*="Move"]').first().isVisible(),
      false,
      'Desktop inline Move stack should be hidden on 390px mobile'
    );
    await page.locator('#swimlane-u-content button[aria-label="More actions for Ava Writer"]:visible').click();
    const avaMenu = page.locator('#member-actions-menu-u-content');
    await avaMenu.waitFor({ state: 'visible' });
    const mobileMenuItemHeights = await avaMenu.locator('[role="menuitem"]').evaluateAll(els =>
      els.map(el => ({ text: el.textContent?.trim(), h: el.getBoundingClientRect().height }))
    );
    for (const item of mobileMenuItemHeights) {
      assert.ok(item.h >= 44, `Mobile member menu item "${item.text}" should be >= 44px (got ${item.h}px)`);
    }
    await page.keyboard.press('Escape');
    await page.getByRole('group', { name: 'Ava Writer task stages' }).getByRole('button', { name: /To Do/ }).click();
    await page.locator('#task-card-u-content-t-ava-3 button[aria-label^="Actions for"]').click();
    const portaledCardMenu = page.locator('body > [role="menu"][aria-label^="Actions for"]');
    await portaledCardMenu.waitFor({ state: 'visible' });
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    const moveMenu = page.getByRole('menu', { name: 'Move Product Architecture Blog Series' });
    await moveMenu.locator('[role="menuitem"]:focus').getByText('Back to actions', { exact: true }).waitFor();
    await page.keyboard.press('ArrowDown');
    assert.equal(await moveMenu.getByRole('menuitem', { name: 'In Progress' }).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Enter');
    await page.getByRole('dialog', { name: 'Work in progress limit' }).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog', { name: 'Work in progress limit' }).waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Actions for Product Architecture Blog Series' }).click();
    await portaledCardMenu.getByRole('menuitem', { name: 'Move', exact: true }).click();
    await moveMenu.getByRole('menuitem', { name: 'Sent' }).click();
    await page.getByRole('dialog', { name: 'Attach content document link' }).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog', { name: 'Attach content document link' }).waitFor({ state: 'detached' });
    assert.equal(
      await page.locator('#swimlane-cd-1 .task-card svg.lucide-grip-vertical').first().isVisible(),
      false,
      'TaskCard GripVertical drag handles should be hidden on mobile (<640px)'
    );
    await page.locator('#free-pool-trigger').click();
    const mobileFreePoolJumpHeight = await page.getByRole('button', { name: /Jump to Mia Designer's swimlane.*0h assigned today/ }).evaluate(el => el.getBoundingClientRect().height);
    assert.ok(mobileFreePoolJumpHeight >= 43.5, `Mobile Free Pool jump action should be >= 44px (got ${mobileFreePoolJumpHeight}px)`);
    await page.getByRole('button', { name: /Jump to Mia Designer's swimlane.*0h assigned today/ }).focus();
    await page.keyboard.press('Escape');
    await page.getByRole('complementary', { name: 'Free Pool' }).waitFor({ state: 'hidden' });
    const undersizedControls = await page.evaluate(() => {
      return Array.from(document.querySelectorAll<HTMLElement>('button, a, input, select, [role="button"], [role="tab"]'))
        .filter(el => !el.classList.contains('sr-only') && el.getClientRects().length > 0 && el.offsetParent !== null)
        .map(el => {
          const r = el.getBoundingClientRect();
          return { label: el.getAttribute('aria-label') || el.id || el.textContent?.trim() || '', w: r.width, h: r.height };
        })
        .filter(item => item.w < 43.5 || item.h < 43.5);
    });
    assert.deepEqual(undersizedControls, [], `All visible 390px controls should meet 44x44 touch targets: ${JSON.stringify(undersizedControls)}`);

    await page.goto(`${PREVIEW_URL}?width=390`, { waitUntil: 'networkidle' });
    const iframe = page.locator('iframe[title="390px responsive preview"]');
    await iframe.waitFor({ state: 'visible' });
    console.log('Browser UI preview: desktop tabs, compliance, scoped efficiency, historical analytics, Free Pool task handoff, and 390px responsive iframe passed.');
    await context.close();
  }

  // Search, assignment and narrow-screen regression checks use a fresh fixture.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    attachErrorListeners(page, 'search-and-assignment');
    await page.clock.setFixedTime(new Date('2026-11-26T10:00:00.000Z'));
    await page.goto(PREVIEW_URL, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^Free Pool.*under/ }).waitFor();
    const nextCards = page.getByRole('button', { name: 'Next cards' });
    await nextCards.click();
    await nextCards.waitFor({ state: 'hidden' });
    assert.ok(await page.getByRole('region', { name: 'Pipeline cards' }).evaluate(row => row.scrollLeft > 0));

    const search = page.locator('#task-search-input');
    await search.fill('no brief matches this text');
    await page.getByRole('button', { name: /^Assigned \(/ }).filter({ visible: true }).click();
    await page.getByRole('button', { name: 'Clear Pipeline filter' }).click();
    assert.equal(await search.inputValue(), 'no brief matches this text');
    await page.getByRole('button', { name: /^Assigned \(/ }).filter({ visible: true }).click();
    await page.getByRole('button', { name: 'Clear search', exact: true }).click();
    await page.getByRole('button', { name: 'Clear Pipeline filter' }).click();
    await page.locator('#task-search-input').fill('Q4 Brand Narrative');
    await page.getByText(/2 pipeline briefs · 0 assigned tasks/).waitFor();
    assert.equal(await page.getByText('Q4 Brand Narrative (Content)', { exact: true }).first().isVisible(), true);
    assert.equal(await page.getByText(/No matching tasks, clients/).count(), 0);
    await page.getByRole('button', { name: 'Design (1 match)', exact: true }).click();
    await page.getByText(/1 pipeline brief · 0 assigned tasks/).waitFor();
    await page.getByRole('button', { name: 'Content (1 match)', exact: true }).click();
    await page.locator('#task-search-input').fill('');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: 'Assign', exact: true }).first().click();
    const assignment = page.getByRole('dialog', { name: 'Assign task' });
    await assignment.getByText(/Select a member to choose a destination/).waitFor();
    assert.equal(await assignment.getByRole('radio', { name: 'Move to To Do' }).isDisabled(), true);
    await assignment.getByRole('button', { name: 'Save estimates in Pipeline' }).waitFor();
    await assignment.locator('input[name="assignment-member"][value="u-content"]').check();
    assert.equal(await assignment.locator('#taskassignmentmodal-deadline').inputValue(), '');
    await assignment.getByRole('button', { name: 'Tomorrow', exact: true }).click();
    await assignment.getByRole('button', { name: 'Assign & Move to To Do' }).click();
    await assignment.getByText('Confirm the workload impact before assigning this task.').waitFor();
    await assignment.getByRole('checkbox', { name: /projected workload/ }).check();
    await assignment.getByRole('button', { name: 'Assign & Move to To Do' }).click();
    await page.locator('#assignment-result').getByText(/Assignment saved/).waitFor();
    await page.locator('#assignment-result').getByRole('button', { name: 'View task' }).click();
    await page.getByRole('dialog', { name: 'Task details' }).waitFor();
    await context.close();
  }

  // Larger phone fixture and the Accounts-to-Pipeline handoff.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    attachErrorListeners(page, 'larger-fixture-and-accounts');
    await page.clock.setFixedTime(new Date('2026-11-29T10:00:00.000Z'));
    for (const theme of ['light', 'dark']) {
      await page.goto(`${PREVIEW_URL}?fixture=large&theme=${theme}`, { waitUntil: 'networkidle' });
      const freePool = page.getByRole('button', { name: /^Free Pool.*under/ });
      assert.equal(await freePool.count(), 1);
      const exceptions = page.getByRole('region', { name: 'Workload exceptions' });
      assert.match(await exceptions.getByRole('button').first().innerText(), /Overdue/);
      assert.match(await exceptions.getByRole('button').first().innerText(), /Ava Writer/);
      await page.getByRole('link', { name: 'Members', exact: true }).press('Enter');
      assert.equal(await page.locator('#member-lanes').evaluate(el => el === document.activeElement), true);
      await page.getByRole('link', { name: 'Back to Pipeline' }).press('Enter');
      assert.equal(await page.locator('#pipeline-shortcut').evaluate(el => el === document.activeElement), true);
      const next = page.getByRole('button', { name: 'Next cards' });
      const cards = page.getByRole('region', { name: 'Pipeline cards' });
      await next.focus();
      for (let i = 0; i < 12; i++) {
        const position = await cards.evaluate(row => ({
          left: row.scrollLeft,
          remaining: row.scrollWidth - row.clientWidth - row.scrollLeft,
        }));
        if (position.remaining <= 2) break;
        await page.keyboard.press('Enter');
        await page.waitForFunction(previous => {
          const row = document.querySelector('[aria-label="Pipeline cards"]');
          return row && row.scrollLeft > previous;
        }, position.left, { timeout: 3000 });
      }
      await next.waitFor({ state: 'hidden' });
      assert.ok(await cards.evaluate(row => row.scrollWidth - row.clientWidth - row.scrollLeft <= 2));
      await page.getByRole('group', { name: 'Ava Writer task stages' }).getByRole('button', { name: /To Do/ }).press('Enter');
      await page.locator('#swimlane-u-content').getByText('Product Architecture Blog Series').waitFor();
      const lane = page.locator('#swimlane-u-content');
      await lane.getByRole('button', { name: 'Quick add to To Do' }).click();
      const draft = lane.getByRole('textbox', { name: 'Quick-add task title' });
      await draft.fill('Preserve this draft');
      await page.getByRole('region', { name: 'Workload exceptions' }).getByRole('heading').click();
      const discard = page.getByRole('dialog', { name: 'Discard quick-add draft?' });
      await discard.getByRole('button', { name: 'Keep editing' }).click();
      assert.equal(await draft.inputValue(), 'Preserve this draft');
      await draft.press('Escape');
      await discard.getByRole('button', { name: 'Keep editing' }).click();
      await lane.getByRole('button', { name: 'Cancel', exact: true }).click();
      await discard.getByRole('button', { name: 'Keep editing' }).click();
      const doing = lane.getByRole('group', { name: 'Ava Writer task stages' }).getByRole('button', { name: /In Progress/ });
      await doing.press('Enter');
      assert.equal(await doing.getAttribute('aria-pressed'), 'false');
      await discard.getByRole('button', { name: 'Discard draft' }).click();
      assert.equal(await doing.getAttribute('aria-pressed'), 'true');
      await draft.waitFor({ state: 'hidden' });
      await freePool.press('Enter');
      const pool = page.getByRole('complementary', { name: 'Free Pool' });
      await pool.getByRole('button', { name: 'Assign brief for Mia Designer' }).press('Enter');
      await page.getByRole('menuitem', { name: /Q4 Brand Narrative/ }).press('Enter');
      const dialog = page.getByRole('dialog', { name: 'Assign task' });
      await dialog.getByRole('radio', { name: /Mia Designer.*assigned today.*load points/ }).waitFor();
      assert.equal(await dialog.getByRole('radio', { name: /Mia Designer/ }).isChecked(), true);
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${PREVIEW_URL}?role=accounts`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'New Brief', exact: true }).click();
    const brief = page.getByRole('dialog', { name: 'Create pipeline requirement' });
    await brief.getByLabel('Owning cluster').selectOption('cd-1');
    await brief.locator('#disciplinetaskmodal-field-1').fill('Accounts handoff regression');
    await brief.getByRole('button', { name: 'Create Pipeline Task' }).click();
    await brief.waitFor({ state: 'hidden' });
    await page.getByRole('region', { name: 'Pipeline cards' }).getByText(/Accounts handoff regression/).click();
    const details = page.getByRole('dialog', { name: 'Task details' });
    await details.getByText('Unassigned in Pipeline', { exact: true }).waitFor();
    await details.getByText(/administrator can assign this brief/).waitFor();
    await context.close();
  }

  // Specialist queue: all tasks remain accessible and board safeguards apply.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    attachErrorListeners(page, 'specialist-queue');
    await page.goto(`${PREVIEW_URL}?role=specialist`, { waitUntil: 'networkidle' });
    const queue = page.getByRole('region', { name: 'Your work' });
    await queue.getByRole('button', { name: /View all my tasks/ }).click();
    await queue.getByRole('button', { name: /Start Product Architecture Blog Series/ }).click();
    await page.getByRole('dialog', { name: 'Work in progress limit' }).waitFor();
    await page.keyboard.press('Escape');
    await queue.getByRole('button', { name: /Complete Homepage Narrative Rewrite/ }).click();
    await page.getByRole('dialog', { name: 'Attach content document link' }).waitFor();
    await page.keyboard.press('Escape');
    await queue.getByRole('button', { name: 'Show fewer tasks' }).click();
    await context.close();
  }

  // Member role selection, compact card context and account ranking.
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    attachErrorListeners(page, 'member-role-rules');
    await page.clock.setFixedTime(new Date('2026-11-26T10:00:00.000Z'));
    await page.goto(PREVIEW_URL, { waitUntil: 'networkidle' });
    const brief = page.locator('#team-pipeline-body .task-card').first();
    assert.equal(await brief.getByText('Article', { exact: true }).count(), 0);
    assert.equal(await brief.getByText('Content · Article', { exact: true }).count(), 0);
    const weights = await brief.evaluate(el => {
      const client = [...el.querySelectorAll('span')].find(node => node.textContent === 'Zen');
      const project = [...el.querySelectorAll('span')].find(node => node.textContent === 'Brand Refresh');
      return [client, project].map(node => node && Number(getComputedStyle(node).fontWeight));
    });
    assert.ok(weights[0]! < weights[1]!, `Project should be bolder than client: ${weights}`);
    assert.equal(await page.getByRole('button', { name: /unassigned cluster only/i }).count(), 0);
    await page.locator('#user-profile-menu-button').click();
    await page.getByRole('menuitem', { name: 'Add Team Member' }).click();
    const member = page.getByRole('dialog', { name: 'Add team member' });
    const admin = member.locator('#toggle-addmember-admin-privilege');
    assert.equal(await member.getByRole('button', { name: /^None/ }).count(), 0);
    await member.getByLabel('Business Lead').check();
    assert.equal(await admin.isChecked(), true);
    assert.equal(await member.getByRole('button', { name: /Content/ }).getAttribute('aria-pressed'), 'false');
    await member.getByLabel('Creative Director').check();
    assert.equal(await member.getByLabel('Business Lead').isChecked(), false);
    assert.equal(await admin.isChecked(), true);
    await member.getByLabel('Cluster Lead').check();
    assert.equal(await admin.isChecked(), false);
    assert.equal(await member.getByRole('button', { name: /Accounts/ }).getAttribute('aria-pressed'), 'true');
    await member.getByLabel('Team Lead').check();
    assert.equal(await member.getByRole('button', { name: /Accounts/ }).isDisabled(), true);
    await member.getByRole('button', { name: /Design/ }).click();
    assert.equal(await member.getByRole('button', { name: /Design/ }).getAttribute('aria-pressed'), 'true');
    await page.keyboard.press('Escape');
    await member.waitFor({ state: 'detached' });
    await page.locator('#member-actions-btn-u-content').click();
    await page.locator('#member-actions-menu-u-content').getByRole('menuitem', { name: 'Edit Member Profile' }).click();
    const editMember = page.getByRole('dialog', { name: 'Edit team member' });
    await editMember.getByRole('checkbox', { name: 'Creative Director', exact: true }).check();
    assert.equal(await editMember.locator('#toggle-edituser-admin-privilege').isChecked(), true);
    assert.equal(await editMember.getByRole('button', { name: /Content/ }).getAttribute('aria-pressed'), 'false');
    await editMember.getByRole('checkbox', { name: 'Cluster Lead', exact: true }).check();
    assert.equal(await editMember.locator('#toggle-edituser-admin-privilege').isChecked(), false);
    assert.equal(await editMember.getByRole('button', { name: /Accounts/ }).getAttribute('aria-pressed'), 'true');
    await page.keyboard.press('Escape');
    await editMember.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'View Analytics' }).click();
    const analytics = page.getByRole('dialog', { name: 'Workspace analytics' });
    const metrics = analytics.getByRole('region', { name: 'Key metrics' });
    const accounts = metrics.locator('.metric-card').last();
    assert.match(await accounts.innerText(), /NovaPay[\s\S]*11h billed[\s\S]*VeloAI[\s\S]*8.5h billed[\s\S]*Apex Cloud[\s\S]*5.5h billed/);
    const meterPositions = await metrics.locator('.metric-track').evaluateAll(els => els.slice(0, 3).map(el => el.getBoundingClientRect().y));
    assert.ok(Math.max(...meterPositions) - Math.min(...meterPositions) < 2, `Headline meters should align: ${meterPositions}`);
    await context.close();
  }

  assert.deepEqual(pageErrors, [], `Uncaught page errors:\n${pageErrors.join('\n')}`);
  assert.deepEqual(consoleErrors, [], `Console errors:\n${consoleErrors.join('\n')}`);
} finally {
  await browser.close();
  await server.stop();
}

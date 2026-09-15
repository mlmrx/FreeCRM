import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

// Creates fictional agents and immutable policy history ONLY in disposable QA.
assert.equal(process.env.FREE_CRM_ROADMAP_QA, 'synthetic-disposable', 'Requires explicit synthetic-disposable acknowledgement.');
const base = new URL(process.env.FREE_CRM_BASE_URL || '');
assert.ok(base.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(base.hostname) && base.port && !base.username && !base.password && base.pathname === '/' && !base.search && !base.hash, 'Use an isolated literal-loopback HTTP origin.');
async function api(path, body, expected = 200, key = crypto.randomUUID()) {
  const response = await fetch(new URL(path, base), body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify(body) });
  assert.equal(response.status, expected, `${path}: unexpected response status`);
  return response.json();
}
async function assertMobileReflow(page, panel, evidence, width, font) {
  await page.setViewportSize({ width, height: 844 });
  let reflow;
  const snapshot = () => panel.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const describe = (child) => {
      const rect = child.getBoundingClientRect(); const style = getComputedStyle(child);
      return { tag: child.tagName, className: child.className, type: child.getAttribute('type'), text: child.textContent?.slice(0, 160), left: rect.left, right: rect.right, width: rect.width, clientWidth: child.clientWidth, scrollWidth: child.scrollWidth, marginInlineStart: style.marginInlineStart, paddingInlineStart: style.paddingInlineStart, minWidth: style.minWidth, maxWidth: style.maxWidth, font: style.font, whiteSpace: style.whiteSpace, overflowWrap: style.overflowWrap };
    };
    const ancestors = []; for (let parent = element.parentElement; parent; parent = parent.parentElement) ancestors.push(describe(parent));
    return { viewport: innerWidth, mobileMedia: matchMedia('(max-width: 640px)').matches, panel: describe(element), ancestors, offenders: [...element.querySelectorAll('*')].filter((child) => {
      const rect = child.getBoundingClientRect();
      return rect.width > 0 && (rect.right > bounds.right + 1 || rect.left < bounds.left - 1 || child.scrollWidth > child.clientWidth + 1);
    }).map(describe) };
  });
  try {
    // Chromium can acknowledge the new viewport before media-query styles are
    // applied: at 390px the old 252px workspace offset made this panel just 72px
    // wide. Wait for the actual mobile layout, not a sleep or a looser bound.
    await expect(page.locator('.workspace')).toHaveCSS('margin-inline-start', '0px');
    await expect(panel.locator(':scope > div')).toHaveCSS('padding-inline-start', '12px');
    // Narrow-phone resizes share the same breakpoint. Also require the actual
    // workspace box to track the new viewport before measuring its children.
    await expect.poll(() => page.locator('.workspace').evaluate((element, requestedWidth) => {
      const bounds = element.getBoundingClientRect();
      return innerWidth === requestedWidth && Math.abs(bounds.left) <= 1 && Math.abs(bounds.width - document.documentElement.clientWidth) <= 1;
    }, width), { message: `Workspace layout must match the ${width}px viewport before measuring policy overflow.` }).toBe(true);
    await expect(panel.getByRole('button', { name: 'Save and activate new version', exact: true })).toBeVisible();
    reflow = await snapshot();
    assert.equal(reflow.viewport, width); assert.equal(reflow.mobileMedia, true);
    const overflow = reflow.panel.scrollWidth - reflow.panel.clientWidth;
    assert.ok(overflow <= 1, `Policy editor horizontally overflows its ${width}px mobile container (${font}) by ${overflow}px.`);
  } finally {
    // Preserve the measured frame before a screenshot's own layout wait. This
    // also records ancestor styles when the mobile-layout assertion fails.
    reflow ??= await snapshot();
    await writeFile(new URL(`mobile-reflow-${font}-${width}.json`, evidence), JSON.stringify(reflow, null, 2));
    await panel.screenshot({ path: fileURLToPath(new URL(`mobile-current-policy-${font}-${width}.png`, evidence)) });
  }
}
const bootstrap = (await api('/api/v1/bootstrap')).data;
assert.equal(bootstrap.runtime.mode, 'device'); assert.equal(bootstrap.workspace.role, 'owner');
await api('/api/v1/commands', { type: 'workspace.update', payload: { profile: 'business' } });
await api('/api/v1/commands', { type: 'capability.update', payload: { key: 'agentPlane', enabled: true } });
await api('/api/v1/commands', { type: 'capability.update', payload: { key: 'advancedPolicies', enabled: true } });
const agentName = `Fictional policy editor QA ${crypto.randomUUID().slice(0, 8)}`;
const created = (await api('/api/v1/agents/actions', { operation: 'agent.create', name: agentName, autonomy: 'policy-autonomous', monthlyBudgetCents: 100, idempotencyKey: crypto.randomUUID() }, 201)).data;
await api('/api/v1/agents/actions', { operation: 'agent.safety', agentId: created.agentId, status: 'active' });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 960 }, reducedMotion: 'reduce', serviceWorkers: 'block', locale: 'en-US' });
let externalRequests = 0;
await context.route('**/*', async (route) => {
  if (new URL(route.request().url()).origin !== base.origin) { externalRequests += 1; await route.abort(); return; }
  await route.continue();
});
try {
  const page = await context.newPage(); page.on('dialog', (dialog) => dialog.accept());
  const pageErrors = []; page.on('pageerror', (error) => pageErrors.push(error));
  const evidence = new URL('../outputs/policy-editor-qa/', import.meta.url); await mkdir(evidence, { recursive: true });
  await page.goto(new URL('/workspace', base).href);
  await page.locator('button.nav-item').filter({ hasText: 'Agents' }).click();
  const card = page.locator('article.agent-control-card').filter({ has: page.getByText(agentName, { exact: true }) });
  const summary = card.locator('summary').filter({ hasText: 'Policy & dry-run' });
  await summary.focus(); await page.keyboard.press('Enter');
  const panel = card.locator('details').filter({ has: page.getByRole('heading', { name: 'Decide the boundaries before the work.', exact: true }) });
  await expect(panel.getByText('No authored policy yet — platform safeguards apply', { exact: true })).toBeVisible();
  await panel.getByLabel('Maximum records per read', { exact: true }).fill('1');
  await panel.getByLabel('Require human approval for every permitted action', { exact: true }).uncheck();
  const before = (await api('/api/v1/agents/actions')).data;
  await panel.getByRole('button', { name: 'Dry-run — no changes', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('No tool ran and no state was changed.');
  assert.deepEqual((await api('/api/v1/agents/actions')).data, before, 'Browser dry-run changed agent state.');
  await page.keyboard.press('Tab');
  await panel.getByRole('button', { name: 'Dry-run — no changes', exact: true }).focus();
  assert.notEqual(await panel.getByRole('button', { name: 'Dry-run — no changes', exact: true }).evaluate((element) => getComputedStyle(element).outlineStyle), 'none');

  // A sibling safety control refreshes the same mounted editor. Its old allow
  // preview must disappear, while the operator's unsaved draft survives.
  await card.getByRole('button', { name: 'Emergency stop', exact: true }).click();
  await expect(panel.getByText(/Agent: .*emergency stop active/)).toBeVisible();
  await expect(panel.getByText('No tool ran and no state was changed.', { exact: false })).toHaveCount(0);
  await expect(panel.getByLabel('Maximum records per read', { exact: true })).toHaveValue('1');
  await expect(panel.getByLabel('Require human approval for every permitted action', { exact: true })).not.toBeChecked();
  await card.getByRole('button', { name: 'Clear stop', exact: true }).click();
  await expect(panel.getByText(/Agent: paused\./)).toBeVisible();
  await card.getByRole('button', { name: 'Activate', exact: true }).click();
  await expect(panel.getByText(/Agent: active\./)).toBeVisible();

  // Hold a genuine pre-stop dry-run response in flight. Releasing it after the
  // refreshed stop state must not restore its earlier allow decision.
  let releaseDryRun; let capturedDryRun = false;
  const release = new Promise((resolve) => { releaseDryRun = resolve; });
  const delayedDryRun = async (route) => {
    if (route.request().method() !== 'POST' || route.request().postDataJSON().operation !== 'dry-run') return route.continue();
    const response = await route.fetch(); assert.equal(response.status(), 200);
    const body = await response.json(); assert.equal(body.data.decision.decision, 'allow');
    capturedDryRun = true; await release;
    await route.fulfill({ response, body: JSON.stringify(body) });
  };
  await page.route('**/api/v1/agents/policies', delayedDryRun);
  await panel.getByRole('button', { name: 'Dry-run — no changes', exact: true }).click();
  await expect.poll(() => capturedDryRun, { timeout: 10000 }).toBe(true);
  await card.getByRole('button', { name: 'Emergency stop', exact: true }).click();
  await expect(panel.getByText(/Agent: .*emergency stop active/)).toBeVisible();
  const releasedResponse = page.waitForResponse((response) => response.url().endsWith('/api/v1/agents/policies') && response.request().method() === 'POST');
  releaseDryRun(); await releasedResponse;
  await page.unroute('**/api/v1/agents/policies', delayedDryRun);
  await expect(panel.getByText('No tool ran and no state was changed.', { exact: false })).toHaveCount(0);
  await expect(panel.getByLabel('Maximum records per read', { exact: true })).toHaveValue('1');
  await card.getByRole('button', { name: 'Clear stop', exact: true }).click();
  await expect(panel.getByText(/Agent: paused\./)).toBeVisible();
  await card.getByRole('button', { name: 'Activate', exact: true }).click();
  await expect(panel.getByText(/Agent: active\./)).toBeVisible();

  // Simulate a committed v1 whose receipt is truncated, while another client
  // activates v2. The user's exact retry must recover v1 without claiming it
  // remains active. No fake server policy state is used for this scenario.
  let intercepted = false;
  await page.route('**/api/v1/agents/policies', async (route) => {
    if (route.request().method() !== 'POST' || intercepted) return route.continue();
    const body = route.request().postDataJSON();
    if (body.operation !== 'save' || body.agentId !== created.agentId) return route.continue();
    intercepted = true;
    const committed = await route.fetch(); assert.equal(committed.status(), 200);
    const receipt = await committed.json(); assert.equal(receipt.data.active.version, 1);
    await api('/api/v1/agents/policies', { operation: 'save', agentId: created.agentId, expectedVersion: 1, policy: { ...receipt.data.active.policy, stopped: true } });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {} }) });
  });
  await panel.getByRole('button', { name: 'Save and activate new version', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('invalid success receipt');
  await panel.getByRole('button', { name: 'Save and activate new version', exact: true }).click();
  await expect(panel.getByText('Active version 2', { exact: true })).toBeVisible();
  await expect(panel.getByRole('status')).toContainText('newer version 2 is now active');
  await expect(panel.getByLabel('Stop new work through this policy', { exact: true })).toBeChecked();
  await panel.screenshot({ path: fileURLToPath(new URL('desktop-current-policy.png', evidence)) });

  await api('/api/v1/agents/actions', { operation: 'grant.revoke', agentId: created.agentId, toolId: created.toolId });
  await panel.getByRole('button', { name: 'Reload latest', exact: true }).click();
  const missing = panel.getByRole('group', { name: 'Previously selected tools with no current grant', exact: true });
  await expect(missing).toBeVisible();
  await missing.getByRole('checkbox').click();
  await expect(missing).toHaveCount(0);
  await panel.getByRole('button', { name: 'Save and activate new version', exact: true }).click();
  await expect(panel.getByText('Active version 3', { exact: true })).toBeVisible();
  const final = (await api(`/api/v1/agents/policies?agentId=${created.agentId}`)).data;
  assert.deepEqual(final.active.policy.allowedToolIds, []); assert.equal(final.active.policy.stopped, true);
  // Exercise desktop-to-mobile transitions plus narrow phones with both the
  // installed platform font and the Arial/sans-serif fallback used on Linux.
  for (const font of ['platform', 'arial']) {
    await page.setViewportSize({ width: 1280, height: 960 });
    await expect(page.locator('.workspace')).toHaveCSS('margin-inline-start', '252px');
    if (font === 'arial') await page.evaluate(() => document.documentElement.style.setProperty('--sans', 'Arial, sans-serif'));
    for (const width of [390, 375, 320]) await assertMobileReflow(page, panel, evidence, width, font);
  }
  assert.equal(pageErrors.length, 0, 'Policy editor produced an uncaught browser error.');
  assert.equal(externalRequests, 0, 'Editor attempted an external request.');
  console.log('Policy editor browser smoke passed: keyboard disclosure/focus; real zero-write dry-run; safety changes and late responses clear stale previews without discarding drafts; ambiguous v1 save + competing v2 + exact retry shows current v2; revoked-grant removal and v3 save; actual mobile breakpoint and <=1px overflow at 390/375/320px with platform and Arial fallback fonts. Fictional agent/history remain only in disposable QA state.');
} finally {
  for (const page of context.pages()) await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await context.close(); await browser.close();
}

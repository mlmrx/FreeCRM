import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
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
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel.getByRole('button', { name: 'Save and activate new version', exact: true })).toBeVisible();
  const overflow = await panel.evaluate((element) => element.scrollWidth - element.clientWidth);
  assert.ok(overflow <= 1, `Policy editor horizontally overflows its mobile container by ${overflow}px.`);
  await panel.screenshot({ path: fileURLToPath(new URL('mobile-current-policy.png', evidence)) });
  assert.equal(pageErrors.length, 0, 'Policy editor produced an uncaught browser error.');
  assert.equal(externalRequests, 0, 'Editor attempted an external request.');
  console.log('Policy editor browser smoke passed: keyboard disclosure/focus; real zero-write dry-run; safety changes and late responses clear stale previews without discarding drafts; ambiguous v1 save + competing v2 + exact retry shows current v2; revoked-grant removal and v3 save; mobile container reflow. Fictional agent/history remain only in disposable QA state.');
} finally {
  for (const page of context.pages()) await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await context.close(); await browser.close();
}

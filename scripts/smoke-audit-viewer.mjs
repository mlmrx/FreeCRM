import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

assert.equal(process.env.FREE_CRM_ROADMAP_QA, 'synthetic-disposable', 'Use only explicitly acknowledged disposable QA state.');
const base = new URL(process.env.FREE_CRM_BASE_URL || '');
assert.ok(base.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(base.hostname) && base.port && !base.username && !base.password && base.pathname === '/' && !base.search && !base.hash, 'An isolated literal-loopback origin is required.');
const bootstrap = await (await fetch(new URL('/api/v1/bootstrap', base))).json();
assert.equal(bootstrap.data.runtime.mode, 'device');
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, serviceWorkers: 'block', reducedMotion: 'reduce', locale: 'en-US' });
let external = 0;
await context.route('**/*', async (route) => {
  if (new URL(route.request().url()).origin !== base.origin) { external += 1; return route.abort(); }
  return route.continue();
});
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
try {
  await page.goto(new URL('/workspace', base).href);
  // Mobile navigation is intentionally collapsed; open its actual control.
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  await expect(menu).toBeVisible();
  await menu.click();
  await page.locator('button.nav-item').filter({ hasText: 'Settings' }).click();
  const panel = page.locator('section.panel').filter({ has: page.getByRole('heading', { name: 'Who changed what', exact: true }) });
  await expect(panel.getByRole('table')).toBeVisible();
  await panel.getByLabel('Action family', { exact: true }).fill('agent');
  await panel.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Apply filters', exact: true })).toBeEnabled();
  const actions = await panel.locator('tbody tr td:nth-child(3)').allTextContents();
  assert.ok(actions.length > 0 && actions.every((value) => value.startsWith('agent.')));
  const reflow = await page.evaluate(() => ({
    viewport: innerWidth, documentWidth: document.documentElement.scrollWidth,
    overflow: [...document.querySelectorAll('body *')].flatMap((element) => {
      const rect = element.getBoundingClientRect();
      if (!rect.width || rect.right <= innerWidth + 1) return [];
      const style = getComputedStyle(element);
      return [{ tag: element.tagName, className: element.className, left: rect.left, right: rect.right, width: rect.width, display: style.display, minWidth: style.minWidth, gridTemplateColumns: style.gridTemplateColumns, overflowX: style.overflowX, text: element.textContent?.trim().slice(0, 100) }];
    }).slice(0, 50),
  }));
  if (reflow.documentWidth - reflow.viewport > 1) {
    await mkdir('outputs', { recursive: true });
    await writeFile('outputs/audit-viewer-overflow.json', JSON.stringify(reflow, null, 2));
    await page.screenshot({ path: 'outputs/audit-viewer-overflow-390.png', fullPage: true });
  }
  assert.ok(reflow.documentWidth - reflow.viewport <= 1, 'Workspace audit view has page-level horizontal overflow.');
  const tableRegion = panel.getByRole('region', { name: 'Audit events. Scroll for all fields and events.', exact: true });
  assert.ok(await tableRegion.evaluate((element) => element.clientHeight <= innerHeight * 0.65 + 1));
  const exportButton = panel.getByRole('button', { name: 'Export page as CSV', exact: true });
  const bounds = await exportButton.boundingBox();
  assert.ok(bounds && bounds.height >= 44 && bounds.width >= 44);
  const download = page.waitForEvent('download');
  await exportButton.click();
  assert.equal((await download).suggestedFilename(), 'free-crm-audit-page.csv');
  await expect(panel.getByRole('status')).toContainText('refreshes one search page');
  await exportButton.focus();
  // Enter keyboard modality after the pointer-driven download. Programmatic
  // focus alone intentionally need not match :focus-visible after a click.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(exportButton).toBeFocused();
  assert.notEqual(await exportButton.evaluate((element) => getComputedStyle(element).outlineStyle), 'none');
  assert.equal(external, 0);
  assert.deepEqual(pageErrors, []);
  await panel.locator('header').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'outputs/audit-viewer-form-390.png' });
  await page.screenshot({ path: 'outputs/audit-viewer-390.png', fullPage: true });
  console.log('Audit viewer browser smoke passed: actual workspace Settings mount, applied action-family filter, mobile reflow, 44px export control, keyboard focus, private current-page CSV download; no external requests or page errors.');
} finally {
  await page.waitForLoadState('networkidle').catch(() => {});
  await context.close();
  await browser.close();
}

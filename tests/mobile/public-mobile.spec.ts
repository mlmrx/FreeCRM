import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures';

async function expectNoPageOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth), { message: 'No page-level horizontal overflow; local labelled scrollers remain allowed.' }).toBeLessThanOrEqual(1);
}

async function expectTouchTarget(locator: Locator) {
  await expect(locator).toBeVisible();
  const bounds = await locator.boundingBox();
  expect(bounds, 'The named control must have a layout box.').not.toBeNull();
  expect(bounds!.height, 'Control height must be at least 44 CSS pixels.').toBeGreaterThanOrEqual(44);
  expect(bounds!.width, 'Control width must be at least 44 CSS pixels.').toBeGreaterThanOrEqual(44);
}

for (const path of ['/', '/platform', '/tour', '/demo', '/glossary', '/insights', '/how-it-works']) {
  test(`public ${path} reflows in the mobile viewport`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /width=device-width/);
    await expectNoPageOverflow(page);
    // WebKit's desktop test build can report maxTouchPoints=0 despite touch
    // emulation. Verify its actual coarse-pointer media mode; taps below prove
    // touch interaction rather than relying on that platform-specific number.
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
  });
}

test('tour supports touch exploration with no private reads or writes', async ({ page }) => {
  await page.goto('/tour');
  const audiences = page.locator('[aria-label="Choose your audience"] button');
  await expect(audiences).toHaveCount(5);
  for (const audience of await audiences.all()) await expectTouchTarget(audience);
  await audiences.nth(3).tap();
  await expect(audiences.nth(3)).toHaveAttribute('aria-pressed', 'true');
  await expectNoPageOverflow(page);
  const search = page.getByRole('searchbox', { name: 'Search all tour features' });
  await expectTouchTarget(search);
  await search.fill('invoice');
  const features = page.getByRole('navigation', { name: 'Tour features' }).getByRole('button');
  await expect(features.first()).toBeVisible();
  await expectTouchTarget(features.first());
  await features.first().tap();
  await expect(features.first()).toHaveAttribute('aria-current', 'page');
  const reset = page.getByRole('button', { name: 'Reset demo', exact: true });
  await expectTouchTarget(reset);
  await reset.tap();
  await expect(page.getByRole('status')).toContainText('Tour reset.');
  await expectNoPageOverflow(page);
});

test('glossary supports keyboard activation and focusable alphabet navigation', async ({ page, browserName }) => {
  await page.goto('/glossary');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to glossary' });
  // WebKit's host keyboard preference can omit links from Tab traversal, even
  // in a blank HTML fixture. Do not change user/OS preferences or claim its
  // Tab order is proven here: test controlled focus + real Enter in that engine.
  // Chromium still proves the first Tab reaches the skip link unassisted.
  if (browserName === 'webkit') await skip.focus();
  await expect(skip).toBeFocused();
  expect(await skip.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
  await page.keyboard.press('Enter');
  await expect(page.locator('#glossary-content')).toBeFocused();
  const letter = page.getByRole('link', { name: 'Terms beginning with E', exact: true });
  await expectTouchTarget(letter);
  await letter.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#letter-e')).toBeFocused();
  await page.getByRole('link', { name: 'Emergency stop', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#emergency-stop')).toBeFocused();
});

for (const path of ['/', '/tour', '/demo']) {
  test(`reduced motion keeps ${path} content and controls while suppressing motion`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    const motion = await page.evaluate(() => {
      const exceedsLimit = (value: string) => value.split(',').some((part) => {
        const number = parseFloat(part);
        return (part.trim().endsWith('ms') ? number / 1000 : number) > 0.01;
      });
      return Array.from(document.querySelectorAll('body *')).flatMap((element) => {
        if (!element.getClientRects().length) return [];
        return [null, '::before', '::after'].flatMap((pseudo) => {
          const style = getComputedStyle(element, pseudo);
          if (pseudo && ['none', 'normal'].includes(style.content)) return [];
          const animated = style.animationName !== 'none' && style.animationPlayState !== 'paused' && exceedsLimit(style.animationDuration);
          return animated || exceedsLimit(style.transitionDuration) ? [`${element.tagName}${pseudo ?? ''}`] : [];
        });
      });
    });
    expect(motion, 'Reduced-motion mode must not keep material CSS animation or transitions.').toEqual([]);
    await expectNoPageOverflow(page);
  });
}

import type { Page } from '@playwright/test';
import { test, expect, isPrivatePath } from './fixtures';

async function controlledPublicPage(page: Page) {
  await page.goto('/tour');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect.poll(async () => {
    try {
      return await page.evaluate(async () => Boolean(navigator.serviceWorker?.controller)
        && (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated');
    } catch (error) {
      // The shipped lifecycle reloads once on controllerchange. An evaluation
      // interrupted by that expected navigation is not an activation failure;
      // poll the new document, while still surfacing every other error.
      if (error instanceof Error && error.message.includes('Execution context was destroyed')) return false;
      throw error;
    }
  }).toBe(true);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

async function cachePaths(page: Page) {
  return page.evaluate(async () => {
    const entries = await Promise.all((await caches.keys()).map(async (name) => (await (await caches.open(name)).keys()).map((request) => new URL(request.url).pathname)));
    return entries.flat();
  });
}

test('browser parses the install manifest and decodes its icon resources', async ({ page, context }) => {
  await controlledPublicPage(page);
  expect(await page.evaluate(() => isSecureContext)).toBe(true);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.json');
  const manifest = await page.evaluate(async () => {
    const response = await fetch('/manifest.json');
    if (!response.ok) throw new Error('Manifest fetch failed.');
    return response.json() as Promise<{ name: string; start_url: string; scope: string; display: string; prefer_related_applications: boolean; icons: { src: string; sizes: string; purpose: string }[] }>;
  });
  expect(manifest).toMatchObject({ start_url: '/workspace', scope: '/', display: 'standalone', prefer_related_applications: false });
  expect(manifest.name).toContain('FREE CRM');
  expect(manifest.icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
  for (const icon of manifest.icons) {
    expect(icon.src).toMatch(/^\/icon-[a-z0-9-]+\.svg$/);
    const dimensions = await page.evaluate(async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight };
    }, icon.src);
    expect(`${dimensions.width}x${dimensions.height}`).toBe(icon.sizes);
  }
  const session = await context.newCDPSession(page);
  const parsed = await session.send('Page.getAppManifest');
  expect(parsed.errors).toEqual([]);
  expect(JSON.parse(parsed.data ?? '{}').start_url).toBe('/workspace');
  // Browser install promotion also depends on engagement/platform policy. No fake
  // beforeinstallprompt event is used, and an OS install is not claimed here.
  await session.detach();
  expect((await cachePaths(page)).filter(isPrivatePath)).toEqual([]);
});

test('real service worker serves a public offline fallback without becoming offline CRM', async ({ page, context }) => {
  await controlledPublicPage(page);
  await expect.poll(() => cachePaths(page)).toContain('/offline.html');
  await page.goto('/how-it-works');
  await expect.poll(() => cachePaths(page)).toContain('/how-it-works');
  await context.setOffline(true);
  const cached = await page.goto('/how-it-works');
  expect(cached?.fromServiceWorker()).toBe(true);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('From first hello');
  const fallback = await page.goto('/insights/mobile-offline-fixture-not-a-real-article');
  expect(fallback?.fromServiceWorker()).toBe(true);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('You are offline.');
  await expect(page.getByText('FREE CRM never serves cached workspace or authentication responses.', { exact: false })).toBeVisible();
  expect((await cachePaths(page)).filter(isPrivatePath)).toEqual([]);
});

test('private HTML, auth and API bytes never enter Cache Storage and are not served offline', async ({ context, page, baseURL }) => {
  await controlledPublicPage(page);
  const privatePaths = ['/workspace', '/workspace/fixture', '/brain', '/today', '/auth/signin', '/api/auth/session', '/api/v1/bootstrap', '/api/v1/mobile-cache-fixture'];
  let offline = false;
  const served = new Set<string>();
  // BrowserContext interception also handles service-worker-owned network
  // requests. Nothing in these probes reaches the real workspace or API.
  await context.route((url) => url.origin === new URL(baseURL!).origin && isPrivatePath(url.pathname), async (route) => {
    if (offline) { await route.abort('internetdisconnected'); return; }
    const path = new URL(route.request().url()).pathname;
    served.add(path);
    await route.fulfill({ status: 200, contentType: 'text/html', headers: { 'Cache-Control': 'public, max-age=600' }, body: '<!doctype html><html><head><title>Synthetic private boundary probe</title></head><body><h1>Fictional private cache probe</h1></body></html>' });
  });
  for (const path of privatePaths) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    expect(response?.fromServiceWorker()).toBe(false);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fictional private cache probe');
  }
  expect([...served]).toEqual(privatePaths);
  const api = await page.evaluate(async () => (await fetch('/api/v1/mobile-cache-fixture')).text());
  expect(api).toContain('Fictional private cache probe');
  expect((await cachePaths(page)).filter(isPrivatePath)).toEqual([]);
  await page.goto('/tour');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  offline = true;
  await context.setOffline(true);
  const failedReads = await page.evaluate(async (paths) => Promise.all(paths.map(async (path) => {
    try { await fetch(path); return false; } catch { return true; }
  })), privatePaths);
  expect(failedReads).toEqual(privatePaths.map(() => true));
  expect((await cachePaths(page)).filter(isPrivatePath)).toEqual([]);
  // A cached public fallback must never mask an offline private navigation.
  await expect(page.goto('/workspace')).rejects.toThrow();
});

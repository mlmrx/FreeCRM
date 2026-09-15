import { defineConfig } from '@playwright/test';

function isolatedBrowserOrigin() {
  const value = process.env.FREE_CRM_BROWSER_BASE_URL?.trim();
  if (!value) throw new Error('Set FREE_CRM_BROWSER_BASE_URL to the isolated loopback test Worker; this suite never starts a server.');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('FREE_CRM_BROWSER_BASE_URL must be a valid literal-loopback HTTP origin.'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname)
    || !url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Mobile browser tests require a credential-free literal-loopback HTTP origin with an explicit port and no path, query, or fragment.');
  }
  return url.origin;
}

export default defineConfig({
  testDir: './tests/mobile',
  outputDir: './outputs/mobile-browser-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: 'line',
  use: {
    baseURL: isolatedBrowserOrigin(),
    hasTouch: true,
    isMobile: true,
    locale: 'en-US',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
    acceptDownloads: false,
    screenshot: 'off',
    trace: 'off',
    video: 'off',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [
    { name: 'chromium-small-320', testMatch: 'public-mobile.spec.ts', use: { browserName: 'chromium', viewport: { width: 320, height: 740 }, deviceScaleFactor: 2 } },
    { name: 'chromium-phone-390', testMatch: 'public-mobile.spec.ts', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 } },
    { name: 'webkit-phone-390', testMatch: 'public-mobile.spec.ts', use: { browserName: 'webkit', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 } },
    { name: 'webkit-tablet-768', testMatch: 'public-mobile.spec.ts', use: { browserName: 'webkit', viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2 } },
    // Playwright's service-worker inspection/routing APIs are Chromium-only.
    { name: 'chromium-pwa', testMatch: 'pwa-boundaries.spec.ts', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' } },
  ],
});

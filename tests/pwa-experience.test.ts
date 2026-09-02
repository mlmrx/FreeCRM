import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const manifest = JSON.parse(readFileSync(join(root, 'public', 'manifest.json'), 'utf8')) as {
  start_url: string;
  scope: string;
  display: string;
  display_override: string[];
  lang: string;
  categories: string[];
  icons: Array<{ src: string; sizes: string; purpose: string }>;
  shortcuts: Array<{ url: string }>;
};
const worker = readFileSync(join(root, 'public', 'sw.js'), 'utf8');
const lifecycle = readFileSync(join(root, 'app', 'pwa-lifecycle.tsx'), 'utf8');
const layout = readFileSync(join(root, 'app', 'layout.tsx'), 'utf8');

describe('safe installable PWA experience', () => {
  it('publishes complete local manifest metadata and dedicated any/maskable icons', () => {
    expect(manifest).toMatchObject({ start_url: '/workspace', scope: '/', display: 'standalone', lang: 'en-US' });
    expect(manifest.display_override).toContain('standalone');
    expect(manifest.categories).toEqual(expect.arrayContaining(['business', 'productivity']));
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: '/icon-192.svg', sizes: '192x192', purpose: 'any' }),
      expect.objectContaining({ src: '/icon-512.svg', sizes: '512x512', purpose: 'any' }),
      expect.objectContaining({ src: '/icon-maskable.svg', sizes: '512x512', purpose: 'maskable' }),
    ]));
    expect(manifest.shortcuts.map((shortcut) => shortcut.url)).toEqual(['/workspace', '/tour', '/deploy']);
    for (const icon of manifest.icons) expect(statSync(join(root, 'public', icon.src.slice(1))).size).toBeGreaterThan(300);
  });

  it('registers updates and installation while clearly reporting offline state', () => {
    expect(layout).toContain("import PwaLifecycle from './pwa-lifecycle'");
    expect(layout).toContain('<PwaLifecycle />');
    expect(lifecycle).toContain("register('/sw.js', { scope: '/', updateViaCache: 'none' })");
    expect(lifecycle).toContain("window.addEventListener('beforeinstallprompt'");
    expect(lifecycle).toContain("window.addEventListener('offline', notify)");
    expect(lifecycle).toContain('useSyncExternalStore(subscribeToNetworkState');
    expect(lifecycle).toContain("postMessage({ type: 'SKIP_WAITING' })");
    expect(lifecycle).toContain('Workspace, sign-in, and API requests always require the network.');
  });

  it('keeps workspace, authentication, and APIs network-only and caches only public UI', () => {
    expect(worker).toContain("const PRIVATE_PREFIXES = ['/workspace', '/api', '/auth']");
    expect(worker).toContain('if (url.origin !== self.location.origin || isPrivatePath(url.pathname)) return;');
    expect(worker).toContain("request.mode === 'navigate'");
    expect(worker).toContain("caches.match('/offline.html')");
    expect(worker).toContain("url.pathname.startsWith('/_next/static/')");
    expect(worker).toContain("event.data?.type === 'SKIP_WAITING'");
    expect(worker).not.toMatch(/caches\.open\([^)]*\)[\s\S]*put\(request[\s\S]*url\.pathname\.startsWith\('\/api\/'\)/);
    expect(readFileSync(join(root, 'public', 'offline.html'), 'utf8')).toContain('never serves cached workspace or authentication responses');
  });
});

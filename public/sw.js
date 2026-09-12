const CACHE = 'free-crm-public-v5';
const CORE = ['/offline.html', '/manifest.json', '/favicon.svg', '/icon-192.svg', '/icon-512.svg', '/icon-maskable.svg'];
const PRIVATE_PREFIXES = ['/workspace', '/brain', '/today', '/api', '/auth'];
const PUBLIC_PAGE_PREFIXES = ['/', '/how-it-works', '/platform', '/tour', '/deploy', '/contribute', '/insights', '/glossary'];

function isPrivatePath(pathname) {
  return PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isPublicPage(pathname) {
  return PUBLIC_PAGE_PREFIXES.some((prefix) => prefix === '/' ? pathname === '/' : pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function canCache(response) {
  return response.ok && response.type === 'basic';
}

async function publicNavigationFallback(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const fallback = await caches.match('/offline.html');
  if (!fallback || !canCache(fallback)) return Response.error();
  const finalUrl = new URL(fallback.url);
  if (finalUrl.origin !== self.location.origin || !['/offline.html', '/offline'].includes(finalUrl.pathname)) return Response.error();

  // Static hosts may redirect /offline.html to /offline. A followed-redirect
  // Response cannot satisfy a navigation's manual redirect mode. Reconstruct
  // only this known public document, retaining its CSP and content type. Fetch
  // has already decoded the body, so its wire encoding/length no longer apply.
  const headers = new Headers(fallback.headers);
  headers.delete('content-encoding');
  headers.delete('content-length');
  return new Response(fallback.body, { status: fallback.status, statusText: fallback.statusText, headers });
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isPrivatePath(url.pathname)) return;

  // Workspace, identity, and API traffic return above without respondWith and
  // therefore always use the network. Only explicitly public navigation may be
  // stored; no account-specific HTML can enter this cache.
  if (request.mode === 'navigate') {
    if (!isPublicPage(url.pathname)) return;
    event.respondWith(fetch(request).then(async (response) => {
      if (canCache(response)) await (await caches.open(CACHE)).put(request, response.clone());
      return response;
    }).catch(() => publicNavigationFallback(request)));
    return;
  }

  const cacheableAsset = url.pathname.startsWith('/_next/static/') || CORE.includes(url.pathname);
  if (!cacheableAsset) return;
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then(async (response) => {
    if (canCache(response)) await (await caches.open(CACHE)).put(request, response.clone());
    return response;
  })));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

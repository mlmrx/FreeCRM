const CACHE = 'free-crm-public-v4';
const CORE = ['/offline.html', '/manifest.json', '/favicon.svg', '/icon-192.svg', '/icon-512.svg', '/icon-maskable.svg'];
const PRIVATE_PREFIXES = ['/workspace', '/api', '/auth'];
const PUBLIC_PAGE_PREFIXES = ['/', '/how-it-works', '/platform', '/tour', '/deploy', '/contribute', '/insights'];

function isPrivatePath(pathname) {
  return PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isPublicPage(pathname) {
  return PUBLIC_PAGE_PREFIXES.some((prefix) => prefix === '/' ? pathname === '/' : pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function canCache(response) {
  return response.ok && response.type === 'basic';
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
    }).catch(async () => (await caches.match(request)) || (await caches.match('/offline.html'))));
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

/**
 * OpenSend v0.5.0 — Service Worker
 *
 * Cache-first for static assets, network-first for pages.
 * Versioned cache for reliable updates.
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `opensend-static-${CACHE_VERSION}`;
const FONT_CACHE = `opensend-fonts-${CACHE_VERSION}`;
const PAGE_CACHE = `opensend-pages-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/send',
  '/receive',
  '/fonts/NotoSansMath-Regular.ttf',
];

const FONT_URLS = [
  '/fonts/NotoSansMath-Regular.ttf',
];

// Install: precache static assets and fonts
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)),
      caches.open(FONT_CACHE).then((cache) => cache.addAll(FONT_URLS)),
    ]).then(() => self.skipWaiting())
  );
});

// Listen for skip-waiting messages
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('opensend-') && !k.endsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for static, network-first for navigations
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // API requests: network only, no cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request).catch(() => new Response(null, { status: 503 })));
    return;
  }

  // Fonts: cache-first
  if (url.pathname.startsWith('/fonts/')) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((res) => {
        const clone = res.clone();
        caches.open(FONT_CACHE).then((cache) => cache.put(request, clone));
        return res;
      }))
    );
    return;
  }

  // Static assets (images, icons, CSS, JS): cache-first
  if (
    url.pathname.startsWith('/_next/') ||
    url.pathname.match(/\.(svg|png|jpg|ico|json)$/)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((res) => {
        const clone = res.clone();
        caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
        return res;
      }))
    );
    return;
  }

  // Pages (HTML navigations): network-first, fallback to cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((res) => {
        const clone = res.clone();
        caches.open(PAGE_CACHE).then((cache) => cache.put(request, clone));
        return res;
      }).catch(() =>
        caches.match(request).then((cached) => cached || caches.match('/'))
      )
    );
    return;
  }

  // Default: network
  event.respondWith(fetch(request).catch(() => new Response(null, { status: 503 })));
});

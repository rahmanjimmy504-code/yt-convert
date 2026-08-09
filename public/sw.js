/* YT Convert service worker — offline-capable app shell + static caching.
 *
 * Strategy (deliberately conservative):
 *  - Navigations: network first, fall back to the cached home page offline.
 *  - /_next/static/* (content-hashed, immutable): cache first, populate on
 *    first visit.
 *  - /icon* assets: stale-while-revalidate.
 *  - Everything else (API calls, captcha, etc.): network only — never cache
 *    responses that contain user- or time-sensitive data.
 *
 * Bump VERSION to invalidate old caches after a deploy with breaking changes.
 */
const VERSION = 'v1';
const CACHE_NAME = `yt-convert-${VERSION}`;
const PRECACHE_URLS = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // App shell: always try the network first so users get fresh content, but
  // keep the last good home page so the app still opens offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('/', copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // Hashed static assets are immutable and cacheable forever.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(
        cached =>
          cached ||
          fetch(request).then(response => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
            return response;
          }),
      ),
    );
    return;
  }

  // Brand icons: serve cached instantly, refresh in the background.
  if (url.pathname === '/icon-192.png' || url.pathname === '/icon-512.png' || url.pathname === '/icon-maskable-512.png' || url.pathname === '/apple-touch-icon.png') {
    event.respondWith(
      caches.match(request).then(cached => {
        const network = fetch(request)
          .then(response => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
            return response;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
    return;
  }

  // API and other same-origin requests: never cached.
});

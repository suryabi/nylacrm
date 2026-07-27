/* Nyla CRM PWA service worker — SAFE mode.
   Deliberately does NOT cache app bundles/API responses (a caching SW caused
   stale-version bugs in the past — see /sw.js kill-switch history).
   Purpose: satisfy installability + show a friendly offline page.
   Strategy: navigations = network-first with offline.html fallback;
   only offline.html + icons are pre-cached. Everything else goes straight
   to the network, untouched. */

const CACHE = 'nyla-pwa-shell-v1';
const OFFLINE_URL = '/offline.html';
const PRECACHE = [
  OFFLINE_URL,
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // App navigations: always network-first (never a stale bundle), offline fallback.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () => {
        const cache = await caches.open(CACHE);
        return (await cache.match(OFFLINE_URL)) || Response.error();
      })
    );
    return;
  }

  // Static PWA shell assets only: cache-first.
  const url = new URL(req.url);
  if (url.origin === self.location.origin && (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.json')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req))
    );
  }
  // Everything else (JS/CSS bundles, API calls, images): direct to network.
});

// KILL-SWITCH SERVICE WORKER
// Bumped to v3-killswitch to force every browser to replace the old caching
// SW. On install we wipe every Cache Storage entry, then unregister ourselves.
// After this file ships, the next page load fetches all assets fresh from the
// network and there is NO service worker controlling the page anymore.
// We can re-introduce a caching SW later when truly needed.

self.addEventListener('install', (event) => {
  // Activate immediately, don't wait for old SW to release control.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 1. Wipe every cache under this origin.
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => caches.delete(name)));

    // 2. Take over open tabs immediately.
    await self.clients.claim();

    // 3. Unregister this SW so future requests bypass it entirely.
    await self.registration.unregister();

    // 4. Force a hard reload of every controlled tab so they fetch the new
    //    bundle without an SW intercepting.
    const allClients = await self.clients.matchAll({ type: 'window' });
    for (const client of allClients) {
      try { client.navigate(client.url); } catch (e) { /* ignore */ }
    }
  })());
});

// While this SW is briefly alive, never serve from cache — always go to
// network. This handles the brief window between activate and unregister
// where the SW might still intercept fetches.
self.addEventListener('fetch', (event) => {
  // Let the browser handle it directly (no respondWith).
  return;
});

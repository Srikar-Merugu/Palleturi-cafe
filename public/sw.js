/* Palleturi Cafe service worker: shows order notifications on the owner's phone. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Palleturi Cafe', {
    body: d.body || '',
    icon: '/assets/icon-192.png',
    badge: '/assets/badge.png',
    tag: d.tag,
    data: { url: d.url || '/' },
    vibrate: [120, 60, 120],
  }));
});

// Tapping a notification opens the app on that table (or focuses it if already open).
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) {
        await w.focus();
        try { await w.navigate(url); } catch (err) { w.postMessage({ open: url }); }
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});

/**
 * Service worker — push delivery only. It deliberately does NOT cache anything.
 *
 * A cache would be actively harmful here: participants must always run the build
 * we think they are running (APP_VERSION is stamped onto every trial row), and a
 * stale cached bundle would silently mislabel a whole batch of data. So every
 * request goes to the network exactly as it would without a service worker, and
 * this file exists solely because iOS will not deliver a web push without one.
 *
 * On iOS, push is delivered only to a site the participant has added to their
 * home screen — Safari in an ordinary tab never receives it. See src/lib/push.js.
 */

self.addEventListener('install', () => {
  // Take over immediately; there is no cache to migrate.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  // The server sends JSON; a payload-less push (or malformed one) still has to
  // produce a notification, because iOS revokes push permission from a site that
  // receives a push and shows nothing.
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Time for a training session';
  const options = {
    body: payload.body || 'Tap to start your next set of trials.',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    // One reminder at a time: a later push replaces the earlier one rather than
    // stacking six unread reminders on the lock screen.
    tag: payload.tag || 'nla-reminder',
    renotify: true,
    data: { url: payload.url || './' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './', self.registration.scope).href;

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Reuse an open window if there is one — the participant is already signed
      // in there, so tapping the notification lands them straight in the app.
      for (const client of clients) {
        if (client.url.startsWith(self.registration.scope)) {
          await client.focus();
          if ('navigate' in client) await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

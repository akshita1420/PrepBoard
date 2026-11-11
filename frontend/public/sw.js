self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload;

  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = {
      title: 'prepboard',
      body: event.data
        ? event.data.text()
        : 'Keep your streak alive.',
    };
  }

  const options = {
    body: payload.body || 'Keep your streak alive.',
    tag: 'prep-tracker-nudge',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [100, 50, 100],
    data: {
      url: '/',
    },
  };

  event.waitUntil(
    self.registration.showNotification(
      payload.title || 'prepboard',
      options
    )
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    }).then((clientList) => {
      for (const client of clientList) {
        if (
          client.url.includes(self.location.origin) &&
          'focus' in client
        ) {
          return client.focus();
        }
      }

      return clients.openWindow('/');
    })
  );
});
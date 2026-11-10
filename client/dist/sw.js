// XMessenger PWA Service Worker (Automated Build Stamping)
const BUILD_VERSION = 'vmwa2r74z-20261110';
const CACHE_NAME = 'xmessenger-' + BUILD_VERSION;

const PRECACHE_ASSETS = [
  '/manifest.json',
  '/shield.svg',
  '/shield.svg?v=2.2.0',
  '/icon-192.png',
  '/icon-192.png?v=2.2.0',
  '/icon-512.png',
  '/icon-512.png?v=2.2.0',
  '/icon-512-maskable.png',
  '/icon-512-maskable.png?v=2.2.0',
  '/apple-touch-icon.png',
  '/apple-touch-icon.png?v=2.2.0'
];

self.addEventListener('install', (event) => {
  // Force this new service worker to become the active worker immediately without waiting
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Precache non-fatal warning:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Purging old cache version:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Immediate skip waiting or cache purge on message from client
self.addEventListener('message', (event) => {
  if (event.data) {
    if (event.data.type === 'SKIP_WAITING') {
      self.skipWaiting();
    }
    if (event.data.type === 'PURGE_CACHE') {
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
    }
  }
});

// -------------------------------------------------------------
// Web Push Notifications Event Handlers (PWA & Web)
// -------------------------------------------------------------
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'XMessenger', body: event.data.text() };
    }
  }

  const title = data.title || 'XMessenger';

  // Detect iOS WebKit environment to prevent unsupported NotificationOptions errors
  const isIOS = (typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)) ||
                (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const options = {
    body: data.body || 'شما یک پیام جدید دارید',
    icon: data.icon || '/icon-192.png',
    data: data.data || { url: '/' },
    tag: data.tag || 'xmessenger-new-message',
    renotify: true
  };

  // Only apply vibrate & badge on non-iOS browsers (iOS WebKit throws or degrades if present)
  if (!isIOS) {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      options.vibrate = [150, 80, 150];
    }
    if (data.badge) {
      options.badge = data.badge;
    }
  }

  event.waitUntil(
    self.registration.showNotification(title, options).catch((err) => {
      console.warn('[SW] showNotification fallback triggered:', err);
      return self.registration.showNotification(title, {
        body: data.body || 'شما یک پیام جدید دارید'
      });
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Bypass API, WebSocket, and uploads completely (never intercept or cache)
  if (
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/socket.io') ||
    url.pathname.startsWith('/uploads')
  ) {
    return;
  }

  // 2. Service worker itself, manifest, and version.json must NEVER be served from cache
  if (
    url.pathname === '/sw.js' || 
    url.pathname === '/manifest.json' || 
    url.pathname === '/version.json'
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 3. Navigation & HTML Document requests: STRICT NETWORK-FIRST
  // Critical for iOS/Android standalone PWAs where mode may be 'same-origin' or empty
  const isHtmlRequest =
    event.request.mode === 'navigate' ||
    event.request.destination === 'document' ||
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html'));

  if (isHtmlRequest) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        })
        .catch(async () => {
          // Offline fallback when network is completely unavailable
          const cached = await caches.match(event.request);
          if (cached) return cached;
          const rootCached = await caches.match('/');
          if (rootCached) return rootCached;
          return caches.match('/index.html');
        })
    );
    return;
  }

  // 4. Icons & Brand Assets: Network-first to prevent stale icon caching
  const isIconRequest = 
    url.pathname.includes('icon') ||
    url.pathname.includes('apple-touch') ||
    url.pathname.endsWith('.svg');

  if (isIconRequest) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 5. Static Assets (Hashed JS/CSS, images, fonts)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const copy = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return networkResponse;
      });
    })
  );
});

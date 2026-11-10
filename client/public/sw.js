// XMessenger PWA Service Worker (Automated Build Stamping)
const BUILD_VERSION = '__BUILD_TIMESTAMP__';
const CACHE_NAME = 'xmessenger-' + BUILD_VERSION;

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/shield.svg',
  '/shield.svg?v=2.2.2',
  '/icon-192.png',
  '/icon-192.png?v=2.2.2',
  '/icon-512.png',
  '/icon-512.png?v=2.2.2',
  '/icon-512-maskable.png',
  '/icon-512-maskable.png?v=2.2.2',
  '/apple-touch-icon.png',
  '/apple-touch-icon.png?v=2.2.2'
];

// Helper to safely cache a response without throwing unhandled rejections
function safeCachePut(cacheName, request, response) {
  if (
    !request ||
    request.method !== 'GET' ||
    (!request.url.startsWith('http://') && !request.url.startsWith('https://')) ||
    !response ||
    response.status !== 200
  ) {
    return;
  }
  const copy = response.clone();
  caches.open(cacheName)
    .then((cache) => cache.put(request, copy))
    .catch(() => {});
}

self.addEventListener('install', (event) => {
  // Force this new service worker to become the active worker immediately without waiting
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Precache assets individually so a single missing asset or temporary glitch never aborts installation
      await Promise.allSettled(
        PRECACHE_ASSETS.map((asset) =>
          cache.add(asset).catch((err) => {
            console.warn(`[SW] Precache skipped for ${asset}:`, err?.message || err);
          })
        )
      );
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
  // 0. Only handle HTTP and HTTPS requests.
  // CRITICAL: Extension requests (chrome-extension://, moz-extension://), blob:, data:, etc.
  // must NEVER be intercepted or passed to the Cache API, which throws TypeError on unsupported schemes.
  if (!event.request.url.startsWith('http://') && !event.request.url.startsWith('https://')) {
    return;
  }

  let url;
  try {
    url = new URL(event.request.url);
  } catch (e) {
    return;
  }

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
    event.respondWith(
      fetch(event.request).catch(() => new Response('', { status: 503, statusText: 'Service Unavailable' }))
    );
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
            safeCachePut(CACHE_NAME, event.request, networkResponse);
          }
          return networkResponse;
        })
        .catch(async () => {
          // Offline fallback when network is completely unavailable or restarting
          try {
            const cached = await caches.match(event.request);
            if (cached) return cached;
            const rootCached = await caches.match('/');
            if (rootCached) return rootCached;
            const indexCached = await caches.match('/index.html');
            if (indexCached) return indexCached;
          } catch (e) {}

          // Fallback Response: NEVER allow event.respondWith to resolve to undefined or reject!
          return new Response(
            '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>XMessenger</title><style>body{background:#0E1218;color:#e5e7eb;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;direction:rtl;text-align:center;padding:24px;box-sizing:border-box}h2{font-size:1.25rem;margin-bottom:8px;color:#f3f4f6}p{font-size:0.95rem;color:#9ca3af;margin-top:0}button{background:#d97706;color:#ffffff;border:none;padding:10px 24px;border-radius:12px;font-weight:600;font-size:0.95rem;margin-top:16px;cursor:pointer;-webkit-tap-highlight-color:transparent}button:hover{background:#b45309}</style></head><body><div><h2>در حال اتصال به سامانه...</h2><p>ارتباط با سرور برقرار نشد. لطفاً چند لحظه دیگر صفحه را بازنشانی کنید.</p><button onclick="location.reload()">تلاش مجدد</button></div></body></html>',
            {
              status: 503,
              statusText: 'Service Unavailable',
              headers: { 'Content-Type': 'text/html; charset=utf-8' }
            }
          );
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
            safeCachePut(CACHE_NAME, event.request, networkResponse);
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          return new Response('', { status: 404, statusText: 'Not Found' });
        })
    );
    return;
  }

  // 5. Static Assets (Hashed JS/CSS, images, fonts)
  event.respondWith(
    caches.match(event.request)
      .then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((networkResponse) => {
          if (
            networkResponse && 
            networkResponse.status === 200 && 
            (networkResponse.type === 'basic' || networkResponse.type === 'cors')
          ) {
            safeCachePut(CACHE_NAME, event.request, networkResponse);
          }
          return networkResponse;
        }).catch(() => {
          return new Response('', { status: 408, statusText: 'Request Timeout' });
        });
      })
      .catch(() => {
        return new Response('', { status: 503, statusText: 'Service Unavailable' });
      })
  );
});

// SK Federation Talibon — Service Worker
// Handles offline caching and push notifications

const CACHE_NAME = 'sk-talibon-v1';
const OFFLINE_URL = '/';

// Files to cache for offline use
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/admin.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  'https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js'
];

// ── INSTALL ──────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS.map(url => {
        return new Request(url, { cache: 'reload' });
      })).catch(err => {
        console.warn('[SW] Some assets failed to cache:', err);
      });
    })
  );
  self.skipWaiting();
});

// ── ACTIVATE ──────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        })
      )
    )
  );
  self.clients.claim();
});

// ── FETCH ──────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, Supabase API calls, chrome-extension
  if (request.method !== 'GET') return;
  if (url.hostname.includes('supabase.co')) return;
  if (url.protocol === 'chrome-extension:') return;

  // Network-first for navigation (fresh content when online)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cache fresh copy
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => {
          // Offline — serve cached version
          return caches.match(request)
            .then(cached => cached || caches.match(OFFLINE_URL));
        })
    );
    return;
  }

  // Cache-first for static assets
  if (request.destination === 'style' ||
      request.destination === 'script' ||
      request.destination === 'image' ||
      request.destination === 'font') {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        }).catch(() => cached);
      })
    );
    return;
  }
});

// ── PUSH NOTIFICATIONS ───────────────────────────────
self.addEventListener('push', event => {
  let data = { title: 'SK Federation Talibon', body: 'New update from SK Federation.', icon: '/icon-192.png' };
  
  if (event.data) {
    try { data = { ...data, ...event.data.json() }; }
    catch(e) { data.body = event.data.text(); }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    tag: 'sk-notification',
    renotify: true,
    data: { url: data.url || '/' },
    actions: [
      { action: 'view', title: '👁️ View', icon: '/icon-192.png' },
      { action: 'close', title: '✕ Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ── NOTIFICATION CLICK ───────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'close') return;

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        // Focus existing window if open
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(urlToOpen);
            return client.focus();
          }
        }
        // Open new window
        if (clients.openWindow) return clients.openWindow(urlToOpen);
      })
  );
});

// ── BACKGROUND SYNC ──────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-feedback') {
    event.waitUntil(syncPendingFeedback());
  }
});

async function syncPendingFeedback() {
  // Future: sync any offline feedback submissions
  console.log('[SW] Background sync triggered');
}

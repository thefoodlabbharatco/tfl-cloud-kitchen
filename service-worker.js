const CACHE_NAME = 'tfl-cache-v9';
const ASSETS_TO_CACHE = [
  './',
  './admin',
  './index.html',
  './admin.html',
  './style.css',
  './customer.css',
  './admin.css',
  './db.js',
  './customer.js',
  './admin.js',
  './manifest.json',
  './tfl_logo.png',
  './tfl_hero.png',
  'https://unpkg.com/lucide@latest',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching app shell...');
      return Promise.allSettled(
        ASSETS_TO_CACHE.map((url) => {
          return cache.add(url).catch((err) => {
            console.warn(`[Service Worker] Failed to cache: ${url}`, err);
          });
        })
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.registration.navigationPreload ? self.registration.navigationPreload.enable() : Promise.resolve(),
      caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Clearing old cache...', cache);
            return caches.delete(cache);
          }
        })
      );
      })
    ]).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Skip sync endpoints, Supabase realtime/API calls, and non-GET requests.
  if (
    event.request.method !== 'GET' ||
    url.searchParams.has('action') ||
    url.hostname.includes('supabase.co')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 2. Network-First Strategy for HTML pages (so updates propagate immediately)
  if (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) {
    const networkResponse = event.preloadResponse.then((preload) => preload || fetch(event.request));
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('HTML network timeout')), 1500));
    event.respondWith(
      Promise.race([networkResponse, timeout])
        .then((response) => {
          const responseCopy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseCopy));
          return response;
        })
        .catch(() => caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          return caches.match('./index.html');
        }))
    );
    return;
  }

  // 3. Stale-while-revalidate for static resources. Repeat visits stay instant.
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((response) => {
        if (!response || response.status !== 200) {
          return response;
        }
        const responseCopy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseCopy));
        return response;
      }).catch((err) => {
        console.warn(`[Service Worker] Fetch failed for: ${event.request.url}`, err);
        if (event.request.destination === 'image') {
          return caches.match('./tfl_logo.png');
        }
      });

      if (cachedResponse) {
        event.waitUntil(fetchPromise);
        return cachedResponse;
      }
      return fetchPromise;
    })
  );
});

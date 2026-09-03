const CACHE = 'pulse-v16';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/firebase-config.js',
  './js/firebase-init.js',
  './js/firebase-auth.js',
  './js/firebase-sync.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './assets/deploy-guide/01-select-repo.png',
  './assets/deploy-guide/02-builds-tab.png',
  './assets/deploy-guide/03-branch-dropdown.png',
  './assets/deploy-guide/04-select-build.png',
  './assets/deploy-guide/05-build-number-comment.png',
  './assets/deploy-guide/06-package-json.png',
  './assets/deploy-guide/07-dockerfile.png',
  './assets/deploy-guide/08-release-build-success.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Let cross-origin requests (Firestore's real-time channel, Firebase/Google Fonts CDNs)
  // pass through untouched — intercepting streaming connections can break live sync.
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE).then((cache) => cache.put(e.request, clone));
          }
          return networkResponse;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

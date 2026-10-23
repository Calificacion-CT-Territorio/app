const CACHE_NAME = 'calificacion-ct-v2';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
  'https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600;700;800&display=swap'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

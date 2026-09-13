// Автообновляемый Service Worker — без ручных версий.
const CACHE = 'schedule-runtime-v2';

self.addEventListener('install', e => {
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  if (url.origin !== location.origin) return;
  if (req.method !== 'GET') return;

  // ЕДИНАЯ стратегия: network-first для всего.
  // Онлайн всегда тянем свежее; кэш — только офлайн-запаска.
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
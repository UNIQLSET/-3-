// Автообновляемый Service Worker — без ручных версий.
const CACHE = 'schedule-runtime-v1';

self.addEventListener('install', e => {
  // Ничего не precache-им принудительно — просто активируемся.
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

  // Только свой origin
  if (url.origin !== location.origin) return;
  // Не трогаем не-GET
  if (req.method !== 'GET') return;

  // HTML и JS/CSS/JSON — network-first: всегда пробуем сеть,
  // кэш только как офлайн-запаска.
  const isCode =
    req.mode === 'navigate' ||
    /\.(html|js|css|json|webmanifest)$/i.test(url.pathname) ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isCode) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Картинки — stale-while-revalidate: отдаём из кэша, но фоном тянем свежую.
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(req).then(cached => {
        const network = fetch(req)
          .then(res => {
            cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    )
  );
});
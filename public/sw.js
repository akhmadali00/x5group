// x5group service worker: faqat ilova qobig'ini (HTML/JS/CSS/ikonlar) keshlaydi.
// /api/* (ma'lumotlar, sessiya) HECH QACHON keshlanmaydi.
const CACHE = 'x5-shell-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return;
  const hashed = url.pathname.startsWith('/_next/static/');
  if (hashed) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => { const c = res.clone(); caches.open(CACHE).then((x) => x.put(req, c)); return res; }))
    );
    return;
  }
  // qolgan hammasi: avval tarmoq, tarmoq yo'q bo'lsa kesh
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok && (req.mode === 'navigate' || /^\/(app|icons)\//.test(url.pathname))) { const c = res.clone(); caches.open(CACHE).then((x) => x.put(req, c)); }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('/') : undefined) || new Response('Internet yo\'q', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } })))
  );
});

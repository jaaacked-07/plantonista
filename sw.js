const VERSION = 'plantonista-v3';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png', './favicon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) return;
  if (r.mode === 'navigate' || u.pathname.endsWith('/') || u.pathname.endsWith('index.html')) {
    e.respondWith(fetch(r).then(res => { const c = res.clone(); caches.open(VERSION).then(x => x.put('./index.html', c)); return res; }).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => { const c = res.clone(); caches.open(VERSION).then(x => x.put(r, c)); return res; })));
});

/* ---------- Notificações (Web Push) ---------- */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: 'Plantonista', body: e.data ? e.data.text() : '' }; }
  if (d.badge !== undefined && self.navigator.setAppBadge) {
    const n = parseInt(d.badge, 10) || 0;
    (n ? self.navigator.setAppBadge(n) : self.navigator.clearAppBadge()).catch(() => {});
  }
  e.waitUntil(self.registration.showNotification(d.title || 'Plantonista', {
    body: d.body || '', icon: 'icon-192.png', badge: 'favicon.png',
    tag: d.tag || 'plantonista', renotify: true, data: { view: d.view || '' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const view = (e.notification.data || {}).view || '';
  const url = './' + (view ? '#' + view : '');
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) { if ('focus' in c) { c.navigate && view && c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});

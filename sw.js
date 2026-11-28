const VERSION = 'plantonista-v13';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png', './favicon.png'];

self.addEventListener('install', e => {
  // cache: 'reload' garante que a cópia salva é a versão nova, não uma antiga guardada pelo navegador
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  const sdk = u.hostname === 'www.gstatic.com' && u.pathname.startsWith('/firebasejs/');
  if (u.origin !== location.origin && !sdk) return;
  if (u.pathname.endsWith('version.json')) return; // sempre da internet: é o que avisa que há versão nova
  if (r.mode === 'navigate' || u.pathname.endsWith('/') || u.pathname.endsWith('index.html')) {
    // versão mais nova da internet (até 4 s); sem internet ou lenta, abre a cópia salva
    e.respondWith((async () => {
      const c = await caches.open(VERSION);
      const net = fetch(r, { cache: 'no-store' }).then(res => { if (res && res.ok) c.put('./index.html', res.clone()); return res; });
      try { const res = await Promise.race([net, new Promise(ok => setTimeout(() => ok(null), 4000))]); if (res) return res; } catch (_) {}
      const hit = await c.match('./index.html');
      if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
      try { return await net; } catch (_) { return new Response('Sem conexão', { status: 503 }); }
    })());
    return;
  }
  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(r);
    const net = fetch(r).then(res => { if (res && (res.ok || res.type === 'opaque')) c.put(r, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
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

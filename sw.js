// sw.js — Vyn Service Worker
// Gerencia cache offline e notificações push

const CACHE_NAME = 'vyn-v12.8';
const CACHE_URLS = [
  './login.html',
  './pages/dashboard.html',
  './pages/movements.html',
  './pages/mobile.html',
  './pages/card-bills.html',
  './pages/registrations.html',
  './css/variables.css',
  './css/base.css',
  './css/layout.css',
  './css/components.css',
  './css/mobile.css',
  './css/navigation.css',
  './css/editorial.css',
  './js/navigation.js',
  './js/iconSprite.js',
  './js/supabaseClient.js',
  './js/utils.js',
  './js/router.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Hosts de CDN que podem ser cacheados em runtime (supabase-js, Chart.js, fontes)
const CDN_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

// ── Instalação ────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CACHE_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

// ── Ativação ──────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────
self.addEventListener('fetch', e => {
  // Não interceptar APIs externas
  if(e.request.url.includes('supabase.co') ||
     e.request.url.includes('api.anthropic') ||
     e.request.url.includes('brapi.dev') ||
     e.request.url.includes('awesomeapi') ||
     e.request.method !== 'GET') return;

  const url = new URL(e.request.url);
  const isHTML = url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname === '';
  const isJS   = url.pathname.endsWith('.js');
  const isCDN  = CDN_HOSTS.includes(url.hostname);

  if (isHTML || (isJS && !isCDN)) {
    // Network-first para HTML e JS próprios: JS é servido com no-store pelo
    // Vercel — servir cache-first aqui congelava os módulos pré-cacheados
    // até o próximo bump de CACHE_NAME. Cache vira só fallback offline.
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  } else if (isCDN) {
    // CDN (supabase-js pinado, Chart.js versionado, fontes): cache-first com
    // gravação em runtime — habilita offline real para as libs externas
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      }))
    );
  } else {
    // Cache-first para assets estáticos (CSS com ?v=, ícones)
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
  }
});

// ── Notificações Push (via postMessage do app) ────────
self.addEventListener('message', e => {
  if(e.data?.type === 'SHOW_NOTIFICATION') {
    const { title, body, icon, badge, tag, data } = e.data;
    e.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon:  icon  || './icons/icon-192.png',
        badge: badge || './icons/icon-192.png',
        tag:   tag   || 'finzen-notif',
        data:  data  || {},
        vibrate: [200, 100, 200],
        requireInteraction: false,
      })
    );
  }
});

// ── Clique na notificação ─────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || './pages/dashboard.html';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Focar janela existente se aberta
      for(const client of clientList) {
        if(client.url.includes('finzen') && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Abrir nova janela
      if(clients.openWindow) return clients.openWindow(url);
    })
  );
});

// ── Alarmes agendados (via setTimeout no SW) ──────────
// O SW recebe a lista de alertas e os dispara no horário certo
self.addEventListener('message', e => {
  if(e.data?.type === 'SCHEDULE_ALERTS') {
    const alertas = e.data.alertas || [];
    alertas.forEach(alerta => {
      const msAte = new Date(alerta.dataHora).getTime() - Date.now();
      if(msAte > 0 && msAte < 24 * 60 * 60 * 1000) { // máx 24h
        setTimeout(() => {
          self.registration.showNotification(alerta.title, {
            body:    alerta.body,
            icon:    './icons/icon-192.png',
            badge:   './icons/icon-192.png',
            tag:     alerta.tag || 'finzen-alerta',
            data:    { url: alerta.url || './pages/dashboard.html' },
            vibrate: [200, 100, 200],
          });
        }, msAte);
      }
    });
  }
});

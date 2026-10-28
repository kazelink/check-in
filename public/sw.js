const VERSION = 'v1';
const SHELL_CACHE = `shell-${VERSION}`;
const ASSET_CACHE = `assets-${VERSION}`;

const SHELL = [
  '/app.html',
  '/app.css',
  '/manifest.webmanifest',
  // 新增/删除 public/modules 下的文件时，此清单要同步更新
  '/modules/app.js',
  '/modules/ctx.js',
  '/modules/util.js',
  '/modules/icons.js',
  '/modules/ui.js',
  '/modules/auth.js',
  '/modules/store.js',
  '/modules/planner.js',
  '/modules/notes.js',
  '/modules/note-format.js',
  '/modules/note-editor.js',
  '/modules/calendar.js',
  '/modules/stats.js',
  '/assets/squire.mjs',
  '/assets/sweetalert2.all.min.js',
  '/assets/lunar-1.7.7.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => Promise.all(
        SHELL.map((url) => cache.add(url).catch(() => console.warn('precache skipped:', url)))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put('/app.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('/app.html').then((cached) => cached || Response.error()))
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

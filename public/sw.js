// service worker：静态资源可离线打开，接口请求永不缓存
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
      .then((cache) => cache.addAll(SHELL))
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
  // 接口与备份永远走网络，不参与缓存
  if (url.pathname.startsWith('/api/')) return;

  // 导航请求：网络优先，断网时回退缓存的页面壳
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put('/app.html', copy));
          return response;
        })
        .catch(() => caches.match('/app.html'))
    );
    return;
  }

  // 第三方库：先用缓存，后台静默更新
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

  // 应用代码与样式：网络优先，保证部署后立即生效；断网回退缓存
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

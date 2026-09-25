// sw.js — service worker: precached app shell, cache-first assets, network-first HTML, versioned updates.
// Bump CACHE_VERSION on every deploy so clients pick up the new files.
const CACHE_VERSION = 'ttt-v1.1.0';

// Every URL is relative to this file, so the worker works from any sub-path (GitHub Pages project sites).
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/tokens.css',
  './css/base.css',
  './css/components.css',
  './css/animations.css',
  './css/cursor.css',
  './js/main.js',
  './js/pwa.js',
  './js/engine/board.js',
  './js/engine/rules.js',
  './js/engine/ai.js',
  './js/state/store.js',
  './js/state/storage.js',
  './js/ui/screens.js',
  './js/ui/render.js',
  './js/ui/hud.js',
  './js/ui/effects.js',
  './js/ui/cursor.js',
  './js/ui/theme.js',
  './js/ui/audio.js',
  './js/ui/panels.js',
  './js/features/achievements.js',
  './js/features/stats.js',
  './js/features/share.js',
  './js/features/shortcuts.js',
  './assets/icons/favicon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // Cache each file individually so one missing optional asset never blocks installation.
    await Promise.allSettled(SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('ttt-') && k !== CACHE_VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

const isNavigation = (request) => request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isNavigation(request)) {
    // HTML: network first so deployments show up, cached shell when offline.
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(CACHE_VERSION);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch {
        const cache = await caches.open(CACHE_VERSION);
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Everything else: cache first, then network (and remember it).
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(request);
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    } catch {
      return Response.error();
    }
  })());
});

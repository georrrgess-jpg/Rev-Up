/* Rev Up service worker — generated at build time from src/sw/sw-template.js.
 * Precaches one immutable revision of the app. Updates wait until the page asks
 * (after saving, on a safe screen), so HTML and hashed assets never mix versions. */
const VERSION = '14d2e9785b0a';
const SCOPE = '/Rev-Up/';
const PREFIX = 'revup:' + SCOPE + ':';
const CACHE = PREFIX + VERSION;
const ASSETS = ["./","assets/barlow-latin-400-normal-qiz4-Cze.woff2","assets/barlow-latin-600-normal-DILqtrty.woff2","assets/barlow-latin-800-normal-s1sAMnoV.woff2","assets/index-CawAoKKj.js","assets/index-JLD-hJ-f.css","assets/intro-C_wNAcrT.css","assets/intro-DTgEKp6g.js","icons/apple-touch-icon.png","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png","icons/icon.svg","manifest.webmanifest","index.html"];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS.map((a) => new Request(a, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      // Only ever touch Rev Up caches for this scope.
      await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((c) => c.postMessage({ type: 'READY', version: VERSION }));
    })(),
  );
});

self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'SKIP_WAITING') self.skipWaiting();
  if (msg.type === 'VERSION' && event.source) event.source.postMessage({ type: 'VERSION', version: VERSION, ready: true });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const scopePath = new URL(self.registration.scope).pathname;
  if (!url.pathname.startsWith(scopePath)) return;
  if (url.pathname.endsWith('/version.json')) return; // always network, used to check for updates
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (req.mode === 'navigate') {
        const hit = await cache.match('index.html');
        if (hit) return hit;
        return fetch(req);
      }
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        return await fetch(req);
      } catch (e) {
        return new Response('', { status: 504, statusText: 'Offline' });
      }
    })(),
  );
});

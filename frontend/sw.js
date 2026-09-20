/* Just enough of a service worker to make the site installable as an app
   (that's a hard requirement of the browser install prompt) and to let the
   static shell load instantly on a repeat visit. It never touches the
   backend: every request that isn't for one of this site's own static
   files is left completely alone, so search results are always fresh and
   never served from a cache. Bump CACHE_VERSION when the shell files
   change so old visitors pick up the new ones instead of a stale cache. */

'use strict';

const CACHE_VERSION = 'word-extractor-v1';

const SHELL_FILES = [
  './',
  'index.html',
  'css/styles.css',
  'js/config.js',
  'js/store.js',
  'js/api.js',
  'js/voice.js',
  'js/ui.js',
  'js/reader.js',
  'js/app.js',
  'manifest.webmanifest',
  'assets/favicon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(
        names.filter((name) => name !== CACHE_VERSION).map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only ever intercept our own static files. Anything cross-origin (the
  // Render backend, Wikipedia, Google Fonts) or not a plain GET is left to
  // the network exactly as if this service worker did not exist.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => cached);

      // Cache-first for instant loads; the network fetch still runs in the
      // background and refreshes the cache for next time.
      return cached || network;
    })
  );
});

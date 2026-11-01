/* Service worker de « On mange quoi ? ».
 * Ce fichier est un modèle : la compilation (vite.config.js) y injecte le
 * numéro de version et la liste des fichiers, puis l'écrit dans dist/sw.js.
 *
 * Stratégie :
 *  - à l'installation, tous les fichiers de la version sont mis en cache ;
 *  - l'app est servie depuis le cache (fonctionne hors ligne) ;
 *  - quand une nouvelle version est déployée, le navigateur détecte que
 *    sw.js a changé et installe la nouvelle version en arrière-plan ; l'app
 *    propose alors « Mettre à jour » (message SKIP_WAITING) ;
 *  - les anciens caches sont supprimés à l'activation.
 */
const VERSION = '__VERSION__';
const CACHE = `omq-${VERSION}`;
const PRECACHE = __PRECACHE__;
const INDEX_URL = new URL('index.html', self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((p) => new Request(p, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('omq-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'GET_VERSION') event.source?.postMessage({ type: 'VERSION', version: VERSION });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // Application monopage : toute navigation renvoie index.html (en cache).
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(INDEX_URL);
        if (cached) return cached;
        try {
          return await fetch(req);
        } catch {
          return new Response('Hors ligne', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok && url.pathname.startsWith(new URL(self.registration.scope).pathname)) {
        cache.put(req, res.clone());
      }
      return res;
    })(),
  );
});

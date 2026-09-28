/**
 * PWA pieces that are generated rather than built: the manifest and the service
 * worker. Plain strings with no filesystem access, so the Node server
 * (static.ts) and the Cloudflare Worker (worker/index.ts) serve the same thing.
 */

export function manifestJson(name: string, description: string): string {
  return JSON.stringify({
    name,
    short_name: name,
    description,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'any',
    background_color: '#0b0b0d',
    theme_color: '#0b0b0d',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  });
}

// A cached service worker can pin clients to an old build, and some CDNs cache
// .js by extension regardless of Cache-Control, so say no-store every way.
export const SERVICE_WORKER_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
  Pragma: 'no-cache',
  Expires: '0',
};

// Bump the cache name to drop old caches: activate deletes any that don't match.
export const SERVICE_WORKER_JS = /*js*/ `

const CACHE = 'kanagare-shell-v2';
const SHELL = ['/', '/theme.js', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;
  // Navigations: network-first so updates ship, fall back to cached shell offline.
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((r) => {
      if (r.ok && (r.headers.get('content-type') || '').startsWith('text/html')) {
        const copy = r.clone(); caches.open(CACHE).then((c) => c.put('/', copy));
      }
      return r;
    }).catch(() => caches.match('/')));
    return;
  }
  // Hashed build assets + icons: cache-first.
  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit ||
      fetch(e.request)
        .then((r) => {
          if (r.ok && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest' || url.pathname === '/theme.js')) {
            const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return r;
        })
        .catch(() => caches.match(e.request).then((c) => c || Response.error())),
    ),
  );
});
`;

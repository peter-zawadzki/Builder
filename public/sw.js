/**
 * BUILDER — Service Worker
 * Strategy:
 *  - Install: fetch and cache the app shell (/) so the full HTML + its linked
 *    JS/CSS chunks are pulled into cache during install, not lazily.
 *  - Navigate requests: network-first, cache fallback when offline — every
 *    deploy needs to reach a device on its very next page load, not "whenever
 *    a background revalidation from two visits ago happens to have landed."
 *    (Was cache-first with background revalidate — that shipped every deploy
 *    to nobody until a device happened to reload twice; found via photo/
 *    document uploads silently running week-old cached JS that referenced a
 *    JS bundle filename the server no longer had, both on the same mountain.)
 *  - Static assets (JS/CSS/images/fonts): stale-while-revalidate — safe here
 *    because asset filenames are content-hashed by Vite, so a given hash's
 *    bytes never change; only the app shell's reference to *which* hash can
 *    go stale.
 *  - Supabase API calls: skip entirely (dead code path — app no longer talks
 *    to Supabase at all, but kept as a no-op safety net)
 *  - OSM tile requests: stale-while-revalidate (map works offline after first view)
 */

const CACHE = 'builder-v4';
const SUPABASE_PATTERN = /supabase\.co/;

// ── Install: warm up the app shell cache ──────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(async cache => {
      try {
        // Fetch the shell HTML — the browser will parse it and the SW will
        // intercept/cache the linked JS + CSS chunks as they are fetched.
        const shellRes = await fetch('/', { cache: 'reload' });
        if (shellRes.ok) await cache.put('/', shellRes);
      } catch (e) {
        console.warn('[SW] Shell pre-cache failed (offline at install time):', e);
      }
    }).finally(() => self.skipWaiting())
  );
});

// ── Activate: purge old caches ─────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ──────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Only intercept GET requests
  if (req.method !== 'GET') return;

  // Never intercept Supabase API — let DataContext handle failures + queue
  if (SUPABASE_PATTERN.test(url.hostname)) return;

  // Skip chrome-extension, data: URIs, etc.
  if (!url.protocol.startsWith('http')) return;

  // Skip source maps
  if (url.pathname.endsWith('.map')) return;

  // Real files (PDFs, images, videos, static demo pages) served from
  // public/resource-assets/ are not part of the SPA route tree. A navigate
  // request for one of these happens when a link opens it in a new tab —
  // without this check, the app-shell logic below would serve the cached
  // index.html instead, and React Router would then 404 on a path it
  // doesn't recognize as a route (fixed after this shipped: was reported as
  // "clicking the asset shows a 404, but a hard refresh finds it" — hard
  // refresh bypasses the service worker entirely, network fetch worked).
  if (url.pathname.startsWith('/resource-assets/')) {
    event.respondWith(fetch(req));
    return;
  }

  // ── HTML navigation: network-first, cache fallback when offline ──────────
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const res = await fetch(req);
          if (res.ok) cache.put('/', res.clone());
          return res;
        } catch (e) {
          const cached = await cache.match('/');
          if (cached) return cached;
          throw e;
        }
      })()
    );
    return;
  }

  // ── All other GETs (JS/CSS bundles, images, tiles, fonts) ────────────────
  // Stale-while-revalidate: serve from cache immediately, update in background.
  event.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(req);

      const networkFetch = fetch(req)
        .then(res => {
          if (res.ok && res.status < 400) {
            // Only cache same-origin and CDN assets (not Supabase storage blobs)
            const isCacheable = url.hostname === self.location.hostname
              || url.hostname.endsWith('tile.openstreetmap.org')
              || url.hostname.endsWith('unpkg.com')
              || url.hostname.endsWith('cdn.jsdelivr.net');
            if (isCacheable) cache.put(req, res.clone());
          }
          return res;
        })
        .catch(() => null);

      // Return cached copy immediately; if none, wait for network
      if (cached) {
        // Fire revalidation in background without blocking the response
        event.waitUntil(networkFetch);
        return cached;
      }
      return networkFetch;
    })
  );
});

// ── Message: skip waiting (force activate new SW immediately) ─────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
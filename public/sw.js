/**
 * BUILDER — Service Worker
 * Strategy:
 *  - Install: fetch and cache the app shell (/) so the full HTML + its linked
 *    JS/CSS chunks are pulled into cache during install, not lazily.
 *  - Navigate requests: serve cached shell immediately, revalidate in background
 *  - Static assets (JS/CSS/images/fonts): stale-while-revalidate
 *  - Supabase API calls: skip entirely (handled by DataContext + offline queue)
 *  - OSM tile requests: stale-while-revalidate (map works offline after first view)
 */

const CACHE = 'builder-v3';
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

  // ── HTML navigation: cache-first, background revalidate ──────────────────
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match('/');
        // Always kick off a network fetch to refresh the shell
        const networkFetch = fetch(req)
          .then(res => { if (res.ok) cache.put('/', res.clone()); return res; })
          .catch(() => null);
        // Serve cache instantly if available; otherwise wait for network
        return cached ?? networkFetch;
      })
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
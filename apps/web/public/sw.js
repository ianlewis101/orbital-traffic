// Orbital Traffic — Service Worker
//
// Strategy per resource class:
//   - hashed build assets (/assets/*)  → cache-first (immutable filenames)
//   - catalog data (/data/*, /photos/*) → stale-while-revalidate
//   - navigations                       → network-first, offline fallback
//   - icons                             → cache-first
//   - live APIs (worker, CelesTrak…)    → never intercepted
//
// Bump CACHE_VERSION on breaking cache-layout changes; old caches are
// dropped on activate.

const CACHE_VERSION = "v2";
const SHELL_CACHE = `ot-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `ot-assets-${CACHE_VERSION}`;
const DATA_CACHE = `ot-data-${CACHE_VERSION}`;
const CACHES = new Set([SHELL_CACHE, ASSET_CACHE, DATA_CACHE]);

const PRECACHE = ["/", "/manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !CACHES.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function cacheFirst(cacheName, request) {
  return caches.open(cacheName).then((c) =>
    c.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((res) => {
          if (res.ok) c.put(request, res.clone());
          return res;
        })
    )
  );
}

function staleWhileRevalidate(cacheName, request) {
  return caches.open(cacheName).then((c) =>
    c.match(request).then((hit) => {
      const refresh = fetch(request)
        .then((res) => {
          if (res.ok) c.put(request, res.clone());
          return res;
        })
        .catch(() => hit);
      return hit || refresh;
    })
  );
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // Live data endpoints and external APIs — always straight to network.
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/tle") ||
    url.pathname.startsWith("/crew") ||
    url.pathname.startsWith("/today")
  )
    return;

  // Navigations: network-first with offline fallback to the cached shell.
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  // Hashed, immutable build output.
  if (url.pathname.startsWith("/assets/")) {
    e.respondWith(cacheFirst(ASSET_CACHE, e.request));
    return;
  }

  // Catalog data refreshes daily; serve cached instantly, refresh behind.
  if (url.pathname.startsWith("/data/") || url.pathname.startsWith("/photos/")) {
    e.respondWith(staleWhileRevalidate(DATA_CACHE, e.request));
    return;
  }

  if (url.pathname.startsWith("/icons/")) {
    e.respondWith(cacheFirst(ASSET_CACHE, e.request));
    return;
  }
});

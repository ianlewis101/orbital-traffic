// Orbital Traffic — Service Worker
// Caches the app shell for offline use

const CACHE = "orbital-traffic-v1";

// Core files to cache on install
const PRECACHE = [
  "/",
  "/index.html"
];

// Install — pre-cache shell
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// Activate — clean up old caches
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — network first for API calls, cache first for app shell
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);

  // Always go to network for:
  // - Cloudflare Worker API calls (live TLE data, crew)
  // - CelesTrak / external APIs
  if (
    url.hostname.includes("workers.dev") ||
    url.hostname.includes("celestrak") ||
    url.hostname.includes("nasa.gov") ||
    url.hostname.includes("api.le-systeme") ||
    url.pathname.startsWith("/tle") ||
    url.pathname.startsWith("/crew") ||
    url.pathname.startsWith("/today")
  ) {
    return; // let browser handle it normally
  }

  // For navigation requests (loading the app) — try network, fall back to cache
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match("/") || caches.match("/index.html"))
    );
    return;
  }

  // For icons and static assets — cache first, network fallback
  if (url.pathname.startsWith("/icons/")) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
          return res;
        });
      })
    );
    return;
  }
});

/**
 * Orbital Traffic — Cloudflare Worker
 *
 * Proxies and caches the data the web app's "Fetch Live Data" / crew card
 * features depend on, so the client never has to hit CelesTrak, Open
 * Notify, or GitHub directly (and so those upstreams see one cached
 * request per TTL window instead of one per visitor).
 *
 * Routes:
 *   GET /tle       — merged satellite TLE records across CelesTrak groups
 *   GET /crew      — ISS/Tiangong crew roster
 *   GET /today     — ISS "Today aboard" activity feed
 *   GET /capsules  — crewed-capsule/cargo-vehicle phase (docked/free-flying/landed) + event log
 *   GET /satcat    — per-object SATCAT metadata (launch date, owner, launch site)
 *
 * TLE parsing lives in @orbital-traffic/catalog (shared with the web
 * app). This Worker only tags the coarse group a record came from (see
 * groups.js) — it does NOT run categorize()'s full classification.
 * Fine-grained categories (communications, classified, etc.) are
 * produced client-side by apps/web/src/data/ingest.js on every ingest.
 */
import {
  parseTle,
  mergeRecords,
  GROUPS,
  CELESTRAK_BASE,
  FETCH_HEADERS,
  noradId,
  predictPasses,
} from "@orbital-traffic/catalog";

export const TLE_TTL = 20 * 60; // 20 minutes
export const CREW_TTL = 60 * 60; // 1 hour
export const TODAY_TTL = 5 * 60; // 5 minutes
export const CAPSULES_TTL = 10 * 60; // 10 minutes — source refreshes every 4h, so this just bounds edge staleness

const CREW_URL = "https://api.open-notify.org/astros.json";
const TODAY_URL =
  "https://raw.githubusercontent.com/ianlewis101/orbital-traffic/main/iss-today.json";
const CAPSULES_URL =
  "https://raw.githubusercontent.com/ianlewis101/orbital-traffic/main/capsule-status.json";

async function fetchGroup([group, cat]) {
  try {
    const res = await fetch(CELESTRAK_BASE + group, {
      headers: FETCH_HEADERS,
      cf: { cacheTtl: TLE_TTL, cacheEverything: true },
    });
    if (!res.ok) return [];
    return parseTle(await res.text(), cat);
  } catch {
    return [];
  }
}

export async function buildTLERecords() {
  const results = await Promise.allSettled(GROUPS.map(fetchGroup));
  // Merge in GROUPS order (not fetch-completion order) so a satellite
  // already claimed by a specific group is never overwritten by a later,
  // more generic one.
  return mergeRecords(results.map((r) => (r.status === "fulfilled" ? r.value : [])));
}

export async function buildCrew() {
  try {
    const r = await fetch(CREW_URL, { cf: { cacheTtl: CREW_TTL, cacheEverything: true } });
    if (r.ok) {
      const d = await r.json();
      if (Array.isArray(d.people)) return { people: d.people, number: d.number ?? d.people.length, ok: true };
    }
  } catch {}
  return { people: [], number: 0, ok: false };
}

export async function buildToday() {
  try {
    const r = await fetch(TODAY_URL, { cf: { cacheTtl: TODAY_TTL, cacheEverything: true } });
    if (r.ok) return await r.json();
  } catch {}
  return { updated: null, activities: [] };
}

/**
 * Re-serves capsule-status.json (written by the scheduled
 * update-capsule-status workflow) — same "committed JSON, no live upstream
 * computation here" shape as buildToday().
 */
export async function buildCapsules() {
  try {
    const r = await fetch(CAPSULES_URL, { cf: { cacheTtl: CAPSULES_TTL, cacheEverything: true } });
    if (r.ok) return await r.json();
  } catch {}
  return { updated: null, capsules: {}, events: [] };
}

const SATCAT_URL = "https://celestrak.org/satcat/records.php?FORMAT=JSON&CATNR=";
export const SATCAT_TTL = 7 * 24 * 60 * 60; // 7 days — launch date/owner/site are effectively permanent once catalogued

/**
 * Fetches a single object's SATCAT record (launch date, object type, owner,
 * launch site) server-side, so visitors' browsers never hit CelesTrak
 * directly (audit F14). Mirrors fetchIssTle()'s degrade-to-null shape below.
 */
export async function fetchSatcat(catnr) {
  try {
    const res = await fetch(SATCAT_URL + encodeURIComponent(catnr), {
      headers: FETCH_HEADERS,
      cf: { cacheTtl: SATCAT_TTL, cacheEverything: true },
    });
    if (!res.ok) return null;
    const arr = await res.json();
    return Array.isArray(arr) && arr.length ? arr[0] : null;
  } catch {
    return null;
  }
}

const ISS_NORAD_ID = "25544";
const ISS_TLE_URL = "https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE";
export const PASSES_TTL = 20 * 60; // matches TLE_TTL — a new TLE meaningfully shifts pass timing

async function fetchIssTle() {
  try {
    const res = await fetch(ISS_TLE_URL, {
      headers: FETCH_HEADERS,
      cf: { cacheTtl: PASSES_TTL, cacheEverything: true },
    });
    if (!res.ok) return null;
    const recs = parseTle(await res.text(), "stations");
    return recs.find((r) => noradId(r.l1) === ISS_NORAD_ID) ?? recs[0] ?? null;
  } catch {
    return null;
  }
}

export async function buildPasses(lat, lng) {
  const iss = await fetchIssTle();
  if (!iss) return { passes: [], error: "iss_tle_unavailable" };
  const passes = predictPasses(iss.l1, iss.l2, lat, lng, { maxPasses: 5 });
  return {
    passes: passes.map((p) => ({
      riseAt: new Date(p.riseMs).toISOString(),
      culminatesAt: new Date(p.cullMs).toISOString(),
      setAt: new Date(p.setMs).toISOString(),
      maxElevationDeg: Math.round(p.maxElevationDeg * 10) / 10,
    })),
  };
}

function badRequest(message) {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

async function handlePasses(ctx, request) {
  const url = new URL(request.url);
  const latParam = url.searchParams.get("lat");
  const lngParam = url.searchParams.get("lng");
  if (latParam === null || lngParam === null) {
    return badRequest("lat and lng query params are required");
  }
  const lat = Number(latParam);
  const lng = Number(lngParam);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return badRequest("lat and lng must be valid coordinates");
  }
  // Round to reduce cache cardinality — pass timing doesn't meaningfully
  // change within ~11km (0.1 degree), well inside what matters for a
  // "next pass in ~N minutes" alert.
  const rLat = Math.round(lat * 10) / 10;
  const rLng = Math.round(lng * 10) / 10;
  return cached(ctx, `/passes?lat=${rLat}&lng=${rLng}`, PASSES_TTL, () => buildPasses(rLat, rLng));
}

function jsonResponse(data, ttl) {
  return new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": `public, max-age=${ttl}`,
    },
  });
}

/**
 * Edge-cache wrapper. `caches.default` only exists in the workerd
 * runtime; under tests it is absent and every request builds fresh.
 *
 * `shouldCache` guards against locking in a failed upstream fetch for the
 * full `ttl` window — most routes always cache (default), but /crew skips
 * caching when buildCrew() couldn't reach Open Notify, so the next request
 * retries instead of repeating a stale failure for a full hour.
 */
async function cached(ctx, path, ttl, build, shouldCache = () => true) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const cacheKey = new Request(`https://orbital-traffic.internal${path}`, { method: "GET" });
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }
  const data = await build();
  const res = jsonResponse(data, ttl);
  if (cache && shouldCache(data)) ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

const ROUTES = {
  "/tle": (ctx) => cached(ctx, "/tle", TLE_TTL, buildTLERecords),
  "/crew": (ctx) => cached(ctx, "/crew", CREW_TTL, buildCrew, (d) => d.ok !== false),
  "/today": (ctx) => cached(ctx, "/today", TODAY_TTL, buildToday),
  "/capsules": (ctx) => cached(ctx, "/capsules", CAPSULES_TTL, buildCapsules),
  "/passes": (ctx, request) => handlePasses(ctx, request),
  "/satcat": (ctx, request) => {
    const url = new URL(request.url);
    const catnr = url.searchParams.get("id");
    if (!catnr) return badRequest("id query param is required");
    return cached(ctx, `/satcat?id=${catnr}`, SATCAT_TTL, () => fetchSatcat(catnr));
  },
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }
    const { pathname } = new URL(request.url);
    const route = ROUTES[pathname];
    if (!route) return new Response("Not found", { status: 404 });
    return route(ctx, request);
  },
};

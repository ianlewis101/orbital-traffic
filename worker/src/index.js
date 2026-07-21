/**
 * Orbital Traffic — Cloudflare Worker
 *
 * Proxies and caches the data the web app's "Fetch Live Data" / crew card
 * features depend on, so the client never has to hit CelesTrak, Launch
 * Library 2, or GitHub directly (and so those upstreams see one cached
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

// Launch Library 2 (LL2) — replaced Open Notify entirely 2026-07-21 after
// Open Notify was found to be serving a crew roster ~18 months stale (see
// docs/audit-status.md). MUST stay ll.thespacedevs.com (production) — never
// lldev.thespacedevs.com, which LL2's own docs mark as a development-only
// tier, not for real traffic. Station IDs were verified directly against
// real crew rosters this session (cross-referenced against NASA, Wikipedia,
// and Xinhua) — do not re-guess these if this code is touched again: 4 is
// the ISS, 18 is the Tiangong space station (not 7/8, the de-orbited
// Tiangong 1/2).
const LL2_BASE = "https://ll.thespacedevs.com/2.2.0";
const ISS_STATION_ID = 4;
const TIANGONG_STATION_ID = 18;
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

/**
 * One station's active-expedition crew from LL2's /spacestation/ endpoint.
 * ok:false only means this station's own fetch failed — buildCrew() decides
 * what that means for the overall response.
 */
async function fetchStationCrew(stationId, craft) {
  try {
    const r = await fetch(`${LL2_BASE}/spacestation/${stationId}/`, {
      cf: { cacheTtl: CREW_TTL, cacheEverything: true },
    });
    if (!r.ok) return { ok: false, people: [] };
    const d = await r.json();
    if (!Array.isArray(d.active_expeditions)) return { ok: false, people: [] };
    const crew = d.active_expeditions[0]?.crew;
    const people = Array.isArray(crew)
      ? crew.map((c) => ({ name: c.astronaut?.name, craft })).filter((p) => p.name)
      : [];
    return { ok: true, people };
  } catch {
    return { ok: false, people: [] };
  }
}

/**
 * Supplementary cross-check (not a full fix): compares how many people we
 * actually placed at a station against LL2's own count of everyone
 * currently in space. LL2's per-station active-expedition data can lag by
 * a few days on a brand-new arrival during a handover overlap (confirmed
 * 2026-07-21: it was missing the just-docked Soyuz MS-29 crew), so this
 * exists purely to surface that honestly rather than silently show an
 * incomplete roster. Deliberately does NOT try to identify who the extra
 * person/people are or which station they belong to — that would mean
 * cross-referencing mission/flight data, out of scope for this fix. A
 * failed fetch here returns false rather than flagging incompleteness we
 * can't actually confirm — absence of evidence isn't evidence of a problem.
 */
async function checkPossiblyIncomplete(placedCount) {
  try {
    const r = await fetch(`${LL2_BASE}/astronaut/?in_space=true&is_human=true&format=json`, {
      cf: { cacheTtl: CREW_TTL, cacheEverything: true },
    });
    if (!r.ok) return false;
    const d = await r.json();
    if (typeof d.count !== "number") return false;
    return d.count > placedCount;
  } catch {
    return false;
  }
}

export async function buildCrew() {
  const [iss, tiangong] = await Promise.all([
    fetchStationCrew(ISS_STATION_ID, "ISS"),
    fetchStationCrew(TIANGONG_STATION_ID, "Tiangong"),
  ]);
  const people = [...iss.people, ...tiangong.people];
  // Partial success is real success: one station's own fetch failing
  // doesn't invalidate the other's real, working data. The failing station
  // just contributes zero people after the client's existing craft-filter
  // runs — crew.js already renders an honest "Crew names unavailable" in
  // that exact case with no changes needed there. Only both stations
  // failing matches the old all-failed contract (empty roster, ok:false).
  const ok = iss.ok || tiangong.ok;
  return {
    people,
    number: people.length,
    ok,
    possiblyIncomplete: ok ? await checkPossiblyIncomplete(people.length) : false,
    fetchedAt: new Date().toISOString(),
  };
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

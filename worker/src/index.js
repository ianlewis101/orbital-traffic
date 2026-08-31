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
 *   GET /astronaut — one crew member's public profile (bio, photo, flight stats)
 *   GET /events    — "Today in Space" feed: docking/undocking, launches, reentries, crew changes
 *
 * TLE parsing lives in @orbital-traffic/catalog (shared with the web
 * app). parseGp() runs the full categorize() pipeline on every record,
 * so /tle emits fully classified records ("communications",
 * "classified", "debris", etc.); apps/web/src/data/ingest.js re-runs
 * categorize() client-side on every ingest anyway, so clients never
 * depend on a stale Worker deploy for a classification fix.
 */
import {
  parseGp,
  mergeRecords,
  GROUPS,
  CELESTRAK_BASE,
  FETCH_HEADERS,
} from "@orbital-traffic/catalog";

export const TLE_TTL = 20 * 60; // 20 minutes
// One CelesTrak group failing (timeout, transient 5xx) shouldn't poison the
// merged catalog for the full 20-minute TLE_TTL — that's how a single flaky
// moment made an entire category (e.g. geostationary) vanish from every
// visitor's feed for up to 20 minutes. Same rationale and value as
// CREW_FAIL_TTL: short enough for a real retry soon, long enough to collapse
// a stampede of visitors into ~one retry attempt.
export const TLE_PARTIAL_FAIL_TTL = 90;
export const CREW_TTL = 60 * 60; // 1 hour
export const TODAY_TTL = 5 * 60; // 5 minutes
export const CAPSULES_TTL = 10 * 60; // 10 minutes — source refreshes every 4h, so this just bounds edge staleness
export const EVENTS_TTL = 10 * 60; // 10 minutes — same spirit as /capsules; underlying sources refresh hourly/daily
// "Today in Space" display window — events older than this are dropped by
// buildEvents() itself rather than left for the client to filter, matching
// how /capsules already relies on its own count cap (MAX_EVENTS) rather
// than the client re-deriving a cutoff. 48h (not the spec's lower 24h
// bound) because two of the three sources only refresh once a day —
// a 24h window would let a fresh event go stale before most visitors
// see it.
export const EVENTS_WINDOW_HOURS = 48;

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

// LL2 throttles anonymous traffic per IP (15 requests/hour per their docs),
// and Workers egress IPs are shared across Cloudflare customers — so LL2
// requests must always identify this app (same pattern as FETCH_HEADERS in
// packages/catalog/src/groups.js, but Accept: application/json since LL2 is
// a JSON API, not CelesTrak's text/plain). When an LL2_API_KEY secret is
// bound on the Worker (optional — `npx wrangler secret put LL2_API_KEY`
// from worker/), it rides along as `Authorization: Token <key>`, the scheme
// The Space Devs' own docs specify (not Bearer, not Api-Key).
const LL2_FETCH_HEADERS = {
  "User-Agent": "OrbitalTraffic/2.0 (+https://orbitaltraffic.app)",
  Accept: "application/json",
};

function ll2Headers(env) {
  return env?.LL2_API_KEY
    ? { ...LL2_FETCH_HEADERS, Authorization: `Token ${env.LL2_API_KEY}` }
    : LL2_FETCH_HEADERS;
}

/**
 * Why LL2 refused, in a shape safe to surface publicly: the HTTP status
 * plus — when the body is JSON with a `detail` string, which LL2's DRF
 * throttle responses include ("Request was throttled. Expected available
 * in N seconds.") — a short whitespace-collapsed excerpt of it. Never the
 * full upstream body, never anything user-identifying.
 */
async function ll2FailureSource(r) {
  const source = { status: r.status };
  try {
    const body = await r.json();
    if (typeof body?.detail === "string") {
      const detail = body.detail.trim().split(/\s+/).join(" ").slice(0, 160);
      if (detail) source.detail = detail;
    }
  } catch {
    // Non-JSON failure body (e.g. an HTML block page) — the status alone
    // still tells the story; never echo the body itself.
  }
  return source;
}
const TODAY_URL =
  "https://raw.githubusercontent.com/ianlewis101/orbital-traffic/main/iss-today.json";
const CAPSULES_URL =
  "https://raw.githubusercontent.com/ianlewis101/orbital-traffic/main/capsule-status.json";
const LAUNCH_REENTRY_URL =
  "https://raw.githubusercontent.com/ianlewis101/orbital-traffic/main/launch-reentry-log.json";

// A stalled CelesTrak connection on any one of the 13 groups otherwise hangs
// this fetch indefinitely — Promise.allSettled below waits for every group
// to settle, so one straggler holds up the whole /tle response until the
// platform's own wall-clock limit kills the request with zero bytes sent.
// Aborting a slow group after this long lets it fail fast and fall out of
// the merge like any other failed group, instead of taking every visitor's
// request down with it. 10s comfortably covers a normal response even for
// "active", the largest group.
const GROUP_FETCH_TIMEOUT_MS = 10000;

async function fetchGroup([group, cat]) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GROUP_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(CELESTRAK_BASE + group, {
      headers: FETCH_HEADERS,
      cf: { cacheTtl: TLE_TTL, cacheEverything: true },
      signal: controller.signal,
    });
    if (!res.ok) return { recs: [], ok: false };
    return { recs: parseGp(await res.text(), cat), ok: true };
  } catch {
    return { recs: [], ok: false };
  } finally {
    clearTimeout(timer);
  }
}

export async function buildTLERecords() {
  const results = await Promise.allSettled(GROUPS.map(fetchGroup));
  const settled = results.map((r) =>
    r.status === "fulfilled" ? r.value : { recs: [], ok: false }
  );
  // Merge in GROUPS order (not fetch-completion order) so a satellite
  // already claimed by a specific group is never overwritten by a later,
  // more generic one.
  const records = mergeRecords(settled.map((s) => s.recs));
  // Not serialized to the client (JSON.stringify on an array only emits
  // index-keyed entries) — read by the /tle route's ttlFor below to decide
  // how long this merge is safe to cache. See TLE_PARTIAL_FAIL_TTL.
  records.failedGroups = settled.filter((s) => !s.ok).length;
  return records;
}

/**
 * One station's active-expedition crew from LL2's /spacestation/ endpoint.
 * ok:false only means this station's own fetch failed — buildCrew() decides
 * what that means for the overall response. On failure, `source` records
 * why (ll2FailureSource() shape; status "fetch_failed" when the fetch
 * itself threw and there is no HTTP status to report).
 */
async function fetchStationCrew(stationId, craft, env) {
  try {
    const r = await fetch(`${LL2_BASE}/spacestation/${stationId}/`, {
      headers: ll2Headers(env),
      cf: { cacheTtl: CREW_TTL, cacheEverything: true },
    });
    if (!r.ok) return { ok: false, people: [], source: await ll2FailureSource(r) };
    const d = await r.json();
    if (!Array.isArray(d.active_expeditions)) {
      return {
        ok: false,
        people: [],
        source: { status: r.status, detail: "unexpected_response_shape" },
      };
    }
    const crew = d.active_expeditions[0]?.crew;
    // LL2's own crew array can list the same astronaut twice within one
    // expedition (confirmed live 2026-07-24 on ISS expedition 74 — id 732
    // appeared twice, identical role) — dedupe by astronaut id (falling
    // back to name if id is absent) so that upstream duplicate doesn't
    // reach users as a repeated name in the roster.
    //
    // `id` rides along so the crew card can request that person's profile
    // from /astronaut; `role` was already read by crew.js's commander
    // highlight (`p.role`) but never actually sent until now.
    const seen = new Set();
    const people = Array.isArray(crew)
      ? crew
          .filter((c) => {
            // A nameless entry has nothing to render, so it's dropped
            // before deduping (matching the pre-dedupe behavior).
            if (!c.astronaut?.name) return false;
            const key = c.astronaut.id ?? c.astronaut.name;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .map((c) => ({
            name: c.astronaut?.name,
            craft,
            id: c.astronaut?.id ?? null,
            role: c.role?.role ?? null,
          }))
      : [];
    return { ok: true, people };
  } catch {
    return { ok: false, people: [], source: { status: "fetch_failed" } };
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
 * failed fetch here returns incomplete:false rather than flagging
 * incompleteness we can't actually confirm — absence of evidence isn't
 * evidence of a problem. `source` captures why LL2 refused, same shape as
 * fetchStationCrew()'s, so every LL2 fetch fails diagnosably; it doesn't
 * currently reach the response body, though — this check only runs when
 * ok is true, and sourceStatus is deliberately only attached when ok is
 * false.
 */
async function checkPossiblyIncomplete(placedCount, env) {
  try {
    const r = await fetch(`${LL2_BASE}/astronaut/?in_space=true&is_human=true&format=json`, {
      headers: ll2Headers(env),
      cf: { cacheTtl: CREW_TTL, cacheEverything: true },
    });
    if (!r.ok) return { incomplete: false, source: await ll2FailureSource(r) };
    const d = await r.json();
    if (typeof d.count !== "number") {
      return {
        incomplete: false,
        source: { status: r.status, detail: "unexpected_response_shape" },
      };
    }
    return { incomplete: d.count > placedCount };
  } catch {
    return { incomplete: false, source: { status: "fetch_failed" } };
  }
}

export async function buildCrew(env) {
  const [iss, tiangong] = await Promise.all([
    fetchStationCrew(ISS_STATION_ID, "ISS", env),
    fetchStationCrew(TIANGONG_STATION_ID, "Tiangong", env),
  ]);
  const people = [...iss.people, ...tiangong.people];
  // Partial success is real success: one station's own fetch failing
  // doesn't invalidate the other's real, working data. The failing station
  // just contributes zero people after the client's existing craft-filter
  // runs — crew.js already renders an honest "Crew names unavailable" in
  // that exact case with no changes needed there. Only both stations
  // failing matches the old all-failed contract (empty roster, ok:false).
  const ok = iss.ok || tiangong.ok;
  const result = {
    people,
    number: people.length,
    ok,
    possiblyIncomplete: ok ? (await checkPossiblyIncomplete(people.length, env)).incomplete : false,
    fetchedAt: new Date().toISOString(),
  };
  // Diagnostic only, present only when ok is false (both stations failed):
  // one curl of /crew in production shows exactly why LL2 refused each
  // station (e.g. 429 + throttle detail vs. 403), instead of an opaque
  // empty roster. crew.js ignores unknown fields, so this is additive.
  if (!ok) result.sourceStatus = { iss: iss.source, tiangong: tiangong.source };
  return result;
}

// Bios and photos are effectively static, but flight/spacewalk counts and
// time_in_space do move mid-mission (a spacewalk bumps them the same day),
// so this sits well short of SATCAT_TTL's 7 days while still collapsing
// essentially all repeat traffic into one upstream call per day per person.
export const ASTRONAUT_TTL = 24 * 60 * 60; // 24 hours

/**
 * One crew member's public profile from LL2, trimmed to the fields the crew
 * card renders. Degrades to null on any failure, same shape as
 * fetchSatcat() — the client treats null as "profile unavailable" rather
 * than an error state.
 *
 * Deliberately NOT a passthrough of LL2's full record: that object carries
 * nested flight/landing/spacewalk arrays worth tens of KB per person, all
 * unused here, and re-serving arbitrary upstream fields is how unreviewed
 * data ends up in the DOM later.
 */
export async function fetchAstronaut(id, env) {
  try {
    const r = await fetch(`${LL2_BASE}/astronaut/${id}/`, {
      headers: ll2Headers(env),
      cf: { cacheTtl: ASTRONAUT_TTL, cacheEverything: true },
    });
    if (!r.ok) return null;
    const d = await r.json();
    if (!d || typeof d.name !== "string") return null;
    const num = (v) => (typeof v === "number" ? v : null);
    return {
      id: d.id ?? null,
      name: d.name,
      nationality: d.nationality || null,
      agency: d.agency?.name || null,
      bio: d.bio || null,
      // Thumbnail first: the card renders at 56px, so the full-size image
      // is pure transfer cost on a view that may open several times.
      image: d.profile_image_thumbnail || d.profile_image || null,
      wiki: d.wiki || null,
      twitter: d.twitter || null,
      instagram: d.instagram || null,
      flights: num(d.flights_count),
      spacewalks: num(d.spacewalks_count),
      // ISO 8601 durations (e.g. "P369DT6H45M59S") — formatted client-side.
      timeInSpace: d.time_in_space || null,
      evaTime: d.eva_time || null,
    };
  } catch {
    return null;
  }
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

/** One committed-JSON source's event array, degrading to [] on any failure — same shape as buildToday()/buildCapsules(). */
async function fetchEventSource(url, ttl, pick) {
  try {
    const r = await fetch(url, { cf: { cacheTtl: ttl, cacheEverything: true } });
    if (!r.ok) return [];
    const data = await r.json();
    const arr = pick(data);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * "Today in Space" — composes the three independently-owned event sources
 * into one feed, at request time, rather than any one of them being a
 * shared file three different scheduled jobs write to. Each job (hourly
 * capsule-status, daily satellites, daily iss-today) keeps committing only
 * the single file it already owns; merging happens here instead, the same
 * "committed JSON, no live upstream computation" shape buildToday() and
 * buildCapsules() already use, just fed from three raw URLs instead of one.
 * This sidesteps the concurrent-commit collision class F13 had to fix once
 * (docs/audit-status.md) — no rebase-retry dance needed here, since no two
 * of these jobs ever write to the same file.
 *
 * Docking/undocking/launched/landed already comes from capsule-status.json's
 * own event log (advanceCapsuleLog() in @orbital-traffic/catalog) — no new
 * source needed for that type. Launch/reentry and crew-change events come
 * from launch-reentry-log.json and iss-today.json's crewEvents
 * respectively, both written by tools/ scripts alongside data they already
 * fetch (see CLAUDE.md).
 */
export async function buildEvents() {
  const [capsuleEvents, launchReentryEvents, crewEvents] = await Promise.all([
    fetchEventSource(CAPSULES_URL, CAPSULES_TTL, (d) => d.events),
    fetchEventSource(LAUNCH_REENTRY_URL, EVENTS_TTL, (d) => d.events),
    fetchEventSource(TODAY_URL, TODAY_TTL, (d) => d.crewEvents),
  ]);

  const docking = capsuleEvents.map((e) => ({
    type: "docking",
    subtype: e.event, // "launched" | "docked" | "undocked" | "landed"
    at: e.at,
    id: e.id,
    name: e.name,
    kind: e.kind,
    family: e.family,
    stationKey: e.stationKey,
  }));
  const launchReentry = launchReentryEvents.map((e) =>
    e.type === "launch"
      ? { type: "launch", at: e.at, ids: e.ids, count: e.count, name: e.name, cat: e.cat }
      : { type: "reentry", at: e.at, id: e.id, name: e.name, cat: e.cat }
  );
  const crew = crewEvents.map((e) => ({
    type: "crew",
    at: e.at,
    id: e.id,
    name: e.name,
    craft: e.craft,
    direction: e.direction,
  }));

  const cutoffMs = Date.now() - EVENTS_WINDOW_HOURS * 60 * 60 * 1000;
  const events = [...docking, ...launchReentry, ...crew]
    .filter((e) => e.at && new Date(e.at).getTime() >= cutoffMs)
    .sort((a, b) => new Date(b.at) - new Date(a.at));

  return { generatedAt: new Date().toISOString(), windowHours: EVENTS_WINDOW_HOURS, events };
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

// A null fetchSatcat()/fetchAstronaut() result can mean "confirmed no
// record" (permanent, fine to cache for the full TTL) or a transient
// upstream hiccup (CelesTrak/LL2 error, timeout) — the two are
// indistinguishable from here, so treat every null as short-lived rather
// than risk caching a transient failure for the full SATCAT_TTL (7 days) /
// ASTRONAUT_TTL (24h). Same rationale and value as CREW_FAIL_TTL.
export const SATCAT_FAIL_TTL = 90;
export const ASTRONAUT_FAIL_TTL = 90;

function badRequest(message) {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
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

// How long a failed /crew build stays negative-cached. Not caching failures
// at all (the PR #96 behavior) turned out to be its own failure mode once
// the upstream was rate-limiting by IP: every visitor's request went
// straight through to LL2, keeping the shared Workers egress IP throttled
// forever. 90s keeps failures honest and short-lived while still collapsing
// a stampede of visitors into ~one upstream attempt per window.
export const CREW_FAIL_TTL = 90;

/**
 * Edge-cache wrapper. `caches.default` only exists in the workerd
 * runtime; under tests it is absent unless stubbed, and every request
 * builds fresh.
 *
 * `ttlFor` lets a route pick the cache lifetime per response — most routes
 * always cache at their full `ttl` (default), but /crew caches a failed
 * build for only CREW_FAIL_TTL so a rate-limited upstream gets a real
 * retry within ~90s instead of either a full stale hour (pre-PR #96) or a
 * request-per-visitor hammering loop (no caching at all). The TTL rides on
 * the response's Cache-Control header, which cache.put honors — so the
 * same value also keeps browsers from sitting on a failure.
 */
async function cached(ctx, path, ttl, build, ttlFor = () => ttl) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const cacheKey = new Request(`https://orbital-traffic.internal${path}`, { method: "GET" });
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }
  const data = await build();
  const res = jsonResponse(data, ttlFor(data));
  if (cache) ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

const ROUTES = {
  "/tle": (ctx) =>
    cached(ctx, "/tle", TLE_TTL, buildTLERecords, (d) =>
      d.failedGroups > 0 ? TLE_PARTIAL_FAIL_TTL : TLE_TTL
    ),
  "/crew": (ctx, request, env) =>
    cached(
      ctx,
      "/crew",
      CREW_TTL,
      () => buildCrew(env),
      (d) => (d.ok === false ? CREW_FAIL_TTL : CREW_TTL)
    ),
  "/today": (ctx) => cached(ctx, "/today", TODAY_TTL, buildToday),
  "/capsules": (ctx) => cached(ctx, "/capsules", CAPSULES_TTL, buildCapsules),
  "/events": (ctx) => cached(ctx, "/events", EVENTS_TTL, buildEvents),
  "/satcat": (ctx, request) => {
    const url = new URL(request.url);
    const catnr = url.searchParams.get("id");
    if (!catnr) return badRequest("id query param is required");
    // Numeric-only: NORAD catalog numbers are always digit strings (leading
    // zeros included — see noradId() in @orbital-traffic/catalog), and
    // requiring this is what stops an unvalidated id (e.g. one with a
    // trailing space or other character the URL/cache-key machinery could
    // normalize away) from colliding with a different, legitimate id's
    // cache slot — the same reasoning /astronaut already applies below.
    if (!/^\d+$/.test(catnr)) return badRequest("id must be numeric");
    return cached(
      ctx,
      `/satcat?id=${catnr}`,
      SATCAT_TTL,
      () => fetchSatcat(catnr),
      (d) => (d === null ? SATCAT_FAIL_TTL : SATCAT_TTL)
    );
  },
  "/astronaut": (ctx, request, env) => {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return badRequest("id query param is required");
    // Numeric-only: LL2 astronaut ids are integers, and this is what keeps
    // an arbitrary caller from steering the upstream URL path or minting
    // unbounded distinct cache keys.
    if (!/^\d+$/.test(id)) return badRequest("id must be numeric");
    return cached(
      ctx,
      `/astronaut?id=${id}`,
      ASTRONAUT_TTL,
      () => fetchAstronaut(id, env),
      (d) => (d === null ? ASTRONAUT_FAIL_TTL : ASTRONAUT_TTL)
    );
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
    // env rides along so /crew can see the optional LL2_API_KEY binding;
    // routes that don't need it just ignore the extra argument.
    return route(ctx, request, env);
  },
};

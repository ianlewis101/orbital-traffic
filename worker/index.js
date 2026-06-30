/**
 * Orbital Traffic — Cloudflare Worker
 *
 * Proxies and caches the data index.html's "Fetch Live Data" / crew card
 * features depend on, so the client never has to hit CelesTrak, Open
 * Notify, or GitHub directly (and so those upstreams see one cached
 * request per TTL window instead of one per visitor).
 *
 * Routes:
 *   GET /tle    — merged satellite TLE records across CelesTrak groups
 *   GET /crew   — ISS/Tiangong crew roster
 *   GET /today  — ISS "Today aboard" activity feed
 */

const TLE_TTL = 20 * 60;   // 20 minutes
const CREW_TTL = 60 * 60;  // 1 hour
const TODAY_TTL = 5 * 60;  // 5 minutes

const CELESTRAK_BASE = "https://celestrak.org/NORAD/elements/gp.php?FORMAT=tle&GROUP=";
const CREW_URL = "http://api.open-notify.org/astros.json";
const TODAY_URL = "https://raw.githubusercontent.com/ianlewis101/orbital-traffic/main/iss-today.json";

const FETCH_HEADERS = {
  "User-Agent": "OrbitalTraffic/1.0 (+https://ianlewis101.github.io/orbital-traffic/)",
  "Accept": "text/plain",
};

// CelesTrak groups fetched for /tle, listed in merge priority order.
// Specific groups (stations, navigation, geo, debris) come first so they
// claim a NORAD ID before the generic "active" catch-all is merged in —
// "active" contains nearly every payload in orbit, so it must run last or
// it would overwrite more precise categorization from the groups above it.
const GROUPS = [
  ["stations", "stations"],
  ["gps-ops", "navigation"],
  ["galileo", "navigation"],
  ["glonass", "navigation"],
  ["geo", "geostationary"],
  // Debris groups are primary fetches, same priority tier as
  // stations/navigation/geo — not a fallback. Each is tagged "debris"
  // once merged (see classifyByName below for the name-pattern backstop).
  ["cosmos-2251-debris", "debris"],
  ["iridium-33-debris", "debris"],
  ["fengyun-1c-debris", "debris"],
  ["starlink", "starlink"],
  ["oneweb", "starlink"],
  ["science", "science"],
  ["active", "other"],
];

// Mirrors isDebrisName()/correctDebrisCat() in index.html — reclassifies
// any record whose name matches known debris/rocket-body patterns,
// regardless of which CelesTrak group it was fetched from. This is a
// backstop on top of the dedicated debris GROUPs above: CelesTrak's
// "active" dump buries plenty of spent rocket stages under generic
// categories, so name matching catches what the group tag misses.
const DEBRIS_NAME_RE = / DEB | DEBRIS | FRAGMENT | FRAG | R\/B | ROCKET BODY | ROCKET | STAGE | ARIANE | DELTA | ATLAS | TITAN /;
function isDebrisName(name) {
  const n = " " + (name || "").toUpperCase() + " ";
  return DEBRIS_NAME_RE.test(n) || n.includes("CZ-") || n.includes("SL-") || n.includes("PSLV R/B");
}
function classifyByName(name, cat) {
  return isDebrisName(name) ? "debris" : cat;
}

function noradId(l1) {
  return l1.slice(2, 7).trim();
}

function parseTLE(text, cat) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const recs = [];
  for (let i = 0; i + 2 < lines.length; i += 3) {
    if (lines[i + 1][0] === "1" && lines[i + 2][0] === "2") {
      const name = lines[i].trim();
      recs.push({ name, l1: lines[i + 1], l2: lines[i + 2], cat: classifyByName(name, cat) });
    }
  }
  return recs;
}

async function fetchGroup([group, cat]) {
  try {
    const res = await fetch(CELESTRAK_BASE + group, {
      headers: FETCH_HEADERS,
      cf: { cacheTtl: TLE_TTL, cacheEverything: true },
    });
    if (!res.ok) return [];
    return parseTLE(await res.text(), cat);
  } catch (e) {
    return [];
  }
}

async function buildTLERecords() {
  const results = await Promise.allSettled(GROUPS.map(fetchGroup));
  const merged = new Map();
  // Walk results in GROUPS order (not fetch-completion order) so a
  // satellite already claimed by a specific group is never overwritten
  // by a later, more generic one.
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const rec of r.value) {
      const id = noradId(rec.l1);
      if (!merged.has(id)) merged.set(id, rec);
    }
  }
  return Array.from(merged.values());
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

async function cached(ctx, path, ttl, build) {
  const cache = caches.default;
  const cacheKey = new Request(`https://orbital-traffic.internal${path}`, { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const res = jsonResponse(await build(), ttl);
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

async function handleTLE(ctx) {
  return cached(ctx, "/tle", TLE_TTL, buildTLERecords);
}

async function handleCrew(ctx) {
  return cached(ctx, "/crew", CREW_TTL, async () => {
    try {
      const r = await fetch(CREW_URL, { cf: { cacheTtl: CREW_TTL, cacheEverything: true } });
      if (r.ok) return await r.json();
    } catch (e) {
      // fall through to empty roster below
    }
    return { people: [], number: 0 };
  });
}

async function handleToday(ctx) {
  return cached(ctx, "/today", TODAY_TTL, async () => {
    try {
      const r = await fetch(TODAY_URL, { cf: { cacheTtl: TODAY_TTL, cacheEverything: true } });
      if (r.ok) return await r.json();
    } catch (e) {
      // fall through to empty payload below
    }
    return { updated: null, activities: [] };
  });
}

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
    switch (pathname) {
      case "/tle":
        return handleTLE(ctx);
      case "/crew":
        return handleCrew(ctx);
      case "/today":
        return handleToday(ctx);
      default:
        return new Response("Not found", { status: 404 });
    }
  },
};

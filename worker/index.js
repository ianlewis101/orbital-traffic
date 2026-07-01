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
// Hardware released or jettisoned from a crewed station (cameras,
// experiment housings, unidentified ISS-origin objects) that CelesTrak
// still lists under "stations" but which are inert and decaying — debris,
// not payloads. Kept narrow so it can't catch co-orbiting cubesats
// (KNACKSAT, GXIBA-1, …) or cargo vehicles (PROGRESS, CYGNUS, TIANZHOU).
const ISS_HARDWARE_RE = / MONOBLOCK | DUPLEX | ISS OBJECT | SZ-\d+ MODULE /;
function isDebrisName(name) {
  const n = " " + (name || "").toUpperCase() + " ";
  return DEBRIS_NAME_RE.test(n) || ISS_HARDWARE_RE.test(n) || n.includes("CZ-") || n.includes("SL-") || n.includes("PSLV R/B");
}
function classifyByName(name, cat) {
  return isDebrisName(name) ? "debris" : cat;
}

// Based on the shared name-pattern regexes from index.html (NAV_NAME_RE /
// WEATHER_NAME_RE / EO_NAME_RE), expanded here so the Worker — not every
// client — does these lookups once per 20-minute cache cycle.
//
// Unlike index.html's space-padded " TOKEN " matching, these are bare
// substrings with no boundary at all (same fix the BEIDOU bug suggests:
// "/ BEIDOU[-\s]/ or simply /BEIDOU/"). Verified against real CelesTrak
// names, operators hyphenate generation/variant suffixes onto the base
// word inconsistently in both directions — "BEIDOU-2 M3", "GLONASS-M 758",
// "SENTINEL-2B", "WORLDVIEW-3" (suffix glued on) and "GEO-KOMPSAT-2A"
// (prefix glued on, confirmed in the bundled index.html dataset) — so any
// fixed boundary character misses real satellites. These tokens are all
// distinctive multi-character constellation names, so bare substring
// matching carries negligible false-positive risk.
const NAV_NAME_RE     = /GPS|NAVSTAR|GALILEO|GLONASS|BEIDOU|CENTISPACE/;
const WEATHER_NAME_RE = /GOES|METEOSAT|HIMAWARI|NOAA|METOP|METEOR|DMSP|ELEKTRO|FENGYUN/;
const EO_NAME_RE      = /LANDSAT|SENTINEL|TERRA|AQUA|WORLDVIEW|SPOT|DOVE|ICEYE|PLEIADES/;
// Major LEO/MEO comms and IoT/AIS constellations that have no dedicated
// CelesTrak GROUPS entry above and so arrive tagged "other" via the
// generic "active" catch-all.
const COMMS_NAME_RE = /IRIDIUM|GLOBALSTAR|ORBCOMM|O3B|HULIANWANG|GEESAT|SITRO-AIS|GONETS-M|CONNECTA|RASSVET-3|APRIZESAT|NINGXIA-1|SCS-01/;
// Earth-observation/imaging constellations and tech-demo cubesats beyond
// WEATHER_NAME_RE/EO_NAME_RE above, same "active" catch-all problem.
const SCI_CONSTELLATION_RE = /FLOCK|JILIN-1|TIANMU|YUNHAI|TIANHUI|SUPERVIEW|AEROCUBE|WILDFIRE|CHUANGXIN|CARTOSAT|KOMPSAT|ARIRANG|PROBA|RADARSAT|RESOURCESAT|CBERS/;
// Mirrors CLASSIFIED_NAME_RE in index.html — known military/intelligence
// naming schemes, surfaced as their own "classified" category instead of
// "other". Deliberately no generic /COSMOS/ pattern: most COSMOS-named
// objects are ordinary (often defunct or debris) Russian satellites, and
// some are GLONASS navigation birds already caught by NAV_NAME_RE above.
// SHIJIAN uses [-\s]* rather than \s*: the real catalog name is hyphenated
// ("SHIJIAN-21"), and a whitespace-only separator misses it entirely.
const CLASSIFIED_NAME_RE = /\bUSA\s+\d+\b|\bNROL\b|\bYAOGAN\b|\bPRAETORIAN\b|\bCHANGGUANG\b|\bSHIJIAN[-\s]*\d+[A-Z]?\b/;
// Mirrors SCIENCE_IDS in index.html (see other-category-audit.md
// Suggestion C3). ISS-deployed educational CubeSats (batch 67683-67688)
// arrive via the "stations" GROUP and fall to "other" after the station
// allowlist filter below; no shared name pattern exists for them, so
// they're listed by NORAD ID instead. CORAL (67684) is already "science"
// via CelesTrak's own science group.
const SCIENCE_IDS = new Set(["67683", "67685", "67686", "67687", "67688"]);
// Rescues records still tagged "other" after the station allowlist and
// debris check above (and, for the science IDs, the ISS cubesat batch).
// This is where the Worker now does the classification work index.html's
// client-side correctOtherCat() used to redo for every visitor: name
// lookups run once per group fetch instead of once per browser tab. Never
// touches a record a dedicated CelesTrak GROUP already claimed
// (navigation, geo, starlink, science, debris, stations) — only "other"
// records are eligible for reclassification here.
function correctOtherCat(id, name, cat) {
  if (cat !== "other") return cat;
  if (SCIENCE_IDS.has(id)) return "science";
  const n = (name || "").toUpperCase();
  if (NAV_NAME_RE.test(n)) return "navigation";
  if (COMMS_NAME_RE.test(n)) return "communications";
  if (WEATHER_NAME_RE.test(n) || EO_NAME_RE.test(n) || SCI_CONSTELLATION_RE.test(n)) return "science";
  if (CLASSIFIED_NAME_RE.test(n)) return "classified";
  return "other";
}

// Mirrors correctStationCat()/isDockedCrewVehicle() in index.html and
// correct_station_cat() in scripts/update_tles.py. CelesTrak's
// GROUP=stations dump is far more than the crewed modules — it lumps in
// ISS-released hardware, cubesats, debris, and cargo vehicles (Dragon
// CRS, Progress, Cygnus, Tianzhou) co-orbiting nearby. Only the core
// crewed-station module IDs, plus currently-docked crewed vehicles
// (matched by name), keep the "stations" category; everything else the
// feed mislabels falls through to "other" (and may then be reclassified
// by the debris name check above). Without this, /tle tags dozens of
// unrelated objects as stations.
const STATION_CORE_IDS = new Set([
  "25544", "49044", "27386", "28654", "37224", "37820", "36086", // ISS modules
  "48274", "53239", "54216",                                      // CSS Tiangong modules
]);
function isDockedCrewVehicle(name) {
  return /\bCREW\b/i.test(name) || /SOYUZ[- ]MS/i.test(name) || /SHENZHOU/i.test(name);
}
function correctStationCat(id, name, cat) {
  if (cat !== "stations") return cat;
  if (STATION_CORE_IDS.has(id)) return "stations";
  if (isDockedCrewVehicle(name)) return "stations";
  return "other";
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
      const id = noradId(lines[i + 1]);
      // Station allowlist first (drops the feed's bogus "stations" tags to
      // "other"), then the debris name backstop, then the name-pattern
      // rescue for whatever is still "other" — same order as index.html's
      // ingest(): correctOtherCat(correctDebrisCat(correctStationCat(...))).
      // This runs at parse time, before buildTLERecords() merges and
      // before the 20-minute cache stores the response, so every client
      // gets objects that are already fully and correctly categorized —
      // no client-side classification pass needed.
      const finalCat = correctOtherCat(id, name, classifyByName(name, correctStationCat(id, name, cat)));
      recs.push({ name, l1: lines[i + 1], l2: lines[i + 2], cat: finalCat });
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

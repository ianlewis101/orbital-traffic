/**
 * Object classification — the single source of truth.
 *
 * Upstream feeds are messy: CelesTrak's GROUP=stations dump lumps in cargo
 * vehicles, cubesats and debris; the "active" catch-all buries well-known
 * satellites under a generic category; spent rocket stages are tagged
 * inconsistently across groups. Every ingestion path (bundled data, live
 * Worker, direct CelesTrak fallback, data pipeline) runs records through
 * categorize() so the whole system agrees on what an object is.
 */

/** Known display categories. Anything else is normalized to "other". */
export const CATEGORY_IDS = [
  "stations",
  "capsules",
  "navigation",
  "geostationary",
  "starlink",
  "oneweb",
  "kuiper",
  "communications",
  "science",
  "other",
  "classified",
  "debris",
  "hazardous",
  "cool",
];
const CATEGORY_SET = new Set(CATEGORY_IDS);

/**
 * Only permanent, structural station modules may carry the "stations"
 * category, and only by ID. CelesTrak's GROUP=stations dump also includes
 * docking vehicles (crewed capsules, cargo ships), released hardware, and
 * co-orbiting cubesats — docking vehicles earn their own "capsules"
 * category separately, by name, via isStationVehicle() below; everything
 * else demotes to "other".
 */
export const STATION_CORE_IDS = new Set([
  "25544",
  "49044",
  "27386",
  "28654",
  "37224",
  "37820",
  "36086", // ISS modules
  "48274",
  "53239",
  "54216", // CSS Tiangong modules
]);

export const CREW_VEHICLE_RE = /\bCREW\b/;

/**
 * Catalogs hyphenate vehicle names inconsistently in both directions
 * ("SOYUZ-MS 28", "SOYUZ MS-29", "CREW-DRAGON", "CST-100 STARLINER"), so
 * every crew/cargo pattern is matched against a normalized form — uppercase,
 * hyphens/underscores collapsed to single spaces — instead of trying to
 * enumerate separator variants inside each regex. Shared by both
 * CREW_VEHICLE_PATTERNS and CARGO_VEHICLE_PATTERNS.
 */
export function normalizeVehicleName(name) {
  return (name || "").toUpperCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
}

/**
 * The single crewed-vehicle pattern table, shared by isDockedCrewVehicle()
 * (station-allowlist eligibility) and capsuleFamily() (per-capsule phase
 * tracking) so the two can never disagree about what counts as a capsule.
 * Regexes run against normalizeVehicleName() output — write them space-
 * separated and uppercase.
 *
 * dragon: deliberately not a bare DRAGON pattern — that also matches
 * uncrewed cargo Dragon ("DRAGON CRS-29"), which must never be tracked as
 * a crewed capsule (see CARGO_VEHICLE_PATTERNS' separate dragon-cargo entry
 * for that). CREW DRAGON (the generic bus name at launch) and the
 * individually-named reusable crew airframes are the only safe anchors.
 * GRACE excludes the GRACE-FO science pair ("GRACE FO 1" once normalized).
 * shenzhou: SHENZHOU only, never bare SZ-\d+ — jettisoned "SZ-nn MODULE"
 * hardware must keep falling through to the debris backstop.
 * mengzhou/gaganyaan/orion: upcoming crewed vehicles, inert until they
 * appear in the catalog.
 */
export const CREW_VEHICLE_PATTERNS = [
  [
    "dragon",
    /\bCREW DRAGON\b|\bDRAGON (?:ENDEAVOUR|ENDURANCE|RESILIENCE|FREEDOM|GRACE)\b|\b(?:ENDEAVOUR|ENDURANCE|RESILIENCE|FREEDOM)\b|\bGRACE\b(?! FO\b)/,
  ],
  ["soyuz", /\bSOYUZ MS\b/],
  ["starliner", /STARLINER|\bCST 100\b/],
  ["shenzhou", /SHENZHOU/],
  ["mengzhou", /MENGZHOU/],
  ["gaganyaan", /GAGANYAAN/],
  ["orion", /\bORION\b/],
];

export function isDockedCrewVehicle(name) {
  const n = normalizeVehicleName(name);
  return CREW_VEHICLE_RE.test(n) || CREW_VEHICLE_PATTERNS.some(([, re]) => re.test(n));
}

/**
 * Which crewed-vehicle family a name belongs to, or null. A name can be
 * crewed-but-unrecognized (generic \bCREW\b match with no family pattern):
 * it still classifies as "capsules", but callers get null here.
 */
export function capsuleFamily(name) {
  const n = normalizeVehicleName(name);
  for (const [family, re] of CREW_VEHICLE_PATTERNS) {
    if (re.test(n)) return family;
  }
  return null;
}

/**
 * Uncrewed cargo/resupply vehicles — the counterpart to CREW_VEHICLE_PATTERNS.
 * 2026-07-10: Ian decided cargo vehicles should count as station traffic
 * while actively tracked, same as crewed capsules, and disappear immediately
 * (not demote to "other") once landed/de-orbited — both families are "Famous
 * Objects" users specifically search for. (2026-07-16: both now earn their
 * own "capsules" category rather than "stations" — see isStationVehicle()'s
 * comment.) Kept as a separate table from
 * CREW_VEHICLE_PATTERNS rather than merged in, because the two must never
 * be allowed to overlap on the same name — dragon-cargo below anchors on
 * "DRAGON CRS", which CREW_VEHICLE_PATTERNS' dragon entry deliberately
 * excludes (see its comment). htv/HTV-X intentionally omitted: not
 * currently in the catalog, so there's nothing to verify the pattern
 * against — add it if/when Japan's resupply vehicle reappears.
 */
export const CARGO_VEHICLE_PATTERNS = [
  ["progress", /\bPROGRESS\b/],
  ["cygnus", /\bCYGNUS\b/],
  ["tianzhou", /\bTIANZHOU\b/],
  ["dragon-cargo", /\bDRAGON CRS\b/],
];

export function isCargoVehicle(name) {
  const n = normalizeVehicleName(name);
  return CARGO_VEHICLE_PATTERNS.some(([, re]) => re.test(n));
}

/** Which cargo-vehicle family a name belongs to, or null. */
export function cargoFamily(name) {
  const n = normalizeVehicleName(name);
  for (const [family, re] of CARGO_VEHICLE_PATTERNS) {
    if (re.test(n)) return family;
  }
  return null;
}

/**
 * True for anything that should earn the "capsules" category while tracked —
 * crewed capsule or cargo vehicle alike (split out from "stations" 2026-07-16,
 * so structural modules and docking vehicles can be shown/hidden
 * independently). The single check shared by correctStationCat() and
 * correctOtherCat() so both directions (demotion and promotion) agree on
 * exactly the same set of vehicles.
 */
export function isStationVehicle(name) {
  return isDockedCrewVehicle(name) || isCargoVehicle(name);
}

/** capsuleFamily() if crewed, else cargoFamily() if cargo, else null. */
export function vehicleFamily(name) {
  return capsuleFamily(name) ?? cargoFamily(name);
}

export function correctStationCat(id, name, cat) {
  if (cat !== "stations") return cat;
  if (STATION_CORE_IDS.has(id)) return "stations";
  if (isStationVehicle(name)) return "capsules";
  return "other";
}

/**
 * OneWeb shares its CelesTrak group history with Starlink (audit F9):
 * groups.js now tags GROUP=oneweb records "oneweb" directly, but any record
 * fetched or bundled before that fix — including apps/web/public/data/
 * satellites.json until its next scheduled refresh — still carries the old
 * "starlink" tag. Reclassified by name here, the same way correctOtherCat()
 * rescues Kuiper, so the fix is correct immediately instead of depending on
 * exactly when the data was last refreshed.
 */
const ONEWEB_NAME_RE = /ONEWEB/;

export function correctStarlinkCat(name, cat) {
  if (cat !== "starlink") return cat;
  return ONEWEB_NAME_RE.test((name || "").toUpperCase()) ? "oneweb" : cat;
}

/**
 * Rocket bodies and debris fragments merge into one "debris" category.
 * Feeds tag these inconsistently — some have dedicated debris groups,
 * others bury stragglers under "active" — so names are matched regardless
 * of which group a record arrived under.
 */
const DEBRIS_NAME_RE =
  / DEB | DEBRIS | FRAGMENT | FRAG | R\/B | ROCKET BODY | ROCKET | STAGE | ARIANE | DELTA | ATLAS | TITAN /;
/**
 * Hardware released or jettisoned from a crewed station (cameras, experiment
 * housings, unidentified ISS-origin objects, Shenzhou orbital modules left
 * behind after crew return) that CelesTrak still lists under "stations" but
 * which is inert and decaying. Kept narrow so it can't catch co-orbiting
 * cubesats (KNACKSAT, GXIBA-1, …) or cargo vehicles (PROGRESS, CYGNUS,
 * TIANZHOU).
 */
const ISS_HARDWARE_RE = / MONOBLOCK | DUPLEX | ISS OBJECT | SZ-\d+ MODULE /;

export function isDebrisName(name) {
  const n = " " + (name || "").toUpperCase() + " ";
  return (
    DEBRIS_NAME_RE.test(n) ||
    ISS_HARDWARE_RE.test(n) ||
    n.includes("CZ-") ||
    n.includes("SL-") ||
    n.includes("PSLV R/B")
  );
}

export function correctDebrisCat(name, cat) {
  if (cat === "cool") return cat; // never override hand-curated hero objects
  return isDebrisName(name) ? "debris" : cat;
}

/**
 * Name patterns for rescuing records that arrive tagged "other" via the
 * generic "active" catch-all.
 *
 * These are bare substrings with no boundary characters: operators
 * hyphenate generation/variant suffixes onto the base word inconsistently
 * in both directions — "BEIDOU-2 M3", "GLONASS-M 758", "SENTINEL-2B",
 * "WORLDVIEW-3" (suffix glued on) and "GEO-KOMPSAT-2A" (prefix glued on) —
 * so any fixed boundary misses real satellites. The tokens are distinctive
 * multi-character constellation names, so bare matching carries negligible
 * false-positive risk.
 */
export const NAV_NAME_RE = /GPS|NAVSTAR|GALILEO|GLONASS|BEIDOU|CENTISPACE/;
/** Amazon's Kuiper broadband constellation ("KUIPER-00008"); no dedicated CelesTrak group yet. */
export const KUIPER_NAME_RE = /KUIPER/;
export const WEATHER_NAME_RE = /GOES|METEOSAT|HIMAWARI|NOAA|METOP|METEOR|DMSP|ELEKTRO|FENGYUN/;
export const EO_NAME_RE = /LANDSAT|SENTINEL|TERRA|AQUA|WORLDVIEW|SPOT|DOVE|ICEYE|PLEIADES/;
/** Major LEO/MEO comms and IoT/AIS constellations with no dedicated CelesTrak group. */
export const COMMS_NAME_RE =
  /IRIDIUM|GLOBALSTAR|ORBCOMM|O3B|HULIANWANG|GEESAT|SITRO-AIS|GONETS-M|CONNECTA|RASSVET-3|APRIZESAT|NINGXIA-1|SCS-01|LEMUR|MERIDIAN/;
/** Earth-observation/imaging constellations and tech-demo cubesats beyond the weather/EO sets. */
export const SCI_CONSTELLATION_RE =
  /FLOCK|JILIN-1|TIANMU|YUNHAI|TIANHUI|SUPERVIEW|AEROCUBE|WILDFIRE|CHUANGXIN|CARTOSAT|KOMPSAT|ARIRANG|PROBA|RADARSAT|RESOURCESAT|CBERS/;
/**
 * Known military/intelligence naming schemes, surfaced as their own
 * "classified" category instead of "other". Deliberately no generic
 * /COSMOS/ pattern: most COSMOS-named objects are ordinary (often defunct)
 * Russian satellites, and some are GLONASS birds already caught by
 * NAV_NAME_RE. SHIJIAN uses [-\s]* because the real catalog name is
 * hyphenated ("SHIJIAN-21").
 */
export const CLASSIFIED_NAME_RE =
  /\bUSA\s+\d+\b|\bNROL\b|\bYAOGAN\b|\bPRAETORIAN\b|\bCHANGGUANG\b|\bSHIJIAN[-\s]*\d+[A-Z]?\b/;

/**
 * Records that belong outside "other" but share no reliable name pattern
 * with anything else — one-off tech demonstrators, single national EO/
 * ocean/soil-moisture missions, calibration targets, cataloged fragments
 * named only by international designator ("2022-023E") or generic "test
 * object" label — so they're listed by NORAD ID instead of matched by name.
 * Same precedent in each case: an ID allowlist for objects a regex can't
 * safely reach without false-positive risk.
 *
 * SCIENCE_IDS includes the original ISS-deployed educational CubeSat batch
 * (67683-67688; CORAL/67684 is already "science" via CelesTrak's own
 * science group) plus a 2026-07-10 curated batch of individually-verified
 * objects.
 */
export const SCIENCE_IDS = new Set([
  "67683",
  "67685",
  "67686",
  "67687",
  "67688",
  "01361",
  "31113",
  "35932",
  "40376",
  "40970",
  "41899",
  "43776",
  "44072",
  "44634",
  "53109",
  "54754",
  "56178",
  "57630",
  "58957",
  "60419",
  "63263",
  "65301",
  "66657",
  "67556",
]);
/** Cataloged fragments/sub-payloads with no name DEBRIS_NAME_RE can match. */
export const DEBRIS_IDS = new Set(["51950", "69320"]);
/** One-off comms/data-relay satellites with no shared constellation name (see COMMS_NAME_RE for those that do). */
export const COMMS_IDS = new Set(["23439", "59072"]);
/** One-off military satellites identified by individual codename rather than a recognizable scheme (see CLASSIFIED_NAME_RE). */
export const CLASSIFIED_IDS = new Set(["57757"]);

/**
 * Rescues records still tagged "other" after the station allowlist and the
 * debris check. Never touches a record a dedicated CelesTrak group already
 * claimed — only "other" records are eligible.
 *
 * Crew and cargo vehicles are checked first: a docking vehicle that arrives
 * via the generic "active"/"last-30-days" catch-alls (a free-flying private
 * mission, or a fresh launch not yet in CelesTrak's stations group) would
 * otherwise stay "other" — which the app hides by default — instead of
 * "capsules". This is the promotion mirror of correctStationCat(): both
 * directions use isStationVehicle(), so the capsules category stays exactly
 * the set of crew/cargo vehicle names (the "stations" category itself stays
 * exactly STATION_CORE_IDS — permanent structural modules only). Jettisoned
 * crew hardware can't sneak in — the debris backstop runs before this rescue.
 *
 * The four *_IDS allowlists are checked next, before any name regex: they
 * are individually-verified objects with no safe shared pattern, so ID
 * lookup is the only reliable match.
 */
export function correctOtherCat(id, name, cat) {
  if (cat !== "other") return cat;
  if (isStationVehicle(name)) return "capsules";
  if (SCIENCE_IDS.has(id)) return "science";
  if (DEBRIS_IDS.has(id)) return "debris";
  if (COMMS_IDS.has(id)) return "communications";
  if (CLASSIFIED_IDS.has(id)) return "classified";
  const n = (name || "").toUpperCase();
  if (NAV_NAME_RE.test(n)) return "navigation";
  if (COMMS_NAME_RE.test(n)) return "communications";
  if (WEATHER_NAME_RE.test(n) || EO_NAME_RE.test(n) || SCI_CONSTELLATION_RE.test(n))
    return "science";
  if (CLASSIFIED_NAME_RE.test(n)) return "classified";
  if (KUIPER_NAME_RE.test(n)) return "kuiper";
  return "other";
}

/**
 * Canonical classification pipeline, in the canonical order:
 *   1. station allowlist (keeps "stations" for STATION_CORE_IDS only; drops
 *      docking vehicles to "capsules", everything else to "other")
 *   2. starlink allowlist (reclaims stale/mistagged OneWeb records by name)
 *   3. debris name backstop
 *   4. name-pattern rescue for whatever is still "other" (crew/cargo vehicle
 *      promotion to "capsules" first, then nav/comms/science/classified/
 *      kuiper)
 * Unknown input categories normalize to "other" first.
 */
export function categorize(id, name, cat) {
  const base = CATEGORY_SET.has(cat) ? cat : "other";
  return correctOtherCat(
    id,
    name,
    correctDebrisCat(name, correctStarlinkCat(name, correctStationCat(id, name, base)))
  );
}

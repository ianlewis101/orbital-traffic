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
  "navigation",
  "geostationary",
  "starlink",
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
 * Only true crewed-station modules may carry the "stations" category.
 * CelesTrak's GROUP=stations dump also includes cargo vehicles (Dragon CRS,
 * Progress, Cygnus, Tianzhou), released hardware, and co-orbiting cubesats.
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
 * Catalogs hyphenate crew-vehicle names inconsistently in both directions
 * ("SOYUZ-MS 28", "SOYUZ MS-29", "CREW-DRAGON", "CST-100 STARLINER"), so
 * every crew pattern is matched against a normalized form — uppercase,
 * hyphens/underscores collapsed to single spaces — instead of trying to
 * enumerate separator variants inside each regex.
 */
function normalizeCrewName(name) {
  return (name || "").toUpperCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
}

/**
 * The single crewed-vehicle pattern table, shared by isDockedCrewVehicle()
 * (station-allowlist eligibility) and capsuleFamily() (per-capsule phase
 * tracking) so the two can never disagree about what counts as a capsule.
 * Regexes run against normalizeCrewName() output — write them space-
 * separated and uppercase.
 *
 * dragon: deliberately not a bare DRAGON pattern — that also matches
 * uncrewed cargo Dragon ("DRAGON CRS-29"), which must never be tracked as
 * a crewed capsule. CREW DRAGON (the generic bus name at launch) and the
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
  const n = normalizeCrewName(name);
  return CREW_VEHICLE_RE.test(n) || CREW_VEHICLE_PATTERNS.some(([, re]) => re.test(n));
}

/**
 * Which crewed-vehicle family a name belongs to, or null. A name can be
 * crewed-but-unrecognized (generic \bCREW\b match with no family pattern):
 * it still classifies as "stations", but callers get null here.
 */
export function capsuleFamily(name) {
  const n = normalizeCrewName(name);
  for (const [family, re] of CREW_VEHICLE_PATTERNS) {
    if (re.test(n)) return family;
  }
  return null;
}

export function correctStationCat(id, name, cat) {
  if (cat !== "stations") return cat;
  if (STATION_CORE_IDS.has(id)) return "stations";
  if (isDockedCrewVehicle(name)) return "stations";
  return "other";
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
export const WEATHER_NAME_RE = /GOES|METEOSAT|HIMAWARI|NOAA|METOP|METEOR|DMSP|ELEKTRO|FENGYUN/;
export const EO_NAME_RE = /LANDSAT|SENTINEL|TERRA|AQUA|WORLDVIEW|SPOT|DOVE|ICEYE|PLEIADES/;
/** Major LEO/MEO comms and IoT/AIS constellations with no dedicated CelesTrak group. */
export const COMMS_NAME_RE =
  /IRIDIUM|GLOBALSTAR|ORBCOMM|O3B|HULIANWANG|GEESAT|SITRO-AIS|GONETS-M|CONNECTA|RASSVET-3|APRIZESAT|NINGXIA-1|SCS-01/;
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
 * ISS-deployed educational CubeSats (batch 67683-67688) arrive via the
 * "stations" group and fall to "other" after the station allowlist; no
 * shared name pattern exists for them, so they are listed by NORAD ID.
 * CORAL (67684) is already "science" via CelesTrak's own science group.
 */
export const SCIENCE_IDS = new Set(["67683", "67685", "67686", "67687", "67688"]);

/**
 * Rescues records still tagged "other" after the station allowlist and the
 * debris check. Never touches a record a dedicated CelesTrak group already
 * claimed — only "other" records are eligible.
 *
 * Crew vehicles are checked first: a capsule that arrives via the generic
 * "active"/"last-30-days" catch-alls (a free-flying private mission, or a
 * fresh launch not yet in CelesTrak's stations group) would otherwise stay
 * "other" — which the app hides by default — instead of "stations". This
 * is the promotion mirror of correctStationCat(): both directions use
 * isDockedCrewVehicle(), so the stations category stays exactly
 * STATION_CORE_IDS + crew-vehicle names. Jettisoned crew hardware can't
 * sneak in — the debris backstop runs before this rescue.
 */
export function correctOtherCat(id, name, cat) {
  if (cat !== "other") return cat;
  if (isDockedCrewVehicle(name)) return "stations";
  if (SCIENCE_IDS.has(id)) return "science";
  const n = (name || "").toUpperCase();
  if (NAV_NAME_RE.test(n)) return "navigation";
  if (COMMS_NAME_RE.test(n)) return "communications";
  if (WEATHER_NAME_RE.test(n) || EO_NAME_RE.test(n) || SCI_CONSTELLATION_RE.test(n))
    return "science";
  if (CLASSIFIED_NAME_RE.test(n)) return "classified";
  return "other";
}

/**
 * Canonical classification pipeline, in the canonical order:
 *   1. station allowlist (drops bogus "stations" tags to "other")
 *   2. debris name backstop
 *   3. name-pattern rescue for whatever is still "other" (crew-vehicle
 *      promotion back to "stations" first, then nav/comms/science/classified)
 * Unknown input categories normalize to "other" first.
 */
export function categorize(id, name, cat) {
  const base = CATEGORY_SET.has(cat) ? cat : "other";
  return correctOtherCat(id, name, correctDebrisCat(name, correctStationCat(id, name, base)));
}

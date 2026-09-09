/**
 * CelesTrak GP data source definitions, shared by the Cloudflare Worker,
 * the data pipeline, and the web app's direct-fetch fallback.
 */

/**
 * CSV, not TLE. The fixed-width TLE format can't hold a catalog number wider
 * than five characters, and CelesTrak's response to that is to omit those
 * objects from FORMAT=tle altogether — silently, with no gap in the output.
 * CSV carries the full numeric NORAD_CAT_ID (and is ~10% smaller than the
 * TLE feed); parseGp() synthesizes the TLE lines downstream consumers need.
 */
export const CELESTRAK_BASE = "https://celestrak.org/NORAD/elements/gp.php?FORMAT=csv&GROUP=";

/**
 * Groups fetched for the full catalog, listed in merge priority order.
 * Specific groups (stations, navigation, geo, debris) come first so they
 * claim a NORAD ID before the generic "active" catch-all is merged in —
 * "active" contains nearly every payload in orbit, so it must run last or
 * it would overwrite more precise categorization from the groups above it.
 */
export const GROUPS = [
  ["stations", "stations"],
  ["gps-ops", "navigation"],
  ["galileo", "navigation"],
  // CelesTrak renamed this group from "glonass" to "glo-ops" at some point
  // before 2026-08-21 with no notice — GROUP=glonass now 404s with "not
  // found" rather than returning empty data. Found 2026-09-03 via
  // refresh-tle-data.yml's own failure logs: it fetches all 13 GROUPS
  // successfully every single day except this one (0 objects, correctly
  // treated as a fetch failure by its all-or-nothing safety guard — see
  // tools/fetch-tles.mjs), which meant the *entire* bundled-catalog refresh
  // had been silently blocked every day for two weeks (last successful run
  // 2026-08-20) even though 12 of 13 groups were completely healthy the
  // whole time. Also silently dropped every GLONASS satellite from the
  // Worker's /tle and the client's CelesTrak-direct fallback for the same
  // two weeks, since neither of those paths has (or should have) an
  // all-or-nothing guard — they just merged in zero GLONASS records with no
  // error at all. Verified directly against the real endpoint: GROUP=glo-ops
  // returns 29 real GLONASS satellites; GROUP=glonass returns "GROUP=glonass
  // not found".
  ["glo-ops", "navigation"],
  ["geo", "geostationary"],
  ["cosmos-2251-debris", "debris"],
  ["iridium-33-debris", "debris"],
  ["fengyun-1c-debris", "debris"],
  ["starlink", "starlink"],
  ["oneweb", "oneweb"],
  ["science", "science"],
  // Fresh launches take a while to graduate into "active"; without this
  // group a just-launched object (a new crewed capsule especially) is
  // absent from every feed. Merged before "active" (same cat, id-deduped).
  ["last-30-days", "other"],
  ["active", "other"],
];

export const FETCH_HEADERS = {
  "User-Agent": "OrbitalTraffic/2.0 (+https://orbitaltraffic.app)",
  Accept: "text/csv",
};

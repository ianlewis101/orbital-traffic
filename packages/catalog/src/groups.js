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
  ["glonass", "navigation"],
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

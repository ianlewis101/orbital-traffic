/**
 * CelesTrak GP data source definitions, shared by the Cloudflare Worker,
 * the data pipeline, and the web app's direct-fetch fallback.
 */

export const CELESTRAK_BASE = "https://celestrak.org/NORAD/elements/gp.php?FORMAT=tle&GROUP=";

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
  ["oneweb", "starlink"],
  ["science", "science"],
  ["active", "other"],
];

export const FETCH_HEADERS = {
  "User-Agent": "OrbitalTraffic/2.0 (+https://orbitaltraffic.app)",
  Accept: "text/plain",
};

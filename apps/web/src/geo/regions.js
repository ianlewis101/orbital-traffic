import { DATA } from "../data/store.js";

/** Point-in-polygon test against the bundled coastline rings. */
export function pointInLand(lat, lon) {
  let inside = false;
  for (const ring of DATA.land) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0],
        yi = ring[i][1],
        xj = ring[j][0],
        yj = ring[j][1];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)
        inside = !inside;
    }
  }
  return inside;
}

/** Human-readable region name for a ground point ("over Siberia", "over the North Pacific"…). */
export function regionName(lat, lon) {
  const land = pointInLand(lat, lon),
    L = (a, b) => lon >= a && lon <= b;
  if (lat <= -60) return land ? "Antarctica" : "the Southern Ocean";
  if (lat >= 70) return land ? (L(-73, -10) ? "Greenland" : "the Arctic") : "the Arctic Ocean";
  if (land) {
    if (L(-168, -52) && lat >= 14) return "North America";
    if (L(-82, -34) && lat < 14) return "South America";
    if (L(-12, 40) && lat >= 35) return "Europe";
    if (L(34, 63) && lat >= 12 && lat <= 42) return "the Middle East";
    if (L(-18, 52) && lat < 37) return "Africa";
    if (L(112, 154) && lat <= -10) return "Australia";
    if (L(92, 141) && lat <= 24) return "Southeast Asia";
    if (L(100, 150) && lat >= 18) return "East Asia";
    if (L(60, 92) && lat <= 35) return "South Asia";
    if (L(40, 180) && lat >= 48) return "Siberia";
    if (L(44, 100)) return "Central Asia";
    return "land";
  }
  if (L(20, 120) && lat <= 30) return "the Indian Ocean";
  if (lat >= 0) return L(-80, -5) ? "the North Atlantic" : "the North Pacific";
  return L(-70, 20) ? "the South Atlantic" : "the South Pacific";
}

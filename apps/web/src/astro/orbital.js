import { MU, EARTH_KM } from "../config.js";
import { sunDirECI } from "./sun.js";

/** Classical elements derived from an SGP4 record. */
export function orbital(rec) {
  const n = rec.no / 60,
    a = Math.cbrt(MU / (n * n)),
    e = rec.ecco;
  return {
    a,
    e,
    inc: (rec.inclo * 180) / Math.PI,
    periodMin: (2 * Math.PI) / rec.no,
    apo: a * (1 + e) - EARTH_KM,
    per: a * (1 - e) - EARTH_KM,
  };
}

export function orbitClass(alt, ecc) {
  if (ecc > 0.25)
    return { name: "Highly Elliptical", note: "swings far out, then dives back close to Earth" };
  if (alt >= 34000)
    return {
      name: "Geostationary",
      note: "appears to hang motionless over one spot on the equator",
    };
  if (alt >= 2000)
    return { name: "Medium Earth Orbit", note: "a high vantage point, ideal for navigation" };
  return { name: "Low Earth Orbit", note: "can appear as a fast-moving star at dawn or dusk" };
}

/** Is an ECI position (km) in sunlight, or inside Earth's shadow cylinder? */
export function sunlit(r, date) {
  const s = sunDirECI(date),
    dot = r.x * s.x + r.y * s.y + r.z * s.z;
  if (dot >= 0) return true;
  const px = r.x - dot * s.x,
    py = r.y - dot * s.y,
    pz = r.z - dot * s.z;
  return Math.sqrt(px * px + py * py + pz * pz) > EARTH_KM;
}

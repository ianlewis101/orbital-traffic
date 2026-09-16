/**
 * How far away the deep-space objects in data/deep-space.js are right now.
 *
 * These cannot go through safeProp()/SGP4 (no TLE, and they don't orbit Earth)
 * and the "escape" ones cannot go through neoGeocentric() either — their orbits
 * are hyperbolic, and its elliptical solveKepler() yields NaN for a < 0. Each
 * entry's `kind` selects its model; see the header of data/deep-space.js for
 * why each object needs the one it has.
 *
 * Only distance is computed, not direction: nothing here is rendered in the
 * scene, so a position/direction API would be speculative weight.
 *
 * Like astro/overhead.js, every function rejects non-finite results rather than
 * passing them on. A NaN distance would sail straight through a `<` threshold
 * and render as "NaN km" in the search panel.
 */
import { AU_KM, earthHelio, julianDay, neoGeocentric } from "./neo.js";

/** Speed of light, km/s. */
export const LIGHT_KM_S = 299792.458;

/**
 * Distance from Earth, in km, or null if the entry can't be modelled.
 *
 * Frames differ per branch (neoGeocentric() returns equatorial, the escape
 * branch subtracts in ecliptic) but only the magnitude is taken, and a vector's
 * length is the same in both — they share an origin and differ by a rotation.
 */
export function deepSpaceDistanceKm(entry, dateMs) {
  if (!entry) return null;
  let km = null;
  if (entry.kind === "fixed") {
    km = entry.distKm;
  } else if (entry.kind === "orbit") {
    const g = neoGeocentric(entry.el, dateMs);
    km = Math.hypot(g.x, g.y, g.z);
  } else if (entry.kind === "escape") {
    const JD = julianDay(dateMs);
    const dt = JD - entry.epoch;
    const E = earthHelio(JD);
    km =
      Math.hypot(
        entry.p[0] + entry.v[0] * dt - E.x,
        entry.p[1] + entry.v[1] * dt - E.y,
        entry.p[2] + entry.v[2] * dt - E.z
      ) * AU_KM;
  }
  return Number.isFinite(km) ? km : null;
}

/** One-way light travel time in seconds for a distance in km. */
export function lightSeconds(km) {
  return Number.isFinite(km) ? km / LIGHT_KM_S : null;
}

/**
 * One-way light time as words — "23 h 49 m", "4.2 m", "5.0 s".
 *
 * The unit steps down as the number shrinks so the phrase stays short enough
 * for a search-result row on a phone: Webb's 5 seconds and Voyager 1's day are
 * both two tokens wide.
 */
export function fmtLightTime(km) {
  const s = lightSeconds(km);
  if (s === null) return "—";
  if (s < 60) return `${s.toFixed(1)} s`;
  if (s < 3600) return `${(s / 60).toFixed(1)} m`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s - h * 3600) / 60);
  // 59.6 minutes must not render as "3 h 60 m"
  return m === 60 ? `${h + 1} h 0 m` : `${h} h ${m} m`;
}

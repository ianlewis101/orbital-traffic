import type { NeoElements, Vec3 } from './types.js';
import { dateToJulian } from './time.js';

/** Gaussian gravitational constant, AU^1.5 / day. */
const GAUSS_K = 0.01720209895;
const DEG2RAD = Math.PI / 180;

/** Heliocentric mean motion for a near-Earth object, radians per day. */
export function neoMeanMotion(a: number): number {
  return GAUSS_K / (a * Math.sqrt(a));
}

/** Solve Kepler's equation M = E - e·sin E for the eccentric anomaly E. */
export function solveKepler(meanAnomaly: number, e: number, tolerance = 1e-8): number {
  let E = e < 0.8 ? meanAnomaly : Math.PI;
  for (let iter = 0; iter < 60; iter++) {
    const dE = (E - e * Math.sin(E) - meanAnomaly) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < tolerance) break;
  }
  return E;
}

/**
 * Rotate a perifocal-frame point (x toward perihelion, AU) into the
 * heliocentric ecliptic frame using the orbital angles (radians).
 */
function perifocalToEcliptic(
  xp: number,
  yp: number,
  inc: number,
  raan: number,
  argp: number,
): Vec3 {
  const cosO = Math.cos(raan);
  const sinO = Math.sin(raan);
  const cosI = Math.cos(inc);
  const sinI = Math.sin(inc);
  const cosW = Math.cos(argp);
  const sinW = Math.sin(argp);

  return {
    x: (cosO * cosW - sinO * sinW * cosI) * xp + (-cosO * sinW - sinO * cosW * cosI) * yp,
    y: (sinO * cosW + cosO * sinW * cosI) * xp + (-sinO * sinW + cosO * cosW * cosI) * yp,
    z: sinW * sinI * xp + cosW * sinI * yp,
  };
}

/**
 * Heliocentric ecliptic position (AU) of a NEO at a given date.
 */
export function neoPositionAt(el: NeoElements, date: Date): Vec3 {
  const jd = dateToJulian(date);
  const n = neoMeanMotion(el.a); // rad/day
  const M = el.ma * DEG2RAD + n * (jd - el.epoch);
  const E = solveKepler(((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), el.e);

  // Perifocal coordinates (focus at the Sun).
  const xp = el.a * (Math.cos(E) - el.e);
  const yp = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);

  return perifocalToEcliptic(xp, yp, el.i * DEG2RAD, el.om * DEG2RAD, el.w * DEG2RAD);
}

/**
 * Sample a NEO's full orbit as a closed loop of heliocentric points (AU),
 * suitable for drawing the orbit ring. Points are spaced uniformly in
 * eccentric anomaly (denser near perihelion — visually fine for a ring).
 */
export function neoOrbitPath(el: NeoElements, segments = 160): Vec3[] {
  const inc = el.i * DEG2RAD;
  const raan = el.om * DEG2RAD;
  const argp = el.w * DEG2RAD;
  const b = el.a * Math.sqrt(1 - el.e * el.e);
  const path: Vec3[] = [];
  for (let k = 0; k <= segments; k++) {
    const E = (k / segments) * 2 * Math.PI;
    const xp = el.a * (Math.cos(E) - el.e);
    const yp = b * Math.sin(E);
    path.push(perifocalToEcliptic(xp, yp, inc, raan, argp));
  }
  return path;
}

/** Parsed diameter in km, or `undefined` when the source omits it. */
export function neoDiameterKm(el: NeoElements): number | undefined {
  if (!el.diam) return undefined;
  const v = Number.parseFloat(el.diam);
  return Number.isFinite(v) ? v : undefined;
}

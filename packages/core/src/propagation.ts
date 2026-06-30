import {
  twoline2satrec,
  propagate,
  gstime,
  eciToGeodetic,
  degreesLat,
  degreesLong,
  type SatRec,
} from 'satellite.js';
import type { OrbitalObject, OrbitMeta, PropagatedState } from './types.js';
import { EARTH_EQUATORIAL_KM, MU_EARTH } from './constants.js';

/**
 * Wraps a single object's SGP4 propagation. Construct once, then call
 * {@link propagateAt} every tick. Throws on an un-parseable TLE so callers can
 * skip the object — use {@link createPropagator} for a non-throwing factory.
 */
export class Propagator {
  readonly object: OrbitalObject;
  readonly satrec: SatRec;
  private cachedMeta: OrbitMeta | null = null;

  constructor(object: OrbitalObject) {
    const satrec = twoline2satrec(object.line1, object.line2);
    // satellite.js sets a non-zero `error` code on bad elements — but it also
    // happily returns a zero-filled satrec for outright garbage input, so we
    // additionally require a finite, positive mean motion (a real orbit has
    // one, and it guards orbitMeta() against divide-by-zero).
    if (!satrec || (satrec.error && satrec.error !== 0) || !(satrec.no > 0)) {
      throw new Error(`Un-propagatable TLE for ${object.id} (error ${satrec?.error ?? '?'})`);
    }
    this.object = object;
    this.satrec = satrec;
  }

  /** Propagate to `date`. Returns `null` if SGP4 fails (decayed/diverged). */
  propagateAt(date: Date): PropagatedState | null {
    const pv = propagate(this.satrec, date);
    const eci = pv.position;
    if (!eci || typeof eci === 'boolean' || Number.isNaN(eci.x)) return null;

    const gmst = gstime(date);
    const geo = eciToGeodetic(eci, gmst);
    const vel = pv.velocity;
    const speedKmS =
      vel && typeof vel !== 'boolean' ? Math.hypot(vel.x, vel.y, vel.z) : 0;

    return {
      eci: { x: eci.x, y: eci.y, z: eci.z },
      latitudeDeg: degreesLat(geo.latitude),
      longitudeDeg: degreesLong(geo.longitude),
      altitudeKm: geo.height,
      speedKmS,
    };
  }

  /** Static orbit geometry derived from the element set (computed once). */
  orbitMeta(): OrbitMeta {
    if (this.cachedMeta) return this.cachedMeta;
    const s = this.satrec;
    const nRadPerMin = s.no; // mean motion, radians/minute
    const nRadPerSec = nRadPerMin / 60;
    const periodMin = (2 * Math.PI) / nRadPerMin;
    const e = s.ecco;
    // Semi-major axis from the vis-viva relation a = (mu / n²)^(1/3).
    const aKm = Math.cbrt(MU_EARTH / (nRadPerSec * nRadPerSec));
    this.cachedMeta = {
      inclinationDeg: (s.inclo * 180) / Math.PI,
      periodMin,
      eccentricity: e,
      apogeeKm: aKm * (1 + e) - EARTH_EQUATORIAL_KM,
      perigeeKm: aKm * (1 - e) - EARTH_EQUATORIAL_KM,
      meanMotionRevPerDay: (nRadPerMin * 1440) / (2 * Math.PI),
    };
    return this.cachedMeta;
  }
}

/** Non-throwing factory — returns `null` for un-propagatable element sets. */
export function createPropagator(object: OrbitalObject): Propagator | null {
  try {
    return new Propagator(object);
  } catch {
    return null;
  }
}

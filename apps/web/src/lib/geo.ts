import { gstime } from 'satellite.js';
import { EARTH_RADIUS_KM } from '@orbital/core';

/**
 * Rendering frame: an Earth-fixed sphere of radius 1 scene-unit. North is +Y;
 * the prime meridian / equator point (lat 0, lon 0) is +X; longitude increases
 * toward +Z. Every satellite position and the Earth texture share this single
 * mapping, which is what keeps objects sitting over the right ground point.
 */
export const EARTH_UNIT = 1;
const DEG = Math.PI / 180;

export interface XYZ {
  x: number;
  y: number;
  z: number;
}

/** Geodetic (radians) → scene-unit Cartesian, writing into `out` if given. */
export function geoToVecRad(latRad: number, lonRad: number, radius: number, out?: XYZ): XYZ {
  const cosLat = Math.cos(latRad);
  const target = out ?? { x: 0, y: 0, z: 0 };
  target.x = radius * cosLat * Math.cos(lonRad);
  target.y = radius * Math.sin(latRad);
  target.z = radius * cosLat * Math.sin(lonRad);
  return target;
}

/** Geodetic (degrees) → scene-unit Cartesian. */
export function geoToScene(latDeg: number, lonDeg: number, radius: number, out?: XYZ): XYZ {
  return geoToVecRad(latDeg * DEG, lonDeg * DEG, radius, out);
}

/** Convert an altitude in km to a scene radius from the Earth's centre. */
export function altitudeToRadius(altitudeKm: number): number {
  return EARTH_UNIT + altitudeKm / EARTH_RADIUS_KM;
}

/**
 * Low-precision apparent solar position (right ascension & declination, rad).
 * Good to a fraction of a degree — ample for placing the day/night terminator.
 */
export function solarRaDec(date: Date): { ra: number; dec: number } {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = (((357.528 + 0.9856003 * n) % 360) + 360) % 360;
  const gRad = g * DEG;
  const lambda = (L + 1.915 * Math.sin(gRad) + 0.02 * Math.sin(2 * gRad)) * DEG;
  const eps = 23.439 * DEG;
  return {
    ra: Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)),
    dec: Math.asin(Math.sin(eps) * Math.sin(lambda)),
  };
}

/**
 * Unit vector toward the Sun in the Earth-fixed render frame at `date`. Drives
 * the lit hemisphere of the globe so the terminator tracks the time machine.
 */
export function sunDirection(date: Date, out?: XYZ): XYZ {
  const { ra, dec } = solarRaDec(date);
  const gmst = gstime(date);
  // A fixed inertial direction's Earth-fixed longitude is (RA − GMST).
  return geoToVecRad(dec, ra - gmst, 1, out);
}

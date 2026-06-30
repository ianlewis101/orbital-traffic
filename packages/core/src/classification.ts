import type { CategoryId } from './types.js';
import { isCategoryId } from './catalog.js';

/**
 * Orbit-class classification pipeline.
 *
 * Upstream feeds (CelesTrak GP groups, the bundled snapshot) tag objects
 * inconsistently: the `stations` group is full of cargo vehicles, debris and
 * cubesats; the `active` catch-all buries spent rocket bodies under generic
 * tags. This module is the single, tested source of truth for cleaning that
 * up. It was previously copy-pasted across `index.html`, the Cloudflare
 * worker, and a Python script — now it lives here once and is imported by
 * every consumer.
 *
 * The pipeline runs in a fixed order (each step only ever *narrows*):
 *   classify = correctOther( correctDebris( correctStation( raw ) ) )
 */

// --- Station allowlist -------------------------------------------------------

/**
 * Only true crewed-station modules and their currently-docked crew vehicles
 * may keep the "stations" class. Everything else the feed lumps under
 * `stations` (cargo ships, debris, co-orbiting cubesats) falls through to
 * "other" and may be reclassified downstream.
 */
export const STATION_CORE_IDS: ReadonlySet<string> = new Set([
  '25544', // ISS (ZARYA)
  '49044', // ISS module
  '27386', // Unity / Node 1
  '28654', // Harmony / Node 2
  '37224', // ISS module
  '37820', // ISS module
  '36086', // POISK (MRM-2)
  '48274', // CSS Tianhe
  '53239', // CSS Wentian
  '54216', // CSS Mengtian
]);

const CREW_VEHICLE_RE = /\bCREW\b|SOYUZ[- ]MS|SHENZHOU/i;

export function isDockedCrewVehicle(name: string): boolean {
  return CREW_VEHICLE_RE.test(name);
}

export function correctStationCat(id: string, name: string, cat: CategoryId): CategoryId {
  if (cat !== 'stations') return cat;
  if (STATION_CORE_IDS.has(id)) return 'stations';
  if (isDockedCrewVehicle(name)) return 'stations';
  return 'other';
}

// --- Debris / rocket-body name backstop --------------------------------------

const DEBRIS_NAME_RE =
  / DEB | DEBRIS | FRAGMENT | FRAG | R\/B | ROCKET BODY | ROCKET | STAGE | ARIANE | DELTA | ATLAS | TITAN /;

/**
 * Hardware released or jettisoned from a crewed station that CelesTrak still
 * lists under `stations` but which is inert and decaying. Kept deliberately
 * narrow so it can't catch co-orbiting cubesats or cargo vehicles.
 */
const ISS_HARDWARE_RE = / MONOBLOCK | DUPLEX | ISS OBJECT | SZ-\d+ MODULE /;

export function isDebrisName(name: string): boolean {
  const n = ' ' + (name || '').toUpperCase() + ' ';
  return (
    DEBRIS_NAME_RE.test(n) ||
    ISS_HARDWARE_RE.test(n) ||
    n.includes('CZ-') ||
    n.includes('SL-') ||
    n.includes('PSLV R/B')
  );
}

export function correctDebrisCat(name: string, cat: CategoryId): CategoryId {
  return isDebrisName(name) ? 'debris' : cat;
}

// --- "Other" rescue ----------------------------------------------------------

const NAV_NAME_RE = / GPS | NAVSTAR | GALILEO | GLONASS | BEIDOU /;
const WEATHER_NAME_RE = / GOES | METEOSAT | HIMAWARI | NOAA | METOP | METEOR | DMSP | ELEKTRO | FENGYUN /;
const EO_NAME_RE = / LANDSAT | SENTINEL | TERRA | AQUA | WORLDVIEW | SPOT | DOVE | ICEYE | PLEIADES /;

/**
 * ISS-deployed educational/research cubesats that arrive via the `stations`
 * group and fall to "other" after the station allowlist. No shared name
 * pattern exists for them, so they are promoted to "science" by NORAD id.
 */
const SCIENCE_IDS: ReadonlySet<string> = new Set(['67683', '67685', '67686', '67687', '67688']);

/**
 * Rescues well-known payloads (AQUA, GOES, NOAA, GALILEO…) that arrive tagged
 * "other" from the `active` catch-all. Only runs when the class is already
 * "other", so it never overrides a category correctly assigned upstream.
 */
export function correctOtherCat(id: string, name: string, cat: CategoryId): CategoryId {
  if (cat !== 'other') return cat;
  if (SCIENCE_IDS.has(id)) return 'science';
  const n = ' ' + (name || '').toUpperCase() + ' ';
  if (NAV_NAME_RE.test(n)) return 'navigation';
  if (WEATHER_NAME_RE.test(n) || EO_NAME_RE.test(n)) return 'science';
  return 'other';
}

// --- Public pipeline ---------------------------------------------------------

/**
 * Run the full classification pipeline for a single object. `rawCat` is the
 * upstream tag; unknown tags are treated as "other".
 */
export function classify(id: string, name: string, rawCat: string): CategoryId {
  const base: CategoryId = isCategoryId(rawCat) ? rawCat : 'other';
  return correctOtherCat(id, name, correctDebrisCat(name, correctStationCat(id, name, base)));
}

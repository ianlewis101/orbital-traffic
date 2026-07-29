/**
 * "What's above me right now" — observer geometry for the whole catalog.
 *
 * Purely geometric: elevation, azimuth and range only. No visibility,
 * magnitude or daylight filtering — a Starlink in full daylight and a dead
 * rocket body in Earth's shadow both count, because the question being
 * answered is "what's up there", not "what could I see".
 *
 * This is a one-shot snapshot, computed on demand and thrown away. It is
 * explicitly NOT wired into the ambient render loop: scene/clouds.js's
 * round-robin propagation exists to hold a steady frame rate over time and
 * deliberately leaves most objects a few ticks stale, which is fine for a
 * moving dot and wrong for a list that claims to be "right now". It also
 * skips SGP4 entirely for hidden categories, so `s._p` is absent for debris
 * and other by default — hence propagating fresh here rather than reading
 * cached positions.
 */
import * as satellite from "satellite.js";
import { safeProp } from "./propagation.js";

const DEG = Math.PI / 180;

/**
 * The app's own curation bar for "What's Overhead", not a physical horizon.
 *
 * A raw 0° sweep is technically correct — the object really is above the
 * mathematical horizon — but useless: measured against the real ~18,700
 * object catalog, 0° returns on the order of 1,100 objects from a typical
 * location, dominated by whichever Starlink and geostationary satellites
 * happen to be up. 40° is a deliberately curated "worth looking at" bar,
 * chosen after measuring the actual distribution (see overhead.test.js and
 * the PR history for the numbers) rather than assumed.
 */
export const MIN_OVERHEAD_ELEVATION_DEG = 40;

/**
 * Tier 1: the categories a user is actually likely to want to know are
 * overhead — crewed/station traffic, science platforms, and the handful of
 * categories that are otherwise easy to lose in constellation noise. Every
 * other category is Tier 2. This is a ranking split, not a filter: Tier 2
 * objects are never excluded from the results, only ranked below Tier 1
 * regardless of elevation (see rankOverhead below) — they're still fully
 * reachable through "Show all" in the UI.
 */
export const OVERHEAD_TIER1_CATS = new Set([
  "stations",
  "capsules",
  "science",
  "geostationary",
  "communications",
  "classified",
]);

function overheadTier(cat) {
  return OVERHEAD_TIER1_CATS.has(cat) ? 0 : 1;
}

/**
 * Records processed per animation frame.
 *
 * The ambient loop already sustains 3,500 propagations inside a single frame
 * at 60fps, so a full ~18,700-object sweep is on the order of 100ms — enough
 * to drop frames if done in one synchronous block, not remotely enough to
 * justify a Web Worker. (A worker is the wrong tool regardless: ingest.js
 * discards l1/l2 once the satrec is built, so there are no TLEs to hand
 * across, and structured-cloning 18,700 satrecs per tap would cost more than
 * the sweep it was meant to offload.) Yielding a frame between batches is the
 * same approach ingest.js already uses for boot.
 */
export const SWEEP_BATCH = 2500;

/** Observer position in the radian form satellite.js's look-angle math wants. */
export function observerGd(latDeg, lonDeg, altKm = 0.05) {
  return { latitude: latDeg * DEG, longitude: lonDeg * DEG, height: altKm };
}

/**
 * Sub-satellite point and altitude for one record.
 *
 * Shared with the info card's live telemetry, which computed this inline
 * before this module existed — one implementation, so the list and the card
 * can never disagree about where something is.
 */
export function subpoint(rec, date, gmst = satellite.gstime(date)) {
  const p = safeProp(rec, date);
  if (!p) return null;
  const geo = satellite.eciToGeodetic(p, gmst);
  const lat = satellite.degreesLat(geo.latitude);
  const lon = satellite.degreesLong(geo.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(geo.height)) return null;
  return { eci: p, lat, lon, alt: geo.height };
}

/**
 * Elevation/azimuth/range of one record as seen from `gd`, or null when SGP4
 * can't produce a position (decayed object, unusable elements).
 *
 * `gmst` is passed in rather than computed here: it depends only on the time,
 * so hoisting it out of the sweep turns ~18,700 sidereal-time calculations
 * into one.
 */
export function lookAngles(rec, gd, date, gmst) {
  const p = safeProp(rec, date);
  if (!p) return null;
  const la = satellite.ecfToLookAngles(gd, satellite.eciToEcf(p, gmst));
  const elevationDeg = la.elevation / DEG;
  // A malformed satrec propagates to a position object full of NaN rather
  // than to nothing, so safeProp's null check doesn't catch it. That matters
  // here specifically: NaN fails *every* comparison, so an un-guarded NaN
  // elevation would slip past the `<= minElevation` filter below and land in
  // the results as a phantom object.
  if (
    !Number.isFinite(elevationDeg) ||
    !Number.isFinite(la.azimuth) ||
    !Number.isFinite(la.rangeSat)
  ) {
    return null;
  }
  return {
    elevationDeg,
    // satellite.js returns azimuth in [-π, π]; normalise to a compass bearing.
    azimuthDeg: (((la.azimuth / DEG) % 360) + 360) % 360,
    rangeKm: la.rangeSat,
  };
}

/** 16-point compass bearing — friendlier in a list row than raw degrees. */
const COMPASS = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
];

export function compassPoint(azimuthDeg) {
  return COMPASS[Math.round((((azimuthDeg % 360) + 360) % 360) / 22.5) % 16];
}

/**
 * One synchronous pass over `records`.
 *
 * Kept pure and DOM-free so the geometry can be unit-tested directly, without
 * jsdom or a fake animation frame. `computeOverhead` below is the thin async
 * wrapper that makes it frame-friendly.
 *
 * Records with a null satrec are skipped — that's how NEO pseudo-records
 * (scene/neos.js gives them `rec: null`) stay out of the results, which the
 * feature requires: asteroids are not orbital traffic overhead.
 *
 * minElevationDeg defaults to a true 0° horizon here — this is a generic,
 * low-level primitive meant to be testable at any cut. The app's actual
 * curated threshold is MIN_OVERHEAD_ELEVATION_DEG, applied by
 * computeOverhead below; don't read this function's default as the app's
 * behavior.
 */
export function overheadSweep(records, gd, date, opts = {}) {
  const {
    minElevationDeg = 0,
    gmst = satellite.gstime(date),
    from = 0,
    to = records.length,
    into = { results: [], scanned: 0, failed: 0 },
  } = opts;

  for (let i = from; i < to; i++) {
    const s = records[i];
    if (!s || !s.rec) continue;
    into.scanned++;
    const la = lookAngles(s.rec, gd, date, gmst);
    if (!la) {
      into.failed++;
      continue;
    }
    if (la.elevationDeg <= minElevationDeg) continue;
    into.results.push({
      id: s.id,
      name: s.name,
      cat: s.cat,
      elevationDeg: la.elevationDeg,
      azimuthDeg: la.azimuthDeg,
      rangeKm: la.rangeKm,
    });
  }
  return into;
}

/**
 * Two-key rank: Tier 1 categories always sort before Tier 2, regardless of
 * elevation — a 45° station outranks an 85° Starlink. Within a tier, most
 * directly overhead first. Sorts in place and returns the same array.
 *
 * If Tier 1 alone has more objects than the UI's default page size at a
 * given moment/location, the default view can show zero Tier 2 objects.
 * That's expected, not a bug — don't add logic here to force both tiers to
 * appear in a capped view; "Show all" is how the rest stays reachable.
 */
export function rankOverhead(results) {
  return results.sort((a, b) => {
    const tierDiff = overheadTier(a.cat) - overheadTier(b.cat);
    return tierDiff !== 0 ? tierDiff : b.elevationDeg - a.elevationDeg;
  });
}

/**
 * Full catalog sweep, chunked across animation frames so the globe keeps
 * rendering while it runs.
 *
 * Pass an AbortSignal to cancel — a second tap, or dismissing the panel,
 * should not leave a stale sweep running to completion and then resolving
 * over the top of a newer one.
 */
export async function computeOverhead(records, observer, date, opts = {}) {
  const {
    minElevationDeg = MIN_OVERHEAD_ELEVATION_DEG,
    batch = SWEEP_BATCH,
    signal,
    onProgress,
  } = opts;

  const gd = observerGd(observer.lat, observer.lon, observer.altKm ?? 0.05);
  const gmst = satellite.gstime(date);
  const acc = { results: [], scanned: 0, failed: 0 };

  for (let start = 0; start < records.length; start += batch) {
    if (signal?.aborted) throw new DOMException("Overhead sweep aborted", "AbortError");
    const end = Math.min(start + batch, records.length);
    overheadSweep(records, gd, date, { minElevationDeg, gmst, from: start, to: end, into: acc });
    onProgress?.(end, records.length);
    // No point yielding after the final batch — let the caller have the result.
    if (end < records.length) await new Promise(requestAnimationFrame);
  }

  rankOverhead(acc.results);
  return { ...acc, date, observer: { lat: observer.lat, lon: observer.lon } };
}

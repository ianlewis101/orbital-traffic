import * as satellite from "satellite.js";

const DEG = Math.PI / 180;

/**
 * Predict upcoming visible passes of a satellite over a ground location.
 *
 * A "pass" is a contiguous window where the satellite's elevation above
 * the observer's horizon stays at or above `horizonDeg`.
 *
 * @param {string} l1 TLE line 1
 * @param {string} l2 TLE line 2
 * @param {number} lat observer latitude, degrees
 * @param {number} lng observer longitude, degrees
 * @param {object} [opts]
 * @param {number} [opts.horizonDeg=10]   minimum elevation to count as visible
 * @param {number} [opts.withinHours=48]  how far ahead to search
 * @param {number} [opts.stepSeconds=30]  simulation step — coarser is faster but can miss very short/low passes
 * @param {number} [opts.maxPasses=5]     stop once this many passes are found
 * @param {number} [opts.fromMs]          search start time, ms since epoch (defaults to now; injectable for tests)
 * @returns {{riseMs:number, cullMs:number, setMs:number, maxElevationDeg:number}[]}
 */
export function predictPasses(l1, l2, lat, lng, opts = {}) {
  const {
    horizonDeg = 10,
    withinHours = 48,
    stepSeconds = 30,
    maxPasses = 5,
    fromMs = Date.now(),
  } = opts;

  const satrec = satellite.twoline2satrec(l1, l2);
  if (satrec.error) return [];

  const observerGd = { longitude: lng * DEG, latitude: lat * DEG, height: 0.05 };
  const endMs = fromMs + withinHours * 3600 * 1000;

  const passes = [];
  let current = null;

  for (let t = fromMs; t <= endMs; t += stepSeconds * 1000) {
    const date = new Date(t);
    const pv = satellite.propagate(satrec, date);
    if (!pv.position) continue;
    const gmst = satellite.gstime(date);
    const ecf = satellite.eciToEcf(pv.position, gmst);
    const elevDeg = satellite.ecfToLookAngles(observerGd, ecf).elevation / DEG;

    if (elevDeg >= horizonDeg) {
      if (!current) {
        current = { riseMs: t, cullMs: t, maxElevationDeg: elevDeg };
      } else if (elevDeg > current.maxElevationDeg) {
        current.maxElevationDeg = elevDeg;
        current.cullMs = t;
      }
    } else if (current) {
      current.setMs = t;
      passes.push(current);
      current = null;
      if (passes.length >= maxPasses) break;
    }
  }
  return passes;
}

/** Convenience: just the next pass, or null if none found in the search window. */
export function nextPass(l1, l2, lat, lng, opts = {}) {
  return predictPasses(l1, l2, lat, lng, { ...opts, maxPasses: 1 })[0] ?? null;
}

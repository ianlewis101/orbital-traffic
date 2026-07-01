import * as satellite from "satellite.js";

/** SGP4 position at date, or null if propagation fails (decayed object, bad TLE). */
export function safeProp(rec, date) {
  try {
    const pv = satellite.propagate(rec, date);
    if (pv && pv.position) return pv.position;
  } catch {}
  return null;
}

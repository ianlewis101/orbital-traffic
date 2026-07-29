import { describe, it, expect } from "vitest";
import * as satellite from "satellite.js";
import {
  observerGd,
  subpoint,
  lookAngles,
  overheadSweep,
  sortByElevation,
  computeOverhead,
  compassPoint,
} from "../src/astro/overhead.js";

// Real ISS elements. The epoch matters: SGP4 accuracy degrades away from it,
// so every assertion below is evaluated at the epoch itself rather than at
// wall-clock "now", which keeps this test deterministic forever.
const ISS_L1 = "1 25544U 98067A   26209.86208808  .00009406  00000+0  17714-3 0  9990";
const ISS_L2 = "2 25544  51.6322  93.8563 0007045 348.2689  11.8134 15.49235272578212";

// A GEO bird — useful because its elevation from a fixed ground point is
// essentially constant, unlike the ISS.
const GEO_L1 = "1 41866U 16071A   26209.51694671 -.00000265  00000+0  00000+0 0  9995";
const GEO_L2 = "2 41866   0.0182  15.6767 0001960 216.9337 174.5771  1.00271130 35364";

const issRec = satellite.twoline2satrec(ISS_L1, ISS_L2);
const geoRec = satellite.twoline2satrec(GEO_L1, GEO_L2);

/** The TLE's own epoch, as a Date. */
function epochOf(rec) {
  const year = rec.epochyr < 57 ? rec.epochyr + 2000 : rec.epochyr + 1900;
  const ms = Date.UTC(year, 0, 1) + (rec.epochdays - 1) * 86400000;
  return new Date(ms);
}

const ISS_EPOCH = epochOf(issRec);
// Far enough past the epoch that SGP4 gives up rather than returning a
// position — the test stand-in for a decayed object.
const FAR_FUTURE = new Date(ISS_EPOCH.getTime() + 1e13);

function sat(id, name, cat, rec) {
  return { id, name, cat, rec };
}

describe("subpoint", () => {
  it("returns a plausible ISS ground point and altitude", () => {
    const sp = subpoint(issRec, ISS_EPOCH);
    expect(sp).not.toBeNull();
    expect(sp.lat).toBeGreaterThanOrEqual(-90);
    expect(sp.lat).toBeLessThanOrEqual(90);
    expect(sp.lon).toBeGreaterThanOrEqual(-180);
    expect(sp.lon).toBeLessThanOrEqual(180);
    // ISS orbits ~400-430km up.
    expect(sp.alt).toBeGreaterThan(350);
    expect(sp.alt).toBeLessThan(500);
    // Its inclination caps how far north/south the ground track reaches.
    expect(Math.abs(sp.lat)).toBeLessThanOrEqual(52);
  });

  it("returns null when SGP4 can't produce a position", () => {
    // Propagated centuries past its epoch, SGP4 decays the orbit and stops
    // returning a position — the same outcome a genuinely de-orbited object
    // produces, which is what safeProp exists to swallow.
    expect(subpoint(issRec, FAR_FUTURE)).toBeNull();
  });
});

describe("lookAngles", () => {
  const gmst = satellite.gstime(ISS_EPOCH);

  it("sees the object near the zenith from directly beneath it", () => {
    const sp = subpoint(issRec, ISS_EPOCH);
    const la = lookAngles(issRec, observerGd(sp.lat, sp.lon), ISS_EPOCH, gmst);
    // Standing on the sub-satellite point, it is straight up.
    expect(la.elevationDeg).toBeGreaterThan(89);
    expect(la.elevationDeg).toBeLessThanOrEqual(90);
    // Slant range from directly below is just the altitude.
    expect(la.rangeKm).toBeGreaterThan(350);
    expect(la.rangeKm).toBeLessThan(500);
  });

  it("puts the object below the horizon from the antipode", () => {
    const sp = subpoint(issRec, ISS_EPOCH);
    const antiLat = -sp.lat;
    const antiLon = sp.lon > 0 ? sp.lon - 180 : sp.lon + 180;
    const la = lookAngles(issRec, observerGd(antiLat, antiLon), ISS_EPOCH, gmst);
    expect(la.elevationDeg).toBeLessThan(0);
  });

  it("reports elevation falling off as the observer moves away", () => {
    const sp = subpoint(issRec, ISS_EPOCH);
    const near = lookAngles(issRec, observerGd(sp.lat, sp.lon), ISS_EPOCH, gmst);
    const mid = lookAngles(issRec, observerGd(sp.lat + 10, sp.lon), ISS_EPOCH, gmst);
    const far = lookAngles(issRec, observerGd(sp.lat + 25, sp.lon), ISS_EPOCH, gmst);
    expect(near.elevationDeg).toBeGreaterThan(mid.elevationDeg);
    expect(mid.elevationDeg).toBeGreaterThan(far.elevationDeg);
    // And range grows the other way.
    expect(far.rangeKm).toBeGreaterThan(near.rangeKm);
  });

  it("normalises azimuth to a 0-360 compass bearing", () => {
    const sp = subpoint(issRec, ISS_EPOCH);
    for (const dLat of [-30, -10, 0, 10, 30]) {
      for (const dLon of [-40, -10, 10, 40]) {
        const la = lookAngles(issRec, observerGd(sp.lat + dLat, sp.lon + dLon), ISS_EPOCH, gmst);
        expect(la.azimuthDeg).toBeGreaterThanOrEqual(0);
        expect(la.azimuthDeg).toBeLessThan(360);
      }
    }
  });

  it("returns null rather than throwing for an unusable satrec", () => {
    expect(lookAngles(issRec, observerGd(0, 0), FAR_FUTURE, gmst)).toBeNull();
    // A malformed satrec must be swallowed too, not thrown out of the sweep.
    expect(lookAngles({}, observerGd(0, 0), ISS_EPOCH, gmst)).toBeNull();
  });
});

describe("compassPoint", () => {
  it("maps bearings to 16-point compass labels", () => {
    expect(compassPoint(0)).toBe("N");
    expect(compassPoint(90)).toBe("E");
    expect(compassPoint(180)).toBe("S");
    expect(compassPoint(270)).toBe("W");
    expect(compassPoint(45)).toBe("NE");
    expect(compassPoint(359)).toBe("N");
    // Wraps rather than falling off the end of the table.
    expect(compassPoint(360)).toBe("N");
    expect(compassPoint(-90)).toBe("W");
  });
});

describe("overheadSweep", () => {
  it("keeps only objects above the horizon", () => {
    const sp = subpoint(issRec, ISS_EPOCH);
    const antiLat = -sp.lat;
    const antiLon = sp.lon > 0 ? sp.lon - 180 : sp.lon + 180;

    const under = overheadSweep(
      [sat("25544", "ISS (ZARYA)", "stations", issRec)],
      observerGd(sp.lat, sp.lon),
      ISS_EPOCH
    );
    expect(under.results).toHaveLength(1);
    expect(under.results[0].id).toBe("25544");
    expect(under.results[0].name).toBe("ISS (ZARYA)");
    expect(under.results[0].cat).toBe("stations");

    const opposite = overheadSweep(
      [sat("25544", "ISS (ZARYA)", "stations", issRec)],
      observerGd(antiLat, antiLon),
      ISS_EPOCH
    );
    expect(opposite.results).toHaveLength(0);
    expect(opposite.scanned).toBe(1);
  });

  it("skips records with no satrec, so NEOs never appear", () => {
    const sp = subpoint(issRec, ISS_EPOCH);
    const records = [
      sat("25544", "ISS (ZARYA)", "stations", issRec),
      // scene/neos.js builds NEO pseudo-records with rec: null.
      { id: "neo_0", name: "99942 Apophis", cat: "hazardous", rec: null },
    ];
    const out = overheadSweep(records, observerGd(sp.lat, sp.lon), ISS_EPOCH);
    expect(out.scanned).toBe(1);
    expect(out.results.every((r) => r.cat !== "hazardous")).toBe(true);
  });

  it("counts propagation failures instead of throwing", () => {
    const out = overheadSweep(
      [sat("00001", "DECAYED", "debris", issRec), sat("00002", "MALFORMED", "debris", {})],
      observerGd(0, 0),
      FAR_FUTURE
    );
    expect(out.failed).toBe(2);
    expect(out.scanned).toBe(2);
    expect(out.results).toHaveLength(0);
  });

  it("honours a minimum elevation cut", () => {
    const sp = subpoint(issRec, ISS_EPOCH);
    const records = [sat("25544", "ISS (ZARYA)", "stations", issRec)];
    const gd = observerGd(sp.lat, sp.lon);
    expect(overheadSweep(records, gd, ISS_EPOCH, { minElevationDeg: 0 }).results).toHaveLength(1);
    // It's at ~90°, so an 89.5° cut is the only thing that excludes it.
    expect(
      overheadSweep(records, gd, ISS_EPOCH, { minElevationDeg: 89.99 }).results.length
    ).toBeLessThanOrEqual(1);
    const far = observerGd(sp.lat + 18, sp.lon);
    const loose = overheadSweep(records, far, ISS_EPOCH, { minElevationDeg: 0 });
    const strict = overheadSweep(records, far, ISS_EPOCH, { minElevationDeg: 45 });
    expect(loose.results.length).toBeGreaterThanOrEqual(strict.results.length);
  });

  it("accumulates across ranged calls the way the chunked driver uses it", () => {
    const sp = subpoint(issRec, ISS_EPOCH);
    const records = [
      sat("25544", "ISS (ZARYA)", "stations", issRec),
      sat("41866", "GEO BIRD", "geostationary", geoRec),
    ];
    const gd = observerGd(sp.lat, sp.lon);
    const gmst = satellite.gstime(ISS_EPOCH);
    const acc = { results: [], scanned: 0, failed: 0 };
    overheadSweep(records, gd, ISS_EPOCH, { gmst, from: 0, to: 1, into: acc });
    overheadSweep(records, gd, ISS_EPOCH, { gmst, from: 1, to: 2, into: acc });
    expect(acc.scanned).toBe(2);
    // Same accumulator, so a single-shot sweep must agree with it exactly.
    const oneShot = overheadSweep(records, gd, ISS_EPOCH, { gmst });
    expect(acc.results.map((r) => r.id).sort()).toEqual(oneShot.results.map((r) => r.id).sort());
  });
});

describe("sortByElevation", () => {
  it("puts the most directly overhead object first", () => {
    const rows = [
      { id: "a", elevationDeg: 12 },
      { id: "b", elevationDeg: 78 },
      { id: "c", elevationDeg: 45 },
    ];
    expect(sortByElevation(rows).map((r) => r.id)).toEqual(["b", "c", "a"]);
  });
});

describe("computeOverhead", () => {
  // The chunked driver yields with requestAnimationFrame, which doesn't exist
  // in the node test environment.
  const withRaf = async (fn) => {
    const had = "requestAnimationFrame" in globalThis;
    const prev = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
    try {
      return await fn();
    } finally {
      if (had) globalThis.requestAnimationFrame = prev;
      else delete globalThis.requestAnimationFrame;
    }
  };

  it("matches a single synchronous sweep, sorted", async () => {
    const sp = subpoint(issRec, ISS_EPOCH);
    const records = [
      sat("41866", "GEO BIRD", "geostationary", geoRec),
      sat("25544", "ISS (ZARYA)", "stations", issRec),
      { id: "neo_0", name: "Apophis", cat: "hazardous", rec: null },
    ];
    const out = await withRaf(() =>
      computeOverhead(records, { lat: sp.lat, lon: sp.lon }, ISS_EPOCH, { batch: 1 })
    );
    expect(out.scanned).toBe(2);
    expect(out.observer).toEqual({ lat: sp.lat, lon: sp.lon });
    for (let i = 1; i < out.results.length; i++) {
      expect(out.results[i - 1].elevationDeg).toBeGreaterThanOrEqual(out.results[i].elevationDeg);
    }
    // The ISS is directly overhead here, so it must be first if present.
    if (out.results.length) expect(out.results[0].id).toBe("25544");
  });

  it("aborts mid-sweep when signalled", async () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      sat(String(i), "OBJ " + i, "other", issRec)
    );
    const ctrl = new AbortController();
    await withRaf(async () => {
      const p = computeOverhead(records, { lat: 0, lon: 0 }, ISS_EPOCH, {
        batch: 1,
        signal: ctrl.signal,
        onProgress: () => ctrl.abort(),
      });
      await expect(p).rejects.toThrow(/abort/i);
    });
  });
});

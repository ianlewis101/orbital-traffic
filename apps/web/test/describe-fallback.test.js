// @vitest-environment jsdom
import { describe as suite, it, expect, vi } from "vitest";
import * as satellite from "satellite.js";

/**
 * Guards the uncurated-object lead paragraph.
 *
 * Curated descriptions cover roughly 2,900 of ~19,200 catalogued objects, and
 * a newly launched satellite is never among them — its entry is hand-written
 * later. So whatever describe() composes from category and orbit IS the
 * description for every new launch, for as long as it takes for a curated
 * one to be written.
 *
 * Two specific regressions are covered here:
 *   - "communications" had no display type at all, so every comms satellite
 *     that didn't match a hero name pattern fell to the blandest string in
 *     the file ("A satellite in Earth orbit, catalogued by...").
 *   - splitting "communications" out of "generic" must NOT change which
 *     photo pool figures.js draws from — there is no comms photo bucket, and
 *     an unhandled type there returns null and silently drops the photo.
 */

vi.mock("../src/data/store.js", () => ({
  DATA: { descs: {}, neoDescs: {}, photos: {}, sats: [] },
}));

const { describe: describeSat, classify } = await import("../src/ui/describe.js");
const { photoKey } = await import("../src/ui/figures.js");

/**
 * Real TLE pairs, so the orbit clause is exercised against genuine elements
 * rather than a hand-built satrec that happens to agree with the thresholds.
 */
const TLES = {
  // ISS — the canonical low Earth orbit (~420 km).
  leo: [
    "1 25544U 98067A   24015.50000000  .00016717  00000-0  30777-3 0  9993",
    "2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.49514637 12345",
  ],
  // GPS BIIR-2 — medium Earth orbit (~20,200 km).
  meo: [
    "1 24876U 97035A   24015.50000000 -.00000024  00000-0  00000-0 0  9995",
    "2 24876  55.5085 191.1436 0080756  53.1234 307.4321  2.00563324 12345",
  ],
  // A geostationary bird (~35,786 km, near-zero inclination and eccentricity).
  geo: [
    "1 41866U 16071A   24015.50000000 -.00000267  00000-0  00000-0 0  9991",
    "2 41866   0.0184  12.3456 0001234 250.1234 109.8765  1.00271234 12345",
  ],
  // Molniya-type highly elliptical orbit (eccentricity ~0.72).
  heo: [
    "1 25485U 98054A   24015.50000000  .00000123  00000-0  00000-0 0  9992",
    "2 25485  62.8412 210.1234 7200000 270.1234  15.4321  2.00600000 12345",
  ],
};

function sat(name, cat, tleKey, extra = {}) {
  const [l1, l2] = TLES[tleKey];
  return { name, id: "99999", cat, rec: satellite.twoline2satrec(l1, l2), ...extra };
}

suite("communications satellites get their own copy", () => {
  it("no longer falls through to the bland catch-all", () => {
    const s = sat("SUPERBIRD-9", "communications", "leo");
    const text = describeSat(s);
    expect(classify(s)).toBe("communications");
    expect(text).not.toContain("catalogued by the world's space-surveillance networks");
    expect(text).toContain("communications satellite");
  });

  it("describes a geostationary comms bird as geostationary, not twice over", () => {
    // cat "geostationary" is checked before "communications" on purpose, so a
    // GEO comms satellite gets one explanation of where it sits, not two.
    const s = sat("INTELSAT 37E", "geostationary", "geo");
    expect(classify(s)).toBe("geo");
    const text = describeSat(s);
    expect(text).toContain("22,236 miles");
    // The clause and the "geo" copy must not both appear.
    expect(text).not.toContain("hang motionless over one spot");
  });

  it("keeps drawing the generic-satellite photo pool", () => {
    // Splitting the type out of "generic" must not change artwork: an
    // unhandled classify() value returns null from photoKey and the object
    // silently loses its photo.
    expect(photoKey(sat("SUPERBIRD-9", "communications", "leo"))).toBe("satellite_generic");
    expect(photoKey(sat("SOME PAYLOAD", "other", "leo"))).toBe("satellite_generic");
  });
});

suite("orbit-regime clause", () => {
  it("explains what each regime is for", () => {
    expect(describeSat(sat("NEW COMSAT", "communications", "leo"))).toContain("low Earth orbit");
    expect(describeSat(sat("NEW NAVSAT", "navigation", "meo"))).toContain("medium Earth orbit");
    expect(describeSat(sat("NEW PAYLOAD", "other", "heo"))).toContain("egg-shaped");
  });

  it("does not restate numbers the info card's chips and stat grid already show", () => {
    // The card prints altitude, inclination, lap time and apogee/perigee
    // itself — the clause exists to say what the orbit is FOR.
    const text = describeSat(sat("NEW COMSAT", "communications", "leo"));
    expect(text).not.toMatch(/\d+\s*(min|minutes|km|°)/);
  });

  it("is omitted for types whose own copy already says where they fly", () => {
    const debris = describeSat(sat("SL-16 R/B", "debris", "leo", { objType: "R/B" }));
    expect(debris).not.toContain("low Earth orbit");
  });

  it("degrades to the bare type sentence when elements are unusable", () => {
    // A malformed satrec propagates NaN rather than throwing; NaN must not
    // reach the card as prose built from a garbage regime.
    const broken = { name: "BROKEN", id: "1", cat: "communications", rec: { no: NaN, ecco: NaN } };
    const text = describeSat(broken);
    expect(text).toBe(
      "A communications satellite — one of the relay stations that carry television, phone calls, internet traffic and data between distant points on the ground."
    );
  });

  it("survives an object with no satrec at all", () => {
    const noRec = { name: "NO REC", id: "2", cat: "communications" };
    expect(() => describeSat(noRec)).not.toThrow();
    expect(describeSat(noRec)).toContain("communications satellite");
  });
});

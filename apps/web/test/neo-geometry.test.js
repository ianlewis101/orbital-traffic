import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { earthHelio, neoGeocentric, julianDay, AU_KM } from "../src/astro/neo.js";

/**
 * Earth's position in the heliocentric-to-geocentric conversion.
 *
 * REGRESSION GUARD. earthHelio() used to return (cos L, sin L) for
 * L = 280.46 + 36000.771·T. That expression is the SUN'S geometric mean
 * longitude seen from Earth, so it points Earth→Sun — the exact opposite of
 * the Sun→Earth vector neoGeocentric() needs. Earth was placed on the far side
 * of the Sun, a 2 AU error in every NEO's geocentric vector.
 *
 * Nothing caught it because the only consumer projects NEOs onto a
 * fixed-radius display shell (scene/neos.js), where a wrong direction still
 * renders a plausible-looking sky. It only surfaced when a real distance had
 * to be printed for the deep-space search rows. Measured against neos.json's
 * own catalogued close approaches, every NEO came out ~780 lunar distances
 * away at its closest approach instead of the catalogued 13-76.
 *
 * The checks below are deliberately ground-truth rather than golden values: a
 * sign flip, a dropped negation or a mixed-up frame fails them loudly, but an
 * intentional precision improvement doesn't.
 */

const LD_KM = 384400; // mean lunar distance
const R2D = 180 / Math.PI;

const neos = JSON.parse(
  readFileSync(fileURLToPath(new URL("../public/data/neos.json", import.meta.url)), "utf8")
);

function earthLongitudeDeg(iso) {
  const e = earthHelio(julianDay(Date.parse(iso)));
  const lon = Math.atan2(e.y, e.x) * R2D;
  return (lon + 360) % 360;
}

function earthRadiusAu(iso) {
  const e = earthHelio(julianDay(Date.parse(iso)));
  return Math.hypot(e.x, e.y, e.z);
}

describe("earthHelio", () => {
  // At an equinox the Sun's ecliptic longitude is 0°/180°, so Earth's
  // heliocentric longitude — pointing the other way — is 180°/0°. Getting the
  // sign wrong swaps each of these with the one 180° from it.
  it("puts Earth opposite the Sun at the equinoxes and solstices", () => {
    expect(earthLongitudeDeg("2026-03-20T14:46:00Z")).toBeCloseTo(180, 0);
    expect(earthLongitudeDeg("2026-06-21T08:25:00Z")).toBeCloseTo(270, 0);
    expect(earthLongitudeDeg("2026-12-21T20:50:00Z")).toBeCloseTo(90, 0);
  });

  it("puts Earth near 0° at the September equinox", () => {
    // Wraps, so compare on the circle rather than to a bare 0.
    const lon = earthLongitudeDeg("2026-09-23T00:05:00Z");
    expect(Math.min(lon, 360 - lon)).toBeLessThan(1);
  });

  // A circular approximation returns exactly 1 AU always; these two would both
  // fail it. Earth's orbit is eccentric enough to matter at lunar distances.
  it("tracks Earth's orbital eccentricity", () => {
    expect(earthRadiusAu("2026-01-03T00:00:00Z")).toBeCloseTo(0.9833, 3); // perihelion
    expect(earthRadiusAu("2026-07-06T00:00:00Z")).toBeCloseTo(1.0167, 3); // aphelion
  });

  it("stays on the ecliptic and near 1 AU all year", () => {
    for (let d = 0; d < 365; d += 7) {
      const e = earthHelio(julianDay(Date.UTC(2026, 0, 1) + d * 86400000));
      expect(e.z).toBe(0);
      const r = Math.hypot(e.x, e.y);
      expect(r).toBeGreaterThan(0.98);
      expect(r).toBeLessThan(1.02);
    }
  });
});

describe("neoGeocentric against neos.json's own close approaches", () => {
  // Each NEO carries the date (nd) and distance in lunar distances (nl) of its
  // next close approach. That is independent ground truth already in the repo.
  // Two-body propagation from a single epoch's osculating elements drifts in
  // TIME — an encounter 20 years out can be modelled days early or late — so
  // the modelled minimum is taken over a window rather than at one instant.
  function modelledClosestLd(o, windowDays = 30) {
    const t0 = Date.parse(o.nd.replace(/-/g, " ") + " UTC");
    let min = Infinity;
    for (let h = -windowDays * 24; h <= windowDays * 24; h++) {
      const g = neoGeocentric(o, t0 + h * 3600000);
      const d = Math.hypot(g.x, g.y, g.z) / LD_KM;
      if (d < min) min = d;
    }
    return { min, t0 };
  }

  const cases = neos.filter(
    (o) => o.nd && o.nl && Number.isFinite(Date.parse(o.nd.replace(/-/g, " ") + " UTC"))
  );

  it("has close-approach data to test against", () => {
    expect(cases.length).toBeGreaterThan(30);
  });

  it("never parks a NEO ~2 AU away at closest approach", () => {
    // The bug's signature: EVERY object bottoming out around 780 LD (2 AU),
    // regardless of its catalogued approach distance.
    const twoAuInLd = (2 * AU_KM) / LD_KM;
    for (const o of cases) {
      expect(modelledClosestLd(o).min, `${o.name}`).toBeLessThan(twoAuInLd * 0.5);
    }
  });

  it("reproduces catalogued approach distances to within a few lunar distances", () => {
    const errs = cases.map((o) => Math.abs(modelledClosestLd(o).min - o.nl)).sort((a, b) => a - b);
    const median = errs[Math.floor(errs.length / 2)];
    // Measured at ~2.3 LD with the fix in place, and ~740 LD without it. The
    // residual is two-body drift on encounters up to 25 years past the element
    // epoch, not a frame error.
    expect(median).toBeLessThan(6);
  });

  it("keeps most objects close to their catalogued distance", () => {
    const within = cases.filter((o) => Math.abs(modelledClosestLd(o).min - o.nl) < 5).length;
    expect(within / cases.length).toBeGreaterThan(0.6);
  });
});

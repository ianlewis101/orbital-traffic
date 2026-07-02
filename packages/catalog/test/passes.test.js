import { describe, it, expect } from "vitest";
import { predictPasses, nextPass } from "../src/passes.js";

const ISS_L1 = "1 25544U 98067A   26182.50817465  .00006185  00000+0  11827-3 0  9996";
const ISS_L2 = "2 25544  51.6311 229.1989 0004224 255.0896 104.9625 15.49503254573972";
const FIXED_NOW = new Date("2026-07-02T00:00:00Z").getTime();

describe("predictPasses", () => {
  it("finds multiple passes within 48h for a mid-latitude observer", () => {
    const passes = predictPasses(ISS_L1, ISS_L2, 40.7128, -74.006, { fromMs: FIXED_NOW });
    expect(passes.length).toBeGreaterThan(0);
    for (const p of passes) {
      expect(p.riseMs).toBeLessThan(p.cullMs);
      expect(p.cullMs).toBeLessThanOrEqual(p.setMs);
      expect(p.maxElevationDeg).toBeGreaterThanOrEqual(10);
      expect(p.riseMs).toBeGreaterThanOrEqual(FIXED_NOW);
    }
  });

  it("returns passes in chronological order", () => {
    const passes = predictPasses(ISS_L1, ISS_L2, 40.7128, -74.006, { fromMs: FIXED_NOW });
    for (let i = 1; i < passes.length; i++) {
      expect(passes[i].riseMs).toBeGreaterThan(passes[i - 1].riseMs);
    }
  });

  it("respects the horizon threshold — a stricter cutoff never finds more passes", () => {
    const low = predictPasses(ISS_L1, ISS_L2, 40.7128, -74.006, { fromMs: FIXED_NOW, horizonDeg: 5 });
    const high = predictPasses(ISS_L1, ISS_L2, 40.7128, -74.006, { fromMs: FIXED_NOW, horizonDeg: 60 });
    expect(low.length).toBeGreaterThanOrEqual(high.length);
  });

  it("returns [] for a malformed TLE instead of throwing", () => {
    expect(predictPasses("garbage", "garbage", 0, 0)).toEqual([]);
  });
});

describe("nextPass", () => {
  it("returns only the single soonest pass", () => {
    const p = nextPass(ISS_L1, ISS_L2, 40.7128, -74.006, { fromMs: FIXED_NOW });
    expect(p).not.toBeNull();
    expect(p.riseMs).toBeGreaterThanOrEqual(FIXED_NOW);
  });

  it("returns null if no pass is found in the window", () => {
    const p = nextPass(ISS_L1, ISS_L2, 40.7128, -74.006, { fromMs: FIXED_NOW, withinHours: 0.01 });
    expect(p).toBeNull();
  });
});

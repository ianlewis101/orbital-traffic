import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { DEEP_SPACE, matchDeepSpace } from "../src/data/deep-space.js";
import { deepSpaceDistanceKm, fmtLightTime, lightSeconds } from "../src/astro/deep-space.js";

/**
 * The deep-space search explainers: objects users search for that this app can
 * never plot (no TLE, no Earth orbit).
 *
 * The distance model is pinned against JPL Horizons (ssd.jpl.nasa.gov). Those
 * reference figures are BAKED, not fetched — the suite must stay offline and
 * deterministic — and were taken as geocentric range on the dates below. If a
 * future change re-bakes the trajectory data in data/deep-space.js, re-query
 * Horizons and update these alongside it rather than loosening the tolerance.
 *
 * Tolerance is per motion model, because they degrade for different reasons:
 *
 *   escape (0.3%) — a coasting state vector barely drifts. Measured under
 *     0.15% everywhere, including five years past the epoch.
 *   orbit (1.5%)  — osculating elements from a single epoch, propagated
 *     two-body. Parker's are reshaped by Venus gravity assists and the
 *     Roadster's by Earth and Mars, so error grows with distance from
 *     el.epoch: ~0.3% in year one, ~0.9% by year two. Re-baking the elements
 *     from Horizons resets it; that is what el.epoch is there to flag.
 *
 * Both bounds sit well inside the three significant figures the UI renders,
 * and well under the ~1% that Earth's position alone contributed before the
 * earthHelio() sign fix (see test/neo-geometry.test.js).
 */
const TOLERANCE_PCT = { escape: 0.3, orbit: 1.5 };
const KM = 1e6; // reference values below are in millions of km

// [key, date, Horizons geocentric range in millions of km]
const HORIZONS = [
  ["voyager1", "2026-09-16", 25708.42],
  ["voyager1", "2027-09-16", 26213.06],
  ["voyager1", "2031-09-16", 28369.79],
  ["voyager2", "2026-09-16", 21480.71],
  ["voyager2", "2031-09-16", 23854.91],
  ["newhorizons", "2026-09-16", 9748.63],
  ["newhorizons", "2031-09-16", 11868.84],
  ["pioneer10", "2026-09-16", 21210.71],
  ["pioneer10", "2031-09-16", 23074.48],
  ["pioneer11", "2026-09-16", 17577.03],
  ["pioneer11", "2031-09-16", 19316.41],
  ["parker", "2026-12-01", 135.13],
  ["parker", "2028-09-16", 84.95],
  ["roadster", "2026-09-16", 86.52],
  ["roadster", "2031-09-16", 228.55],
];

const entry = (key) => DEEP_SPACE.find((e) => e.key === key);

describe("distance model vs JPL Horizons", () => {
  for (const [key, date, expectedM] of HORIZONS) {
    const tol = TOLERANCE_PCT[entry(key).kind];
    it(`${key} @ ${date} is within ${tol}% of Horizons`, () => {
      const km = deepSpaceDistanceKm(entry(key), Date.parse(date + "T00:00:00Z"));
      const errPct = Math.abs((km - expectedM * KM) / (expectedM * KM)) * 100;
      expect(errPct).toBeLessThan(tol);
    });
  }

  it("keeps Webb's nominal L2 figure inside its real halo range", () => {
    // "fixed" is a nominal distance, not a reading: Webb's true range runs
    // ~1.2-1.7M km as it loops L2. The claim the UI makes ("~1.5 million km")
    // only has to sit inside that band — see data/deep-space.js.
    const km = deepSpaceDistanceKm(entry("jwst"), Date.now());
    expect(km).toBeGreaterThan(1.0e6);
    expect(km).toBeLessThan(1.8e6);
  });

  it("never returns a non-finite distance", () => {
    // A NaN would sail past every `<` comparison and reach the DOM as "NaN km".
    for (const e of DEEP_SPACE) {
      const km = deepSpaceDistanceKm(e, Date.now());
      expect(Number.isFinite(km)).toBe(true);
      expect(km).toBeGreaterThan(0);
    }
    expect(deepSpaceDistanceKm(null, Date.now())).toBeNull();
    expect(deepSpaceDistanceKm({ kind: "nonsense" }, Date.now())).toBeNull();
  });

  it("moves the escape objects outward over time", () => {
    // Every one of these is leaving for good; none may ever come back toward
    // Earth on a decade scale (an annual wobble from Earth's own orbit aside).
    for (const e of DEEP_SPACE.filter((x) => x.kind === "escape")) {
      const now = deepSpaceDistanceKm(e, Date.parse("2026-09-16T00:00:00Z"));
      const later = deepSpaceDistanceKm(e, Date.parse("2036-09-16T00:00:00Z"));
      expect(later).toBeGreaterThan(now);
    }
  });
});

describe("light time", () => {
  it("renders hours and minutes for the Voyagers", () => {
    const km = deepSpaceDistanceKm(entry("voyager1"), Date.parse("2026-09-16T00:00:00Z"));
    // 25.7 billion km is a bit under 24 hours at c.
    expect(fmtLightTime(km)).toMatch(/^2[0-9] h \d{1,2} m$/);
  });

  it("steps the unit down as the distance shrinks", () => {
    expect(fmtLightTime(1.5e6)).toBe("5.0 s");
    expect(fmtLightTime(1e8)).toBe("5.6 m");
    expect(fmtLightTime(4e9)).toBe("3 h 42 m");
  });

  it("never rolls minutes to 60", () => {
    // 59.6 minutes must read "4 h 0 m", not "3 h 60 m".
    for (let km = 1e9; km < 6e10; km += 3.7e7) {
      expect(fmtLightTime(km)).not.toMatch(/ 60 m$/);
    }
  });

  it("rejects a non-finite distance rather than printing NaN", () => {
    expect(lightSeconds(NaN)).toBeNull();
    expect(fmtLightTime(NaN)).toBe("—");
  });
});

describe("matching", () => {
  it("answers the question that prompted the feature", () => {
    const hits = matchDeepSpace("voyager");
    expect(hits.map((h) => h.key)).toEqual(["voyager1", "voyager2"]);
  });

  it("matches aliases the catalog spelling doesn't cover", () => {
    expect(matchDeepSpace("jwst")[0].key).toBe("jwst");
    expect(matchDeepSpace("webb")[0].key).toBe("jwst");
    expect(matchDeepSpace("starman")[0].key).toBe("roadster");
    expect(matchDeepSpace("tesla")[0].key).toBe("roadster");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(matchDeepSpace("  VOYAGER 1 ")[0].key).toBe("voyager1");
  });

  it("returns nothing for an empty query", () => {
    expect(matchDeepSpace("")).toEqual([]);
    expect(matchDeepSpace(null)).toEqual([]);
    expect(matchDeepSpace("   ")).toEqual([]);
  });

  it("does not match unrelated catalog queries", () => {
    for (const q of ["starlink", "iss", "cosmos", "gps", "debris"]) {
      expect(matchDeepSpace(q)).toEqual([]);
    }
  });
});

describe("catalog integrity", () => {
  it("gives every entry the fields the row renders", () => {
    for (const e of DEEP_SPACE) {
      expect(e.key, "key").toBeTruthy();
      expect(e.name, `${e.key} name`).toBeTruthy();
      expect(e.blurb, `${e.key} blurb`).toBeTruthy();
      expect(e.why, `${e.key} why`).toBeTruthy();
      expect(e.desig, `${e.key} desig`).toMatch(/^\d{4}-\d{3}[A-Z]$/);
      expect(e.launched, `${e.key} launched`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(["escape", "orbit", "fixed"]).toContain(e.kind);
    }
  });

  it("keeps keys unique", () => {
    const keys = DEEP_SPACE.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("carries the data each motion model needs", () => {
    for (const e of DEEP_SPACE) {
      if (e.kind === "escape") {
        expect(e.p, `${e.key} p`).toHaveLength(3);
        expect(e.v, `${e.key} v`).toHaveLength(3);
        expect(e.epoch, `${e.key} epoch`).toBeGreaterThan(2400000);
      } else if (e.kind === "orbit") {
        for (const f of ["a", "e", "i", "om", "w", "ma", "epoch"]) {
          expect(Number.isFinite(e.el[f]), `${e.key} el.${f}`).toBe(true);
        }
        // The NEO solver is elliptical-only; a hyperbolic orbit would NaN.
        expect(e.el.e, `${e.key} eccentricity`).toBeLessThan(1);
        expect(e.el.a, `${e.key} semi-major axis`).toBeGreaterThan(0);
      } else {
        expect(e.distKm, `${e.key} distKm`).toBeGreaterThan(0);
      }
    }
  });

  it("only claims a NORAD id where one really exists", () => {
    // The Pioneers have no surviving SATCAT record (CATNR 05860/05861 both
    // return "No SATCAT records found"), so they must not display one.
    expect(entry("pioneer10").id).toBeUndefined();
    expect(entry("pioneer11").id).toBeUndefined();
    expect(entry("voyager1").id).toBe("10321");
    expect(entry("jwst").id).toBe("50463");
  });
});

describe("row rendering", () => {
  function stubUnits(units) {
    const store = { "ot-settings": JSON.stringify({ units }) };
    vi.stubGlobal("localStorage", {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => {
        store[k] = String(v);
      },
      removeItem: (k) => delete store[k],
    });
  }

  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it("scales the distance instead of printing every digit", async () => {
    vi.resetModules();
    stubUnits("metric");
    const { deepSpaceSummary } = await import("../src/ui/deep-space.js");
    const { DEEP_SPACE: DS } = await import("../src/data/deep-space.js");
    const line = deepSpaceSummary(
      DS.find((e) => e.key === "voyager1"),
      Date.parse("2026-09-16T00:00:00Z")
    );
    expect(line).toMatch(/^2[0-9]\.\d billion km · \d+ h \d+ m at light speed$/);
    // the failure this replaced: a 14-digit run that wraps the row on a phone
    expect(line).not.toMatch(/\d{4},\d{3},\d{3}/);
  });

  it("honours the miles preference", async () => {
    vi.resetModules();
    stubUnits("imperial");
    const { deepSpaceSummary } = await import("../src/ui/deep-space.js");
    const { DEEP_SPACE: DS } = await import("../src/data/deep-space.js");
    const line = deepSpaceSummary(
      DS.find((e) => e.key === "voyager1"),
      Date.parse("2026-09-16T00:00:00Z")
    );
    expect(line).toContain("billion mi");
  });

  it("marks a nominal figure approximate", async () => {
    vi.resetModules();
    stubUnits("metric");
    const { deepSpaceSummary } = await import("../src/ui/deep-space.js");
    const { DEEP_SPACE: DS } = await import("../src/data/deep-space.js");
    expect(deepSpaceSummary(DS.find((e) => e.key === "jwst"))).toMatch(/^~/);
    expect(deepSpaceSummary(DS.find((e) => e.key === "voyager1"))).not.toMatch(/^~/);
  });

  it("escapes every field it interpolates", async () => {
    vi.resetModules();
    stubUnits("metric");
    const { deepSpaceRowHTML } = await import("../src/ui/deep-space.js");
    const html = deepSpaceRowHTML({
      key: "x",
      name: "<img src=x onerror=alert(1)>",
      desig: "1999-001A",
      launched: "1999-01-01",
      kind: "fixed",
      distKm: 1e6,
      blurb: 'it\'s "quoted" & <b>bold</b>',
      why: "<script>alert(1)</script>",
    });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;img");
    expect(html).toContain("&amp;");
  });

  it("renders a readable launch date and omits an absent NORAD id", async () => {
    vi.resetModules();
    stubUnits("metric");
    const { deepSpaceRowHTML } = await import("../src/ui/deep-space.js");
    const { DEEP_SPACE: DS } = await import("../src/data/deep-space.js");
    const v1 = deepSpaceRowHTML(DS.find((e) => e.key === "voyager1"));
    expect(v1).toContain("5 Sep 1977");
    expect(v1).toContain("NORAD 10321");
    const p10 = deepSpaceRowHTML(DS.find((e) => e.key === "pioneer10"));
    expect(p10).not.toContain("NORAD");
    expect(p10).toContain("1972-012A");
  });
});

describe("fmtBigDistance rounding", () => {
  function stubUnits(units) {
    const store = { "ot-settings": JSON.stringify({ units }) };
    vi.stubGlobal("localStorage", {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => {
        store[k] = String(v);
      },
      removeItem: (k) => delete store[k],
    });
  }

  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it("does not overclaim precision on a nominal figure converted to miles", async () => {
    vi.resetModules();
    stubUnits("imperial");
    const { fmtBigDistance } = await import("../src/util/units.js");
    // Webb's nominal 1.5M km is 932,057 mi — six exact digits on a round number.
    expect(fmtBigDistance(1.5e6)).toBe("932,000 mi");
  });

  it("scales the big end", async () => {
    vi.resetModules();
    stubUnits("metric");
    const { fmtBigDistance } = await import("../src/util/units.js");
    expect(fmtBigDistance(2.57e10)).toBe("25.7 billion km");
    expect(fmtBigDistance(1.5e6)).toBe("1.5 million km");
    expect(fmtBigDistance(8.5e7)).toBe("85.0 million km");
  });

  it("leaves small distances alone and survives nonsense", async () => {
    vi.resetModules();
    stubUnits("metric");
    const { fmtBigDistance } = await import("../src/util/units.js");
    expect(fmtBigDistance(409)).toBe("409 km");
    expect(fmtBigDistance(NaN)).toBe("—");
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

function stubStorage(units) {
  const store = units ? { "ot-settings": JSON.stringify({ units }) } : {};
  vi.stubGlobal("localStorage", {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => delete store[k],
  });
}

async function freshUnits(units) {
  vi.resetModules();
  stubStorage(units);
  return {
    u: await import("../src/util/units.js"),
    s: await import("../src/settings.js"),
  };
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe("imperial (the default)", () => {
  it("converts altitude to miles", async () => {
    const { u } = await freshUnits();
    // The ISS at ~409km is ~254 miles up.
    expect(u.fmtAltitude(409)).toBe("254 mi up");
    expect(u.distanceUnit()).toBe("mi");
    expect(u.toDistance(409)).toBe("254");
  });

  it("converts speed to mph", async () => {
    const { u } = await freshUnits();
    // 7.66 km/s = 27,576 km/h = ~17,135 mph.
    expect(u.fmtSpeed(7.66)).toBe("17,135 mph");
  });

  it("converts plain distance to miles", async () => {
    const { u } = await freshUnits();
    expect(u.fmtDistance(1000)).toBe("621 mi");
  });
});

describe("metric", () => {
  it("leaves altitude in km", async () => {
    const { u } = await freshUnits("metric");
    expect(u.fmtAltitude(409)).toBe("409 km up");
    expect(u.distanceUnit()).toBe("km");
    expect(u.toDistance(409)).toBe("409");
  });

  it("reports speed in km/h", async () => {
    const { u } = await freshUnits("metric");
    expect(u.fmtSpeed(7.66)).toBe("27,576 km/h");
  });

  it("leaves plain distance in km", async () => {
    const { u } = await freshUnits("metric");
    expect(u.fmtDistance(1000)).toBe("1,000 km");
  });
});

describe("behaviour", () => {
  it("follows a units change made after import", async () => {
    const { u, s } = await freshUnits();
    expect(u.fmtAltitude(409)).toBe("254 mi up");
    s.saveSettings({ units: "metric" });
    // Read live rather than captured at import — the Settings toggle has to
    // take effect without a reload.
    expect(u.fmtAltitude(409)).toBe("409 km up");
  });

  it("honours a digits argument", async () => {
    const { u } = await freshUnits("metric");
    expect(u.fmtAltitude(409.123, 2)).toBe("409.12 km up");
    expect(u.toDistance(409.123, 1)).toBe("409.1");
  });

  it("handles zero and negative values without producing junk", async () => {
    const { u } = await freshUnits("metric");
    expect(u.fmtAltitude(0)).toBe("0 km up");
    expect(u.fmtDistance(-5)).toBe("-5 km");
  });

  it("never emits an HTML metacharacter — the basis for its lint allowlisting", async () => {
    const { u } = await freshUnits();
    for (const out of [
      u.fmtAltitude(12345.6),
      u.fmtSpeed(7.66),
      u.fmtDistance(999999),
      u.distanceUnit(),
      u.toDistance(42),
    ]) {
      expect(out).not.toMatch(/[<>&"']/);
    }
  });
});

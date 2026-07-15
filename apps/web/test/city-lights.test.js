import { describe, it, expect } from "vitest";
import { CITY_LIGHTS } from "../src/scene/cityLights.js";

/**
 * The night-lights layer plots CITY_LIGHTS directly onto the globe texture.
 * A malformed entry doesn't throw — it just paints a glow in the wrong
 * place (or wraps off the map), which nothing else would catch.
 */
describe("CITY_LIGHTS data", () => {
  it("has a meaningful number of entries", () => {
    expect(CITY_LIGHTS.length).toBeGreaterThan(150);
  });

  it("every entry is [lat, lon, weight] with sane ranges", () => {
    for (const entry of CITY_LIGHTS) {
      expect(entry).toHaveLength(3);
      const [lat, lon, w] = entry;
      expect(lat).toBeGreaterThanOrEqual(-90);
      expect(lat).toBeLessThanOrEqual(90);
      expect(lon).toBeGreaterThanOrEqual(-180);
      expect(lon).toBeLessThanOrEqual(180);
      expect(w).toBeGreaterThanOrEqual(1);
      expect(w).toBeLessThanOrEqual(10);
    }
  });

  it("has no duplicate coordinates", () => {
    const seen = new Set();
    for (const [lat, lon] of CITY_LIGHTS) {
      const key = `${lat},${lon}`;
      expect(seen.has(key), `duplicate city at ${key}`).toBe(false);
      seen.add(key);
    }
  });
});

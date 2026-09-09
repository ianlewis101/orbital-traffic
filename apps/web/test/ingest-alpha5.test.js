import { describe, it, expect, beforeEach } from "vitest";
import { ingest } from "../src/data/ingest.js";
import { state } from "../src/state.js";

/**
 * Catalog numbers >= 100000 are Alpha-5 encoded in the TLE satellite-number
 * field ("A0057" for 100057) — see packages/catalog/src/tle.js's noradId().
 * satellite.js's own satrec.satnum is that raw, undecoded field; ingest()
 * must decode it via noradId() so the app's `id` matches the canonical form
 * every other consumer (capsule-status.json, /satcat, descriptions.json) is
 * keyed by. Regression for Soyuz MS-29 (100057) showing "Status unavailable"
 * because its app-side id was the undecoded "A0057".
 */

const BASE_L1 = "1 25544U 98067A   26182.50817465  .00006185  00000+0  11827-3 0  9996";
const BASE_L2 = "2 25544  51.6311 229.1989 0004224 255.0896 104.9625 15.49503254573972";

function makeAlpha5Record(alpha5Field, name) {
  return {
    name,
    l1: BASE_L1.replace("25544", alpha5Field),
    l2: BASE_L2.replace("25544", alpha5Field),
    cat: "capsules",
  };
}

beforeEach(() => {
  state.sats.length = 0;
  state.byId.clear();
  state.selected = null;
});

describe("ingest Alpha-5 decoding", () => {
  it("decodes an Alpha-5 satellite number to its canonical numeric id", async () => {
    await ingest([makeAlpha5Record("A0057", "SOYUZ-MS 29")]);
    expect(state.byId.has("100057")).toBe(true);
    expect(state.byId.has("A0057")).toBe(false);
    expect(state.sats.map((s) => s.id)).toEqual(["100057"]);
  });

  it("leaves a plain numeric satellite number untouched", async () => {
    await ingest([makeAlpha5Record("90001", "TESTSAT")]);
    expect(state.byId.has("90001")).toBe(true);
  });
});

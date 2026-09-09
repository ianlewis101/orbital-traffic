import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * ingest()'s per-record loop is one async function processing up to ~19,000
 * records in a single pass — an uncaught exception anywhere in that loop
 * aborts the whole batch silently (nothing downstream awaits ingest() with
 * its own try/catch), leaving the user stuck with however many records
 * happened to process before the crash point, forever, with no error and no
 * retry. Only satellite.js's twoline2satrec() was ever guarded against that;
 * id decoding and classification were not. This regression-guards the fix:
 * one malformed/unexpected record must never take the rest of the batch
 * down with it.
 */

vi.mock("@orbital-traffic/catalog", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    categorize: (id, name, cat) => {
      if (id === "90002") throw new Error("simulated classification failure");
      return actual.categorize(id, name, cat);
    },
  };
});

const { ingest } = await import("../src/data/ingest.js");
const { state } = await import("../src/state.js");

const BASE_L1 = "1 25544U 98067A   26182.50817465  .00006185  00000+0  11827-3 0  9996";
const BASE_L2 = "2 25544  51.6311 229.1989 0004224 255.0896 104.9625 15.49503254573972";

function makeRecord(satnum) {
  return {
    name: "TESTSAT " + satnum,
    l1: BASE_L1.replace("25544", satnum),
    l2: BASE_L2.replace("25544", satnum),
    cat: "other",
  };
}

beforeEach(() => {
  state.sats.length = 0;
  state.byId.clear();
  state.selected = null;
});

describe("ingest fault tolerance", () => {
  it("skips a record that throws during classification without aborting the rest of the batch", async () => {
    await ingest([makeRecord("90001"), makeRecord("90002"), makeRecord("90003")]);
    expect(state.byId.has("90001")).toBe(true);
    expect(state.byId.has("90002")).toBe(false); // the throwing record — skipped, not applied
    expect(state.byId.has("90003")).toBe(true); // still reached and processed
    expect(state.sats).toHaveLength(2);
  });

  it("does not reject the ingest() promise", async () => {
    await expect(ingest([makeRecord("90002")])).resolves.toBeDefined();
  });
});

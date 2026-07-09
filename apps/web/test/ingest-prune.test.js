import { describe, it, expect, beforeEach } from "vitest";
import { ingest, removeSats } from "../src/data/ingest.js";
import { state } from "../src/state.js";

/**
 * Live-sync pruning: an object absent from the feed is only removed once
 * its TLE epoch is also stale, so a partially-failed fetch (one group
 * missing) can't wipe healthy objects, while genuinely de-orbited ones —
 * whose elsets stop being re-fit — age out and disappear instead of
 * rendering as ghosts forever.
 */

const BASE_L1 = "1 25544U 98067A   26182.50817465  .00006185  00000+0  11827-3 0  9996";
const BASE_L2 = "2 25544  51.6311 229.1989 0004224 255.0896 104.9625 15.49503254573972";

/** TLE epoch field (cols 19-32, YYDDD.DDDDDDDD) for an arbitrary date. */
function epochField(date) {
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 1);
  const doy = (date.getTime() - startOfYear) / 86400000 + 1;
  const yy = String(date.getUTCFullYear() % 100).padStart(2, "0");
  return yy + doy.toFixed(8).padStart(12, "0");
}

function makeRecord(satnum, epochDate) {
  return {
    name: "TESTSAT " + satnum,
    l1: BASE_L1.replace("25544", satnum).replace("26182.50817465", epochField(epochDate)),
    l2: BASE_L2.replace("25544", satnum),
    cat: "other",
  };
}

const DAY_MS = 86400000;
const now = () => new Date();
const daysAgo = (d) => new Date(Date.now() - d * DAY_MS);

beforeEach(() => {
  state.sats.length = 0;
  state.byId.clear();
  state.selected = null;
});

describe("ingest pruning", () => {
  it("without the prune flag, absent objects are never removed", () => {
    ingest([makeRecord("90001", daysAgo(30))]);
    ingest([makeRecord("90002", now())]);
    expect(state.sats).toHaveLength(2);
  });

  it("prunes absent objects only once their elset is stale", () => {
    ingest([
      makeRecord("90001", daysAgo(2)), // absent from live feed, but fresh
      makeRecord("90002", daysAgo(30)), // absent and stale — the de-orbited ghost
      makeRecord("90003", daysAgo(1)), // still in the live feed
    ]);
    const removed = ingest([makeRecord("90003", now())], { prune: true });
    expect(removed.map((s) => s.id)).toEqual(["90002"]);
    expect(state.byId.has("90001")).toBe(true);
    expect(state.byId.has("90002")).toBe(false);
    expect(state.byId.has("90003")).toBe(true);
  });

  it("a stale object still present in the feed is kept", () => {
    ingest([makeRecord("90001", daysAgo(30))]);
    const removed = ingest([makeRecord("90001", daysAgo(30))], { prune: true });
    expect(removed).toEqual([]);
    expect(state.byId.has("90001")).toBe(true);
  });

  it("recounts categories after pruning", () => {
    ingest([makeRecord("90001", daysAgo(30)), makeRecord("90002", now())]);
    expect(state.cats.other).toBe(2);
    ingest([makeRecord("90002", now())], { prune: true });
    expect(state.cats.other).toBe(1);
  });
});

describe("removeSats", () => {
  it("removes by id regardless of epoch age and returns the removed objects", () => {
    ingest([makeRecord("90001", now()), makeRecord("90002", now())]);
    const removed = removeSats(["90001", "99999"]);
    expect(removed.map((s) => s.id)).toEqual(["90001"]);
    expect(state.byId.has("90001")).toBe(false);
    expect(state.sats).toHaveLength(1);
    expect(state.cats.other).toBe(1);
  });
});

import { describe, it, expect } from "vitest";
import {
  freshnessText,
  formatSimOffset,
  isTimeShifted,
  shouldSyncOnVisible,
  SIM_SHIFT_THRESHOLD_MS,
} from "../src/util/freshness.js";

function ago(ms) {
  return new Date(Date.now() - ms);
}
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatSimOffset", () => {
  it("reports a sub-minute offset as the current moment (no misleading '0m')", () => {
    expect(formatSimOffset(0)).toBe("the current moment");
    expect(formatSimOffset(45 * 1000)).toBe("the current moment");
    expect(formatSimOffset(-59 * 1000)).toBe("the current moment");
  });

  it("labels a future offset 'ahead' and a past offset 'behind'", () => {
    expect(formatSimOffset(6 * HOUR)).toBe("6h ahead");
    expect(formatSimOffset(-1 * HOUR)).toBe("1h behind");
  });

  it("uses coarse minute/hour/day buckets", () => {
    expect(formatSimOffset(10 * MIN)).toBe("10m ahead");
    expect(formatSimOffset(-90 * MIN)).toBe("1h behind");
    expect(formatSimOffset(25 * HOUR)).toBe("1d ahead");
    expect(formatSimOffset(-2 * DAY)).toBe("2d behind");
  });
});

describe("isTimeShifted", () => {
  const now = Date.now();

  it("is not shifted at real-time rate tracking wall-clock", () => {
    expect(isTimeShifted({ rate: 1, simNow: now, now })).toBe(false);
    // small frame-timing jitter under the threshold stays live
    expect(isTimeShifted({ rate: 1, simNow: now + 30 * 1000, now })).toBe(false);
  });

  it("is shifted whenever the rate is not 1 (paused or sped up)", () => {
    expect(isTimeShifted({ rate: 0, simNow: now, now })).toBe(true);
    expect(isTimeShifted({ rate: 60, simNow: now, now })).toBe(true);
  });

  it("is shifted when a jump moved the clock past the threshold at rate 1", () => {
    expect(isTimeShifted({ rate: 1, simNow: now + 6 * HOUR, now })).toBe(true);
    expect(isTimeShifted({ rate: 1, simNow: now - 2 * MIN, now })).toBe(true);
    // exactly at the threshold is not yet shifted (strictly greater)
    expect(isTimeShifted({ rate: 1, simNow: now + SIM_SHIFT_THRESHOLD_MS, now })).toBe(false);
  });
});

describe("shouldSyncOnVisible", () => {
  const now = Date.now();
  const staleMs = 20 * MIN;

  it("syncs immediately when there has never been a successful sync", () => {
    expect(shouldSyncOnVisible({ srcTime: null, now, staleMs })).toBe(true);
    expect(shouldSyncOnVisible({ srcTime: undefined, now, staleMs })).toBe(true);
  });

  it("does not sync when the last sync is still fresh", () => {
    expect(shouldSyncOnVisible({ srcTime: new Date(now - 5 * MIN), now, staleMs })).toBe(false);
  });

  it("syncs when the last sync is older than the stale window", () => {
    expect(shouldSyncOnVisible({ srcTime: new Date(now - 25 * MIN), now, staleMs })).toBe(true);
  });

  it("syncs on an unparseable timestamp rather than trusting it", () => {
    expect(shouldSyncOnVisible({ srcTime: new Date("nonsense"), now, staleMs })).toBe(true);
  });
});

describe("freshnessText", () => {
  it("shows a simulation treatment when time-shifted, taking priority over live data", () => {
    // Even with a fresh live sync, a shifted globe is not showing 'now'.
    expect(freshnessText({ simShifted: true, simOffsetMs: 6 * HOUR, srcTime: ago(1 * MIN) })).toBe(
      "Simulation · showing 6h ahead"
    );
    expect(freshnessText({ simShifted: true, simOffsetMs: -1 * DAY })).toBe(
      "Simulation · showing 1d behind"
    );
  });

  it("shows the live-synced age once a sync has succeeded", () => {
    expect(freshnessText({ srcTime: ago(3 * MIN) })).toBe("Live positions · updated 3m ago");
    expect(freshnessText({ srcTime: ago(0) })).toBe("Live positions · updated just now");
  });

  it("keeps showing the live age even if a later refresh failed (data on screen is still live)", () => {
    expect(freshnessText({ srcTime: ago(8 * MIN), syncFailed: true })).toBe(
      "Live positions · updated 8m ago"
    );
  });

  it("shows the bundled catalog's real age before the first sync, never a bare 'syncing…'", () => {
    expect(freshnessText({ srcTime: null, bootTime: ago(8 * HOUR) })).toBe(
      "Live positions · catalog from 8h ago"
    );
  });

  it("says cached-and-retrying when the sync failed before any success", () => {
    expect(freshnessText({ srcTime: null, syncFailed: true, bootTime: ago(2 * HOUR) })).toBe(
      "Cached elements from 2h ago · retrying automatically"
    );
  });

  it("still degrades gracefully when the bundled age is unavailable", () => {
    expect(freshnessText({ srcTime: null, syncFailed: true, bootTime: null })).toBe(
      "Cached elements shown · retrying automatically"
    );
    expect(freshnessText({ srcTime: null, syncFailed: false, bootTime: null })).toBe(
      "Live positions · syncing…"
    );
  });
});

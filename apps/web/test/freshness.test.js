import { describe, it, expect } from "vitest";
import {
  freshnessText,
  formatSimOffset,
  isTimeShifted,
  shouldSyncOnVisible,
  stalenessNote,
  SIM_SHIFT_THRESHOLD_MS,
  CAPSULE_STALE_MS,
  ISS_TODAY_STALE_MS,
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
    expect(freshnessText({ srcTime: ago(3 * MIN) })).toBe("Live · updated 3m ago");
    expect(freshnessText({ srcTime: ago(0) })).toBe("Live · updated just now");
  });

  it("keeps showing the live age even if a later refresh failed (data on screen is still live)", () => {
    expect(freshnessText({ srcTime: ago(8 * MIN), syncFailed: true })).toBe(
      "Live · updated 8m ago"
    );
  });

  it("shows the bundled catalog's real age before the first sync, never a bare 'syncing…'", () => {
    expect(freshnessText({ srcTime: null, bootTime: ago(8 * HOUR) })).toBe(
      "Live · catalog 8h ago"
    );
  });

  it("says cached-and-retrying when the sync failed before any success", () => {
    expect(freshnessText({ srcTime: null, syncFailed: true, bootTime: ago(2 * HOUR) })).toBe(
      "Cached · 2h ago · retrying"
    );
  });

  it("still degrades gracefully when the bundled age is unavailable", () => {
    expect(freshnessText({ srcTime: null, syncFailed: true, bootTime: null })).toBe(
      "Cached · retrying"
    );
    expect(freshnessText({ srcTime: null, syncFailed: false, bootTime: null })).toBe(
      "Live · syncing…"
    );
  });
});

/**
 * capsule-status.json and iss-today.json both carry an `updated` timestamp
 * that nothing compared against a limit. If either scheduled job silently
 * stopped, the app would present months-old capsule phases and activity logs
 * as current — the date was shown, but a date alone doesn't read as a warning.
 */
describe("stalenessNote", () => {
  const NOW = Date.parse("2026-08-18T12:00:00Z");
  const agoMs = (ms) => new Date(NOW - ms).toISOString();
  const HOURS = 3600000;

  it("says nothing at all while the data is fresh", () => {
    expect(stalenessNote(agoMs(1 * HOURS), CAPSULE_STALE_MS, NOW)).toBeNull();
    expect(stalenessNote(agoMs(5 * HOURS), CAPSULE_STALE_MS, NOW)).toBeNull();
  });

  it("tolerates a few missed runs before warning", () => {
    // The capsule job runs hourly; 6 misses is the limit, so 6h is still fine.
    expect(stalenessNote(agoMs(6 * HOURS), CAPSULE_STALE_MS, NOW)).toBeNull();
    expect(stalenessNote(agoMs(7 * HOURS), CAPSULE_STALE_MS, NOW)).toBe(
      "Not updated in 7h — may be out of date"
    );
  });

  it("switches to days once the gap is large", () => {
    expect(stalenessNote(agoMs(60 * 24 * HOURS), ISS_TODAY_STALE_MS, NOW)).toBe(
      "Not updated in 60d — may be out of date"
    );
  });

  it("applies the ISS Today threshold in days, not hours", () => {
    expect(stalenessNote(agoMs(2 * 24 * HOURS), ISS_TODAY_STALE_MS, NOW)).toBeNull();
    expect(stalenessNote(agoMs(4 * 24 * HOURS), ISS_TODAY_STALE_MS, NOW)).toBe(
      "Not updated in 4d — may be out of date"
    );
  });

  it("treats an unknown age as stale, never as fresh", () => {
    // Not knowing how old data is, is not evidence that it is current.
    for (const bad of [null, undefined, "", "not a date", NaN]) {
      expect(stalenessNote(bad, CAPSULE_STALE_MS, NOW)).toBe("Age unknown — may be out of date");
    }
  });

  it("accepts a Date as well as an ISO string", () => {
    expect(stalenessNote(new Date(NOW - 30 * HOURS), CAPSULE_STALE_MS, NOW)).toBe(
      "Not updated in 30h — may be out of date"
    );
  });
});

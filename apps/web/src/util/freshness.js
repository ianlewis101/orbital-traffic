/**
 * Pure logic behind the footer freshness line and the simulation-clock
 * badge — no DOM, no timers, no globals — so every state it can render is
 * unit-testable in isolation (see test/freshness.test.js). Follows the same
 * "one small pure formatter, decided by the caller" shape as relative-time.js.
 *
 * The honesty rule these helpers exist to keep: the footer must never imply
 * the elements are freshly live when they aren't — before the first sync it
 * shows the real age of the bundled catalog, on failure it says so and that
 * it retries, and whenever the time machine has moved the globe off
 * wall-clock it switches to an explicit simulation treatment.
 */
import { formatRelativeTime } from "./relative-time.js";

/**
 * How far the simulation clock may drift from wall-clock before we consider
 * the view "time-shifted" rather than live. A jump button moves it by an
 * hour or more; real-time playback holds it within a second or two, so a
 * one-minute band cleanly separates the two without flickering on ordinary
 * frame-timing jitter.
 */
export const SIM_SHIFT_THRESHOLD_MS = 60 * 1000;

/**
 * Is the globe showing a time other than "now"? True when the time machine
 * is paused or sped up (rate !== 1) OR when a jump button has moved the
 * simulation clock away from wall-clock past the threshold — the exact case
 * where the old badge still claimed "LIVE" while displaying a time hours off.
 */
export function isTimeShifted({
  rate,
  simNow,
  now = Date.now(),
  thresholdMs = SIM_SHIFT_THRESHOLD_MS,
}) {
  if (rate !== 1) return true;
  return Math.abs(simNow - now) > thresholdMs;
}

/**
 * Plain-language magnitude + direction of a simulation offset from now, for
 * the "Simulation · showing …" line. Same coarse buckets as relative-time
 * (nothing finer than a minute); "ahead"/"behind" replaces "ago" since the
 * offset can point into the future. A near-zero offset (e.g. paused right at
 * now, or just after switching to fast-forward before it has drifted) reads
 * as "the current moment" rather than a misleading "0m".
 */
export function formatSimOffset(offsetMs) {
  const absSec = Math.floor(Math.abs(offsetMs) / 1000);
  if (absSec < 60) return "the current moment";
  const dir = offsetMs >= 0 ? "ahead" : "behind";
  const min = Math.floor(absSec / 60);
  if (min < 60) return `${min}m ${dir}`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ${dir}`;
  return `${Math.floor(hr / 24)}d ${dir}`;
}

/**
 * The single string the footer freshness line should show, given the app's
 * data/simulation state. Priority, most specific first:
 *
 *   1. Time-shifted — the globe is not showing now, so nothing about it is
 *      "live"; describe the offset instead.
 *   2. Live-synced — a live element refresh has succeeded at least once;
 *      show how long ago (a later refresh failing doesn't erase that the
 *      data on screen is genuinely live, and the retry loop keeps trying).
 *   3. Sync failed before any success — say cached elements are shown and
 *      that it retries, with the bundled catalog's real age when known.
 *   4. Still on the bundled boot catalog — show its real age, never a
 *      permanent "syncing…".
 *
 * Pure: caller passes the already-decided simShifted/offset and the two
 * timestamps; relative wording comes from formatRelativeTime.
 */
export function freshnessText({
  simShifted = false,
  simOffsetMs = 0,
  srcTime = null,
  syncFailed = false,
  bootTime = null,
} = {}) {
  if (simShifted) {
    return `Simulation · showing ${formatSimOffset(simOffsetMs)}`;
  }
  if (srcTime) {
    return `Live positions · updated ${formatRelativeTime(srcTime)}`;
  }
  const bootAge = formatRelativeTime(bootTime);
  if (syncFailed) {
    return bootAge
      ? `Cached elements from ${bootAge} · retrying automatically`
      : "Cached elements shown · retrying automatically";
  }
  return bootAge ? `Live positions · catalog from ${bootAge}` : "Live positions · syncing…";
}

/**
 * On the tab becoming visible again, should we sync immediately rather than
 * wait for the next periodic tick? Yes if we've never synced, or the last
 * successful sync is older than staleMs — a tab left open all evening should
 * catch up the moment the user looks at it. Pure so the decision is testable
 * without faking visibilitychange.
 */
export function shouldSyncOnVisible({ srcTime, now = Date.now(), staleMs }) {
  if (!srcTime) return true;
  const t = srcTime instanceof Date ? srcTime.getTime() : new Date(srcTime).getTime();
  if (!Number.isFinite(t)) return true;
  return now - t > staleMs;
}

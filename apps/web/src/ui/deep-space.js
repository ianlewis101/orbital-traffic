/**
 * Search-panel rows for the objects in data/deep-space.js.
 *
 * These render inside the existing results listbox but are not satellites:
 * they have no satrec, no scene presence and no category, so they never go
 * through select()/the info card — that path assumes a propagatable object at
 * nearly every step (crew fetch, orbit trail, telemetry grid, SATCAT enrich).
 * A row expands in place instead, which also keeps the whole feature inside the
 * one surface a user is already looking at when they hit the dead end.
 *
 * Distances are computed against real wall-clock time, never state.simNow. The
 * time machine moves orbital positions around; it has no business inventing a
 * distance for a probe this app doesn't plot. Nothing here ticks, either — at
 * 17 km/s Voyager 1 needs about ten weeks to shift the third significant digit,
 * so a value computed once per keystroke is accurate until long after the
 * panel has closed.
 */
import { esc } from "../util/html.js";
import { fmtBigDistance } from "../util/units.js";
import { deepSpaceDistanceKm, fmtLightTime } from "../astro/deep-space.js";

const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "1977-09-05" -> "5 Sep 1977"; anything unparseable is returned unchanged. */
function fmtLaunch(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return String(iso || "");
  const mon = MON3[Number(m[2]) - 1];
  if (!mon) return String(iso);
  return `${Number(m[3])} ${mon} ${m[1]}`;
}

/**
 * The one-line distance summary: "25.7 billion km · 23 h 49 m at light speed".
 *
 * A "fixed" entry is a nominal figure rather than a reading, so it is marked
 * with "~" — see the kind notes in data/deep-space.js.
 */
export function deepSpaceSummary(entry, nowMs = Date.now()) {
  const km = deepSpaceDistanceKm(entry, nowMs);
  if (km === null) return "Distance unavailable";
  const approx = entry.kind === "fixed" ? "~" : "";
  return `${approx}${fmtBigDistance(km)} · ${fmtLightTime(km)} at light speed`;
}

/**
 * Full markup for one result row, collapsed detail included.
 *
 * Every interpolated field is esc()'d even though this table is our own
 * authored copy: the house rule (CLAUDE.md #7) is that anything reaching
 * innerHTML goes through esc(), and an apostrophe in a blurb would otherwise
 * be one careless edit away from breaking the attribute it sits in.
 */
export function deepSpaceRowHTML(entry, nowMs = Date.now()) {
  const facts = [
    entry.id ? `NORAD ${entry.id}` : null,
    entry.desig ? `INT'L ${entry.desig}` : null,
    entry.launched ? `Launched ${fmtLaunch(entry.launched)}` : null,
  ]
    .filter(Boolean)
    .join("  ·  ");
  return `<div class="ds-head">
      <span class="cd"></span>
      <span class="nm">${esc(entry.name)}</span>
      <span class="meta">NOT TRACKABLE</span>
    </div>
    <div class="ds-sub">${esc(deepSpaceSummary(entry, nowMs))}</div>
    <div class="ds-detail">
      <p class="ds-blurb">${esc(entry.blurb)}</p>
      <p class="ds-why"><b>Why it isn't on the globe</b>${esc(entry.why)}</p>
      <p class="ds-facts">${esc(facts)}</p>
    </div>`;
}

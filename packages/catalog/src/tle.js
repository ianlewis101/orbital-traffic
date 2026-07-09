import { categorize } from "./classify.js";

/** NORAD catalog number from TLE line 1. */
export function noradId(l1) {
  return l1.slice(2, 7).trim();
}

const DAY_MS = 86400000;

/** Two-digit TLE years pivot at 57 (Sputnik): 57-99 → 19xx, 00-56 → 20xx. */
function epochYearToFull(yy) {
  return yy < 57 ? 2000 + yy : 1900 + yy;
}

/**
 * Epoch timestamp from TLE line 1 (columns 19-32, YYDDD.DDDDDDDD, day 1 =
 * Jan 1 UTC), or null if the field doesn't parse. This is how stale — and
 * therefore how trustworthy — a record is: a TLE that has stopped being
 * re-fit usually means the object de-orbited.
 */
export function tleEpochDate(l1) {
  if (typeof l1 !== "string" || l1.length < 32) return null;
  const yy = Number(l1.slice(18, 20));
  const doy = Number(l1.slice(20, 32));
  if (!Number.isFinite(yy) || !Number.isFinite(doy) || doy <= 0) return null;
  return new Date(Date.UTC(epochYearToFull(yy), 0, 1) + (doy - 1) * DAY_MS);
}

/** Age of a TLE in (fractional) days at `at`, or null if the epoch doesn't parse. */
export function tleAgeDays(l1, at = new Date()) {
  const epoch = tleEpochDate(l1);
  return epoch ? (at.getTime() - epoch.getTime()) / DAY_MS : null;
}

/**
 * Same epoch, read from an already-parsed satellite.js satrec
 * (epochyr/epochdays) — for callers like the web app that keep only the
 * satrec, not the source lines.
 */
export function satrecEpochDate(rec) {
  if (!rec || !Number.isFinite(rec.epochyr) || !Number.isFinite(rec.epochdays)) return null;
  return new Date(Date.UTC(epochYearToFull(rec.epochyr), 0, 1) + (rec.epochdays - 1) * DAY_MS);
}

/** Age of a satrec's epoch in (fractional) days at `at`, or null if unavailable. */
export function satrecAgeDays(rec, at = new Date()) {
  const epoch = satrecEpochDate(rec);
  return epoch ? (at.getTime() - epoch.getTime()) / DAY_MS : null;
}

/**
 * Parse three-line-element text into records, applying the canonical
 * classification to each. Resynchronizes on malformed input (stray blank
 * or truncated lines) instead of silently dropping the rest of the file.
 *
 * @param {string} text  raw TLE text (name / line1 / line2 triplets)
 * @param {string} cat   category to assign records from this feed
 * @returns {{name: string, l1: string, l2: string, cat: string}[]}
 */
export function parseTle(text, cat) {
  const lines = (text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const recs = [];
  let i = 0;
  while (i + 2 < lines.length) {
    const l1 = lines[i + 1];
    const l2 = lines[i + 2];
    if (l1.startsWith("1 ") && l2.startsWith("2 ")) {
      const name = lines[i];
      const id = noradId(l1);
      recs.push({ name, l1, l2, cat: categorize(id, name, cat) });
      i += 3;
    } else {
      i += 1;
    }
  }
  return recs;
}

/**
 * Merge per-group record arrays in priority order: a NORAD ID already
 * claimed by an earlier (more specific) group is never overwritten by a
 * later, more generic one.
 *
 * @param {Array<Array<{name,l1,l2,cat}>>} groups  arrays in priority order
 * @returns {Array<{name,l1,l2,cat}>}
 */
export function mergeRecords(groups) {
  const merged = new Map();
  for (const recs of groups) {
    for (const rec of recs) {
      const id = noradId(rec.l1);
      if (!merged.has(id)) merged.set(id, rec);
    }
  }
  return Array.from(merged.values());
}

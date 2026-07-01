import { categorize } from "./classify.js";

/** NORAD catalog number from TLE line 1. */
export function noradId(l1) {
  return l1.slice(2, 7).trim();
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
  const lines = (text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
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

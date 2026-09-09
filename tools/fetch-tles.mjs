#!/usr/bin/env node
/**
 * fetch-tles.mjs
 * Fetches fresh TLE data from CelesTrak and rewrites the web app's bundled
 * catalog (apps/web/public/data/satellites.json). Run locally or via the
 * scheduled refresh-tle-data workflow.
 *
 * Replaces the legacy Python script that regex-patched JSON into a
 * monolithic index.html — data is now a plain versioned asset.
 */
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseGp,
  mergeRecords,
  GROUPS,
  CELESTRAK_BASE,
  FETCH_HEADERS,
  noradId,
  diffLaunchesReentries,
  MAX_LAUNCH_REENTRY_EVENTS,
} from "@orbital-traffic/catalog";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../apps/web/public/data/satellites.json"
);
const LOG_OUT = join(dirname(fileURLToPath(import.meta.url)), "../launch-reentry-log.json");
const POLITE_DELAY_MS = 1000; // between CelesTrak requests

/**
 * The catalog passed 100000 in 2026, so a healthy fetch always contains some
 * objects at or above it (~172 as of 2026-07-31).
 */
export const MIN_WIDE_NORAD_ID = 100000;

/** How many records carry a catalog number too wide for the legacy TLE format. */
export function countWideCatalogNumbers(records) {
  let n = 0;
  for (const r of records) {
    if (Number(noradId(r.l1)) >= MIN_WIDE_NORAD_ID) n++;
  }
  return n;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * How far the merged catalog may shrink against the last committed one
 * before the run is treated as bad data. Day-to-day churn is a fraction of a
 * percent — objects decay and launch a few dozen at a time against ~19,000 —
 * so 5% is far above real movement and far below losing any single group
 * (the smallest, oneweb, is ~3.4%; starlink alone is 57%).
 */
export const MAX_CATALOG_SHRINK = 0.05;

/**
 * Returns null — not [] — when the fetch itself failed, so main() can tell
 * "upstream is down" apart from "this group is genuinely empty". Returning []
 * for both is what let a single failed group silently vanish from the catalog
 * while the run still reported success.
 */
async function fetchGroup(group, cat) {
  process.stdout.write(`  Fetching ${group}... `);
  try {
    const res = await fetch(CELESTRAK_BASE + group, { headers: FETCH_HEADERS });
    if (!res.ok) {
      console.log(`FAILED (HTTP ${res.status})`);
      return null;
    }
    const recs = parseGp(await res.text(), cat);
    console.log(`${recs.length} objects`);
    return recs;
  } catch (e) {
    console.log(`FAILED (${e.message})`);
    return null;
  }
}

/**
 * The catalog already on disk (before this run overwrites it), or null if
 * there isn't one yet or it can't be read/parsed. This IS "yesterday's
 * catalog" — actions/checkout already puts the last commit's satellites.json
 * here before this script runs, so no git history lookup is needed to diff
 * against it.
 *
 * A read/parse failure degrades to null rather than aborting the run:
 * unlike launch-reentry-log.json below (an accumulating history log this
 * script owns), satellites.json is a full snapshot re-derived from scratch
 * every run, so losing the ability to diff against a bad previous copy for
 * one day is a minor, self-healing gap, not a data-loss risk.
 */
export async function previousCatalog(path) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * launch-reentry-log.json accumulates event history the same way
 * capsule-status.json's `events` does, so — same reasoning as
 * update-capsule-status.mjs's loadExisting() — a genuinely missing file
 * (first run) is fine, but any other read/parse failure must abort rather
 * than silently return "no history" and let the write below wipe it.
 */
export async function loadExistingLog(path = LOG_OUT) {
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") return null;
    console.error(`  Could not read ${path} (${e.code || e.message}).`);
    console.error("  Refusing to proceed as if this were a first run — aborting.");
    process.exit(1);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error(`  ${path} exists but is not valid JSON (${e.message}).`);
    console.error("  Refusing to proceed as if this were a first run — aborting.");
    process.exit(1);
  }
}

export async function main() {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  console.log(`\n=== Orbital Traffic TLE refresh — ${stamp} UTC ===\n`);
  console.log("Fetching TLE data from CelesTrak:");

  const perGroup = [];
  for (const [group, cat] of GROUPS) {
    perGroup.push(await fetchGroup(group, cat));
    await sleep(POLITE_DELAY_MS);
  }

  // Per-group guard. Every group in GROUPS is populated upstream, so a failed
  // fetch (null) or an empty 200 ([]) means this run is missing a whole slice
  // of the catalog — not that the slice ceased to exist. Without this the run
  // continued on whatever succeeded: losing just the starlink group drops 57%
  // of the catalog while the total-empty check and the wide-ID canary both
  // still pass, and the truncated catalog gets committed with a green run.
  const bad = GROUPS.map(([group], i) => ({ group, recs: perGroup[i] })).filter(
    ({ recs }) => !recs || !recs.length
  );
  if (bad.length) {
    console.error(
      `\n✗ ${bad.length} of ${GROUPS.length} CelesTrak groups came back unusable:\n` +
        bad.map(({ group, recs }) => `    ${group}: ${recs === null ? "fetch failed" : "0 objects"}`).join("\n") +
        `\n  Every group in GROUPS is populated upstream, so this is an upstream` +
        `\n  or network problem, not a real catalog change. Refusing to write` +
        `\n  ${OUT} from a partial fetch — the last good catalog stays in place.` +
        `\n  Re-run the workflow once CelesTrak is healthy.`
    );
    process.exit(1);
  }

  const merged = mergeRecords(perGroup);
  if (!merged.length) {
    console.error("\n✗ No satellites fetched — aborting to avoid wiping good data.");
    process.exit(1);
  }
  console.log(`\n  Total after merge: ${merged.length} objects`);

  // Drift guard against this catalog's own recent size, so a truncated-but-
  // non-empty payload (a group returning a partial page, say) is caught too.
  // Read once, reused below for the launch/reentry diff too — it's the same
  // "yesterday's catalog" either way.
  const previousRecords = await previousCatalog(OUT);
  const previous = previousRecords?.length;
  if (previous) {
    const shrink = (previous - merged.length) / previous;
    console.log(
      `  Previous catalog: ${previous} objects (${shrink >= 0 ? "-" : "+"}${Math.abs(shrink * 100).toFixed(2)}%)`
    );
    if (shrink > MAX_CATALOG_SHRINK) {
      console.error(
        `\n✗ Catalog shrank ${(shrink * 100).toFixed(2)}% against the last good run` +
          ` (${previous} → ${merged.length}), past the ${(MAX_CATALOG_SHRINK * 100).toFixed(0)}% limit.` +
          `\n  Real churn is a fraction of a percent a day, so a drop this size means` +
          `\n  a partial or malformed upstream payload. Refusing to write ${OUT}.`
      );
      process.exit(1);
    }
  }

  // Canary for a silent regression to FORMAT=tle. That format's fixed-width
  // satnum field cannot express a 6-digit catalog number, and CelesTrak's
  // response is to omit those objects entirely — no gap, no malformed row, no
  // error. The fetch still "succeeds", just ~172 objects short (the docked
  // Soyuz, the SDA Praetorian payloads, ~100 Starlink). Checked before the
  // write so a bad run leaves the last good satellites.json in place.
  const wide = countWideCatalogNumbers(merged);
  console.log(`  Catalog numbers >= ${MIN_WIDE_NORAD_ID}: ${wide}`);
  if (!wide) {
    console.error(
      `\n✗ No objects with a NORAD ID >= ${MIN_WIDE_NORAD_ID} in the merged catalog.` +
        `\n  This is what a regression to CelesTrak's FORMAT=tle looks like — the` +
        `\n  fetch appears to succeed while silently dropping every 6-digit object.` +
        `\n  Check that all CelesTrak fetches still request FORMAT=csv` +
        `\n  (CELESTRAK_BASE in packages/catalog/src/groups.js).` +
        `\n  Refusing to write ${OUT}.`
    );
    process.exit(1);
  }

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(merged));
  console.log(`\n✓ Wrote ${OUT}`);

  // Launch/reentry event log for "Today in Space". Skipped on a genuine
  // first run or an unreadable previous catalog (previousRecords is null in
  // both cases) — diffing against [] would report all ~19,000 objects as
  // "launched today", which is wrong, not just noisy.
  if (previousRecords) {
    const newEvents = diffLaunchesReentries(previousRecords, merged, new Date().toISOString());
    console.log(
      `\n  Launch/reentry diff: ${newEvents.filter((e) => e.type === "launch").length} launch batch(es), ` +
        `${newEvents.filter((e) => e.type === "reentry").length} reentry/decay event(s)`
    );
    const existingLog = await loadExistingLog();
    const mergedEvents = [...(existingLog?.events || []), ...newEvents].slice(
      -MAX_LAUNCH_REENTRY_EVENTS
    );
    await writeFile(
      LOG_OUT,
      JSON.stringify({ updated: new Date().toISOString(), events: mergedEvents }, null, 2) + "\n"
    );
    console.log(`✓ Wrote ${LOG_OUT}`);
  } else {
    console.log("\n  No previous catalog to diff against — skipping launch/reentry log this run.");
  }
}

// Guarded so importing this module (e.g. from tests, to exercise
// countWideCatalogNumbers() in isolation) doesn't also kick off live
// CelesTrak fetches and a satellites.json write.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

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
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseGp,
  mergeRecords,
  GROUPS,
  CELESTRAK_BASE,
  FETCH_HEADERS,
  noradId,
} from "@orbital-traffic/catalog";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../apps/web/public/data/satellites.json"
);
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

async function fetchGroup(group, cat) {
  process.stdout.write(`  Fetching ${group}... `);
  try {
    const res = await fetch(CELESTRAK_BASE + group, { headers: FETCH_HEADERS });
    if (!res.ok) {
      console.log(`FAILED (HTTP ${res.status})`);
      return [];
    }
    const recs = parseGp(await res.text(), cat);
    console.log(`${recs.length} objects`);
    return recs;
  } catch (e) {
    console.log(`FAILED (${e.message})`);
    return [];
  }
}

async function main() {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  console.log(`\n=== Orbital Traffic TLE refresh — ${stamp} UTC ===\n`);
  console.log("Fetching TLE data from CelesTrak:");

  const perGroup = [];
  for (const [group, cat] of GROUPS) {
    perGroup.push(await fetchGroup(group, cat));
    await sleep(POLITE_DELAY_MS);
  }
  const merged = mergeRecords(perGroup);
  if (!merged.length) {
    console.error("\n✗ No satellites fetched — aborting to avoid wiping good data.");
    process.exit(1);
  }
  console.log(`\n  Total after merge: ${merged.length} objects`);

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
}

// Guarded so importing this module (e.g. from tests, to exercise
// countWideCatalogNumbers() in isolation) doesn't also kick off live
// CelesTrak fetches and a satellites.json write.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

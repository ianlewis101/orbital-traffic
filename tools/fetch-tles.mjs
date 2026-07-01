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
  parseTle,
  mergeRecords,
  GROUPS,
  CELESTRAK_BASE,
  FETCH_HEADERS,
} from "@orbital-traffic/catalog";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../apps/web/public/data/satellites.json");
const POLITE_DELAY_MS = 1000; // between CelesTrak requests

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchGroup(group, cat) {
  process.stdout.write(`  Fetching ${group}... `);
  try {
    const res = await fetch(CELESTRAK_BASE + group, { headers: FETCH_HEADERS });
    if (!res.ok) {
      console.log(`FAILED (HTTP ${res.status})`);
      return [];
    }
    const recs = parseTle(await res.text(), cat);
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

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(merged));
  console.log(`\n✓ Wrote ${OUT}`);
}

main();

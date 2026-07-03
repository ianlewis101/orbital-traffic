#!/usr/bin/env node
/**
 * update-capsule-status.mjs
 * Fetches CelesTrak's "stations" group directly, derives each currently-
 * tracked crewed capsule's phase (docked/free-flying/landed) relative to
 * its associated station, diffs against the previous run to detect
 * transitions, and writes capsule-status.json in the repo root (served to
 * clients via the Worker's /capsules endpoint). Run locally or via the
 * scheduled update-capsule-status workflow.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseTle,
  CELESTRAK_BASE,
  FETCH_HEADERS,
  buildCapsuleSnapshot,
  advanceCapsuleLog,
  MAX_EVENTS,
} from "@orbital-traffic/catalog";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../capsule-status.json");
const STATIONS_URL = CELESTRAK_BASE + "stations";

async function loadExisting() {
  try {
    return JSON.parse(await readFile(OUT, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Only the "stations" group is needed — every station anchor and every
 * crewed vehicle appears there by construction of GROUPS, and parseTle()
 * already runs each record through the full categorize() pipeline, so
 * cargo/debris are already correctly tagged even though everything came
 * from one raw feed.
 */
async function fetchStationsGroup() {
  const res = await fetch(STATIONS_URL, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`CelesTrak HTTP ${res.status}`);
  const recs = parseTle(await res.text(), "stations");
  if (!recs.length) throw new Error("CelesTrak returned no station-group records");
  return recs;
}

async function main() {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  console.log(`\n=== Capsule status update — ${stamp} UTC ===\n`);

  const existing = await loadExisting();
  const isFirstRun = !existing || !existing.capsules;
  const previousById = existing?.capsules || {};
  const nowIso = new Date().toISOString();

  console.log("Fetching CelesTrak stations group:");
  let records;
  try {
    records = await fetchStationsGroup();
    console.log(`  ${records.length} records`);
  } catch (e) {
    console.error(`  FAILED (${e.message})`);
    console.error("  Leaving capsule-status.json unchanged.");
    process.exit(1);
  }

  const snapshot = buildCapsuleSnapshot(records, new Date(nowIso));
  console.log(`  Tracking ${snapshot.length} crewed capsule(s):`);
  for (const c of snapshot) {
    console.log(`   - ${c.name} (${c.id}): ${c.phase}${c.stationKey ? " @ " + c.stationKey : ""}`);
  }

  const { capsules, events } = advanceCapsuleLog(previousById, snapshot, nowIso, { isFirstRun });
  if (events.length) {
    console.log(`\n  ${events.length} transition(s):`);
    for (const e of events) console.log(`   - ${e.name}: ${e.event}`);
  } else {
    console.log("\n  No phase transitions since the last run.");
  }

  const mergedEvents = [...(existing?.events || []), ...events].slice(-MAX_EVENTS);
  const result = { updated: nowIso, capsules, events: mergedEvents };
  await writeFile(OUT, JSON.stringify(result, null, 2) + "\n");
  console.log(`\n✓ Wrote ${OUT}`);
}

main();

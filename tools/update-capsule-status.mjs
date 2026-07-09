#!/usr/bin/env node
/**
 * update-capsule-status.mjs
 * Derives each currently-tracked crewed capsule's phase (docked/free-
 * flying/landed) relative to its associated station, diffs against the
 * previous run to detect transitions, and writes capsule-status.json in
 * the repo root (served to clients via the Worker's /capsules endpoint).
 * Run locally or via the scheduled update-capsule-status workflow.
 *
 * Sources, in order:
 *   1. CelesTrak "stations" group — station hubs + docked/visiting vehicles.
 *   2. CelesTrak "last-30-days" group — fresh launches and free-flying
 *      missions that never enter the stations group.
 *   3. Per-CATNR re-verification of any previously-tracked, still-active
 *      capsule missing from both feeds — a capsule that fell out of a
 *      group but still has a fresh elset keeps being tracked (long free
 *      flight); one whose elset is gone or frozen is declared landed by
 *      buildCapsuleSnapshot's staleness cutoff.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseTle,
  mergeRecords,
  noradId,
  CELESTRAK_BASE,
  FETCH_HEADERS,
  buildCapsuleSnapshot,
  advanceCapsuleLog,
  MAX_EVENTS,
} from "@orbital-traffic/catalog";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../capsule-status.json");
const CATNR_BASE = "https://celestrak.org/NORAD/elements/gp.php?FORMAT=tle&CATNR=";
const ISS_NORAD_ID = "25544";
const POLITE_DELAY_MS = 1000; // between CelesTrak requests

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadExisting() {
  try {
    return JSON.parse(await readFile(OUT, "utf8"));
  } catch {
    return null;
  }
}

async function fetchTleText(url) {
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`CelesTrak HTTP ${res.status}`);
  return res.text();
}

/**
 * The stations group is load-bearing (hubs + docked vehicles) and fails
 * the whole run; parseTle() runs each record through the full categorize()
 * pipeline, so cargo/debris are correctly tagged and crew vehicles from
 * the generic feeds are promoted to "stations" by name.
 */
async function fetchStationsGroup() {
  const recs = parseTle(await fetchTleText(CELESTRAK_BASE + "stations"), "stations");
  if (!recs.length) throw new Error("CelesTrak returned no station-group records");
  return recs;
}

async function fetchLast30DaysGroup() {
  try {
    return parseTle(await fetchTleText(CELESTRAK_BASE + "last-30-days"), "other");
  } catch (e) {
    // Soft failure: its absence can't mass-land anything — previously
    // tracked capsules missing from the feeds get CATNR-re-verified below.
    console.warn(`  last-30-days FAILED (${e.message}) — continuing without it`);
    return [];
  }
}

/** One-object fetch for a previously-tracked capsule missing from the group feeds. */
async function fetchByCatnr(id) {
  try {
    return parseTle(await fetchTleText(CATNR_BASE + id), "other");
  } catch (e) {
    console.warn(`   - CATNR ${id} FAILED (${e.message})`);
    return [];
  }
}

async function main() {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  console.log(`\n=== Capsule status update — ${stamp} UTC ===\n`);

  const existing = await loadExisting();
  const isFirstRun = !existing || !existing.capsules;
  const previousById = existing?.capsules || {};
  const nowIso = new Date().toISOString();

  console.log("Fetching CelesTrak feeds:");
  let stations;
  try {
    stations = await fetchStationsGroup();
    console.log(`  stations: ${stations.length} records`);
  } catch (e) {
    console.error(`  stations FAILED (${e.message})`);
    console.error("  Leaving capsule-status.json unchanged.");
    process.exit(1);
  }

  // A stations feed without the ISS is a broken feed, and processing it
  // would spuriously mass-land every ISS-docked capsule. Abort untouched.
  if (!stations.some((r) => noradId(r.l1) === ISS_NORAD_ID)) {
    console.error("  stations feed is missing the ISS (25544) — feed looks broken.");
    console.error("  Leaving capsule-status.json unchanged.");
    process.exit(1);
  }

  await sleep(POLITE_DELAY_MS);
  const last30 = await fetchLast30DaysGroup();
  console.log(`  last-30-days: ${last30.length} records`);

  let records = mergeRecords([stations, last30]);

  // Re-verify previously-tracked, still-active capsules that vanished from
  // both feeds before letting them land: a fresh per-object elset means a
  // long free flight, not a re-entry. Stale/absent elsets fall through to
  // buildCapsuleSnapshot's staleness cutoff and land.
  const presentIds = new Set(records.map((r) => noradId(r.l1)));
  const missingActive = Object.entries(previousById)
    .filter(([id, c]) => c.phase !== "landed" && !presentIds.has(id))
    .map(([id]) => id);
  if (missingActive.length) {
    console.log(`  Re-verifying ${missingActive.length} tracked capsule(s) missing from feeds:`);
    for (const id of missingActive) {
      await sleep(POLITE_DELAY_MS);
      const recs = await fetchByCatnr(id);
      if (recs.length) {
        console.log(`   - ${id}: elset still published (${recs[0].name})`);
        records = mergeRecords([records, recs]);
      } else {
        console.log(`   - ${id}: no elset — will be marked landed`);
      }
    }
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

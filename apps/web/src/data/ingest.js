import * as satellite from "satellite.js";
import { categorize, satrecAgeDays } from "@orbital-traffic/catalog";
import { CATS } from "../config.js";
import { state } from "../state.js";

/**
 * An object absent from a live feed is only pruned once its TLE epoch is
 * also older than this (wall-clock days). The epoch guard makes pruning
 * safe against partial feeds: a group that failed to fetch leaves its
 * objects with fresh epochs, so they survive; a genuinely de-orbited
 * object stops getting new elsets and ages out.
 */
const PRUNE_EPOCH_DAYS = 10;

/**
 * How many records to process per synchronous batch before yielding a frame
 * back to the browser. Keeps the boot ingest (~18,500 records) from freezing
 * the splash screen for a solid 1-2 seconds on slower mobile devices.
 */
const INGEST_BATCH = 1000;

function recomputeCats() {
  Object.keys(CATS).forEach((c) => (state.cats[c] = 0));
  state.sats.forEach((s) => state.cats[s.cat]++);
}

/**
 * Ingest [{name, l1, l2, cat}] records into app state. Records are
 * re-classified through the shared catalog pipeline so every ingestion
 * path (bundled data, live Worker, CelesTrak fallback) agrees on
 * categories, even if the source data predates a classification fix.
 *
 * With { prune: true } (live syncs only — never the bundled boot data),
 * objects absent from `records` AND with a stale TLE epoch are removed —
 * de-orbited objects must not keep rendering as ghosts. Returns the
 * removed objects so the caller can clear selection state; callers must
 * rebuild clouds afterwards either way.
 */
export async function ingest(records, { prune = false } = {}) {
  const seen = prune ? new Set() : null;
  // Process in batches, yielding a frame to the browser between them, so a
  // large ingest never blocks the main thread for more than ~one frame at a
  // time. The per-record work below is byte-for-byte the same as before —
  // only *when* it runs changes, not what it computes.
  for (let start = 0; start < records.length; start += INGEST_BATCH) {
    const end = Math.min(start + INGEST_BATCH, records.length);
    for (let j = start; j < end; j++) {
      const r = records[j];
      let rec;
      try {
        rec = satellite.twoline2satrec(r.l1, r.l2);
      } catch {
        continue;
      }
      if (!rec || rec.error) continue;
      const id = String(rec.satnum);
      const cat = categorize(id, r.name, r.cat);
      const ex = state.byId.get(id);
      if (ex) {
        ex.rec = rec;
        ex.name = r.name || ex.name;
        ex.cat = cat;
      } else {
        const s = { id, name: (r.name || "OBJ " + id).trim(), cat, rec, alive: true };
        state.sats.push(s);
        state.byId.set(id, s);
      }
      if (seen) seen.add(id);
    }
    // No point yielding after the final batch — let prune/recompute run now.
    if (end < records.length) await new Promise(requestAnimationFrame);
  }

  const removed = [];
  if (prune) {
    // Real now, not sim time — feed staleness is a wall-clock property and
    // must not change when the user runs the time machine.
    const now = new Date();
    for (let i = state.sats.length - 1; i >= 0; i--) {
      const s = state.sats[i];
      if (seen.has(s.id)) continue;
      if ((satrecAgeDays(s.rec, now) ?? Infinity) <= PRUNE_EPOCH_DAYS) continue;
      state.sats.splice(i, 1);
      state.byId.delete(s.id);
      removed.push(s);
    }
  }

  recomputeCats();
  return removed;
}

/**
 * Remove specific objects by id regardless of epoch age — for callers with
 * an authoritative "this de-orbited" signal (the /capsules feed). Returns
 * the removed objects; callers must rebuild clouds afterwards.
 */
export function removeSats(ids) {
  const removed = [];
  for (const id of ids) {
    const s = state.byId.get(id);
    if (!s) continue;
    state.byId.delete(id);
    state.sats.splice(state.sats.indexOf(s), 1);
    removed.push(s);
  }
  if (removed.length) recomputeCats();
  return removed;
}

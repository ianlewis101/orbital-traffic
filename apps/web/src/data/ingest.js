import * as satellite from "satellite.js";
import { categorize } from "@orbital-traffic/catalog";
import { CATS } from "../config.js";
import { state } from "../state.js";

/**
 * Ingest [{name, l1, l2, cat}] records into app state. Records are
 * re-classified through the shared catalog pipeline so every ingestion
 * path (bundled data, live Worker, CelesTrak fallback) agrees on
 * categories, even if the source data predates a classification fix.
 */
export function ingest(records) {
  for (const r of records) {
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
  }
  // recompute category counts
  Object.keys(CATS).forEach((c) => (state.cats[c] = 0));
  state.sats.forEach((s) => state.cats[s.cat]++);
}

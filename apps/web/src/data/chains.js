import { detectChains } from "@orbital-traffic/catalog";
import { state } from "../state.js";

/**
 * Re-derive the launch chains ("Starlink trains") visible in the catalog
 * currently loaded, into state.chains.
 *
 * Run once at boot and again after every live sync, never per frame: a chain
 * is a property of the elements, which only change when new ones arrive, and
 * the sweep costs one SGP4 call per member of every recent, low, batch-sized
 * launch group (~500 calls, ~20-60ms against the real 19,000-object catalog).
 * Deliberately passed real wall-clock time, not state.simNow — running the
 * time machine must not invent or erase chains, only move the ones that are
 * really up there (same reasoning as ingest()'s prune epoch guard).
 *
 * Best-effort: a throw here must never take a boot or a catalog sync down
 * with it, so it degrades to "no chains" and leaves everything else alone.
 */
export function refreshChains() {
  try {
    state.chains = detectChains(state.sats, new Date());
  } catch {
    state.chains = [];
  }
  return state.chains;
}

/** The live objects behind a chain's ids, in flight order (tail first). */
export function chainSats(chain) {
  if (!chain) return [];
  const out = [];
  for (const id of chain.ids) {
    const s = state.byId.get(id);
    if (s) out.push(s);
  }
  return out;
}

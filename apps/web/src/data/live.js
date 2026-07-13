import { parseTle, mergeRecords, GROUPS, CELESTRAK_BASE } from "@orbital-traffic/catalog";
import { WORKER_BASE } from "../config.js";
import { state, $ } from "../state.js";
import { ingest, removeSats } from "./ingest.js";
import { buildClouds } from "../scene/clouds.js";
import { rebuildLegend } from "../ui/legend.js";
import { renderToday } from "../ui/today.js";
import { updateCount, flash, toast } from "../ui/status.js";
import { select } from "../ui/info.js";

/**
 * Refresh the catalog from the Worker proxy; fall back to fetching
 * CelesTrak groups directly (may be rate-limited) if the Worker is down.
 */
export async function fetchLive() {
  const totEl = $("#legend-tot");
  totEl.classList.add("loading");
  totEl.textContent = "…";
  // Capsule phase data rides along with every live sync so de-orbited
  // capsules leave the globe and missing active ones get injected.
  const capsulesPromise = fetchCapsuleStatus();
  try {
    const res = await fetch(WORKER_BASE + "/tle", { cache: "no-store" });
    if (!res.ok) throw new Error("worker " + res.status);
    const recs = await res.json();
    if (!recs.length) throw new Error("empty");
    await applyLive(recs, await capsulesPromise);
  } catch {
    const results = await Promise.allSettled(
      GROUPS.map(async ([grp, cat]) => {
        const r = await fetch(CELESTRAK_BASE + grp, { cache: "no-store" });
        if (!r.ok) return [];
        return parseTle(await r.text(), cat);
      })
    );
    // Merge in GROUPS order (not fetch-completion order) so a satellite
    // already claimed by a specific group is never overwritten by a later,
    // more generic one — results is in GROUPS order since Promise.allSettled
    // preserves input order. Mirrors the Worker's buildTLERecords() merge.
    const recs = mergeRecords(results.map((r) => (r.status === "fulfilled" ? r.value : [])));
    if (recs.length) {
      await applyLive(recs, await capsulesPromise);
    } else {
      toast("Live fetch unavailable — showing cached elements");
      updateCount();
    }
  }
  totEl.classList.remove("loading");
}

async function fetchCapsuleStatus() {
  try {
    const r = await fetch(WORKER_BASE + "/capsules", { cache: "no-store" });
    if (!r.ok) return null;
    const data = await r.json();
    return data && data.capsules ? data.capsules : null;
  } catch {
    return null; // reconciliation is best-effort; the epoch prune still runs
  }
}

/**
 * capsule-status.json is the authority on crewed capsules and cargo
 * vehicles alike. Two fixes per sync: an active vehicle the group feeds
 * missed is injected from the l1/l2 it carries (so every one on orbit
 * renders), and a landed one is dropped immediately — no waiting out the
 * generic epoch prune, and never left to render under "other" either.
 */
async function reconcileCapsules(capsules) {
  if (!capsules) return [];
  const inject = [];
  const landedIds = [];
  for (const [id, c] of Object.entries(capsules)) {
    if (c.phase === "landed") {
      if (state.byId.has(id)) landedIds.push(id);
    } else if (c.l1 && c.l2 && !state.byId.has(id)) {
      inject.push({ name: c.name, l1: c.l1, l2: c.l2, cat: "stations" });
    }
  }
  if (inject.length) await ingest(inject);
  return removeSats(landedIds);
}

async function applyLive(recs, capsules) {
  const removed = await ingest(recs, { prune: true });
  removed.push(...(await reconcileCapsules(capsules)));
  if (state.selected && removed.includes(state.selected)) select(null);
  buildClouds();
  state.source = "live";
  state.srcTime = new Date();
  rebuildLegend();
  updateCount();
  renderToday();
  flash($("#count-n"));
}

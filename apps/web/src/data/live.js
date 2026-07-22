import { parseTle, mergeRecords, GROUPS, CELESTRAK_BASE } from "@orbital-traffic/catalog";
import { WORKER_BASE } from "../config.js";
import { state, $ } from "../state.js";
import { ingest, removeSats } from "./ingest.js";
import { buildClouds } from "../scene/clouds.js";
import { rebuildLegend } from "../ui/legend.js";
import { renderToday } from "../ui/today.js";
import { updateCount, flash, toast } from "../ui/status.js";
import { select } from "../ui/info.js";
import { shouldSyncOnVisible } from "../util/freshness.js";

// Periodic-refresh policy. Kept coarse on purpose: CelesTrak regenerates
// its group data only every ~2 hours, and fetchLive()'s fallback path hits
// CelesTrak directly from the browser, so a tighter interval risks their
// per-IP politeness limits for no freshness gain. Jitter spreads many tabs
// so they don't all sync on the same edge.
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const REFRESH_JITTER_MS = 2 * 60 * 1000;
// On regaining visibility, sync right away if the last good sync is older
// than this (or never happened) — a tab left open all evening catches up the
// moment the user looks back at it, without waiting out the interval.
const VISIBILITY_STALE_MS = 20 * 60 * 1000;

// A single in-flight sync, shared by every caller. ingest() yields to the
// browser between batches, so two overlapping syncs would interleave their
// catalog writes mid-ingest; the periodic timer, the visibility handler, and
// the boot kick can all fire close together, so they must coalesce rather
// than race. While a sync runs, fetchLive() hands back the same promise.
let inFlight = null;

/**
 * Refresh the catalog from the Worker proxy; fall back to fetching
 * CelesTrak groups directly (may be rate-limited) if the Worker is down.
 * Returns the promise for the current sync — concurrent calls share it.
 */
export function fetchLive() {
  if (inFlight) return inFlight;
  inFlight = runLiveSync().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/**
 * Start the ongoing refresh loop: a jittered ~15-minute interval that only
 * actually syncs while the tab is visible (a backgrounded tab shouldn't keep
 * hitting the network), plus an immediate catch-up sync when the tab becomes
 * visible again if the data on screen has gone stale. The in-flight guard in
 * fetchLive() makes overlapping triggers here harmless.
 */
export function initLiveRefresh() {
  const scheduleNext = () => {
    const delay = REFRESH_INTERVAL_MS + Math.random() * REFRESH_JITTER_MS;
    setTimeout(() => {
      if (document.visibilityState === "visible") fetchLive();
      scheduleNext();
    }, delay);
  };
  scheduleNext();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (shouldSyncOnVisible({ srcTime: state.srcTime, staleMs: VISIBILITY_STALE_MS })) {
      fetchLive();
    }
  });
}

async function runLiveSync() {
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
      // Both paths failed. Leave an honest state behind so the freshness
      // line reads "cached elements · retrying" rather than a permanent
      // "syncing…" — the periodic policy will retry on its own.
      state.syncFailed = true;
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
    // Stored regardless of what's returned below — crew.js's plausibility
    // check and the (separate, not-yet-built) freshness indicator both read
    // these directly off state rather than threading them through
    // reconcileCapsules()'s own input/return shape.
    state.capsulesData = data.capsules;
    state.capsulesTime = data.updated ? new Date(data.updated) : null;
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
      inject.push({ name: c.name, l1: c.l1, l2: c.l2, cat: "capsules" });
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
  state.syncFailed = false;
  rebuildLegend();
  updateCount();
  renderToday();
  // Flash the visible total, not the old hidden #count-n mirror, so a live
  // count change is actually seen.
  flash($("#legend-tot"));
}

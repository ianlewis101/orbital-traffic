import {
  parseGp,
  mergeRecords,
  GROUPS,
  CELESTRAK_BASE,
  mapWithConcurrency,
} from "@orbital-traffic/catalog";
import { WORKER_BASE } from "../config.js";
import { state, $ } from "../state.js";
import { ingest, removeSats } from "./ingest.js";
import { buildClouds } from "../scene/clouds.js";
import { rebuildLegend } from "../ui/legend.js";
import { renderToday } from "../ui/today.js";
import { refreshEvents } from "../ui/today-in-space.js";
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

// A stalled connection to the Worker or to CelesTrak otherwise hangs fetch()
// indefinitely (no browser-default timeout) — the primary /tle fetch would
// sit unresolved instead of falling back. Bounding every request lets a
// stuck one fail fast, mirroring the Worker's own per-group timeout
// (worker/src/index.js's fetchGroup()).
const FETCH_TIMEOUT_MS = 12000;

// The Worker's own /tle route legitimately takes far longer than 12s on a
// cache miss: buildTLERecords() fetches all 13 CelesTrak groups at
// GROUP_FETCH_CONCURRENCY=3 (worker/src/index.js), which serializes into
// ~5 batches — measured 23-27s end to end against the live Worker after the
// 2026-09-01 concurrency fix (d6562e4) traded speed for correctness there.
// Timing this request out at the same 12s used for individual CelesTrak
// group requests below was aborting almost every cache-miss sync
// prematurely (TLE_TTL is 20 minutes, and with a single regular user the
// cache routinely goes cold between sessions) and dropping into the
// CelesTrak-direct fallback — strictly worse, since that fallback repeats
// the same concurrency-bounded 13-group fetch directly from the client's
// (often mobile) connection instead of Cloudflare's network, which is what
// produced the "Orbit Classes total never resolves" reports. Give the
// Worker request enough headroom to actually finish its cold path rather
// than raced into that slower fallback.
const WORKER_FETCH_TIMEOUT_MS = 35000;

// CelesTrak enforces a low per-IP concurrent-connection ceiling — measured
// directly against the real endpoint, firing all 13 GROUPS requests at once
// left 9 of 13 stalled past a 15s timeout, even though each resolves in 1-2s
// issued alone. This fallback used to fire all 13 simultaneously
// (Promise.allSettled(GROUPS.map(...))), which is the real reason a category
// could vanish or undercount on a real (especially mobile) connection, not
// per-request slowness. Same fix and same reasoning as the Worker's
// buildTLERecords() — see GROUP_FETCH_CONCURRENCY there.
const GROUP_FETCH_CONCURRENCY = 3;

function fetchWithTimeout(url, opts, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
}

/** One CelesTrak group for the fallback merge — mirrors the Worker's fetchGroup(). */
async function fetchGroupRecords([grp, cat]) {
  try {
    const r = await fetchWithTimeout(CELESTRAK_BASE + grp, { cache: "no-store" });
    if (!r.ok) return { recs: [], ok: false };
    return { recs: parseGp(await r.text(), cat), ok: true };
  } catch {
    return { recs: [], ok: false };
  }
}

// A "successful" response that's drastically smaller than the catalog
// already on screen is worse than an honest failure — applying it would
// replace a complete globe with a visibly broken one. Half of whatever's
// currently loaded is a generous floor: a real CelesTrak/Worker hiccup drops
// at most a handful of the 13 fetched groups, nowhere close to half the
// catalog, so this only ever trips on a response that's actually broken —
// and it only ever blocks a regression, never a correction (a genuinely
// small current count, e.g. from a prior bad sync, still accepts a full
// recovery fetch because that raises the count, not lowers it).
export function isPlausibleCatalog(recs) {
  return recs.length > 0 && recs.length >= state.sats.length / 2;
}

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
  // "Today in Space" rides along the same periodic + on-visibility cadence
  // rather than its own scheduler — /events changes on an hourly/daily
  // cadence at most, so this loop's ~15-minute interval is already frequent
  // enough. Deliberately not awaited: refreshEvents() is self-contained and
  // already swallows its own failures (same shape as refreshTodayLiveFacts()
  // at boot), so it must never block or fail the satellite catalog sync.
  refreshEvents();
  try {
    const res = await fetchWithTimeout(
      WORKER_BASE + "/tle",
      { cache: "no-store" },
      WORKER_FETCH_TIMEOUT_MS
    );
    if (!res.ok) throw new Error("worker " + res.status);
    const recs = await res.json();
    if (!isPlausibleCatalog(recs)) throw new Error("implausible catalog size: " + recs.length);
    await applyLive(recs, await capsulesPromise);
  } catch {
    const settled = await mapWithConcurrency(GROUPS, GROUP_FETCH_CONCURRENCY, fetchGroupRecords);
    for (let i = 0; i < GROUPS.length; i++) {
      if (!settled[i].ok) settled[i] = await fetchGroupRecords(GROUPS[i]);
    }
    // Merge in GROUPS order (not fetch-completion order) so a satellite
    // already claimed by a specific group is never overwritten by a later,
    // more generic one — settled is in GROUPS order since mapWithConcurrency
    // preserves input order. Mirrors the Worker's buildTLERecords() merge.
    const recs = mergeRecords(settled.map((s) => s.recs));
    if (isPlausibleCatalog(recs)) {
      await applyLive(recs, await capsulesPromise);
    } else {
      // Both paths failed, or the fallback merge came back implausibly small
      // (see isPlausibleCatalog) — either way, never apply it. Leave an
      // honest state behind so the freshness line reads "cached elements ·
      // retrying" rather than a permanent "syncing…" — the periodic policy
      // will retry on its own.
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

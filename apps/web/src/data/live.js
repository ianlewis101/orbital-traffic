import { parseTle, GROUPS, CELESTRAK_BASE } from "@orbital-traffic/catalog";
import { WORKER_BASE } from "../config.js";
import { state, $ } from "../state.js";
import { ingest } from "./ingest.js";
import { buildClouds } from "../scene/clouds.js";
import { rebuildLegend } from "../ui/legend.js";
import { renderToday } from "../ui/today.js";
import { updateCount, flash, toast } from "../ui/status.js";

/**
 * Refresh the catalog from the Worker proxy; fall back to fetching
 * CelesTrak groups directly (may be rate-limited) if the Worker is down.
 */
export async function fetchLive() {
  const totEl = $("#legend-tot");
  totEl.classList.add("loading");
  totEl.textContent = "…";
  try {
    const res = await fetch(WORKER_BASE + "/tle", { cache: "no-store" });
    if (!res.ok) throw new Error("worker " + res.status);
    const recs = await res.json();
    if (!recs.length) throw new Error("empty");
    applyLive(recs);
  } catch {
    const results = await Promise.allSettled(
      GROUPS.map(async ([grp, cat]) => {
        const r = await fetch(CELESTRAK_BASE + grp, { cache: "no-store" });
        if (!r.ok) return [];
        return parseTle(await r.text(), cat);
      })
    );
    const recs = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    if (recs.length) {
      applyLive(recs);
    } else {
      toast("Live fetch unavailable — showing cached elements");
      updateCount();
    }
  }
  totEl.classList.remove("loading");
}

function applyLive(recs) {
  ingest(recs);
  buildClouds();
  state.source = "live";
  state.srcTime = new Date();
  rebuildLegend();
  updateCount();
  renderToday();
  flash($("#count-n"));
}

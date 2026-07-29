/**
 * "What's Overhead" — the FAB and its results panel.
 *
 * One-shot: each tap takes a fresh location fix, sweeps the whole in-memory
 * catalog once (astro/overhead.js), and renders the curated result — objects
 * above MIN_OVERHEAD_ELEVATION_DEG, ranked category-first then elevation, not
 * a raw "anything above the mathematical horizon" list. Nothing is cached
 * between taps and no coordinates are stored.
 *
 * Deliberately reads state.sats rather than state.sats.concat(neoSats) the
 * way search.js does — NEOs are excluded from this feature entirely, and
 * since scene/neos.js only ever registers them in state.byId, sweeping
 * state.sats excludes them by construction. "other" and "debris" are
 * excluded too, categorically — astro/overhead.js's OVERHEAD_EXCLUDED_CATS —
 * so they never reach `results` at all, not even ranked low.
 */
import { CATS, catColorHex } from "../config.js";
import { state, $ } from "../state.js";
import { select } from "./info.js";
import { fmtDistance } from "../util/units.js";
import { computeOverhead, compassPoint, MIN_OVERHEAD_ELEVATION_DEG } from "../astro/overhead.js";
import { requestLocation, locationDenied, LOCATION_ERRORS } from "../data/location.js";
import { openSettings } from "./settings.js";
import { closeOtherSheets } from "./sheets.js";

/**
 * Rows shown by default. `results` already carries the FULL set of objects
 * above MIN_OVERHEAD_ELEVATION_DEG, two-tier ranked by astro/overhead.js
 * (curated categories first, then elevation) — nothing is discarded here,
 * only display-truncated. "Show all" reveals the rest of that same
 * precomputed list, in the same order; it never re-sweeps or re-sorts.
 */
const PAGE = 25;

let sweepAbort = null;
let results = []; // full sorted sweep
let shown = PAGE;
let hiddenCats = new Set(); // panel-local filter — never touches state.hidden

function panel() {
  return $("#overhead");
}

function isOpen() {
  return panel()?.classList.contains("show");
}

function setFab(expanded) {
  const fab = $("#overhead-fab");
  if (fab) fab.setAttribute("aria-expanded", expanded ? "true" : "false");
}

export function closeOverhead() {
  sweepAbort?.abort();
  sweepAbort = null;
  panel()?.classList.remove("show");
  setFab(false);
}

/** Replace the status line. `tone` styles it as an error when "bad". */
function setStatus(text, tone) {
  const el = $("#overhead-status");
  if (!el) return;
  el.textContent = text;
  el.className = tone === "bad" ? "oh-status bad" : "oh-status";
  el.style.display = text ? "block" : "none";
}

function setCount(text) {
  const el = $("#overhead-count");
  if (el) el.textContent = text;
}

/** A "go to Settings" affordance, shown only when permission was refused. */
function showDeniedState() {
  setStatus("Location access needed — enable it in Settings.", "bad");
  const foot = $("#overhead-foot");
  if (!foot) return;
  foot.innerHTML = "";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "oh-more";
  btn.textContent = "Open Settings";
  btn.onclick = () => {
    closeOverhead();
    openSettings();
  };
  foot.appendChild(btn);
}

function clearList() {
  const list = $("#overhead-list");
  const foot = $("#overhead-foot");
  if (list) list.innerHTML = "";
  if (foot) foot.innerHTML = "";
  const filters = $("#overhead-filters");
  if (filters) filters.innerHTML = "";
}

/** Categories present in the current sweep, in the canonical CATS order. */
function presentCats() {
  const seen = new Set(results.map((r) => r.cat));
  return Object.keys(CATS).filter((c) => seen.has(c));
}

function visibleResults() {
  return hiddenCats.size ? results.filter((r) => !hiddenCats.has(r.cat)) : results;
}

function renderFilters() {
  const box = $("#overhead-filters");
  if (!box) return;
  box.innerHTML = "";
  const cats = presentCats();
  if (cats.length < 2) return; // nothing meaningful to filter
  for (const c of cats) {
    const n = results.reduce((acc, r) => acc + (r.cat === c ? 1 : 0), 0);
    const hex = catColorHex(c);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "oh-chip" + (hiddenCats.has(c) ? " off" : "");
    b.setAttribute("aria-pressed", hiddenCats.has(c) ? "false" : "true");
    const dot = document.createElement("span");
    dot.className = "d";
    dot.style.cssText = `background:${hex};color:${hex}`;
    const label = document.createElement("span");
    label.textContent = `${CATS[c].label} ${n.toLocaleString()}`;
    b.append(dot, label);
    b.onclick = () => {
      if (hiddenCats.has(c)) hiddenCats.delete(c);
      else hiddenCats.add(c);
      shown = PAGE;
      renderFilters();
      renderList();
    };
    box.appendChild(b);
  }
}

function renderList() {
  const list = $("#overhead-list");
  const foot = $("#overhead-foot");
  if (!list || !foot) return;
  list.innerHTML = "";
  foot.innerHTML = "";

  const rows = visibleResults();
  setCount(rows.length.toLocaleString());

  if (!rows.length) {
    setStatus(
      results.length
        ? "Nothing matches the current filters."
        : `Nothing is above ${MIN_OVERHEAD_ELEVATION_DEG}° elevation right now.`
    );
    return;
  }
  setStatus("");

  for (const r of rows.slice(0, shown)) {
    const hex = catColorHex(r.cat);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ohrow";

    const dot = document.createElement("span");
    dot.className = "d";
    dot.style.cssText = `background:${hex};color:${hex}`;

    const nm = document.createElement("span");
    nm.className = "nm";
    nm.textContent = r.name;

    const el = document.createElement("span");
    el.className = "el";
    el.textContent = `${r.elevationDeg.toFixed(0)}° ${compassPoint(r.azimuthDeg)}`;
    el.title = `Elevation ${r.elevationDeg.toFixed(1)}°, bearing ${r.azimuthDeg.toFixed(0)}°, range ${fmtDistance(r.rangeKm)}`;

    b.append(dot, nm, el);
    b.onclick = () => {
      // Re-resolve through byId rather than holding the record: a live sync
      // can prune objects out from under a list that's been open a while.
      const s = state.byId.get(r.id);
      if (!s) return;
      closeOverhead();
      select(s);
    };
    list.appendChild(b);
  }

  if (rows.length > shown) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "oh-more";
    const remaining = rows.length - shown;
    more.textContent = `Show all (${remaining.toLocaleString()} more)`;
    more.onclick = () => {
      // Reveal the rest of the already-ranked list in one step — no
      // re-sweep, no re-sort, just a display-length change.
      shown = rows.length;
      renderList();
    };
    foot.appendChild(more);
  }
}

async function run() {
  sweepAbort?.abort();
  const ctrl = new AbortController();
  sweepAbort = ctrl;

  results = [];
  shown = PAGE;
  hiddenCats = new Set();
  clearList();
  setCount("");

  if (locationDenied()) {
    showDeniedState();
    return;
  }

  setStatus("Getting your location…");
  let here;
  try {
    here = await requestLocation();
  } catch (e) {
    if (ctrl.signal.aborted) return;
    if (e?.reason === LOCATION_ERRORS.DENIED) showDeniedState();
    else if (e?.reason === LOCATION_ERRORS.UNSUPPORTED)
      setStatus("This device can't provide a location.", "bad");
    else setStatus("Couldn't get your location — try again.", "bad");
    return;
  }
  if (ctrl.signal.aborted) return;

  const total = state.sats.length;
  setStatus(`Scanning ${total.toLocaleString()} objects…`);
  try {
    const out = await computeOverhead(state.sats, here, new Date(), {
      minElevationDeg: MIN_OVERHEAD_ELEVATION_DEG,
      signal: ctrl.signal,
      onProgress: (done) => {
        if (!ctrl.signal.aborted) {
          setStatus(`Scanning ${done.toLocaleString()} of ${total.toLocaleString()}…`);
        }
      },
    });
    if (ctrl.signal.aborted) return;
    results = out.results;
    renderFilters();
    renderList();
  } catch (e) {
    if (e?.name === "AbortError") return;
    setStatus("Couldn't work out what's overhead — try again.", "bad");
  }
}

export function openOverhead() {
  const p = panel();
  if (!p) return;
  closeOtherSheets("overhead");
  p.classList.add("show");
  p.scrollTop = 0;
  setFab(true);
  run();
}

export function initOverhead() {
  const fab = $("#overhead-fab");
  const x = $("#overhead-x");
  if (x) x.onclick = () => closeOverhead();
  if (fab) {
    fab.onclick = () => {
      if (isOpen()) closeOverhead();
      else openOverhead();
    };
  }
  // Escape closes, matching the search panel's behaviour.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) closeOverhead();
  });
}

// Exposed for tests — the panel's derived view, without reaching into module
// state from outside.
export const _test = {
  setResults(rows) {
    results = rows;
    shown = PAGE;
    hiddenCats = new Set();
  },
  renderList,
  renderFilters,
  visibleResults,
  PAGE,
};

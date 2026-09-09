import { catColorHex, WORKER_BASE } from "../config.js";
import { state, $ } from "../state.js";
import { DATA } from "../data/store.js";
import { select } from "./info.js";
import { esc } from "../util/html.js";

/**
 * Popular Objects rows are hand-written copy, which is fine for a standing
 * fact ("China's permanent space station") and wrong for anything that moves.
 * Three of the five shipped with claims the app's own data contradicted: the
 * ISS row asserted a crew count that disagreed with /crew, and the Hubble row
 * asserted an age that had been true two years earlier.
 *
 * So a row may declare a `live` resolver plus a `template` containing {n}.
 * When the resolver produces a number the template is used; otherwise the
 * plain `reason` — written to carry no number at all — is shown. A row with
 * no `live` field is static copy and rendered as-is.
 *
 * The fallback is deliberately claim-free rather than a last-known number:
 * a stale hardcoded count is exactly the failure being fixed.
 */
const RESOLVERS = {
  /** Headcount aboard the ISS specifically, not everyone in space. */
  issCrew: () => issCrewCount,
  /** Whole years elapsed since `since` (an immutable launch date). */
  yearsSince: (row) => {
    const t = Date.parse(row.since);
    if (!Number.isFinite(t)) return null;
    const years = Math.floor((Date.now() - t) / 31557600000);
    return years > 0 ? years : null;
  },
};

let issCrewCount = null;

function reasonFor(row) {
  if (!row.live || !row.template) return row.reason;
  const n = RESOLVERS[row.live]?.(row);
  return Number.isFinite(n) ? row.template.replace("{n}", String(n)) : row.reason;
}

const SLOT_COUNT = 5;
const LAST_SHOWN_KEY = "ot-hotlist-last-shown";

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Picked once per boot (the card is a fixed "here's today's five" for the
 * whole session, not a live-updating carousel). `pinned` rows (ISS) always
 * show; the rest of the SLOT_COUNT is filled by a random draw from the
 * non-pinned pool, preferring entries that weren't part of the last boot's
 * draw so reloading doesn't just show the same four again. If the pool is
 * too small to avoid every repeat, falling back to the full pool (letting a
 * repeat through) beats showing fewer than SLOT_COUNT rows.
 */
export function pickRotation(rows) {
  const pinned = rows.filter((r) => r.pinned);
  const pool = rows.filter((r) => !r.pinned);
  const needed = Math.max(0, SLOT_COUNT - pinned.length);

  let lastShown = [];
  try {
    lastShown = JSON.parse(localStorage.getItem(LAST_SHOWN_KEY) || "[]");
  } catch {
    lastShown = [];
  }

  const fresh = pool.filter((r) => !lastShown.includes(r.id));
  const candidates = fresh.length >= needed ? fresh : pool;
  const chosen = shuffled(candidates).slice(0, needed);

  try {
    localStorage.setItem(LAST_SHOWN_KEY, JSON.stringify(chosen.map((r) => r.id)));
  } catch {
    // Best-effort — a failed write just means the next boot can't dedupe.
  }

  return [...pinned, ...chosen];
}

let rotation = null;

function getRotation() {
  if (!rotation) rotation = pickRotation(DATA.hotlist);
  return rotation;
}

export function renderToday() {
  const box = $("#today-list");
  if (!box) return;
  box.innerHTML = "";
  getRotation().forEach((h) => {
    const sat = state.byId.get(h.id);
    const hex = catColorHex(sat ? sat.cat : "other");
    const el = document.createElement("button");
    el.type = "button";
    el.className = "today-row";
    el.innerHTML = `<span class="sw" style="background:${hex};color:${hex}"></span>
      <span class="info"><span class="nm">${esc(h.name)}</span><span class="reason">${esc(reasonFor(h))}</span></span>`;
    el.onclick = () => {
      const s = state.byId.get(h.id);
      if (s) select(s);
    };
    box.appendChild(el);
  });
}

/**
 * One /crew read for the ISS headcount, then a re-render. Best-effort by
 * design: on any failure issCrewCount stays null and the rows fall back to
 * their claim-free copy, so a throttled or down upstream costs a detail
 * rather than printing a wrong number. The Worker caches /crew for an hour
 * and negative-caches failures, so this is cheap.
 */
export async function refreshTodayLiveFacts() {
  try {
    const r = await fetch(WORKER_BASE + "/crew", { cache: "no-store" });
    if (!r.ok) return;
    const d = await r.json();
    if (d.ok === false || !Array.isArray(d.people)) return;
    const n = d.people.filter((p) => p && p.craft === "ISS").length;
    if (!n) return; // an empty roster is a bad read, not a genuinely empty station
    issCrewCount = n;
    renderToday();
  } catch {
    // Leaves issCrewCount null — rows keep their claim-free copy.
  }
}

export function initTodayToggle() {
  let todayOpen = false;
  $("#today-list").style.display = todayOpen ? "" : "none";
  $("#today-toggle").textContent = todayOpen ? "▾" : "▸";
  const todayPh = $("#today-ph");
  if (todayPh)
    todayPh.onclick = () => {
      todayOpen = !todayOpen;
      $("#today-list").style.display = todayOpen ? "" : "none";
      $("#today-toggle").textContent = todayOpen ? "▾" : "▸";
    };
}

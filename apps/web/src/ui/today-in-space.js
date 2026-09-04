import { CATS, WORKER_BASE, catColorHex, eventColorHex, eventIconSvg } from "../config.js";
import { state, $ } from "../state.js";
import { select } from "./info.js";
import { chainSummary, chainDetail, selectChain } from "./chain.js";
import { esc } from "../util/html.js";
import { formatRelativeTime } from "../util/relative-time.js";

// Same station anchor IDs capsules.js's STATION_HUB_IDS uses (ISS/Zarya,
// CSS/Tianhe) — duplicated here rather than imported from
// @orbital-traffic/catalog since this is purely a UI tap-target choice
// ("open the station card"), not classification logic.
const CRAFT_TO_STATION_ID = { ISS: "25544", Tiangong: "48274" };
const STATION_LABEL = { iss: "ISS", css: "Tiangong" };

const DOCKING_VERB = {
  launched: "Launched",
  docked: "Docked",
  undocked: "Undocked",
  landed: "Landed",
};

/** Every branch below returns a plain (unescaped) string — esc() is applied once, at render time. */
function dockingText(e) {
  const verb = DOCKING_VERB[e.subtype] || e.subtype;
  const station = e.stationKey ? STATION_LABEL[e.stationKey] || e.stationKey : null;
  if (station && e.subtype === "docked") return `${verb} · ${e.name} → ${station}`;
  if (station && e.subtype === "undocked") return `${verb} · ${e.name} from ${station}`;
  return `${verb} · ${e.name}`;
}

function launchText(e) {
  if (e.count > 1) {
    const label = (CATS[e.cat] || CATS.other).label;
    return `Launched · ${e.count} new ${label} satellites`;
  }
  return `Launched · ${e.name}`;
}

function crewText(e) {
  return e.direction === "arrived"
    ? `Crew change · ${e.name} arrived aboard ${e.craft}`
    : `Crew change · ${e.name} departed ${e.craft}`;
}

/**
 * The detected chain a launch event delivered, if that batch is still flying
 * as one. A grouped launch row then opens the whole string rather than an
 * arbitrary one of its satellites — the single most useful thing a "23 new
 * Starlink satellites" row can do, and the reason a batch row was worth
 * having before chains existed at all.
 */
function chainForLaunch(e) {
  if (!e.ids || e.ids.length < 2 || !state.chains?.length) return null;
  const ids = new Set(e.ids);
  return state.chains.find((c) => c.ids.some((id) => ids.has(id))) || null;
}

/** Row copy (plain, unescaped) + what this event should open on tap, if anything. */
function describeEvent(e) {
  switch (e.type) {
    case "chain":
      return { text: chainSummary(e.chain), detail: chainDetail(e.chain), open: () => selectChain(e.chain) };
    case "docking":
      return { text: dockingText(e), target: state.byId.get(e.id) || null };
    case "launch": {
      const chain = chainForLaunch(e);
      if (chain) return { text: launchText(e), detail: chainDetail(chain), open: () => selectChain(chain) };
      return {
        text: launchText(e),
        target: e.ids?.map((id) => state.byId.get(id)).find(Boolean) || null,
      };
    }
    case "reentry":
      // The object decayed — it's gone from the live catalog by definition,
      // so there's usually nothing left to select. state.byId is checked
      // anyway in case a live sync hasn't pruned it yet.
      return { text: `Deorbited · ${e.name}`, target: state.byId.get(e.id) || null };
    case "crew":
      return { text: crewText(e), target: state.byId.get(CRAFT_TO_STATION_ID[e.craft]) || null };
    default:
      return { text: String(e.type), target: null };
  }
}

let cachedEvents = [];

/**
 * Most chain rows this feed will show at once. Constellation launches come
 * every few days, so several trains are usually up together — but this is a
 * "what happened in space today" card, and a run of near-identical Starlink
 * rows would push the dockings, launches and crew changes out of sight.
 * detectChains() returns tightest-first, so the ones kept are the ones still
 * most worth looking at.
 */
const MAX_CHAIN_ROWS = 3;

/**
 * Chain rows for trains no launch event already covers.
 *
 * A launch event carries the real launch time and only lives for the feed's
 * 48-hour window; a chain is an ongoing condition with no timestamp of its
 * own that stays interesting for the week or two the string holds together.
 * So the launch row wins while it exists (it says more), and these fill the
 * gap afterwards — which is most of a train's visible life.
 */
function chainEvents() {
  const covered = new Set();
  for (const e of cachedEvents) {
    if (e.type !== "launch") continue;
    const c = chainForLaunch(e);
    if (c) covered.add(c.key);
  }
  return (state.chains || [])
    .filter((c) => !covered.has(c.key))
    .slice(0, MAX_CHAIN_ROWS)
    .map((c) => ({ type: "chain", cat: c.cat, chain: c, at: null }));
}

export function renderEvents() {
  const box = $("#events-list");
  if (!box) return;
  box.innerHTML = "";

  // Chains first: they're happening now rather than at a point in the past,
  // so they have no `at` to sort them into the time-ordered feed below.
  const rows = [...chainEvents(), ...cachedEvents];
  if (!rows.length) {
    box.innerHTML = `<div class="events-empty">No major events in the last 48 hours.</div>`;
    return;
  }

  for (const e of rows) {
    const { text, detail, target, open } = describeEvent(e);
    const hex = e.type === "chain" ? catColorHex(e.cat) : eventColorHex(e.type);
    const icon = eventIconSvg(e.type);
    const sub = detail || formatRelativeTime(new Date(e.at)) || "";
    const act = open || (target ? () => select(target) : null);

    const el = document.createElement("button");
    el.type = "button";
    el.className = "today-row event-row" + (act ? "" : " inert");
    el.innerHTML = `<span class="badge" style="color:${hex}">${icon}</span>
      <span class="info"><span class="nm">${esc(text)}</span><span class="reason">${esc(sub)}</span></span>`;
    if (act) el.onclick = act;
    box.appendChild(el);
  }
}

/**
 * One /events read, then a re-render. Best-effort: on any failure the
 * body keeps whatever it last rendered.
 */
export async function refreshEvents() {
  try {
    const r = await fetch(WORKER_BASE + "/events", { cache: "no-store" });
    if (!r.ok) return;
    const d = await r.json();
    if (!Array.isArray(d.events)) return;
    cachedEvents = d.events;
    renderEvents();
  } catch {
    // Leaves cachedEvents/header as they were.
  }
}

export function initEventsToggle() {
  let eventsOpen = false;
  $("#events-list").style.display = eventsOpen ? "" : "none";
  $("#events-toggle").textContent = eventsOpen ? "▾" : "▸";
  const ph = $("#events-ph");
  if (ph)
    ph.onclick = () => {
      eventsOpen = !eventsOpen;
      $("#events-list").style.display = eventsOpen ? "" : "none";
      $("#events-toggle").textContent = eventsOpen ? "▾" : "▸";
    };
}

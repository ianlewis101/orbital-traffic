import { CATS, WORKER_BASE, eventColorHex, eventIconSvg } from "../config.js";
import { state, $ } from "../state.js";
import { select } from "./info.js";
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

/** Row copy (plain, unescaped) + the object this event should select on tap, if any. */
function describeEvent(e) {
  switch (e.type) {
    case "docking":
      return { text: dockingText(e), target: state.byId.get(e.id) || null };
    case "launch":
      return {
        text: launchText(e),
        target: e.ids?.map((id) => state.byId.get(id)).find(Boolean) || null,
      };
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

export function renderEvents() {
  const box = $("#events-list");
  if (!box) return;
  box.innerHTML = "";

  if (!cachedEvents.length) {
    box.innerHTML = `<div class="events-empty">No major events in the last 48 hours.</div>`;
    return;
  }

  for (const e of cachedEvents) {
    const { text, target } = describeEvent(e);
    const hex = eventColorHex(e.type);
    const icon = eventIconSvg(e.type);
    const rel = formatRelativeTime(new Date(e.at));

    const el = document.createElement("button");
    el.type = "button";
    el.className = "today-row event-row" + (target ? "" : " inert");
    el.innerHTML = `<span class="badge" style="color:${hex}">${icon}</span>
      <span class="info"><span class="nm">${esc(text)}</span><span class="reason">${esc(rel || "")}</span></span>`;
    if (target) el.onclick = () => select(target);
    box.appendChild(el);
  }
}

function updateHeader(count) {
  const title = $("#events-title");
  if (!title) return;
  if (count == null) {
    title.textContent = "Today in Space";
  } else if (count === 0) {
    title.textContent = "Today in Space · No events";
  } else {
    title.textContent = `Today in Space · ${count} event${count === 1 ? "" : "s"}`;
  }
}

/**
 * One /events read, then a re-render. Best-effort: on any failure the
 * header falls back to its bare "Today in Space" title (no false "0
 * events") and the body keeps whatever it last rendered.
 */
export async function refreshEvents() {
  try {
    const r = await fetch(WORKER_BASE + "/events", { cache: "no-store" });
    if (!r.ok) return;
    const d = await r.json();
    if (!Array.isArray(d.events)) return;
    cachedEvents = d.events;
    updateHeader(cachedEvents.length);
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

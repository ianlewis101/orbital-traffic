import { WORKER_BASE } from "../config.js";
import { state } from "../state.js";

const STATION_LABEL = { iss: "ISS", css: "Tiangong" };
const PHASE_LABEL = { docked: "Docked", "free-flying": "Free-flying", landed: "Landed" };
const EVENT_LABEL = { launched: "Launched", docked: "Docked", undocked: "Undocked", landed: "Landed / re-entered" };

function timeAgo(iso) {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  return days === 1 ? "1 day" : `${days} days`;
}

/**
 * Renders a tracked crewed capsule's own phase + recent transition events —
 * the counterpart to fetchAndRenderCrew() for when the capsule itself
 * (not its station hub) is the selected object.
 */
export async function renderCapsuleStatus(s, el) {
  el.style.display = "block";
  el.innerHTML = `<div class="crew-block"><div style="padding:14px;text-align:center;font-size:9.5px;color:var(--ink-faint);letter-spacing:0.1em">Fetching status…</div></div>`;

  let data;
  try {
    const r = await fetch(WORKER_BASE + "/capsules", { cache: "no-store" });
    data = await r.json();
  } catch {
    data = { capsules: {}, events: [] };
  }
  if (state.selected !== s) return; // selection changed while this was in flight

  const status = data.capsules && data.capsules[s.id];
  if (!status) {
    el.innerHTML = `<div class="crew-block"><div style="padding:14px;text-align:center;font-size:9.5px;color:var(--ink-faint);letter-spacing:0.1em">Status unavailable</div></div>`;
    return;
  }

  const stationLbl = status.stationKey ? STATION_LABEL[status.stationKey] || status.stationKey : null;
  const recent = (data.events || []).filter((e) => e.id === s.id).slice(-5).reverse();
  const eventsHTML = recent
    .map((e) => {
      const verb = EVENT_LABEL[e.event] || e.event;
      const where =
        (e.event === "docked" || e.event === "undocked") && e.stationKey
          ? ` ${e.event === "docked" ? "at" : "from"} ${STATION_LABEL[e.stationKey] || e.stationKey}`
          : "";
      const when = new Date(e.at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return `<div class="crew-today-item"><div class="crew-today-dot"></div><div class="crew-today-txt">${verb}${where} — ${when}</div></div>`;
    })
    .join("");

  el.innerHTML = `
    <div class="crew-block">
      <div class="crew-exp-hd">
        <div><div class="crew-exp-name">${PHASE_LABEL[status.phase] || status.phase}</div>
        <div class="crew-exp-sub">${stationLbl ? "at " + stationLbl + " · " : ""}${timeAgo(status.since)} in this phase</div></div>
      </div>
    </div>
    ${
      recent.length
        ? `<div class="crew-today"><div class="crew-today-hd"><div class="crew-today-lbl">Recent activity</div></div><div class="crew-today-body">${eventsHTML}</div></div>`
        : ""
    }`;
}

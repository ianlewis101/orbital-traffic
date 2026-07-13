import { WORKER_BASE } from "../config.js";
import { $, state } from "../state.js";
import { vehicleFamily } from "@orbital-traffic/catalog";
import { renderCapsuleStatus } from "./capsule-status.js";
import { esc } from "../util/html.js";

function initials(name) {
  const p = name.trim().split(/\s+/);
  return p.length >= 2
    ? (p[0][0] + p[p.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

// "Today aboard" is sourced from iss-today.json via the worker's /today
// endpoint — it's ISS-specific, so only ISS modules should show it. Other
// stations (e.g. Tiangong) still show live crew, just not this feed.
const ISS_TODAY_IDS = new Set(["25544", "49044", "27386", "28654", "37224", "37820"]);

export async function fetchAndRenderCrew(s) {
  const el = $("#info-crew");
  if (!el) return;
  const isISS = s.id === "25544";
  const isTG = /TIANHE|TIANGONG|CSS/.test(s.name.toUpperCase());
  if (!isISS && !isTG) {
    // Not a station hub — if it's a tracked crewed capsule or cargo vehicle,
    // show its own phase/status instead of hiding the card entirely.
    const family = s.cat === "stations" ? vehicleFamily(s.name) : null;
    if (family) return renderCapsuleStatus(s, el);
    el.style.display = "none";
    el.innerHTML = "";
    return;
  }
  const showToday = ISS_TODAY_IDS.has(s.id);
  const craft = isISS ? "ISS" : "Tiangong";
  el.style.display = "block";
  el.innerHTML = `<div class="crew-block"><div style="padding:14px;text-align:center;font-size:9.5px;color:var(--ink-faint);letter-spacing:0.1em">Fetching crew…</div></div>`;
  // fetch crew from worker
  let crew = [];
  try {
    const r = await fetch(WORKER_BASE + "/crew", { cache: "no-store" });
    const d = await r.json();
    const people = d.people || [];
    crew = people.filter((p) => (p.craft || p.location || "").includes(craft));
  } catch {}
  if (state.selected !== s) return; // selection changed while this was in flight

  // fetch today's activities from worker (sourced from iss-today.json)
  let todayData = null;
  if (showToday) {
    try {
      const r = await fetch(WORKER_BASE + "/today", { cache: "no-store" });
      todayData = await r.json();
    } catch {}
  }
  if (state.selected !== s) return; // selection changed while this was in flight
  // Only render real activity data from a successful /today fetch. If it's
  // missing or empty, say so honestly rather than substituting fabricated content.
  const activities =
    todayData && Array.isArray(todayData.activities) ? todayData.activities : [];
  const hasToday = activities.length > 0;
  const todayItems = activities
    .map(
      (t) =>
        `<div class="crew-today-item"><div class="crew-today-dot"></div><div class="crew-today-txt">${esc(t)}</div></div>`
    )
    .join("");
  const todayDate = (todayData && todayData.updated) || "";
  // avatars — use crew from API or show count only
  let avHTML = "";
  if (crew.length > 0) {
    avHTML = crew
      .map((p, i) => {
        const init = initials(p.name || "??");
        const isCmd = i === 0 || (p.role || "").toLowerCase().includes("commander");
        return `<div class="crew-av"><div class="crew-av-c${isCmd ? " cmd" : ""}">${esc(init)}</div><div class="crew-av-n">${esc((p.name || "").split(" ").pop())}</div></div>`;
      })
      .join("");
  } else {
    avHTML = `<div style="font-size:10px;color:var(--ink-faint);padding:4px 0;letter-spacing:0.05em">Crew names unavailable</div>`;
  }
  const count = crew.length || "?";
  el.innerHTML = `
    <div class="crew-block">
      <div class="crew-exp-hd">
        <div><div class="crew-exp-name">${craft}</div></div>
        <div class="crew-count-wrap"><div class="crew-count">${count}</div><div class="crew-count-lbl">ABOARD</div></div>
      </div>
      <div class="crew-avs">${avHTML}</div>
    </div>
    ${
      showToday
        ? `<div class="crew-today">
      <div class="crew-today-hd"><div class="crew-today-lbl">Today aboard</div>${
        todayDate ? `<div class="crew-today-dt">${esc(todayDate)}</div>` : ""
      }</div>
      <div class="crew-today-body">${
        hasToday
          ? todayItems
          : `<div class="crew-today-item"><div class="crew-today-txt">Today's activity log is unavailable right now</div></div>`
      }</div>
    </div>`
        : ""
    }`;
}

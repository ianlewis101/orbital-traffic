import { WORKER_BASE } from "../config.js";
import { $, state } from "../state.js";
import { vehicleFamily } from "@orbital-traffic/catalog";
import { renderCapsuleStatus } from "./capsule-status.js";

/**
 * Fallback expedition metadata, shown while (or if) the live /crew and
 * /today endpoints are unavailable.
 */
const EXPEDITION_DATA = {
  iss: {
    name: "Expedition 73",
    launch: "2026-03-14",
    daysTotal: 180,
    mission:
      "Crew-12 and Soyuz MS-29 crews continue long-duration microgravity research. Key focus areas include cardiovascular adaptation, muscle atrophy countermeasures, advanced materials processing in vacuum, and commercial crew operations readiness testing.",
    today: [
      "Crew completed preventive maintenance on the Carbon Dioxide Removal Assembly (CDRA) and replaced a molecular sieve bed in the US segment.",
      "Tracy Caldwell Dyson photographed severe weather systems over the Gulf of Mexico for the IMAX Earth observation project.",
      "Roscosmos crew ran fluid physics experiment runs in the Russian segment's Plasma Crystal-4 facility.",
    ],
    todayDate: "Jun 16 2026",
  },
  tiangong: {
    name: "Shenzhou 21",
    launch: "2026-04-24",
    daysTotal: 180,
    mission:
      "China's ongoing crewed missions to the completed Tiangong station focus on life sciences, microgravity fluid physics, space medicine research, and Earth observation campaigns supporting climate monitoring.",
    today: [
      "Crew performed extravehicular activity prep drills and tested new spacesuit pressure sealing procedures.",
      "Plant growth photography sessions completed for the germination experiment in the Wentian module.",
    ],
    todayDate: "Jun 16 2026",
  },
};

function initials(name) {
  const p = name.trim().split(/\s+/);
  return p.length >= 2
    ? (p[0][0] + p[p.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

// "Today aboard" is sourced from iss-today.json via the worker's /today
// endpoint — it's ISS-specific, so only ISS modules should show it. Other
// stations (e.g. Tiangong) have their own crew/mission but not this feed.
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
  const key = isISS ? "iss" : "tiangong";
  const exp = EXPEDITION_DATA[key];
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
  const todayItems = showToday
    ? ((todayData && todayData.activities) || exp.today)
        .map(
          (t) =>
            `<div class="crew-today-item"><div class="crew-today-dot"></div><div class="crew-today-txt">${t}</div></div>`
        )
        .join("")
    : "";
  const todayDate = (todayData && todayData.updated) || exp.todayDate;
  // compute progress
  const launched = new Date(exp.launch),
    now = new Date();
  const daysIn = Math.max(0, Math.floor((now - launched) / 86400000));
  const pct = Math.min(Math.round((daysIn / exp.daysTotal) * 100), 100);
  const ret = new Date(launched.getTime() + exp.daysTotal * 86400000);
  const retStr = ret.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  const launchStr = launched.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  // avatars — use crew from API or show count only
  let avHTML = "";
  if (crew.length > 0) {
    avHTML = crew
      .map((p, i) => {
        const init = initials(p.name || "??");
        const isCmd = i === 0 || (p.role || "").toLowerCase().includes("commander");
        return `<div class="crew-av"><div class="crew-av-c${isCmd ? " cmd" : ""}">${init}</div><div class="crew-av-n">${(p.name || "").split(" ").pop()}</div></div>`;
      })
      .join("");
  } else {
    avHTML = `<div style="font-size:10px;color:var(--ink-faint);padding:4px 0;letter-spacing:0.05em">Crew names unavailable</div>`;
  }
  const count = crew.length || "?";
  el.innerHTML = `
    <div class="crew-block">
      <div class="crew-exp-hd">
        <div><div class="crew-exp-name">${exp.name}</div><div class="crew-exp-sub">Day ${daysIn} of ${exp.daysTotal} · Returns ${retStr}</div></div>
        <div class="crew-count-wrap"><div class="crew-count">${count}</div><div class="crew-count-lbl">ABOARD</div></div>
      </div>
      <div class="crew-avs">${avHTML}</div>
      <div class="crew-prog">
        <div class="crew-prog-bg"><div class="crew-prog-fill" style="width:${pct}%"></div></div>
        <div class="crew-prog-lbl"><span>Launch ${launchStr}</span><span>Return ${retStr}</span></div>
      </div>
    </div>
    <div class="crew-mission">
      <div class="crew-mission-hd">Mission</div>
      <div class="crew-mission-body">${exp.mission}</div>
    </div>
    ${
      showToday
        ? `<div class="crew-today">
      <div class="crew-today-hd"><div class="crew-today-lbl">Today aboard</div><div class="crew-today-dt">${todayDate}</div></div>
      <div class="crew-today-body">${todayItems}</div>
    </div>`
        : ""
    }`;
}

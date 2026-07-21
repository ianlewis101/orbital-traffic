import { WORKER_BASE } from "../config.js";
import { $, state } from "../state.js";
import { vehicleFamily, CREW_SEATS_BY_FAMILY } from "@orbital-traffic/catalog";
import { renderCapsuleStatus } from "./capsule-status.js";
import { esc } from "../util/html.js";
import { formatRelativeTime } from "../util/relative-time.js";

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
    const family = s.cat === "capsules" ? vehicleFamily(s.name) : null;
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
  let crewFetchFailed = false;
  let fetchedAt = null;
  let possiblyIncomplete = false;
  try {
    const r = await fetch(WORKER_BASE + "/crew", { cache: "no-store" });
    if (!r.ok) throw new Error("bad status");
    const d = await r.json();
    if (d.ok === false || !Array.isArray(d.people)) throw new Error("bad shape");
    crew = d.people.filter((p) => (p.craft || p.location || "").includes(craft));
    fetchedAt = d.fetchedAt || null;
    // LL2's per-station active-expedition data can lag by a few days on a
    // brand-new arrival during a handover overlap — this doesn't say which
    // station is short (that would need cross-referencing mission data, out
    // of scope), so it's shown regardless of which station card is open.
    possiblyIncomplete = d.possiblyIncomplete === true;
  } catch {
    crewFetchFailed = true;
  }
  if (state.selected !== s) return; // selection changed while this was in flight

  // Plausibility stopgap (see CREW_SEATS_BY_FAMILY's doc comment in
  // classify.js), added 2026-07-20 when Open Notify was found serving a
  // roster ~18 months stale: compares the crew fetch's headcount against
  // how many seats are actually docked at this station right now, per
  // capsule-status.json (state.capsulesData). This can only catch gross
  // mismatches — it has no notion of *who* is aboard, only how many, so a
  // roster with a plausible headcount but stale/wrong names (the actual
  // 2026-07-20 incident) slips through undetected. Open Notify was fully
  // replaced by Launch Library 2 on 2026-07-21 (see the Worker's
  // buildCrew()), so this is no longer the primary safeguard against a bad
  // roster — kept as a harmless, source-agnostic generic backstop.
  let crewSuspect = false;
  if (!crewFetchFailed && state.capsulesData) {
    const stationKey = isISS ? "iss" : "css";
    let expectedSeats = 0;
    let unrecognizedFamily = false;
    for (const c of Object.values(state.capsulesData)) {
      if (c.kind !== "crew" || c.phase !== "docked" || c.stationKey !== stationKey) continue;
      const seats = CREW_SEATS_BY_FAMILY[vehicleFamily(c.name)];
      if (seats == null) unrecognizedFamily = true;
      else expectedSeats += seats;
    }
    const actual = crew.length;
    // Order matters: "no vehicle docked at all" and "vehicle docked but
    // nobody aboard" are checked before the general overcount tolerance —
    // that tolerance (handover overlap, or an unrecognized-family vehicle's
    // real seats not being counted) only makes sense once at least one
    // vehicle is actually present.
    if (expectedSeats === 0 && !unrecognizedFamily) {
      if (actual > 0) crewSuspect = true;
    } else if (actual === 0) {
      crewSuspect = true;
    } else if (actual > expectedSeats) {
      // Not a data problem: a handover overlap (new capsule docked before
      // the departing one undocked) or an unrecognized-family vehicle's
      // seats simply aren't reflected in expectedSeats.
    } else if (actual < expectedSeats - 1) {
      crewSuspect = true;
    }
  }

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
  } else if (crewFetchFailed) {
    avHTML = `<div style="font-size:10px;color:var(--ink-faint);padding:4px 0;letter-spacing:0.05em">Crew data temporarily unavailable</div>`;
  } else {
    avHTML = `<div style="font-size:10px;color:var(--ink-faint);padding:4px 0;letter-spacing:0.05em">Crew names unavailable</div>`;
  }
  const count = crew.length || "?";
  el.innerHTML = `
    <div class="crew-block">
      <div class="crew-exp-hd">
        <div><div class="crew-exp-name">${craft}</div></div>
        <div class="crew-count-wrap"><div class="crew-count">${
          // eslint-disable-next-line orbital/no-unescaped-innerhtml -- count is crew.length (a number) or the literal "?" fallback
          count
        }</div><div class="crew-count-lbl">ABOARD</div>${
          !crewFetchFailed && fetchedAt
            ? `<div class="crew-count-lbl">as of ${formatRelativeTime(new Date(fetchedAt))}</div>`
            : ""
        }</div>
      </div>
      <div class="crew-avs">${
        // eslint-disable-next-line orbital/no-unescaped-innerhtml -- avHTML is assembled from esc()-escaped crew data in the map() loop above
        avHTML
      }</div>
      ${
        crewSuspect
          ? `<div style="font-size:10px;color:var(--ink-faint);padding:4px 0;letter-spacing:0.05em">Roster may not reflect the current crew</div>`
          : ""
      }
      ${
        !crewFetchFailed && possiblyIncomplete
          ? `<div style="font-size:10px;color:var(--ink-faint);padding:4px 0;letter-spacing:0.05em">There may be additional crew not reflected yet</div>`
          : ""
      }
    </div>
    ${
      // eslint-disable-next-line orbital/no-unescaped-innerhtml -- todayItems (used below) is assembled from esc()-escaped activity text in the map() loop above
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

import { WORKER_BASE, catColorHex } from "../config.js";
import { $, state } from "../state.js";
import { vehicleFamily, CREW_SEATS_BY_FAMILY } from "@orbital-traffic/catalog";
import { renderCapsuleStatus } from "./capsule-status.js";
import { select } from "./info.js";
import { esc } from "../util/html.js";
import { formatRelativeTime } from "../util/relative-time.js";
import { stalenessNote, ISS_TODAY_STALE_MS } from "../util/freshness.js";
import { setInfoFreshness } from "./info-attr.js";

function initials(name) {
  const p = name.trim().split(/\s+/);
  return p.length >= 2
    ? (p[0][0] + p[p.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

// Profiles keyed by LL2 astronaut id. A crew roster is small and its members
// barely change, so re-opening the same person (or re-selecting the station)
// shouldn't refetch — the Worker caches for a day, but this also spares the
// round trip entirely. `null` is a cached "unavailable", distinct from a
// missing key (never fetched).
const profileCache = new Map();

/**
 * ISO 8601 duration → short human string ("P369DT6H45M59S" → "369d 6h").
 * LL2 reports time_in_space/eva_time this way. Anything unparseable returns
 * null so the caller can omit the stat rather than print a raw duration.
 */
export function formatDuration(iso) {
  if (typeof iso !== "string") return null;
  const m = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:[\d.]+S)?)?$/.exec(
    iso
  );
  if (!m) return null;
  const [, y, mo, d, h, min] = m.map((v) => (v == null ? v : Number(v)));
  // Years/months are folded into an approximate day count only when LL2
  // actually sends them (it normally reports plain days, e.g. P369D).
  const days = (y || 0) * 365 + (mo || 0) * 30 + (d || 0);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (h) parts.push(`${h}h`);
  // Minutes are noise once a value spans days (time in space), but they're
  // most of the number for a sub-day one (a single EVA).
  if (!days && min) parts.push(`${min}m`);
  return parts.length ? parts.join(" ") : null;
}

// Only ever render an https image URL. LL2's images are all https today;
// this just makes it impossible for an unexpected upstream value to become
// some other kind of URL in an <img src>.
function safeImage(url) {
  return typeof url === "string" && url.startsWith("https://") ? url : null;
}

function profileMessage(text) {
  return `<div class="crew-bio-msg">${esc(text)}</div>`;
}

function renderProfile(p) {
  if (!p) return profileMessage("Profile unavailable for this crew member");
  const img = safeImage(p.image);
  const sub = [p.nationality, p.agency].filter(Boolean).join(" · ");
  const stat = (value, label) =>
    `<div class="crew-bio-stat"><b>${esc(String(value))}</b> ${esc(label)}</div>`;
  const stats = [
    p.flights != null ? stat(p.flights, p.flights === 1 ? "flight" : "flights") : "",
    p.spacewalks != null ? stat(p.spacewalks, p.spacewalks === 1 ? "EVA" : "EVAs") : "",
  ];
  const inSpace = formatDuration(p.timeInSpace);
  if (inSpace) stats.push(stat(inSpace, "in space"));
  const links = [
    p.wiki
      ? `<a href="${esc(p.wiki)}" target="_blank" rel="noopener noreferrer">Wikipedia</a>`
      : "",
    p.twitter ? `<a href="${esc(p.twitter)}" target="_blank" rel="noopener noreferrer">X</a>` : "",
    p.instagram
      ? `<a href="${esc(p.instagram)}" target="_blank" rel="noopener noreferrer">Instagram</a>`
      : "",
  ].filter(Boolean);
  return `
    <div class="crew-bio-top">
      ${img ? `<img class="crew-bio-img" src="${esc(img)}" alt="" loading="lazy">` : ""}
      <div class="crew-bio-meta">
        <div class="crew-bio-name">${esc(p.name || "")}</div>
        ${sub ? `<div class="crew-bio-sub">${esc(sub)}</div>` : ""}
        <div class="crew-bio-stats">${stats.filter(Boolean).join("")}</div>
      </div>
    </div>
    ${p.bio ? `<div class="crew-bio-txt">${esc(p.bio)}</div>` : ""}
    ${links.length ? `<div class="crew-bio-links">${links.join("")}</div>` : ""}`;
}

/**
 * Wires the roster's avatar buttons to the shared detail panel beneath them.
 * One panel (rather than a panel per avatar) keeps the wrapped flex grid from
 * reflowing when a bio opens, and means only one person can be open at a time.
 */
function wireCrewAvatars(root) {
  const panel = root.querySelector(".crew-bio");
  const avatars = [...root.querySelectorAll(".crew-av")];
  if (!panel || !avatars.length) return;
  let openId = null;

  const collapse = () => {
    openId = null;
    panel.hidden = true;
    panel.innerHTML = "";
    for (const a of avatars) a.setAttribute("aria-expanded", "false");
  };

  for (const btn of avatars) {
    btn.onclick = async () => {
      const id = btn.dataset.aid;
      if (!id || openId === id) return collapse();
      openId = id;
      for (const a of avatars) a.setAttribute("aria-expanded", String(a === btn));
      panel.hidden = false;
      if (profileCache.has(id)) {
        panel.innerHTML = renderProfile(profileCache.get(id));
        return;
      }
      panel.innerHTML = profileMessage("Loading profile…");
      let data = null;
      try {
        const r = await fetch(`${WORKER_BASE}/astronaut?id=${encodeURIComponent(id)}`);
        if (r.ok) data = await r.json();
      } catch {
        // Leaves data null — rendered as "Profile unavailable" below.
      }
      // A slow fetch may land after the user collapsed this person or opened
      // someone else; only the still-open request may paint.
      if (openId !== id) return;
      profileCache.set(id, data);
      panel.innerHTML = renderProfile(data);
    };
  }
}

// "Today aboard" is sourced from iss-today.json via the worker's /today
// endpoint — it's ISS-specific, so only ISS modules should show it. Other
// stations (e.g. Tiangong) still show live crew, just not this feed.
// NOTE: only 25544 can actually reach this today — fetchAndRenderCrew() gates
// on `s.id === "25544"` before this set is consulted (audit F23, still open).
// The IDs are kept correct regardless: this set previously listed 27386, 28654,
// 37224 and 37820, which are ENVISAT, NOAA 18, O/OREOS and the de-orbited
// Tiangong-1 — so whenever F23 is fixed, those four would have started serving
// "Today aboard the ISS" for unrelated satellites.
const ISS_TODAY_IDS = new Set([
  "25544", // ISS (Zarya)
  "49044", // ISS (Nauka)
  "25575", // ISS (Unity)
  "26400", // ISS (Zvezda)
  "26700", // ISS (Destiny)
  "36086", // Poisk
]);

/**
 * Vehicles physically docked at this station right now, per
 * capsule-status.json (state.capsulesData) — the same source the roster
 * plausibility check above reads seat counts from. Docked crew and cargo
 * vehicles alike render at their host station's own position (they share
 * its TLE — see the "7 vs 2 capsules" investigation in docs/audit-status.md),
 * so this is the only way to select one specific docked vehicle directly
 * rather than whichever one happens to render on top on the globe. Each
 * capsule-status entry is resolved to its live state.byId object; an entry
 * with no match yet (a live sync hasn't injected it) is skipped rather than
 * shown as a dead row. General across any station key, not ISS-specific.
 */
function dockedVehicles(stationKey) {
  if (!state.capsulesData) return [];
  const list = [];
  for (const [id, c] of Object.entries(state.capsulesData)) {
    if (c.phase !== "docked" || c.stationKey !== stationKey) continue;
    const sat = state.byId.get(id);
    if (sat) list.push(sat);
  }
  return list;
}

/** Collapsed-by-default "Docked capsules · N" block — "" (no block) when there's nothing docked yet. */
function dockedVehiclesHTML(vehicles) {
  if (!vehicles.length) return "";
  const rows = vehicles
    .map((v) => {
      const hex = catColorHex(v.cat);
      return `<button type="button" class="today-row crew-docked-row" data-id="${esc(v.id)}">
        <span class="sw" style="background:${hex};color:${hex}"></span>
        <span class="info"><span class="nm">${esc(v.name)}</span></span>
      </button>`;
    })
    .join("");
  return `
    <div class="crew-docked">
      <button type="button" class="crew-docked-hd" aria-expanded="false">
        <span class="crew-docked-lbl">Docked capsules &middot; ${vehicles.length}</span>
        <span class="crew-docked-chev">▸</span>
      </button>
      <div class="crew-docked-body" style="display:none">${rows}</div>
    </div>`;
}

/** Wires the docked-vehicles collapse toggle and per-row selection. No-op if the block wasn't rendered. */
function wireDockedVehicles(root) {
  const hd = root.querySelector(".crew-docked-hd");
  const body = root.querySelector(".crew-docked-body");
  if (!hd || !body) return;
  const chev = hd.querySelector(".crew-docked-chev");
  hd.onclick = () => {
    const open = body.style.display !== "none";
    body.style.display = open ? "none" : "block";
    if (chev) chev.textContent = open ? "▸" : "▾";
    hd.setAttribute("aria-expanded", String(!open));
  };
  for (const row of root.querySelectorAll(".crew-docked-row")) {
    row.onclick = () => {
      const v = state.byId.get(row.dataset.id);
      if (v) select(v);
    };
  }
}

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
    setInfoFreshness(null);
    return;
  }
  const showToday = ISS_TODAY_IDS.has(s.id);
  const craft = isISS ? "ISS" : "Tiangong";
  const stationKey = isISS ? "iss" : "css";
  el.style.display = "block";
  el.innerHTML = `<div class="crew-block"><div style="padding:14px;text-align:center;font-size:9.5px;color:var(--ink-faint);letter-spacing:0.1em">Fetching crew…</div></div>`;
  setInfoFreshness(null); // clear any stale note from the previous selection while this fetch is in flight
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
  setInfoFreshness(
    !crewFetchFailed && fetchedAt
      ? `Crew data as of ${formatRelativeTime(new Date(fetchedAt))}`
      : null
  );

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
  const activities = todayData && Array.isArray(todayData.activities) ? todayData.activities : [];
  const hasToday = activities.length > 0;
  const todayItems = activities
    .map(
      (t) =>
        `<div class="crew-today-item"><div class="crew-today-dot"></div><div class="crew-today-txt">${esc(t)}</div></div>`
    )
    .join("");
  const todayDate = (todayData && todayData.updated) || "";
  // A daily log that stopped updating still reads as "today" — the header
  // shows its date, but a date alone doesn't tell a user it's months old.
  // Only computed when there is something to label as stale.
  const todayStale = showToday && todayDate ? stalenessNote(todayDate, ISS_TODAY_STALE_MS) : null;
  // avatars — use crew from API or show count only
  let avHTML = "";
  if (crew.length > 0) {
    // The commander highlight prefers real role data (LL2 sends it via the
    // Worker's /crew). The old "first listed person" heuristic stays as the
    // fallback for a response that carries no roles at all — e.g. one served
    // from an edge cache filled before roles were added.
    const hasRoles = crew.some((p) => p.role);
    avHTML = crew
      .map((p, i) => {
        const init = initials(p.name || "??");
        const isCmd = hasRoles ? (p.role || "").toLowerCase().includes("commander") : i === 0;
        // Only a person we can actually look up gets button affordances;
        // without an id there's nothing to expand, so it stays a plain div.
        const label = esc((p.name || "").split(" ").pop());
        const face = `<div class="crew-av-c${isCmd ? " cmd" : ""}">${esc(init)}</div><div class="crew-av-n">${label}</div>`;
        return p.id != null
          ? `<button type="button" class="crew-av" data-aid="${esc(String(p.id))}" aria-expanded="false" title="${esc(p.name || "")}">${face}</button>`
          : `<div class="crew-av">${face}</div>`;
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
        }</div><div class="crew-count-lbl">ABOARD</div></div>
      </div>
      <div class="crew-avs">${
        // eslint-disable-next-line orbital/no-unescaped-innerhtml -- avHTML is assembled from esc()-escaped crew data in the map() loop above
        avHTML
      }</div>
      <div class="crew-bio" hidden></div>
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
        todayStale
          ? `<div class="crew-today-dt stale">${esc(todayStale)}</div>`
          : todayDate
            ? `<div class="crew-today-dt">${esc(todayDate)}</div>`
            : ""
      }</div>
      <div class="crew-today-body">${
        hasToday
          ? todayItems
          : `<div class="crew-today-item"><div class="crew-today-txt">Today's activity log is unavailable right now</div></div>`
      }</div>
    </div>`
        : ""
    }
    ${
      // eslint-disable-next-line orbital/no-unescaped-innerhtml -- dockedVehiclesHTML() escapes every dynamic value (vehicle name/id) via esc() internally
      dockedVehiclesHTML(dockedVehicles(stationKey))
    }`;
  wireCrewAvatars(el);
  wireDockedVehicles(el);
}

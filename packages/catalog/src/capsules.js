import * as satellite from "satellite.js";
import {
  STATION_CORE_IDS,
  isDockedCrewVehicle,
  isStationVehicle,
  vehicleFamily,
} from "./classify.js";
import { noradId, tleAgeDays } from "./tle.js";

/**
 * Docking-vehicle phase tracking — docked / free-flying / landed — derived
 * from orbital elements rather than name matching alone. classify.js's
 * isStationVehicle() only ever says "this name looks like a crew or cargo
 * vehicle"; it has no notion of *when* that vehicle actually docked,
 * undocked, or landed. This module answers that, and is a sibling to
 * classify.js, not a replacement for it — a vehicle keeps cat:"capsules"
 * for its whole tracked lifetime regardless of phase; phase is additional
 * per-vehicle status, never a category swap.
 *
 * 2026-07-10: extended from crewed-capsule-only to also cover cargo
 * vehicles (Progress/Cygnus/Tianzhou/cargo Dragon) — Ian's call, since both
 * are "Famous Objects" users specifically search for and both should behave
 * identically: tracked while active, gone (not "other") once landed.
 * Every entry carries a `kind` ("crew" | "cargo") alongside `family` so
 * consumers can still tell them apart.
 *
 * 2026-07-16: crew/cargo vehicles split out of "stations" into their own
 * "capsules" category (classify.js's correctStationCat()/correctOtherCat())
 * so structural modules and docking vehicles can be shown/hidden
 * independently in the legend. This module's own phase-tracking logic is
 * unaffected — only the `cat` value its candidate filter checks for changed.
 */

// Same physical constants apps/web/src/astro/orbital.js's orbital(rec)
// uses; duplicated rather than imported since packages/catalog has no
// dependency on apps/web.
const MU = 398600.4418; // km^3/s^2
const EARTH_KM = 6371;

/** One anchor NORAD ID per station cluster — enough to fix "which plane," not every module. */
export const STATION_HUB_IDS = new Map([
  ["25544", "iss"], // ISS (Zarya)
  ["48274", "css"], // CSS (Tianhe)
]);

/**
 * distance <= this counts as "docked". ~5x the combined TLE-fit/propagation
 * noise between two independently-fit objects at the same physical
 * location, while staying far below any real transit separation.
 */
export const DOCKED_DISTANCE_KM = 75;
/** A capsule's inclination must be within this many degrees of a hub's to be associated with it at all. */
export const MAX_ASSOCIATION_INCLINATION_DEG = 5;
/** How long a "landed" capsule stays in the snapshot before being pruned. */
export const LANDED_RETENTION_DAYS = 30;
/** Hard ceiling on the persisted event log — years of real transition history at the actual event rate. */
export const MAX_EVENTS = 200;
/**
 * A capsule TLE older than this is treated as absent (→ landed): crewed-
 * vehicle elsets are re-fit at least daily while on orbit, so a week of
 * silence decisively means de-orbited, while still tolerating ordinary
 * fit gaps. Without this, a frozen TLE left in the feed after re-entry
 * would keep the capsule "tracked" on a ghost orbit indefinitely.
 */
export const STALE_TLE_DAYS = 7;

// Family patterns (and capsuleFamily itself) live in classify.js next to
// isDockedCrewVehicle so eligibility and family can never disagree.

/** Classical elements derived from a TLE — altitude/inclination/period, no propagation needed. */
export function deriveOrbitElements(l1, l2) {
  const rec = satellite.twoline2satrec(l1, l2);
  if (!rec || rec.error) return null;
  const n = rec.no / 60; // rad/min -> rad/sec
  const a = Math.cbrt(MU / (n * n)); // semi-major axis, km (Kepler's third law)
  const inclinationDeg = (rec.inclo * 180) / Math.PI;
  const periodMin = (2 * Math.PI) / rec.no;
  // twoline2satrec doesn't reliably set rec.error for unparseable input —
  // malformed lines can silently produce NaN fields instead.
  if (![a, inclinationDeg, periodMin].every(Number.isFinite)) return null;
  return { altitudeKm: a - EARTH_KM, inclinationDeg, periodMin };
}

/**
 * Physical separation (km) between two TLE-derived objects at a shared
 * instant. Orbit-shape comparison (altitude/inclination) alone can't tell
 * "docked" from "same orbital plane, opposite side of Earth" — this can,
 * because it's a direct measurement of where each object actually is.
 */
export function separationKm(l1a, l2a, l1b, l2b, at = new Date()) {
  const recA = satellite.twoline2satrec(l1a, l2a);
  const recB = satellite.twoline2satrec(l1b, l2b);
  if (!recA || recA.error || !recB || recB.error) return null;
  const pvA = satellite.propagate(recA, at);
  const pvB = satellite.propagate(recB, at);
  if (!pvA.position || !pvB.position) return null;
  const dx = pvA.position.x - pvB.position.x;
  const dy = pvA.position.y - pvB.position.y;
  const dz = pvA.position.z - pvB.position.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return Number.isFinite(d) ? d : null;
}

/** Closest-inclination station hub within tolerance, or null if none is close enough to trust. */
export function nearestStation(inclinationDeg, stationHubs) {
  let best = null;
  let bestDelta = Infinity;
  for (const hub of stationHubs) {
    const delta = Math.abs(inclinationDeg - hub.inclinationDeg);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = hub;
    }
  }
  return best && bestDelta <= MAX_ASSOCIATION_INCLINATION_DEG ? best : null;
}

export function determinePhase(distanceKm) {
  return distanceKm != null && distanceKm <= DOCKED_DISTANCE_KM ? "docked" : "free-flying";
}

/**
 * Identifies every currently-tracked crewed capsule or cargo vehicle in a
 * batch of TLE records (typically CelesTrak's "stations" group) and
 * computes its phase/family/station association. Records are expected to
 * already carry a categorize()-derived `cat` (parseTle() does this) — only
 * records tagged "capsules" and name-matched by isStationVehicle are
 * eligible, so jettisoned hardware and co-orbiting cubesats are excluded
 * the same way the rest of the pipeline excludes them.
 */
export function buildCapsuleSnapshot(records, at = new Date()) {
  const hubs = [];
  for (const r of records) {
    const id = noradId(r.l1);
    if (!STATION_HUB_IDS.has(id)) continue;
    const el = deriveOrbitElements(r.l1, r.l2);
    if (el) hubs.push({ id, key: STATION_HUB_IDS.get(id), l1: r.l1, l2: r.l2, ...el });
  }

  const capsules = [];
  for (const r of records) {
    const id = noradId(r.l1);
    if (STATION_CORE_IDS.has(id)) continue; // station hardware itself, not a vehicle
    if (r.cat !== "capsules" || !isStationVehicle(r.name)) continue;
    // A frozen elset means the vehicle de-orbited but the feed hasn't
    // dropped it yet — treat it as absent so it lands promptly instead of
    // being tracked on a ghost orbit. Unparseable epochs count as stale.
    if ((tleAgeDays(r.l1, at) ?? Infinity) > STALE_TLE_DAYS) continue;
    const el = deriveOrbitElements(r.l1, r.l2);
    if (!el) continue;
    const hub = nearestStation(el.inclinationDeg, hubs);
    const distanceKm = hub ? separationKm(r.l1, r.l2, hub.l1, hub.l2, at) : null;
    capsules.push({
      id,
      name: r.name,
      kind: isDockedCrewVehicle(r.name) ? "crew" : "cargo",
      family: vehicleFamily(r.name),
      stationId: hub ? hub.id : null,
      stationKey: hub ? hub.key : null,
      phase: determinePhase(distanceKm),
      distanceKm: distanceKm == null ? null : Math.round(distanceKm * 10) / 10,
      altitudeKm: Math.round(el.altitudeKm * 10) / 10,
      inclinationDeg: Math.round(el.inclinationDeg * 1000) / 1000,
      l1: r.l1,
      l2: r.l2,
    });
  }
  return capsules;
}

/**
 * Advances the persisted per-capsule log by one run. Pure/side-effect-free
 * — the caller owns file I/O. Diffs a fresh snapshot against the previous
 * run's state: a phase change emits a transition event ("launched" for a
 * capsule never seen before or returning from "landed", "docked"/"undocked"
 * for a phase flip), and a capsule that's dropped out of the snapshot
 * entirely (no longer in the feed) is marked terminal "landed" and retained
 * for landedRetentionDays
 * before being pruned. On isFirstRun, state is seeded with zero events —
 * there's no prior run to have transitioned from.
 */
export function advanceCapsuleLog(previousById, snapshot, nowIso, opts = {}) {
  const { landedRetentionDays = LANDED_RETENTION_DAYS, isFirstRun = false } = opts;
  const events = [];
  const currentIds = new Set(snapshot.map((c) => c.id));
  const capsules = {};

  for (const c of snapshot) {
    const prev = previousById[c.id];
    const changed = !prev || prev.phase !== c.phase;
    if (changed && !isFirstRun) {
      // A capsule reappearing after "landed" is back on orbit (a fresh
      // elset after a feed gap, or a premature landing call) — that's a
      // launch, with completely fresh state, never a stale docked/undocked
      // continuation of its previous orbit.
      const returned = !prev || prev.phase === "landed";
      events.push({
        id: c.id,
        name: c.name,
        kind: c.kind,
        family: c.family,
        stationKey: c.stationKey,
        event: returned ? "launched" : c.phase === "docked" ? "docked" : "undocked",
        at: nowIso,
      });
    }
    capsules[c.id] = {
      name: c.name,
      kind: c.kind,
      family: c.family,
      phase: c.phase,
      stationKey: c.stationKey,
      since: changed ? nowIso : prev.since,
      distanceKm: c.distanceKm,
      altitudeKm: c.altitudeKm,
      inclinationDeg: c.inclinationDeg,
      l1: c.l1,
      l2: c.l2,
    };
  }

  const cutoffMs = new Date(nowIso).getTime() - landedRetentionDays * 86400000;
  for (const [id, prev] of Object.entries(previousById)) {
    if (currentIds.has(id)) continue;
    if (prev.phase === "landed") {
      if (new Date(prev.since).getTime() >= cutoffMs) capsules[id] = prev;
      continue;
    }
    if (!isFirstRun) {
      events.push({
        id,
        name: prev.name,
        kind: prev.kind,
        family: prev.family,
        stationKey: prev.stationKey,
        event: "landed",
        at: nowIso,
      });
    }
    // A landed capsule must carry nothing plottable — clients would render
    // its final orbit as a ghost object otherwise.
    const landed = { ...prev, phase: "landed", since: nowIso, distanceKm: null };
    delete landed.l1;
    delete landed.l2;
    capsules[id] = landed;
  }

  return { capsules, events };
}

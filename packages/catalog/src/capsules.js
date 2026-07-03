import * as satellite from "satellite.js";
import { STATION_CORE_IDS, isDockedCrewVehicle, SOYUZ_MS_RE, STARLINER_RE, SHENZHOU_RE } from "./classify.js";
import { noradId } from "./tle.js";

/**
 * Crewed-capsule phase tracking — docked / free-flying / landed — derived
 * from orbital elements rather than name matching alone. classify.js's
 * isDockedCrewVehicle() only ever says "this name looks like a crew
 * vehicle"; it has no notion of *when* that vehicle actually docked,
 * undocked, or landed. This module answers that, and is a sibling to
 * classify.js, not a replacement for it — a capsule keeps cat:"stations"
 * for its whole tracked lifetime regardless of phase; phase is additional
 * per-capsule status, never a category swap.
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

// Deliberately not a bare DRAGON pattern — that also matches uncrewed
// cargo Dragon ("DRAGON CRS-29"), which must never be tracked as a crewed
// capsule. CREW DRAGON (the generic bus name at launch) and the four
// individually-named reusable crew airframes are the only safe anchors.
const DRAGON_RE = /\bCREW DRAGON\b|\bENDEAVOUR\b|\bENDURANCE\b|\bRESILIENCE\b|\bFREEDOM\b/i;

export const CAPSULE_FAMILY_PATTERNS = [
  ["dragon", DRAGON_RE],
  ["soyuz", SOYUZ_MS_RE],
  ["starliner", STARLINER_RE],
  ["shenzhou", SHENZHOU_RE],
];

/** Which crewed-vehicle family a name belongs to, or null. */
export function capsuleFamily(name) {
  const n = name || "";
  for (const [family, re] of CAPSULE_FAMILY_PATTERNS) {
    if (re.test(n)) return family;
  }
  return null;
}

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
 * Identifies every currently-tracked crewed capsule in a batch of TLE
 * records (typically CelesTrak's "stations" group) and computes its
 * phase/family/station association. Records are expected to already carry
 * a categorize()-derived `cat` (parseTle() does this) — only records still
 * tagged "stations" and name-matched by isDockedCrewVehicle are eligible,
 * so cargo vehicles and jettisoned hardware are excluded the same way the
 * rest of the pipeline excludes them.
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
    if (STATION_CORE_IDS.has(id)) continue; // station hardware itself, not a capsule
    if (r.cat !== "stations" || !isDockedCrewVehicle(r.name)) continue;
    const el = deriveOrbitElements(r.l1, r.l2);
    if (!el) continue;
    const hub = nearestStation(el.inclinationDeg, hubs);
    const distanceKm = hub ? separationKm(r.l1, r.l2, hub.l1, hub.l2, at) : null;
    capsules.push({
      id,
      name: r.name,
      family: capsuleFamily(r.name),
      stationId: hub ? hub.id : null,
      stationKey: hub ? hub.key : null,
      phase: determinePhase(distanceKm),
      distanceKm: distanceKm == null ? null : Math.round(distanceKm * 10) / 10,
      altitudeKm: Math.round(el.altitudeKm * 10) / 10,
      inclinationDeg: Math.round(el.inclinationDeg * 1000) / 1000,
    });
  }
  return capsules;
}

/**
 * Advances the persisted per-capsule log by one run. Pure/side-effect-free
 * — the caller owns file I/O. Diffs a fresh snapshot against the previous
 * run's state: a phase change emits a transition event ("launched" for a
 * capsule never seen before, "docked"/"undocked" for a phase flip), and a
 * capsule that's dropped out of the snapshot entirely (no longer in the
 * feed) is marked terminal "landed" and retained for landedRetentionDays
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
      events.push({
        id: c.id,
        name: c.name,
        family: c.family,
        stationKey: c.stationKey,
        event: !prev ? "launched" : c.phase === "docked" ? "docked" : "undocked",
        at: nowIso,
      });
    }
    capsules[c.id] = {
      name: c.name,
      family: c.family,
      phase: c.phase,
      stationKey: c.stationKey,
      since: changed ? nowIso : prev.since,
      distanceKm: c.distanceKm,
      altitudeKm: c.altitudeKm,
      inclinationDeg: c.inclinationDeg,
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
        family: prev.family,
        stationKey: prev.stationKey,
        event: "landed",
        at: nowIso,
      });
    }
    capsules[id] = { ...prev, phase: "landed", since: nowIso, distanceKm: null };
  }

  return { capsules, events };
}

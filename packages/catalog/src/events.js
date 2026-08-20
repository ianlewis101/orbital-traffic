import { noradId, launchDesignator } from "./tle.js";

/**
 * "Today in Space" event diffing — the two event types that have no other
 * home. Docking/undocking/landing already comes for free from
 * capsules.js's advanceCapsuleLog() (capsule-status.json's own `events`
 * log); this module covers the other two v1 event types: new launches and
 * re-entries/decays across the whole catalog, and crew roster changes.
 */

/** Hard ceiling on each persisted event log — same spirit as capsules.js's MAX_EVENTS. */
export const MAX_LAUNCH_REENTRY_EVENTS = 200;
export const MAX_CREW_EVENTS = 200;

/**
 * Diffs two full-catalog record snapshots by NORAD ID, grouping newly-
 * appeared objects by shared launch (see launchDesignator()) so a 23-
 * satellite Starlink batch becomes one event, not 23.
 *
 * Capsule-tracked vehicles (r.cat === "capsules") are excluded on both
 * sides — a crewed capsule or cargo vehicle's launch/landing is already
 * reported, with richer context (kind, family, station), by
 * advanceCapsuleLog()'s event log. Without this exclusion the same real
 * launch or landing would show up twice under two different, conflicting
 * labels (e.g. a Dragon splashdown as both "LANDED" from the capsule log
 * and "DEORBITED" here, which is actively wrong — a recovered capsule
 * didn't burn up). Same style of hard exclusion as astro/overhead.js's
 * OVERHEAD_EXCLUDED_CATS.
 *
 * @param {{name:string,l1:string,cat:string}[]} previousRecords  yesterday's catalog
 * @param {{name:string,l1:string,cat:string}[]} currentRecords   today's merged catalog
 * @param {string} nowIso
 * @returns {Array} launch/reentry events, newest-batch-first is not
 *   guaranteed — callers sort by `at` if order matters (all events from one
 *   run share the same `at`, so this rarely matters in practice).
 */
export function diffLaunchesReentries(previousRecords, currentRecords, nowIso) {
  const trackable = (r) => r.cat !== "capsules";
  const prevRecs = previousRecords.filter(trackable);
  const currRecs = currentRecords.filter(trackable);

  const prevById = new Map(prevRecs.map((r) => [noradId(r.l1), r]));
  const currById = new Map(currRecs.map((r) => [noradId(r.l1), r]));

  const newRecs = currRecs.filter((r) => !prevById.has(noradId(r.l1)));
  const goneIds = [...prevById.keys()].filter((id) => !currById.has(id));

  const events = [];

  const batches = new Map();
  for (const r of newRecs) {
    const key = launchDesignator(r.l1) || noradId(r.l1);
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(r);
  }
  for (const recs of batches.values()) {
    events.push({
      type: "launch",
      at: nowIso,
      ids: recs.map((r) => noradId(r.l1)),
      count: recs.length,
      name: recs[0].name,
      cat: recs[0].cat,
    });
  }

  for (const id of goneIds) {
    const r = prevById.get(id);
    events.push({ type: "reentry", at: nowIso, id, name: r.name, cat: r.cat });
  }

  return events;
}

/**
 * Diffs a persisted crew roster snapshot against a fresh /crew read,
 * matched by astronaut id (falling back to name when id is absent — the
 * Worker's own buildCrew() dedupe uses the same fallback). Returns the
 * fresh roster to persist plus one event per arrival/departure.
 *
 * @param {{id:string|number|null,name:string,craft:string}[]} previousPeople
 * @param {{id:string|number|null,name:string,craft:string}[]} freshPeople
 * @param {string} nowIso
 */
export function diffCrewRoster(previousPeople, freshPeople, nowIso) {
  const key = (p) => String(p.id ?? p.name);
  const prevByKey = new Map(previousPeople.map((p) => [key(p), p]));
  const freshByKey = new Map(freshPeople.map((p) => [key(p), p]));

  const events = [];
  for (const [k, p] of freshByKey) {
    if (!prevByKey.has(k)) {
      events.push({ type: "crew", at: nowIso, id: p.id, name: p.name, craft: p.craft, direction: "arrived" });
    }
  }
  for (const [k, p] of prevByKey) {
    if (!freshByKey.has(k)) {
      events.push({ type: "crew", at: nowIso, id: p.id, name: p.name, craft: p.craft, direction: "departed" });
    }
  }

  return { roster: freshPeople, events };
}

import * as satellite from "satellite.js";
import { designatorBatch, designatorYear } from "./tle.js";

/**
 * Launch-chain ("Starlink train") detection.
 *
 * A constellation launch delivers 20-30 satellites into one low parking
 * orbit at once. For the first days to weeks afterwards they fly as a single
 * string of pearls — same plane, a few degrees apart — before each raises
 * itself to its operational shell and the string dissolves. That string is
 * what people photograph from the ground and search for by name, and it is
 * what this module finds in the live catalog so the app can draw and track
 * the whole chain rather than one satellite from it.
 *
 * This is deliberately NOT classification: a chain member keeps its ordinary
 * category ("starlink"/"oneweb"/"kuiper") and nothing here writes to `cat`.
 * A chain is a transient geometric arrangement of already-classified objects,
 * derived fresh from live elements on every sync, the same way capsules.js
 * derives docking phase without touching categories (Critical Rule #2).
 *
 * ── HOW A CHAIN IS RECOGNISED ────────────────────────────────────────────
 * Every threshold below was measured against the real ~19,200-object catalog
 * (2026-09-03 elements, 12,132 constellation objects in 452 launch groups),
 * not estimated. Four independent tests, each removing a specific false
 * positive that the others let through:
 *
 *   1. Same launch (shared international-designator batch), recent enough
 *      that a train is physically possible. Without the year test a batch of
 *      retiring satellites descending together — low, coplanar, bunched —
 *      would read as a launch train, which is the opposite of the truth.
 *   2. Still below its constellation's operational shell. Measured: the
 *      trains sat 125-186 km below their category median (279-341 km against
 *      Starlink's 465 km); every fully-raised launch group sat within 5 km of
 *      it. This is what "hasn't finished climbing yet" looks like in the data.
 *   3. Still coplanar. Members are kept only while within
 *      MAX_PLANE_DEVIATION_DEG of the group's median orbital plane: measured
 *      0.03-0.11 deg for real trains against 1.8-85 deg for dispersed groups,
 *      whose satellites have long since been walked into separate planes.
 *   4. Still bunched. The occupied arc (360 deg minus the largest empty gap)
 *      divided by the gaps within it — mean spacing — must be at most
 *      MAX_CHAIN_SPACING_DEG. Measured 3.7-7.6 deg for real trains; the
 *      nearest non-train was 10.5, operational planes sit at 11.6, and the
 *      Direct-to-Cell shell (which passes test 2 on altitude alone) at 27-30.
 *
 * Test 4 is stated as mean spacing over the whole occupied arc rather than as
 * "the longest unbroken run of members" on purpose. A run-based rule cuts at
 * whichever single gap happens to sit either side of the threshold, so the
 * reported member count jumped between 26 and 16 over three hours of the same
 * train; the arc measure moved by 2 deg over the same window and reported the
 * same 28 members for two weeks. Stability matters here because this feeds a
 * count the user reads on screen and re-runs on every live sync.
 */

// Same constants apps/web/src/astro/orbital.js uses, duplicated rather than
// imported for the same reason capsules.js duplicates them: packages/catalog
// has no dependency on apps/web.
const MU = 398600.4418; // km^3/s^2
const EARTH_KM = 6371;
const DEG = 180 / Math.PI;

/**
 * Categories a chain can form in. Restricted to the three constellations that
 * actually launch in batches, which also keeps two whole classes of false
 * positive out by construction: a debris field from a breakup shares its
 * parent's designator and is perfectly coplanar and bunched for months (it
 * would be the single strongest "chain" in the catalog, and calling it a
 * launch train would be flatly wrong), and a rideshare's 100 unrelated
 * cubesats share a designator without being one operator's constellation.
 */
export const CHAIN_CATS = ["starlink", "oneweb", "kuiper"];

/** Fewest members that read as a chain rather than a handful of neighbours. */
export const MIN_CHAIN_MEMBERS = 8;
/** Mean degrees between consecutive members, across the occupied arc (test 4). */
export const MAX_CHAIN_SPACING_DEG = 8;
/** How far below the category's median altitude the group must still be (test 2). */
export const MIN_BELOW_SHELL_KM = 80;
/** Out-of-plane angle a member may have from the group's median plane (test 3). */
export const MAX_PLANE_DEVIATION_DEG = 1;
/**
 * Calendar years back a launch may be and still be considered (test 1).
 * Raising takes weeks, so 1 is already generous — it exists to be robust
 * across a New Year boundary, not to widen the window.
 */
export const MAX_CHAIN_LAUNCH_AGE_YEARS = 1;

const V = {
  cross: (a, b) => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }),
  dot: (a, b) => a.x * b.x + a.y * b.y + a.z * b.z,
  unit: (a) => {
    const m = Math.hypot(a.x, a.y, a.z);
    return m > 0 ? { x: a.x / m, y: a.y / m, z: a.z / m } : null;
  },
};

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Circular-orbit altitude implied by a satrec's mean motion, in km. */
export function meanAltitudeKm(rec) {
  const n = rec && Number.isFinite(rec.no) ? rec.no / 60 : NaN; // rad/s
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.cbrt(MU / (n * n)) - EARTH_KM;
}

/** Orbital period in minutes from a satrec's mean motion. */
function periodMin(rec) {
  const p = rec && Number.isFinite(rec.no) && rec.no > 0 ? (2 * Math.PI) / rec.no : null;
  return Number.isFinite(p) ? p : null;
}

function propagate(rec, date) {
  try {
    const pv = satellite.propagate(rec, date);
    if (!pv || !pv.position || !pv.velocity) return null;
    if (!Number.isFinite(pv.position.x) || !Number.isFinite(pv.velocity.x)) return null;
    return pv;
  } catch {
    return null;
  }
}

/**
 * Find every launch chain currently visible in a catalog.
 *
 * @param {{id:string,name:string,cat:string,desig?:string,rec:object}[]} objects
 *   Catalog objects carrying a parsed satrec (`rec`) and their international
 *   designator as `desig` (satellite.js v5's satrec no longer carries one, so
 *   the caller reads it off TLE line 1 — apps/web's ingest() does this; the
 *   satrec's own `intldesg` is still accepted where a parser provides it).
 *   Anything without a satrec or a designator, or outside CHAIN_CATS, is
 *   ignored.
 * @param {Date} now  Wall-clock time — chains are a live property of the real
 *   catalog, so callers must NOT pass a time-machine/simulated time here (the
 *   same reason ingest()'s prune guard uses real now).
 * @returns {Array<{
 *   key:string, cat:string, launch:string, launchLabel:string,
 *   ids:string[], count:number, leadId:string, leadName:string,
 *   arcDeg:number, spacingDeg:number, spacingKm:number, spacingSeconds:number,
 *   lengthKm:number, altitudeKm:number, belowShellKm:number,
 *   periodMin:number, inclinationDeg:number
 * }>} Tightest chain first. `ids` runs along the direction of travel, so the
 *   last entry (`leadId`) is the satellite at the front of the train.
 */
export function detectChains(objects, now = new Date()) {
  const cats = new Set(CHAIN_CATS);
  const nowYear = now.getUTCFullYear();

  // Pass 1: candidates + the altitude of every constellation object, so each
  // category's operational shell can be read off its own median rather than
  // hardcoded per constellation (which would go stale the first time an
  // operator adds a shell).
  const altByCat = new Map();
  const groups = new Map();
  for (const o of objects) {
    if (!o || !o.rec || !cats.has(o.cat)) continue;
    const alt = meanAltitudeKm(o.rec);
    if (alt == null) continue;
    if (!altByCat.has(o.cat)) altByCat.set(o.cat, []);
    altByCat.get(o.cat).push(alt);

    const launch = designatorBatch(o.desig ?? o.rec.intldesg);
    if (!launch) continue;
    const key = `${o.cat}:${launch}`;
    if (!groups.has(key)) groups.set(key, { cat: o.cat, launch, members: [] });
    groups.get(key).members.push({ obj: o, alt });
  }

  const shellByCat = new Map();
  for (const [cat, alts] of altByCat) shellByCat.set(cat, median(alts));

  const chains = [];
  for (const [key, group] of groups) {
    const chain = analyzeGroup(key, group, shellByCat.get(group.cat), now, nowYear);
    if (chain) chains.push(chain);
  }
  // Tightest first: the closer together the satellites still are, the more
  // this reads (and photographs) as a train.
  return chains.sort((a, b) => a.spacingDeg - b.spacingDeg);
}

function analyzeGroup(key, { cat, launch, members }, shellKm, now, nowYear) {
  // --- test 1: one recent launch, big enough to form a train --------------
  if (members.length < MIN_CHAIN_MEMBERS) return null;
  const year = designatorYear(launch);
  if (year == null || year < nowYear - MAX_CHAIN_LAUNCH_AGE_YEARS) return null;

  // --- test 2: still below the constellation's operational shell ----------
  const altitudeKm = median(members.map((m) => m.alt));
  if (shellKm == null || altitudeKm == null) return null;
  const belowShellKm = shellKm - altitudeKm;
  if (belowShellKm < MIN_BELOW_SHELL_KM) return null;

  const props = [];
  for (const m of members) {
    const pv = propagate(m.obj.rec, now);
    if (pv) props.push({ obj: m.obj, r: pv.position, v: pv.velocity });
  }
  if (props.length < MIN_CHAIN_MEMBERS) return null;

  // --- test 3: still one plane -------------------------------------------
  // Median of the members' angular-momentum directions, so a single stray
  // member can't tilt the reference plane the others are measured against.
  const hs = [];
  for (const p of props) {
    const h = V.unit(V.cross(p.r, p.v));
    if (h) hs.push(h);
  }
  if (hs.length < MIN_CHAIN_MEMBERS) return null;
  const hRef = V.unit({
    x: median(hs.map((h) => h.x)),
    y: median(hs.map((h) => h.y)),
    z: median(hs.map((h) => h.z)),
  });
  if (!hRef) return null;

  const coplanar = [];
  for (const p of props) {
    const u = V.unit(p.r);
    if (!u) continue;
    const dev = Math.asin(Math.min(1, Math.abs(V.dot(u, hRef)))) * DEG;
    if (dev <= MAX_PLANE_DEVIATION_DEG) coplanar.push({ ...p, u });
  }
  if (coplanar.length < MIN_CHAIN_MEMBERS) return null;

  // --- test 4: still bunched ---------------------------------------------
  // Phase measured in the shared plane from an arbitrary member. y0 is the
  // direction of travel there (v is along h x r for a near-circular orbit),
  // so increasing phase runs along the train from tail to head.
  const x0 = coplanar[0].u;
  const y0 = V.unit(V.cross(hRef, x0));
  if (!y0) return null;
  for (const p of coplanar) {
    p.phase = (Math.atan2(V.dot(p.u, y0), V.dot(p.u, x0)) * DEG + 360) % 360;
  }
  coplanar.sort((a, b) => a.phase - b.phase);

  const n = coplanar.length;
  let gapIdx = 0;
  let gapDeg = -1;
  for (let i = 0; i < n; i++) {
    const g = (coplanar[(i + 1) % n].phase - coplanar[i].phase + 360) % 360;
    if (g > gapDeg) {
      gapDeg = g;
      gapIdx = i;
    }
  }
  // The chain is everything except the largest empty stretch of orbit: start
  // just after that gap and walk forward, so members come out tail-first in
  // flight order and the drawn line never has to jump across the gap.
  const ordered = [];
  for (let k = 1; k <= n; k++) ordered.push(coplanar[(gapIdx + k) % n]);

  const arcDeg = 360 - gapDeg;
  const spacingDeg = arcDeg / (n - 1);
  if (spacingDeg > MAX_CHAIN_SPACING_DEG) return null;

  const lead = ordered[ordered.length - 1];
  const period = periodMin(lead.obj.rec);
  const circumferenceKm = 2 * Math.PI * (EARTH_KM + altitudeKm);
  return {
    key,
    cat,
    launch,
    launchLabel: year != null ? `${year}-${launch.slice(2)}` : launch,
    ids: ordered.map((p) => p.obj.id),
    count: n,
    leadId: lead.obj.id,
    leadName: lead.obj.name,
    arcDeg,
    spacingDeg,
    spacingKm: (spacingDeg / 360) * circumferenceKm,
    spacingSeconds: period ? (spacingDeg / 360) * period * 60 : null,
    lengthKm: (arcDeg / 360) * circumferenceKm,
    altitudeKm,
    belowShellKm,
    periodMin: period,
    inclinationDeg: Number.isFinite(lead.obj.rec.inclo) ? lead.obj.rec.inclo * DEG : null,
  };
}

import * as THREE from "three";
import { CATS, KM_U } from "../config.js";
import { safeProp } from "../astro/propagation.js";
import { scene } from "./core.js";
import { makeShapeTextures } from "./clouds.js";
import { orbitRingPoints } from "./trail.js";

/**
 * The scene half of chain tracking: every member of a launch chain lit at
 * once, joined head to tail, on its shared orbit.
 *
 * Three layers, drawn in their own objects rather than by touching the
 * category point clouds:
 *   - the link line through the members, in flight order — the chain itself;
 *   - a white dot per member over a wider halo in the category's own colour,
 *     drawn on top of whatever the cloud already draws (so a chain stays
 *     visible even when its category is switched off in the legend, which is
 *     exactly what a user tapping a Starlink train with Starlink hidden
 *     expects);
 *   - the shared orbit ring, for the arc the string hasn't reached yet.
 *
 * Every layer keeps depth testing, so a chain on the far side of the globe is
 * hidden by it exactly as the clouds and the selection marker are — the
 * camera is aimed at the chain's midpoint on selection, so the part that
 * matters is always facing the viewer.
 *
 * Members are propagated here rather than read from `_p`: clouds.js's
 * updatePositions() is round-robin budgeted and skips hidden categories, so
 * `_p` can be several seconds stale or frozen at the origin — fine for a
 * 4-pixel dot in a 19,000-object cloud, not for a line drawn between 28 of
 * them, where one stale member visibly kinks the chain.
 */

// A near-white link line reads as "these belong together" against every
// category colour without competing with the member dots, which stay their
// own category's colour so the chain still says what it's made of.
const LINK_COLOR = 0xdff1ff;
const RING_COLOR = 0x8fa8c4;
/** Sim-time drift before the orbit ring is re-sampled (it precesses). */
const RING_REFRESH_MIN = 10;

let group = null;
let members = [];
let linkAttr = null;
let dotAttr = null;
let haloAttr = null;
let ringSimMs = 0;
let ringLine = null;
let ringCat = "other";

export function clearChainOverlay() {
  if (group) {
    scene.remove(group);
    group.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
  }
  group = null;
  members = [];
  linkAttr = dotAttr = haloAttr = null;
  ringLine = null;
}

function pointsLayer(count, color, size, opacity, texture) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  // Same pre-seeded bounding sphere clouds.js's makeCloudGeometry() uses, and
  // for the same reason: positions start zeroed and are filled in on the next
  // tick, so a lazily computed sphere would be degenerate.
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 4000);
  const m = new THREE.PointsMaterial({
    size,
    sizeAttenuation: false,
    color,
    map: texture,
    transparent: true,
    depthWrite: false,
    alphaTest: 0.02,
    opacity,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return p;
}

/**
 * (Re)build the overlay for one chain.
 * @param {object[]} sats  chain members, tail-first (detectChains() order)
 * @param {string} cat     the chain's category, for the dot colour
 * @param {Date} date      sim time to draw the first frame at
 */
export function buildChainOverlay(sats, cat, date) {
  clearChainOverlay();
  if (!sats || sats.length < 2) return;
  members = sats;
  ringCat = cat;
  const color = (CATS[cat] || CATS.other).color;
  const px = (CATS[cat] || CATS.other).px;
  const texture = makeShapeTextures()[cat] || makeShapeTextures().other;

  group = new THREE.Group();

  const linkGeom = new THREE.BufferGeometry();
  linkGeom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(sats.length * 3), 3));
  linkGeom.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 4000);
  const link = new THREE.Line(
    linkGeom,
    new THREE.LineBasicMaterial({ color: LINK_COLOR, transparent: true, opacity: 0.75 })
  );
  link.frustumCulled = false;
  linkAttr = linkGeom.attributes.position;

  const halo = pointsLayer(sats.length, color, px + 9, 0.22, texture);
  const dots = pointsLayer(sats.length, 0xffffff, px + 3, 0.95, texture);
  haloAttr = halo.geometry.attributes.position;
  dotAttr = dots.geometry.attributes.position;

  group.add(halo, link, dots);
  scene.add(group);
  buildRing(date);
  updateChainOverlay(date);
}

function buildRing(date) {
  if (!group) return;
  if (ringLine) {
    group.remove(ringLine);
    ringLine.geometry.dispose();
    ringLine.material.dispose();
    ringLine = null;
  }
  // Any member's orbit is the chain's orbit — they're coplanar by
  // construction (detectChains()' plane test), so the middle one is as good a
  // sample as any and is the least likely to have started raising away first.
  const pts = orbitRingPoints(members[Math.floor(members.length / 2)], date);
  if (pts.length < 2) return;
  ringLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: RING_COLOR, transparent: true, opacity: 0.28 })
  );
  ringLine.frustumCulled = false;
  group.add(ringLine);
  ringSimMs = date.getTime();
}

/** Per-frame refresh. No-op when no chain is selected. */
export function updateChainOverlay(date) {
  if (!group || !members.length) return;
  const link = linkAttr.array,
    dot = dotAttr.array,
    halo = haloAttr.array;
  let drawn = 0;
  for (let i = 0; i < members.length; i++) {
    const p = safeProp(members[i].rec, date);
    // A member that fails to propagate (decayed, bad elset) drops out of the
    // line rather than pinning it to the origin: the remaining members close
    // up and the drawn range shrinks by one.
    if (!p) continue;
    const j = drawn * 3;
    link[j] = dot[j] = halo[j] = p.x / KM_U;
    link[j + 1] = dot[j + 1] = halo[j + 1] = p.z / KM_U;
    link[j + 2] = dot[j + 2] = halo[j + 2] = p.y / KM_U;
    drawn++;
  }
  linkAttr.needsUpdate = dotAttr.needsUpdate = haloAttr.needsUpdate = true;
  for (const child of group.children) {
    if (child === ringLine) continue;
    child.geometry.setDrawRange(0, drawn);
  }
  if (Math.abs(date.getTime() - ringSimMs) > RING_REFRESH_MIN * 60000) buildRing(date);
}

/** Scene-space centre of the drawn chain, for camera framing. Null if empty. */
export function chainCenterEci(date) {
  if (!members.length) return null;
  return safeProp(members[Math.floor(members.length / 2)].rec, date);
}

// Exposed for tests: the overlay's derived state without reaching into module
// scope from outside.
export const _test = {
  get group() {
    return group;
  },
  get members() {
    return members;
  },
  get ringCat() {
    return ringCat;
  },
};

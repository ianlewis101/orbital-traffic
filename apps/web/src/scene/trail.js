import * as THREE from "three";
import { KM_U } from "../config.js";
import { safeProp } from "../astro/propagation.js";
import { scene } from "./core.js";

let trailRing = null;

export function clearTrail() {
  if (trailRing) {
    scene.remove(trailRing);
    trailRing.geometry.dispose();
    trailRing.material.dispose();
    trailRing = null;
  }
}

/**
 * Show/hide the ring without destroying it.
 *
 * The share capture draws the orbit in its own 2D pass (WebGL ignores
 * `linewidth`, so this ring is always a hairline — far too thin to read in a
 * 1080px-wide export) and hides this one for the duration, so the two don't
 * overlay each other along the same curve.
 */
export function setTrailVisible(v) {
  if (trailRing) trailRing.visible = v;
}

/**
 * Sample one full orbit as world-space points. Shared by the scene ring and
 * the share card's 2D ring so the two can never trace different curves.
 */
export function orbitRingPoints(sat, date, segments = 200) {
  if (!sat || !sat.rec) return [];
  const no = sat.rec.no;
  if (!no || no <= 0) return [];
  const periodMin = (2 * Math.PI) / no;

  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = new Date(date.getTime() + (i / segments) * periodMin * 60000);
    const pv = safeProp(sat.rec, t);
    if (!pv) continue;
    pts.push(new THREE.Vector3(pv.x / KM_U, pv.z / KM_U, pv.y / KM_U));
  }
  return pts;
}

/** Draw the selected object's full orbit ring for the given date. */
export function buildTrail(sat, date) {
  clearTrail();
  const ringPts = orbitRingPoints(sat, date);
  if (ringPts.length < 2) return;
  const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPts);
  const ringMat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.8,
    linewidth: 1,
  });
  trailRing = new THREE.Line(ringGeo, ringMat);
  trailRing.frustumCulled = false;
  scene.add(trailRing);
}

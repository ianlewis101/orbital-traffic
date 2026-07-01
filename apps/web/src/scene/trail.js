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

/** Draw the selected object's full orbit ring for the given date. */
export function buildTrail(sat, date) {
  clearTrail();
  if (!sat || !sat.rec) return;
  const no = sat.rec.no;
  if (!no || no <= 0) return;
  const periodMin = (2 * Math.PI) / no;

  const RING_N = 200,
    ringPts = [];
  for (let i = 0; i <= RING_N; i++) {
    const t = new Date(date.getTime() + (i / RING_N) * periodMin * 60000);
    const pv = safeProp(sat.rec, t);
    if (!pv) continue;
    ringPts.push(new THREE.Vector3(pv.x / KM_U, pv.z / KM_U, pv.y / KM_U));
  }
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

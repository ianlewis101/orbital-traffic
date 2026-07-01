import * as THREE from "three";
import { EARTH_R, KM_U } from "../config.js";
import { state, $ } from "../state.js";
import { renderer, camera } from "./core.js";

const _v = new THREE.Vector3();

/** Is a world point behind the Earth from the camera? */
function occluded(world) {
  const camP = camera.position;
  const dir = _v.copy(world).sub(camP);
  const len = dir.length();
  dir.normalize();
  // closest approach of ray to origin
  const t = -camP.dot(dir);
  if (t < 0 || t > len) return false;
  const closest = camP.clone().add(dir.multiplyScalar(t));
  return closest.length() < EARTH_R * 0.998;
}

/** Position the on-screen selection ring over the selected object. */
export function updateSelMarker() {
  const selMarker = $("#sel-marker");
  const s = state.selected;
  if (!s || !s.alive || !s._p) {
    selMarker.style.display = "none";
    return;
  }
  const world = new THREE.Vector3(s._p.x / KM_U, s._p.z / KM_U, s._p.y / KM_U);
  if (occluded(world)) {
    selMarker.style.display = "none";
    return;
  }
  _v.copy(world).project(camera);
  if (_v.z > 1) {
    selMarker.style.display = "none";
    return;
  }
  const rc = renderer.domElement.getBoundingClientRect();
  selMarker.style.display = "block";
  selMarker.style.left = rc.left + (_v.x * 0.5 + 0.5) * rc.width + "px";
  selMarker.style.top = rc.top + (-_v.y * 0.5 + 0.5) * rc.height + "px";
}

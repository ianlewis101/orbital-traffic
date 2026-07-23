import * as THREE from "three";
import { EARTH_R } from "../config.js";

// Reused across picks so a pointer event never allocates. earthOcclusionDist
// resets the radius every call, so tests can pass their own Earth size.
const _earthSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), EARTH_R);
const _entry = new THREE.Vector3();

/**
 * How far along a pick ray the opaque globe starts blocking the view: the
 * distance from the ray origin to where the ray first enters Earth's sphere,
 * or Infinity when the ray misses the globe entirely (open sky beside it).
 * Any point whose along-ray projection lies past this is hidden behind Earth.
 * The camera rig is always clamped outside the globe (see core.js), so the
 * sphere entry point is the near face.
 *
 * Accepts either a THREE.Raycaster (uses its `.ray`) or a bare THREE.Ray.
 */
export function earthOcclusionDist(raycaster, earthR = EARTH_R) {
  _earthSphere.radius = earthR;
  const r = raycaster.ray || raycaster;
  return r.intersectSphere(_earthSphere, _entry) ? r.origin.distanceTo(_entry) : Infinity;
}

/**
 * A satellite skimming just above the near surface can project a hair past the
 * computed entry point; this tolerance (world units, ~100 km) keeps it
 * pickable while still rejecting anything genuinely behind the globe — the far
 * side sits a full Earth-diameter deeper, so no near-side object comes close.
 */
export const PICK_SURFACE_EPS = 0.1;

/**
 * Choose the object the user is aiming at from every visible category's
 * raycast hits. For each cloud we take the front-most hit that is NOT hidden
 * behind the globe, then across clouds we keep the one closest to the pick ray
 * (smallest distanceToRay). The occlusion filter is what stops a click over
 * the globe from selecting an object on the far side — Points raycasting is
 * depth-unaware and will happily report a satellite behind Earth as a hit.
 *
 * Pure over its inputs so the selection logic is unit-testable without a live
 * renderer: `cloudEntries` is an array of `{ points, list }` (a THREE.Points
 * and the parallel satellite array), and `neo` is an optional
 * `{ points, sats }` layer handled the same way.
 */
export function resolvePick(ray, cloudEntries, neo, earthR = EARTH_R) {
  const occ = earthOcclusionDist(ray, earthR);
  const maxVisible = occ + PICK_SURFACE_EPS;
  let best = null,
    bd = 1e9;
  const consider = (points, indexToObj) => {
    if (!points || !points.visible) return;
    const hits = ray.intersectObject(points);
    for (const h of hits) {
      if (h.distance > maxVisible) continue; // behind the globe — not visible
      if (h.distanceToRay < bd) {
        bd = h.distanceToRay;
        best = indexToObj(h.index);
      }
      break; // hits are sorted near→far; the first un-occluded one is front-most
    }
  };
  for (const cl of cloudEntries) {
    if (!cl.list || !cl.list.length) continue;
    consider(cl.points, (i) => cl.list[i]);
  }
  if (neo && neo.sats && neo.sats.length) consider(neo.points, (i) => neo.sats[i] || null);
  return best;
}

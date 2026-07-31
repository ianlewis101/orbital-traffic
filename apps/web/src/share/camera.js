/**
 * Camera framing for the share card.
 *
 * The live camera can't be reused: scene/core.js's `cam` rig is smoothed
 * (applyCam() lerps toward its targets every frame) and frameSelected() only
 * sets those targets, so a capture taken right after it would catch the camera
 * mid-flight. This builds a throwaway PerspectiveCamera and positions it
 * analytically instead, so the framing is identical every time.
 */
import * as THREE from "three";
import { EARTH_R, KM_U } from "../config.js";
import { SHARE_W, SHARE_H, VIEW_SHIFT } from "./layout.js";

/**
 * Angular offsets (radians) tried in order when placing the camera, largest
 * first.
 *
 * Looking straight down an object's own radius vector — what frameSelected()
 * does for the live "centre on globe" view — collapses its orbit ring into a
 * near-straight line, because the ring is then seen edge-on. Swinging the
 * camera off that axis renders the ring as an open ellipse, which is what
 * makes the orbit legible in a still image. The smaller offsets are fallbacks
 * for the geometry where a big swing would push the object out of frame or
 * behind the Earth (very low orbits especially).
 */
export const THETA_OFFSETS = [0.55, 0.42, 0.3, 0.18, 0.08, 0];

/**
 * Latitude offsets (radians) tried alongside the longitude ones, pushing the
 * camera toward the nearer pole.
 *
 * Swinging in longitude alone isn't enough for the common case: a camera
 * sitting near the orbit's own plane sees the ring almost edge-on no matter
 * how far round it moves, which is why an inclined LEO orbit can still export
 * as a near-straight line. Lifting the camera out of that plane is what
 * actually opens the ellipse.
 */
export const PHI_OFFSETS = [0.42, 0.28, 0.14, 0];

/** Offset pairs in preference order — biggest, most open framing first. */
export const CANDIDATES = PHI_OFFSETS.flatMap((p) => THETA_OFFSETS.map((t) => [t, p]));

/** Where the subject is allowed to land, in normalised output coordinates. */
export const SAFE_BOX = { x0: 0.12, x1: 0.88, y0: 0.1, y1: 0.46 };

/** ECI km → world units, matching the mapping clouds.js and trail.js use. */
export function eciToWorld(p, out = new THREE.Vector3()) {
  return out.set(p.x / KM_U, p.z / KM_U, p.y / KM_U);
}

/**
 * Spherical camera pose for an ECI position, with `thetaOffset` swung off the
 * object's own direction. Pure — the angle convention matches
 * scene/core.js's applyCam()/frameSelected().
 */
export function sharePose(eci, thetaOffset = 0, phiOffset = 0) {
  const mag = Math.hypot(eci.x, eci.y, eci.z) || 1;
  // Pulled back further than the live view's EARTH_R * 2.2 so the Earth's limb
  // and a useful arc of the orbit both stay in a portrait frame.
  const r = Math.max(EARTH_R * 1.9, Math.min(mag / KM_U + EARTH_R * 2.6, 140));
  const theta = Math.atan2(eci.x, eci.y) + thetaOffset;
  const raw = Math.acos(Math.max(-1, Math.min(1, eci.z / mag)));
  // Push toward whichever pole is nearer — that's the direction that lifts the
  // camera out of the orbit plane and opens the ring.
  const toward = raw <= Math.PI / 2 ? -1 : 1;
  // Keep off the poles themselves: a top-down view loses the limb that makes
  // the globe read as a sphere.
  const phi = Math.max(0.42, Math.min(Math.PI - 0.42, raw + toward * phiOffset));
  return { r, theta, phi };
}

/** World-space camera position for a pose. Pure. */
export function poseToPosition(pose, out = new THREE.Vector3()) {
  const sp = Math.sin(pose.phi);
  return out.set(
    pose.r * sp * Math.sin(pose.theta),
    pose.r * Math.cos(pose.phi),
    pose.r * sp * Math.cos(pose.theta)
  );
}

/** Is `world` hidden behind the Earth from `camPos`? Mirrors marker.js. */
export function occludedByEarth(camPos, world) {
  const dir = world.clone().sub(camPos);
  const len = dir.length();
  if (!len) return false;
  dir.normalize();
  const t = -camPos.dot(dir);
  if (t < 0 || t > len) return false;
  const closest = camPos.clone().add(dir.multiplyScalar(t));
  return closest.length() < EARTH_R * 0.999;
}

/** Project a world point to normalised [0,1] card coordinates. */
export function projectToCard(camera, world) {
  const v = world.clone().project(camera);
  return { x: v.x * 0.5 + 0.5, y: -v.y * 0.5 + 0.5, z: v.z };
}

function configure(camera, pose) {
  poseToPosition(pose, camera.position);
  camera.lookAt(0, 0, 0);
  // The virtual frame is taller than the output and the rendered window is
  // taken from its bottom, which lifts the globe into the upper part of the
  // card so the text block below sits over empty space rather than over the
  // planet.
  const fullH = SHARE_H + VIEW_SHIFT;
  camera.aspect = SHARE_W / fullH;
  camera.setViewOffset(SHARE_W, fullH, 0, VIEW_SHIFT, SHARE_W, SHARE_H);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

/**
 * Build and position the share camera for an object at ECI position `eci`,
 * choosing the largest angular offset that still leaves the subject inside
 * SAFE_BOX and in front of the Earth. Falls back to the last offset if none
 * qualifies, so this always returns a usable camera.
 */
export function frameShareCamera(eci) {
  const camera = new THREE.PerspectiveCamera(45, SHARE_W / SHARE_H, 0.5, 4000);
  const world = eciToWorld(eci);
  let last = null;

  for (const [t, ph] of CANDIDATES) {
    const pose = sharePose(eci, t, ph);
    configure(camera, pose);
    last = pose;
    const p = projectToCard(camera, world);
    if (p.z > 1) continue;
    if (occludedByEarth(camera.position, world)) continue;
    if (p.x < SAFE_BOX.x0 || p.x > SAFE_BOX.x1) continue;
    if (p.y < SAFE_BOX.y0 || p.y > SAFE_BOX.y1) continue;
    return { camera, pose, subject: p };
  }

  configure(camera, last);
  return { camera, pose: last, subject: projectToCard(camera, world) };
}

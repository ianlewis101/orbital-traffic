import * as THREE from "three";
import { EARTH_R, KM_U } from "../config.js";
import { state } from "../state.js";

// The original app was authored against three r128 (pre color-management);
// keep legacy linear output so the hand-tuned palette renders unchanged.
THREE.ColorManagement.enabled = false;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x08070b);

export let renderer = null;

/** Create the WebGL renderer; returns false if WebGL is unavailable. */
export function initRenderer(container) {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "default" });
  } catch {
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false });
    } catch {
      return false;
    }
  }
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  container.appendChild(renderer.domElement);
  return true;
}

export const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 4000);

// --- camera rig (custom orbit controls) ---
export const cam = {
  r: EARTH_R * 4.2,
  theta: 0.7,
  phi: 1.15,
  rT: EARTH_R * 4.2,
  thT: 0.7,
  phT: 1.15,
};

// --- zoom range ---
//
// Closest approach. EARTH_R * 1.25 puts the camera ~1,600 km above the
// surface, which is what makes LEO traffic visibly move against the globe in
// real time: the ISS passes within ~1.2 units of the eye there, so its
// angular rate is large. This floor is aspect-INDEPENDENT on purpose — see
// maxCamR() below.
export const MIN_CAM_R = EARTH_R * 1.25;

// Furthest retreat. camera.fov applies to the VERTICAL axis, so on a narrow
// portrait viewport the implied horizontal FOV is much tighter than 45° —
// wide, near-equatorial features (the GEO ring, ~42 units across) clip off
// the left and right edges even at full zoom-out, with no way to pull back
// further. Portrait screens therefore get a proportionally higher ceiling;
// landscape/square (aspect >= 1) keeps the original 160.
//
// This compensation belongs on the ceiling ONLY, never as a 1/aspect scale
// applied to the rendered camera position: scaling the position pushes the
// zoom-IN floor out by the same factor (MIN_CAM_R became ~EARTH_R * 2.7 on a
// phone), far enough that satellites stop visibly moving and the globe no
// longer fills the frame at max zoom.
const MAX_CAM_R_BASE = 160;

export function maxCamR() {
  return MAX_CAM_R_BASE * Math.max(1, 1 / camera.aspect);
}

/** Clamp a camera distance to the current viewport's zoom range. */
export function clampCamR(r) {
  return Math.max(MIN_CAM_R, Math.min(maxCamR(), r));
}

export function applyCam() {
  cam.r += (cam.rT - cam.r) * 0.12;
  cam.theta += (cam.thT - cam.theta) * 0.16;
  cam.phi += (cam.phT - cam.phi) * 0.16;
  const sp = Math.sin(cam.phi);
  camera.position.set(
    cam.r * sp * Math.sin(cam.theta),
    cam.r * Math.cos(cam.phi),
    cam.r * sp * Math.cos(cam.theta)
  );
  camera.lookAt(0, 0, 0);
}

/**
 * Aim the camera rig at an ECI position (km).
 *
 * `standoff` is how far back to sit, in Earth radii above the target's own
 * orbital radius: the default 2.2 frames a single object closely, while a
 * caller framing something that spans a large arc of its orbit (a launch
 * chain) passes a larger value to fit the whole of it on screen.
 *
 * `liftRad` puts the target that many radians above the centre of the view
 * instead of dead centre — the rig always looks at the Earth's centre, so
 * this is the only way to keep a target clear of a bottom sheet covering the
 * lower half of a phone screen.
 */
export function framePoint(p, standoff = 2.2, liftRad = 0) {
  const mag = Math.hypot(p.x, p.y, p.z); // km
  if (!mag) return;
  cam.rT = Math.max(EARTH_R * 1.6, Math.min(mag / KM_U + EARTH_R * standoff, 120));
  // world mapping: X=eci.x, Y=eci.z(north), Z=eci.y
  cam.thT = Math.atan2(p.x, p.y);
  const polar = Math.acos(Math.max(-1, Math.min(1, p.z / mag)));
  // Moving the camera south of the target lifts the target up the screen;
  // same clamp the drag handler uses so the rig can't flip over a pole.
  cam.phT = Math.max(0.12, Math.min(Math.PI - 0.12, polar + liftRad));
}

/** Aim the camera rig at the selected object. */
export function frameSelected() {
  const s = state.selected;
  if (!s || !s._p) return;
  framePoint(s._p);
}

export function resize() {
  const w = innerWidth,
    h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  // Rotating portrait -> landscape lowers the ceiling; pull a camera that's
  // now beyond it back into range rather than leaving it stranded out there
  // until the next pinch happens to bring it back.
  cam.rT = clampCamR(cam.rT);
}

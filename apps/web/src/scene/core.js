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

/** Aim the camera rig at the selected object. */
export function frameSelected() {
  const s = state.selected;
  if (!s || !s._p) return;
  const mag = Math.hypot(s._p.x, s._p.y, s._p.z); // km
  cam.rT = Math.max(EARTH_R * 1.6, Math.min(mag / KM_U + EARTH_R * 2.2, 120));
  // world mapping: X=eci.x, Y=eci.z(north), Z=eci.y
  cam.thT = Math.atan2(s._p.x, s._p.y);
  cam.phT = Math.acos(Math.max(-1, Math.min(1, s._p.z / mag)));
}

export function resize() {
  const w = innerWidth,
    h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

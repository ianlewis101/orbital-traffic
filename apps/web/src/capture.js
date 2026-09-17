// =====================================================================
// CINEMATIC CAPTURE MODE
// =====================================================================
//
// A scripted, deterministic driver for the globe, used by tools/video/ to
// shoot promo footage (TikTok/Reels/App Store previews) from the *real* app
// and the *real* catalog rather than from a mockup or a hand-edited render.
// Every frame of a finished video is therefore something the app genuinely
// draws, and the object counts in the copy are whatever the bundled catalog
// actually holds on the day it was shot.
//
// WHY IT IS A SEPARATE, DYNAMICALLY IMPORTED MODULE: main.js only imports it
// when `?capture=1` is in the URL, so Vite emits it as its own chunk that a
// real visitor never fetches. Nothing here is reachable — or costs a byte of
// transfer — in ordinary use.
//
// HOW DETERMINISM WORKS. The live app is wall-clock driven: the rAF loop
// advances state.simNow by real elapsed time and eases the camera rig toward
// its targets over several frames. Neither is reproducible frame-for-frame,
// and a headless SwiftShader renderer runs far below 30fps anyway, so
// recording the screen in real time would produce stuttering footage at an
// unpredictable speed. Instead:
//
//   1. prep() raises state.frozen, which parks main.js's loop (its one
//      early return). From then on nothing moves unless this module moves it.
//   2. step() is handed the exact simulation time and the exact camera
//      position for one frame, writes them straight into the rig (position
//      AND target together, so applyCam()'s easing has nothing left to ease),
//      re-propagates, and renders exactly once, synchronously.
//   3. The capture script screenshots, then asks for the next frame.
//
// Wall-clock time is thus completely decoupled from the footage: a frame can
// take three seconds to draw and still be the 1/30s successor of the one
// before it. The output is identical on any machine, at any speed.
//
// This module drives the scene through the same exported entry points the
// main loop uses (updatePositions, applyCam, updateSelMarker …) rather than
// reaching into any module's internals, so it stays correct as those evolve.

import * as THREE from "three";
import * as satellite from "satellite.js";
import { state, $ } from "./state.js";
import { cam, camera, applyCam, renderer, scene, clampCamR } from "./scene/core.js";
import { updatePositions } from "./scene/clouds.js";
import { earthGroup, earthUniforms } from "./scene/earth.js";
import { updateNeoPositions } from "./scene/neos.js";
import { updateSelMarker } from "./scene/marker.js";
import { buildTrail, clearTrail } from "./scene/trail.js";
import { sunDirECI } from "./astro/sun.js";

// Everything the app draws on top of the globe. Hidden wholesale in capture
// mode: a promo shot wants the scene, not the instrument panel. Kept as one
// injected stylesheet rather than edits to app.css so the shipped stylesheet
// carries no capture-only rules.
const HUD_SELECTORS = [
  "#brand",
  "#clock",
  "#search-wrap",
  "#results",
  "#leftstack",
  "#info",
  "#mini-card",
  "#meta",
  "#hint",
  "#overhead",
  "#overhead-fab",
  "#settings",
  "#settings-btn",
  "#chain",
  "#share-preview",
  "#app-banner",
  "#splash",
  "#fx-scan",
  "#fx-grain",
  "#bezel",
  // Transient status messages (ui/status.js). Capture blocks the live sync at
  // the network boundary, so the one that would otherwise appear in every
  // frame of a shoot is "Live fetch unavailable" — a true message about a
  // deliberate condition, and not something to film.
  ".toast",
];

function injectCaptureStyles(keepVignette) {
  // prep() runs once per shot, not once per shoot, so this has to be
  // idempotent — otherwise a nine-shot cut leaves nine identical stylesheets
  // in the document.
  const existing = document.getElementById("capture-style");
  if (existing) existing.remove();
  const css = document.createElement("style");
  css.id = "capture-style";
  // textContent, never innerHTML — nothing here is interpolated, and this
  // keeps the module clear of the no-unescaped-innerhtml rule entirely.
  css.textContent = `
    ${HUD_SELECTORS.join(",")} { display: none !important; }
    ${keepVignette ? "" : "#fx-vignette { display: none !important; }"}
    html, body { background: #000 !important; cursor: none !important; }
    /* Nothing should animate on its own: every frame must be a pure function
       of the time step it was asked for, and a CSS transition mid-capture
       would smear across frames at whatever wall-clock rate they happen to
       be taken. */
    *, *::before, *::after {
      animation: none !important;
      transition: none !important;
    }
  `;
  document.head.appendChild(css);
}

const _sunW = new THREE.Vector3();
const _invQ = new THREE.Quaternion();

/** Everything the main loop does to the scene for one instant of sim time. */
function renderAt(date) {
  updatePositions(date);
  earthGroup.rotation.y = -satellite.gstime(date);
  updateNeoPositions(date.getTime());
  const sd = sunDirECI(date);
  _sunW.set(sd.x, sd.z, sd.y);
  earthUniforms.sunDir.value
    .copy(_sunW)
    .applyQuaternion(_invQ.copy(earthGroup.quaternion).invert());
  // Write position and target together so applyCam() has zero distance left
  // to ease: the rig lands exactly where the shot script asked, this frame,
  // instead of chasing it over the next dozen.
  applyCam(0);
  updateSelMarker();
  renderer.render(scene, camera);
}

/**
 * ECI position (km) of a catalog object, by NORAD id — what a shot script
 * aims the camera at when it wants to frame something real (the ISS, a
 * capsule) rather than a fixed point in space.
 *
 * Returns null rather than throwing for an id that isn't in the catalog, so
 * a shot list outlives any single day's data: an object that has landed or
 * decayed since the script was written degrades to "no target" and the
 * capture tool can fall back, instead of aborting the whole shoot.
 */
function objectPosition(id) {
  const s = state.byId.get(String(id));
  if (!s || !s._p) return null;
  const { x, y, z } = s._p;
  if (![x, y, z].every(Number.isFinite)) return null;
  return { x, y, z };
}

/** Spherical rig angles that put `p` (ECI km) at the centre of frame. */
function anglesFor(p) {
  const mag = Math.hypot(p.x, p.y, p.z);
  if (!mag) return null;
  // Same ECI -> world mapping the rig uses in framePoint().
  return {
    theta: Math.atan2(p.x, p.y),
    phi: Math.acos(Math.max(-1, Math.min(1, p.z / mag))),
    mag,
  };
}

export function initCapture() {
  const api = {
    /** True once the catalog is ingested and the clouds exist. */
    ready() {
      return state.sats.length > 0 && !!renderer;
    },

    stats() {
      return {
        objects: state.sats.length,
        cats: { ...state.cats },
        chains: state.chains.length,
      };
    },

    /**
     * Enter capture mode. Parks the main loop, hides the HUD, and pins the
     * simulation clock so nothing advances except by step().
     */
    prep({ hidden = null, vignette = true } = {}) {
      state.frozen = true;
      state.rate = 0;
      state.tracking = false;
      state.selected = null;
      clearTrail();
      if (Array.isArray(hidden)) {
        state.hidden = new Set(hidden);
      }
      injectCaptureStyles(vignette);
      const splash = $("#splash");
      if (splash) splash.remove();
      return api.stats();
    },

    /** Which categories are currently drawn (a shot can narrow the scene). */
    setHidden(hidden) {
      state.hidden = new Set(hidden || []);
    },

    /**
     * Select an object so the marker ring and orbit trail draw on it.
     * Returns false for an id that is not in today's catalog.
     */
    select(id, { trail = true, date = null } = {}) {
      const s = state.byId.get(String(id));
      if (!s) return false;
      state.selected = s;
      if (trail) buildTrail(s, date ? new Date(date) : new Date(state.simNow));
      return true;
    },

    deselect() {
      state.selected = null;
      clearTrail();
    },

    objectPosition,

    /** Rig angles + orbital radius for an object, for aiming a shot at it. */
    aimAt(id) {
      const p = objectPosition(id);
      return p ? anglesFor(p) : null;
    },

    /** Resolve a catalog id by name pattern — shot scripts name, not number. */
    findId(pattern) {
      const re = new RegExp(pattern, "i");
      const hit = state.sats.find((s) => re.test(s.name));
      return hit ? { id: hit.id, name: hit.name, cat: hit.cat } : null;
    },

    /**
     * Draw exactly one frame.
     *
     * `sim` is the absolute simulation time (ms) for this frame; the caller
     * owns the timeline, which is what lets a shot run the sky at 40x while
     * the camera moves at 1x.
     */
    step({ sim, r, theta, phi }) {
      if (Number.isFinite(sim)) state.simNow = sim;
      if (Number.isFinite(r)) cam.r = cam.rT = clampCamR(r);
      if (Number.isFinite(theta)) cam.theta = cam.thT = theta;
      if (Number.isFinite(phi)) {
        // Same clamp the drag handler uses, so a shot script can't flip the
        // rig over a pole and invert the horizon mid-move.
        cam.phi = cam.phT = Math.max(0.12, Math.min(Math.PI - 0.12, phi));
      }
      renderAt(new Date(state.simNow));
    },
  };

  window.__otCapture = api;
  return api;
}

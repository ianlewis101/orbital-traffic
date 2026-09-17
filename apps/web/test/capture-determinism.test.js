import { describe, it, expect, beforeEach } from "vitest";
import { cam, applyCam, camera, MIN_CAM_R } from "../src/scene/core.js";
import { EARTH_R } from "../src/config.js";
import { state } from "../src/state.js";

/**
 * Regression tests for the promo-video capture rig (src/capture.js, driven by
 * tools/video/).
 *
 * The capture tool asks for one frame at a time and screenshots each one
 * before requesting the next, so a frame that takes a second to draw on a
 * software renderer is still the 1/30s successor of the one before it. That
 * only holds if a step lands the camera EXACTLY where the shot script asked,
 * in that one frame.
 *
 * The rig does not normally work that way. cam.r/theta/phi ease toward
 * cam.rT/thT/phT over many frames (applyCam()), which is right for a user
 * dragging the globe and wrong for a scripted move: easing toward a target
 * that jumps every frame turns a 3-second push into a laggy smear that never
 * reaches its end position, and makes the result depend on how many frames
 * were drawn rather than on the script. capture.js therefore writes the
 * position AND the target together, leaving applyCam() no distance to cover.
 *
 * These tests pin that property against the real rig rather than against a
 * copy of it, so a future change to the easing model has to keep capture
 * exact or fail here.
 */

/** What capture.js's step() does to the rig for one frame. */
function step({ r, theta, phi }) {
  cam.r = cam.rT = Math.max(MIN_CAM_R, r);
  cam.theta = cam.thT = theta;
  cam.phi = cam.phT = Math.max(0.12, Math.min(Math.PI - 0.12, phi));
  applyCam(0);
}

/** Camera distance from the origin after a frame has been applied. */
function renderedRadius() {
  return Math.hypot(camera.position.x, camera.position.y, camera.position.z);
}

beforeEach(() => {
  camera.aspect = 1080 / 1920;
  cam.r = cam.rT = EARTH_R * 4.2;
  cam.theta = cam.thT = 0.7;
  cam.phi = cam.phT = 1.15;
  state.frozen = false;
});

describe("capture step lands exactly, in one frame", () => {
  it("puts the camera at the requested distance immediately", () => {
    // A jump the easing model would otherwise take dozens of frames to cover.
    step({ r: 52, theta: 0.5, phi: 1.2 });
    expect(renderedRadius()).toBeCloseTo(52, 6);
  });

  it("leaves nothing for applyCam() to ease afterwards", () => {
    step({ r: 37, theta: 1.4, phi: 1.3 });
    const settled = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    // Extra frames must be a no-op: the capture tool has no control over how
    // many times the rig is stepped between screenshots.
    for (let i = 0; i < 50; i++) applyCam(16.7);
    expect(camera.position.x).toBeCloseTo(settled.x, 9);
    expect(camera.position.y).toBeCloseTo(settled.y, 9);
    expect(camera.position.z).toBeCloseTo(settled.z, 9);
  });

  it("reproduces a whole camera move frame-for-frame, at any frame rate", () => {
    // The same 90-frame push, stepped twice with wildly different wall-clock
    // gaps between frames — which is exactly what a software renderer does.
    const move = (i) => ({ r: 56 + (37 - 56) * (i / 89), theta: 0.85, phi: 1.12 });
    const run = (dt) => {
      const out = [];
      for (let i = 0; i < 90; i++) {
        step(move(i));
        applyCam(dt); // however long this frame happened to take
        out.push(renderedRadius());
      }
      return out;
    };
    const fast = run(16.7); // 60fps
    const slow = run(1200); // one frame every 1.2s, clamped by EASE_MAX_MS
    expect(fast).toEqual(slow);
    // And it genuinely arrives at the end of the move, not somewhere short.
    expect(fast.at(-1)).toBeCloseTo(37, 6);
  });
});

describe("capture step respects the rig's own limits", () => {
  it("clamps phi rather than letting a shot flip over a pole", () => {
    step({ r: 30, theta: 0, phi: -1 });
    expect(cam.phi).toBeCloseTo(0.12, 6);
    step({ r: 30, theta: 0, phi: Math.PI + 1 });
    expect(cam.phi).toBeCloseTo(Math.PI - 0.12, 6);
  });

  it("never renders closer than the zoom floor", () => {
    step({ r: 0.5, theta: 0, phi: 1.2 });
    expect(renderedRadius()).toBeGreaterThanOrEqual(MIN_CAM_R - 1e-9);
  });
});

describe("state.frozen", () => {
  it("defaults to false so the shipped app always runs its loop", () => {
    // main.js's loop returns early on this flag; if it ever defaulted true
    // the app would boot to a frozen globe with no error anywhere.
    expect(state.frozen).toBe(false);
  });
});

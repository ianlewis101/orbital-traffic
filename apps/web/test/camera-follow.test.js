import { describe, it, expect, beforeEach } from "vitest";
import { cam, applyCam, framePoint, frameSelected, wrapAngle } from "../src/scene/core.js";
import { state } from "../src/state.js";
import { EARTH_R } from "../src/config.js";

/**
 * Regression tests for "Center on Globe".
 *
 * Two independent defects made the control look either broken or glacial,
 * which is how it was reported: "either it takes five or more seconds to do
 * anything after you click it, or it never works at all."
 *
 *   1. applyCam() eased by a fixed fraction PER FRAME, so a move took a fixed
 *      number of frames and its wall-clock duration was whatever the frame
 *      rate happened to be. Driven against the real 19,000-object scene at
 *      ~9fps, a centre-on-ISS that settles in 0.42s at 60fps took 3.9s, and
 *      6.2s from a zoomed-out, spun-around view.
 *   2. cam.theta was never wrapped. A drag subtracts from cam.thT without
 *      bound; framePoint() writes an atan2 result in (-PI, PI]. The raw
 *      difference between them was routinely more than a full revolution, so
 *      the globe span an extra lap on the way to the object — and in follow
 *      mode it span a whole lap backwards every time the tracked object
 *      crossed the branch cut, roughly once per orbit.
 */

const ISS_ECI = { x: 4100, y: 4600, z: 3000 }; // ~6,800 km radius

/** Step the rig at a given frame rate until it lands, or give up. */
function settleAt(fps, maxMs = 30000) {
  const dt = 1000 / fps;
  let t = 0;
  while (t < maxMs) {
    applyCam(dt);
    t += dt;
    const onAngle = Math.abs(wrapAngle(cam.thT - cam.theta)) < 0.02;
    const onRange = Math.abs(cam.rT - cam.r) / cam.rT < 0.02;
    if (onAngle && onRange) return t;
  }
  return null;
}

beforeEach(() => {
  cam.r = cam.rT = EARTH_R * 4.2;
  cam.theta = cam.thT = 0.7;
  cam.phi = cam.phT = 1.15;
  state.selected = null;
});

describe("wrapAngle", () => {
  it("brings any angle into [-PI, PI)", () => {
    for (const a of [0, 0.7, -0.7, Math.PI, -Math.PI, 7.7, -18.5, 1e3]) {
      const w = wrapAngle(a);
      expect(w).toBeGreaterThanOrEqual(-Math.PI);
      expect(w).toBeLessThan(Math.PI);
      // same direction, just named differently
      expect(Math.sin(w)).toBeCloseTo(Math.sin(a), 9);
      expect(Math.cos(w)).toBeCloseTo(Math.cos(a), 9);
    }
  });
});

describe("easing is wall-clock, not frame-count", () => {
  it("lands in about the same time at 60fps and at 10fps", () => {
    framePoint(ISS_ECI);
    const targets = { r: cam.rT, th: cam.thT, ph: cam.phT };

    const fast = settleAt(60);
    cam.r = EARTH_R * 4.2;
    cam.theta = 0.7;
    cam.phi = 1.15;
    Object.assign(cam, { rT: targets.r, thT: targets.th, phT: targets.ph });
    const slow = settleAt(10);

    expect(fast).not.toBeNull();
    expect(slow).not.toBeNull();
    // A tenth of the frames to work with must not mean ten times the wait.
    // Before this fix the ratio WAS the frame-rate ratio, exactly.
    expect(slow / fast).toBeLessThan(2);
  });

  it("never takes seconds to centre, even on a phone dropping to 9fps", () => {
    framePoint(ISS_ECI);
    expect(settleAt(9)).toBeLessThan(1500);
  });

  it("keeps the 60fps feel it was tuned at", () => {
    framePoint(ISS_ECI);
    // ~0.4s, the pre-existing behaviour on a healthy frame rate
    const ms = settleAt(60);
    expect(ms).toBeGreaterThan(150);
    expect(ms).toBeLessThan(900);
  });

  it("does not teleport after a long stall (backgrounded tab)", () => {
    framePoint(ISS_ECI);
    const before = wrapAngle(cam.thT - cam.theta);
    applyCam(5000); // tab restored after five seconds
    const after = wrapAngle(cam.thT - cam.theta);
    expect(Math.abs(after)).toBeGreaterThan(0);
    expect(Math.abs(after)).toBeLessThan(Math.abs(before));
  });

  it("treats a missing dt as one 60fps frame", () => {
    cam.rT = cam.r + 10;
    applyCam();
    expect(cam.r).toBeCloseTo(EARTH_R * 4.2 + 10 * 0.12, 9);
  });
});

describe("the camera always takes the short way round", () => {
  it("does not spin an extra lap after the globe has been spun", () => {
    // six left-to-right swipes take cam.thT to about -7.7 rad in the real app
    cam.theta = cam.thT = -7.7;
    framePoint(ISS_ECI); // atan2 => back inside (-PI, PI]
    const naive = Math.abs(cam.thT - cam.theta); // what the old lerp travelled
    const actual = Math.abs(wrapAngle(cam.thT - cam.theta));
    expect(naive).toBeGreaterThan(Math.PI); // the old path really was the long one
    expect(actual).toBeLessThanOrEqual(Math.PI);

    let travelled = 0;
    let prev = cam.theta;
    for (let i = 0; i < 400; i++) {
      applyCam();
      travelled += Math.abs(wrapAngle(cam.theta - prev));
      prev = cam.theta;
    }
    expect(travelled).toBeLessThanOrEqual(actual + 1e-6);
    expect(travelled).toBeLessThan(naive - 1); // comfortably short of the old route
  });

  it("does not whip round when a tracked object crosses atan2's branch cut", () => {
    cam.theta = cam.thT = 3.1; // settled, just short of +PI
    framePoint({ x: -1, y: -7000, z: 0 }); // object steps just past the cut
    expect(Math.abs(cam.thT - cam.theta)).toBeGreaterThan(6); // ~2PI raw jump
    expect(Math.abs(wrapAngle(cam.thT - cam.theta))).toBeLessThan(0.1);

    let travelled = 0;
    let prev = cam.theta;
    for (let i = 0; i < 200; i++) {
      applyCam();
      travelled += Math.abs(wrapAngle(cam.theta - prev));
      prev = cam.theta;
    }
    expect(travelled).toBeLessThan(0.2); // a nudge, not a full revolution
  });

  it("keeps the rig's angle bounded however long the session runs", () => {
    cam.thT = 500; // an afternoon of dragging one way
    for (let i = 0; i < 600; i++) applyCam();
    expect(Math.abs(cam.theta)).toBeLessThanOrEqual(Math.PI);
    expect(Math.abs(cam.thT)).toBeLessThanOrEqual(Math.PI);
  });
});

describe("frameSelected", () => {
  it("aims at the selected object's cached position", () => {
    state.selected = { _p: ISS_ECI };
    frameSelected();
    expect(cam.thT).toBeCloseTo(Math.atan2(ISS_ECI.x, ISS_ECI.y), 9);
    expect(cam.rT).toBeGreaterThan(EARTH_R);
  });

  it("leaves the rig alone when there is nothing to aim at", () => {
    const before = { ...cam };
    state.selected = { _p: null };
    frameSelected();
    state.selected = null;
    frameSelected();
    expect(cam.rT).toBe(before.rT);
    expect(cam.thT).toBe(before.thT);
    expect(cam.phT).toBe(before.phT);
  });
});

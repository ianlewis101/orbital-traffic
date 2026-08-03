import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  sharePose,
  poseToPosition,
  eciToWorld,
  occludedByEarth,
  frameShareCamera,
  projectToCard,
  THETA_OFFSETS,
  SAFE_BOX,
} from "../src/share/camera.js";
import { EARTH_R, KM_U } from "../src/config.js";

/** A representative LEO position (ECI km), roughly ISS altitude. */
const LEO = { x: 4000, y: 5000, z: 2000 };
/** Geostationary-ish, to exercise the distance clamp. */
const GEO = { x: 42164, y: 0, z: 0 };

describe("eciToWorld", () => {
  it("maps ECI to the scene's axis convention (x, z, y) scaled by KM_U", () => {
    const w = eciToWorld({ x: 1000, y: 2000, z: 3000 });
    expect(w.x).toBeCloseTo(1000 / KM_U, 10);
    expect(w.y).toBeCloseTo(3000 / KM_U, 10);
    expect(w.z).toBeCloseTo(2000 / KM_U, 10);
  });
});

describe("sharePose", () => {
  it("pulls back far enough to keep the Earth's limb in frame", () => {
    expect(sharePose(LEO, 0).r).toBeGreaterThan(EARTH_R * 1.9 - 1e-9);
  });

  it("clamps distance for very high orbits", () => {
    expect(sharePose(GEO, 0).r).toBeLessThanOrEqual(140);
  });

  it("applies the angular offset to theta", () => {
    const a = sharePose(LEO, 0);
    const b = sharePose(LEO, 0.5);
    expect(b.theta - a.theta).toBeCloseTo(0.5, 10);
  });

  it("keeps phi away from the poles so the globe still reads as a sphere", () => {
    const polar = sharePose({ x: 0, y: 0, z: 7000 }, 0);
    expect(polar.phi).toBeGreaterThanOrEqual(0.42 - 1e-9);
    expect(polar.phi).toBeLessThanOrEqual(Math.PI - 0.42 + 1e-9);
  });

  it("survives a degenerate zero vector without producing NaN", () => {
    const p = sharePose({ x: 0, y: 0, z: 0 }, 0);
    expect(Number.isFinite(p.r)).toBe(true);
    expect(Number.isFinite(p.theta)).toBe(true);
    expect(Number.isFinite(p.phi)).toBe(true);
  });
});

describe("poseToPosition", () => {
  it("produces a point at the pose's radius", () => {
    const pose = sharePose(LEO, 0.3);
    expect(poseToPosition(pose).length()).toBeCloseTo(pose.r, 6);
  });
});

describe("occludedByEarth", () => {
  it("reports a point directly behind the Earth as hidden", () => {
    const cam = new THREE.Vector3(0, 0, 40);
    const behind = new THREE.Vector3(0, 0, -EARTH_R - 1);
    expect(occludedByEarth(cam, behind)).toBe(true);
  });

  it("reports a point in front of the Earth as visible", () => {
    const cam = new THREE.Vector3(0, 0, 40);
    const front = new THREE.Vector3(0, 0, EARTH_R + 1);
    expect(occludedByEarth(cam, front)).toBe(false);
  });

  it("reports a point off to the side as visible", () => {
    const cam = new THREE.Vector3(0, 0, 40);
    const side = new THREE.Vector3(EARTH_R * 3, 0, 0);
    expect(occludedByEarth(cam, side)).toBe(false);
  });
});

describe("frameShareCamera", () => {
  it("prefers the largest offset so the orbit reads as an ellipse, not a line", () => {
    // Looking straight down the object's radius vector is what collapses the
    // ring; the first offset that satisfies the safe box should win.
    const { pose } = frameShareCamera(LEO);
    const base = sharePose(LEO, 0);
    const applied = pose.theta - base.theta;
    expect(THETA_OFFSETS.some((o) => Math.abs(applied - o) < 1e-9)).toBe(true);
  });

  it("lands the subject inside the safe box for a range of orbits", () => {
    for (const eci of [LEO, GEO, { x: 0, y: 6800, z: 1200 }, { x: -5000, y: 2000, z: -4000 }]) {
      const { camera, subject } = frameShareCamera(eci);
      expect(Number.isFinite(subject.x)).toBe(true);
      expect(Number.isFinite(subject.y)).toBe(true);
      expect(subject.x).toBeGreaterThanOrEqual(SAFE_BOX.x0);
      expect(subject.x).toBeLessThanOrEqual(SAFE_BOX.x1);
      expect(subject.y).toBeGreaterThanOrEqual(SAFE_BOX.y0);
      expect(subject.y).toBeLessThanOrEqual(SAFE_BOX.y1);
      expect(camera.isPerspectiveCamera).toBe(true);
    }
  });

  it("places the subject above the card's midline, clear of the text block", () => {
    const { subject } = frameShareCamera(LEO);
    expect(subject.y).toBeLessThan(0.5);
  });

  it("does not leave the subject hidden behind the Earth", () => {
    const { camera } = frameShareCamera(LEO);
    expect(occludedByEarth(camera.position, eciToWorld(LEO))).toBe(false);
  });

  it("keeps the view offset applied so the globe sits high in the frame", () => {
    const { camera } = frameShareCamera(LEO);
    expect(camera.view).toBeTruthy();
    expect(camera.view.enabled).toBe(true);
    // Scene centre should project above the vertical midpoint.
    const centre = projectToCard(camera, new THREE.Vector3(0, 0, 0));
    expect(centre.y).toBeLessThan(0.5);
  });
});

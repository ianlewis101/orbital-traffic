import { describe, it, expect, beforeEach } from "vitest";
import { camera, cam, applyCam, clampCamR, maxCamR, MIN_CAM_R } from "../src/scene/core.js";
import { EARTH_R, KM_U } from "../src/config.js";

/**
 * Regression tests for the camera zoom range.
 *
 * A portrait-aspect fix once compensated for the vertical-axis FOV by scaling
 * the rendered camera position by 1/aspect. That did fix the GEO ring
 * clipping at full zoom-out, but it applied to every distance, so the
 * zoom-IN floor moved out by the same factor (~2.2x on a phone) — far enough
 * that LEO satellites no longer visibly moved against the globe, which is the
 * whole point of the close view. The compensation now lives on the zoom-out
 * ceiling only; these tests pin both ends.
 */

const FOV = 45;
const PORTRAIT = 390 / 844; // iPhone 14-class viewport
const LANDSCAPE = 844 / 390;
const GEO_U = 42164 / KM_U; // geostationary radius, scene units
const ISS_U = 6771 / KM_U; // ISS orbital radius, scene units

/** Half-width of the view frustum at `dist`, in scene units. */
function halfWidthAt(dist, aspect) {
  return dist * Math.tan((FOV * Math.PI) / 360) * aspect;
}

/** Run applyCam() until the smoothed rig has converged on its targets. */
function settle() {
  for (let i = 0; i < 300; i++) applyCam();
}

beforeEach(() => {
  cam.r = cam.rT = EARTH_R * 4.2;
  cam.theta = cam.thT = 0.7;
  cam.phi = cam.phT = 1.15;
  camera.aspect = 1;
});

describe("zoom-in floor", () => {
  it("renders the camera at cam.r itself, on every aspect", () => {
    for (const aspect of [PORTRAIT, 1, LANDSCAPE]) {
      camera.aspect = aspect;
      cam.rT = clampCamR(0); // pinch all the way in
      settle();
      expect(camera.position.length()).toBeCloseTo(MIN_CAM_R, 4);
    }
  });

  it("keeps a portrait phone close enough to LEO for motion to read", () => {
    camera.aspect = PORTRAIT;
    cam.rT = clampCamR(0);
    settle();
    // Nearest point of the ISS shell along the view axis. Under the 1/aspect
    // position scaling this was ~10.4 units, roughly 9x further out, which is
    // what flattened the apparent motion of everything in low orbit.
    expect(camera.position.length() - ISS_U).toBeLessThan(1.3);
  });

  it("never lets the camera inside the globe", () => {
    expect(MIN_CAM_R).toBeGreaterThan(EARTH_R);
    expect(clampCamR(-5)).toBe(MIN_CAM_R);
  });
});

describe("zoom-out ceiling", () => {
  it("clears the whole GEO ring horizontally on a portrait phone", () => {
    camera.aspect = PORTRAIT;
    expect(halfWidthAt(maxCamR(), PORTRAIT)).toBeGreaterThan(GEO_U);
  });

  it("leaves landscape and square viewports on the original 160", () => {
    for (const aspect of [1, LANDSCAPE]) {
      camera.aspect = aspect;
      expect(maxCamR()).toBe(160);
      expect(clampCamR(1e6)).toBe(160);
    }
  });

  it("stays inside the camera far plane", () => {
    camera.aspect = 9 / 21; // narrower than any real phone
    expect(maxCamR()).toBeLessThan(camera.far);
  });
});

describe("clampCamR", () => {
  it("pulls an out-of-range distance back in when the aspect narrows", () => {
    camera.aspect = PORTRAIT;
    const wideOut = clampCamR(1e6);
    expect(wideOut).toBeGreaterThan(160);
    // rotating the device to landscape lowers the ceiling under the camera
    camera.aspect = LANDSCAPE;
    expect(clampCamR(wideOut)).toBe(160);
  });

  it("passes through distances already inside the range", () => {
    camera.aspect = 1;
    expect(clampCamR(EARTH_R * 4.2)).toBe(EARTH_R * 4.2);
  });
});

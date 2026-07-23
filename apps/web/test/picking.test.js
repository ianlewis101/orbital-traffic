import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { makeCloudGeometry } from "../src/scene/clouds.js";
import { resolvePick, earthOcclusionDist } from "../src/scene/pick-core.js";
import { EARTH_R } from "../src/config.js";

/**
 * Regression test for the post-live-sync dead-picking bug.
 *
 * buildClouds() (re)creates every category geometry with zeroed positions
 * that updatePositions() fills in over the following ticks. Points.raycast
 * computes geometry.boundingSphere lazily on its first run and never
 * refreshes it, so a pointer event landing between the live-sync rebuild
 * and the position refill used to cache a degenerate radius-0 sphere and
 * leave the whole category unpickable for the rest of the session.
 * makeCloudGeometry pre-seeds a generous bounding sphere so picking never
 * depends on when the first raycast happens.
 */

// mirror the app's setup (scene/core.js + picking.js)
const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 4000);
camera.position.set(0, 0, 27); // ~default rig distance, outside LEO shell
camera.updateMatrixWorld();

const ray = new THREE.Raycaster();
ray.params.Points.threshold = 0.6;

function makePoints(geom) {
  const p = new THREE.Points(geom, new THREE.PointsMaterial());
  p.frustumCulled = false;
  p.updateMatrixWorld();
  return p;
}

function raycastAtWorldPos(points, worldPos) {
  const ndc = worldPos.clone().project(camera);
  ray.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
  return ray.intersectObject(points);
}

/** Fill positions the way updatePositions() does: after the geometry exists. */
function fillPositions(geom, center) {
  const a = geom.attributes.position.array;
  for (let i = 0; i < a.length / 3; i++) {
    a[i * 3] = center.x + i * 0.001;
    a[i * 3 + 1] = center.y;
    a[i * 3 + 2] = center.z;
  }
  geom.attributes.position.needsUpdate = true;
}

const SHELL = new THREE.Vector3(6, 4, 0); // an on-screen spot off Earth's center

describe("makeCloudGeometry picking", () => {
  it("objects stay pickable when a raycast lands before positions are filled (live-sync rebuild)", () => {
    const geom = makeCloudGeometry(50);
    const points = makePoints(geom);

    // the poisoning event: a hover raycast while the rebuilt cloud is still all zeros
    raycastAtWorldPos(points, SHELL);

    // updatePositions() catches up on later ticks
    fillPositions(geom, SHELL);

    const hits = raycastAtWorldPos(points, SHELL);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].index).toBeGreaterThanOrEqual(0);
    expect(hits[0].index).toBeLessThan(50);
  });

  it("control: a plain BufferGeometry exhibits the stale-sphere failure this guards against", () => {
    // If this control ever fails, three.js has started refreshing lazy
    // bounding spheres and the pre-seeded sphere workaround can be retired.
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(50 * 3), 3));
    const points = makePoints(geom);

    raycastAtWorldPos(points, SHELL); // caches a radius-0 sphere at the origin
    fillPositions(geom, SHELL);

    expect(raycastAtWorldPos(points, SHELL).length).toBe(0);
    expect(geom.boundingSphere.radius).toBe(0);
  });

  it("pre-seeds a bounding sphere covering the whole visible range", () => {
    const geom = makeCloudGeometry(10);
    expect(geom.boundingSphere).not.toBeNull();
    expect(geom.boundingSphere.radius).toBeGreaterThanOrEqual(4000);
    // still true for empty categories (placeholder vertex)
    expect(makeCloudGeometry(0).attributes.position.count).toBe(1);
  });
});

/**
 * Regression test for the "click selects an object on the far side of the
 * globe" bug. THREE.Points raycasting is depth-unaware: a satellite hidden
 * behind Earth is still reported as a hit, and because the old picker chose
 * purely by distance-to-ray, a far-side object sitting dead-on the pick ray
 * would beat the near-side object the user was actually aiming at.
 * resolvePick() rejects any hit whose along-ray projection lands past the
 * globe's near surface.
 */
describe("resolvePick occlusion", () => {
  // straight down the -z axis, matching the camera above (at (0,0,27))
  const axisRay = () => {
    const r = new THREE.Raycaster();
    r.params.Points.threshold = 0.6;
    r.setFromCamera(new THREE.Vector2(0, 0), camera);
    return r;
  };

  // one-vertex cloud at a world position, paired with its satellite record
  const cloudAt = (pos, sat) => {
    const geom = makeCloudGeometry(1);
    const a = geom.attributes.position.array;
    a[0] = pos.x;
    a[1] = pos.y;
    a[2] = pos.z;
    geom.attributes.position.needsUpdate = true;
    return { points: makePoints(geom), list: [sat] };
  };

  const NEAR = new THREE.Vector3(0.4, 0, EARTH_R + 0.5); // in front of the near face, off-ray
  const FAR = new THREE.Vector3(0, 0, -(EARTH_R + 0.5)); // behind the far face, dead-on the ray

  it("never selects an object behind the globe over a visible one in front", () => {
    const near = { name: "NEAR" },
      far = { name: "FAR" };
    const picked = resolvePick(axisRay(), [cloudAt(FAR, far), cloudAt(NEAR, near)], null, EARTH_R);
    expect(picked).toBe(near);
  });

  it("returns nothing when the only candidate is hidden behind the globe", () => {
    const far = { name: "FAR" };
    const picked = resolvePick(axisRay(), [cloudAt(FAR, far)], null, EARTH_R);
    expect(picked).toBeNull();
  });

  it("still picks the object closest to the ray among visible ones", () => {
    const onRay = { name: "ON_RAY" },
      offRay = { name: "OFF_RAY" };
    const picked = resolvePick(
      axisRay(),
      [
        cloudAt(new THREE.Vector3(0.45, 0, EARTH_R + 0.6), offRay),
        cloudAt(new THREE.Vector3(0.05, 0, EARTH_R + 0.7), onRay),
      ],
      null,
      EARTH_R
    );
    expect(picked).toBe(onRay);
  });

  it("earthOcclusionDist is finite when the ray meets the globe, Infinity when it misses", () => {
    const hit = earthOcclusionDist(axisRay(), EARTH_R);
    expect(Number.isFinite(hit)).toBe(true);
    expect(hit).toBeGreaterThan(0);

    // aim well past the limb into open sky
    const miss = new THREE.Raycaster();
    miss.params.Points.threshold = 0.6;
    miss.set(new THREE.Vector3(0, 0, 27), new THREE.Vector3(0, 1, 0));
    expect(earthOcclusionDist(miss, EARTH_R)).toBe(Infinity);
  });
});

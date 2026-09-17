import { describe, it, expect, vi, beforeEach } from "vitest";
import { state } from "../src/state.js";

/**
 * A selected NEO must have somewhere for the camera and the selection ring to
 * aim — i.e. it must carry `_p`, the ECI-km position every other object in the
 * app is located by.
 *
 * REGRESSION GUARD. NEOs never had one. scene/clouds.js's updatePositions() is
 * the only thing that writes `_p`, and it only walks state.sats; NEOs live in
 * their own list, with rec:null and no cloud entry, so the field stayed
 * undefined for all 77 of them for their whole session. Both consumers gate on
 * it — scene/core.js's frameSelected() (`if (!s || !s._p) return`) and
 * scene/marker.js's updateSelMarker() — so selecting an asteroid drew no
 * selection ring and "Center on Globe" did nothing at all, on every press.
 * Driven against the real app on Apophis: camera targets byte-identical before
 * and after the press, #sel-marker display:none.
 *
 * The contract `_p` has to satisfy is the one marker.js and share/camera.js's
 * eciToWorld() read it under: (x, z, y) / KM_U is the object's WORLD position.
 * For a NEO that means the projected display shell it is drawn on, not the
 * real ephemeris distance — these are projected precisely because their true
 * distance is millions of km, well outside the camera's far plane.
 */

const sceneMock = { add: vi.fn(), remove: vi.fn() };
vi.mock("../src/scene/core.js", async (orig) => ({ ...(await orig()), scene: sceneMock }));
vi.mock("../src/scene/clouds.js", async () => {
  const THREE = await import("three");
  return {
    makeShapeTextures: () => new Proxy({}, { get: () => new THREE.Texture() }),
    makeCloudGeometry: (count) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(Math.max(count, 1) * 3), 3)
      );
      return g;
    },
  };
});

// neoSats is a live binding (reassigned by initNeos), so it is read off the
// namespace rather than destructured once.
const neos = await import("../src/scene/neos.js");
const { DATA } = await import("../src/data/store.js");
const { framePoint, cam } = await import("../src/scene/core.js");
const { EARTH_R, KM_U } = await import("../src/config.js");

const NEO_DISPLAY_R = EARTH_R * 14; // mirrors scene/neos.js
const WHEN = Date.UTC(2026, 8, 17);

beforeEach(() => {
  // Real-shaped elements: astro/neo.js reads a/e/i/om/w/ma + epoch.
  DATA.neos = [
    {
      name: "Apophis",
      a: 0.9224,
      e: 0.1914,
      i: 3.34,
      om: 204.4,
      w: 126.7,
      ma: 220.0,
      epoch: 2461000.5,
    },
    {
      name: "Bennu",
      a: 1.1264,
      e: 0.2037,
      i: 6.03,
      om: 2.06,
      w: 66.22,
      ma: 101.7,
      epoch: 2461000.5,
    },
  ];
  state.byId = new Map();
  neos.initNeos();
});

describe("NEOs carry a position the rest of the app can read", () => {
  it("sets _p on every plotted NEO", () => {
    neos.updateNeoPositions(WHEN);
    expect(neos.neoSats.length).toBe(2);
    for (const s of neos.neoSats) {
      expect(s._p, `${s.name} has no _p`).toBeTruthy();
      expect(Number.isFinite(s._p.x)).toBe(true);
      expect(Number.isFinite(s._p.y)).toBe(true);
      expect(Number.isFinite(s._p.z)).toBe(true);
      expect(s.alive).toBe(true);
    }
  });

  it("has one already by the time the scene is first built", () => {
    // initNeos() propagates once itself, so an asteroid selected from search
    // in the first second of the session is centreable straight away.
    expect(neos.neoSats[0]._p).toBeTruthy();
  });

  it("puts _p on the shell the dot is drawn on, not at the true distance", () => {
    neos.updateNeoPositions(WHEN);
    for (const s of neos.neoSats) {
      // the mapping marker.js/eciToWorld() use: world = (p.x, p.z, p.y) / KM_U
      const world = { x: s._p.x / KM_U, y: s._p.z / KM_U, z: s._p.y / KM_U };
      expect(Math.hypot(world.x, world.y, world.z)).toBeCloseTo(NEO_DISPLAY_R, 6);
    }
  });

  it("agrees with the point actually written into the NEO cloud", () => {
    // The cloud is Float32, _p is double — compared relatively so this pins
    // "same point" without pinning float32's rounding.
    neos.updateNeoPositions(WHEN);
    const pos = neos.neoPoints.geometry.attributes.position.array;
    neos.neoSats.forEach((s, i) => {
      for (const [mine, theirs] of [
        [s._p.x / KM_U, pos[i * 3]],
        [s._p.z / KM_U, pos[i * 3 + 1]],
        [s._p.y / KM_U, pos[i * 3 + 2]],
      ]) {
        expect(Math.abs(mine - theirs) / Math.max(1, Math.abs(theirs))).toBeLessThan(1e-6);
      }
    });
  });

  it("frames from outside the shell, pointed at the object", () => {
    neos.updateNeoPositions(WHEN);
    const s = neos.neoSats[0];
    framePoint(s._p);
    expect(cam.rT).toBeGreaterThan(NEO_DISPLAY_R); // camera behind the dot
    expect(cam.rT).toBeLessThanOrEqual(120); // and inside the rig's own ceiling
    const mag = Math.hypot(s._p.x, s._p.y, s._p.z);
    const sp = Math.sin(cam.phT);
    expect(sp * Math.sin(cam.thT)).toBeCloseTo(s._p.x / mag, 6);
    expect(Math.cos(cam.phT)).toBeCloseTo(s._p.z / mag, 6);
    expect(sp * Math.cos(cam.thT)).toBeCloseTo(s._p.y / mag, 6);
  });

  it("clears _p rather than stranding a stale one when a NEO leaves the scene", () => {
    neos.updateNeoPositions(WHEN);
    expect(neos.neoSats[0]._p).toBeTruthy();
    // Unusable elements: the entry must go dark rather than keep pointing the
    // camera and the selection ring at a place nothing is drawn any more.
    // These come back NaN rather than throwing, so a bare `dist < 1` guard
    // lets them through — the same NaN-slips-past-a-comparison trap
    // astro/overhead.js rejects non-finite results for.
    DATA.neos[0] = {
      name: "Apophis",
      a: NaN,
      e: NaN,
      i: NaN,
      om: NaN,
      w: NaN,
      ma: NaN,
      epoch: NaN,
    };
    neos.updateNeoPositions(WHEN);
    expect(neos.neoSats[0]._p).toBeNull();
    expect(neos.neoSats[0].alive).toBe(false);
    expect(neos.neoSats[1]._p).toBeTruthy(); // its neighbour is unaffected
    const pos = neos.neoPoints.geometry.attributes.position.array;
    expect([pos[0], pos[1], pos[2]].every(Number.isFinite)).toBe(true); // no NaN vertex either
  });
});

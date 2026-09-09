// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regression test for the zoom-out-is-laggy bug: on a two-finger pinch,
 * Pointer Events fire a pointermove stream for EACH finger (not just one),
 * but the drag/rotate handler used to treat every pointermove as a
 * single-finger drag — computing dx/dy against one shared `downXY` baseline
 * that both fingers' events stomped on. That fed noisy rotation deltas into
 * cam.thT/cam.phT on every frame of a pinch, at the same time touchmove was
 * correctly driving cam.rT (zoom) — a real pinch-to-zoom-out therefore also
 * yanked the camera's rotation around, which is what read as "laggy". The
 * fix tracks concurrently-down pointerIds and lets a second pointer disable
 * the drag/rotate path entirely, ceding the gesture to touchmove.
 */

const { camMock, cloudsMock, stopTrackingSpy, selectSpy, resolvePickSpy } = vi.hoisted(() => ({
  camMock: { r: 10, theta: 0.7, phi: 1.15, rT: 10, thT: 0.7, phT: 1.15 },
  cloudsMock: {},
  stopTrackingSpy: vi.fn(),
  selectSpy: vi.fn(),
  resolvePickSpy: vi.fn(() => null),
}));

vi.mock("../src/scene/clouds.js", () => ({ clouds: cloudsMock }));
vi.mock("../src/scene/neos.js", () => ({ neoPoints: null, neoSats: [] }));
vi.mock("../src/ui/info.js", () => ({
  select: (...a) => selectSpy(...a),
  stopTracking: (...a) => stopTrackingSpy(...a),
}));
vi.mock("../src/scene/pick-core.js", () => ({ resolvePick: (...a) => resolvePickSpy(...a) }));

let domElement;
vi.mock("../src/scene/core.js", async () => {
  const THREE = await import("three");
  const camera = new THREE.PerspectiveCamera(45, 800 / 600, 0.5, 4000);
  camera.position.set(0, 0, 27);
  camera.updateMatrixWorld();
  return {
    get renderer() {
      return { domElement };
    },
    camera,
    cam: camMock,
    clampCamR: (r) => r,
  };
});

const { initPicking } = await import("../src/scene/picking.js");

function firePointer(el, type, { pointerId, clientX = 0, clientY = 0 }) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  ev.pointerId = pointerId;
  ev.clientX = clientX;
  ev.clientY = clientY;
  el.dispatchEvent(ev);
}

beforeEach(() => {
  document.body.innerHTML = '<div id="tip"></div>';
  domElement = document.createElement("div");
  domElement.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
  document.body.appendChild(domElement);
  Object.assign(camMock, { r: 10, theta: 0.7, phi: 1.15, rT: 10, thT: 0.7, phT: 1.15 });
  initPicking();
});

describe("picking: multi-touch no longer feeds spurious rotation into a pinch", () => {
  it("a single-finger drag still rotates the camera", () => {
    firePointer(domElement, "pointerdown", { pointerId: 1, clientX: 100, clientY: 100 });
    const thBefore = camMock.thT;
    firePointer(domElement, "pointermove", { pointerId: 1, clientX: 160, clientY: 100 });
    expect(camMock.thT).not.toBeCloseTo(thBefore, 5);
    // dispatched on domElement (not window directly) so it bubbles up with a
    // real element as e.target, matching how the browser delivers it
    firePointer(domElement, "pointerup", { pointerId: 1, clientX: 160, clientY: 100 });
  });

  it("a second finger landing mid-gesture freezes rotation for the rest of the pinch", () => {
    // finger 1 down and starts moving, same as a real pinch's first contact
    firePointer(domElement, "pointerdown", { pointerId: 1, clientX: 100, clientY: 100 });
    firePointer(domElement, "pointermove", { pointerId: 1, clientX: 120, clientY: 100 });
    // finger 2 lands — this is now a pinch, not a drag
    firePointer(domElement, "pointerdown", { pointerId: 2, clientX: 300, clientY: 100 });
    const thAtPinchStart = camMock.thT;
    const phAtPinchStart = camMock.phT;

    // both fingers generate their own pointermove streams during the pinch,
    // exactly as real touch input does
    firePointer(domElement, "pointermove", { pointerId: 1, clientX: 60, clientY: 400 });
    firePointer(domElement, "pointermove", { pointerId: 2, clientX: 360, clientY: 20 });
    firePointer(domElement, "pointermove", { pointerId: 1, clientX: 20, clientY: 500 });

    expect(camMock.thT).toBe(thAtPinchStart);
    expect(camMock.phT).toBe(phAtPinchStart);

    // lifting back to one finger, then off, must not fire a spurious tap-select
    firePointer(domElement, "pointerup", { pointerId: 2, clientX: 360, clientY: 20 });
    firePointer(domElement, "pointerup", { pointerId: 1, clientX: 20, clientY: 500 });
    expect(selectSpy).not.toHaveBeenCalled();
  });
});

import * as THREE from "three";
import { EARTH_R } from "../config.js";
import { state, $ } from "../state.js";
import { renderer, camera, cam } from "./core.js";
import { clouds } from "./clouds.js";
import { neoPoints, neoSats } from "./neos.js";
import { select } from "../ui/info.js";
import { resolvePick } from "./pick-core.js";

const ray = new THREE.Raycaster();
ray.params.Points.threshold = 0.6;
const mouse = new THREE.Vector2();
let downXY = null;

function pick(cx, cy) {
  const rc = renderer.domElement.getBoundingClientRect();
  mouse.x = ((cx - rc.left) / rc.width) * 2 - 1;
  mouse.y = -((cy - rc.top) / rc.height) * 2 + 1;
  ray.setFromCamera(mouse, camera);
  // Empty categories still carry one placeholder vertex at the origin, but the
  // origin is always behind the globe, so occlusion filtering already discards
  // it — no satellite ever lives there to select. resolvePick() also rejects
  // any hit hidden behind Earth so a click over the globe can't jump to an
  // object on the far side.
  return resolvePick(ray, Object.values(clouds), { points: neoPoints, sats: neoSats }, EARTH_R);
}

export function initPicking() {
  const tip = $("#tip");
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (downXY) {
      // dragging
      const dx = e.clientX - downXY.x,
        dy = e.clientY - downXY.y;
      cam.thT -= dx * 0.005;
      cam.phT = Math.max(0.12, Math.min(Math.PI - 0.12, cam.phT - dy * 0.005));
      downXY = { x: e.clientX, y: e.clientY, moved: downXY.moved || Math.hypot(dx, dy) > 3 };
      return;
    }
    const s = pick(e.clientX, e.clientY);
    if (s && s.alive) {
      tip.style.display = "block";
      tip.style.left = e.clientX + "px";
      tip.style.top = e.clientY + "px";
      tip.textContent = s.name;
      renderer.domElement.style.cursor = "pointer";
      state.hovered = s;
    } else {
      tip.style.display = "none";
      renderer.domElement.style.cursor = "grab";
      state.hovered = null;
    }
  });
  renderer.domElement.addEventListener("pointerdown", (e) => {
    downXY = { x: e.clientX, y: e.clientY, moved: false };
    renderer.domElement.style.cursor = "grabbing";
    tip.style.display = "none";
  });
  window.addEventListener("pointerup", (e) => {
    // Taps that land on HUD controls (close button, buttons, panels, etc.) are
    // handled by their own listeners — never re-pick/re-select from underneath
    // them, or a tap meant to close the info card can immediately reselect
    // whatever satellite is rendered at that screen position and reopen it.
    if (e.target.closest(".hud")) {
      downXY = null;
      return;
    }
    if (downXY && !downXY.moved) {
      const s = pick(e.clientX, e.clientY);
      if (s) select(s);
    }
    downXY = null;
    renderer.domElement.style.cursor = "grab";
  });
  renderer.domElement.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      cam.rT = Math.max(EARTH_R * 1.25, Math.min(160, cam.rT * (1 + Math.sign(e.deltaY) * 0.1)));
    },
    { passive: false }
  );
  // touch pinch
  let pinch = null;
  renderer.domElement.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length === 2) {
        pinch = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
      }
    },
    { passive: true }
  );
  renderer.domElement.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length === 2 && pinch) {
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        cam.rT = Math.max(EARTH_R * 1.25, Math.min(160, (cam.rT * pinch) / d));
        pinch = d;
      }
    },
    { passive: true }
  );
  window.addEventListener("touchend", () => (pinch = null));
}

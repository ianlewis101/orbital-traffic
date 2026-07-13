import "./styles/app.css";
import * as satellite from "satellite.js";
import { state, $ } from "./state.js";
import { loadData } from "./data/store.js";
import { ingest } from "./data/ingest.js";
import { fetchLive } from "./data/live.js";
import { sunDirECI } from "./astro/sun.js";
import {
  scene,
  renderer,
  initRenderer,
  camera,
  applyCam,
  frameSelected,
  resize,
} from "./scene/core.js";
import { initStarfield } from "./scene/starfield.js";
import { initEarth, earthGroup, earthUniforms } from "./scene/earth.js";
import { buildClouds, updatePositions } from "./scene/clouds.js";
import { buildTrail } from "./scene/trail.js";
import { initNeos, updateNeoPositions } from "./scene/neos.js";
import { initPicking } from "./scene/picking.js";
import { updateSelMarker } from "./scene/marker.js";
import { refreshInfo, initInfoCard } from "./ui/info.js";
import { rebuildLegend } from "./ui/legend.js";
import { renderToday, initTodayToggle } from "./ui/today.js";
import { initTimeMachine } from "./ui/time.js";
import { initSearch } from "./ui/search.js";
import { initPassAlerts } from "./ui/alerts.js";
import { updateCount } from "./ui/status.js";
import { updateClock } from "./ui/clock.js";
import { registerServiceWorker } from "./pwa.js";
import { refreshPassAlertsIfEnabled } from "./native/passAlerts.js";
import * as THREE from "three";

const splash = $("#splash"),
  splashMsg = $("#splash-msg");

function fatal(msg) {
  splashMsg.textContent = msg;
  splashMsg.style.color = "var(--bad)";
}

// =====================================================================
// MAIN LOOP
// =====================================================================
const _sunW = new THREE.Vector3(),
  _invQ = new THREE.Quaternion();
let infoTick = 0,
  neoFrame = 0;

function loop(now) {
  requestAnimationFrame(loop);
  const dtWall = now - state.lastWall;
  state.lastWall = now;
  state.simNow += dtWall * state.rate;
  const date = new Date(state.simNow);

  // propagate at ~20Hz of wall time
  if (now - state.lastProp > 48 || state.rate > 1) {
    state.lastProp = now;
    updatePositions(date);
    if (state.selected) {
      if (++infoTick % 3 === 0 || state.rate > 1) {
        refreshInfo();
        if (state.rate >= 60) buildTrail(state.selected, date);
      }
    }
  }
  // earth rotation = sidereal; feed sun direction (earth-local) to the shader
  const gmst = satellite.gstime(date);
  earthGroup.rotation.y = -gmst;
  if (++neoFrame % 60 === 0) updateNeoPositions(date.getTime());
  const sd = sunDirECI(date);
  _sunW.set(sd.x, sd.z, sd.y);
  earthUniforms.sunDir.value.copy(_sunW).applyQuaternion(_invQ.copy(earthGroup.quaternion).invert());

  if (state.tracking && state.selected && state.selected._p) frameSelected();
  applyCam();
  updateSelMarker();
  updateClock(date);
  renderer.render(scene, camera);
}

// =====================================================================
// BOOT
// =====================================================================
async function boot() {
  if (!initRenderer($("#scene"))) {
    fatal("WebGL unavailable — try a different browser");
    return;
  }
  addEventListener("resize", resize);
  resize();

  let data;
  try {
    data = await loadData();
  } catch (e) {
    console.error(e);
    fatal("Failed to load orbital data — check connection");
    return;
  }

  initStarfield();
  initEarth();
  initNeos();
  initInfoCard();
  initTimeMachine();
  initTodayToggle();
  initSearch();
  initPassAlerts();
  initPicking();

  await ingest(data.sats);
  buildClouds();
  rebuildLegend();
  updateCount();
  renderToday();
  requestAnimationFrame(loop);
  setTimeout(() => {
    splash.classList.add("gone");
    setTimeout(() => splash.remove(), 900);
  }, 650);
  // auto-attempt a live sync shortly after boot
  setTimeout(() => {
    fetchLive();
  }, 2000);
  // fade hint
  setTimeout(() => {
    const h = $("#hint");
    if (h) h.style.opacity = 0;
  }, 9000);
}

boot();
registerServiceWorker();
refreshPassAlertsIfEnabled();

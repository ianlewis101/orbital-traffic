import "./styles/app.css";
import * as satellite from "satellite.js";
import { state, $ } from "./state.js";
import { satrecEpochDate } from "@orbital-traffic/catalog";
import { loadData } from "./data/store.js";
import { ingest } from "./data/ingest.js";
import { refreshChains } from "./data/chains.js";
import { fetchLive, initLiveRefresh } from "./data/live.js";
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
import { updateChainOverlay } from "./scene/chain.js";
import { initNeos, updateNeoPositions } from "./scene/neos.js";
import { initPicking } from "./scene/picking.js";
import { updateSelMarker } from "./scene/marker.js";
import { refreshInfo, initInfoCard } from "./ui/info.js";
import { initChainCard } from "./ui/chain.js";
import { rebuildLegend, initLegendToggle } from "./ui/legend.js";
import { renderToday, initTodayToggle, refreshTodayLiveFacts } from "./ui/today.js";
import { initEventsToggle, refreshEvents } from "./ui/today-in-space.js";
import { initSearch } from "./ui/search.js";
import { initShare } from "./ui/share.js";
import { initOverhead } from "./ui/overhead.js";
import { initSettings } from "./ui/settings.js";
import { applyReduceMotion } from "./util/motion.js";
import { initTimeMachine, updateClockMode } from "./ui/time.js";
import { updateCount } from "./ui/status.js";
import { updateClock } from "./ui/clock.js";
import { registerServiceWorker } from "./pwa.js";
import { freshnessText, isTimeShifted } from "./util/freshness.js";
import * as THREE from "three";

const splash = $("#splash"),
  splashMsg = $("#splash-msg");

// __OBJECT_COUNT__ is injected at build time from the real catalog (see vite.config.js)
splashMsg.textContent = `Loading ${__OBJECT_COUNT__} objects in orbit for you to explore`;

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
  neoFrame = 0,
  freshFrame = 0;

// The on-screen label is a static "Orbital elements ·" (see index.html) with
// "LIVE" supplied entirely by the pulsing clock-mode badge next to it — no
// more duplicated "LIVE"/"Live" text, and nothing long enough to wrap on
// mobile. The real per-state detail (live-synced age, still on the boot
// catalog, sync failed and retrying, or the globe time-shifted) still comes
// from freshness.js — it just moves into this hover/long-press tooltip
// instead of the always-visible text, so the honesty guarantee (never
// implying the data is fresher than it is) still holds on inspection. Kept
// out of the propagation-throttled block below since it has nothing to do
// with orbital positions, just its own cadence. Also refreshes the
// clock-mode badge so paused/fast-forward drift keeps it honest even between
// explicit rate/jump interactions.
const FRESHNESS_EXPLAINER =
  "Positions are computed live in your browser from orbital elements that refresh periodically; the upstream catalog updates roughly every 2 hours.";

function updateFreshnessLine() {
  const el = $("#freshness-line");
  if (!el) return;
  const now = Date.now();
  const status = freshnessText({
    simShifted: isTimeShifted({ rate: state.rate, simNow: state.simNow, now }),
    simOffsetMs: state.simNow - now,
    srcTime: state.srcTime,
    syncFailed: state.syncFailed,
    bootTime: state.bootCatalogTime,
  });
  el.title = `${FRESHNESS_EXPLAINER} Status: ${status}.`;
  updateClockMode();
}

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
    // Shares updatePositions' throttle: it propagates the same way, for at
    // most a few dozen objects, and no-ops entirely when no chain is lit.
    updateChainOverlay(date);
    if (state.selected) {
      if (++infoTick % 3 === 0) {
        refreshInfo();
      }
    }
  }
  // earth rotation = sidereal; feed sun direction (earth-local) to the shader
  const gmst = satellite.gstime(date);
  earthGroup.rotation.y = -gmst;
  if (++neoFrame % 60 === 0) updateNeoPositions(date.getTime());
  // Relative-time text only needs to visibly change once a minute at most —
  // every 30 frames (~0.5s at 60fps) is far more than enough headroom.
  if (++freshFrame % 30 === 0) updateFreshnessLine();
  const sd = sunDirECI(date);
  _sunW.set(sd.x, sd.z, sd.y);
  earthUniforms.sunDir.value
    .copy(_sunW)
    .applyQuaternion(_invQ.copy(earthGroup.quaternion).invert());

  if (state.tracking && state.selected && state.selected._p) frameSelected();
  applyCam();
  updateSelMarker();
  updateClock(date);
  renderer.render(scene, camera);
}

// =====================================================================
// BOOT
// =====================================================================

// Newest TLE epoch across the loaded catalog — the freshest orbital element
// the user is looking at, and thus the honest age of the bundled boot data.
function newestCatalogEpoch(sats) {
  let newest = null;
  for (const s of sats) {
    const d = satrecEpochDate(s.rec);
    if (d && (!newest || d > newest)) newest = d;
  }
  return newest;
}

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
  initChainCard();
  initTimeMachine();
  initTodayToggle();
  initEventsToggle();
  initLegendToggle();
  initSearch();
  initShare();
  initOverhead();
  initSettings();
  initPicking();
  applyReduceMotion();

  try {
    await ingest(data.sats);
  } catch (e) {
    // ingest() guards every per-record step, so this should be unreachable
    // against real data — but boot must never get stuck here: whatever made
    // it into state.sats before a hypothetical throw stays, and the app
    // still renders with that rather than never reaching the scene at all.
    console.error(e);
  }
  // Age reference for the bundled catalog, read from the data itself: the
  // newest TLE epoch among loaded objects. We deliberately don't use the
  // Last-Modified header of /data/satellites.json — on GitHub Pages that
  // resets to the deploy time on every push to main (the whole dist is
  // re-uploaded), so it would read "just now" even when the elements inside
  // are a day old. The newest epoch is immune to that and is what the user
  // is actually looking at.
  state.bootCatalogTime = newestCatalogEpoch(state.sats);
  buildClouds();
  // Launch chains ("Starlink trains") come out of the elements just ingested,
  // so the boot catalog already has them — the feed doesn't wait on the first
  // live sync to offer one.
  refreshChains();
  rebuildLegend();
  updateCount();
  renderToday();
  // Fills in the ISS headcount and re-renders; deliberately not awaited so
  // boot never waits on the network for a Popular Objects detail.
  refreshTodayLiveFacts();
  // Same reasoning for Today in Space's initial fetch — never block boot.
  refreshEvents();
  updateFreshnessLine();
  requestAnimationFrame(loop);
  setTimeout(() => {
    splash.classList.add("gone");
    setTimeout(() => splash.remove(), 900);
  }, 650);
  // auto-attempt a live sync shortly after boot, then keep it fresh on a
  // periodic + on-visibility policy so a tab left open all evening doesn't
  // sit on hours-old elements.
  setTimeout(() => {
    fetchLive();
  }, 2000);
  initLiveRefresh();
  // fade hint
  setTimeout(() => {
    const h = $("#hint");
    if (h) h.style.opacity = 0;
  }, 9000);
}

boot();
registerServiceWorker();

import * as THREE from "three";
import { CATS, EARTH_R, KM_U } from "../config.js";
import { state } from "../state.js";
import { DATA } from "../data/store.js";
import { neoGeocentric } from "../astro/neo.js";
import { scene } from "./core.js";
import { makeCloudGeometry, makeShapeTextures } from "./clouds.js";

/**
 * Near-Earth objects live far outside the satellite shell, so they are
 * projected onto a fixed display radius while keeping their true
 * direction from Earth.
 */
const NEO_DISPLAY_R = EARTH_R * 14;

export let neoPoints = null;
export let neoSats = [];
let neoGeom = null;
let neoPos = null;

/** Build the NEO point cloud and clickable objects. Requires DATA.neos. */
export function initNeos() {
  // pre-seeded bounding sphere: NEO positions drift with (simulated) time,
  // and a lazily cached sphere would eventually strand them unpickable too
  neoGeom = makeCloudGeometry(DATA.neos.length);
  neoPos = neoGeom.attributes.position.array;
  const shapes = makeShapeTextures();
  const neoMat = new THREE.PointsMaterial({
    size: CATS.hazardous.px,
    sizeAttenuation: false,
    color: CATS.hazardous.color,
    map: shapes.hazardous,
    transparent: true,
    depthWrite: false,
    alphaTest: 0.08,
    opacity: 0.92,
  });
  neoPoints = new THREE.Points(neoGeom, neoMat);
  neoPoints.frustumCulled = false;
  scene.add(neoPoints);

  state.cats.hazardous = DATA.neos.length;
  neoSats = DATA.neos.map((n, i) => {
    // expand compact field names to full names for describe()
    const neo = Object.assign({}, n, {
      orbit_class: n.cls || "",
      diameter: n.diam || "",
      discovered: n.disc || "",
      full_name: n.fn || n.name,
      next_date: n.nd || "",
      next_dist_ld: n.nl || "",
    });
    return { id: "neo_" + i, name: n.name, cat: "hazardous", rec: null, _neo: neo, alive: true };
  });
  neoSats.forEach((s) => state.byId.set(s.id, s));
  updateNeoPositions(Date.now());
}

/**
 * Drop a NEO out of the scene: no dot, and nothing for anything reading `_p`
 * to aim at. `alive` mirrors what clouds.js sets for a satellite that fails to
 * propagate, so the selection marker and the picker treat both the same way.
 */
function hideNeo(i) {
  neoPos[i * 3] = neoPos[i * 3 + 1] = neoPos[i * 3 + 2] = 0;
  const s = neoSats[i];
  if (s) {
    s._p = null;
    s.alive = false;
  }
}

export function updateNeoPositions(dateMs) {
  if (!DATA.neos.length || !neoPos) return;
  for (let i = 0; i < DATA.neos.length; i++) {
    try {
      const g = neoGeocentric(DATA.neos[i], dateMs);
      const dist = Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z) / 6371; // scene units
      // Non-finite is rejected explicitly, not left to `dist < 1`: unusable
      // elements come back as NaN rather than throwing, and NaN fails every
      // comparison, so it walks straight past a bare `< 1` guard the way
      // astro/overhead.js documents for look angles. Downstream that is a
      // NaN vertex in the cloud and a NaN `_p` for the selection ring and
      // "Center on Globe" to aim at.
      if (!Number.isFinite(dist) || dist < 1) {
        hideNeo(i);
        continue;
      }
      const scale = NEO_DISPLAY_R / dist;
      const x = (g.x / 6371) * scale;
      const y = (g.z / 6371) * scale; // ECI→scene: y=eci.z
      const z = (g.y / 6371) * scale; // ECI→scene: z=eci.y
      neoPos[i * 3] = x;
      neoPos[i * 3 + 1] = y;
      neoPos[i * 3 + 2] = z;
      // Hand the NEO the same `_p` contract a satellite gets from clouds.js:
      // an ECI-km position that /KM_U lands on the object's world position.
      // Without it a selected asteroid had no `_p` at all — the one field
      // scene/marker.js and scene/core.js's frameSelected() both gate on — so
      // it drew no selection ring and "Center on Globe" did nothing on every
      // press while still lighting up as though it had. NEOs are the whole
      // "hazardous" category, so that was every one of them.
      //
      // It has to describe where the dot is DRAWN, not where the asteroid
      // really is: these are projected onto NEO_DISPLAY_R above precisely
      // because their true distance is millions of km, far outside the
      // camera's far plane and the rig's zoom range.
      const s = neoSats[i];
      if (s) {
        s._p = { x: x * KM_U, y: z * KM_U, z: y * KM_U }; // scene→ECI, inverse of above
        s.alive = true;
      }
    } catch {
      hideNeo(i);
    }
  }
  neoGeom.attributes.position.needsUpdate = true;
}

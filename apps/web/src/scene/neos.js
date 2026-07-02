import * as THREE from "three";
import { CATS, EARTH_R } from "../config.js";
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

export function updateNeoPositions(dateMs) {
  if (!DATA.neos.length || !neoPos) return;
  for (let i = 0; i < DATA.neos.length; i++) {
    try {
      const g = neoGeocentric(DATA.neos[i], dateMs);
      const dist = Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z) / 6371; // scene units
      if (dist < 1) {
        neoPos[i * 3] = neoPos[i * 3 + 1] = neoPos[i * 3 + 2] = 0;
        continue;
      }
      const scale = NEO_DISPLAY_R / dist;
      neoPos[i * 3] = (g.x / 6371) * scale;
      neoPos[i * 3 + 1] = (g.z / 6371) * scale; // ECI→scene: y=eci.z
      neoPos[i * 3 + 2] = (g.y / 6371) * scale; // ECI→scene: z=eci.y
    } catch {
      neoPos[i * 3] = neoPos[i * 3 + 1] = neoPos[i * 3 + 2] = 0;
    }
  }
  neoGeom.attributes.position.needsUpdate = true;
}

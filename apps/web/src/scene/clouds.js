import * as THREE from "three";
import { CATS, KM_U } from "../config.js";
import { state } from "../state.js";
import { safeProp } from "../astro/propagation.js";
import { scene } from "./core.js";

// cat -> {list, points, geom, posAttr}
export const clouds = {};

export function makeShapeTextures() {
  const S = 64;
  const make = (fn) => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = S;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#fff";
    fn(ctx, S / 2, S / 2, S);
    return new THREE.CanvasTexture(cv);
  };
  const circle = make((ctx, cx, cy, s) => {
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.28, 0, Math.PI * 2);
    ctx.fill();
  });
  const tex = {};
  for (const c of Object.keys(CATS)) tex[c] = circle;
  return tex;
}

/**
 * Point-cloud geometry with a pre-seeded bounding sphere covering
 * everything out to the camera far plane (4000 units).
 *
 * Points.raycast computes geometry.boundingSphere lazily on its first run
 * and never refreshes it when the position attribute changes. Clouds are
 * (re)built with zeroed positions that updatePositions() only fills in
 * over the next few ticks, so a pointer event landing in that window
 * would cache a degenerate radius-0 sphere and leave every object in the
 * category unpickable for the rest of the session — which is exactly what
 * happened to whichever clouds were visible when the live sync rebuilt
 * them under the user's cursor. Assigning the sphere up front takes the
 * lazy compute out of the picture entirely.
 */
export function makeCloudGeometry(count) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(Math.max(count, 1) * 3);
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 4000);
  return g;
}

/** (Re)build one point cloud per category from state.sats. */
export function buildClouds() {
  for (const c in clouds) {
    if (clouds[c].points) {
      scene.remove(clouds[c].points);
      clouds[c].geom.dispose();
    }
  }
  for (const c in CATS) clouds[c] = { list: [] };
  for (const s of state.sats) (clouds[s.cat] || clouds.other).list.push(s);
  const SHAPES = makeShapeTextures();
  for (const c in CATS) {
    const list = clouds[c].list;
    const g = makeCloudGeometry(list.length);
    const m = new THREE.PointsMaterial({
      size: CATS[c].px,
      sizeAttenuation: false,
      color: CATS[c].color,
      map: SHAPES[c] || SHAPES.other,
      transparent: true,
      depthWrite: false,
      alphaTest: 0.08,
      opacity: 0.95,
    });
    const p = new THREE.Points(g, m);
    p.frustumCulled = false;
    p.visible = !state.hidden.has(c);
    scene.add(p);
    clouds[c] = { list, points: p, geom: g, posAttr: g.attributes.position };
    list.forEach((s, i) => {
      s._cloud = c;
      s._ci = i;
    });
  }
}

let propCursor = 0;

/**
 * Propagate a budgeted slice of the catalog per tick (round-robin over
 * ~3500 objects) so 11k+ SGP4 runs never stall a frame. The selected
 * object is always propagated fresh.
 */
export function updatePositions(date) {
  const n = state.sats.length;
  if (!n) return;
  const budget = n <= 3000 ? n : 3500;
  for (let k = 0; k < budget; k++) {
    const s = state.sats[(propCursor + k) % n];
    const cl = clouds[s._cloud];
    if (!cl || !cl.posAttr) continue;
    const a = cl.posAttr.array,
      i = s._ci,
      p = safeProp(s.rec, date);
    if (p) {
      a[i * 3] = p.x / KM_U;
      a[i * 3 + 1] = p.z / KM_U;
      a[i * 3 + 2] = p.y / KM_U;
      s.alive = true;
      s._p = p;
    } else {
      a[i * 3] = a[i * 3 + 1] = a[i * 3 + 2] = 0;
      s.alive = false;
    }
  }
  propCursor = (propCursor + budget) % n;
  // selected always fresh
  if (state.selected) {
    const s = state.selected,
      p = safeProp(s.rec, date),
      cl = clouds[s._cloud];
    if (p && cl && cl.posAttr) {
      const a = cl.posAttr.array,
        i = s._ci;
      a[i * 3] = p.x / KM_U;
      a[i * 3 + 1] = p.z / KM_U;
      a[i * 3 + 2] = p.y / KM_U;
      s._p = p;
      s.alive = true;
    }
  }
  for (const c in clouds) if (clouds[c].posAttr) clouds[c].posAttr.needsUpdate = true;
}

import * as THREE from "three";
import { EARTH_R } from "../config.js";
import { DATA } from "../data/store.js";
import { scene } from "./core.js";
import { CITY_LIGHTS } from "./cityLights.js";

// --- earth group (rotates with sidereal time) ---
export const earthGroup = new THREE.Group();

export function geoToVec(latDeg, lonDeg, R) {
  const la = (latDeg * Math.PI) / 180,
    lo = (lonDeg * Math.PI) / 180;
  return new THREE.Vector3(
    Math.cos(la) * Math.cos(lo) * R,
    Math.sin(la) * R,
    Math.cos(la) * Math.sin(lo) * R
  );
}

// ---------------------------------------------------------------------------
// Globe styles. "real" (default): day/night Earth with atmosphere halo, real
// city lights and ocean sun glint. "ops": dark chart-style display — glowing
// coastlines, graticule, cyan city markers — that lets the satellite clouds
// dominate. Both are painted procedurally from DATA.land (no image payload);
// a style's textures/materials are built lazily on first use and cached, so
// toggling costs one texture build the first time and nothing after.
// ---------------------------------------------------------------------------
export const GLOBE_STYLES = ["real", "ops"];
const STYLE_KEY = "ot-globe-style";

export function loadGlobeStyle() {
  try {
    const s = localStorage.getItem(STYLE_KEY);
    return GLOBE_STYLES.includes(s) ? s : "real";
  } catch {
    return "real";
  }
}

const TEX_W = 2048,
  TEX_H = 1024;

const makeRnd = (seed) => {
  let s = seed | 0;
  return () => {
    s = Math.imul(s ^ (s >>> 15), s | 1);
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  };
};

/** Shared canvas helpers: equirect projection, land path, land-mask lookup. */
function mapHelpers() {
  const W = TEX_W,
    H = TEX_H;
  const X = (lon) => ((lon + 180) / 360) * W,
    Y = (lat) => ((90 - lat) / 180) * H;
  const path = (ctx) => {
    ctx.beginPath();
    for (const ring of DATA.land) {
      ring.forEach((p, i) => {
        const x = X(p[0]),
          y = Y(p[1]);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.closePath();
    }
  };
  const mask = document.createElement("canvas");
  mask.width = W;
  mask.height = H;
  const mc = mask.getContext("2d");
  mc.fillStyle = "#000";
  mc.fillRect(0, 0, W, H);
  mc.fillStyle = "#fff";
  path(mc);
  mc.fill("evenodd");
  const md = mc.getImageData(0, 0, W, H).data;
  const isLand = (x, y) => md[((y | 0) * W + (x | 0)) * 4] > 128;
  return { W, H, X, Y, path, mask, isLand };
}

function toTexture(cv, aniso) {
  const t = new THREE.CanvasTexture(cv);
  t.flipY = false;
  // repeat-wrap horizontally so mip sampling works across the ±180° UV seam
  // (clamp leaves a dashed column of bottom-mip texels down the antimeridian)
  t.wrapS = THREE.RepeatWrapping;
  if (aniso) t.anisotropy = aniso;
  return t;
}

/**
 * Paint city glows into an ImageData. Brightness is baked into RGB (alpha
 * pinned to 255) so canvas premultiply behavior can't change the look.
 * opts: rgb [r,g,b]; coolRgb optional whiter variant (12% of dots);
 * dotsPerWeight / sigmaBase / sigmaPerWeight size the clusters;
 * rural adds N faint scattered land dots between metros.
 */
function paintCityLights(ni, geo, opts) {
  const { W, H, X, Y, isLand } = geo;
  const rnd = makeRnd(0x12345678);
  const gauss = () => rnd() + rnd() + rnd() - 1.5;
  const plot = (x, y, b, rgb) => {
    if (x < 0) x += W;
    if (x >= W) x -= W;
    if (y < 0 || y >= H) return;
    const p = ((y | 0) * W + (x | 0)) * 4;
    ni.data[p] = Math.min(255, ni.data[p] + rgb[0] * b);
    ni.data[p + 1] = Math.min(255, ni.data[p + 1] + rgb[1] * b);
    ni.data[p + 2] = Math.min(255, ni.data[p + 2] + rgb[2] * b);
    ni.data[p + 3] = 255;
  };
  for (const [lat, lon, w] of CITY_LIGHTS) {
    const cx = X(lon),
      cy = Y(lat);
    plot(cx, cy, 0.95, opts.rgb);
    if (w >= 5) {
      plot(cx + 1, cy, 0.7, opts.rgb);
      plot(cx - 1, cy, 0.7, opts.rgb);
      plot(cx, cy + 1, 0.7, opts.rgb);
      plot(cx, cy - 1, 0.7, opts.rgb);
    }
    const n = opts.dotsPerWeight * w,
      sigma = opts.sigmaBase + w * opts.sigmaPerWeight;
    for (let i = 0; i < n; i++) {
      const dx = gauss() * sigma * 1.8,
        dy = gauss() * sigma;
      const x = cx + dx,
        y = cy + dy;
      // keep cluster dots on land, except right at a (coastal) city center
      if (!isLand(((x % W) + W) % W, y) && Math.hypot(dx, dy) > 2) continue;
      const cool = opts.coolRgb && rnd() < 0.12;
      plot(x, y, 0.22 + rnd() * 0.5, cool ? opts.coolRgb : opts.rgb);
    }
  }
  for (let i = 0; i < (opts.rural || 0); i++) {
    const x = (rnd() * W) | 0,
      y = (rnd() * H) | 0;
    if (!isLand(x, y)) continue;
    const lat = 90 - (y / H) * 180;
    if (Math.abs(lat) > 62) continue;
    plot(x, y, 0.06 + rnd() * 0.12, opts.rgb);
  }
}

// --- "real" style: day/night textures + land mask -------------------------
function paintRealTextures(geo) {
  const { W, H, Y, path, mask, isLand } = geo;
  const day = document.createElement("canvas");
  day.width = W;
  day.height = H;
  const d = day.getContext("2d");
  // ocean: deep navy gradient
  const og = d.createLinearGradient(0, 0, 0, H);
  og.addColorStop(0, "#0c2036");
  og.addColorStop(0.5, "#10395f");
  og.addColorStop(1, "#0c2036");
  d.fillStyle = og;
  d.fillRect(0, 0, W, H);
  // ocean depth blobs
  for (let i = 0; i < 3500; i++) {
    d.fillStyle = "rgba(30,90,140,0.05)";
    d.beginPath();
    d.arc(Math.random() * W, Math.random() * H, Math.random() * 48 + 12, 0, Math.PI * 2);
    d.fill();
  }
  // land: latitude-based gradient (olive/khaki/arctic)
  d.save();
  path(d);
  d.clip("evenodd");
  const lg = d.createLinearGradient(0, 0, 0, H);
  lg.addColorStop(0, "#dfe6dd");
  lg.addColorStop(0.16, "#6c7c46");
  lg.addColorStop(0.34, "#7d8a48");
  lg.addColorStop(0.5, "#9c8b4e");
  lg.addColorStop(0.66, "#73813f");
  lg.addColorStop(0.86, "#5c6c38");
  lg.addColorStop(1, "#e6ebe2");
  d.fillStyle = lg;
  d.fillRect(0, 0, W, H);
  // land texture dots (fast: ImageData approach)
  const id = d.getImageData(0, 0, W, H);
  const rnd = makeRnd(0xdeadbeef);
  for (let i = 0; i < 55000; i++) {
    const x = (rnd() * W) | 0,
      y = (rnd() * H) | 0;
    if (!isLand(x, y)) continue;
    const r = rnd(),
      p = (y * W + x) * 4;
    if (r < 0.5) {
      id.data[p] -= 18;
      id.data[p + 1] -= 14;
      id.data[p + 2] -= 8;
    } else if (r < 0.82) {
      id.data[p] += 12;
      id.data[p + 1] += 8;
      id.data[p + 2] -= 4;
    } else {
      id.data[p] += 20;
      id.data[p + 1] += 18;
      id.data[p + 2] += 12;
    }
  }
  d.putImageData(id, 0, 0);
  d.restore();
  // polar land ice: clipped to real coastlines so Greenland and Antarctica
  // read as ice sheets instead of flat white bands
  d.save();
  path(d);
  d.clip("evenodd");
  const ng = d.createLinearGradient(0, 0, 0, Y(56));
  ng.addColorStop(0, "rgba(240,246,252,0.97)");
  ng.addColorStop(0.45, "rgba(240,246,252,0.75)");
  ng.addColorStop(0.8, "rgba(240,246,252,0.25)");
  ng.addColorStop(1, "rgba(240,246,252,0)");
  d.fillStyle = ng;
  d.fillRect(0, 0, W, Y(56));
  const sg = d.createLinearGradient(0, Y(-56), 0, H);
  sg.addColorStop(0, "rgba(240,246,252,0)");
  sg.addColorStop(0.35, "rgba(240,246,252,0.55)");
  sg.addColorStop(0.6, "rgba(240,246,252,0.9)");
  sg.addColorStop(1, "rgba(240,246,252,0.97)");
  d.fillStyle = sg;
  d.fillRect(0, Y(-56), W, H - Y(-56));
  d.restore();
  // arctic pack ice (ocean, feathered toward the pole)
  const pg = d.createLinearGradient(0, 0, 0, Y(78));
  pg.addColorStop(0, "rgba(226,238,248,0.85)");
  pg.addColorStop(0.55, "rgba(226,238,248,0.35)");
  pg.addColorStop(1, "rgba(226,238,248,0)");
  d.fillStyle = pg;
  d.fillRect(0, 0, W, Y(78));
  // coastline stroke
  d.strokeStyle = "rgba(18,40,55,0.45)";
  d.lineWidth = 1;
  path(d);
  d.stroke();
  // night lights: real metro areas, warm sodium tint
  const night = document.createElement("canvas");
  night.width = W;
  night.height = H;
  const nc = night.getContext("2d");
  const ni = nc.createImageData(W, H);
  paintCityLights(ni, geo, {
    rgb: [255, 198, 116],
    coolRgb: [235, 225, 200],
    dotsPerWeight: 26,
    sigmaBase: 1.2,
    sigmaPerWeight: 0.75,
    rural: 3000,
  });
  nc.putImageData(ni, 0, 0);
  return {
    day: toTexture(day, 4),
    night: toTexture(night),
    landMask: toTexture(mask),
  };
}

// --- "ops" style: dark chart map + cyan city markers -----------------------
function paintOpsTextures(geo) {
  const { W, H, X, Y, path } = geo;
  const day = document.createElement("canvas");
  day.width = W;
  day.height = H;
  const d = day.getContext("2d");
  // ocean: near-black blue
  d.fillStyle = "#04070c";
  d.fillRect(0, 0, W, H);
  // land: dark slate fill
  d.save();
  path(d);
  d.clip("evenodd");
  d.fillStyle = "#101820";
  d.fillRect(0, 0, W, H);
  d.restore();
  // graticule every 15°, equator & prime meridian emphasized
  d.lineWidth = 1;
  for (let lon = -180; lon <= 180; lon += 15) {
    d.strokeStyle = lon === 0 ? "rgba(110,170,210,0.20)" : "rgba(110,170,210,0.08)";
    d.beginPath();
    d.moveTo(X(lon), 0);
    d.lineTo(X(lon), H);
    d.stroke();
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    d.strokeStyle = lat === 0 ? "rgba(110,170,210,0.20)" : "rgba(110,170,210,0.08)";
    d.beginPath();
    d.moveTo(0, Y(lat));
    d.lineTo(W, Y(lat));
    d.stroke();
  }
  // coastline glow: wide soft pass, medium pass, bright core
  d.strokeStyle = "rgba(60,190,240,0.14)";
  d.lineWidth = 3.2;
  path(d);
  d.stroke();
  d.strokeStyle = "rgba(90,215,255,0.32)";
  d.lineWidth = 1.6;
  path(d);
  d.stroke();
  d.strokeStyle = "rgba(170,240,255,0.8)";
  d.lineWidth = 0.7;
  path(d);
  d.stroke();
  // city markers: cool cyan-white clusters
  const night = document.createElement("canvas");
  night.width = W;
  night.height = H;
  const nc = night.getContext("2d");
  const ni = nc.createImageData(W, H);
  paintCityLights(ni, geo, {
    rgb: [150, 225, 255],
    dotsPerWeight: 18,
    sigmaBase: 1.0,
    sigmaPerWeight: 0.6,
  });
  nc.putImageData(ni, 0, 0);
  return { day: toTexture(day, 4), night: toTexture(night) };
}

// --- shaders ---------------------------------------------------------------
// One vertex shader for both earth styles; both styles receive sunDir.
const EARTH_VERT = `uniform vec3 sunDir;
varying vec3 vN; varying vec3 vWN; varying vec3 vWP; varying vec3 vSunW;
void main(){
  vN=normalize(position);
  vWN=normalize(mat3(modelMatrix)*position);
  vWP=(modelMatrix*vec4(position,1.0)).xyz;
  vSunW=normalize(mat3(modelMatrix)*sunDir);
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
}`;

const EARTH_FRAG_REAL = `uniform sampler2D dayMap; uniform sampler2D nightMap; uniform sampler2D landMask; uniform vec3 sunDir;
varying vec3 vN; varying vec3 vWN; varying vec3 vWP; varying vec3 vSunW;
const float PI=3.14159265, HALF_PI=1.57079633;
void main(){
  vec3 N=normalize(vN);
  float lat=asin(clamp(N.y,-1.0,1.0)); float lon=atan(N.z,N.x);
  vec2 uv=vec2((lon+PI)/(2.0*PI),(HALF_PI-lat)/PI);
  float dp=dot(N,normalize(sunDir));
  float day=smoothstep(-0.12,0.22,dp);
  vec3 dayC=texture2D(dayMap,uv).rgb;
  vec3 lights=texture2D(nightMap,uv).rgb;
  vec3 nightC=dayC*0.05+lights*1.35;
  vec3 col=mix(nightC,dayC,day);
  float term=smoothstep(-0.05,0.12,dp)*(1.0-smoothstep(0.12,0.5,dp));
  col+=vec3(0.20,0.09,0.03)*term;
  // ocean sun glint
  vec3 WN=normalize(vWN);
  vec3 V=normalize(cameraPosition-vWP);
  float ocean=1.0-texture2D(landMask,uv).r;
  float spec=pow(max(dot(reflect(-normalize(vSunW),WN),V),0.0),48.0)*ocean*day*0.6;
  col+=vec3(1.0,0.93,0.78)*spec;
  // atmospheric in-scatter at the limb
  float fres=pow(1.0-max(dot(WN,V),0.0),2.6);
  col+=vec3(0.22,0.46,0.95)*fres*(0.10+0.55*day);
  gl_FragColor=vec4(col,1.0);
}`;

const EARTH_FRAG_OPS = `uniform sampler2D dayMap; uniform sampler2D nightMap; uniform vec3 sunDir;
varying vec3 vN; varying vec3 vWN; varying vec3 vWP; varying vec3 vSunW;
const float PI=3.14159265, HALF_PI=1.57079633;
void main(){
  vec3 N=normalize(vN);
  float lat=asin(clamp(N.y,-1.0,1.0)); float lon=atan(N.z,N.x);
  vec2 uv=vec2((lon+PI)/(2.0*PI),(HALF_PI-lat)/PI);
  float dp=dot(N,normalize(sunDir));
  float day=smoothstep(-0.12,0.22,dp);
  vec3 base=texture2D(dayMap,uv).rgb;
  vec3 lights=texture2D(nightMap,uv).rgb;
  // compressed day/night: readable everywhere, day side slightly lifted
  vec3 col=base*(0.55+0.45*day)+lights*(0.4+0.6*(1.0-day));
  // thin cool terminator line instead of a warm glow band
  float t=1.0-smoothstep(0.0,0.07,abs(dp));
  col+=vec3(0.05,0.30,0.42)*t*0.55;
  // cyan rim
  vec3 WN=normalize(vWN);
  vec3 V=normalize(cameraPosition-vWP);
  float fres=pow(1.0-max(dot(WN,V),0.0),2.8);
  col+=vec3(0.10,0.55,0.75)*fres*0.5;
  gl_FragColor=vec4(col,1.0);
}`;

const ATMO_VERT = `uniform vec3 sunDir;
varying vec3 vWN; varying vec3 vWP; varying vec3 vSunW;
void main(){
  vWN=normalize(mat3(modelMatrix)*normal);
  vWP=(modelMatrix*vec4(position,1.0)).xyz;
  vSunW=normalize(mat3(modelMatrix)*sunDir);
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
}`;

const ATMO_FRAG_REAL = `varying vec3 vWN; varying vec3 vWP; varying vec3 vSunW;
void main(){
  vec3 V=normalize(cameraPosition-vWP);
  float d=dot(normalize(vWN),V);
  float i=pow(clamp(0.72-d,0.0,1.72),4.0);
  float sunF=0.18+0.82*smoothstep(-0.35,0.4,dot(normalize(vWN),normalize(vSunW)));
  gl_FragColor=vec4(vec3(0.30,0.55,1.0)*i*sunF*0.22,1.0);
}`;

const ATMO_FRAG_OPS = `varying vec3 vWN; varying vec3 vWP; varying vec3 vSunW;
void main(){
  vec3 V=normalize(cameraPosition-vWP);
  float d=dot(normalize(vWN),V);
  float i=pow(clamp(0.72-d,0.0,1.72),4.0);
  gl_FragColor=vec4(vec3(0.15,0.60,0.70)*i*0.14,1.0);
}`;

const ATMO_OPTS = {
  side: THREE.BackSide,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
};

// main.js writes earthUniforms.sunDir.value every frame; the same uniform
// entry object is shared by every style's materials, so the sun tracks
// correctly no matter which style is active
export let earthUniforms = null;
export let subDot = null;

let earthMesh = null;
let atmoMesh = null;
let currentStyle = null;
const styleCache = {};

function buildStyleMaterials(style) {
  if (styleCache[style]) return styleCache[style];
  const geo = mapHelpers();
  let earth, atmo;
  if (style === "ops") {
    const tex = paintOpsTextures(geo);
    earth = new THREE.ShaderMaterial({
      uniforms: {
        dayMap: { value: tex.day },
        nightMap: { value: tex.night },
        sunDir: earthUniforms.sunDir,
      },
      vertexShader: EARTH_VERT,
      fragmentShader: EARTH_FRAG_OPS,
    });
    atmo = new THREE.ShaderMaterial({
      uniforms: { sunDir: earthUniforms.sunDir },
      vertexShader: ATMO_VERT,
      fragmentShader: ATMO_FRAG_OPS,
      ...ATMO_OPTS,
    });
  } else {
    const tex = paintRealTextures(geo);
    earth = new THREE.ShaderMaterial({
      uniforms: {
        dayMap: { value: tex.day },
        nightMap: { value: tex.night },
        landMask: { value: tex.landMask },
        sunDir: earthUniforms.sunDir,
      },
      vertexShader: EARTH_VERT,
      fragmentShader: EARTH_FRAG_REAL,
    });
    atmo = new THREE.ShaderMaterial({
      uniforms: { sunDir: earthUniforms.sunDir },
      vertexShader: ATMO_VERT,
      fragmentShader: ATMO_FRAG_REAL,
      ...ATMO_OPTS,
    });
  }
  styleCache[style] = { earth, atmo };
  return styleCache[style];
}

export function getGlobeStyle() {
  return currentStyle;
}

/** Switch the globe's visual style ("real" | "ops") and persist the choice. */
export function setGlobeStyle(style) {
  if (!GLOBE_STYLES.includes(style)) style = "real";
  if (style === currentStyle) return;
  const mats = buildStyleMaterials(style);
  earthMesh.material = mats.earth;
  atmoMesh.material = mats.atmo;
  currentStyle = style;
  try {
    localStorage.setItem(STYLE_KEY, style);
  } catch {
    // storage unavailable (private mode) — style just won't persist
  }
}

/** Build the globe. Requires DATA.land to be loaded. */
export function initEarth() {
  scene.add(earthGroup);
  earthUniforms = { sunDir: { value: new THREE.Vector3(1, 0, 0) } };
  earthMesh = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 72, 48));
  atmoMesh = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R * 1.05, 72, 48));
  earthGroup.add(earthMesh);
  earthGroup.add(atmoMesh);
  setGlobeStyle(loadGlobeStyle());
  // subpoint marker (object space, rotates with geography)
  subDot = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_R * 0.013, 14, 14),
    new THREE.MeshBasicMaterial({ color: 0xaee3ff })
  );
  subDot.visible = false;
  earthGroup.add(subDot);
  // --- lighting (sun) ---
  const sunLight = new THREE.DirectionalLight(0xfff4e6, 2.4);
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0x33445a, 0.55));
}

import * as THREE from "three";
import { EARTH_R } from "../config.js";
import { DATA } from "../data/store.js";
import { scene } from "./core.js";

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

// --- procedural Earth: canvas day/night textures built from coastline data ---
function buildEarthTextures() {
  const W = 2048,
    H = 1024;
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
  // land mask
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
  // day texture
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
  let s = 0xdeadbeef | 0;
  const rnd = () => {
    s = Math.imul(s ^ (s >>> 15), s | 1);
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  };
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
  // ice caps
  d.fillStyle = "rgba(238,243,248,0.92)";
  d.fillRect(0, 0, W, Y(80));
  d.fillRect(0, Y(-72), W, H - Y(-72));
  // coastline stroke
  d.strokeStyle = "rgba(18,40,55,0.45)";
  d.lineWidth = 1;
  path(d);
  d.stroke();
  // night lights (fast ImageData)
  const night = document.createElement("canvas");
  night.width = W;
  night.height = H;
  const nc = night.getContext("2d");
  const ni = nc.createImageData(W, H);
  let s2 = 0x12345678 | 0;
  const rnd2 = () => {
    s2 = Math.imul(s2 ^ (s2 >>> 15), s2 | 1);
    s2 ^= s2 + Math.imul(s2 ^ (s2 >>> 7), s2 | 61);
    return ((s2 ^ (s2 >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < 9000; i++) {
    const x = (rnd2() * W) | 0,
      y = (rnd2() * H) | 0;
    if (!isLand(x, y)) continue;
    const lat = 90 - (y / H) * 180;
    if (Math.abs(lat) > 68 || rnd2() > 0.52) continue;
    const a = (rnd2() * 128 + 80) | 0,
      p = (y * W + x) * 4;
    ni.data[p] = 255;
    ni.data[p + 1] = 195;
    ni.data[p + 2] = 110;
    ni.data[p + 3] = a;
    if (rnd2() < 0.15 && x + 1 < W) {
      const q = p + 4;
      ni.data[q] = 255;
      ni.data[q + 1] = 195;
      ni.data[q + 2] = 110;
      ni.data[q + 3] = a;
    }
  }
  nc.putImageData(ni, 0, 0);
  const dt = new THREE.CanvasTexture(day),
    nt = new THREE.CanvasTexture(night);
  dt.anisotropy = 4;
  dt.flipY = false;
  nt.flipY = false;
  return { day: dt, night: nt };
}

export let earthUniforms = null;
export let subDot = null;

/** Build the globe. Requires DATA.land to be loaded. */
export function initEarth() {
  scene.add(earthGroup);
  const earthTex = buildEarthTextures();
  earthUniforms = {
    dayMap: { value: earthTex.day },
    nightMap: { value: earthTex.night },
    sunDir: { value: new THREE.Vector3(1, 0, 0) },
  };
  const earthMat = new THREE.ShaderMaterial({
    uniforms: earthUniforms,
    vertexShader: `varying vec3 vN; void main(){ vN=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D dayMap; uniform sampler2D nightMap; uniform vec3 sunDir; varying vec3 vN;
    const float PI=3.14159265, HALF_PI=1.57079633;
    void main(){
      vec3 N=normalize(vN);
      float lat=asin(clamp(N.y,-1.0,1.0)); float lon=atan(N.z,N.x);
      vec2 uv=vec2((lon+PI)/(2.0*PI),(HALF_PI-lat)/PI);
      float dp=dot(N,normalize(sunDir));
      float day=smoothstep(-0.12,0.22,dp);
      vec3 dayC=texture2D(dayMap,uv).rgb;
      vec3 lights=texture2D(nightMap,uv).rgb;
      vec3 nightC=dayC*0.05+lights*1.25;
      vec3 col=mix(nightC,dayC,day);
      float term=smoothstep(-0.05,0.12,dp)*(1.0-smoothstep(0.12,0.5,dp));
      col+=vec3(0.20,0.09,0.03)*term;
      gl_FragColor=vec4(col,1.0);
    }`,
  });
  const earthMesh = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 72, 48), earthMat);
  earthGroup.add(earthMesh);
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

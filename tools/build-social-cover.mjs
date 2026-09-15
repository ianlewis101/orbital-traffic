#!/usr/bin/env node
// Renders the Facebook page cover (and its crop previews) from the project's
// own data, so the artwork stays a picture of the real product rather than an
// illustration of it:
//
//   - the globe is the real coastline set (apps/web/public/data/coastlines.json)
//     in orthographic projection, lit by the real sub-solar point for SNAPSHOT
//   - the night side carries the same CITY_LIGHTS metros scene/cityLights.js
//     paints on the in-app globe
//   - every satellite dot is a real catalogue record: elements read straight
//     off satellites.json's TLE line 2, advanced from epoch to SNAPSHOT as a
//     circular orbit, coloured by its own classify.js category via CATS
//   - the tracked orbit ring is the ISS's actual orbit plane
//
// Output geometry follows Facebook's page-cover rules (see
// design/social/README.md): 1640x624 upload, mobile shows the middle 1109px,
// desktop tucks the profile picture into the bottom left.
//
//   npm run social:cover        -> design/social/*.png
//
// Rasterising goes through headless Chromium directly rather than Playwright,
// which (per tools/generate-icons.mjs) is deliberately not a dependency of
// this repo. Set CHROME=/path/to/chrome if it is not found automatically.

import { readFileSync, writeFileSync, existsSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import zlib from "node:zlib";
import { CITY_LIGHTS } from "../apps/web/src/scene/cityLights.js";
import { CATS } from "../apps/web/src/config.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUB = join(ROOT, "apps/web/public");
const OUT = join(ROOT, "design/social");

// ---------------------------------------------------------------------------
// Canvas + Facebook geometry
// ---------------------------------------------------------------------------
const W = 1640,
  H = 624;
// Mobile crops the cover to 16:9 about the centre: H * (640/360) wide.
const MOBILE_W = Math.round(H * (640 / 360)); // 1109
const MOBILE_X = Math.round((W - MOBILE_W) / 2); // 266

// The instant the picture shows. Fixed so re-renders are reproducible; bump it
// when the catalogue is refreshed and you want a fresher sky. Time of day sets
// the terminator only — the camera is earth-fixed (below), so changing it
// re-lights the same face rather than spinning the planet.
const SNAPSHOT = new Date("2026-09-15T17:25:00Z");

// Marketing object count, rounded down to the thousand — the same figure
// CLAUDE.md's OBJECT COUNT convention maintains everywhere else.
const OBJECT_COUNT_LABEL = "19,000+";

// Camera: the earth-fixed point the globe is centred on. Mid-Atlantic puts the
// Americas on the lit limb and Europe/Africa into the night side, where the
// city lights read.
const VIEW_LAT = 18,
  VIEW_LON = -40;
const GLOBE_CX = 1168,
  GLOBE_CY = 664,
  GLOBE_R = 404;

const EARTH_KM = 6371;
const MU = 398600.4418;
const PX_PER_KM = GLOBE_R / EARTH_KM;
const D2R = Math.PI / 180;

// ---------------------------------------------------------------------------
// Small math helpers
// ---------------------------------------------------------------------------
const rnd = (() => {
  // Same cheap deterministic PRNG shape scene/earth.js uses, so the starfield
  // is identical on every machine.
  let s = 0x5eead4;
  return () => {
    s = Math.imul(s ^ (s >>> 15), s | 1);
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  };
})();

const f = (n, d = 1) => Number(n.toFixed(d));

/** Greenwich mean sidereal time, degrees. */
function gmstDeg(date) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const t = (jd - 2451545) / 36525;
  let g =
    280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * t * t - (t * t * t) / 38710000;
  g %= 360;
  return g < 0 ? g + 360 : g;
}

/** Sub-solar point (degrees) — low-precision solar position, ample for art. */
function subSolar(date) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545;
  const L = (280.46 + 0.9856474 * n) * D2R;
  const g = (357.528 + 0.9856003 * n) * D2R;
  const lambda = L + (1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * D2R;
  const eps = (23.439 - 0.0000004 * n) * D2R;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  let lon = (ra / D2R - gmstDeg(date)) % 360;
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  return { lat: dec / D2R, lon };
}

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const geoVec = (latDeg, lonDeg, r = 1) => {
  const la = latDeg * D2R,
    lo = lonDeg * D2R;
  return [r * Math.cos(la) * Math.cos(lo), r * Math.cos(la) * Math.sin(lo), r * Math.sin(la)];
};

const GMST = gmstDeg(SNAPSHOT);
const SUN = subSolar(SNAPSHOT);

// Earth-fixed longitudes rotate into the inertial display frame by GMST, so
// the coastlines, the terminator and the satellites all describe one instant.
const earthFixed = (lat, lon) => geoVec(lat, lon + GMST);

// View basis in that inertial frame: east / north / toward-viewer at the
// earth-fixed camera point, so the visible face is independent of SNAPSHOT.
const vLat = VIEW_LAT * D2R,
  vLon = (VIEW_LON + GMST) * D2R;
const EAST = [-Math.sin(vLon), Math.cos(vLon), 0];
const NORTH = [-Math.sin(vLat) * Math.cos(vLon), -Math.sin(vLat) * Math.sin(vLon), Math.cos(vLat)];
const TOWARD = [Math.cos(vLat) * Math.cos(vLon), Math.cos(vLat) * Math.sin(vLon), Math.sin(vLat)];

/** Vector in the display frame -> {x, y, depth} in canvas pixels. */
function project(v, scale) {
  return {
    x: GLOBE_CX + dot3(v, EAST) * scale,
    y: GLOBE_CY - dot3(v, NORTH) * scale,
    depth: dot3(v, TOWARD),
  };
}

const SUN_VEC = earthFixed(SUN.lat, SUN.lon);
const surface = (lat, lon) => project(earthFixed(lat, lon), GLOBE_R);
/** Lambert term for an earth-fixed point: 1 = noon, <= 0 = night. */
const sunlight = (lat, lon) => dot3(earthFixed(lat, lon), SUN_VEC);

// ---------------------------------------------------------------------------
// Earth: coastline rings, clipped to the visible hemisphere
// ---------------------------------------------------------------------------
const coastlines = JSON.parse(readFileSync(join(PUB, "data", "coastlines.json"), "utf8"));

/**
 * Clip one coastline ring to the visible hemisphere.
 *
 * Dropping the back-facing vertices and closing what is left (the obvious
 * approach) is what inverts a continent that straddles the limb: the closing
 * chord cuts straight across the disc and the fill flips. Instead, each
 * front-facing run is rejoined to the next one *along the limb circle*, which
 * is where the real silhouette runs, so Eurasia and Antarctica fill the same
 * way a fully visible ring does.
 */
function clipRing(ring) {
  const pts = ring.map(([lon, lat]) => {
    const v = earthFixed(lat, lon);
    return { v, front: dot3(v, TOWARD) > 0 };
  });
  if (pts.every((p) => !p.front)) return null;

  // Where the limb is crossed, bisect to the crossing point so the seam lands
  // on the circle rather than a vertex or two away from it.
  const cross = (a, b) => {
    let lo = 0,
      hi = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      const m = [
        a.v[0] + (b.v[0] - a.v[0]) * mid,
        a.v[1] + (b.v[1] - a.v[1]) * mid,
        a.v[2] + (b.v[2] - a.v[2]) * mid,
      ];
      if (dot3(m, TOWARD) > 0 === a.front) lo = mid;
      else hi = mid;
    }
    const t = (lo + hi) / 2;
    const m = [
      a.v[0] + (b.v[0] - a.v[0]) * t,
      a.v[1] + (b.v[1] - a.v[1]) * t,
      a.v[2] + (b.v[2] - a.v[2]) * t,
    ];
    const len = Math.hypot(m[0], m[1], m[2]) || 1;
    return [m[0] / len, m[1] / len, m[2] / len];
  };

  // Walk the ring, emitting visible vertices and limb arcs between an exit and
  // the next re-entry.
  const out = [];
  const limbAngle = (v) => Math.atan2(dot3(v, NORTH), dot3(v, EAST));
  let exitAngle = null;

  const pushLimbArc = (from, to) => {
    let d = to - from;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    const steps = Math.max(2, Math.ceil(Math.abs(d) / 0.05));
    for (let i = 1; i <= steps; i++) {
      const a = from + (d * i) / steps;
      out.push({
        x: GLOBE_CX + Math.cos(a) * GLOBE_R,
        y: GLOBE_CY - Math.sin(a) * GLOBE_R,
      });
    }
  };

  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i],
      next = pts[(i + 1) % pts.length];
    if (cur.front) {
      if (exitAngle !== null) {
        pushLimbArc(exitAngle, limbAngle(cur.v));
        exitAngle = null;
      }
      out.push(project(cur.v, GLOBE_R));
    }
    if (cur.front !== next.front) {
      const c = cross(cur, next);
      if (cur.front) {
        out.push(project(c, GLOBE_R)); // exiting
        exitAngle = limbAngle(c);
      } else {
        // entering: bridge from where we left the visible face
        if (exitAngle !== null) {
          pushLimbArc(exitAngle, limbAngle(c));
          exitAngle = null;
        }
        out.push(project(c, GLOBE_R));
      }
    }
  }
  return out.length > 2 ? out : null;
}

function landPaths() {
  const out = [];
  for (const ring of coastlines) {
    const clipped = clipRing(ring);
    if (clipped) out.push(clipped);
  }
  return out.map((run) => "M" + run.map((p) => `${f(p.x)} ${f(p.y)}`).join("L") + "Z");
}

// ---------------------------------------------------------------------------
// Satellites: real elements, circular propagation from epoch to SNAPSHOT
// ---------------------------------------------------------------------------
const sats = JSON.parse(readFileSync(join(PUB, "data", "satellites.json"), "utf8"));

function epochToDate(l1) {
  const yy = Number(l1.slice(18, 20));
  const doy = Number(l1.slice(20, 32));
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  return new Date(Date.UTC(year, 0, 1) + (doy - 1) * 86400000);
}

/** Circular-orbit state in the inertial display frame, in km. */
function stateVec(l1, l2, at = SNAPSHOT) {
  const inc = Number(l2.slice(8, 16)) * D2R;
  const raan = Number(l2.slice(17, 25)) * D2R;
  const argp = Number(l2.slice(34, 42)) * D2R;
  const m0 = Number(l2.slice(43, 51)) * D2R;
  const n = Number(l2.slice(52, 63)); // rev/day
  if (!Number.isFinite(inc + raan + argp + m0 + n) || n <= 0) return null;
  const nRad = (n * 2 * Math.PI) / 86400;
  const a = Math.cbrt(MU / (nRad * nRad));
  if (!Number.isFinite(a) || a < EARTH_KM + 90) return null; // decayed / bad elset
  const dt = (at - epochToDate(l1)) / 1000;
  const u = m0 + argp + nRad * dt; // circular: argument of latitude
  return { a, inc, raan, u };
}

function atAnomaly({ a, inc, raan }, u) {
  const co = Math.cos(u) * a,
    so = Math.sin(u) * a;
  return project(
    [
      co * Math.cos(raan) - so * Math.cos(inc) * Math.sin(raan),
      co * Math.sin(raan) + so * Math.cos(inc) * Math.cos(raan),
      so * Math.sin(inc),
    ],
    PX_PER_KM
  );
}

const hiddenBehindEarth = (p) =>
  p.depth < 0 && Math.hypot(p.x - GLOBE_CX, p.y - GLOBE_CY) < GLOBE_R;

function satPoints() {
  const pts = [];
  for (const s of sats) {
    if (!s.l1 || !s.l2 || s.l2.length < 63) continue;
    const st = stateVec(s.l1, s.l2);
    if (!st) continue;
    const p = atAnomaly(st, st.u);
    if (p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) continue;
    if (hiddenBehindEarth(p)) continue;
    pts.push({
      x: p.x,
      y: p.y,
      cat: s.cat || "other",
      overEarth: Math.hypot(p.x - GLOBE_CX, p.y - GLOBE_CY) < GLOBE_R,
    });
  }
  return pts;
}

/** The ISS's own orbit plane, sampled as a projected circle. */
function issOrbit() {
  const iss = sats.find((s) => s.l2 && s.l2.slice(2, 7).trim() === "25544");
  if (!iss) return null;
  const st = stateVec(iss.l1, iss.l2);
  if (!st) return null;

  const runs = [];
  let run = [];
  for (let i = 0; i <= 360; i++) {
    const p = atAnomaly(st, i * D2R);
    if (hiddenBehindEarth(p)) {
      if (run.length > 1) runs.push(run);
      run = [];
    } else run.push(p);
  }
  if (run.length > 1) runs.push(run);

  const now = atAnomaly(st, st.u);
  return {
    paths: runs.map((r) => "M" + r.map((p) => `${f(p.x)} ${f(p.y)}`).join("L")),
    marker: hiddenBehindEarth(now) ? null : now,
  };
}

// ---------------------------------------------------------------------------
// SVG assembly
// ---------------------------------------------------------------------------
const catColor = (cat) =>
  "#" + ((CATS[cat] || CATS.other).color >>> 0).toString(16).padStart(6, "0");

/** The app's own spacecraft mark (apps/web/index.html), scaled to `size`. */
function brandMark(x, y, size, gradId) {
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 64 64" fill="none">
    <g transform="rotate(-22 32 32)">
      <rect x="6.5" y="25.5" width="17" height="9" rx="1.4" fill="url(#${gradId})"/>
      <rect x="40.5" y="25.5" width="17" height="9" rx="1.4" fill="url(#${gradId})"/>
      <g stroke="#0b1020" stroke-opacity=".3" stroke-width=".7">
        <path d="M6.5 30h17M40.5 30h17"/>
        <path d="M12.2 26.2v7.6M17.8 26.2v7.6M46.2 26.2v7.6M51.8 26.2v7.6"/>
      </g>
      <rect x="23.2" y="29.35" width="3.2" height="1.1" rx=".55" fill="#cbd5e1"/>
      <rect x="37.6" y="29.35" width="3.2" height="1.1" rx=".55" fill="#cbd5e1"/>
      <rect x="31.55" y="35" width=".9" height="3.6" rx=".45" fill="#cbd5e1"/>
      <rect x="29.4" y="38.2" width="5.2" height="1.7" rx=".75" fill="#f5c168"/>
      <rect x="26" y="24.2" width="12" height="10.8" rx="1.8" fill="#eef1f8"/>
      <path d="M26 29.3h12v3.9a1.8 1.8 0 0 1-1.8 1.8H27.8a1.8 1.8 0 0 1-1.8-1.8Z" fill="#c3ccd8"/>
      <rect x="27.9" y="26.1" width="4.2" height="2.3" rx=".5" fill="#0b1020"/>
    </g>
  </svg>`;
}

function buildSvg() {
  const dots = satPoints();
  // Draw the dim, numerous categories first so stations/capsules land on top.
  const order = [
    "debris",
    "other",
    "starlink",
    "oneweb",
    "kuiper",
    "communications",
    "geostationary",
    "navigation",
    "science",
    "classified",
    "hazardous",
    "capsules",
    "stations",
  ];
  const byCat = new Map();
  for (const d of dots) {
    if (!byCat.has(d.cat)) byCat.set(d.cat, []);
    byCat.get(d.cat).push(d);
  }
  let dotSvg = "";
  const cats = [...order, ...[...byCat.keys()].filter((c) => !order.includes(c))];
  for (const cat of cats) {
    const list = byCat.get(cat);
    if (!list) continue;
    const big = cat === "stations" || cat === "capsules" || cat === "hazardous";
    // Debris is the single largest category and reads as noise at this size;
    // it stays in the picture (it is genuinely most of what is up there) but
    // dimmer, so the belt keeps its shape without burying the globe.
    const quiet = cat === "debris" || cat === "other";
    if (big) {
      dotSvg += `<g fill="${catColor(cat)}" opacity="0.22">${list
        .map((d) => `<circle cx="${f(d.x)}" cy="${f(d.y)}" r="8.5"/>`)
        .join("")}</g>`;
    }
    const r = big ? 3.2 : quiet ? 1.25 : 1.6;
    dotSvg += `<g fill="${catColor(cat)}">${list
      .map(
        (d) =>
          `<circle cx="${f(d.x)}" cy="${f(d.y)}" r="${r}" opacity="${
            big ? 1 : d.overEarth ? (quiet ? 0.4 : 0.6) : quiet ? 0.5 : 0.78
          }"/>`
      )
      .join("")}</g>`;
  }

  const iss = issOrbit();
  const issSvg = iss
    ? `<g fill="none" stroke="#eef1f8" stroke-width="1.5" opacity="0.55" stroke-linecap="round">${iss.paths
        .map((d) => `<path d="${d}"/>`)
        .join("")}</g>` +
      (iss.marker
        ? `<circle cx="${f(iss.marker.x)}" cy="${f(iss.marker.y)}" r="10" fill="#ffd23d" opacity="0.16"/>
           <circle cx="${f(iss.marker.x)}" cy="${f(iss.marker.y)}" r="3.6" fill="#ffd23d"/>`
        : "")
    : "";

  // --- text block -----------------------------------------------------------
  // Everything critical sits inside the mobile safe area (x 266-1375) and to
  // the right of the profile photo, which on desktop covers roughly the
  // bottom-left 420 x 200 of the cover.
  const TX = 424;
  const text = `
  <g>
    ${brandMark(TX - 4, 138, 86, "markGrad")}
    <text x="${TX + 100}" y="193" font-family="Orbitron" font-weight="800" font-size="46"
      letter-spacing="0.6" fill="url(#wmGrad)">Orbital Traffic<tspan font-size="15" dy="-18"
      fill="#737a90">™</tspan></text>
    <text x="${TX + 102}" y="222" font-family="Oxanium" font-weight="500" font-size="13.5"
      letter-spacing="5.4" fill="#737a90">LIVE SPACE SITUATIONAL DISPLAY</text>

    <text x="${TX}" y="304" font-family="Bricolage Grotesque" font-weight="700" font-size="35"
      fill="#eef1f8">See what's above you,</text>
    <text x="${TX}" y="346" font-family="Bricolage Grotesque" font-weight="700" font-size="35"
      fill="#5eead4">right now.</text>

    <g font-family="Oxanium" font-weight="600" font-size="13.5" letter-spacing="1.9"
       stroke="#07080f" stroke-width="3.2" stroke-linejoin="round" paint-order="stroke">
      <rect x="${TX - 1}" y="392" width="266" height="1" fill="rgba(255,255,255,0.14)"/>
      <text x="${TX}" y="428" fill="#9aa2b8">
        <tspan fill="#eef1f8">${OBJECT_COUNT_LABEL}</tspan><tspan fill="#9aa2b8"> OBJECTS</tspan><tspan fill="#5eead4" dx="10">·</tspan><tspan dx="10" fill="#eef1f8">77</tspan><tspan fill="#9aa2b8"> ASTEROIDS</tspan><tspan fill="#5eead4" dx="10">·</tspan><tspan dx="10" fill="#eef1f8">LIVE</tspan><tspan fill="#9aa2b8"> CREW</tspan>
      </text>
      <text x="${TX}" y="458" fill="#5eead4" font-size="15" letter-spacing="3">ORBITALTRAFFIC.APP</text>
    </g>
  </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="markGrad" gradientUnits="userSpaceOnUse" x1="4" y1="4" x2="60" y2="60">
      <stop offset="0%" stop-color="#eef1f8"/><stop offset="45%" stop-color="#5eead4"/>
      <stop offset="100%" stop-color="#a78bfa"/>
    </linearGradient>
    <linearGradient id="wmGrad" gradientUnits="userSpaceOnUse" x1="${TX + 96}" y1="148" x2="${TX + 470}" y2="200">
      <stop offset="12%" stop-color="#eef1f8"/><stop offset="55%" stop-color="#5eead4"/>
      <stop offset="92%" stop-color="#a78bfa"/>
    </linearGradient>

    <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
      <stop offset="72%"  stop-color="#5eead4" stop-opacity="0"/>
      <stop offset="90%"  stop-color="#5eead4" stop-opacity="0.13"/>
      <stop offset="96%"  stop-color="#7dd3fc" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="#7dd3fc" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vignette" cx="0.5" cy="0.44" r="0.72">
      <stop offset="46%"  stop-color="#04040c" stop-opacity="0"/>
      <stop offset="84%"  stop-color="#04040c" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#030309" stop-opacity="0.8"/>
    </radialGradient>
    <linearGradient id="copyScrim" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="#07080f" stop-opacity="0.94"/>
      <stop offset="52%"  stop-color="#07080f" stop-opacity="0.88"/>
      <stop offset="100%" stop-color="#07080f" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <!-- sky, halo and the globe body are painted by the canvas layer beneath -->
  ${issSvg}
  ${dotSvg}

  <rect width="${W}" height="${H}" fill="url(#vignette)"/>
  <rect x="0" y="0" width="1030" height="${H}" fill="url(#copyScrim)"/>
  ${text}
</svg>`;
}

// ---------------------------------------------------------------------------
// Globe layer. Shading a sphere is a per-pixel job — an SVG radial gradient
// cannot put the terminator where the sun actually puts it — so the globe is
// painted into a canvas in the page: real coastlines filled flat, then every
// pixel of the disc shaded by its own surface normal against the sub-solar
// direction, with a dusk band and city lights either side of the terminator.
// ---------------------------------------------------------------------------
function globePayload() {
  const sunView = [dot3(SUN_VEC, EAST), dot3(SUN_VEC, NORTH), dot3(SUN_VEC, TOWARD)];
  const stars = [];
  for (let i = 0; i < 700; i++) {
    const x = rnd() * W,
      y = rnd() * H,
      t = rnd();
    if (Math.hypot(x - GLOBE_CX, y - GLOBE_CY) < GLOBE_R + 6) continue;
    stars.push({
      x: f(x),
      y: f(y),
      r: t > 0.975 ? 1.7 : t > 0.87 ? 1.15 : 0.7,
      o: f(0.16 + rnd() * (t > 0.9 ? 0.72 : 0.4), 2),
      c: t > 0.95 ? "#cfe6ff" : t > 0.89 ? "#ffe8cf" : "#eef1f8",
    });
  }
  return {
    W,
    H,
    cx: GLOBE_CX,
    cy: GLOBE_CY,
    r: GLOBE_R,
    sun: sunView.map((n) => f(n, 4)),
    land: landPaths(),
    cities: CITY_LIGHTS.map(([lat, lon, weight]) => {
      const p = surface(lat, lon);
      return { x: f(p.x), y: f(p.y), d: f(p.depth, 3), l: f(sunlight(lat, lon), 3), w: weight };
    }).filter((c) => c.d > 0.05 && c.l < 0.06),
    stars,
  };
}

const GLOBE_SCRIPT = String.raw`
const G = window.__GLOBE__;
const cv = document.getElementById("globe");
cv.width = G.W; cv.height = G.H;
const ctx = cv.getContext("2d");

// --- sky ---
ctx.fillStyle = "#07080f";
ctx.fillRect(0, 0, G.W, G.H);
for (const s of G.stars) {
  ctx.globalAlpha = s.o; ctx.fillStyle = s.c;
  ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.2832); ctx.fill();
}
ctx.globalAlpha = 1;

// --- flat globe: ocean disc + land ---
const x0 = Math.floor(G.cx - G.r), y0 = Math.floor(G.cy - G.r), side = Math.ceil(G.r * 2) + 2;
ctx.save();
ctx.beginPath(); ctx.arc(G.cx, G.cy, G.r, 0, 6.2832); ctx.clip();
ctx.fillStyle = "#1d4f77";
ctx.fillRect(x0, y0, side, side);
ctx.fillStyle = "#9aa05c";
for (const d of G.land) ctx.fill(new Path2D(d));
ctx.restore();

// --- per-pixel lambert shading over the disc ---
const img = ctx.getImageData(x0, y0, side, side);
const px = img.data;
const [Lx, Ly, Lz] = G.sun;
const smooth = (e0, e1, v) => {
  const t = Math.max(0, Math.min(1, (v - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
for (let j = 0; j < side; j++) {
  for (let i = 0; i < side; i++) {
    const nx = (x0 + i + 0.5 - G.cx) / G.r;
    const ny = -(y0 + j + 0.5 - G.cy) / G.r;
    const q = nx * nx + ny * ny;
    const o = (j * side + i) * 4;
    if (q > 1) { px[o + 3] = 0; continue; }
    const nz = Math.sqrt(1 - q);
    const lam = nx * Lx + ny * Ly + nz * Lz;

    // day 1 -> night 0, with a soft dusk band through the terminator
    const day = smooth(-0.08, 0.26, lam);
    // limb darkening keeps the sphere from looking like a flat disc
    const limb = 0.72 + 0.28 * smooth(0, 0.45, nz);
    const gain = (0.045 + 0.955 * day) * limb;

    let r = px[o] * gain, g = px[o + 1] * gain, b = px[o + 2] * gain;
    // atmospheric scattering: warm at the terminator, cool cast at night
    const dusk = smooth(0, 0.16, lam) * (1 - smooth(0.16, 0.42, lam));
    r += dusk * 62; g += dusk * 30; b += dusk * 8;
    const night = 1 - day;
    r += night * 3; g += night * 7; b += night * 16;
    px[o] = Math.min(255, r); px[o + 1] = Math.min(255, g); px[o + 2] = Math.min(255, b);
  }
}
ctx.putImageData(img, x0, y0);

// --- city lights on the night side ---
ctx.save();
ctx.beginPath(); ctx.arc(G.cx, G.cy, G.r, 0, 6.2832); ctx.clip();
ctx.globalCompositeOperation = "lighter";
for (const c of G.cities) {
  const night = Math.min(1, (0.06 - c.l) / 0.24);
  const facing = Math.min(1, c.d * 1.7);
  const a = 0.09 + 0.58 * night * facing * (0.3 + c.w / 16);
  const rad = 0.7 + c.w * 0.2 * facing;
  const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, rad * 2.2);
  g.addColorStop(0, "rgba(255,214,150," + a.toFixed(3) + ")");
  g.addColorStop(0.45, "rgba(255,186,110," + (a * 0.33).toFixed(3) + ")");
  g.addColorStop(1, "rgba(255,170,90,0)");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(c.x, c.y, rad * 2.2, 0, 6.2832); ctx.fill();
}
ctx.restore();

// --- atmosphere: bright rim on the lit limb, fading round to the night side ---
ctx.save();
ctx.globalCompositeOperation = "lighter";
for (let a = 0; a < 360; a += 0.5) {
  const t = a * Math.PI / 180;
  const nx = Math.cos(t), ny = Math.sin(t);
  const lam = nx * Lx + ny * Ly;
  const lit = Math.max(0, Math.min(1, (lam + 0.22) / 0.8));
  if (lit <= 0.01) continue;
  const gx = G.cx + nx * G.r, gy = G.cy - ny * G.r;
  const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, 34);
  g.addColorStop(0, "rgba(150,236,255," + (0.2 * lit).toFixed(3) + ")");
  g.addColorStop(1, "rgba(94,234,212,0)");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(gx, gy, 34, 0, 6.2832); ctx.fill();
}
ctx.restore();
document.body.dataset.globeReady = "1";
`;

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
const FONTS = {
  Orbitron: "orbitron-latin.woff2",
  Oxanium: "oxanium-latin.woff2",
  "Bricolage Grotesque": "bricolage-grotesque-latin.woff2",
};

function fontFaces() {
  return Object.entries(FONTS)
    .map(([family, file]) => {
      const b64 = readFileSync(join(PUB, "fonts", file)).toString("base64");
      return `@font-face{font-family:'${family}';font-display:block;
        src:url(data:font/woff2;base64,${b64}) format('woff2')}`;
    })
    .join("\n");
}

function chromeBin() {
  const candidates = [
    process.env.CHROME,
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "/opt/pw-browsers/chromium/chrome-linux/chrome",
  ].filter(Boolean);
  const hit = candidates.find((p) => existsSync(p));
  if (!hit) throw new Error("No Chromium found — set CHROME=/path/to/chrome");
  return hit;
}

// --- PNG crop -------------------------------------------------------------
// --window-size sets the OUTER window: headless still reserves room for
// browser chrome, so the viewport is shorter than the window and --screenshot
// pads the difference with the page background. Left alone that quietly eats
// the bottom of the artwork (it ate the URL line from the 820x312 preview
// before this was found). So every shot is taken tall enough that the whole
// composition is inside the viewport, then cropped back to size here.

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function decodePng(buf) {
  const w = buf.readUInt32BE(16),
    h = buf.readUInt32BE(20),
    depth = buf[24],
    colorType = buf[25];
  if (depth !== 8 || (colorType !== 2 && colorType !== 6))
    throw new Error(`unexpected PNG format: depth=${depth} colorType=${colorType}`);
  const bpp = colorType === 6 ? 4 : 3;
  const idat = [];
  for (let off = 8; off + 8 <= buf.length;) {
    const len = buf.readUInt32BE(off);
    if (buf.toString("ascii", off + 4, off + 8) === "IDAT")
      idat.push(buf.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp + 1;
  const out = Buffer.alloc(w * h * bpp);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * stride];
    const line = raw.subarray(y * stride + 1, (y + 1) * stride);
    const row = y * w * bpp,
      prev = row - w * bpp;
    for (let x = 0; x < w * bpp; x++) {
      const a = x >= bpp ? out[row + x - bpp] : 0;
      const b = y > 0 ? out[prev + x] : 0;
      const c = x >= bpp && y > 0 ? out[prev + x - bpp] : 0;
      let v = line[x];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const p = a + b - c,
          pa = Math.abs(p - a),
          pb = Math.abs(p - b),
          pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[row + x] = v & 255;
    }
  }
  return { w, h, bpp, data: out };
}

function encodePng(w, h, bpp, data) {
  const stride = w * bpp;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const chunk = (type, body) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = bpp === 4 ? 6 : 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Crop a rendered screenshot back to the artwork's real size, in place. */
function cropPngFile(file, w, h) {
  const src = decodePng(readFileSync(file));
  if (src.w < w || src.h < h)
    throw new Error(`render too small: got ${src.w}x${src.h}, need ${w}x${h}`);
  const { bpp } = src;
  const out = Buffer.alloc(w * h * bpp);
  for (let y = 0; y < h; y++)
    src.data.copy(out, y * w * bpp, y * src.w * bpp, y * src.w * bpp + w * bpp);
  writeFileSync(file, encodePng(w, h, bpp, out));
}

/** How much taller than its viewport a headless window is, measured once. */
const CHROME_CHROME_PX = (() => {
  const dir = mkdtempSync(join(tmpdir(), "ot-probe-"));
  const probe = join(dir, "probe.html");
  writeFileSync(
    probe,
    `<!doctype html><body><i id=o></i><script>o.textContent=
     "VP:"+(window.outerHeight-window.innerHeight)+":"+(window.outerWidth-window.innerWidth)
     </script>`
  );
  const dom = execFileSync(
    chromeBin(),
    [
      "--headless",
      "--no-sandbox",
      "--disable-gpu",
      "--window-size=1000,800",
      "--dump-dom",
      `file://${probe}`,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
  );
  const m = /VP:(\d+):(\d+)/.exec(dom);
  return m ? { h: Number(m[1]), w: Number(m[2]) } : { h: 120, w: 0 };
})();

/**
 * Screenshot the composition.
 *
 * `crop` cuts a window out of the 1640x624 artwork (that is how the phone crop
 * preview is made) and `scale` renders it at the size Facebook displays it, so
 * legibility can be judged at the real pixel size rather than at 2x.
 */
function shoot(svgMarkup, outPath, { crop = null, scale = 1, overlay = "" } = {}) {
  const cw = crop ? crop.w : W,
    ch = crop ? crop.h : H;
  const width = Math.round(cw * scale),
    height = Math.round(ch * scale);
  const html = `<!doctype html><meta charset="utf-8"><style>
    ${fontFaces()}
    html,body{margin:0;padding:0;background:#07080f;overflow:hidden}
    .view{width:${width}px;height:${height}px;overflow:hidden;position:relative}
    .frame{width:${cw}px;height:${ch}px;overflow:hidden;position:relative;
      transform:scale(${scale});transform-origin:0 0}
    .frame > canvas, .frame > svg{position:absolute;left:${crop ? -crop.x : 0}px;top:0}
  </style><div class="view"><div class="frame">
    <canvas id="globe"></canvas>${svgMarkup}${overlay}
  </div></div>
  <script>window.__GLOBE__ = ${JSON.stringify(GLOBE_DATA)};</script>
  <script>${GLOBE_SCRIPT}</script>`;

  const dir = mkdtempSync(join(tmpdir(), "ot-cover-"));
  const htmlPath = join(dir, "cover.html");
  writeFileSync(htmlPath, html);
  execFileSync(
    chromeBin(),
    [
      "--headless",
      "--no-sandbox",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--default-background-color=07080f",
      `--window-size=${width + CHROME_CHROME_PX.w},${height + CHROME_CHROME_PX.h}`,
      `--screenshot=${outPath}`,
      `file://${htmlPath}`,
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
  cropPngFile(outPath, width, height);
  return `${width}x${height}`;
}

/** Safe-area overlay: what mobile crops off, and where the profile photo lands. */
const GUIDES = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"
  viewBox="0 0 ${W} ${H}" style="position:absolute;left:0;top:0">
  <rect x="0" y="0" width="${MOBILE_X}" height="${H}" fill="#fb7185" opacity="0.16"/>
  <rect x="${MOBILE_X + MOBILE_W}" y="0" width="${W - MOBILE_X - MOBILE_W}" height="${H}"
    fill="#fb7185" opacity="0.16"/>
  <rect x="${MOBILE_X}" y="0" width="${MOBILE_W}" height="${H}" fill="none"
    stroke="#5eead4" stroke-width="3" stroke-dasharray="16 10"/>
  <text x="${MOBILE_X + 16}" y="34" font-family="Oxanium" font-size="17" fill="#5eead4"
    letter-spacing="2.4">MOBILE KEEPS THIS · ${MOBILE_W} × ${H}</text>
  <text x="16" y="34" font-family="Oxanium" font-size="17" fill="#fb7185" letter-spacing="2">CROPPED</text>
  <circle cx="200" cy="524" r="178" fill="#fb7185" opacity="0.14"/>
  <circle cx="200" cy="524" r="178" fill="none" stroke="#fb7185" stroke-width="3"
    stroke-dasharray="12 8"/>
  <text x="96" y="${H - 22}" font-family="Oxanium" font-size="17" fill="#fb7185"
    letter-spacing="2">PROFILE PHOTO</text>
</svg>`;

// One payload for every render, so the starfield is identical across crops.
const GLOBE_DATA = globePayload();
const markup = buildSvg();

const outs = [
  ["cover-facebook.png", shoot(markup, join(OUT, "cover-facebook.png")), "upload this"],
  [
    "preview-desktop.png",
    shoot(markup, join(OUT, "preview-desktop.png"), { scale: 0.5 }),
    "as desktop displays it",
  ],
  [
    "preview-mobile.png",
    shoot(markup, join(OUT, "preview-mobile.png"), {
      crop: { x: MOBILE_X, w: MOBILE_W, h: H },
      scale: 640 / MOBILE_W,
    }),
    "as a phone displays it",
  ],
  [
    "preview-safe-areas.png",
    shoot(markup, join(OUT, "preview-safe-areas.png"), { scale: 0.75, overlay: GUIDES }),
    "crop + profile-photo guides",
  ],
];

for (const [name, size, note] of outs) {
  console.log(`${name.padEnd(24)} ${size.padEnd(10)} ${note}`);
}
console.log(`\nsatellite dots drawn:    ${satPoints().length} of ${sats.length} catalogued`);
console.log(`snapshot:                ${SNAPSHOT.toISOString()}`);
console.log(`sub-solar point:         ${f(SUN.lat)}°, ${f(SUN.lon)}°`);

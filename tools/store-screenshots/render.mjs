/**
 * Step 2 of the App Store screenshot pipeline: compose the captures from
 * capture.mjs into the six 1290x2796 frames App Store Connect wants.
 *
 *   npm i --no-save playwright        # not a repo dependency on purpose
 *   node tools/store-screenshots/render.mjs
 *
 * Output lands in design/store-screenshots/ as RGB PNGs (Chromium writes
 * colour type 2 — no alpha channel — for an opaque page, which is what App
 * Store Connect wants). Pass --jpeg for quality-96 JPEGs instead if a
 * Transporter upload ever objects to PNG.
 *
 * ── The design, and why it is what it is ────────────────────────────────
 *
 * One layout, six times. Fixed eyebrow row, two-line headline, two-line
 * subhead, hairline, proof line, then the real screen starting at exactly the
 * same y in every frame. Nothing in the composition moves between frames, so
 * the only things that change as you swipe are the words, the colour and the
 * app itself — which is what makes six posters read as one set.
 *
 * The screen sits at 91% scale rather than being shrunk to fit under the
 * copy. Losing the bottom of the screen off the canvas costs nothing (the
 * cropped edge implies there is more, and a soft fade keeps the cut from
 * reading as an accident); shrinking it to fit would cost legibility on every
 * label in the app, which is the thing that actually sells a data product.
 *
 * The starfield and the two orbital sweeps are drawn once across a 7,740px
 * panorama — six frames wide — and each frame renders its own slice. Swipe
 * the set in the App Store and the arc carries across the seams instead of
 * restarting six times.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FRAMES, COUNTS } from "./frames.mjs";

const RAW = fileURLToPath(new URL("./raw/", import.meta.url));
const OUT = fileURLToPath(new URL("../../design/store-screenshots/", import.meta.url));
const FONTS = fileURLToPath(new URL("../../apps/web/public/fonts/", import.meta.url));
const BROWSER = process.env.OT_CHROMIUM || "/opt/pw-browsers/chromium";
const JPEG = process.argv.includes("--jpeg");

// ---- canvas / layout ----------------------------------------------------
const W = 1290; // App Store Connect 6.9" iPhone portrait
const H = 2796;
const PANEL_X = 60;
const PANEL_W = W - PANEL_X * 2;
const PANEL_TOP = 812; // identical in all six frames
const SCALE = PANEL_W / W; // 0.907 — the real screen, barely scaled
const MARGIN = 88;
const PANO = W * FRAMES.length;

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("playwright is not installed. Run: npm i --no-save playwright");
  process.exit(1);
}

const geometry = existsSync(`${RAW}geometry.json`)
  ? JSON.parse(readFileSync(`${RAW}geometry.json`, "utf8"))
  : { anchors: {} };

const b64 = (p) => readFileSync(p).toString("base64");
const font = (f) => `url(data:font/woff2;base64,${b64(FONTS + f)}) format('woff2')`;

/** Resolve a frame's crop: a literal y offset, or the anchor capture.mjs measured. */
function cropOf(f) {
  if (typeof f.crop === "number") return f.crop;
  const a = geometry.anchors?.[f.shot];
  if (a == null)
    throw new Error(`frame ${f.id} wants the "${f.shot}" anchor, which capture.mjs did not record`);
  return a;
}

// ---- deterministic starfield across the whole six-frame panorama --------
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function starfield() {
  const rnd = mulberry32(20260819);
  const out = [];
  for (let i = 0; i < 1500; i++) {
    const x = rnd() * PANO;
    const y = rnd() * H;
    const r = rnd();
    const size = r > 0.985 ? 3.4 : r > 0.93 ? 2.2 : r > 0.7 ? 1.5 : 1;
    // Stars only read above the panel, so weight brightness towards the top
    // of the canvas rather than scattering evenly and losing all of them.
    const lift = y < PANEL_TOP ? 1.55 : 0.5;
    const o = Math.min(0.95, (0.12 + rnd() * 0.5) * (size > 2 ? 1.3 : 1) * lift);
    const hue = rnd();
    const fill = hue > 0.9 ? "#ffd9b0" : hue > 0.72 ? "#bcd6ff" : "#ffffff";
    out.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${size / 2}" fill="${fill}" opacity="${o.toFixed(3)}"/>`
    );
  }
  return out.join("");
}

// A rides the headline band; B stays low and mostly hides behind the panel.
const ARC_A = `M -240 1010 C 1500 210, 3050 1140, 4450 560 S 6500 -160, ${PANO + 240} 740`;
const ARC_B = `M -240 2360 C 1700 1500, 3400 2500, 5200 1620 S 7000 2600, ${PANO + 240} 1500`;

function arcNodes(seed, count) {
  const rnd = mulberry32(seed);
  return Array.from({ length: count }, () => ({ off: rnd(), r: 3 + rnd() * 4 }));
}

/** A dot parked at a fixed fraction along one of the arcs. */
const node = (n, path, fill, scale = 1) =>
  `<circle r="${(n.r * scale).toFixed(1)}" fill="${fill}" opacity="0.7">
     <animateMotion dur="1s" fill="freeze" calcMode="linear" keyTimes="0;1"
       keyPoints="${n.off.toFixed(4)};${n.off.toFixed(4)}"><mpath href="#${path}"/></animateMotion>
   </circle>`;

function backgroundSVG(idx) {
  return `
<svg class="bg" width="${PANO}" height="${H}" viewBox="0 0 ${PANO} ${H}"
     style="left:${-idx * W}px" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="arcA" x1="0" y1="0" x2="${PANO}" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#5eead4" stop-opacity="0"/>
      <stop offset="18%" stop-color="#5eead4" stop-opacity="0.42"/>
      <stop offset="55%" stop-color="#8fd6ff" stop-opacity="0.34"/>
      <stop offset="85%" stop-color="#a78bfa" stop-opacity="0.34"/>
      <stop offset="100%" stop-color="#a78bfa" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="arcB" x1="0" y1="0" x2="${PANO}" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#7dd3fc" stop-opacity="0"/>
      <stop offset="45%" stop-color="#7dd3fc" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#ff8fb0" stop-opacity="0"/>
    </linearGradient>
    <path id="pA" d="${ARC_A}"/>
    <path id="pB" d="${ARC_B}"/>
    <!-- the sweep passes behind the copy block instead of straight through it -->
    <linearGradient id="copyMaskG" x1="0" y1="0" x2="0" y2="${H}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff"/>
      <stop offset="${(96 / H).toFixed(4)}" stop-color="#fff"/>
      <stop offset="${(190 / H).toFixed(4)}" stop-color="#000"/>
      <stop offset="${(700 / H).toFixed(4)}" stop-color="#000"/>
      <stop offset="${(790 / H).toFixed(4)}" stop-color="#fff"/>
      <stop offset="1" stop-color="#fff"/>
    </linearGradient>
    <mask id="copyMask"><rect width="${PANO}" height="${H}" fill="url(#copyMaskG)"/></mask>
  </defs>

  <g>${starfield()}</g>

  <g mask="url(#copyMask)">
    <use href="#pA" fill="none" stroke="url(#arcA)" stroke-width="30" opacity="0.09"/>
    <use href="#pA" fill="none" stroke="url(#arcA)" stroke-width="2"/>
    <use href="#pB" fill="none" stroke="url(#arcB)" stroke-width="1.5" stroke-dasharray="16 26"/>
    ${arcNodes(7, 9)
      .map((n) => node(n, "pA", "#5eead4"))
      .join("")}
    ${arcNodes(13, 7)
      .map((n) => node(n, "pB", "#a78bfa", 0.7))
      .join("")}
  </g>
</svg>`;
}

function frameHTML(f, idx) {
  const img = `data:image/png;base64,${b64(`${RAW}${f.shot}.png`)}`;
  const num = String(idx + 1).padStart(2, "0");
  const total = String(FRAMES.length).padStart(2, "0");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
/* the product's own typefaces — the listing should look like the app */
@font-face{font-family:'Bricolage Grotesque';font-weight:400 800;src:${font("bricolage-grotesque-latin.woff2")}}
@font-face{font-family:'Oxanium';font-weight:400 700;src:${font("oxanium-latin.woff2")}}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:#05070e}
.stage{position:relative;width:${W}px;height:${H}px;overflow:hidden;
  background:radial-gradient(150% 62% at 50% -12%,#18203d 0%,#0b1020 42%,#05070e 100%)}
.bg{position:absolute;top:0}
/* the accent reads as light coming off the panel, not as a wash over the copy */
.halo{position:absolute;left:50%;top:${PANEL_TOP - 40}px;width:1600px;height:820px;
  transform:translateX(-50%);pointer-events:none}
.vig{position:absolute;inset:0;
  background:radial-gradient(92% 58% at 50% 34%,rgba(0,0,0,0) 45%,rgba(2,3,8,.62) 100%)}
.grain{position:absolute;inset:0;opacity:.05;mix-blend-mode:overlay}

.copy{position:absolute;left:${MARGIN}px;right:${MARGIN}px;top:112px}
.top{display:flex;align-items:center;justify-content:space-between}
.eyebrow{display:flex;align-items:center;gap:20px;font-family:'Oxanium';font-weight:600;
  font-size:25px;letter-spacing:.30em;text-transform:uppercase;color:${f.type}}
.eyebrow i{display:block;width:52px;height:3px;background:${f.accent};opacity:.9}
.idx{font-family:'Oxanium';font-weight:500;font-size:24px;letter-spacing:.22em;
  color:rgba(226,232,247,.34)}
.idx b{color:${f.type};font-weight:600}

h1{margin-top:74px;font-family:'Bricolage Grotesque';font-weight:800;font-size:113px;
  line-height:.99;letter-spacing:-.035em;color:#f4f7ff}
h1 span{color:${f.type}}
p.sub{margin-top:46px;max-width:1010px;font-family:'Oxanium';font-weight:400;font-size:37px;
  line-height:1.42;color:#a3abc2}

.rule{margin-top:44px;height:1px;background:linear-gradient(90deg,
  ${f.accent}66 0%, rgba(255,255,255,.10) 42%, rgba(255,255,255,0) 100%)}
.chip{margin-top:24px;display:flex;align-items:center;gap:16px;font-family:'Oxanium';
  font-weight:600;font-size:23px;letter-spacing:.17em;text-transform:uppercase;
  color:rgba(226,232,247,.62)}
.chip u{display:block;width:11px;height:11px;border-radius:50%;background:${f.accent};
  box-shadow:0 0 16px ${f.accent}}

.panel{position:absolute;left:${PANEL_X}px;top:${PANEL_TOP}px;width:${PANEL_W}px;
  height:${H - PANEL_TOP + 4}px;border-radius:52px 52px 0 0;overflow:hidden;background:#05070e;
  box-shadow:
    0 0 0 1px rgba(255,255,255,.14),
    0 -22px 70px -26px ${f.accent}59,
    0 40px 120px -30px rgba(0,0,0,.9)}
.panel img{position:absolute;left:0;top:${(-cropOf(f) * SCALE).toFixed(2)}px;
  width:${PANEL_W}px;height:${(H * SCALE).toFixed(2)}px;display:block}
.gloss{position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(180deg,rgba(255,255,255,.06) 0%,rgba(255,255,255,0) 10%)}
/* softens the bleed at the canvas edge so the crop reads as deliberate */
.fade{position:absolute;left:0;right:0;bottom:0;height:190px;pointer-events:none;
  background:linear-gradient(180deg,rgba(5,7,14,0) 0%,rgba(5,7,14,.78) 100%)}
.lip{position:absolute;left:${PANEL_X}px;top:${PANEL_TOP - 1}px;width:${PANEL_W}px;height:2px;
  background:linear-gradient(90deg,transparent,${f.accent}d9 22%,${f.accent}d9 78%,transparent);
  opacity:.7;filter:blur(.4px)}
</style></head><body>
<div class="stage">
  ${backgroundSVG(idx)}
  <svg class="halo" viewBox="0 0 1600 820" xmlns="http://www.w3.org/2000/svg">
    <defs><radialGradient id="hg" cx="50%" cy="62%" r="52%">
      <stop offset="0%" stop-color="${f.accent}" stop-opacity="0.30"/>
      <stop offset="45%" stop-color="${f.accent}" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="${f.accent}" stop-opacity="0"/>
    </radialGradient></defs>
    <ellipse cx="800" cy="510" rx="790" ry="330" fill="url(#hg)"/>
  </svg>
  <div class="vig"></div>
  <svg class="grain" width="${W}" height="${H}"><filter id="n">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch"/>
    <feColorMatrix type="saturate" values="0"/></filter>
    <rect width="100%" height="100%" filter="url(#n)"/></svg>

  <div class="copy">
    <div class="top">
      <div class="eyebrow"><i></i>${f.eyebrow}</div>
      <div class="idx"><b>${num}</b> / ${total}</div>
    </div>
    <h1>${f.head[0]}<br><span>${f.head[1]}</span></h1>
    <p class="sub">${f.sub}</p>
    <div class="rule"></div>
    <div class="chip"><u></u>${f.chip}</div>
  </div>

  <div class="lip"></div>
  <div class="panel"><img src="${img}"><div class="gloss"></div><div class="fade"></div></div>
</div>
</body></html>`;
}

// -------------------------------------------------------------- render ---
for (const f of FRAMES) {
  if (!existsSync(`${RAW}${f.shot}.png`)) {
    console.error(`missing capture: raw/${f.shot}.png — run capture.mjs first`);
    process.exit(1);
  }
}
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: BROWSER, args: ["--no-proxy-server"] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });

console.log(
  `counts: ${COUNTS.objects} objects · ${COUNTS.profiles} profiles · ${COUNTS.neos} NEOs`
);
const manifest = [];
for (const [i, f] of FRAMES.entries()) {
  await page.setContent(frameHTML(f, i), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const file = `${f.id}.${JPEG ? "jpg" : "png"}`;
  await page.screenshot({
    path: OUT + file,
    ...(JPEG ? { type: "jpeg", quality: 96 } : {}),
  });
  const kb = Math.round(statSync(OUT + file).size / 1024);
  manifest.push({ file, headline: f.head.join(" "), eyebrow: f.eyebrow, chip: f.chip, kb });
  console.log(`  ${file}  ${kb} KB`);
}
// A contact sheet so the whole set can be judged the way a shopper meets it —
// side by side, small — rather than one full-size frame at a time.
const thumbW = 400;
const thumbH = Math.round((thumbW * H) / W);
const pad = 28;
const sheetW = thumbW * 3 + pad * 4;
const sheetH = thumbH * 2 + pad * 3;
await page.setViewportSize({ width: sheetW, height: sheetH });
await page.setContent(
  `<style>*{margin:0;box-sizing:border-box}body{width:${sheetW}px;height:${sheetH}px;
     background:#0a0c14;display:grid;grid-template-columns:repeat(3,${thumbW}px);gap:${pad}px;
     padding:${pad}px}
   img{width:${thumbW}px;height:${thumbH}px;display:block;border-radius:14px;
     box-shadow:0 0 0 1px rgba(255,255,255,.08)}</style>
   ${FRAMES.map((_, i) => `<img src="data:image/${JPEG ? "jpeg" : "png"};base64,${b64(OUT + manifest[i].file)}">`).join("")}`,
  { waitUntil: "load" }
);
await page.screenshot({ path: `${OUT}contact-sheet.jpg`, type: "jpeg", quality: 90 });
console.log(
  `  contact-sheet.jpg  ${Math.round(statSync(`${OUT}contact-sheet.jpg`).size / 1024)} KB`
);

await browser.close();

writeFileSync(
  `${OUT}manifest.json`,
  JSON.stringify(
    { size: `${W}x${H}`, renderedAt: new Date().toISOString(), counts: COUNTS, frames: manifest },
    null,
    2
  ) + "\n"
);
console.log(`\ndone -> ${OUT}`);

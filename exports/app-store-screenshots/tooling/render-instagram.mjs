/**
 * Compose the Instagram 4:5 feed variant of the screenshot set.
 *
 *   node exports/app-store-screenshots/tooling/render-instagram.mjs
 *
 * Same captures and the same copy as the App Store sets — read from shots.mjs
 * — re-laid-out for 1080x1350 and written to ../composed-instagram/. Six
 * frames, so it posts as a six-slide carousel.
 *
 * Nothing is cropped: the phone stands at full height and shows the entire
 * captured screen, and the background bleeds to all four edges, so there are
 * no letterbox bars anywhere.
 *
 * 1080 wide is Instagram's native upload width — anything wider is downscaled
 * on their side, so rendering at exactly 1080 avoids a resample we don't
 * control.
 */
import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SHOTS, RAW, loadFill } from "./shots.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../composed-instagram");

const { fill } = await loadFill();

/**
 * IG_H1=<px> renders the whole set at one headline size, ignoring the
 * per-shot overrides — for trialling type scales side by side rather than
 * guessing one.
 */
const H1_OVERRIDE = process.env.IG_H1
  ? `<style>.poster h1{font-size:${Number(process.env.IG_H1)}px!important}</style>`
  : "";

/**
 * The App Store headlines carry hard <br> breaks tuned to a 1128px measure.
 * At this variant's 440px column the interior ones land mid-phrase, so they
 * are dropped and the text flows.
 *
 * The break immediately before the gradient <em> is kept. It separates the
 * plain lead-in from the gradient phrase, and losing it yields "Look up. It's
 * / crowded." — the gradient split across two lines, which reads as a mistake.
 *
 * The words themselves, and which of them sit inside the <em>, are untouched.
 * This is re-typesetting for a narrower measure, not a rewrite.
 */
function reflow(h1) {
  const MARK = "@@KEEPBREAK@@";
  return h1
    .replace(/<br\s*\/?>(\s*<em>)/, MARK + "$1")
    .replace(/<br\s*\/?>/g, " ")
    .replace(MARK, "<br>");
}


/**
 * Background furniture: a seeded starfield and a few wide orbital arcs.
 *
 * The 4:5 frame leaves a tall, narrow column beside the phone that type alone
 * cannot fill without absurd wrapping, so the background has to hold it. Both
 * elements are lifted from what the app itself draws — scene/starfield.js and
 * the orbit rings in scene/trail.js — rather than invented decoration, and
 * both sit at low opacity so the phone stays the brightest thing in frame.
 *
 * Seeded per frame off the file name: each slide gets its own sky, and each
 * re-render reproduces the same one.
 */
function backdrop(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 16777619) >>> 0;
  }
  const rand = () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  let stars = "";
  for (let i = 0; i < 190; i++) {
    const x = (rand() * 1080).toFixed(1);
    const y = (rand() * 1350).toFixed(1);
    const r = (rand() * 1.5 + 0.35).toFixed(2);
    const o = (rand() * 0.5 + 0.12).toFixed(2);
    // a few stars carry the brand tints rather than plain white
    const roll = rand();
    const fill = roll > 0.9 ? "#5eead4" : roll > 0.8 ? "#a78bfa" : "#dbe6ff";
    stars += `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" opacity="${o}"/>`;
  }

  // Wide, mostly off-canvas ellipses reading as orbits passing behind the
  // phone. Centres sit outside the frame so only a long shallow arc crosses it.
  const arcs = [
    { cx: 250, cy: 1500, rx: 980, ry: 720, rot: -18, o: 0.2 },
    { cx: 820, cy: -180, rx: 900, ry: 640, rot: 12, o: 0.15 },
    { cx: 140, cy: 640, rx: 620, ry: 1180, rot: -32, o: 0.11 },
  ]
    .map(
      (a) =>
        `<ellipse cx="${a.cx}" cy="${a.cy}" rx="${a.rx}" ry="${a.ry}" fill="none" ` +
        `stroke="url(#arcGrad)" stroke-width="1.6" opacity="${a.o}" ` +
        `transform="rotate(${a.rot} ${a.cx} ${a.cy})"/>`
    )
    .join("");

  return `<svg class="backdrop" width="1080" height="1350" viewBox="0 0 1080 1350" aria-hidden="true">
  <defs>
    <linearGradient id="arcGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#5eead4"/>
      <stop offset="55%" stop-color="#7dd3fc"/>
      <stop offset="100%" stop-color="#a78bfa"/>
    </linearGradient>
  </defs>
  ${arcs}${stars}
</svg>`;
}

const html = (s) => `${H1_OVERRIDE}<link rel="stylesheet" href="${HERE}/poster.css">
<link rel="stylesheet" href="${HERE}/device.css">
<link rel="stylesheet" href="${HERE}/instagram.css">
<div class="poster">
  <div class="scan"></div>
  ${backdrop(s.file)}
  <div class="device">
    <div class="screen" style="background-image:url('${RAW}/${s.img}')"></div>
    <div class="island"></div>
    <span class="btn l action"></span>
    <span class="btn l volup"></span>
    <span class="btn l voldn"></span>
    <span class="btn r power"></span>
  </div>
  <div class="vig"></div>
  <div class="grain"></div>
  <div class="ticks"><span class="tl"></span><span class="tr"></span><span class="bl"></span><span class="br"></span></div>
  <div class="brandline">ORBITAL TRAFFIC</div>
  <div class="copy">
    <div class="eyebrow">${s.eyebrow}</div>
    <h1${s.igH1Size ? ` style="font-size:${s.igH1Size}px"` : ""}>${fill(reflow(s.h1))}</h1>
    <div class="rule"></div>
    <p class="sub">${fill(s.sub)}</p>
  </div>
</div>`;

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-proxy-server", "--force-device-scale-factor=1"],
});
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });

for (const s of SHOTS) {
  await writeFile(`${HERE}/.page-instagram.html`, html(s));
  await page.goto(`file://${HERE}/.page-instagram.html`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  // Guard the brief: the copy column must not collide with the phone, and the
  // whole phone must sit inside the canvas. A layout that silently overflowed
  // would be exactly the cropping this variant exists to avoid.
  const fit = await page.evaluate(() => {
    const r = (sel) => document.querySelector(sel).getBoundingClientRect();
    const copy = r(".copy");
    const dev = r(".device");
    return {
      copyOverlapsPhone: copy.right > dev.left,
      copyOverflowsCanvas: copy.top < 0 || copy.bottom > 1350,
      phoneOverflowsCanvas: dev.top < 0 || dev.bottom > 1350 || dev.right > 1080,
    };
  });
  const bad = Object.entries(fit).filter(([, v]) => v);
  if (bad.length) throw new Error(`${s.file}: ${bad.map(([k]) => k).join(", ")}`);
  await page.screenshot({ path: `${OUT}/${s.file}` });
  console.log("rendered", s.file);
}

await browser.close();

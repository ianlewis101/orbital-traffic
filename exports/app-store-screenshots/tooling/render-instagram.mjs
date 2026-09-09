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
 * The App Store headlines carry hard <br> breaks tuned to a 1128px measure.
 * At this variant's 387px column the interior ones land mid-phrase, so they
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

const html = (s) => `<link rel="stylesheet" href="${HERE}/poster.css">
<link rel="stylesheet" href="${HERE}/device.css">
<link rel="stylesheet" href="${HERE}/instagram.css">
<div class="poster">
  <div class="scan"></div>
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

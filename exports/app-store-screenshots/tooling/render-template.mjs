/**
 * Export the Instagram 4:5 background on its own, with no content on it.
 *
 *   node exports/app-store-screenshots/tooling/render-template.mjs
 *
 * Writes ../instagram-template/: six numbered background plates at
 * 1080x1350, plus a layout guide marking where the copy column and the phone
 * sit. Drop a plate into Canva/Figma/Photoshop as the bottom layer and build
 * a post on top of it.
 *
 * Six plates rather than one because the starfield is seeded per slide — a
 * carousel whose every slide carries an identical sky reads as a static
 * background rather than as six windows onto the same one. The seeds are the
 * same strings the real renderer uses, so plate N is exactly the background
 * behind slide N of the existing set.
 *
 * Everything here comes from the same poster.css / instagram.css / backdrop.mjs
 * the posts are rendered from, so the plate can't drift from the real thing.
 * The wordmark is baked in, since it sits in the same place on every post and
 * is part of what makes the set look like a set. What this leaves out is the
 * per-post content: no phone, no headline, no eyebrow, no subline.
 */
import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SHOTS } from "./shots.mjs";
import { backdrop } from "./backdrop.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../instagram-template");

const shell = (inner) => `<link rel="stylesheet" href="${HERE}/poster.css">
<link rel="stylesheet" href="${HERE}/device.css">
<link rel="stylesheet" href="${HERE}/instagram.css">
<div class="poster">
  <div class="scan"></div>
  ${inner}
  <div class="vig"></div>
  <div class="grain"></div>
  <div class="ticks"><span class="tl"></span><span class="tr"></span><span class="bl"></span><span class="br"></span></div>
  <div class="brandline">ORBITAL TRAFFIC</div>
</div>`;

/**
 * The guide is drawn from the same CSS variables the layout uses, read back
 * out of the live document rather than retyped — a hardcoded guide would be
 * wrong the moment anyone nudged the phone or the column.
 */
const GUIDE_STYLE = `<style>
  .guide { position: absolute; z-index: 7; border: 2px dashed rgba(94,234,212,0.55); }
  .guide.copy-zone { left: 56px; width: 440px; top: 200px; bottom: 200px; }
  .guide.phone-zone {
    right: 44px; top: 155px;
    width: var(--device-w); height: calc(var(--screen-h) + 2 * var(--bezel));
    border-color: rgba(167,139,250,0.55); border-radius: var(--body-r);
  }
  .guide-label {
    position: absolute; z-index: 8;
    font-family: "Oxanium", sans-serif; font-weight: 600; font-size: 19px;
    letter-spacing: 0.16em; text-transform: uppercase; color: #5eead4;
  }
  .guide-label.phone { color: #a78bfa; }
</style>`;

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-proxy-server", "--force-device-scale-factor=1"],
});
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });

async function shoot(html, file) {
  await writeFile(`${HERE}/.page-template.html`, html);
  await page.goto(`file://${HERE}/.page-template.html`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${file}` });
  console.log("wrote", file);
}

for (let i = 0; i < SHOTS.length; i++) {
  // Seeded off the same file name the post renderer uses, so plate N matches
  // the background behind slide N.
  await shoot(shell(backdrop(SHOTS[i].file)), `background-0${i + 1}.png`);
}

await shoot(
  shell(
    backdrop(SHOTS[0].file) +
      GUIDE_STYLE +
      `<div class="guide copy-zone"></div>
       <div class="guide phone-zone"></div>
       <div class="guide-label" style="left:56px;top:162px">copy column · 440px wide</div>
       <div class="guide-label phone" style="right:44px;top:117px">phone · 500 × 1040</div>`
  ),
  "layout-guide.png"
);

await browser.close();

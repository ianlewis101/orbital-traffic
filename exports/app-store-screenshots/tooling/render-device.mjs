/**
 * Compose the device-framed variant of the App Store screenshots.
 *
 *   node exports/app-store-screenshots/tooling/render-device.mjs
 *
 * Same captures, same copy, same background and type as render.mjs — the only
 * difference is that each app screen sits inside an iPhone mockup instead of
 * bleeding to the canvas edges. Writes ../composed-device/*.png at 1320x2868.
 *
 * The two variants exist to be compared, so this deliberately shares shots.mjs
 * (copy) and poster.css (background, type, corner ticks) with the full-bleed
 * renderer and adds only device.css on top. Anything that differs between the
 * two outputs is therefore the framing itself, not drift.
 *
 * Note the capture is shown WHOLE here, not cropped the way the full-bleed
 * variant crops it: a device mockup that hid part of the screen would not be
 * showing a phone.
 */
import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SHOTS, RAW, loadFill } from "./shots.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../composed-device");

const { fill } = await loadFill();

const html = (s) => `<link rel="stylesheet" href="${HERE}/poster.css">
<link rel="stylesheet" href="${HERE}/device.css">
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
    <h1${s.h1Size ? ` style="font-size:${s.h1Size}px"` : ""}>${fill(s.h1)}</h1>
    <div class="rule"></div>
    <p class="sub">${fill(s.sub)}</p>
  </div>
</div>`;

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-proxy-server", "--force-device-scale-factor=1"],
});
const page = await browser.newPage({ viewport: { width: 1320, height: 2868 } });

for (const s of SHOTS) {
  await writeFile(`${HERE}/.page-device.html`, html(s));
  await page.goto(`file://${HERE}/.page-device.html`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${s.file}` });
  console.log("rendered", s.file);
}

await browser.close();

/**
 * Compose the App Store screenshots from the raw captures.
 *
 *   node exports/app-store-screenshots/tooling/render.mjs
 *
 * Reads ../raw/*.png and ../raw/facts.json, writes ../composed/*.png at
 * 1320x2868 — the App Store's 6.9" display size.
 *
 * Design: full bleed, no device mockup. The poster background is the app's own
 * near-black with its #fx-scan glows and #fx-vignette re-created at poster
 * scale, so the capture never reads as a rectangle pasted onto a marketing
 * board. Type, colour and the accent hairline come from apps/web/src/styles/
 * app.css. The corner ticks are the #bezel motif, which the app itself retired
 * in the Aurora pass — kept here purely as a frame cue.
 *
 * Every number in the copy is interpolated from facts.json, which capture.mjs
 * writes from the same session that produced the pixels. The catalog moves
 * daily; this is what stops a headline claiming a count the screenshot beneath
 * it contradicts.
 */
import { chromium } from "playwright";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = resolve(HERE, "../raw");
const OUT = resolve(HERE, "../composed");

const facts = JSON.parse(await readFile(`${RAW}/facts.json`, "utf8"));

/**
 * shotTop — where the capture's visible region starts on the poster canvas.
 * cropY   — which row of the 1320x2868 capture lands at shotTop.
 *
 * Globe shots crop at 764 so the Orbit Classes legend still reaches the
 * poster's bottom edge. Sheet shots crop at 450 so the bottom sheet keeps its
 * rounded top and drag handle — the cue that this is a real phone screen.
 */
const SHOTS = [
  {
    file: "01-look-up.png",
    img: "01-globe.png",
    shotTop: 764,
    cropY: 764,
    eyebrow: "The whole sky",
    h1: "Look&nbsp;up.<br><em>It's crowded.</em>",
    sub: `<b>{{total}} tracked objects</b>,<br>Live in orbit just for you to explore.`,
  },
  {
    file: "02-overhead.png",
    img: "02-whats-overhead.png",
    // Three headline lines instead of two, so the type drops a step and the
    // panel starts lower to keep the same air under the copy.
    h1Size: 104,
    shotTop: 872,
    cropY: 450,
    eyebrow: "What's overhead",
    h1: "Right&nbsp;now,<br><em>See what objects<br>are overhead</em>",
    sub: "Tap and see what satellites are currently overhead your location.",
  },
  {
    // Card shots share one crop: sheet top at 516 and figure at 705 both land
    // on the poster, and each card's description runs out well before the
    // bottom edge (LINK's is the longest, ending at 1865).
    file: "03-every-dot.png",
    img: "03-link-detail.png",
    shotTop: 764,
    cropY: 450,
    eyebrow: "Every object, explained",
    h1: "Every&nbsp;dot<br><em>has a story.</em>",
    sub: "Who built it, why it's up there — and, for this one, what's gone wrong since.",
  },
  {
    file: "04-capsules.png",
    img: "06-crew-dragon.png",
    shotTop: 764,
    cropY: 450,
    eyebrow: "Crew & cargo",
    h1: "Follow&nbsp;the&nbsp;fleet,<br><em>launch to landing.</em>",
    sub: "Dragon, Soyuz, Progress, Cygnus — followed from liftoff until they come home.",
  },
  {
    file: "05-crew.png",
    img: "05-iss-crew.png",
    shotTop: 764,
    cropY: 450,
    eyebrow: "Life in orbit",
    h1: "{{crewWord}}&nbsp;people<br><em>live up there.</em>",
    sub: "The current crew, their expedition, and what they actually did today.",
  },
];

const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve"];

const vars = {
  total: facts.total,
  overhead: facts.overhead,
  crewWord: WORDS[Number(facts.crew?.aboard)] ?? facts.crew?.aboard,
};

const fill = (t) => t.replace(/\{\{(\w+)\}\}/g, (_, k) => {
  if (vars[k] == null) throw new Error(`facts.json has no value for {{${k}}}`);
  return vars[k];
});

function shotStyle(s) {
  return [
    `top:${s.shotTop}px`,
    `background-image:url('${RAW}/${s.img}')`,
    `background-size:1320px 2868px`,
    `background-position:0 -${s.cropY}px`,
  ].join(";");
}

const html = (s) => `<link rel="stylesheet" href="${HERE}/poster.css">
<div class="poster">
  <div class="scan"></div>
  <div class="shot" style="${shotStyle(s)}"></div>
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
  await writeFile(`${HERE}/.page.html`, html(s));
  await page.goto(`file://${HERE}/.page.html`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${s.file}` });
  console.log("rendered", s.file);
}

await browser.close();

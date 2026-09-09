/**
 * Capture the raw app screens the App Store posters are built from.
 *
 * Runs the real production build against the real production Worker, at 6.9"
 * iPhone proportions (440x956 CSS at deviceScaleFactor 3 = 1320x2868).
 * Writes six PNGs to ../raw plus facts.json, which render.mjs templates the
 * headline numbers from — the catalog moves daily, so the copy is never
 * allowed to drift from the pixels it sits next to.
 *
 *   npm run build
 *   npm run preview -w @orbital-traffic/web -- --port 4173 --strictPort
 *   node exports/app-store-screenshots/tooling/capture.mjs
 *
 * Playwright is a devDependency-free import here on purpose: install it into a
 * scratch dir (`npm i playwright`) and run with NODE_PATH pointing at it, or
 * add it temporarily. Never run `playwright install` — this environment ships
 * Chromium at /opt/pw-browsers/chromium.
 */
import { chromium } from "playwright";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const execFileP = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = resolve(HERE, "../raw");
const APP = process.env.APP_URL || "http://localhost:4173/";
const WORKER = "https://orbital-traffic.ianlewis101.workers.dev";

/** Demo location for What's Overhead. Los Angeles. */
const GEO = { latitude: 34.0522, longitude: -118.2437 };

/**
 * Chromium can't reach the session's egress proxy (its CA isn't in the
 * browser trust store), so Worker requests are relayed through curl, which
 * is already configured for it. The payloads are the real live responses.
 */
let relayActivity = Date.now();
const relayCache = new Map();
async function relay(url) {
  if (relayCache.has(url)) return relayCache.get(url);
  const { stdout } = await execFileP(
    "curl",
    ["-sS", "-m", "60", "-H", "Accept: application/json", url],
    { maxBuffer: 64 * 1024 * 1024 }
  );
  relayCache.set(url, stdout);
  relayActivity = Date.now();
  return stdout;
}

/**
 * Sheet slide-in is a 0.3s keyframe in a real browser but runs roughly ten
 * times slower under SwiftShader, so a fixed timeout catches the card
 * mid-animation with its body unpainted. Poll the animations instead.
 */
async function settle(page, sel) {
  await page.waitForFunction(
    (s) => {
      const el = document.querySelector(s);
      if (!el) return false;
      if (el.getAnimations({ subtree: true }).some((a) => a.playState === "running")) return false;
      const top = Math.round(el.getBoundingClientRect().top);
      const prev = el.__prevTop;
      el.__prevTop = top;
      return prev === top;
    },
    sel,
    { timeout: 60000, polling: 250 }
  );
  await page.waitForTimeout(800);
}

/** Drag the globe. picking.js maps 1px to 0.005rad on cam.thT / cam.phT. */
async function drag(page, dx, dy) {
  const x0 = 300,
    y0 = 520;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(x0 + (dx * i) / 12, y0 + (dy * i) / 12);
  await page.mouse.up();
  await page.waitForTimeout(600);
}

async function zoom(page, ticks) {
  for (let i = 0; i < Math.abs(ticks); i++) {
    await page.mouse.move(300, 520);
    await page.mouse.wheel(0, ticks > 0 ? 120 : -120);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(600);
}

async function selectByName(page, name) {
  await page.click("#search svg"); // mobile: magnifier slides the bar open
  await page.waitForSelector("#search-wrap.expanded");
  await page.fill("#search-in", name);
  await page.waitForSelector("#results .res");
  await page.click("#results .res");
  await page.waitForSelector("#info.show");
  await settle(page, "#info");
}

/** Mean luminance of the frame's middle band, where the globe sits. */
async function meanLuminance(page, buf) {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = 220;
    c.height = 220;
    const g = c.getContext("2d");
    g.drawImage(img, 0, img.height * 0.28, img.width, img.width, 0, 0, 220, 220);
    const d = g.getImageData(0, 0, 220, 220).data;
    let sum = 0;
    for (let p = 0; p < d.length; p += 4) sum += d[p] + d[p + 1] + d[p + 2];
    return sum / (d.length / 4) / 3;
  }, buf.toString("base64"));
}

/**
 * Rotate the globe through a series of steps, scoring each frame's luminance,
 * and return every frame with its score.
 *
 * Both globe shots pick their angle this way rather than from a fixed drag
 * count. Which rotation shows daylight — or the terminator — depends entirely
 * on where the sun is at capture time, so a hard-coded number produces a
 * different picture every time the capture runs at a different hour. That is
 * not hypothetical: a run at 19:55 UTC put the sun over the Americas, and a
 * fixed six drags landed the lead shot on the same fully-lit hemisphere the
 * daylight companion was picking, making two of the six frames near-identical.
 */
async function sweepGlobe(page, { zoomTicks, preDrags, steps }) {
  await zoom(page, zoomTicks);
  for (let i = 0; i < preDrags; i++) await drag(page, -110, 0);
  const frames = [];
  for (let i = 0; i < steps; i++) {
    await drag(page, -110, 0);
    await page.waitForTimeout(1400);
    const buf = await page.screenshot();
    frames.push({ drags: preDrags + i + 1, lit: await meanLuminance(page, buf), buf });
  }
  return frames;
}

/**
 * Lead globe shot: the terminator across the disc, so the night side and its
 * city lights are both in frame. A full rotation's brightest frame is all
 * daylight and its darkest is all night, so the terminator sits between them —
 * this targets a little above the midpoint, which keeps most of the disc lit
 * while still showing the boundary and the lights beyond it.
 */
async function heroCamera(page, screenshotPath) {
  const frames = await sweepGlobe(page, { zoomTicks: 3, preDrags: 3, steps: 9 });
  const lits = frames.map((f) => f.lit);
  const target = Math.min(...lits) + 0.55 * (Math.max(...lits) - Math.min(...lits));
  const best = frames.reduce((a, b) =>
    Math.abs(a.lit - target) <= Math.abs(b.lit - target) ? a : b
  );
  for (const f of frames) {
    console.log(`   hero sweep ${f.drags} drags — mean luminance ${f.lit.toFixed(1)}`);
  }
  console.log(`   hero target ${target.toFixed(1)} -> ${best.drags} drags`);
  await writeFile(screenshotPath, best.buf);
  return Number(best.lit.toFixed(1));
}

/**
 * Daylight companion: one zoom step further out than the lead shot, and the
 * brightest frame of the sweep — the fully sunlit hemisphere.
 */
async function daylightCamera(page, screenshotPath) {
  const frames = await sweepGlobe(page, { zoomTicks: 4, preDrags: 6, steps: 7 });
  const best = frames.reduce((a, b) => (b.lit > a.lit ? b : a));
  for (const f of frames) {
    console.log(`   daylight sweep ${f.drags} drags — mean luminance ${f.lit.toFixed(1)}`);
  }
  console.log(`   daylight -> ${best.drags} drags`);
  await writeFile(screenshotPath, best.buf);
  return Number(best.lit.toFixed(1));
}

await mkdir(RAW, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: [
    "--no-proxy-server",
    "--use-gl=angle",
    "--use-angle=swiftshader", // WebGL under headless in this environment
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
  ],
});

const ctx = await browser.newContext({
  viewport: { width: 440, height: 956 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  serviceWorkers: "block", // never serve a stale sw.js cache of old assets
  permissions: ["geolocation"],
  geolocation: GEO,
  locale: "en-US",
  timezoneId: "America/Los_Angeles",
});

await ctx.route(`${WORKER}/**`, async (route) => {
  try {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: await relay(route.request().url()),
    });
  } catch (e) {
    console.log("relay failed:", route.request().url(), String(e).slice(0, 120));
    await route.abort();
  }
});

/**
 * CelesTrak has to be relayed too, not just the Worker. live.js fetches the
 * Worker's /tle first and falls back to CelesTrak's group feeds when that
 * fails isPlausibleCatalog() — and as of this writing the production Worker
 * is serving a badly short catalog, so the fallback is the live path for real
 * users as well. Relaying both means the capture follows whichever path the
 * app actually takes rather than quietly booting on bundled data.
 */
await ctx.route("**://celestrak.org/**", async (route) => {
  try {
    const { stdout } = await execFileP(
      "curl",
      ["-sS", "-m", "90", "-H", "Accept: text/plain", route.request().url()],
      { maxBuffer: 128 * 1024 * 1024 }
    );
    relayActivity = Date.now();
    await route.fulfill({
      status: 200,
      contentType: "text/csv",
      headers: { "access-control-allow-origin": "*" },
      body: stdout,
    });
  } catch (e) {
    console.log("celestrak relay failed:", String(e).slice(0, 120));
    await route.abort();
  }
});

const page = await ctx.newPage();
page.on("console", (m) => {
  if (m.type() === "error") console.log("PAGE ERROR:", m.text().slice(0, 160));
});

/**
 * Wait out the splash and the live sync.
 *
 * Deliberately does NOT key off any on-screen status wording. This used to
 * wait for "Live positions" in #freshness-line and silently broke when that
 * element stopped carrying its status as text — a capture that hangs for 90s
 * and then dies is the good outcome; the bad one is a run that quietly
 * screenshots a half-synced app. Instead it waits for the relay itself to go
 * quiet, which holds whichever path the sync takes.
 */
async function ready(page) {
  await page.waitForSelector("#splash", { state: "detached", timeout: 60000 });
  const started = Date.now();
  const MIN_WAIT = 9000;
  const QUIET_MS = 5000;
  const MAX_WAIT = 180000;
  for (;;) {
    await page.waitForTimeout(1000);
    const elapsed = Date.now() - started;
    if (elapsed > MAX_WAIT) {
      console.log("  sync wait: hit max, continuing");
      break;
    }
    if (elapsed > MIN_WAIT && Date.now() - relayActivity > QUIET_MS) break;
  }
  // The catalog total is the one signal that is a value rather than a phrase:
  // it renders "…" while ingest runs and a formatted count once it lands.
  await page.waitForFunction(() => /\d/.test(document.querySelector("#legend-tot")?.textContent || ""), null, {
    timeout: 60000,
  });
  await page.waitForTimeout(2500);
}

await page.goto(APP, { waitUntil: "load" });
await ready(page);

const facts = {
  capturedAt: new Date().toISOString(),
  brandMark: await page.evaluate(() => ({
    // The retired orbit-ring mark drew an <ellipse>; the current satellite
    // mark is a group of <rect>s. Asserted rather than eyeballed.
    rects: document.querySelectorAll("#brand svg rect").length,
    ellipse: !!document.querySelector("#brand svg ellipse"),
  })),
};

// ── 1. Hero globe ──────────────────────────────────────────────────────────
facts.heroLuminance = await heroCamera(page, `${RAW}/01-globe.png`);
facts.total = (await page.$eval("#legend-tot", (e) => e.textContent)).trim();
console.log("01 globe —", facts.total, "objects");

// ── 2. What's Overhead ─────────────────────────────────────────────────────
await page.click("#overhead-fab");
await page.waitForSelector("#overhead.show");
await page.waitForFunction(() => document.querySelectorAll("#overhead-list > *").length > 3, null, {
  timeout: 60000,
});
await settle(page, "#overhead");
facts.overhead = (await page.$eval("#overhead-count", (e) => e.textContent)).trim();
await page.screenshot({ path: `${RAW}/02-whats-overhead.png` });
console.log("02 overhead —", facts.overhead, "above 40 degrees");
await page.click("#overhead-x");
await page.waitForTimeout(1500);

// ── 3. LINK detail ─────────────────────────────────────────────────────────
await selectByName(page, "LINK");
await page.waitForFunction(() => !!document.querySelector("#info-launch")?.textContent, null, {
  timeout: 30000,
});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${RAW}/03-link-detail.png` });
console.log("03 LINK detail");

// ── 4. Share card (exported image, not a screen) ───────────────────────────
const dl = page.waitForEvent("download", { timeout: 120000 });
await page.click("#info-share");
await (await dl).saveAs(`${RAW}/04-link-share-card.png`);
console.log("04 share card");

// ── 5. ISS with live crew ──────────────────────────────────────────────────
await selectByName(page, "ISS (ZARYA)");
await page.waitForFunction(
  () => (document.querySelector("#info-crew")?.textContent || "").length > 40,
  null,
  { timeout: 60000 }
);
await page.waitForTimeout(2500);
// Left unscrolled so the object photo is in frame. Note this puts the figure's
// credit line on the poster, and photos.json credits `iss` "Source unconfirmed
// — pre-existing image" — see the README's known-issues section.
facts.crew = await page.evaluate(() => ({
  aboard: document.querySelector(".crew-count")?.textContent?.trim(),
  names: [...document.querySelectorAll(".crew-av-n")].map((e) => e.textContent),
  today: [...document.querySelectorAll(".crew-today-txt")].map((e) => e.textContent),
}));
await page.screenshot({ path: `${RAW}/05-iss-crew.png` });
console.log("05 ISS crew —", facts.crew.aboard, "aboard");

// ── 6. Crew Dragon 12 — a capsule mid-mission ──────────────────────────────
// Docked at the ISS, so its card also carries the station's crew block. Like
// shot 5 this is left unscrolled so the object photo is in frame.
await selectByName(page, "CREW DRAGON 12");
await page.waitForTimeout(3000);
facts.dragon = await page.evaluate(() => ({
  name: document.querySelector("#info-nm")?.textContent,
  cat: document.querySelector("#info-cat")?.textContent?.trim(),
  chips: [...document.querySelectorAll("#info-chips .chip")].map((c) => c.textContent),
}));
await page.screenshot({ path: `${RAW}/06-crew-dragon.png` });
console.log("06 Crew Dragon —", facts.dragon.name, "/", facts.dragon.cat);

// ── 7. Daylight globe ──────────────────────────────────────────────────────
// Reload first: zoom() and drag() are relative, so this would otherwise
// inherit the hero camera and the card selections above.
await page.reload({ waitUntil: "load" });
await ready(page);
facts.daylightLuminance = Number(
  (await daylightCamera(page, `${RAW}/07-globe-daylight.png`)).toFixed(1)
);
console.log("07 daylight globe");

await writeFile(`${RAW}/facts.json`, JSON.stringify(facts, null, 2) + "\n");
console.log("\nfacts.json:", JSON.stringify(facts, null, 2));

await browser.close();

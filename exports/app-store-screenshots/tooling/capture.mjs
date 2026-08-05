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
const relayCache = new Map();
async function relay(url) {
  if (relayCache.has(url)) return relayCache.get(url);
  const { stdout } = await execFileP(
    "curl",
    ["-sS", "-m", "60", "-H", "Accept: application/json", url],
    { maxBuffer: 64 * 1024 * 1024 }
  );
  relayCache.set(url, stdout);
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

/** Hide every legend category except those matching `keep`. */
async function isolate(page, keep) {
  const rows = await page.$$eval("#cats .cat", (els) =>
    els.map((e, i) => ({
      i,
      txt: e.textContent.replace(/\s+/g, " ").trim(),
      off: e.classList.contains("off"),
    }))
  );
  for (const r of rows) {
    const wanted = keep.some((k) => new RegExp(k, "i").test(r.txt));
    if (wanted === !r.off) continue;
    await page.evaluate((i) => document.querySelectorAll("#cats .cat")[i].click(), r.i);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(1500);
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

/** Camera preset used by every globe shot: terminator down the left limb. */
async function heroCamera(page) {
  await zoom(page, 3);
  for (let i = 0; i < 6; i++) await drag(page, -110, 0);
  await page.waitForTimeout(1800);
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

const page = await ctx.newPage();
page.on("console", (m) => {
  if (m.type() === "error") console.log("PAGE ERROR:", m.text().slice(0, 160));
});

/** Wait out the splash and the +2s live sync. */
async function ready(page) {
  await page.waitForSelector("#splash", { state: "detached", timeout: 60000 });
  await page.waitForFunction(
    () => {
      const t = document.querySelector("#freshness-line")?.textContent || "";
      return /live positions/i.test(t) && !/syncing/i.test(t);
    },
    null,
    { timeout: 90000 }
  );
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
await heroCamera(page);
await page.screenshot({ path: `${RAW}/01-globe.png` });
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
// Scroll the figure clear: 11 of the 20 entries in photos.json are credited
// "Source unconfirmed — pre-existing image", and that credit renders over the
// photo. The crew block is the subject of this shot anyway.
await page.evaluate(() => {
  const info = document.querySelector("#info");
  const fig = document.querySelector("#info-figure");
  info.scrollTop = fig.getBoundingClientRect().bottom - info.getBoundingClientRect().top + info.scrollTop + 70;
});
await page.waitForTimeout(1200);
facts.crew = await page.evaluate(() => ({
  aboard: document.querySelector(".crew-count")?.textContent?.trim(),
  names: [...document.querySelectorAll(".crew-av-n")].map((e) => e.textContent),
  today: [...document.querySelectorAll(".crew-today-txt")].map((e) => e.textContent),
}));
await page.screenshot({ path: `${RAW}/05-iss-crew.png` });
console.log("05 ISS crew —", facts.crew.aboard, "aboard");

// ── 6. Starlink shell, every other class hidden ────────────────────────────
// Reload first: zoom() and drag() are relative, so without resetting the rig
// this shot would inherit the hero camera's distance and frame the shell far
// too small. A reload puts cam back at its scene/core.js defaults.
await page.reload({ waitUntil: "load" });
await ready(page);
await isolate(page, ["STARLINK"]);
await zoom(page, 6);
for (let i = 0; i < 6; i++) await drag(page, -110, 0);
await page.waitForTimeout(1800);
await drag(page, 0, -80); // tilt so the shell's plane banding reads
await page.waitForTimeout(1800);
facts.starlink = await page.$$eval("#cats .cat", (els) => {
  const r = els.find((e) => /STARLINK/i.test(e.textContent));
  return (r?.textContent.replace(/\s+/g, " ").match(/([\d,]+)\s*$/) || [])[1];
});
await page.screenshot({ path: `${RAW}/06-starlink-shell.png` });
console.log("06 Starlink shell —", facts.starlink);

await writeFile(`${RAW}/facts.json`, JSON.stringify(facts, null, 2) + "\n");
console.log("\nfacts.json:", JSON.stringify(facts, null, 2));

await browser.close();

/**
 * Step 1 of the App Store screenshot pipeline: drive the real app and capture
 * the six screens the marketing frames are built from.
 *
 * Nothing here is mocked up. Every capture is the built app running in a
 * 1290x2796 iPhone viewport against live Worker data, so what the App Store
 * listing shows is what the app actually renders. Run render.mjs afterwards to
 * compose the frames.
 *
 *   npm run build
 *   npm run preview -w @orbital-traffic/web -- --port 4173 --strictPort
 *   npm i --no-save playwright        # not a repo dependency on purpose
 *   node tools/store-screenshots/capture.mjs
 *
 * Playwright is deliberately not in package.json: it is a one-off design tool,
 * and adding it would make every CI `npm ci` pull a browser download.
 *
 * Live data: /crew, /today and /capsules are fetched from the production
 * Worker and replayed into the page as route fixtures rather than letting the
 * browser reach the network directly, so a capture run is reproducible and
 * works behind a proxy. If the Worker is unreachable the run stops rather than
 * quietly shipping screenshots that say "crew data temporarily unavailable".
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as satellite from "satellite.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const OUT = fileURLToPath(new URL("./raw/", import.meta.url));
const APP = process.env.OT_PREVIEW_URL || "http://localhost:4173/";
const WORKER = "https://orbital-traffic.ianlewis101.workers.dev";
const BROWSER = process.env.OT_CHROMIUM || "/opt/pw-browsers/chromium";

// The 6.9" iPhone canvas App Store Connect wants, expressed as the CSS
// viewport the app actually lays out at, times its device pixel ratio.
const VIEWPORT = { width: 430, height: 932 };
const DPR = 3;

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("playwright is not installed. Run: npm i --no-save playwright");
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- fixtures
const tle = JSON.parse(readFileSync(`${ROOT}apps/web/public/data/satellites.json`, "utf8"));

async function live(path) {
  const r = await fetch(`${WORKER}${path}`, { signal: AbortSignal.timeout(45000) });
  if (!r.ok) throw new Error(`${path} -> HTTP ${r.status}`);
  return r.json();
}

console.log("fetching live Worker data…");
let crew, today, capsules;
try {
  [crew, today, capsules] = await Promise.all([live("/crew"), live("/today"), live("/capsules")]);
} catch (err) {
  console.error(`Worker unreachable (${err.message}).`);
  console.error("The crew and capsule frames need real data — fix the network and re-run.");
  process.exit(1);
}
console.log(
  `  crew: ${crew.number} in space · capsules: ${Object.keys(capsules.capsules).length} tracked`
);

// The crew card can expand one person's profile, which pulls their portrait
// from The Space Devs' CDN. Fetch it up front so the browser never needs to
// reach out mid-capture.
const commander = crew.people.find((p) => /commander/i.test(p.role || "")) || crew.people[0];
const profile = await live(`/astronaut?id=${commander.id}`);
const portrait = Buffer.from(
  await (await fetch(profile.image, { signal: AbortSignal.timeout(45000) })).arrayBuffer()
);

// ------------------------------------------------------- observer geometry
/**
 * Put the observer under the ISS.
 *
 * "What's overhead" is the app's best feature and its screenshot has to show
 * it at its best: a real pass of the whole station complex — ISS modules, the
 * docked Dragon, Progress, Cygnus and Soyuz — all high in the sky at once.
 * That is a genuine app state that any user gets during an ISS pass; picking
 * the moment is the only thing being staged here.
 */
function issSubpoint(at) {
  const iss = tle.find((r) => r.l1 && r.l1.includes("25544"));
  const satrec = satellite.twoline2satrec(iss.l1, iss.l2);
  const pv = satellite.propagate(satrec, at);
  const g = satellite.eciToGeodetic(pv.position, satellite.gstime(at));
  return {
    latitude: satellite.degreesLat(g.latitude),
    longitude: satellite.degreesLong(g.longitude),
  };
}

// ------------------------------------------------------------------- drive
const browser = await chromium.launch({
  executablePath: BROWSER,
  args: ["--no-proxy-server", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const ctx = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: DPR,
  isMobile: true,
  hasTouch: true,
  serviceWorkers: "block",
  geolocation: { latitude: 32.7767, longitude: -96.797 },
  permissions: ["geolocation"],
});

const json = (body) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});
await ctx.route(`**://${new URL(WORKER).host}/**`, (route) => {
  const u = route.request().url();
  if (u.includes("/tle")) return route.fulfill(json(tle));
  if (u.includes("/crew")) return route.fulfill(json(crew));
  if (u.includes("/today")) return route.fulfill(json(today));
  if (u.includes("/capsules")) return route.fulfill(json(capsules));
  if (u.includes("/astronaut")) return route.fulfill(json(profile));
  return route.fulfill({ status: 404, body: "{}" });
});
await ctx.route("**://thespacedevs-prod.nyc3.digitaloceanspaces.com/**", (r) =>
  r.fulfill({ status: 200, contentType: "image/jpeg", body: portrait })
);
await ctx.route("**://celestrak.org/**", (r) => r.abort());

const page = await ctx.newPage();
try {
  await page.goto(APP, { waitUntil: "load", timeout: 30000 });
} catch {
  console.error(`Could not load ${APP}. Is the preview server running?`);
  console.error(
    "  npm run build && npm run preview -w @orbital-traffic/web -- --port 4173 --strictPort"
  );
  await browser.close();
  process.exit(1);
}
await page.waitForTimeout(10000); // boot + the +2s live sync + settle

// The interaction hint is a transient teaching aid, not part of the product's
// resting state — it has no business in a store listing.
await page.evaluate(() => {
  const h = document.querySelector("#hint");
  if (h) h.style.display = "none";
});

/** Top edge of a sheet, in capture pixels — render.mjs crops to this. */
const anchorOf = (sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    return el ? Math.round(el.getBoundingClientRect().top * 3) : null;
  }, sel);

const anchors = {};
const shot = async (name, anchorSel) => {
  await page.waitForTimeout(600);
  if (anchorSel) anchors[name] = await anchorOf(anchorSel);
  await page.screenshot({ path: `${OUT}${name}.png` });
  console.log(`  ${name}${anchors[name] != null ? ` (anchor ${anchors[name]})` : ""}`);
};

const select = async (query) => {
  await page.click("#search-toggle").catch(() => {});
  await page.waitForTimeout(400);
  await page.fill("#search-in", "");
  await page.type("#search-in", query, { delay: 35 });
  await page.waitForTimeout(1400);
  const hit = await page.$("#results .res");
  if (!hit) throw new Error(`no catalog match for "${query}"`);
  await hit.click();
  await page.waitForTimeout(3000);
  return page.textContent("#info-nm");
};

console.log("capturing…");

// 01 — the globe. Two drags bring the day/night terminator onto the sunlit
// hemisphere; the exact continents depend on the time of the run, which is
// the point: this is whatever the app is really showing right now.
for (let i = 0; i < 2; i++) {
  await page.mouse.move(215, 500);
  await page.mouse.down();
  await page.mouse.move(285, 490, { steps: 18 });
  await page.mouse.up();
  await page.waitForTimeout(1400);
}
await shot("globe");

// 02 — what's overhead, during a real ISS pass
await ctx.setGeolocation(issSubpoint(new Date(Date.now() + 7000)));
await page.click("#overhead-fab");
await page.waitForTimeout(7000);
const overheadCount = await page.textContent("#overhead-count").catch(() => "?");
const overheadTop = await page.$$eval("#overhead-list > *", (els) =>
  els.slice(0, 3).map((e) => e.textContent.replace(/\s+/g, " ").trim())
);
console.log(`  overhead: ${overheadCount} objects — ${overheadTop.join(", ")}`);
await shot("overhead", "#overhead");
await page.click("#overhead-x").catch(() => {});
await page.waitForTimeout(800);

// 03-06 — the object card, four ways
console.log(`  object: ${await select("HST")}`);
await shot("object", "#info");

console.log(`  crew: ${await select("ISS (ZARYA)")}`);
await shot("crew", "#info");

console.log(`  capsule: ${await select("CREW DRAGON")}`);
await shot("capsule", "#info");

console.log(`  asteroid: ${await select("Florence")}`);
await shot("asteroid", "#info");

writeFileSync(
  `${OUT}geometry.json`,
  JSON.stringify({ capturedAt: new Date().toISOString(), anchors }, null, 2) + "\n"
);

await browser.close();
console.log(`\ndone -> ${OUT}\nnext: node tools/store-screenshots/render.mjs`);

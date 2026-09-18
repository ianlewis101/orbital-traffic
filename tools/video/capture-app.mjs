// =====================================================================
// APP FRAME CAPTURE
// =====================================================================
//
// Drives the real web app through a shot's camera move and writes one PNG
// per output frame.
//
// The app is loaded once and reused for every app shot in the cut — boot
// parses and ingests the whole catalog, which is far and away the most
// expensive thing in the pipeline, and there is no reason to pay it nine
// times.
//
// Frames are produced by apps/web/src/capture.js's step(), which renders
// exactly one frame synchronously for an exact simulation time and camera
// position. Nothing here depends on how fast the renderer actually is: a
// software-GL frame that takes two seconds to draw is still the 1/30s
// successor of the one before it. That is what makes the output smooth on a
// machine with no GPU, and identical between runs.

// playwright-core, deliberately, not `playwright`: the full package downloads
// a browser bundle on install, which every CI job in this repo would then pay
// for despite none of them shooting video. playwright-core ships the driver
// only and takes the browser path from the caller — which is what we want
// anyway, since this points at whatever Chromium is already on the machine.
import { chromium } from "playwright-core";
import { join } from "node:path";
import { ease, lerpKeys } from "./ease.mjs";

// Override with OT_CHROMIUM when Chrome lives elsewhere (on macOS that is
// usually /Applications/Google Chrome.app/Contents/MacOS/Google Chrome).
const CHROMIUM = process.env.OT_CHROMIUM || "/opt/pw-browsers/chromium";

const LAUNCH_ARGS = [
  // Localhost must not go through the agent proxy or navigation fails.
  "--no-proxy-server",
  // Software GL. Without these the headless browser has no WebGL at all and
  // the app bails out with "WebGL unavailable" before drawing anything.
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
  "--no-sandbox",
  "--hide-scrollbars",
];

export async function launchBrowser() {
  return chromium.launch({ executablePath: CHROMIUM, args: LAUNCH_ARGS });
}

/**
 * Open the app in capture mode and wait until it is drawing the catalog.
 *
 * Live sync is blocked at the network boundary on purpose: a promo shoot must
 * render the committed catalog (which is what `{count}` in the script is
 * derived from), not whatever a mid-shoot fetch happens to return, or shot 1
 * and shot 8 could disagree about how many objects exist.
 */
export async function openApp(browser, { baseUrl, width, height }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    serviceWorkers: "block",
    reducedMotion: "no-preference",
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.route("**://orbital-traffic.ianlewis101.workers.dev/**", (r) => r.abort());
  await page.route("**://celestrak.org/**", (r) => r.abort());

  await page.goto(`${baseUrl}/?capture=1`, { waitUntil: "load", timeout: 90000 });
  await page.waitForFunction(() => window.__otCapture?.ready?.(), null, {
    timeout: 120000,
    polling: 500,
  });
  if (errors.length) {
    console.warn(`  ! page errors during boot: ${errors.slice(0, 3).join(" | ")}`);
  }
  return { ctx, page };
}

/** Resolve a shot's `select` block to a real catalog id, or null. */
async function resolveSelection(page, select) {
  if (!select) return null;
  const found = select.name
    ? await page.evaluate((n) => window.__otCapture.findId(n), select.name)
    : null;
  if (found) return found.id;
  if (select.fallbackId) {
    const ok = await page.evaluate(
      (id) => !!window.__otCapture.objectPosition(id),
      select.fallbackId
    );
    if (ok) return select.fallbackId;
  }
  return null;
}

/**
 * Shoot one app shot.
 *
 * Returns the number of frames written. `frameDir` receives zero-padded PNGs
 * starting at 000000.
 */
export async function captureShot(page, shot, { frameDir, fps, simStart, defaultHidden }) {
  const frames = Math.max(1, Math.round(shot.dur * fps));
  const hidden = shot.hidden || defaultHidden;

  await page.evaluate(
    ([h]) => {
      window.__otCapture.prep({ hidden: h });
      window.__otCapture.setHidden(h);
      window.__otCapture.deselect();
    },
    [hidden]
  );

  // A shot that names an object frames it live; one whose object is missing
  // from today's catalog degrades to its fixed `cam` block rather than
  // aborting the shoot. `aim` shots with no target and no `cam` fall back to
  // a sensible LEO framing so the cut still assembles.
  let selectedId = null;
  if (shot.select) {
    selectedId = await resolveSelection(page, shot.select);
    if (selectedId) {
      await page.evaluate(
        ([id, trail, sim]) => window.__otCapture.select(id, { trail, date: sim }),
        [selectedId, shot.select.trail !== false, simStart]
      );
    } else {
      console.warn(`  ! shot "${shot.id}": no catalog match for selection; using fixed framing`);
    }
  }

  const simRate = shot.simRate ?? 1;
  const camFrom = shot.cam?.from ?? null;
  const camTo = shot.cam?.to ?? null;
  const aim = shot.aim ?? null;

  for (let i = 0; i < frames; i++) {
    // Frame i is the state at (i/fps) seconds into the shot. The last frame
    // lands exactly on the end of the move, so a cut on the beat is clean.
    const u = frames === 1 ? 1 : i / (frames - 1);
    const sim = simStart + (i / fps) * simRate * 1000;

    let pose;
    if (aim && selectedId) {
      // Track the object: its angles are re-read every frame (it is moving),
      // and only the standoff is scripted.
      const k = ease(aim.ease || "inOutCubic", u);
      const standoff = aim.standoff.from + (aim.standoff.to - aim.standoff.from) * k;
      // `tilt` moves the camera off the object's own polar angle. Without it
      // the eye sits exactly in the plane of the orbit, and the trail ring
      // collapses to a straight line across the frame — which reads as a
      // scratch on the lens, not as an orbit. A few tenths of a radian opens
      // it into a visible arc and lifts the object slightly up the frame.
      const tilt = aim.tilt ?? 0;
      pose = await page.evaluate(
        ([id, sim_, standoff_, tilt_]) => {
          const c = window.__otCapture;
          // Advance the simulation first: the object has to be at THIS
          // frame's position before its angles are read, or the camera lags
          // the thing it is tracking by one frame all the way through.
          c.step({ sim: sim_ });
          const a = c.aimAt(id);
          if (!a) return null;
          return { r: a.mag / 1000 + standoff_, theta: a.theta, phi: a.phi + tilt_ };
        },
        [selectedId, sim, standoff, tilt]
      );
    }
    if (!pose) {
      const k = ease(shot.cam?.ease || "inOutCubic", u);
      pose = camFrom ? lerpKeys(camFrom, camTo, k) : { r: 30, theta: 0.6 + u * 0.3, phi: 1.2 };
    }

    await page.evaluate(([p, sim_]) => window.__otCapture.step({ ...p, sim: sim_ }), [pose, sim]);
    await page.screenshot({
      path: join(frameDir, `${String(i).padStart(6, "0")}.png`),
      animations: "disabled",
    });
  }
  return frames;
}

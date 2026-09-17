#!/usr/bin/env node
// =====================================================================
// PROMO VIDEO BUILD
// =====================================================================
//
// Shoots the cut described by tools/video/shots.mjs and encodes a 1080x1920
// MP4 ready for TikTok / Reels / Shorts.
//
//   npm run build                       # the app must be built first
//   npm run preview -w @orbital-traffic/web -- --port 4173 --strictPort
//   node tools/video/build.mjs
//
// Useful flags:
//   --out <path>        where to write the MP4 (default exports/)
//   --base <url>        preview server origin (default http://localhost:4173)
//   --only <id,id>      shoot a subset of shots, by id
//   --scale <n>         render at n x the format size (0.5 for a fast proof)
//   --stills            one still per shot instead of a video — the fast way
//                       to tune camera values, seconds instead of minutes
//   --audio <file>      mux a music bed (see README on licensing)
//   --keep-frames       leave the PNG sequence on disk for inspection
//
// The app must be BUILT and being SERVED before this runs; it shoots the
// production bundle rather than the dev server so the footage matches what
// ships. Nothing here writes into the repo except the finished file in
// exports/.

import { mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SHOTS, PAGES, FORMAT, DEFAULT_HIDDEN } from "./shots.mjs";
import { EASES } from "./ease.mjs";
import { launchBrowser, openApp, captureShot } from "./capture-app.mjs";
import { titleHtml, bookHtml, logoHtml, renderCard, renderCardFrames } from "./cards.mjs";
import { encode, poster } from "./assemble.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const DIST = join(REPO, "apps/web/dist");

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : fallback;
}
const has = (name) => process.argv.includes(`--${name}`);

const BASE = arg("base", "http://localhost:4173").replace(/\/$/, "");
const SCALE = Number(arg("scale", "1"));
const STILLS = has("stills");
const ONLY = arg("only")
  ? new Set(
      arg("only")
        .split(",")
        .map((s) => s.trim())
    )
  : null;

// Even dimensions: H.264 chroma subsampling requires it and an odd width
// fails the encode outright rather than rounding.
const W = Math.round((FORMAT.width * SCALE) / 2) * 2;
const H = Math.round((FORMAT.height * SCALE) / 2) * 2;
const FPS = FORMAT.fps;

const stamp = new Date().toISOString().slice(0, 10);
// exports/ itself is tracked (exports/svg-fallbacks), so renders go in a
// gitignored subfolder rather than next to committed assets.
const OUT = resolve(arg("out", join(REPO, "exports/video", `orbital-traffic-${stamp}.mp4`)));
const WORK = join(REPO, ".video-work");
const FRAMES = join(WORK, "frames");
const CARDS = join(WORK, "cards");

async function preflight() {
  if (!existsSync(DIST)) {
    throw new Error(
      `apps/web/dist not found — run \`npm run build\` first (build.mjs shoots the production bundle).`
    );
  }
  const res = await fetch(`${BASE}/index.html`).catch(() => null);
  if (!res || !res.ok) {
    throw new Error(
      `No preview server at ${BASE}.\n` +
        `  Start one:  npm run preview -w @orbital-traffic/web -- --port 4173 --strictPort`
    );
  }
}

/** The real catalog size, so the copy can never claim a number that isn't true. */
async function catalogCount() {
  const sats = JSON.parse(
    await readFile(join(REPO, "apps/web/public/data/satellites.json"), "utf8")
  );
  return sats.length;
}

async function main() {
  await preflight();

  const count = await catalogCount();
  const countText = count.toLocaleString("en-US");
  console.log(`Orbital Traffic promo build`);
  console.log(`  catalog   ${countText} objects`);
  console.log(`  format    ${W}x${H} @ ${FPS}fps${SCALE !== 1 ? `  (scale ${SCALE})` : ""}`);

  await rm(WORK, { recursive: true, force: true });
  await mkdir(FRAMES, { recursive: true });
  await mkdir(CARDS, { recursive: true });
  await mkdir(dirname(OUT), { recursive: true });

  const shots = ONLY ? SHOTS.filter((s) => ONLY.has(s.id)) : SHOTS;
  if (!shots.length) throw new Error(`--only matched no shots`);

  const browser = await launchBrowser();
  const titles = [];
  let frameIndex = 0;
  const marks = [];

  try {
    // One app context for every app shot: boot ingests the whole catalog and
    // is by far the most expensive step in the pipeline.
    const { ctx, page } = await openApp(browser, { baseUrl: BASE, width: W, height: H });
    const stats = await page.evaluate(() => window.__otCapture.stats());
    console.log(`  loaded    ${stats.objects.toLocaleString("en-US")} objects in scene`);
    if (stats.objects < count * 0.9) {
      console.warn(`  ! scene holds fewer objects than the catalog file — check ingest`);
    }

    // A fixed simulation epoch for the whole cut: every shot advances from
    // the same instant, so re-running the build gives byte-identical framing
    // and two shots of the same object cannot disagree about where it is.
    const simStart = Date.now();

    // Card shots reuse one page too, but not the app's — loading a card into
    // the app's page would tear down the WebGL context and force a re-boot
    // for the next app shot.
    const cardPage = await ctx.newPage();

    for (const shot of shots) {
      const frames = Math.max(1, Math.round(shot.dur * FPS));
      const startAt = frameIndex / FPS;
      process.stdout.write(
        `  ${shot.id.padEnd(14)} ${String(frames).padStart(4)}f  ${startAt.toFixed(1)}s`
      );
      const t0 = Date.now();

      if (STILLS) {
        // Tuning mode: the midpoint of the move only.
        await shootStill(shot, { page, cardPage, simStart, count: countText });
        console.log(`  still (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
        continue;
      }

      if (shot.kind === "card") {
        const html = cardHtml(shot, countText);
        await renderCardFrames(cardPage, {
          html,
          frames,
          zoom: shot.zoom,
          frameDir: FRAMES,
          publicDir: DIST,
          baseUrl: BASE,
          startIndex: frameIndex,
          easeFn: EASES.inOutCubic,
          centerHighlight: shot.card === "book",
        });
      } else {
        await captureShot(page, shot, {
          frameDir: join(FRAMES, "__tmp"),
          fps: FPS,
          simStart,
          defaultHidden: DEFAULT_HIDDEN,
        }).catch(async (e) => {
          throw new Error(`shot "${shot.id}" failed: ${e.message}`);
        });
        // captureShot numbers from zero per shot; splice into the global
        // sequence so the whole cut is one continuous, gap-free run.
        await spliceFrames(join(FRAMES, "__tmp"), FRAMES, frameIndex, frames);
      }

      if (shot.text) {
        const line = shot.text.line.replace("{count}", countText);
        const png = join(CARDS, `title-${shot.id}.png`);
        await renderCard(cardPage, {
          html: titleHtml({ line, size: shot.text.size, width: W, height: H }),
          out: png,
          transparent: true,
          publicDir: DIST,
          baseUrl: BASE,
        });
        const start = startAt + (shot.text.in ?? 0.3);
        titles.push({
          png,
          start,
          end: Math.min(start + (shot.text.hold ?? 1.6), startAt + shot.dur),
        });
      }

      marks.push({ id: shot.id, start: startAt, frames });
      frameIndex += frames;
      console.log(`  ok (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    }

    await cardPage.close();
    await ctx.close();
  } finally {
    await browser.close();
  }

  if (STILLS) {
    console.log(`\nStills written to ${join(WORK, "stills")}`);
    return;
  }

  const total = frameIndex;
  const dur = total / FPS;
  console.log(`\n  encoding  ${total} frames (${dur.toFixed(1)}s)…`);

  const audio = arg("audio");
  if (audio && !existsSync(audio)) throw new Error(`audio file not found: ${audio}`);

  await encode({
    framePattern: join(FRAMES, "%06d.png"),
    fps: FPS,
    totalFrames: total,
    titles,
    audio,
    out: OUT,
    fadeOutFrom: dur - 0.5,
  });
  await poster({
    framePattern: join(FRAMES, "%06d.png"),
    frameIndex: Math.round(FPS * 1.2),
    out: OUT.replace(/\.mp4$/, "-poster.png"),
  });

  await writeFile(
    OUT.replace(/\.mp4$/, ".json"),
    JSON.stringify(
      { built: new Date().toISOString(), catalog: count, duration: dur, shots: marks },
      null,
      2
    ) + "\n",
    "utf8"
  );

  if (!has("keep-frames")) await rm(WORK, { recursive: true, force: true });

  console.log(`\n  ->  ${OUT}`);
  console.log(`      ${(await import("node:fs")).statSync(OUT).size / 1e6} MB, ${dur.toFixed(1)}s`);
}

function cardHtml(shot, countText) {
  if (shot.card === "book") {
    const page = PAGES[shot.id];
    if (!page) throw new Error(`no PAGES entry for book shot "${shot.id}"`);
    return bookHtml({ ...page, width: W, height: H });
  }
  if (shot.card === "logo") {
    return logoHtml({
      markSvg: markSvgCache,
      width: W,
      height: H,
      tagline: `${countText} objects · live`,
      cta: "Free on iOS and the web",
    });
  }
  throw new Error(`unknown card type "${shot.card}"`);
}

/** Move a per-shot frame run into the global sequence. */
async function spliceFrames(from, to, startIndex, frames) {
  const fs = await import("node:fs/promises");
  for (let i = 0; i < frames; i++) {
    await fs.rename(
      join(from, `${String(i).padStart(6, "0")}.png`),
      join(to, `${String(startIndex + i).padStart(6, "0")}.png`)
    );
  }
  await fs.rm(from, { recursive: true, force: true });
}

/** --stills: one mid-move frame per shot, for tuning camera values fast. */
async function shootStill(shot, { page, cardPage, simStart, count }) {
  const dir = join(WORK, "stills");
  await mkdir(dir, { recursive: true });
  const out = join(dir, `${shot.id}.png`);
  if (shot.kind === "card") {
    await renderCard(cardPage, {
      html: cardHtml(shot, count),
      out,
      publicDir: DIST,
      baseUrl: BASE,
      centerHighlight: shot.card === "book",
    });
    return;
  }
  const mid = { ...shot, dur: 3 / FPS }; // three frames: start, middle, end
  const tmp = join(WORK, "still-tmp");
  await mkdir(tmp, { recursive: true });
  await captureShot(page, mid, {
    frameDir: tmp,
    fps: FPS,
    simStart,
    defaultHidden: DEFAULT_HIDDEN,
  });
  const fs = await import("node:fs/promises");
  await fs.rename(join(tmp, "000001.png"), out);
  await fs.rm(tmp, { recursive: true, force: true });
}

// The closing card's mark is the repo's own brand asset rather than a copy.
let markSvgCache = "";
markSvgCache = await readFile(join(REPO, "design/brand/icon-mark-transparent.svg"), "utf8");

main().catch((e) => {
  console.error(`\n${e.message}\n`);
  process.exit(1);
});

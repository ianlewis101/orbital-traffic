#!/usr/bin/env node
/**
 * Export the social kit in design/social/ to ready-to-post PNGs.
 *
 *   npm run social:render                 every post
 *   npm run social:render -- launch       one post
 *   npm run social:preview                serve the contact sheet, don't export
 *
 * Output: design/social/out/<post>/01.png … — 1080px wide, exactly the size
 * the artboard declares. Upload order is filename order.
 *
 * The browser is the renderer, so the export is the same code path as the
 * contact sheet: design/social/build.js builds the DOM, this script only
 * screenshots each .slide element.
 *
 * Playwright is NOT a dependency of this repo — same call as
 * tools/generate-icons.mjs: it is a heavyweight browser download, this runs
 * by hand when marketing assets are needed, and nothing in CI needs it.
 * Install it only when you actually want to export:
 *
 *     npm i -D playwright && npx playwright install chromium
 *
 * Served over HTTP rather than opened from file:// because the kit is real ES
 * modules — a file:// page cannot import them (origin "null" fails the CORS
 * check), and the same server backs `npm run social:preview`.
 */

import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { readFile, mkdir, rm, stat, open } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, extname, relative } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOCIAL = join(ROOT, "design/social");
const OUT = join(SOCIAL, "out");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

async function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const candidates = [
    "playwright",
    "playwright-core",
    "/opt/node22/lib/node_modules/playwright/index.mjs",
  ];
  for (const spec of candidates) {
    try {
      return spec.startsWith("/") ? await import(spec) : require(spec);
    } catch {
      /* try the next candidate */
    }
  }
  throw new Error(
    "Playwright not found. Install it first:\n" +
      "  npm i -D playwright && npx playwright install chromium"
  );
}

/** Minimal static server rooted at the repo, so /design/... and the fonts and
 *  screenshots the kit pulls from apps/web/public/ all resolve. */
function serve() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    // normalize() collapses any ../ before the join, so a crafted path cannot
    // escape ROOT even though this only ever listens on localhost.
    const path = join(ROOT, normalize(decodeURIComponent(url.pathname)));
    if (!path.startsWith(ROOT)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    try {
      const info = await stat(path);
      const file = info.isDirectory() ? join(path, "index.html") : path;
      res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
      createReadStream(file).pipe(res);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

/** Width/height straight out of the PNG's IHDR chunk. */
async function pngSize(file) {
  const head = Buffer.alloc(24);
  const fh = await open(file, "r");
  try {
    await fh.read(head, 0, 24, 0);
  } finally {
    await fh.close();
  }
  return { w: head.readUInt32BE(16), h: head.readUInt32BE(20) };
}

/** Same derivation as apps/web/vite.config.js — one figure everywhere. */
async function objectCount() {
  const sats = JSON.parse(
    await readFile(join(ROOT, "apps/web/public/data/satellites.json"), "utf8")
  );
  return `${(Math.floor(sats.length / 1000) * 1000).toLocaleString("en-US")}+`;
}

async function main() {
  const args = process.argv.slice(2);
  const previewOnly = args.includes("--serve");
  const wanted = args.filter((a) => !a.startsWith("-"));

  const { POSTS, POST_IDS, ARTBOARD, DEFAULT_SIZE } = await import(join(SOCIAL, "content.js"));
  const ids = wanted.length ? wanted : POST_IDS;
  for (const id of ids) {
    if (!POSTS[id]) throw new Error(`Unknown post "${id}". Known: ${POST_IDS.join(", ")}`);
  }

  const { server, port } = await serve();
  const base = `http://127.0.0.1:${port}/design/social/index.html`;

  if (previewOnly) {
    console.log(`Social kit preview: ${base}`);
    POST_IDS.forEach((id) => console.log(`  ${POSTS[id].title.padEnd(28)} ${base}?post=${id}`));
    console.log("\nCtrl-C to stop.");
    return; // server stays up
  }

  const count = await objectCount();
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({
    // Escape hatch for environments that already ship a Chromium (CI images,
    // sandboxes) or whose build number does not match the installed
    // Playwright. Unset everywhere else — Playwright finds its own.
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    args: ["--force-color-profile=srgb"],
  });

  try {
    for (const id of ids) {
      const post = POSTS[id];
      const dir = join(OUT, id);
      await rm(dir, { recursive: true, force: true });
      await mkdir(dir, { recursive: true });

      const page = await browser.newPage({
        viewport: { width: 1400, height: 1200 },
        deviceScaleFactor: 1, // artboards are already at native export size
      });
      await page.addInitScript((c) => {
        globalThis.__OBJECT_COUNT__ = c;
      }, count);
      await page.goto(`${base}?post=${id}`, { waitUntil: "load" });
      await page.waitForSelector("body[data-ready='1']");

      const slides = await page.locator(".slide").all();
      if (slides.length !== post.slides.length) {
        throw new Error(`${id}: built ${slides.length} slides, expected ${post.slides.length}`);
      }

      console.log(
        `${post.title} — ${post.kind}, ${post.size}, ${slides.length} image${slides.length > 1 ? "s" : ""}`
      );
      const want = ARTBOARD[post.size || DEFAULT_SIZE];
      for (const [i, slide] of slides.entries()) {
        const file = join(dir, `${String(i + 1).padStart(2, "0")}.png`);
        await slide.screenshot({ path: file, scale: "css" });
        const { size } = await stat(file);
        const got = await pngSize(file);
        // A CSS slip (a missing box-sizing reset, a stray border) silently
        // inflates the artboard and every image ships off-aspect. Fail loudly.
        if (got.w !== want.w || got.h !== want.h) {
          throw new Error(
            `${relative(ROOT, file)} is ${got.w}x${got.h}, expected ${want.w}x${want.h} — ` +
              `the .slide box does not match its declared artboard size.`
          );
        }
        console.log(
          `  ${relative(ROOT, file)}  ${post.slides[i].type.padEnd(7)} ` +
            `${got.w}x${got.h}  ${(size / 1024).toFixed(0)} KB`
        );
      }
      console.log("");
      await page.close();
    }
    console.log(`Done. Object count rendered as ${count}.`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

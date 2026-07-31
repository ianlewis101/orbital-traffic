#!/usr/bin/env node
/**
 * Regenerate every raster app icon from tools/assets/app-icon.svg.
 *
 *   npm run icons:generate
 *
 * Outputs:
 *   apps/web/public/icons/*.png                    PWA + favicon + apple-touch
 *   apps/web/ios/.../AppIcon.appiconset/*.png      iOS app icon (1024x1024)
 *
 * The 1024x1024 iOS icon doubles as the App Store Connect marketing icon.
 *
 * Every PNG written here is verified before the script exits: exact pixel
 * dimensions, 8-bit colour type 2 (truecolour, NO alpha channel) and no tRNS
 * chunk. App Store Connect rejects a marketing icon carrying an alpha channel
 * even when every pixel is fully opaque, so that check is the point of this
 * script rather than an afterthought — do not relax it.
 *
 * Each size is rasterised from the vector at its native resolution rather than
 * downscaled from one big render, so small icons stay crisp.
 *
 * Playwright is NOT a dependency of this repo — it is a heavyweight browser
 * download and this script runs by hand, a few times a year, when the artwork
 * changes. Icons are committed, so neither CI nor a normal `npm install` needs
 * it. Install it only when you actually want to regenerate:
 *
 *     npm i -D playwright && npx playwright install chromium
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import zlib from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "tools/assets/app-icon.svg");
const WEB_ICONS = join(ROOT, "apps/web/public/icons");
const IOS_ICONS = join(ROOT, "apps/web/ios/App/App/Assets.xcassets/AppIcon.appiconset");

/** Sizes referenced by manifest.json, index.html and the service worker. */
const WEB_SIZES = [16, 32, 48, 72, 96, 120, 128, 144, 152, 167, 180, 192, 256, 512];

/** Byte-identical aliases, kept so existing markup keeps resolving. */
const ALIASES = [
  ["icon-16.png", "favicon-16.png"],
  ["icon-32.png", "favicon-32.png"],
  ["icon-180.png", "apple-touch-icon.png"],
];

/**
 * Maskable icons are cropped by the platform to an arbitrary shape, so all
 * meaningful content must sit inside a centred circle covering the middle 80%
 * of the canvas. The spacecraft spans nearly the full diagonal at its normal
 * scale, so the maskable variant shrinks it to fit that safe zone. Anything
 * outside is background, which is exactly what should get cropped.
 */
const CRAFT_STANDARD = "rotate(-22 512 512) translate(512 512) scale(1.04) translate(-512 -512)";
const CRAFT_MASKABLE = "rotate(-22 512 512) translate(512 512) scale(0.78) translate(-512 -512)";

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

/** Swap the #craft group's transform to switch between icon variants. */
function withCraftTransform(svg, transform) {
  const out = svg.replace(/(<g id="craft"[^>]*\stransform=")[^"]*(")/, `$1${transform}$2`);
  if (out === svg && transform !== CRAFT_STANDARD) {
    throw new Error(
      "Could not rewrite the #craft transform in app-icon.svg. The group must " +
        'keep id="craft" and a transform attribute — see the notes in that file.'
    );
  }
  return out;
}

/**
 * Tag the PNG as sRGB. Chromium emits a bare IHDR/IDAT/IEND file; an untagged
 * PNG is interpreted as sRGB anyway, but being explicit removes any doubt
 * about how the store and the browser read the colours.
 */
function tagSrgb(png) {
  const chunk = (type, payload) => {
    const head = Buffer.alloc(4);
    head.writeUInt32BE(payload.length);
    const body = Buffer.concat([Buffer.from(type, "latin1"), payload]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([head, body, crc]);
  };
  const gama = Buffer.alloc(4);
  gama.writeUInt32BE(45455); // 1/2.2, per the sRGB spec
  const cut = 8 + 4 + 4 + 13 + 4; // signature + the whole IHDR chunk
  return Buffer.concat([
    png.subarray(0, cut),
    chunk("sRGB", Buffer.from([0])), // 0 = perceptual rendering intent
    chunk("gAMA", gama),
    png.subarray(cut),
  ]);
}

/** Parse the header and chunk names without pulling in an image library. */
function inspectPng(buf) {
  if (buf.subarray(0, 8).toString("latin1") !== "\x89PNG\r\n\x1a\n") {
    throw new Error("not a PNG");
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const depth = buf[24];
  const colourType = buf[25];
  const interlace = buf[28];
  const types = [];
  let off = 8;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.subarray(off + 4, off + 8).toString("latin1");
    types.push(type);
    off += 12 + len;
    if (type === "IEND") break;
  }
  return { width, height, depth, colourType, interlace, types };
}

function assertCompliant(label, buf, size) {
  const m = inspectPng(buf);
  const problems = [];
  if (m.width !== size || m.height !== size) {
    problems.push(`expected ${size}x${size}, got ${m.width}x${m.height}`);
  }
  if (m.depth !== 8) problems.push(`expected 8-bit, got ${m.depth}-bit`);
  if (m.colourType !== 2) {
    problems.push(
      `expected colour type 2 (RGB, no alpha), got ${m.colourType}` +
        (m.colourType === 6 ? " (RGBA — carries an alpha channel)" : "")
    );
  }
  if (m.types.includes("tRNS")) problems.push("carries a tRNS transparency chunk");
  if (m.interlace !== 0) problems.push("is interlaced");
  if (problems.length) {
    throw new Error(`${label} ${problems.join("; ")}`);
  }
  return m;
}

async function main() {
  const { chromium } = await loadPlaywright();
  const svg = await readFile(SOURCE, "utf8");

  await mkdir(WEB_ICONS, { recursive: true });
  await mkdir(IOS_ICONS, { recursive: true });

  const browser = await chromium.launch({ args: ["--force-color-profile=srgb"] });
  const written = [];

  const render = async (markup, size, outPath) => {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    // The backing colour matches the artwork so any rounding at the edge blends
    // in rather than showing a seam.
    await page.setContent(
      `<style>html,body{margin:0;padding:0;background:#1a2b45}` +
        `svg{display:block;width:${size}px;height:${size}px}</style>${markup}`,
      { waitUntil: "load" }
    );
    const shot = await page.screenshot({ omitBackground: false });
    await page.close();

    const png = tagSrgb(shot);
    assertCompliant(`${relative(ROOT, outPath)}:`, png, size);
    await writeFile(outPath, png);
    written.push([relative(ROOT, outPath), size, png.length]);
    return png;
  };

  const standard = withCraftTransform(svg, CRAFT_STANDARD);
  const maskable = withCraftTransform(svg, CRAFT_MASKABLE);

  // PWA / favicon / apple-touch set
  const bySize = new Map();
  for (const size of WEB_SIZES) {
    bySize.set(size, await render(standard, size, join(WEB_ICONS, `icon-${size}.png`)));
  }

  // Maskable variant: same artwork, spacecraft pulled into the safe zone
  await render(maskable, 512, join(WEB_ICONS, "icon-maskable-512.png"));

  // Aliases are byte-for-byte copies, matching how they were before
  for (const [from, to] of ALIASES) {
    const size = Number(from.match(/(\d+)/)[1]);
    await writeFile(join(WEB_ICONS, to), bySize.get(size));
    written.push([relative(ROOT, join(WEB_ICONS, to)), size, bySize.get(size).length]);
  }

  // iOS app icon — also the App Store Connect marketing icon
  await render(standard, 1024, join(IOS_ICONS, "AppIcon-512@2x.png"));

  await browser.close();

  for (const [path, size, bytes] of written) {
    console.log(
      `  ${String(size).padStart(4)}px  ${(bytes / 1024).toFixed(1).padStart(7)} KB  ${path}`
    );
  }
  console.log(`\n${written.length} icons written and verified (RGB, no alpha channel).`);
}

main().catch((err) => {
  console.error(`\nicon generation failed: ${err.message}`);
  process.exitCode = 1;
});

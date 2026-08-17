#!/usr/bin/env node
/**
 * Regenerate every raster app icon from tools/assets/app-icon.svg.
 *
 *   npm run icons:generate
 *
 * Outputs:
 *   apps/web/public/icons/*.png                    PWA + favicon + apple-touch
 *   apps/web/ios/.../AppIcon.appiconset/*.png      iOS app icon (1024x1024)
 *   apps/web/ios/.../Splash.imageset/*.png         iOS launch screen (2732x2732)
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
const IOS_SPLASH = join(ROOT, "apps/web/ios/App/App/Assets.xcassets/Splash.imageset");

/**
 * The app's own background colour (--bg in app.css). The launch image uses it
 * verbatim so the handoff from the launch screen to the first painted frame is
 * invisible — the previous splash was Capacitor's stock white placeholder,
 * which flashed bright before the near-black UI appeared.
 */
const APP_BG = "#07080f";

/** iOS launch image. One square, reused at all three scale slots. */
const SPLASH_SIZE = 2732;
const SPLASH_FILES = ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"];

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

/**
 * The launch image is a SQUARE that iOS scales with `scaleAspectFill` to cover
 * whatever aspect the device has, so on a phone most of it is cropped away
 * horizontally. Covering a 1320x2868 iPhone 16 Pro Max with a square means
 * scaling to the device's height, leaving only the middle ~46% of the square's
 * width on screen (1320/2868). The craft therefore has to sit inside a much
 * tighter safe zone than even the maskable icon's — at the standard 1.04 it
 * spans ~87% of the canvas width and would be sliced through both solar arrays.
 *
 * 0.46 keeps the full spacecraft inside the narrowest shipping aspect with room
 * to spare; assertSplashSafeZone() below measures the rendered pixels and fails
 * the build if that ever stops being true.
 */
const CRAFT_SPLASH = "rotate(-22 512 512) translate(512 512) scale(0.46) translate(-512 -512)";

/** Narrowest current iPhone aspect (iPhone 16 Pro Max, 1320x2868). */
const NARROWEST_ASPECT = 1320 / 2868;

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
 * Swap the icon's teal-to-purple gradient canvas for the app's flat background.
 * The icon art is designed to be seen as a small rounded square; stretched over
 * a full phone screen that gradient reads as a completely different brand, and
 * it would still be a visible jump to the near-black UI. The craft's existing
 * glow is kept and recentred so the spacecraft doesn't look pasted onto a void.
 */
function withSplashBackground(svg) {
  const start = svg.indexOf("<!-- ============ CANVAS ============ -->");
  const end = svg.indexOf("<!-- ============ SPACECRAFT ============ -->");
  if (start === -1 || end === -1) {
    throw new Error(
      "Could not find the CANVAS/SPACECRAFT section markers in app-icon.svg — " +
        "the splash background swap keys off those comments."
    );
  }
  const replacement =
    `<!-- Launch-screen canvas: flat app background, no gradient -->\n` +
    `  <rect width="1024" height="1024" fill="${APP_BG}"/>\n` +
    `  <ellipse cx="512" cy="512" rx="330" ry="330" fill="url(#craftGlow)"/>\n\n  `;
  return svg.slice(0, start) + replacement + svg.slice(end);
}

/**
 * Decode a PNG's pixels far enough to find which columns are not background.
 * Small and dependency-free on purpose — this script already avoids pulling in
 * an image library, and it only ever runs by hand.
 */
function nonBackgroundColumns(buf, bg) {
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  let idat = Buffer.alloc(0);
  let off = 8;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.subarray(off + 4, off + 8).toString("latin1");
    if (type === "IDAT") idat = Buffer.concat([idat, buf.subarray(off + 8, off + 8 + len)]);
    off += 12 + len;
    if (type === "IEND") break;
  }
  const raw = zlib.inflateSync(idat);
  const bpp = 3; // colour type 2, 8-bit — already asserted before this runs
  const stride = width * bpp;
  let prev = Buffer.alloc(stride);
  let pos = 0;
  let minX = width;
  let maxX = -1;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = Buffer.from(raw.subarray(pos, pos + stride));
    pos += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      if (filter === 1) line[x] = (line[x] + a) & 255;
      else if (filter === 2) line[x] = (line[x] + b) & 255;
      else if (filter === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    for (let x = 0; x < width; x++) {
      const dr = Math.abs(line[x * 3] - bg[0]);
      const dg = Math.abs(line[x * 3 + 1] - bg[1]);
      const db = Math.abs(line[x * 3 + 2] - bg[2]);
      // The glow is a soft ramp off the background, so only count pixels that
      // are clearly structure rather than halo.
      if (dr + dg + db > 60) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    prev = line;
  }
  return { width, minX, maxX };
}

/**
 * Fail the build if the spacecraft would be clipped by the launch screen's
 * aspect-fill crop on the narrowest device we ship to. This is the check that
 * makes the 0.46 scale above a verified number rather than a guess.
 */
function assertSplashSafeZone(buf) {
  const bg = [0x07, 0x08, 0x0f];
  const { width, minX, maxX } = nonBackgroundColumns(buf, bg);
  if (maxX < 0) throw new Error("splash: rendered no spacecraft at all");
  const visible = width * NARROWEST_ASPECT;
  const half = visible / 2;
  const left = width / 2 - half;
  const right = width / 2 + half;
  if (minX < left || maxX > right) {
    throw new Error(
      `splash: spacecraft spans x=${minX}..${maxX}, outside the ` +
        `${Math.round(left)}..${Math.round(right)} strip visible on a ` +
        `${NARROWEST_ASPECT.toFixed(3)} aspect screen — reduce CRAFT_SPLASH's scale`
    );
  }
  return { minX, maxX, left: Math.round(left), right: Math.round(right) };
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

  const render = async (markup, size, outPath, backing = "#1a2b45") => {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    // The backing colour matches the artwork so any rounding at the edge blends
    // in rather than showing a seam.
    await page.setContent(
      `<style>html,body{margin:0;padding:0;background:${backing}}` +
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

  // iOS launch screen. Rendered once, then written to all three scale slots the
  // imageset declares (Capacitor's stock layout — the three files were always
  // byte-identical copies of one another).
  const splashSvg = withSplashBackground(withCraftTransform(svg, CRAFT_SPLASH));
  const splash = await render(splashSvg, SPLASH_SIZE, join(IOS_SPLASH, SPLASH_FILES[0]), APP_BG);
  const zone = assertSplashSafeZone(splash);
  for (const name of SPLASH_FILES.slice(1)) {
    await writeFile(join(IOS_SPLASH, name), splash);
    written.push([relative(ROOT, join(IOS_SPLASH, name)), SPLASH_SIZE, splash.length]);
  }

  await browser.close();

  console.log(
    `\nsplash safe zone: craft spans x=${zone.minX}..${zone.maxX}, ` +
      `inside the ${zone.left}..${zone.right} strip visible at the narrowest ` +
      `shipping aspect.`
  );

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

/**
 * Renders the shippable 1080x1350 slide PNGs.
 *
 * The design canvas's own PNG export drops the file-entry screenshots (the
 * phone comes out empty), so slides are rendered straight from the artboards
 * here instead. Each artboard is shot at 2x and downsampled to exactly
 * 1080x1350, which supersamples both the type and the screens.
 *
 * Where the ORIGINAL full-res capture is still on disk we swap it in for the
 * 440px JPEG the canvas payload has to carry, so exports are sharper than the
 * canvas preview. Missing captures fall back to the committed JPEG.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const DIR = "/home/user/orbital-traffic/.design/three-bad-days";
const OUT = path.join(DIR, "export");
// Full-res captures live in the session scratchpad; see README for re-shooting.
const FULL = process.env.SHOTS_DIR ||
  "/tmp/claude-0/-home-user-orbital-traffic/cf712b32-265b-5cd5-8bee-e08d977da954/scratchpad/shots";

const SLIDES = [
  ["Main",           "1-wreckage",         "01b-debris-shell-wide.png"],
  ["Fengyun",        "2-one-missile",      "02-fengyun-card.png"],
  ["Collision",      "3-nobody-steering",  "03-cosmos-search.png"],
  ["Spread",         "4-comes-to-you",     "04d-shell-tilt.png"],
  ["SharingTheRoad", "5-sharing-the-road", "05-all-cats.png"],
];

fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-proxy-server"] });
const p = await (await b.newContext({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 })).newPage();
const sp = await (await b.newContext()).newPage();
await sp.goto("about:blank");

for (const [file, name, full] of SLIDES) {
  await p.goto(`file://${DIR}/${file}.dc.html`, { waitUntil: "networkidle" });
  const hi = path.join(FULL, full);
  if (fs.existsSync(hi)) await p.evaluate((src) => { document.querySelector("img").src = src; }, `file://${hi}`);
  else console.warn(`  ! ${full} not found — using the 440px JPEG`);
  await p.evaluate(() => document.fonts.ready);
  await p.evaluate(() => Promise.all([...document.images].map(i =>
    i.complete && i.naturalWidth ? null : new Promise(r => { i.onload = r; i.onerror = r; }))));
  await p.waitForTimeout(700);

  const big = (await p.screenshot({ type: "png" })).toString("base64");
  const small = await sp.evaluate(async (big) => {
    const img = new Image();
    await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = "data:image/png;base64," + big; });
    const c = document.createElement("canvas"); c.width = 1080; c.height = 1350;
    const g = c.getContext("2d"); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    g.drawImage(img, 0, 0, 1080, 1350);
    return c.toDataURL("image/png").split(",")[1];
  }, big);

  const buf = Buffer.from(small, "base64");
  fs.writeFileSync(path.join(OUT, `${name}.png`), buf);
  console.log(`${name}.png  1080x1350  ${(buf.length / 1024).toFixed(0)} KB`);
}
await b.close();

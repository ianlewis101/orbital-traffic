import { chromium } from "playwright";
import fs from "fs"; import path from "path";
const DIR = "/home/user/orbital-traffic/.design/ride-home-v2";
const OUT = path.join(DIR, "export");
const FULL = process.env.SHOTS_DIR || "/tmp/claude-0/-home-user-orbital-traffic/cf712b32-265b-5cd5-8bee-e08d977da954/scratchpad/shots";
const HIRES = { "globe-wide.jpg": "clean-sky-wide.png", "globe-near.jpg": "clean-sky.png" };
const SLIDES = [
  ["Main", "1a-hud-fleet"], ["HudStation", "1b-hud-station"],
  ["FullbleedOpener", "2a-fullbleed-opener"], ["FullbleedStation", "2b-fullbleed-station"],
  ["TelemetryOpener", "3a-telemetry-opener"], ["TelemetryStation", "3b-telemetry-station"],
];
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-proxy-server"] });
const p = await (await b.newContext({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 })).newPage();
const sp = await (await b.newContext()).newPage(); await sp.goto("about:blank");
for (const [file, name] of SLIDES) {
  await p.goto(`file://${DIR}/${file}.dc.html`, { waitUntil: "networkidle" });
  await p.evaluate((map) => {
    for (const img of document.images) {
      const base = (img.getAttribute("src") || "").split("/").pop();
      if (map[base]) img.src = map[base];
    }
  }, Object.fromEntries(Object.entries(HIRES)
      .filter(([, v]) => fs.existsSync(path.join(FULL, v)))
      .map(([k, v]) => [k, `file://${path.join(FULL, v)}`])));
  await p.evaluate(() => document.fonts.ready);
  await p.evaluate(() => Promise.all([...document.images].map(i =>
    i.complete && i.naturalWidth ? null : new Promise(r => { i.onload = r; i.onerror = r; }))));
  await p.waitForTimeout(650);
  const big = (await p.screenshot({ type: "png" })).toString("base64");
  const small = await sp.evaluate(async (big) => {
    const img = new Image();
    await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = "data:image/png;base64," + big; });
    const c = document.createElement("canvas"); c.width = 1080; c.height = 1350;
    const g = c.getContext("2d"); g.imageSmoothingQuality = "high";
    g.drawImage(img, 0, 0, 1080, 1350);
    return c.toDataURL("image/png").split(",")[1];
  }, big);
  const buf = Buffer.from(small, "base64");
  fs.writeFileSync(path.join(OUT, `${name}.png`), buf);
  console.log(`${name}.png  ${(buf.length / 1024).toFixed(0)} KB`);
}
await b.close();

import { chromium } from "playwright";
import fs from "fs";
// Artboards under export/ are gen.mjs output with the 440px canvas JPEGs
// swapped for the original full-res captures — see README.
const D = "/home/user/orbital-traffic/.design/three-bad-days/export";
const OUT = "/home/user/orbital-traffic/.design/three-bad-days/export";
const SLIDES = [
  ["Main", "1-wreckage"], ["Fengyun", "2-one-missile"], ["Collision", "3-nobody-steering"],
  ["Spread", "4-comes-to-you"], ["SharingTheRoad", "5-sharing-the-road"],
];
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-proxy-server"] });
// render at 2x then downsample to exactly 1080x1350 — supersamples type and screens
const ctx = await b.newContext({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const sp = await (await b.newContext()).newPage(); await sp.goto("about:blank");

for (const [file, name] of SLIDES) {
  await p.goto(`file://${D}/${file}.dc.html`, { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  await p.evaluate(async () => {
    await Promise.all([...document.images].map(i => i.complete ? null :
      new Promise(r => { i.onload = r; i.onerror = r; })));
  });
  await p.waitForTimeout(700);
  const big = (await p.screenshot({ type: "png" })).toString("base64");
  const small = await sp.evaluate(async ({ big }) => {
    const img = new Image();
    await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = "data:image/png;base64," + big; });
    const c = document.createElement("canvas"); c.width = 1080; c.height = 1350;
    const g = c.getContext("2d"); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    g.drawImage(img, 0, 0, 1080, 1350);
    return c.toDataURL("image/png").split(",")[1];
  }, { big });
  const buf = Buffer.from(small, "base64");
  fs.writeFileSync(`${OUT}/${name}.png`, buf);
  console.log(`${name}.png  1080x1350  ${(buf.length / 1024).toFixed(0)} KB`);
}
await b.close();

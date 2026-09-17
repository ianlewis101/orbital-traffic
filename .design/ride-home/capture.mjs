import { chromium } from "playwright";
import fs from "fs";
// Where the full-res captures land; export.mjs reads them from here.
const OUT = process.env.SHOTS_DIR || "/tmp/orbital-shots";
fs.mkdirSync(OUT, { recursive: true });
// Worker routes are unreachable from a sandboxed session, so they are
// fulfilled from the repo's own committed data — every value on screen is real.
// Build crew-fixture.json from iss-today.json's roster in buildCrew()'s shape.
const DATA = process.env.DATA_DIR || "/tmp/fresh";
const crew = fs.readFileSync(`${DATA}/crew-fixture.json`, "utf8");
const caps = fs.readFileSync(`${DATA}/caps.json`, "utf8");
const today = fs.readFileSync(`${DATA}/today.json`, "utf8");

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-proxy-server"] });
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, serviceWorkers: "block" });
const p = await ctx.newPage();
const json = (body) => ({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body });
await p.route("**/crew*",    r => r.fulfill(json(crew)));
await p.route("**/capsules*", r => r.fulfill(json(caps)));
await p.route("**/today*",   r => r.fulfill(json(today)));
await p.route("**://orbital-traffic.ianlewis101.workers.dev/tle*", r => r.abort());
await p.route("**://celestrak.org/**", r => r.abort());

await p.goto("http://localhost:4173/", { waitUntil: "load" });
await p.waitForTimeout(12000);

async function setCats(vis) {
  await p.evaluate((v) => {
    for (const el of document.querySelectorAll("#cats .cat")) {
      const nm = el.querySelector(".nm").textContent.trim();
      const show = v.includes(nm), off = el.classList.contains("off");
      if (show && off) el.click(); if (!show && !off) el.click();
    }
  }, vis);
  await p.waitForTimeout(1000);
}
async function pick(q) {
  const open = await p.evaluate(() => document.querySelector("#search-wrap").classList.contains("expanded"));
  if (!open) { await p.click("#search-toggle"); await p.waitForTimeout(600); }
  await p.evaluate(() => { document.querySelector("#search-in").value = ""; });
  await p.type("#search-in", q, { delay: 35 });
  await p.waitForTimeout(1400);
  const hits = await p.evaluate(() => [...document.querySelectorAll("#results .res")].slice(0,4).map(e=>e.textContent.trim().slice(0,40)));
  console.log(`  "${q}" ->`, JSON.stringify(hits));
  if (!hits.length) return false;
  await p.click("#results .res"); await p.waitForTimeout(3500);
  return true;
}
const close = async () => { await p.evaluate(()=>{const x=document.querySelector("#info-x"); if(x)x.click();}); await p.waitForTimeout(700); };

console.log("legend:", await p.evaluate(()=>[...document.querySelectorAll("#cats .cat")]
  .map(e=>e.querySelector(".nm").textContent+"="+e.querySelector(".ct").textContent).join(" | ")));

// S1 — stations + capsules only
await setCats(["Stations","Capsules"]);
await p.waitForTimeout(1500);
await p.screenshot({ path: `${OUT}/f1-fleet-globe.png` });
console.log("f1 ok");

// S2 — ISS card (crew + docked capsules)
if (await pick("ISS (ZARYA)")) { await p.screenshot({ path: `${OUT}/f2-iss-card.png` }); console.log("f2 ok"); }
await close();
// S3 — Crew Dragon 12
if (await pick("CREW DRAGON 12")) { await p.screenshot({ path: `${OUT}/f3-dragon.png` }); console.log("f3 ok"); }
await close();
// S4 — Tiangong core
if (await pick("CSS (TIANHE)")) { await p.screenshot({ path: `${OUT}/f4-css.png` }); console.log("f4 ok"); }
await close();
// S5 candidates
if (await pick("SHENZHOU-23")) { await p.screenshot({ path: `${OUT}/f5-shenzhou.png` }); console.log("f5 ok"); }
await close();
if (await pick("PROGRESS-MS 34")) { await p.screenshot({ path: `${OUT}/f6-progress.png` }); console.log("f6 ok"); }
await b.close();

#!/usr/bin/env node
/**
 * update-iss-today.mjs
 * Fetches the current ISS crew roster and the most recent ISS activity
 * headlines from NASA's space station blog, and writes iss-today.json in
 * the repo root (served to clients via the Worker's /today endpoint).
 * Run locally or via the scheduled update-iss-today workflow.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../iss-today.json");
const ASTROS_URL = "http://api.open-notify.org/astros.json";
const RSS_URL = "https://blogs.nasa.gov/spacestation/feed/";
const HEADERS = {
  "User-Agent": "OrbitalTraffic/2.0 (+https://orbitaltraffic.app)",
  Accept: "application/rss+xml, application/xml, text/xml, application/json;q=0.9, */*;q=0.8",
};
const MAX_HEADLINES = 3;
const LOOKBACK_HOURS = 48;

function unescapeXml(s) {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#8217;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .trim();
}

/** Crew roster is informational only — never fatal. */
async function fetchIssCrew() {
  try {
    const res = await fetch(ASTROS_URL, { headers: HEADERS });
    const data = await res.json();
    const crew = (data.people || []).filter((p) => p.craft === "ISS").map((p) => p.name);
    console.log(`  ISS crew (${crew.length}): ${crew.join(", ") || "none reported"}`);
    return crew;
  } catch (e) {
    console.log(`  Crew lookup failed (${e.message}) — continuing without it.`);
    return [];
  }
}

/**
 * Headlines from the NASA blog RSS feed published within the lookback
 * window (falling back to the most recent posts if nothing qualifies).
 * Throws on failure — callers treat that as fatal so the existing
 * iss-today.json is left untouched.
 */
async function fetchRecentHeadlines() {
  const res = await fetch(RSS_URL, { headers: HEADERS });
  if (!res.ok) throw new Error(`RSS feed HTTP ${res.status}`);
  const xml = await res.text();

  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, body]) => {
    const title = /<title>([\s\S]*?)<\/title>/.exec(body);
    const pub = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(body);
    const pubDt = pub ? new Date(pub[1].trim()) : null;
    return {
      title: title ? unescapeXml(title[1]) : "",
      pubDt: pubDt && !Number.isNaN(pubDt.getTime()) ? pubDt : null,
    };
  });
  const parsed = items.filter((i) => i.title);
  if (!parsed.length) throw new Error("RSS feed returned no usable items");

  const cutoff = Date.now() - LOOKBACK_HOURS * 3600 * 1000;
  const inWindow = parsed.filter((i) => i.pubDt && i.pubDt.getTime() >= cutoff);
  const chosen = (inWindow.length ? inWindow : parsed).map((i) => i.title);
  return chosen.slice(0, MAX_HEADLINES);
}

/** Look for an explicit "Expedition NN" mention; otherwise carry forward. */
function detectExpedition(headlines, fallback) {
  for (const text of headlines) {
    const m = /Expedition\s+(\d+)/.exec(text);
    if (m) return `Expedition ${m[1]}`;
  }
  return fallback;
}

async function loadExisting() {
  try {
    return JSON.parse(await readFile(OUT, "utf8"));
  } catch {
    return {};
  }
}

async function main() {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  console.log(`\n=== ISS Today update — ${stamp} UTC ===\n`);

  const existing = await loadExisting();
  const fallbackExpedition = existing.expedition || "Expedition 74";

  console.log("Checking ISS crew roster:");
  await fetchIssCrew();

  console.log("\nFetching recent ISS activity from NASA blog feed:");
  let headlines;
  try {
    headlines = await fetchRecentHeadlines();
  } catch (e) {
    console.error(`  FAILED (${e.message})`);
    console.error("  Leaving iss-today.json unchanged.");
    process.exit(1);
  }
  console.log(`  Found ${headlines.length} headline(s):`);
  for (const h of headlines) console.log(`   - ${h}`);

  const result = {
    updated: new Date().toISOString().slice(0, 10),
    expedition: detectExpedition(headlines, fallbackExpedition),
    activities: headlines,
  };
  await writeFile(OUT, JSON.stringify(result, null, 2) + "\n");
  console.log(`\n✓ Wrote ${OUT}`);
}

main();

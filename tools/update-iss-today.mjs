#!/usr/bin/env node
/**
 * update-iss-today.mjs
 * Fetches the most recent ISS activity headlines from NASA's space station
 * blog and writes iss-today.json in the repo root (served to clients via the
 * Worker's /today endpoint).
 * Run locally or via the scheduled update-iss-today workflow.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { diffCrewRoster, MAX_CREW_EVENTS } from "@orbital-traffic/catalog";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../iss-today.json");
const RSS_URL = "https://blogs.nasa.gov/spacestation/feed/";
const HEADERS = {
  "User-Agent": "OrbitalTraffic/2.0 (+https://orbitaltraffic.app)",
  Accept: "application/rss+xml, application/xml, text/xml, application/json;q=0.9, */*;q=0.8",
};
const MAX_HEADLINES = 3;
const LOOKBACK_HOURS = 48;

// Same public route the client already uses — never LL2 directly.
// LL2_API_KEY is a Worker secret, not available to GitHub Actions, and
// re-implementing LL2's headers/rate-limit/negative-cache handling here
// would duplicate logic that already lives in worker/src/index.js.
const WORKER_BASE = "https://orbital-traffic.ianlewis101.workers.dev";

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

/**
 * Best-effort read of the live crew roster (ISS + Tiangong) via the
 * Worker's public /crew route, trimmed to what the diff needs. Throws on
 * any failure — the caller treats that as "skip this run's crew diff",
 * never as a reason to fail the whole job: the RSS-headline half of this
 * script must keep working even when LL2/the Worker is having a bad day
 * (documented at length in CLAUDE.md — 429s, staleness, etc. are routine).
 */
export async function fetchCrewRoster() {
  const res = await fetch(`${WORKER_BASE}/crew`, { headers: HEADERS });
  if (!res.ok) throw new Error(`/crew HTTP ${res.status}`);
  const data = await res.json();
  if (data.ok === false || !Array.isArray(data.people)) {
    throw new Error("crew fetch degraded (ok:false or a malformed response)");
  }
  return data.people.map((p) => ({ id: p.id ?? null, name: p.name, craft: p.craft }));
}

async function main() {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  console.log(`\n=== ISS Today update — ${stamp} UTC ===\n`);

  const existing = await loadExisting();
  const fallbackExpedition = existing.expedition || "Expedition 74";

  console.log("Fetching recent ISS activity from NASA blog feed:");
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

  // Crew roster diff is best-effort and independent of the RSS headlines
  // above: a failed/degraded /crew read must not block today's headline
  // update, and must not be treated as "everyone left" — it just carries
  // forward whatever roster/events were already on disk, with a clear
  // console warning as the failure signal (same soft-failure shape
  // update-capsule-status.mjs already uses for its last-30-days feed).
  const nowIso = new Date().toISOString();
  const previousRoster = Array.isArray(existing.crew) ? existing.crew : [];
  const isFirstCrewRun = !Array.isArray(existing.crew);
  let crew = previousRoster;
  let crewEvents = existing.crewEvents || [];
  console.log("\nFetching live crew roster:");
  try {
    const freshRoster = await fetchCrewRoster();
    if (isFirstCrewRun) {
      // Nothing to diff against yet — seed the baseline with zero events,
      // same as advanceCapsuleLog()'s isFirstRun handling.
      crew = freshRoster;
      console.log(`  First run — seeded roster with ${freshRoster.length} crew member(s), no events.`);
    } else {
      const diff = diffCrewRoster(previousRoster, freshRoster, nowIso);
      crew = diff.roster;
      crewEvents = [...crewEvents, ...diff.events].slice(-MAX_CREW_EVENTS);
      console.log(`  ${freshRoster.length} crew member(s), ${diff.events.length} change(s) since last run.`);
      for (const e of diff.events) console.log(`   - ${e.direction}: ${e.name} (${e.craft})`);
    }
  } catch (e) {
    console.warn(`  FAILED (${e.message}) — carrying forward the previous roster, no crew diff this run.`);
  }

  const result = {
    updated: new Date().toISOString().slice(0, 10),
    expedition: detectExpedition(headlines, fallbackExpedition),
    activities: headlines,
    crew,
    crewEvents,
  };
  await writeFile(OUT, JSON.stringify(result, null, 2) + "\n");
  console.log(`\n✓ Wrote ${OUT}`);
}

// Guarded so importing this module (e.g. from tests, to exercise
// fetchCrewRoster() in isolation) doesn't also kick off a live main() run —
// same pattern already used by fetch-tles.mjs and update-capsule-status.mjs.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

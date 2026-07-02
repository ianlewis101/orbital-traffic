/**
 * Orbital Traffic — Cloudflare Worker
 *
 * Proxies and caches the data the web app's "Fetch Live Data" / crew card
 * features depend on, so the client never has to hit CelesTrak, Open
 * Notify, or GitHub directly (and so those upstreams see one cached
 * request per TTL window instead of one per visitor).
 *
 * Routes:
 *   GET /tle    — merged satellite TLE records across CelesTrak groups
 *   GET /crew   — ISS/Tiangong crew roster
 *   GET /today  — ISS "Today aboard" activity feed
 *
 * All parsing/classification lives in @orbital-traffic/catalog (shared
 * with the web app and the data pipeline), so every client receives
 * objects that are already fully and correctly categorized — no
 * client-side classification pass needed.
 */
import { parseTle, mergeRecords, GROUPS, CELESTRAK_BASE, FETCH_HEADERS } from "@orbital-traffic/catalog";

export const TLE_TTL = 20 * 60; // 20 minutes
export const CREW_TTL = 60 * 60; // 1 hour
export const TODAY_TTL = 5 * 60; // 5 minutes

const CREW_URL = "http://api.open-notify.org/astros.json";
const TODAY_URL = "https://raw.githubusercontent.com/ianlewis101/orbital-traffic/main/iss-today.json";

async function fetchGroup([group, cat]) {
  try {
    const res = await fetch(CELESTRAK_BASE + group, {
      headers: FETCH_HEADERS,
      cf: { cacheTtl: TLE_TTL, cacheEverything: true },
    });
    if (!res.ok) return [];
    return parseTle(await res.text(), cat);
  } catch {
    return [];
  }
}

export async function buildTLERecords() {
  const results = await Promise.allSettled(GROUPS.map(fetchGroup));
  // Merge in GROUPS order (not fetch-completion order) so a satellite
  // already claimed by a specific group is never overwritten by a later,
  // more generic one.
  return mergeRecords(results.map((r) => (r.status === "fulfilled" ? r.value : [])));
}

export async function buildCrew() {
  try {
    const r = await fetch(CREW_URL, { cf: { cacheTtl: CREW_TTL, cacheEverything: true } });
    if (r.ok) return await r.json();
  } catch {}
  return { people: [], number: 0 };
}

export async function buildToday() {
  try {
    const r = await fetch(TODAY_URL, { cf: { cacheTtl: TODAY_TTL, cacheEverything: true } });
    if (r.ok) return await r.json();
  } catch {}
  return { updated: null, activities: [] };
}

function jsonResponse(data, ttl) {
  return new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": `public, max-age=${ttl}`,
    },
  });
}

/**
 * Edge-cache wrapper. `caches.default` only exists in the workerd
 * runtime; under tests it is absent and every request builds fresh.
 */
async function cached(ctx, path, ttl, build) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const cacheKey = new Request(`https://orbital-traffic.internal${path}`, { method: "GET" });
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }
  const res = jsonResponse(await build(), ttl);
  if (cache) ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

const ROUTES = {
  "/tle": (ctx) => cached(ctx, "/tle", TLE_TTL, buildTLERecords),
  "/crew": (ctx) => cached(ctx, "/crew", CREW_TTL, buildCrew),
  "/today": (ctx) => cached(ctx, "/today", TODAY_TTL, buildToday),
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }
    const { pathname } = new URL(request.url);
    const route = ROUTES[pathname];
    if (!route) return new Response("Not found", { status: 404 });
    return route(ctx);
  },
};

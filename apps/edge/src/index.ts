import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { parseTleText, type OrbitalObject, type TleRecord } from '@orbital/core';

/**
 * Orbital Traffic edge worker.
 *
 * Proxies + caches the upstreams the client depends on so visitors never hit
 * CelesTrak / Open-Notify / GitHub directly, and those upstreams see one
 * cached request per TTL window instead of one per visitor.
 *
 *   GET /tle    merged, classified satellite catalog (CelesTrak groups)
 *   GET /crew   ISS / Tiangong crew roster
 *   GET /today  ISS "today aboard" feed
 *
 * Classification is delegated to @orbital/core — the exact same pipeline the
 * web client runs — so the two can never drift out of sync.
 */

const TLE_TTL = 20 * 60;
const CREW_TTL = 60 * 60;
const TODAY_TTL = 5 * 60;

const CELESTRAK = 'https://celestrak.org/NORAD/elements/gp.php?FORMAT=tle&GROUP=';
const CREW_URL = 'http://api.open-notify.org/astros.json';
const TODAY_URL =
  'https://raw.githubusercontent.com/ianlewis101/orbital-traffic/main/apps/web/public/data/iss-today.json';

const FETCH_HEADERS = {
  'User-Agent': 'OrbitalTraffic/2.0 (+https://orbitaltraffic.app)',
  Accept: 'text/plain',
};

// CelesTrak groups in merge-priority order: specific groups claim a NORAD id
// before the generic "active" catch-all (which contains nearly every payload
// in orbit) is folded in last.
const GROUPS: [group: string, cat: string][] = [
  ['stations', 'stations'],
  ['gps-ops', 'navigation'],
  ['galileo', 'navigation'],
  ['glonass', 'navigation'],
  ['geo', 'geostationary'],
  ['cosmos-2251-debris', 'debris'],
  ['iridium-33-debris', 'debris'],
  ['fengyun-1c-debris', 'debris'],
  ['starlink', 'starlink'],
  ['oneweb', 'starlink'],
  ['science', 'science'],
  ['active', 'other'],
];

async function fetchGroup([group, cat]: [string, string]): Promise<OrbitalObject[]> {
  try {
    const res = await fetch(CELESTRAK + group, {
      headers: FETCH_HEADERS,
      cf: { cacheTtl: TLE_TTL, cacheEverything: true },
    });
    if (!res.ok) return [];
    return parseTleText(await res.text(), cat);
  } catch {
    return [];
  }
}

async function buildTleCatalog(): Promise<TleRecord[]> {
  const results = await Promise.allSettled(GROUPS.map(fetchGroup));
  const merged = new Map<string, OrbitalObject>();
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const obj of result.value) {
      if (!merged.has(obj.id)) merged.set(obj.id, obj);
    }
  }
  return [...merged.values()].map((o) => ({
    name: o.name,
    l1: o.line1,
    l2: o.line2,
    cat: o.category,
  }));
}

function jsonResponse(data: unknown, ttl: number): Response {
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${ttl}`,
    },
  });
}

/** Read-through edge cache keyed by path. */
async function cached(
  ctx: { waitUntil(promise: Promise<unknown>): void },
  path: string,
  ttl: number,
  build: () => Promise<unknown>,
): Promise<Response> {
  const cache = caches.default;
  const cacheKey = new Request(`https://orbital-traffic.internal${path}`);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const res = jsonResponse(await build(), ttl);
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

async function fetchJson<T>(url: string, ttl: number, fallback: T): Promise<T> {
  try {
    const res = await fetch(url, { cf: { cacheTtl: ttl, cacheEverything: true } });
    if (res.ok) return (await res.json()) as T;
  } catch {
    /* fall through */
  }
  return fallback;
}

const app = new Hono();
app.use('*', cors());

app.get('/', (c) => c.text('Orbital Traffic edge — routes: /tle /crew /today'));

app.get('/tle', (c) => cached(c.executionCtx, '/tle', TLE_TTL, buildTleCatalog));

app.get('/crew', (c) =>
  cached(c.executionCtx, '/crew', CREW_TTL, () =>
    fetchJson(CREW_URL, CREW_TTL, { people: [], number: 0 }),
  ),
);

app.get('/today', (c) =>
  cached(c.executionCtx, '/today', TODAY_TTL, () =>
    fetchJson(TODAY_URL, TODAY_TTL, { updated: null, activities: [] }),
  ),
);

export default app;

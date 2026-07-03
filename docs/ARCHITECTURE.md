# Architecture

## Overview

Orbital Traffic is a static-first PWA: the entire tracker runs client-side, backed by a
small Cloudflare Worker that proxies and edge-caches upstream data. There is no
application server and no database.

```
                                        ┌──────────────────────────────┐
   CelesTrak ──┐                        │   GitHub Pages (static)      │
   Open Notify ┼── Cloudflare Worker ── │   apps/web/dist              │
   NASA blog ──┘   /tle /crew /today    │   + /data/*.json catalog     │
                    /capsules           └──────────────┬───────────────┘
        │                 ▲                            │ app shell + bundled catalog
        │                 │ live refresh                │
        │                 └────────────────  browser ◄──┘
        │                                       ▲
        └── tools/ (scheduled CI) ──────────────┘  commits satellites.json,
                                                     iss-today.json, capsule-status.json
```

## Workspaces

### `packages/catalog` — the single source of truth

TLE parsing (`parseTle`, `mergeRecords`, `noradId`), CelesTrak group definitions
(`GROUPS`, in merge-priority order), and the classification pipeline (`categorize`).

Classification runs in a fixed, canonical order:

1. **Station allowlist** — only the 10 real ISS/Tiangong module NORAD IDs (plus
   currently-docked crew vehicles by name) keep `stations`; CelesTrak's stations group
   also contains cargo ships, cubesats and released hardware.
2. **Debris backstop** — rocket bodies, fragments and jettisoned station hardware are
   reclassified by name regardless of source group. Hand-curated `cool` objects are
   never overridden.
3. **"Other" rescue** — records that arrived via the generic `active` catch-all are
   promoted by constellation name patterns (navigation, communications, science) or
   military naming schemes (`classified`).

Every ingestion path runs this same pipeline: the web app's `ingest()`, the Worker's
`/tle` handler, and the daily data refresh. Historically these were three hand-synced
copies (JS ×2 + Python) that drifted; now a classification fix is one change plus a test.

`capsules.js` is a sibling module, not part of `categorize()`: it derives each tracked
crewed capsule's **phase** (`docked` / `free-flying` / `landed`) from orbital elements —
propagated 3D separation from the capsule's associated station, not just orbit shape, so
two objects sharing an altitude/inclination on opposite sides of Earth aren't mistaken for
"docked". A capsule keeps `cat:"stations"` for its whole tracked lifetime regardless of
phase; phase is additional per-capsule status, never a category swap.

### `apps/web` — the PWA

Vite-built ES modules. `three` and `satellite.js` are npm dependencies (the legacy build
inlined minified copies into a 3.8 MB `index.html`).

- `src/scene/` — renderer/camera rig, procedural Earth (canvas day/night textures from
  coastline polygons + custom shader), per-category point clouds, orbit trail, NEO shell,
  raycast picking, screen-space selection marker.
- `src/astro/` — SGP4 wrapper, sun direction, classical elements, Kepler solver for NEOs.
- `src/data/` — catalog loading (`/data/*.json`), ingest, live refresh (Worker with
  direct-CelesTrak fallback).
- `src/ui/` — info card (telemetry, SATCAT enrichment, crew, curated descriptions,
  procedural SVG artwork), legend, search, time machine, clock, favourites.

**Propagation budget:** positions update at ~20 Hz, but only ~3,500 SGP4 propagations run
per tick, round-robin across the catalog, so 11k+ objects never stall a frame. The
selected object is always propagated fresh.

**Data as assets:** the satellite catalog, coastlines, NEO elements, curated descriptions,
photo map and hotlist are versioned JSON under `apps/web/public/data/`. The daily refresh
workflow rewrites `satellites.json` — a plain file commit, replacing the legacy scheme of
regex-patching JSON into the HTML monolith.

**Service worker** (`public/sw.js`): cache-first for hashed build assets and icons,
stale-while-revalidate for `/data/` and `/photos/`, network-first with offline fallback
for navigations. Live endpoints are never intercepted.

### `worker` — Cloudflare Worker

Four GET routes, each edge-cached (`caches.default`) with per-route TTLs:

| Route | Upstream | TTL |
|-------|----------|-----|
| `/tle` | CelesTrak groups, merged + classified via `catalog` | 20 min |
| `/crew` | Open Notify `astros.json` | 1 h |
| `/today` | `iss-today.json` from this repo (raw.githubusercontent) | 5 min |
| `/capsules` | `capsule-status.json` from this repo (raw.githubusercontent) | 10 min |

Upstreams see one request per TTL window instead of one per visitor. Every route degrades
to an empty-but-valid payload if its upstream is down. Handlers are exported for unit
testing; the edge cache is feature-detected so tests run in plain Node.

### `tools` — data pipeline

- `fetch-tles.mjs` — fetches all CelesTrak groups (1 s politeness delay), merges and
  classifies via `catalog`, writes `apps/web/public/data/satellites.json`. Aborts rather
  than writing an empty catalog.
- `update-iss-today.mjs` — crew roster + NASA station-blog headlines (48 h window,
  newest-post fallback) → `iss-today.json`. Leaves the file untouched on any fetch failure.
- `update-capsule-status.mjs` — fetches CelesTrak's `stations` group, derives each tracked
  crewed capsule's phase via `catalog`'s `capsules.js`, diffs against the previous run to
  detect docked/undocked/launched/landed transitions → `capsule-status.json`. Aborts
  without writing if the CelesTrak fetch itself fails.

## CI/CD

| Workflow | Trigger | Does |
|----------|---------|------|
| `ci.yml` | push to main, PRs | lint → test → build |
| `deploy-pages.yml` | push to main | Vite build → GitHub Pages |
| `refresh-tle-data.yml` | daily 06:00 UTC | refresh + commit `satellites.json` |
| `update-iss-today.yml` | daily 12:00 UTC | refresh + commit `iss-today.json` |
| `update-capsule-status.yml` | every 4 h | refresh + commit `capsule-status.json` |

The Worker is deployed manually via `wrangler deploy` (see `worker/README.md`).

## Conventions

- ES modules everywhere, Node ≥ 20, one language (JS) across app, worker and pipeline.
- `vitest` at the repo root discovers all workspace test suites.
- UI markup/CSS in `apps/web/index.html` + `src/styles/app.css` are the preserved v1
  design ("Aurora") — behavior changes there should be visual-diff'd against production.

# Changelog

## 2.0.0 — 2026-07-01

Ground-up rebuild of everything **except the UI** — the Aurora design, markup, CSS and
interaction behavior are carried over unchanged.

### Architecture

- **Monorepo** (npm workspaces): `apps/web`, `packages/catalog`, `worker`, `tools`.
- **`@orbital-traffic/catalog`** — TLE parsing, CelesTrak group definitions and the
  object-classification pipeline extracted into one shared package with a test suite.
  Previously triplicated (and drifting) across `index.html`, the Worker and a Python
  script.
- **Web app rebuilt on Vite + ES modules.** `three` and `satellite.js` are npm
  dependencies instead of minified blobs inlined into HTML. App code split into
  `scene/`, `astro/`, `data/`, `geo/`, `ui/` modules.
- **Data extracted from the 3.8 MB HTML monolith** into versioned JSON assets
  (`apps/web/public/data/`): satellite catalog, coastlines, NEO elements, curated
  descriptions, hotlist. NASA photos decoded from inline base64 to real JPEG files.
- **Cloudflare Worker rewritten** on the shared catalog package with unit-tested,
  dependency-injectable handlers and feature-detected edge caching.
- **Python pipeline replaced with Node tools** (`tools/fetch-tles.mjs`,
  `tools/update-iss-today.mjs`). The daily TLE refresh now rewrites a JSON file instead
  of regex-patching `index.html`.
- **Service worker rebuilt**: versioned caches, cache-first for immutable build assets,
  stale-while-revalidate for catalog data, network-first navigations with offline
  fallback.

### Tooling & CI

- `vitest` test suites for the catalog package and Worker (34 tests).
- ESLint (flat config) + Prettier across the monorepo.
- New workflows: `ci.yml` (lint/test/build on every push and PR) and
  `deploy-pages.yml` (build → GitHub Pages). Data-refresh workflows ported to Node.
- Docs: README, ARCHITECTURE, CONTRIBUTING, MIT LICENSE; legacy notes moved to
  `docs/archive/`.

### Behavior

Feature-identical to 1.x by design: same globe, same categories, same info card, crew
cards, time machine, search, favourites and PWA install experience. One fix: a stray
malformed CSS declaration (silently dropped by browsers) was removed.

## 1.x

The original single-file app: `index.html` containing inlined three.js r128,
satellite.js 5.0, all application code and the full satellite catalog, patched daily by
a Python GitHub Action. Preserved in git history.

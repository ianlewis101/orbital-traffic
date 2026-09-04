# Changelog

## Unreleased

### Added

- **Starlink chains** — a freshly launched batch flies as one string for its first days
  or weeks in orbit (the "Starlink train" people photograph from the ground), and the
  app now finds those strings in the live catalog and tracks them as one thing. Each
  gets a row in _Today in Space_ — "Starlink train · 28 satellites / still in a line
  178 mi up · 56s apart" — and tapping it lights **every** satellite in the chain on the
  globe at once, joined head to tail along their shared orbit, with the camera aimed at
  the string. A _Tracked Chain_ card names the launch it came from and gives its live
  numbers (how many are still in the string, how high, how far apart in miles and in
  seconds, how long the chain is), then lists every member front-of-the-train first;
  tapping one opens the ordinary object card with the chain still lit behind it. A
  grouped "Launched · N new Starlink satellites" event now opens the whole chain too,
  instead of one arbitrary satellite from the batch. Detection is geometric and runs on
  device from live elements, so a train appears as it launches and fades out on its own
  as the satellites climb apart — nothing is hand-curated. OneWeb and Kuiper batches
  qualify on exactly the same terms.
- **What's Overhead** — a floating button on the globe that lists tracked objects
  currently above 40° elevation, with elevation and compass bearing per row. Tapping a
  row opens the existing object card. Purely geometric (visible to the eye or not).
  Asteroids/NEOs are excluded entirely, and so are "other" and "debris" — neither is
  traffic a user asking what's overhead cares about. Results are curated, not just
  sorted: stations, capsules, science, communications and classified objects always
  rank ahead of everything else, elevation-descending within each group — a 45°
  station outranks an 85° Starlink. Geostationary ranks with the rest by elevation
  rather than being pinned to the top — it sits at a fixed elevation for as long as
  you're standing still, so treating it as "traffic" crowded out the objects this
  ranking exists to surface. Nothing is discarded: the default view shows the top 25,
  with an honest total in the header, per-category filter chips, and a "Show all"
  control that reveals the rest of the same ranked list.
- **Settings** — the app's first preferences surface, opened from a gear button. Each
  section is its own card with an icon and a distinct accent color for quick
  wayfinding:
  - _Privacy & Permissions_ — location permission state, plus a "Reset & try again"
    control for a previously refused permission.
  - _Display_ — a km/miles toggle and a reduce-motion toggle.
  - _Data_ — catalog freshness and a manual "Refresh catalog now".
  - _About_ — app version, changelog and issue links, and data-source credits.
- **km/miles units toggle** now drives the object card's telemetry (altitude, speed,
  high/low point) and the overhead list. Curated description prose stays imperial.

### Changed

- Location handling returns to the app for the first time since Pass Alerts was removed,
  on a materially different footing: coordinates are read on demand, used entirely on
  device, and never stored or transmitted. `NSLocationWhenInUseUsageDescription` and the
  privacy policy's Location section were restored to describe that.
- The privacy policy's third-party list now names Launch Library 2 (The Space Devs)
  instead of Open Notify, which was replaced as the crew data source in July.

### Fixed

- Observer geometry now rejects non-finite look angles. A malformed satrec propagates to
  a position object full of `NaN` rather than to nothing, and because `NaN` fails every
  comparison it would otherwise have slipped past the horizon filter as a phantom object.
- The international designator is back on the object card and the share image. Both read
  it off the parsed satrec, and satellite.js v5 dropped the `intldesg` field its v4 had,
  so every object silently resolved to "—" and the card's "Launched \<year\>" fallback (used
  when SATCAT has no record) never rendered at all. It's now read off the TLE at ingest,
  where the raw line is still in hand.

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

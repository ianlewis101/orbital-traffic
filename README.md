# Orbital Traffic 🛰️

A real-time 3D space-situational-awareness display. Track every satellite, space
station, and hazardous near-Earth object on an interactive globe — with positions
computed **on your device** via SGP4 orbital propagation. Works offline, installs
as a PWA, and wraps to native iOS/Android via Capacitor.

> **v2 — rebuilt from scratch.** The original was a single 3.9 MB `index.html`.
> This is a TypeScript monorepo with a framework-agnostic orbital-mechanics core,
> a React + Three.js front-end, and a Cloudflare edge worker. See
> [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the why.

---

## What it does

- **3D globe** with a day/night terminator that tracks the Sun, built from real
  coastline data.
- **~11,000+ tracked objects** positioned every frame with SGP4 — computed in a
  **Web Worker** so the render thread stays at 60 fps.
- **8 orbit classes** (Stations, Navigation, Geostationary, Starlink, Science,
  Other, Debris) plus **hazardous NEOs**, with a tested classification pipeline.
- **Time Machine** — scrub time forward/back at up to 300×.
- **Object detail panels** with live telemetry (altitude, speed, inclination,
  period, apogee/perigee, sub-satellite point), bespoke imagery, and the live
  ISS crew roster.
- **Near-Earth objects** with accurate heliocentric orbit diagrams.
- **Search** by name or NORAD id, favourites, and "popular today" shortcuts.
- **Offline-first PWA**, installable, safe-area aware for native shells.

## Monorepo layout

```
packages/
  core/        @orbital/core        framework-agnostic orbital mechanics + classification (tested)
  data/        @orbital/data        typed data-access layer for the static snapshots
  ui-tokens/   @orbital/ui-tokens   "Deep Field" design tokens (TS + CSS)
apps/
  web/         @orbital/web         React + Vite + react-three-fiber PWA  (+ Capacitor)
  edge/        @orbital/edge        Cloudflare Worker (Hono): /tle /crew /today
tooling/       data-refresh scripts run by GitHub Actions
```

## Tech stack

| Layer            | Choice                                                    |
| ---------------- | --------------------------------------------------------- |
| Monorepo         | pnpm workspaces + Turborepo                               |
| Language         | TypeScript (strict)                                       |
| Orbital math     | `@orbital/core` wrapping **satellite.js** (SGP4)          |
| 3D               | **Three.js** via **@react-three/fiber**                   |
| UI               | **React 19** + **Vite 6**                                 |
| State / data     | **Zustand** + **TanStack Query**                          |
| PWA              | `vite-plugin-pwa` (Workbox)                               |
| Native           | **Capacitor** (wraps the built PWA)                       |
| Edge             | **Cloudflare Workers** + **Hono**                         |
| Tests            | **Vitest** (unit) + **Playwright** (e2e)                  |

## Getting started

```bash
pnpm install          # Node >= 20, pnpm 10
pnpm dev              # run every app's dev server (web on http://localhost:5173)
pnpm --filter @orbital/web dev    # just the web app
```

Other tasks (Turbo-orchestrated across the workspace):

```bash
pnpm build        # build everything
pnpm test         # unit tests (orbital math + classification)
pnpm lint         # eslint
pnpm typecheck    # tsc --noEmit everywhere
pnpm format       # prettier --write
```

## Data refresh

The bundled snapshot in `apps/web/public/data/` is refreshed by GitHub Actions:

- `pnpm data:refresh` — fetch CelesTrak, classify with `@orbital/core`, rewrite
  `catalog.json` (daily via `refresh-catalog.yml`).
- `python tooling/refresh-iss-today.py` — refresh the ISS feed (daily).

## Native (Capacitor)

```bash
pnpm --filter @orbital/web build
cd apps/web && npx cap add ios       # or: android
npx cap sync
```

The generated `ios/` / `android/` projects are git-ignored. Config lives in
`apps/web/capacitor.config.ts`.

## Deploy

- **Web:** `deploy.yml` builds `@orbital/web` and publishes `apps/web/dist` to
  GitHub Pages (custom domain via `apps/web/public/CNAME`).
- **Edge:** `cd apps/edge && pnpm deploy` (`wrangler deploy`).

## Attribution

Orbital data: [CelesTrak](https://celestrak.org) / Space-Track.org · crew via
Open-Notify · for informational use only, not for operational space safety.

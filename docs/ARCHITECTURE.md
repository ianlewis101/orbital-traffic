# Architecture

## Why a rebuild

The v1 app was a single **3.9 MB `index.html`**: Three.js, satellite.js, ~2.2 MB
of TLE JSON, and ~490 KB of base64 imagery all inlined, plus ~1,500 lines of
vanilla JS in one IIFE. It worked, but:

- The valuable domain logic (SGP4 propagation, the orbit-class **classification
  pipeline**) was tangled into DOM code **and copy-pasted three times** — into the
  HTML, the Cloudflare worker, and a Python script — so fixes had to land in
  triplicate and drifted out of sync.
- Nothing was testable. There was no way to assert "the ISS classifies as a
  station" or "SGP4 gives a 92-minute period" without a browser.
- The whole 3.9 MB re-parsed on every load; no code-splitting, no tree-shaking.
- There was **no path to a real mobile app** — the logic couldn't be shared.

## The central decision: a framework-agnostic core

Everything flows from one idea: **extract the domain logic into a pure-TypeScript
package with zero UI dependencies**, and let every surface import it.

```
                ┌─────────────────────────────┐
                │        @orbital/core         │
                │  TLE · SGP4 · NEO Kepler ·   │
                │  classification · formatting │
                └───────────┬─────────────────┘
            ┌───────────────┼────────────────┐
            ▼               ▼                ▼
      apps/web         apps/edge       (future native)
   React + r3f PWA   Cloudflare Hono   Capacitor wraps web
```

`@orbital/core` has a single runtime dependency (satellite.js for SGP4). The
classification pipeline that was triplicated now lives here once, with **28 unit
tests** covering the station allowlist, debris/rocket-body detection, the "other"
rescue, the NEO Kepler solver, and a physical sanity check on ISS propagation.
The edge worker and the web client both call `classify()` / `parseTleText()`, so
they can no longer disagree.

## Performance: propagation in a Web Worker

Propagating ~11,000 objects with SGP4 every frame would stall the main thread.
Instead `apps/web` runs propagation in a **dedicated worker**
(`propagator.worker.ts`) on a self-paced ping-pong loop: the worker computes all
positions into a transferable `Float32Array` and ships it back zero-copy; the
render thread only ever swaps a buffer and toggles a per-object visibility flag.
The 3D points are a single `THREE.Points` with a small custom shader (per-object
colour + show flag), and picking is a CPU projection scan with globe-occlusion —
no raycasting 11k sprites.

## Rendering frame

The scene works in an **Earth-fixed frame**: a unit sphere with north at +Y and
(lat 0, lon 0) at +X. The same `geoToVec` mapping places satellites *and* drives
the Earth shader's texture lookup (derived by inverting the mapping from the
surface normal), which is what guarantees objects sit over the correct ground
point. The day/night terminator is computed from a low-precision solar position
so it tracks the Time Machine.

## State

- **`simClock`** — a plain module singleton advanced once per frame by
  `SimDriver`. Deliberately *not* React state; routing 60 Hz updates through
  React would re-render the tree every frame. UI samples it on an interval.
- **Zustand** for low-frequency UI state (rate, selection, layer visibility,
  favourites persisted to `localStorage`). A separate tiny store isolates pointer
  hover so only the tooltip re-renders on move.
- **TanStack Query** for data loading (catalog, NEOs, descriptions, imagery,
  crew) with lazy fetching — the 340 KB descriptions file only loads when a
  detail panel first needs it.

## Data

The bundled snapshots (catalog, NEOs, descriptions, coastlines, imagery) are
served as static assets from `apps/web/public/`, runtime-cached by the service
worker for offline use, and refreshed by GitHub Actions. `@orbital/data` is the
typed access layer over them (fetch + DTOs), framework-agnostic so the loaders
work in the browser, Node tooling, or a worker.

## Mobile path (chosen: Capacitor)

The web app is built PWA-first and wrapped natively with **Capacitor** —
`webDir: dist`, safe-area-aware CSS (`env(safe-area-inset-*)`), and a standalone
manifest. Because the core is framework-agnostic, the SGP4/classification engine
ships unchanged inside the native shell.

## Trade-offs & next steps

- The main JS bundle is ~328 KB gzipped, dominated by Three.js — acceptable for a
  3D app; could be lazy-loaded behind the splash if needed.
- NEOs are first-class in search + an accurate 2D orbit diagram rather than mixed
  into the Earth-centric 3D scene (heliocentric vs geocentric scales don't share
  a frame cleanly).
- Future: orbit-trail ribbons, ground-track projection, and pass predictions for
  a user location (the geodetic math is already in `@orbital/core`).

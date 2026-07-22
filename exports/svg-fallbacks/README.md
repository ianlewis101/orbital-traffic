# SVG fallback illustration exports

Standalone, high-resolution exports of the procedurally-generated SVG
fallback illustrations drawn by `svgFor()` in
`apps/web/src/ui/figures.js`. These are direct extractions of the
existing artwork — nothing was redesigned, redrawn, or modified. Each
file was produced by calling the real `svgFor()` function with a fake
satellite object chosen only to steer `classify()` (in
`apps/web/src/ui/describe.js`) to the target category, then wrapping the
returned markup with a larger explicit `width`/`height` for high-res
rasterization. The `viewBox` (`0 0 240 130`) and every path/line/shape
coordinate inside it are byte-for-byte what the app renders today.

## Files

- `station-fallback.svg` — the `classify(s) === "station"` branch
  (solar arrays + docking modules)
- `capsule-fallback.svg` — the `classify(s) === "capsule"` branch
  (crew/cargo vehicle silhouette)
- `telescope-fallback.svg` — the `classify(s) === "telescope"` branch
  (barrel + aperture)
- `generic-fallback.svg` — the final fallback at the bottom of
  `svgFor()` (wings, bus, antenna/dish). This is what the app currently
  renders for `"classified"` objects, since that category has no
  dedicated shape.

Each SVG keeps `viewBox="0 0 240 130"` and adds `width="1920"
height="1040"` (8x) on the root `<svg>` element only — no drawing
content was touched.

## Star field note

`svgFor()` draws a random star field on every call (`Math.random()` for
star positions/opacity). These are static, one-time exports, so each
file has its own snapshot of random stars — this will not match the
star field any given user sees live in the app, and will differ from
one export run to the next. Only the stars are randomized; the
foreground illustration (station/capsule/telescope/generic shape) is
fixed, deterministic artwork and is identical to what ships in the app.

## Regenerating

Not part of the app build — this is a one-off asset export. To
regenerate, see the export script used to produce these files (calls
`svgFor()` directly with fake satellite objects and post-processes only
the opening `<svg>` tag to add width/height).

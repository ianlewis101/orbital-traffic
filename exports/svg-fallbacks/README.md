# SVG fallback illustration exports

Standalone, high-resolution exports of app assets, for external use in
App Store screenshots. Two kinds of file live here — literal extractions
and a value-for-value translation — noted per file below.

## Literal exports (`*-fallback.svg`, excluding `background-gradient.svg`)

`station-fallback.svg`, `capsule-fallback.svg`, `telescope-fallback.svg`,
and `generic-fallback.svg` are direct extractions of the
procedurally-generated SVG fallback illustrations drawn by `svgFor()` in
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
- `background-gradient.svg` — see "CSS-to-SVG translation" below; this
  one is **not** a literal extraction like the four files above.

Each of the four `svgFor()` exports keeps `viewBox="0 0 240 130"` and
adds `width="1920" height="1040"` (8x) on the root `<svg>` element
only — no drawing content was touched.

## CSS-to-SVG translation (`background-gradient.svg`)

Unlike the four `svgFor()` exports above, `background-gradient.svg` is
**not** a literal file extraction — CSS `radial-gradient()` and SVG
`<radialGradient>` are different syntaxes, so there is no source markup
to copy verbatim. This file is a faithful, value-for-value translation
of the `#info-figure` background in `apps/web/src/styles/app.css`
(the 3-layer teal/purple/navy glow that renders behind every object
card's illustration/photo):

```css
background:
  radial-gradient(120% 120% at 28% 18%, rgba(94,234,212,0.22), transparent 55%),
  radial-gradient(120% 120% at 82% 86%, rgba(167,139,250,0.28), transparent 55%),
  radial-gradient(120% 120% at 50% 30%, #15203c 0%, #0a0e1c 78%)
```

Translation notes:

- Each CSS layer becomes one `<radialGradient>` + one full-canvas
  `<rect>` filled with it, stacked in the same order as the CSS
  comma-separated list: the first-listed CSS layer paints on top, so in
  SVG document order it is drawn **last** (rects later in the markup
  paint over earlier ones). The navy base (CSS layer 3, last-listed) is
  the first `<rect>` in the file; the teal glow (CSS layer 1,
  first-listed) is the last `<rect>`.
- CSS's `120% 120% at X% Y%` sets an ellipse whose horizontal/vertical
  radii are 120% of the box's width/height, centered at `(X%, Y%)`.
  SVG's default `objectBoundingBox` gradient units reproduce this
  exactly: `cx`/`cy` are the same `X`/`Y` fractions (`0.28`/`0.18`,
  `0.82`/`0.86`, `0.50`/`0.30`), and a single `r="1.2"` (120%) is
  stretched independently against the rect's actual width and height —
  no manual ellipse math or `gradientTransform` needed.
- `rgba(94,234,212,0.22)` / `rgba(167,139,250,0.28)` become
  `stop-color`/`stop-opacity` pairs with the same RGB and alpha values.
  The CSS `transparent` end stops become the same `stop-color` at
  `stop-opacity="0"` (matching how browsers actually render a
  color-to-`transparent` gradient — same hue fading to zero alpha —
  rather than literally interpolating through opaque black).
- `#15203c`/`#0a0e1c` (layer 3, fully opaque, no alpha channel) are
  copied as-is as `stop-color` with no `stop-opacity` override.
- Verified by rendering both the real CSS (in an HTML page with the
  exact rule above) and this SVG in the same headless-Chromium build at
  1920x1040 and diffing the two screenshots: max per-channel difference
  was 1 (anti-aliasing noise), i.e. visually identical.
- Canvas is `viewBox="0 0 1920 1040" width="1920" height="1040"`, same
  resolution as the other four exports in this folder.

`app.css` itself was not modified — this is an export-only addition.

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

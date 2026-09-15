# Splash lockup (satellite mark + wordmark)

Downloadable exports of the logo the app draws on its splash screen — the
satellite mark above `Orbital Traffic™`. This is a *different* mark from the
orbit-ring app icon one directory up: the icon is what the home screen and
favicon show, this is what the splash screen shows.

Nothing here is generated at build time and nothing reads it at runtime. The
live splash is still drawn from the inline SVG in `apps/web/index.html` plus
the `#splash` rules in `apps/web/src/styles/app.css` — these files are exports
of that rendering, for anywhere the app itself can't be screenshotted (store
listings, press, slides, stickers).

## Files

| File | Size | Background |
| --- | --- | --- |
| `orbital-traffic-logo.svg` / `.png` | 400×240 / 3200×1920 | `#07080f` |
| `orbital-traffic-logo-transparent.svg` / `.png` | 400×240 / 3200×1920 | none |
| `orbital-traffic-logo-square.svg` / `.png` | 512×512 / 2048×2048 | `#07080f` |
| `orbital-traffic-mark.svg` / `.png` | 256×256 / 2048×2048 | `#07080f` |
| `orbital-traffic-mark-transparent.svg` / `.png` | 256×256 / 2048×2048 | none |
| `orbital-traffic-splash-1290x2796.png` | 1290×2796 | `#07080f` |

The last one is the whole splash screen — lockup, loading bar and the
`Loading N objects in orbit for you to explore` line — at iPhone Pro Max @3x.
Its object count is a snapshot of `__OBJECT_COUNT__` at export time, so it goes
stale as the catalog grows; the app's own splash never does (see the OBJECT
COUNT section in `CLAUDE.md`).

The SVGs carry no font dependency: the wordmark is Orbitron 800 converted to
outlines at the exact glyph positions Chromium lays out, kerning and the
0.01em letter-spacing included. Orbitron has no U+2122, so the app's trademark
glyph comes from the CSS fallback stack — it is outlined from the system sans
and will differ by a hair from the iOS build's SF Pro one, the same way the web
app and the iOS app already differ from each other.

## Geometry and palette

- Lockup is 302.5×143 at 1×: a 96×96 mark, a 2px gap, then the wordmark's
  45px line box. Clear space in the framed exports is half the mark (48px).
- Mark gradient: `#eef1f8 → #5eead4 → #a78bfa` diagonally across its 64×64 box,
  with `#f5c168` on the antenna and `#0b1020` panel lines.
- Wordmark gradient: `linear-gradient(95deg, #eef1f8 12%, #5eead4 55%,
  #a78bfa 92%)` over the line box, the `™` in `#737a90` at 0.8 opacity.
- Background `#07080f` is the app's `--bg` token.

Same tokens as `apps/web/src/config.js` and the app's CSS custom properties, so
re-exporting after a palette change stays on-brand automatically.

## Re-rendering

Any size, from the vectors (requires `librsvg`):

```
rsvg-convert -w 3200 orbital-traffic-logo.svg -o orbital-traffic-logo.png
```

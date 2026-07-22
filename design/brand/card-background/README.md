# Object-card fallback background (static export/reference)

**These are exported PNGs for reference/marketing use only — not used by the app.**
The real thing is generated live, from three separate pieces of code, every time an
object without a real photo renders its info card:

1. **The gradient/glow** — pure CSS, three stacked `radial-gradient()` layers on
   `#info-figure` in `apps/web/src/styles/app.css` (search for `#info-figure{`).
2. **The scattered stars** — plain JS, random `<circle>` positions generated at
   render time in `apps/web/src/ui/figures.js` (`svgFor()`, the `stars` variable).
3. **The film-grain texture** — an inline `feTurbulence`-based SVG data-URI,
   `#fx-grain` in `app.css` / `index.html`. Not present in these exports (see below).

If any of those three change, these PNGs go stale. **Don't point the app at these
files** — if you need the background in a new size in the live product, add a size
to the real CSS/JS, not a new export here.

## How these were made (v2 — corrected)
These are **authentic captures**, not a hand-reconstructed approximation:

1. Loaded the real, live app in a real browser (headless Chromium via Playwright)
   and selected STARLINK-35763 — an object with no real photo, so it renders the
   CSS-gradient + SVG-star fallback.
2. Surgically removed only the satellite-illustration shapes from the rendered
   SVG DOM (6 elements) while leaving the real, actual star circles (14 of them,
   their genuine positions/sizes/opacities from that page load) and the untouched
   CSS gradient background fully intact.
3. Verified this pixel-for-pixel against an unmodified capture of the same card:
   every corner pixel matched exactly; only the center (where the satellite icon
   used to be) changed. So this is the genuine background, not a recreation.
4. Upscaled 8x (Lanczos) from the real 298×116 capture, then cover-fit cropped to
   each target size.

An earlier version of these files was a *from-scratch synthetic reconstruction* of
the CSS/JS recipe (right formula, but reapplied incorrectly at each target aspect
ratio, and with randomly-generated stars rather than the app's real ones) — this
version replaces that with an actual capture instead.

Not included here: the `#fx-grain` noise texture, since it sits behind the UI
layer (z-index) rather than directly on this element — worth revisiting if a
future export needs to match texture as well as color/position exactly.

## Files
- `card-fallback-bg-master.png` — the authentic capture, upscaled — 2384×928,
  correct native aspect ratio (298:116, the real card's own proportions). Re-crop
  from this if you need another size.
- `card-fallback-bg-1080x1920.png` — cover-fit crop of the master, portrait.
- `card-fallback-bg-1024x1024.png` — cover-fit crop of the master, square.

## Why "cover-fit crop from a correct-aspect master" and not "recompute at any size"
The CSS uses percentage-based sizing (e.g. `120% 120%` per glow), which is only
correct relative to a box shaped like the real card. Reapplying that same
percentage math to a very different aspect ratio (e.g. a tall 1080×1920 canvas)
produces a differently-shaped, wrong-looking glow. Capturing once at the correct
native aspect ratio and then cropping to fit (like a wallpaper crop) keeps the
proportions honest at any output size.

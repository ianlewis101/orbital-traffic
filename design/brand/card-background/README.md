# Object-card fallback background (static export/reference)

**These are exported PNGs for reference/marketing use only — not used by the app.**
The real thing is generated live, from three separate pieces of code, every time an
object without a real photo renders its info card:

1. **The gradient/glow** — pure CSS, three stacked `radial-gradient()` layers on
   `#info-figure` in `apps/web/src/styles/app.css` (search for `#info-figure{`).
2. **The scattered stars** — plain JS, random `<circle>` positions generated at
   render time in `apps/web/src/ui/figures.js` (`svgFor()`, the `stars` variable).
   Randomized per render in the real app — these exports freeze one specific
   draw of them.
3. **The film-grain texture** — an inline `feTurbulence`-based SVG data-URI,
   `#fx-grain` in `app.css` / `index.html`.

If any of those three change, these PNGs go stale. **Don't point the app at these
files** — if you need the background in a new size in the live product, add a size
to the real CSS/JS, not a new export here.

## Files
- `card-fallback-bg-master.png` — large reference render at the *correct* native
  proportions (298:116, the real card's own aspect ratio) — 2384×928. Re-crop from
  this if you need another size; cropping from here (rather than recomputing the
  CSS math at a new aspect ratio) is what keeps the glow shapes correct. See the
  note below on why that matters.
- `card-fallback-bg-1080x1920.png` — cover-fit crop of the master, for portrait
  marketing use (App Store screenshots, social).
- `card-fallback-bg-1024x1024.png` — cover-fit crop of the master, square.

## Why "cover-fit crop from a correct-aspect master" and not "recompute at any size"
The CSS uses percentage-based sizing (e.g. `120% 120%` per glow), which is only
correct relative to a box shaped like the real card. Naively reapplying that same
percentage math to a very different aspect ratio (e.g. a tall 1080×1920 canvas)
produces a differently-shaped, wrong-looking glow — stretched into a tall ellipse
instead of the compact one you actually see in the app. Rendering once at the
correct native aspect ratio and then cropping to fit (like a wallpaper crop) keeps
the proportions honest at any output size.

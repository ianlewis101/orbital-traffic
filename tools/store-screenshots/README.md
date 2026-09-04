# App Store screenshots

Generates the six 1290×2796 iPhone screenshots for the App Store listing, from
the real app rather than from a mockup. Output lands in
`design/store-screenshots/`; that directory is what gets uploaded to App Store
Connect.

The pipeline is two steps, deliberately separate: capturing is slow and needs
a running app, composing is fast and is what you iterate on when the copy or
the layout changes.

```bash
npm run build
npm run preview -w @orbital-traffic/web -- --port 4173 --strictPort   # leave running

npm i --no-save playwright          # see "Why playwright isn't a dependency"
node tools/store-screenshots/capture.mjs   # drives the app  -> tools/store-screenshots/raw/
node tools/store-screenshots/render.mjs    # composes frames -> design/store-screenshots/
```

`render.mjs --jpeg` writes quality-96 JPEGs instead of PNGs. Only needed if a
Transporter upload ever objects to the PNGs — Chromium already writes them as
RGB (colour type 2, no alpha channel), which is what App Store Connect wants.

## Files

| File | What it is |
|---|---|
| `capture.mjs` | Drives the built app in a 1290×2796 iPhone viewport and saves six raw screens |
| `frames.mjs` | The frame spec: copy, accent colour, and which band of each capture to show |
| `render.mjs` | Composes the marketing frames and a `contact-sheet.jpg` for reviewing the set |
| `raw/` | Capture output — gitignored, regenerate any time |

Copy lives in `frames.mjs`, not in the renderer. Editing a headline and
re-running `render.mjs` takes about ten seconds and needs no browser session
against the app.

## Everything in these images is real

No mocked data, no invented UI, no fabricated numbers.

- The catalog comes from the bundled `satellites.json` — the same file the app
  ships and the daily TLE refresh updates.
- `/crew`, `/today` and `/capsules` are fetched live from the production Worker
  at capture time and replayed into the page as route fixtures, so a run is
  reproducible and works behind a proxy. If the Worker is unreachable the
  capture **stops** rather than shipping a screenshot that says "crew data
  temporarily unavailable".
- Every figure in the copy (19,000+ objects, 2,200+ profiles, 77 NEOs) is
  derived in `frames.mjs` from the bundled data, using the same rounding as
  `apps/web/vite.config.js`. A number baked into a PNG can't be covered by
  `object-count-sync.test.js` — a test can't read it back out — so the only
  safe version of it is one that can't drift. **Don't hand-type a figure into
  `frames.mjs`.**

The one thing that is *staged*: frame 02 sets the observer's location to the
ISS ground track, so "What's Overhead" is captured during a real pass of the
whole station complex — ISS modules, plus the docked Dragon, Progress, Cygnus
and Soyuz. That is a genuine app state any user gets during an ISS pass;
choosing the moment is the only editorial act. Everything the list shows is
computed by the app from real elements.

## Re-running is expected to produce different pixels

The globe rotates with UTC, telemetry is live, and the crew roster changes with
the expedition. Two runs an hour apart give different continents, different
altitudes and possibly different names — all correct. Re-run whenever the
listing is being refreshed; there is nothing to keep in sync by hand.

`capture.mjs` records the top edge of each sheet in `raw/geometry.json`, and
`frames.mjs` crops to that anchor rather than to a hardcoded offset, so a
layout change in the app moves the composition with it instead of silently
sliding it.

## Why playwright isn't a dependency

It's a one-off design tool. Adding `playwright` to `package.json` would make
every CI `npm ci` pull a browser download for a script that runs a few times a
year. `npm i --no-save playwright` when you need it.

If the pinned Chromium isn't at `/opt/pw-browsers/chromium`, set
`OT_CHROMIUM=/path/to/chromium`. `OT_PREVIEW_URL` overrides the preview URL.

## The design, in one paragraph

One layout, six times: fixed eyebrow row, two-line headline, two-line subhead,
hairline, proof line, then the real screen starting at exactly the same y in
every frame. The screen sits at 91% scale and bleeds off the bottom rather than
being shrunk to fit under the copy — losing the bottom edge costs nothing,
shrinking every label in the app costs the thing that actually sells a data
product. Each frame's accent is lifted from the app's own category palette
(`apps/web/src/config.js` `CATS`) for whatever it shows, so swiping the set
walks the product's own legend. The starfield and the two orbital sweeps are
drawn once across a 7,740px panorama — six frames wide — and each frame renders
its slice, so the arc carries across the seams instead of restarting six times.

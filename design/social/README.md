# Social page assets (Facebook)

Cover artwork and page copy for the Orbital Traffic Facebook page, plus the
generator that produces them.

```
cover-facebook.png       1640 × 624 — the file to upload
preview-desktop.png      820 × 312  — how desktop renders it
preview-mobile.png       640 × 389  — how a phone renders it, profile photo included
preview-safe-areas.png   crop + profile-photo guides, for checking placement
```

The generator lives with the other asset generators, at
`tools/build-social-cover.mjs` (`npm run social:cover`).

Only `cover-facebook.png` gets uploaded; the three previews exist so a layout
change can be checked at the sizes Facebook actually displays, rather than at
2× where everything looks fine.

**Profile picture:** no new asset needed — `apps/web/public/icons/icon-512.png`
is the app icon at 512 × 512 and already reads correctly in a circular crop.

---

## Cover geometry

**Do not trust Facebook's published cover sizes.** They say the phone shows a
640 × 360 centre crop, which would be the middle 1109px of this canvas, and
they say nothing about the profile photo moving. Both are wrong in ways that
cut the artwork. The figures below are measured from a screenshot of the real
page and are what the layout is built against; re-measure the same way if
Facebook changes the layout again.

| Surface | Shows | Profile photo sits |
|---|---|---|
| Upload | the whole 1640 × 624 file | — |
| Desktop | all of it, at 820 × 312 | **bottom-left**, over roughly x < 400, y > 344 |
| Phone | **x 398–1346, y 0–576** (≈948 wide, bottom ~50px hidden) | **centred**, over x 674–1080, everything below y = 316 |

Three constraints follow, and the layout respects all three:

1. **Readable content stays between x ≈ 400 and x ≈ 1346** — the band the phone
   keeps. Only the starfield and the globe bleed past it.
2. **The bottom-left corner stays empty** for the desktop profile photo. The
   copy block starts at x = 424 for that reason.
3. **Anything below y = 316 must end before x ≈ 660**, clear of the *centred*
   phone profile photo. This is the constraint that is easy to miss, because
   nothing on desktop hints at it. The stat rows are stacked rather than one
   line precisely because of it: the single line was 385px wide, ran to x = 809,
   and the phone cut it mid-word at "77 ASTEROI".

`preview-safe-areas.png` draws all of it — both profile-photo positions, the
phone's crop, and the x = 660 limit — over the artwork. `preview-mobile.png`
now includes the profile photo where it really lands, so the phone preview
shows what a visitor sees rather than what was uploaded.

Because the phone shows a *narrower* band than the upload, Facebook lets the
image be dragged horizontally in its cover editor. These figures describe its
default placement. Dragging shifts the visible band, so leave it where it
lands.

## What the picture is made of

The cover is generated from the project's own data rather than drawn, so it
stays a picture of the real product:

- **The globe** is `apps/web/public/data/coastlines.json` in orthographic
  projection, shaded per-pixel by the true sub-solar point for `SNAPSHOT` —
  a real terminator, with the dusk band and city lights (the same
  `CITY_LIGHTS` metros `scene/cityLights.js` paints in-app) falling where they
  actually fall at that instant.
- **Every dot is a real catalogue record.** Elements come straight off
  `satellites.json`'s TLE line 2, advanced from epoch to `SNAPSHOT` as a
  circular orbit, and each dot is coloured by that object's own `classify.js`
  category through `config.js`'s `CATS` — so the belt's shape, the Starlink
  shells and the debris spread are the catalogue's, not an illustrator's.
  ~6,800 of the 19,246 objects land inside the frame; the rest are in orbits
  too high to appear at this scale (GEO sits ~6.6 Earth radii out, far off
  canvas) or are hidden behind the planet.
- **The white orbit ring is the ISS's actual orbit plane**, with the station
  marked where it was at `SNAPSHOT`.
- Type is the app's own: Orbitron wordmark with the `#eef1f8 → #5eead4 →
  #a78bfa` gradient, Oxanium for HUD labels, Bricolage Grotesque for the
  headline, and the spacecraft mark lifted from `apps/web/index.html`.

Debris and `other` are drawn smaller and dimmer than the rest. They are
genuinely most of what is up there and stay in the picture, but at full weight
they bury the planet.

## Re-rendering

```bash
npm run social:cover
```

Needs a Chromium; it finds the one in this container automatically, or set
`CHROME=/path/to/chrome`. No npm install and no dependencies — it reads the
data files directly and rasterises through headless Chrome.

Worth knowing if you touch the renderer: `--window-size` sets the **outer**
window, and headless still reserves ~87px for browser chrome, so the viewport
is shorter than the window and `--screenshot` pads the difference with the page
background. Every shot is therefore taken oversized and cropped back down
(`cropPngFile`). Without that, the bottom of the artwork silently disappears —
it ate the URL line out of the 820 × 312 preview before it was caught.

To change the picture:

In `tools/build-social-cover.mjs`:

- `SNAPSHOT` — the instant shown. Sets the terminator and where every object
  is. The camera is earth-fixed, so changing the time re-lights the same face
  instead of spinning the planet.
- `VIEW_LAT` / `VIEW_LON` — the point on Earth the globe is centred on.
- `GLOBE_CX` / `GLOBE_CY` / `GLOBE_R` — size and placement of the planet.
- `OBJECT_COUNT_LABEL` — see the OBJECT COUNT convention in `CLAUDE.md`; this
  is one more hand-written surface for that figure.

---

## Page copy

### Bio (short field, keep under ~100 characters)

> See what's above you, right now — 19,000+ satellites and spacecraft on a live 3D globe.

*87 characters.* If the bio should pick up the cover's headline instead:

> Earth has traffic — 19,000+ satellites, stations and spacecraft on a live 3D globe.

*83 characters.* Or, flatter, saying only what the thing is:

> A live 3D map of everything in orbit: 19,000+ satellites, stations and spacecraft.

*82 characters.*

### Cover headline

The cover reads **"Earth has traffic. / Watch it move."**

This deliberately does *not* match `welcome.html`, whose `<h1>` — and its
`<title>` and `og:title` with it — say "See what's above you. Right now." The
two surfaces meet different readers: a social page is found cold by people who
have never heard of this and for whom "Orbital Traffic" doesn't explain itself,
while the landing page is read by someone who has already clicked. If the two
are ever meant to match again, those three places in `welcome.html` are what
change.

Alternatives that fit the two-line width budget, all rendered and checked in
place before choosing:

| | Headline | Angle |
|---|---|---|
| **chosen** | Earth has traffic. / Watch it move. | explains what the product name means |
| | See what's above you, / right now. | matches the landing page |
| | Space is busier / than you think. | curiosity; the dot field next to it proves the claim |
| | 19,000 objects are / above you right now. | scale — but repeats the stat line directly beneath it |
| | Look up. / Then look closer. | invitation; vaguest about what the thing is |
| | What's over your head / right now? | question form, close cousin of the landing-page line |
| | Real spacecraft. / Real time. | echoes the App Store description's closing line |

To try another without touching the file:

```bash
npm run social:cover -- --headline "Space is busier|than you think." --out-dir /tmp/v
```

### About / description (keep under 255 characters)

> A real-time 3D tracker for everything in orbit: 19,000+ satellites, stations, capsules, cargo freighters, debris and 77 near-Earth asteroids. Positions are computed live on your device — no account, no ads. Free on the App Store and at orbitaltraffic.app

*254 characters.* If the App Store mention isn't wanted, this leaves more room:

> A real-time 3D tracker for everything in orbit: 19,000+ satellites, stations, capsules, cargo freighters, debris and 77 near-Earth asteroids. Positions are computed live on your device — no account, no ads, works offline. orbitaltraffic.app

*240 characters.*

### Longer intro (for a pinned post, or an "Our Story" style section)

> **Orbital Traffic** is a real-time 3D tracker for everything in orbit.
>
> More than 19,000 tracked objects — the International Space Station, crewed
> capsules, cargo freighters, communications and navigation constellations,
> science missions, debris, and 77 near-Earth asteroids on their real
> heliocentric orbits.
>
> Tap once to see the notable objects passing high overhead from where you're
> standing. Search the catalogue for hand-written profiles on thousands of
> notable objects, alongside live telemetry for everything: altitude, speed,
> orbit shape, and the ground it's currently over. Watch capsules and
> freighters from launch through docking to landing, and see who's living
> aboard the station right now.
>
> Every position is computed on your own device from current orbital elements
> — no account, no ads, nothing collected. Free on the App Store for iPhone and
> iPad, free in any browser, and installable straight to your home screen on
> Android and desktop.
>
> orbitaltraffic.app

### Accuracy notes — why the copy is worded this way

Same discipline as `docs/archive/store-metadata.md`; re-check before loosening
any of these:

- **"19,000+"** — 19,246 records in `satellites.json` as of 2026-09-15. This is
  one of the hand-maintained surfaces in `CLAUDE.md`'s OBJECT COUNT
  convention: if that figure changes, this file and the cover's
  `OBJECT_COUNT_LABEL` change with it.
- **"capsules, cargo freighters"** — never describe Cygnus, Progress or cargo
  Dragon as crewed. `classify.js` keeps `CREW_VEHICLE_PATTERNS` and
  `CARGO_VEHICLE_PATTERNS` separate and `/capsules` tags each vehicle
  `kind:"crew"` or `kind:"cargo"`.
- **"the notable objects passing high overhead"** — What's Overhead is curated
  by design, not exhaustive: `MIN_OVERHEAD_ELEVATION_DEG` is 40° and
  `OVERHEAD_EXCLUDED_CATS` drops `other` and `debris`. Don't promise "every
  satellite above you".
- **"thousands of notable objects"** — `descriptions.json` curates 2,882 of
  19,246 objects. Not every object has a write-up; the rest fall back to
  `describe.js`'s generated text. (README.md and the App Store description
  still say "1,700+", written when that was the count — conservative rather
  than wrong, but worth refreshing next time either is edited.)
- **"no account, no ads, nothing collected"** — matches `privacy.html` and the
  Data Not Collected answer on the App Store privacy questionnaire: location
  is read on demand and used only on-device, saved lists never leave the
  device, and there is no analytics, advertising or account system.
- **The App Store claim is safe.** The iOS app is live:
  `apps/web/welcome.html` links the real listing
  (`apps.apple.com/us/app/orbital-traffic/id6788125984`, added in 9758ae6) and
  says "Now on the App Store" in both CTAs and the JSON-LD. Note that
  `docs/audit-status.md` still only records the 2026-08-28 submission with no
  disposition — welcome.html is the surface that actually knows, so check it
  rather than the audit doc when in doubt.
- **No superlatives.** "The most complete view of Earth orbit" and similar
  can't be substantiated — every serious tracker reads the same CelesTrak
  catalogue.

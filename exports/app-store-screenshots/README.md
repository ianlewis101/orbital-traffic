# App Store screenshots

Six upload-ready screenshots at 1320×2868 — the App Store's 6.9" display size
— built from real captures of the live app in `raw/`, by the scripts in
`tooling/`. Two presentation variants of the same six frames exist side by
side so they can be compared:

| Folder | Treatment | Built by |
|---|---|---|
| `composed/` | Full-bleed — the app screen runs to the canvas edges, no phone | `render.mjs` |
| `composed-device/` | The same frames inside a realistic iPhone mockup | `render-device.mjs` |

Both read their shot list, copy and figures from `tooling/shots.mjs`, and both
load `tooling/poster.css` for the background and type. Copy is defined once, in
one file: a headline that had to be edited in two places would quietly drift
between the variants, which is the one thing a side-by-side comparison must not
have. The only intended difference between the two outputs is the framing.

Nothing here is wired into a build. It's a kit you re-run when the listing
needs re-cutting.

---

## The strategy

In App Store search results people see the **first two or three screenshots at
about 150px wide**, and that's where the decision gets made — the product page
is a formality for someone already sold. Everything below follows from that:

- Headlines are 4–6 words at 124px, so they survive an 8× downscale.
- Each image reads as a **silhouette**. Fine HUD text is texture, not message.
- Shots 1–3 are a complete pitch on their own; 4–5 are for people who tap in.

The listing's job is to say the things a competing tracker can't copy in an
afternoon. Not "3D globe, 18,000 objects" — every tracker claims that. Instead:
the app is an *instrument* rather than a game; 1,791 objects carry hand-written
descriptions; What's Overhead is curated rather than a horizon dump; and the
sky it draws is visibly, alarmingly crowded.

## The set

| # | File | Says | Shows |
|---|---|---|---|
| 1 | `01-look-up.png` | Look up. **It's crowded.** | The live globe, terminator down the left limb, night-side city lights, full Orbit Classes legend |
| 2 | `02-overhead.png` | What's flying over your head right now? **Tap and find out.** | What's Overhead from Los Angeles — category chips, tier-ranked list |
| 3 | `03-every-dot.png` | Every dot **has a story.** | LINK's card — photo, identity, and the full curated write-up down to its failing reaction wheels |
| 4 | `04-capsules.png` | Follow the fleet, **launch to landing.** | Crew Dragon 12 mid-mission: its photo, its DOCKED phase block ("at ISS · 33 days in this phase") and recent activity |
| 5 | `05-crew.png` | Seven people **live up there.** | The ISS card: photo, live crew, expedition, today's activity |
| 6 | `06-daylight.png` | Real sunlight, **real shadow.** | The daylight companion to shot 1 — one zoom step further out, sunlit hemisphere facing the camera |

Shot 6 is captured by sweeping the camera past the terminator and keeping the
frame with the highest mean luminance, rather than by a fixed rotation: which
angle lands on full daylight depends on where the sun is at capture time, so a
hard-coded drag count would silently produce a night shot on a later re-run.

Shot 2 is the conversion shot. A globe is impressive; *your* sky is personal.

Shot 4 went through two earlier drafts. The geostationary belt — 568 objects in
one perfect ring — was tested and dropped: at the distance needed to close that
ring in a 0.46 aspect frame Earth shrinks to nothing and the belt reads as
scatter. An isolated Starlink shell replaced it and worked visually, but the
capsule card is the better story: phase tracking from launch through docking to
landing is something no other tracker does, and Crew Dragon 12's card shows it
running live.

The cost of that swap is worth knowing: shots 3, 4 and 5 are now all object
cards with a photo band, so the set carries less structural variety than when
shot 4 was a globe. Swapping any one of them back for a globe view (the
Starlink shell capture is still reproducible from git history) would restore
the rhythm if it ever reads as repetitive.

## Design

### Full-bleed (`composed/`)

No device mockup. A phone frame on a gradient would have made a dark, precise
app look like a template.

The poster background is the app's own: `--bg` `#07080f`, the `#fx-scan` corner
glows and the `#fx-vignette` radial, re-created at poster scale in
`tooling/poster.css`, with the capture feathered into it at the crop line — so
the screenshot never reads as a rectangle pasted onto a marketing board. Type
is the app's own (Bricolage Grotesque 800 for headlines, Oxanium for the
eyebrow and subline, loaded from `apps/web/public/fonts/`), the accent rule is
the `.plate::after` teal→violet hairline, and the second headline line takes
the same gradient.

The corner ticks are the `#bezel` motif. Worth knowing: the app itself retired
that element in the Aurora pass (`#bezel{display:none}`), so this is a
deliberate revival for the poster frame, not a live element.

### Device-framed (`composed-device/`)

Identical background, copy and type; the app screen sits in an iPhone instead
of bleeding to the edges. Proportions in `tooling/device.css` are derived from
real 6.9" hardware rather than eyeballed — 4% bezel, screen corner radius at
12.5% of screen width, body radius = screen radius + bezel so the curves stay
concentric, and a 125×36pt Dynamic Island 11pt below the top of the screen.
Everything scales off one `--device-w`.

Two things needed solving that only show up against this app:

- **The Dynamic Island vanished.** A black pill on a near-black UI is invisible,
  which is realistic and useless. It reads now via a hairline cutout rim and the
  front-camera lens, both of which are on the real hardware.
- **The drop shadow does almost nothing** on a `#07080f` background. Separation
  comes mostly from the rim light along the titanium band; the shadow still
  earns its place by darkening the `#fx-scan` glows behind the phone, which is
  what stops it reading as a flat sticker.

The capture is shown **whole** here, not cropped the way the full-bleed variant
crops it — a device mockup that hid part of the screen would not be showing a
phone. The cost is scale: the app lands at about 64% of its full-bleed size, so
at App Store search-result width (~150px) the device version's UI detail turns
to texture while the full-bleed version's is still legible. That trade-off is
the substance of the comparison.

## Re-cutting

```bash
npm run build
npm run preview -w @orbital-traffic/web -- --port 4173 --strictPort
node exports/app-store-screenshots/tooling/capture.mjs   # -> raw/ + raw/facts.json
node exports/app-store-screenshots/tooling/render.mjs         # -> composed/
node exports/app-store-screenshots/tooling/render-device.mjs  # -> composed-device/
```

`capture.mjs` needs `playwright` importable (install to a scratch dir and
symlink into `node_modules`). Never run `playwright install` — this
environment ships Chromium at `/opt/pw-browsers/chromium`.

**Every number in the copy is interpolated from `raw/facts.json`, which
`capture.mjs` writes in the same session that produced the pixels.** The
catalog moves daily and the overhead count moves by the minute; templating is
what stops a headline claiming a figure the screenshot beneath it contradicts.
`render.mjs` throws rather than rendering a `{{placeholder}}` it has no value
for. This is also why the object count here is *not* on CLAUDE.md's list of
hand-maintained "18,000+" surfaces — there is nothing here to maintain by hand.

Two environment gotchas, both already handled in the scripts: Chromium needs
`--use-angle=swiftshader` for WebGL here, and sheet slide-in animations run
about ten times slower under SwiftShader, so screenshots wait on
`getAnimations()` rather than a fixed timeout — a fixed wait catches the info
card mid-animation with its body unpainted.

## Provenance

Captured from a production build of the branch head against the **real
production Worker** (`/tle`, `/capsules`, `/crew`, `/today`, `/satcat`) — live
catalog, live telemetry, live SATCAT enrichment, live ISS roster. Not fixtures.
Service workers are blocked in the capture context, so nothing can come from a
stale `sw.js` cache; `facts.json` records an assertion that the brand mark in
the DOM is the current satellite (8 `<rect>`s, no `<ellipse>`) rather than the
retired orbit ring.

`raw/` also holds `04-link-share-card.png`, the share-card export at its native
1080×1350. It isn't in the final five — the set was stronger with the crew shot
— but it's the cleanest single asset for social or a press kit.

## Photo provenance

Every object photo in this set is a NASA public-domain image with a verifiable
ID, sourced from `images-api.nasa.gov`. None contains an identifiable person.

| Slot | NASA ID | Subject |
|---|---|---|
| `iss` | `iss066e081189` | ISS from Crew Dragon Endeavour's flyaround, 8 Nov 2021 |
| `dragon` | `iss073e0505071` | Crew-11 Dragon approaching the ISS, 2 Aug 2025 |
| `science_generic` pool[1] | `s82e5937` | Hubble separating from Discovery after release, STS-82, Feb 1997 |

This replaced three images the app was shipping under the credit "Source
unconfirmed — pre-existing image" (`iss`, `dragon`) and a NASA Landsat 9 press
photo of two identifiable people (`science_generic` pool[1], which is the entry
LINK's ID hashes to). The credit line the app draws over each photo now names a
real source, so the "source unconfirmed" text is absent from these screenshots
because it is no longer true — not because it was hidden.

**These are app-data changes, not screenshot-only ones**
(`apps/web/public/data/photos.json` plus three files in
`apps/web/public/photos/`), so they only reach users once merged. They are
separable from the screenshots if you would rather land them on their own.

## Known issues these screenshots had to work around

1. **14 photo entries elsewhere in the app are still unconfirmed.** `hubble`,
   `jwst`, `soyuz`, `cygnus`, all five asteroids, and index 0 of each of the
   five generic pools still carry "Source unconfirmed — pre-existing image".
   None of them appears in this screenshot set, but each is the same rights
   question, and any of them can surface in the app the moment a user taps the
   wrong object. The three above show the pattern for fixing the rest.
2. **The mobile clock reads 12-hour with no meridiem.** `clock.js` renders
   `.utc-compact` as `6:44 UTC` when it is 18:44 UTC (the share card's own
   timestamp correctly says `18:44 UTC`). It's deliberate CSS, but it sits in
   the corner of most of these frames and reads as a bug.
3. **Time Machine can't be shown at all.** `#time` is `display:none !important`
   under 768px — it's desktop-only, so it cannot appear in an iPhone
   screenshot.
4. **LINK still shows a category-generic photo**, now Hubble rather than the
   Landsat press shot. It is a real satellite on orbit and thematically apt —
   LINK's own mission is to reboost an ageing space telescope — but it is not a
   picture of LINK. A curated photo keyed to LINK's NORAD ID would be exact;
   no public image of the spacecraft on orbit appears to exist yet.

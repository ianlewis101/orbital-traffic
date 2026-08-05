# App Store screenshots

Five upload-ready screenshots at 1320×2868 — the App Store's 6.9" display size
— in `composed/`, built from real captures of the live app in `raw/`, by the
scripts in `tooling/`.

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
| 2 | `02-overhead.png` | Right now, **See what objects are overhead** | What's Overhead from Los Angeles — category chips, tier-ranked list |
| 3 | `03-every-dot.png` | Every dot **has a story.** | LINK's card — photo, identity, and the full curated write-up down to its failing reaction wheels |
| 4 | `04-capsules.png` | Follow the fleet, **launch to landing.** | Crew Dragon 12 mid-mission: its photo, its DOCKED phase block ("at ISS · 33 days in this phase") and recent activity |
| 5 | `05-crew.png` | Seven people **live up there.** | The ISS card: photo, live crew, expedition, today's activity |

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

Full bleed, no device mockup. A phone frame on a gradient would have made a
dark, precise app look like a template.

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

## Re-cutting

```bash
npm run build
npm run preview -w @orbital-traffic/web -- --port 4173 --strictPort
node exports/app-store-screenshots/tooling/capture.mjs   # -> raw/ + raw/facts.json
node exports/app-store-screenshots/tooling/render.mjs    # -> composed/
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

## Known issues these screenshots had to work around

1. **Photo provenance — visible on shots 4 and 5.** 11 of the 20 entries in
   `apps/web/public/data/photos.json` — including `iss`, `hubble`, `jwst`,
   `dragon`, `soyuz`, `cygnus` and all five asteroids — are credited "Source
   unconfirmed — pre-existing image", and the app renders that credit over the
   photo. Both card shots that show an object photo therefore carry that line,
   small, at the photo's bottom right. Unknown provenance is a rights problem
   on a public store listing regardless of the screenshots; replacing those 11
   files with properly-licensed NASA/ESA/SpaceX imagery fixes the listing and
   the app in one move, and these screenshots would only need a re-run.
2. **The mobile clock reads 12-hour with no meridiem.** `clock.js` renders
   `.utc-compact` as `6:44 UTC` when it is 18:44 UTC (the share card's own
   timestamp correctly says `18:44 UTC`). It's deliberate CSS, but it sits in
   the corner of most of these frames and reads as a bug.
3. **Time Machine can't be shown at all.** `#time` is `display:none !important`
   under 768px — it's desktop-only, so it cannot appear in an iPhone
   screenshot.
4. **LINK's photo is a category-generic Landsat 9 press image.** Correctly
   credited, and shown by request, but at a glance it reads as "this is
   Landsat" rather than as an illustration of the science category. A curated
   photo for LINK, or a procedural fallback, would both be clearer.

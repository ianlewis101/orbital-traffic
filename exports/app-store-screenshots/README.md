# App Store screenshots

Six upload-ready screenshots at 1320×2868 — the App Store's 6.9" display size
— built from real captures of the live app in `raw/`, by the scripts in
`tooling/`. Three presentation variants of the same six frames exist side by
side — two sized for the App Store, one for Instagram:

| Folder | Treatment | Built by |
|---|---|---|
| `composed/` | Full-bleed — the app screen runs to the canvas edges, no phone | `render.mjs` |
| `composed-device/` | The same frames inside a realistic iPhone mockup | `render-device.mjs` |
| `composed-instagram/` | The same frames re-laid-out for an Instagram 4:5 feed carousel, 1080×1350 | `render-instagram.mjs` |

All three read their shot list, copy and figures from `tooling/shots.mjs`, and
all three load `tooling/poster.css` for the background and type. Copy is defined once, in
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

**Both globe frames pick their camera angle by sweeping and scoring, never
from a fixed drag count.** Which rotation shows daylight — or the terminator —
depends entirely on where the sun is when the capture runs. Shot 6 keeps the
brightest frame of its sweep; shot 1 targets 55% of the way between the
sweep's darkest and brightest, which is where the terminator crosses the disc
with the night side and its city lights still in frame. This is not
theoretical: an earlier fixed six drags, run at 19:55 UTC with the sun over the
Americas, landed shot 1 on the same fully-lit hemisphere shot 6 was choosing
and made two of the six frames near-identical.

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

### Instagram 4:5 (`composed-instagram/`)

1080×1350, six frames, so it posts as one carousel. 1080 wide is Instagram's
native upload width — anything wider is resampled on their side.

The captured screen is 1:2.17 and this canvas is 1:1.25, so this is a
re-layout, not a resize: cropping the App Store frame to 4:5 would throw away
about 42% of its height, and scaling it to fit would leave it a narrow strip
between dead margins. Instead the phone stands at full height on the right
showing the **entire** screen, and the copy takes the column beside it. The
background bleeds to all four edges, so there are no bars anywhere.

That layout is what the "nothing cropped" requirement forces. On a 4:5 canvas
"full-bleed" and "nothing cropped" are mutually exclusive — the screen is
simply much taller than the frame — so this variant is device-framed, reusing
`device.css` unchanged with its geometry variables re-solved for a 1150px-tall
phone.

The column is 440px and the phone 500px wide — deliberately a smaller phone
than this variant first shipped with. At 387px the copy column capped the
headline at a size that left most of a 1350px column empty; handing 53px back
to the copy buys a much bigger type scale (76px headlines against the original
56px) and costs the phone about a tenth of its width.

**The background carries the rest.** Type alone cannot fill a column this tall
and narrow without absurd wrapping, so `render-instagram.mjs` generates a
seeded starfield and three wide orbital arcs behind the phone. Both are lifted
from what the app itself draws — `scene/starfield.js` and the orbit rings in
`scene/trail.js` — rather than invented decoration, and both sit low enough in
opacity that the phone stays the brightest thing in frame. The seed comes from
the frame's file name, so every slide gets its own sky and every re-render
reproduces it exactly.

**The column is anchored at the top** by a wordmark — furniture rather than
marketing copy, there so a single slide still says whose app it is when it gets
reshared without the rest. It sits far below the headline in contrast, so it
frames the copy instead of competing with it. A carousel counter sat at the
bottom of the column for one revision and was cut: the wordmark alone holds the
column, and the counter was the more disposable of the two.

`IG_H1=<px>` renders the whole set at one headline size, overriding the
per-shot values — for trialling type scales side by side rather than guessing:

```bash
IG_H1=68 node exports/app-store-screenshots/tooling/render-instagram.mjs
```

Two details specific to this measure:

- **Headlines are re-typeset, not rewritten.** The App Store copy carries hard
  `<br>` breaks tuned to a 1128px column; at 440px the interior ones land
  mid-phrase, so they are dropped and the text flows. The break immediately
  before the gradient `<em>` is kept — without it you get "Look up. It's /
  crowded.", splitting the gradient across two lines. The words, and which of
  them sit in the gradient, are identical to the App Store set.
- **`render-instagram.mjs` asserts the layout fits** before each screenshot:
  the copy column must not overlap the phone, and the phone must sit wholly
  inside the canvas. A silent overflow would be precisely the cropping this
  variant exists to avoid, so it throws instead.

Composition is checked against Instagram's profile grid, which centre-crops a
4:5 post to 1:1 and takes roughly 12.5% off the top and bottom — the same role
the 150px search thumbnail plays for the App Store set. All six keep their
headline inside that square-safe band.

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
node exports/app-store-screenshots/tooling/render-instagram.mjs # -> composed-instagram/
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

## Photo provenance — resolved upstream

An earlier version of this branch replaced three images the app was shipping
under the credit "Source unconfirmed — pre-existing image", so the credit line
the app draws over each photo would name a real source.

That work is now obsolete and has been dropped. Main has since replaced the
unconfirmed imagery across the board and restructured the generic pools, and
`photos.json` carries **zero** "Source unconfirmed" credits — a more complete
job than the three entries fixed here. Merging main into this branch takes
main's version of every photo file wholesale; keeping this branch's would have
reverted it.

## Known issues these screenshots had to work around

1. ~~Unconfirmed photo credits.~~ Fixed on main — see above. Nothing in
   `photos.json` carries an unconfirmed credit any more.
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

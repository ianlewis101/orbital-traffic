# Promo video pipeline

Shoots a vertical (1080×1920) promo film for TikTok / Reels / Shorts **from
the real app and the real catalog**, and encodes it to MP4.

Nothing in here is a mockup. Every globe frame is the production bundle
drawing the committed catalog, and every number on screen is read out of
`apps/web/public/data/satellites.json` at shoot time. Re-run it after a data
refresh and the object count in the film updates itself.

```bash
npm run build                                              # build the app first
npm run preview -w @orbital-traffic/web -- --port 4173 --strictPort
node tools/video/build.mjs
#  ->  exports/video/orbital-traffic-YYYY-MM-DD.mp4
```

The preview server must be up: the tool shoots the **production bundle**, not
the dev server, so the footage matches what actually ships.

---

## The format this imitates

The reference is the concept-hardware format that does well on TikTok (the
"Hawkeye" aircraft videos and their imitators). Shot-by-shot, the reference
runs 15 seconds and intercuts three kinds of material:

| t | material | content |
|---|---|---|
| 0.0–4.0 | **product** | CGI aircraft on a grey studio cyc, slow push, title fades up word by word: "next generation" → "x" → "Hawkeye" |
| 4.0–5.0 | **proof** | real peregrine falcon, then an extreme close-up of its eye |
| 5.0–5.5 | **product** | new angle, title "Freedom in **speed**" |
| 5.5–6.8 | **page** | extreme close-up of a printed novel page, the word "speed" behind a yellow highlighter |
| 6.8–7.2 | **product** | title "streamlining" |
| 7.2–8.2 | **proof** | the falcon in a dive |
| 8.2–9.9 | **page** | the page again, "streamlining" highlighted |
| 9.9–11 | **proof** | the falcon flying past buildings |
| 11–12.5 | **logo** | wordmark on black |

The engine is that **every claim is validated twice from outside the advert** —
once by nature, once by a printed page — and the page beats are what stop it
reading as an ad. They imply the idea existed before the product did.

Three details are worth copying exactly, and this pipeline copies them:

- **The page is cropped, not composed.** Words run off both edges, so you are
  reading a fragment of something longer. A page with margins visible reads as
  a caption and the spell breaks.
- **The highlighted word echoes the title card one beat earlier.** Title says
  "streamlining", then the page highlights "streamlining".
- **Type is sparse.** Never more than three or four words over a product shot.

### What is different here, deliberately

The reference's "product" is a render of an aircraft that does not exist, and
its "proof" has to come from somewhere else entirely (stock falcon footage).
Orbital Traffic collapses the two: the hero shot *is* the evidence, because it
is the live product drawing real tracked objects. So the proof beats here are
just closer, more specific shots of the same globe — the ISS with its real
orbit trail, the geostationary belt seen from far enough out that it closes
into a ring.

That is a genuine advantage over the format it borrows from, and it is the
reason not to fake anything in these videos: the honesty is the differentiator.

---

## Editing the film

**`shots.mjs` is the film.** Everything else is machinery. Change the cut, the
copy, the camera or the passages there and re-run; nothing else needs touching.

### Tuning camera moves

Shooting all 640 frames takes several minutes, which is far too slow a loop
for finding a framing. Use stills:

```bash
node tools/video/build.mjs --stills --scale 0.5          # one frame per shot, seconds
node tools/video/build.mjs --stills --only geo-ring      # just the one you are tuning
#  -> .video-work/stills/*.png
```

A still is the **midpoint** of the move. To judge where a move *ends*, shoot
the shot for real at half size and look at the last frame:

```bash
node tools/video/build.mjs --scale 0.5 --only iss --keep-frames
```

Camera geometry (`r`, `theta`, `phi`) and the distance/framing table are
documented at the top of `shots.mjs`.

### Flags

| flag | effect |
|---|---|
| `--stills` | one still per shot instead of a video — the fast tuning loop |
| `--scale 0.5` | render at half size; roughly 4× faster, good enough to judge framing |
| `--only a,b` | shoot a subset of shots by id |
| `--out path.mp4` | output path (default `exports/video/`) |
| `--audio track.m4a` | mux a music bed, auto-faded at the end |
| `--keep-frames` | leave the PNG sequence in `.video-work/` |
| `--base url` | preview server origin (default `http://localhost:4173`) |

`OT_CHROMIUM` overrides the browser binary. On macOS:
`OT_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`.

---

## How it works

**`apps/web/src/capture.js`** is a capture mode inside the app, loaded only
when `?capture=1` is in the URL — Vite emits it as its own chunk, so a real
visitor never fetches it. It hides the HUD, parks the main render loop
(`state.frozen`) and exposes `window.__otCapture.step()`, which draws exactly
one frame for an exact simulation time and camera position.

That is what makes the output smooth on a machine with no GPU. Frames are not
recorded in real time; each is requested, drawn synchronously and screenshotted
before the next is asked for. A frame that takes two seconds to render is still
the 1/30 s successor of the one before it, so software-GL footage comes out at
exactly 30 fps, and two runs of the same script are identical.

The cut is captured into **one globally numbered PNG sequence** rather than
per-shot clips that get concatenated, because concat across separately encoded
segments is where frames get dropped at cuts — and the cuts here land on beats.

Titles are composited by ffmpeg at encode time, not drawn into the app, so
retiming a line costs one re-encode (seconds) instead of a re-shoot (minutes).

Live network fetches are blocked during a shoot on purpose: the film must show
the committed catalog that `{count}` is derived from, or the first and last
shots could disagree about how many objects exist.

### Files

| file | role |
|---|---|
| `shots.mjs` | **the film** — cut, camera, copy, page passages |
| `build.mjs` | orchestrator and CLI |
| `capture-app.mjs` | drives the app, writes globe frames |
| `cards.mjs` | title overlays, book pages, logo card |
| `assemble.mjs` | ffmpeg filter graph and encode |
| `ease.mjs` | easing curves |

### Requirements

- `ffmpeg` on PATH
- `playwright-core` (a devDependency — deliberately not `playwright`, which
  downloads a browser bundle on install that every CI job would pay for)
- a Chromium/Chrome binary (see `OT_CHROMIUM`)

---

## Music

`--audio` muxes a track and fades it out at the end. **Use a track you are
licensed for.** On TikTok specifically, prefer adding sound in the TikTok
composer from their own library: audio attached in-app is licensed for the
platform and is also what feeds the sound-based recommendation graph, which a
baked-in track does not. Export silent, add sound there.

Do not bake in a commercial track and upload it — that is a copyright strike
against the account, not a takedown of the one video.

## Posting notes

- The tool writes a `-poster.png` beside the MP4 (frame ~36) for use as the
  cover, and a `.json` sidecar listing each shot's start time, which is handy
  for writing captions against the cut.
- Keep the lower ~22% of frame clear of anything that must be read: TikTok's
  caption, buttons and account row sit there. The title overlays are placed in
  the upper third for this reason.
- The film is silent and legible without sound, which matters — a large share
  of feed playback starts muted.

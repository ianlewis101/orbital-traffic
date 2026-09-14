# Instagram 4:5 background template

The background from the Instagram carousel, on its own with no content on it —
drop a plate in as the bottom layer and build a post on top.

| File | What it is |
|---|---|
| `background-01.png` … `background-06.png` | 1080×1350 background plates |
| `layout-guide.png` | Plate 01 with the copy column and phone position marked |

**Six plates rather than one** because the starfield is seeded per slide. A
carousel whose every slide carries an identical sky reads as one static
backdrop rather than six windows onto the same one. The seeds match the real
renderer's, so plate N is exactly the background behind slide N of the existing
set. Any plate works for any post — they're interchangeable.

Regenerate with:

```bash
node exports/app-store-screenshots/tooling/render-template.mjs
```

These are drawn from the same `poster.css`, `instagram.css` and `backdrop.mjs`
the real posts render from, so the template cannot drift from what the renderer
actually produces.

---

## What's on the plate

Canvas **1080 × 1350** (Instagram's native 4:5 upload size — anything wider is
resampled on their side).

- **Base** `#07080f`, the app's own `--bg`
- **Corner glows** — teal at bottom-left, violet at top-right, the app's
  `#fx-scan`
- **Orbital arcs** — three wide ellipses, mostly off-canvas so only a long
  shallow arc crosses the frame, stroked with a teal → sky → violet gradient
- **Starfield** — 190 stars, most a cold white, roughly one in ten tinted teal
  or violet
- **Vignette** — the app's `#fx-vignette`
- **Grain** — fractal noise at 3.5% on overlay blend
- **Corner ticks** — 34px, inset 30px, `rgba(255,255,255,0.18)`
- **Wordmark** — `ORBITAL TRAFFIC`, top-left

## Where content goes

| Element | Position |
|---|---|
| Copy column | `left: 56`, width `440`, vertically centred |
| Phone | `right: 44`, `top: 155`, 500 × 1040 |
| Wordmark | `left: 56`, `top: 92` |

The phone is 500 wide with a 20px bezel, 58px screen radius and 78px body
radius — a screen of 460 × 1000, which is a 1320 × 2868 capture scaled to 34.8%.

The wordmark is already on the plate — it sits in the same place on every post
and is part of what makes the set read as a set. Its spec, if you ever need to
rebuild it: Orbitron 700, 21px, letter-spacing `0.3em`, `#9aa2b8` at 55%
opacity, at `left: 56` / `top: 92`.

## Type

Fonts are in `apps/web/public/fonts/` — Bricolage Grotesque, Oxanium and
Orbitron, all open-licensed (OFL, licences alongside them).

| Element | Font | Size | Notes |
|---|---|---|---|
| Eyebrow | Oxanium 600 | 22px | `0.24em` tracking, uppercase, `#5eead4`, preceded by a 26px rule |
| Headline | Bricolage Grotesque 800 | 76px | line-height `1.02`, `-0.03em` tracking, `#eef1f8` |
| Headline accent | same | same | teal → violet gradient, clipped to the text |
| Rule | — | 2px | teal → violet → transparent hairline, 32px above |
| Subline | Oxanium 500 | 26px | line-height `1.5`, `#9aa2b8` |

Two headlines in the current set run long enough to need their own smaller
size (60px and 52px) — worth checking any new headline against the 440px
column rather than assuming 76px fits.

## Colours

| Token | Hex | Used for |
|---|---|---|
| `--bg` | `#07080f` | canvas |
| `--ink` | `#eef1f8` | headline |
| `--ink-dim` | `#9aa2b8` | subline, wordmark |
| `--ink-faint` | `#737a90` | — |
| teal | `#5eead4` | eyebrow, gradient start |
| sky | `#7dd3fc` | gradient middle |
| violet | `#a78bfa` | gradient end |

The headline accent and the hairline both run teal → violet; keeping that one
gradient consistent is most of what makes the set look like a set.

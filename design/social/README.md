# Social layout kit

One aesthetic that carries a 4–5 image carousel **and** a single-image post,
built from the app's own tokens so a post looks like it came out of the
product rather than out of a template.

```
npm run social:preview     # contact sheet in a browser, live-editable
npm run social:render      # export every post to PNG
npm run social:render -- launch    # just one post
```

Exports land in `design/social/out/<post>/01.png …`, at the exact artboard
size, in upload order. That directory is git-ignored on purpose — it is
regenerable output, not a source file. Re-run the render after any copy change.

Playwright is not a dependency of this repo (same call as
`tools/generate-icons.mjs` — it's a heavyweight browser download and this runs
by hand, not in CI). Install it the first time you export:

```
npm i -D playwright && npx playwright install chromium
```

---

## What makes it one system

Every image — carousel slide or standalone post — is the same frame:

| Element                | Behaviour                                                            |
| ---------------------- | -------------------------------------------------------------------- |
| **76px outer margin**  | identical at every size; nothing but the backdrop crosses it          |
| **Corner ticks**       | HUD reticle at the safe frame, same coordinates on every image        |
| **Top rail**           | wordmark lockup left, `01 / 05` index right (carousel only)           |
| **Bottom rail**        | `orbitaltraffic.app` left, progress dots centre, swipe hint right     |
| **Starfield**          | seeded per slide — deterministic, so a re-render is byte-stable       |
| **Orbit arc**          | continuous across the set — see below                                 |

The arc is the thing that makes a carousel feel authored. It is the app icon's
ellipse blown up past the artboard edges, and the blip advances `0 → 1` across
the slides, so swiping reads as one continuous orbit sweeping left to right
rather than five unrelated cards. A single post sits mid-arc.

Because the rails are geometrically identical, the header and footer lock in
place as the reader swipes — and a single post still reads as "one of these"
in a feed.

## Sizes

All three are 1080px wide; only the height changes, so the horizontal grid is
untouched and a post can be re-cut for another placement without redesigning.

| `size`     | Pixels      | Ratio | Use                                            |
| ---------- | ----------- | ----- | ---------------------------------------------- |
| `portrait` | 1080 × 1350 | 4:5   | default — Instagram / LinkedIn / X feed        |
| `square`   | 1080 × 1080 | 1:1   | grid-safe, denser crops                        |
| `story`    | 1080 × 1920 | 9:16  | Stories, Reels/TikTok covers                   |

`story` adds a 190px bottom keep-out for platform UI. The frame shrinks; the
grid does not move.

`kind` and `size` are independent — a carousel can be square, a single post can
be a story.

## Archetypes

Six body layouts, one frame. Mix them freely; the reference carousel runs
cover → stat → shot → legend → cta.

| `type`   | Shape                                                    | Good for                       |
| -------- | -------------------------------------------------------- | ------------------------------ |
| `cover`  | bottom-anchored kicker + huge headline + lead             | slide 1, or a whole single post |
| `stat`   | one enormous figure, label, body, up to 3 readout cells   | proof, launch numbers          |
| `shot`   | a real screenshot, cropped large, + headline and caption  | showing the product            |
| `list`   | numbered hairline-separated rows                          | "how it works", features       |
| `legend` | the app's 13 orbit classes with their real swatch colours | the signature Orbital Traffic image |
| `cta`    | mark, headline, URL pill, note                            | closing a carousel, or an announcement |

`cover` and `cta` are written to stand alone — that is what makes the single-image
case work without a second design.

## Making a post

Edit `content.js`. Nothing else needs touching.

```js
mypost: {
  title: "Overhead teaser",
  kind: "single",        // or "carousel"
  size: "portrait",
  slides: [
    {
      type: "cover",
      kicker: "The feature people open the app for",
      headline: "What's\n[overhead]\nright now?",
      lead: "One tap shows the notable objects passing high above you.",
    },
  ],
},
```

Text markup, parsed into DOM nodes (never `innerHTML`, so copy containing
`<` or `&` is safe):

- `\n` — hard line break
- `[like this]` — gradient-accented run inside a headline. One per headline;
  it is the only colour accent the type allows.
- `{{OBJECT_COUNT}}` — the catalog size

### The object count is derived, never typed

`{{OBJECT_COUNT}}` is substituted from the real length of
`apps/web/public/data/satellites.json`, rounded down to the thousand with
exactly the expression `apps/web/vite.config.js` uses. Per CLAUDE.md's
object-count convention, always use the token — a hand-typed figure here would
be one more copy to keep in sync by hand, and this one silently goes stale
every time the catalog crosses a thousand. `tools/test/social-kit.test.js`
fails the build if a literal figure appears in `content.js`.

## Rules that keep it consistent

1. **Don't re-invent tokens.** Colours, fonts and the wordmark gradient are
   copied verbatim from `apps/web/src/styles/app.css`'s `:root`; the legend's
   swatch colours are imported live from `apps/web/src/config.js`. If a brand
   colour changes in the app, change it in `social-kit.css` in the same commit.
2. **One accent per image.** Teal `#5eead4` leads; the wordmark gradient is
   reserved for the wordmark, one headline run, and the stat figure.
3. **Screenshots are cropped, never shrunk.** Fitting a whole object card into
   the body row renders it ~270px wide and unreadable at feed size, which
   defeats the point of showing a screenshot. `.a-shot` pins it near 1:1 and
   clips the overflow; `cropTop` trims a sliver of the row above the panel.
4. **Body copy stays ≥ 28px.** Below that it stops being legible as a feed
   thumbnail on a phone.
5. **The export must match the artboard.** `tools/render-social.mjs` asserts
   every PNG's pixel size against `ARTBOARD` in `content.js` and fails the run
   on a mismatch — a missing `box-sizing` reset or a stray border silently
   inflates the frame and ships every image off-aspect.

## Files

| File                      | Role                                                       |
| ------------------------- | ---------------------------------------------------------- |
| `content.js`              | post definitions + artboard sizes — the only file to edit   |
| `social-kit.css`          | the layout system: frame, rails, type scale, archetypes     |
| `build.js`                | assembles a post into DOM; backdrop and orbit geometry      |
| `index.html`              | contact sheet (preview chrome is never exported)            |
| `tools/render-social.mjs` | static server + headless export + size assertions           |

The browser is the only renderer: the exporter drives the very same contact
sheet and screenshots its `.slide` elements, so what you preview is exactly
what ships. There is no second layout path to keep in sync.

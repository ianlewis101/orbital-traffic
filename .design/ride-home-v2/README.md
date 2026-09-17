# "Everybody Has a Ride Home" — style directions

Three candidate COMPOSITIONS for rebuilding the fleet carousel. Nothing here
is the chosen one yet; `../ride-home/` still holds the built post in the
original phone-lockup style.

| | Direction | Idea |
| --- | --- | --- |
| 1 | **HUD** (`Main`, `HudStation`) | The poster *is* one of the app's plates, at poster scale |
| 2 | **Full bleed** (`Fullbleed*`) | The scene render fills the frame; type sits in the dark |
| 3 | **Telemetry** (`Telemetry*`) | The info card's label/value grid as a spec sheet |

## These are built from the app, not from an impression of it

Every token and component is lifted from `apps/web/src/styles/app.css` at its
real value — don't re-guess them:

- `--bg #07080f`, `--ink #eef1f8`, `--ink-dim #9aa2b8`, `--ink-faint #737a90`,
  `--line rgba(255,255,255,0.12)`, `--amber #5eead4` (aurora teal),
  `--violet #a78bfa`
- `.plate` — `rgba(17,22,42,0.55)`, `1px solid rgba(255,255,255,0.12)`, and its
  `::after` hairline `transparent → rgba(94,234,212,0.5) → rgba(167,139,250,0.5)
  → transparent` at `opacity: 0.5`. That hairline is the app's signature detail.
- `.cat` row — 8px swatch with `box-shadow: 0 0 7px currentColor`; the glow is
  the point. Cargo vehicles use `CATS.debris` grey `#7a8899` as "no one aboard".
- `.chip` — 1px border, uppercase `0.09em`, 5px glowing dot.
- The two `#fx-scan` radial glows (teal low-left, violet high-right).
- Fonts are the app's own self-hosted SIL OFL faces, inlined as data URIs so
  PNG export keeps the real type. See `../three-bad-days/README.md`.

## The full-bleed direction needs a clean render

A phone screenshot cannot go full bleed — it is portrait, so it sits as a
column in a 1080×1350 frame with the app's own legend and clock showing
through. Shoot the scene at poster aspect with the HUD removed instead:
viewport 1080×1350 at `deviceScaleFactor: 2`, then

```js
for (const el of document.querySelectorAll("body > *"))
  if (el.id !== "scene" && !el.classList.contains("fx")) el.style.display = "none";
```

`globe-wide.jpg` / `globe-near.jpg` are downsampled copies for the canvas;
`export.mjs` swaps the full-res PNGs back in when rendering.

## Rebuild

`node gen.mjs` then `node export.mjs`. Generated `.dc.html` files are
git-ignored.

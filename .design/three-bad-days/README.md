# "Two Bad Days" — Instagram carousel

Five 1080×1350 slides about orbital debris, published as a Claude Design
canvas: https://claude.ai/artifact/KscEFaHVgvHbsqCJuhAGKh

## What's here

- `gen.mjs` — builds the five `.dc.html` artboards and `canvas.json`.
  Copy, per-slide headline sizes and layout all live here.
- `shot-*.jpg` — the phone screens, captured from the real app (see below).
- `canvas.json` — artboard layout for the canvas.

The `.dc.html` artboards and the seeded `two-bad-days.html` are generated
and git-ignored. Rebuild with `node gen.mjs`.

## Fonts

`gen.mjs` inlines `apps/web/public/fonts/*.woff2` (the app's own Bricolage
Grotesque / Oxanium / Orbitron, SIL OFL) as `data:` URIs. Google Fonts
would work in the canvas but does **not** embed in PNG/PDF export, so
exported slides would fall back to a system face. Keep them inlined.

## Where the numbers came from

Every figure is measured from `apps/web/public/data/satellites.json`
(15 Sep 2026 refresh, 19,246 objects), not estimated:

| Claim | Source |
| --- | --- |
| 2,694 debris objects | `cat === "debris"` |
| 1,970 from Fengyun-1C | names matching `FENGYUN 1C DEB` |
| 691 from the 2009 collision | `COSMOS 2251 DEB` (582) + `IRIDIUM 33 DEB` (109) |
| 99% from two days | (1,970 + 691) / 2,694 = 98.8% |
| 370–1,956 km spread | semi-major-axis altitude from each TLE's mean motion |
| 39 fragments dip to station altitude | perigee ≤ 426 km (ISS at capture time) |

Iridium 33 and Cosmos 2251 are **one** collision (10 Feb 2009), which is
why this is "two days, three debris clouds" and not three events.

## Re-shooting the screens

Built and driven per `.claude/skills/verify`: `npm run build`, then
`npm run preview -w @orbital-traffic/web -- --port 4173 --strictPort`,
then Playwright against `/opt/pw-browsers/chromium` with the Worker and
CelesTrak routes aborted. Categories are toggled through `#cats .cat`
rows. Note the ISS card renders "Crew data temporarily unavailable" when
the Worker is unreachable — don't shoot that card in a sandboxed session.

## Exporting the slides

The canvas's own PNG export drops the file-entry screenshots (the phone
renders empty), so the shippable 1080×1350 PNGs are rendered directly:
`node export.mjs` shoots each artboard under `export/` at 2x and
downsamples to exactly 1080×1350, supersampling type and screens. Those
artboards point at the ORIGINAL full-res captures rather than the 440px
JPEGs the canvas carries, so the exports are sharper than the canvas
preview. Finished slides are committed under `export/`.

## Editing

Once the canvas has been edited in the browser, the published artifact is
the source of truth — pull it back with the design skill's
`seed-canvas.mjs --extract` rather than re-running `gen.mjs` over it.

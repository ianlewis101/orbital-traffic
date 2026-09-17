# "Everybody Has a Ride Home" — Instagram carousel

Five 1080×1350 slides about the crewed/cargo fleet docked at both space
stations, captured 17 Sep 2026.

Same pipeline as `../three-bad-days` (see that README for fonts, export and
the design system): `node gen.mjs` builds the artboards, `node export.mjs`
renders the shippable PNGs into `export/`.

## Capturing these screens needs the Worker stubbed

Crew rosters, docked-capsule lists and phase durations all come from the
Cloudflare Worker, which is unreachable from a sandboxed session — the ISS
card renders "Crew data temporarily unavailable" instead. Rather than shoot
that, the capture script fulfils the Worker routes from the repo's own
committed data, so every value on screen is real:

| Route | Fixture |
| --- | --- |
| `/crew` | built from `iss-today.json`'s `crew` array, wrapped as `{people, number, ok}` — the shape `buildCrew()` returns |
| `/capsules` | `capsule-status.json` verbatim (already the right shape) |
| `/today` | `iss-today.json` verbatim |
| `/tle` | aborted, so the app keeps its bundled catalog |

## The numbers on these slides

Measured from `capsule-status.json` and `iss-today.json` at capture time:

- **10 people** — 7 aboard the ISS, 3 aboard Tiangong (`iss-today.json` crew)
- **ISS, 4 docked** — Crew Dragon 12, Cygnus NG-24, Progress-MS 34, Soyuz-MS 29
- **Tiangong, 2 docked** — Shenzhou-23, Tianzhou-10
- **Crew Dragon 12** — docked since 2026-08-29, 19 days at capture
- **Progress-MS 33** — landed 2026-09-08

Seat counts (Dragon 4, Soyuz 3, Shenzhou 3) are standard public figures, NOT
from app data — they're what makes 7 + 3 = 10 seats for 10 people. Re-check
them if the crew complement changes.

This post ages fast: every vehicle above will have been replaced within
months. Re-shoot rather than reuse.

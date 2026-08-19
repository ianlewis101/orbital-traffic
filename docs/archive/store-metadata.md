# App Store Connect submission metadata

**This file is the source text for App Store Connect submissions.** Keep it in
sync with what is actually entered in App Store Connect — and note that the
object count ("19,000+") appears here twice and is one of the hand-maintained
surfaces listed in CLAUDE.md's OBJECT COUNT convention.

Last reviewed: 2026-08-11 (pre-submission audit).

---

## URL fields — these two are easy to swap, don't

App Store Connect has **two separate URL fields**. They are not
interchangeable, and Guideline 5.1.1(i) requires the privacy field to point at
an actual privacy policy:

| App Store Connect field | URL |
|---|---|
| **Privacy Policy URL** | `https://orbitaltraffic.app/privacy.html` |
| **Support URL** | `https://orbitaltraffic.app/support.html` |

Both pages are live and cross-link to each other. `privacy.html` supports a
**Data Not Collected** answer on the App Privacy questionnaire: location is
read on demand and used only on-device, saved lists never leave the device,
and there is no analytics, advertising or account system.

---

## APP NAME

Orbital Traffic

## SUBTITLE (30 char max — this is exactly 30)

Live Satellite & Space Tracker

## PROMOTIONAL TEXT (170 char max — 114)

See what's above you right now. 19,000+ satellites, stations and spacecraft, tracked live on a real-time 3D globe.

## KEYWORDS (100 char max — 87)

```
satellite,tracker,ISS,space station,orbit,live,spacecraft,astronomy,stargazing,3D globe
```

No spaces after the commas — App Store Connect counts them and then discards
them. **Do not add third-party trademarks** (NASA, SpaceX, Starlink): Apple
strips or rejects metadata that uses another company's brand as a keyword, and
this app is not affiliated with any of them. Don't repeat the app name or
subtitle words either — those are already indexed.

## DESCRIPTION

Track every satellite, station and spacecraft orbiting Earth — in real time.

Orbital Traffic shows the live positions of more than 19,000 tracked objects: the International Space Station, active missions, communications satellites, navigation constellations, debris, and near-Earth asteroids — all rendered on a real-time 3D globe powered by live orbital data.

WHAT'S OVERHEAD
Tap once to see the notable objects passing high above you right now — no guessing, no simulation, just real orbital mechanics computed on your device.

THOUSANDS OF OBJECTS, EXPLAINED
Search the catalog for hand-written profiles on 1,700+ notable objects — who built it, why it's up there — plus live telemetry on everything: altitude, speed, orbit shape and current ground position.

FOLLOW THE FLEET
Watch crewed capsules and cargo freighters — Dragon, Soyuz, Progress and Cygnus — from launch through docking to landing, and see who's living aboard the International Space Station right now.

ASTEROIDS UP CLOSE
Dozens of near-Earth asteroids plotted on their real heliocentric orbits, with close-approach dates and sizes.

SAVE WHAT MATTERS
Star your favorite objects or add them to a watchlist to check in on later.

SHARE THE SKY
Found something interesting in orbit? Generate a shareable card and show everyone what's flying overhead.

Real data. Real spacecraft. Right now.

---

## SCREENSHOTS (6.9" iPhone — 1290×2796)

Generated, not hand-assembled: `tools/store-screenshots/` drives the real app,
captures six screens, and composes the frames into
`design/store-screenshots/`. Upload those six PNGs in numbered order;
`contact-sheet.jpg` is for reviewing the set, not for upload. See that tool's
README for the two commands and for why every figure in the copy is derived
from the bundled data rather than typed in.

Order is deliberate. The App Store shows the first three in search results
without anyone tapping through, so those three carry the whole pitch: what it
is, why it's about you, how deep it goes. The back half is for people already
swiping.

| # | Eyebrow | Headline | Proof line |
|---|---|---|---|
| 01 | Live 3D globe | Look up. **It's crowded.** | Real orbital data · refreshed continuously |
| 02 | What's overhead | What's over your **head right now?** | Your location never leaves your phone |
| 03 | Tap any object | Every dot **has a story.** | 2,200+ hand-written profiles |
| 04 | Live from the station | Someone is **up there.** | Live roster · ISS and Tiangong |
| 05 | Capsule watch | Follow every **capsule home.** | Docking status checked every hour |
| 06 | Near-Earth asteroids | The ones that **come close.** | No account · no ads · nothing tracked but satellites |

The bold half of each headline is set in that frame's accent colour, taken
from the app's own category palette for whatever the frame shows.

Two things worth a second look before any submission:

- **Frame 04 shows the real ISS crew**, including surnames and (if the profile
  is expanded — it is not, in the shipped frame) a NASA portrait. That is live
  Launch Library 2 data the app genuinely displays. Names in a product
  screenshot are ordinary; if a portrait is ever wanted in a frame, weigh
  whether a recognisable astronaut's face in *marketing* could read as an
  endorsement, which NASA's media guidelines don't allow.
- **Frame 02 is captured during a real ISS pass** — the observer is placed on
  the ISS ground track so the whole station complex is overhead at once. Real
  app state, chosen moment.

---

## Accuracy notes — why the copy is worded the way it is

These are deliberate. Re-check them before loosening any claim (Guideline
2.3.1 — accurate metadata):

- **"crewed capsules and cargo freighters"** — Cygnus, Progress and cargo
  Dragon are *uncrewed*. `classify.js` splits `CREW_VEHICLE_PATTERNS` from
  `CARGO_VEHICLE_PATTERNS` and `/capsules` tags each vehicle `kind:"crew"` or
  `kind:"cargo"`. Never describe Cygnus or Progress as crewed.
- **"1,700+ notable objects"** — `descriptions.json` curates 2,190 of 18,997
  objects as of 2026-08-17 (it was 1,791 when this copy was written, so the
  claim is now conservative rather than wrong — safe to leave, and safe to
  raise to "2,100+" if the listing is being edited anyway). Do not claim
  *every* object is explained: uncurated `other`-category objects get a
  deliberate "not curated" veil over the detail panel, which a reviewer can
  see.
- **"the notable objects passing high above you"** — What's Overhead is
  curated by design, not exhaustive: `MIN_OVERHEAD_ELEVATION_DEG` is 40° and
  `OVERHEAD_EXCLUDED_CATS` drops `other` and `debris`. Avoid "exactly which
  satellites are above you".
- **"Generate a shareable card"** — accurate. Do not promise a native share
  sheet: inside the iOS webview the flow is a full-screen preview with
  press-and-hold-to-save, not `UIActivityViewController`.
- **No superlatives** — "the most complete view of Earth orbit" and similar
  can't be substantiated; every serious tracker uses the same CelesTrak
  catalog.

## Data accuracy note (for App Review notes, if asked)

Orbital positions are derived from Two-Line Element sets typically updated
every 20–60 minutes from CelesTrak, propagated on-device with SGP4. Positions
are estimates based on the most recent available element sets. Orbital Traffic
is intended for educational and informational use and should not be used for
operational space-safety decisions.

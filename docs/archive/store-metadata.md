# App Store Connect submission metadata

**This file is the source text for App Store Connect submissions.** Keep it in
sync with what is actually entered in App Store Connect — and note that the
object count ("18,000+") appears here twice and is one of the hand-maintained
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

See what's above you right now. 18,000+ satellites, stations and spacecraft, tracked live on a real-time 3D globe.

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

Orbital Traffic shows the live positions of more than 18,000 tracked objects: the International Space Station, active missions, communications satellites, navigation constellations, debris, and near-Earth asteroids — all rendered on a real-time 3D globe powered by live orbital data.

WHAT'S OVERHEAD
Tap once to see the notable objects passing high above you right now — no guessing, no simulation, just real orbital mechanics computed on your device.

THOUSANDS OF OBJECTS, EXPLAINED
Search the catalog for hand-written profiles on 1,700+ notable objects — who built it, why it's up there — plus live telemetry on everything: altitude, speed, orbit shape and current ground position.

FOLLOW THE FLEET
Watch crewed capsules and cargo freighters — Dragon, Soyuz, Progress and Cygnus — from launch through docking to landing, and see who's living aboard the International Space Station right now.

ASTEROIDS UP CLOSE
Dozens of near-Earth asteroids plotted on their real heliocentric orbits, with close-approach dates and sizes.

TIME MACHINE
Scrub forward and backward through orbital history and watch the whole catalog move.

SAVE WHAT MATTERS
Star your favorite objects or add them to a watchlist to check in on later.

SHARE THE SKY
Found something interesting in orbit? Generate a shareable card and show everyone what's flying overhead.

Real data. Real spacecraft. Right now.

---

## Accuracy notes — why the copy is worded the way it is

These are deliberate. Re-check them before loosening any claim (Guideline
2.3.1 — accurate metadata):

- **"crewed capsules and cargo freighters"** — Cygnus, Progress and cargo
  Dragon are *uncrewed*. `classify.js` splits `CREW_VEHICLE_PATTERNS` from
  `CARGO_VEHICLE_PATTERNS` and `/capsules` tags each vehicle `kind:"crew"` or
  `kind:"cargo"`. Never describe Cygnus or Progress as crewed.
- **"1,700+ notable objects"** — `descriptions.json` currently curates 1,791
  of 18,981 objects. Do not claim *every* object is explained: uncurated
  `other`-category objects get a deliberate "not curated" veil over the detail
  panel, which a reviewer can see.
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

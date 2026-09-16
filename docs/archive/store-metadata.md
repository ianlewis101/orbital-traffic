# App Store Connect submission metadata

**This file is the source text for App Store Connect submissions.** Keep it in
sync with what is actually entered in App Store Connect — and note that the
object count ("19,000+") appears here twice and is one of the hand-maintained
surfaces listed in CLAUDE.md's OBJECT COUNT convention.

Last reviewed: 2026-09-16 (added the WHAT'S NEW section for 2.0.1; listing
fields themselves unchanged since the 2026-08-11 pre-submission audit).

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

## WHAT'S NEW IN THIS VERSION

**4,000 char max.** Unlike DESCRIPTION and PROMOTIONAL TEXT, this field is
**not indexed by App Store search** — so there is nothing to gain from working
a brand name into it, and the generic phrasing below is the safer choice under
the same trademark caution that governs KEYWORDS above.

Keep a dated section per released version. When cutting a build, write the
notes against the **last build that actually reached the public App Store**,
not the last build uploaded — builds that stop at App Store Connect never
showed their notes to anyone, so their changes still need covering.

### 2.0.1 — covers builds 21–34 (everything merged after build 20)

Build 20 / 2.0.0 was cut from `b0e0ac5` (PR #195, 2026-08-28) and is the live
App Store version. Everything below merged after that commit: PRs #196–#250.

```
Deep-space search, launch-train tracking, and a much more reliable catalog.

NEW — LAUNCH TRAINS
A freshly launched batch of internet satellites flies as a single string for its first days in orbit — the "train" people photograph from the ground. Today in Space now spots them and lights up the whole batch at once: a link line through the string, live spacing in both miles and seconds, altitude, and a tappable list of every satellite in it.

NEW — WHERE'S VOYAGER?
Searching for Voyager 1 or 2, Pioneer 10 or 11, New Horizons, the James Webb Space Telescope, Parker Solar Probe or the Tesla Roadster now gives you a real answer — current distance, one-way light time, and a plain explanation of why they can't appear on the globe — instead of "No matches found".

NEW — POPULAR OBJECTS ROTATES
The highlights panel now cycles through a much larger pool of curated objects instead of showing the same five every time.

BETTER EXPLANATIONS
• Nearly 1,000 satellites filed under "Other" have been researched and re-filed as science, communications or classified — so their write-ups actually surface.
• Every satellite without a hand-written profile now gets a real explanation of what it does and what its orbit is for, instead of one generic line.
• Hundreds of new hand-written profiles — now 2,800+ objects — plus new spacecraft photography.

FIXES
• Smoother pinch-to-zoom, and low-orbit satellites visibly move again when you zoom in close.
• Fixed the geostationary ring clipping in portrait, the object card overlapping the side panels on narrow phones, and quick legend taps triggering iOS double-tap zoom.
• Dragging or zooming the globe now releases "Center on Globe" tracking.
• Today in Space is tidier: redesigned icons, a scrollable list, and no more debris in launch events.
• Confirmation messages no longer look like errors.

UNDER THE HOOD
Whole categories of satellites could occasionally go missing at startup. Several separate causes are fixed, the catalog is now cached globally for a faster first load anywhere in the world, and sync problems now say what went wrong instead of failing silently. Near-Earth asteroid distances were also corrected — they were being computed from the wrong side of the Sun.
```

Short variant, if the full set reads as too much:

```
• Launch trains — tap a newly launched batch in Today in Space and see the whole string lit at once, with live spacing and altitude.
• Ask where Voyager is — Voyager, Pioneer, New Horizons, Webb, Parker Solar Probe and the Tesla Roadster now answer with their current distance and light time instead of "No matches found".
• Nearly 1,000 satellites researched out of "Other" and re-filed, and every uncurated satellite now gets a real explanation instead of one generic line.
• Popular Objects now rotates through a much larger pool.
• Smoother pinch-zoom, several mobile layout fixes, and a much more reliable catalog load.
```

**Accuracy notes for this entry:**

- **"Nearly 1,000"** — 959 researched category verdicts applied in PR #247
  (860 direct + 99 resolved). Don't round up to "over 1,000".
- **"2,800+ objects"** — `descriptions.json` curates 2,882 of 19,244 as of
  2026-09-16. Conservative on purpose, same reasoning as the "1,700+" note
  below. (That DESCRIPTION figure is now well behind reality and can be
  raised to "2,800+" whenever the listing is being edited anyway.)
- **No brand name on the launch-train bullet** — the feature's own UI does say
  "Starlink train", and naming it here would be accurate descriptive use, but
  this field isn't search-indexed so it buys nothing against the KEYWORDS
  trademark caution above. Ian's call if he prefers the named version.
- **"the James Webb Space Telescope"** — correctly listed among objects that
  *can't* appear on the globe: it's at L2 on a station-kept halo orbit, not in
  Earth orbit, and its figure renders as nominal (`~`) rather than live.
- **Today in Space itself is not new** — it shipped 2026-08-20, inside build
  20. Only the refinements above are new in 2.0.1.

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
  *every* object is explained: uncurated `other`-category objects fall back
  to `describe.js`'s generic name-pattern/`classify()` text rather than a
  per-object write-up. The frosted "Catalogued. Not curated." veil that used
  to make this visible in the detail panel was removed 2026-08-20 — the
  underlying gap (not every object has a curated description) is unchanged,
  just no longer surfaced in the UI, so this copy still needs to stay
  conservative on its own merits.
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

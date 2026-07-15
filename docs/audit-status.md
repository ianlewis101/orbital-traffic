# Orbital Traffic — Audit Status Tracker

**Source of truth:** this file, committed in the repo at `docs/audit-status.md`.
A copy is also kept as a project file here in Claude for quick reference —
if the two ever disagree, the repo copy wins.

**How this works:** Claude updates this file's content as work happens and
mentions it briefly — no need to ask permission each time. Actually syncing
a new version into the repo (or re-uploading here) still needs a deliberate
step, since Claude has no write access to GitHub.

**Last synced:** 2026-07-15

**Status values:** Not started · In progress · Fixed, not deployed · Fixed
and live · Won't fix · N/A (audit itself was corrected, no code issue)

---

## Design & Polish (16 items — see audit §2)

| # | Item | Status | PR / Branch | Notes |
|---|---|---|---|---|
| 1 | Visible data-freshness indicator | Not started | — | |
| 2 | Remove fabricated crew data | Not started | — | Same underlying issue as Finding F2 |
| 3 | Single source of truth for object count | Not started | — | |
| 4 | Accessibility floor (focus, buttons, motion, type size) | Not started | — | |
| 5 | km/mi units toggle | Not started | — | |
| 6 | Rename mismatched color tokens | Not started | — | |
| 7 | Type/spacing scale | Not started | — | |
| 8 | Loading/empty/error state system | Not started | — | |
| 9 | Starlink/Kuiper duplicate color | Fixed, not deployed | PR #92 (`claude/oneweb-kuiper-categories-g6g4uz`), open, not merged | Fixed alongside F10, 2026-07-15 — kuiper's color changed from 0x8fd6ff (duplicate of starlink) to 0xa3e635; oneweb also gets its own distinct color (0x3d8bfd) as part of the same change |
| 10 | Motion system consistency | Not started | — | |
| 11 | CSS grid instead of hand-measured positions | Not started | — | |
| 12 | Decide mobile Time Machine / close-button parity | Not started | — | Blocked on Open Question: was this intentional? |
| 13 | Self-host fonts | Not started | — | Also closes part of the Google Fonts privacy gap (see F16) |
| 14 | Standardize icons | Not started | — | |
| 15 | Tablet breakpoint | Not started | — | |
| 16 | Rework "Catalogued. Not curated." veil | Not started | — | |

## Architecture (8 items — see audit §3)

| # | Item | Status | PR / Branch | Notes |
|---|---|---|---|---|
| — | Worker classification claim | **N/A — audit corrected, not a code fix** | — | Audit doc itself was wrong (2026-07-13 correction); the code was already right. Nothing to fix. |
| 1 | Event/store layer for UI modules | Not started | — | |
| 2 | Central escape helper for innerHTML sinks | Not started | — | Same root cause as Finding F12 |
| 3 | Move scheduled data to Worker Cron + KV | Not started | — | |
| 4 | Automatic Worker deploy workflow | Not started | — | High-value — would have prevented the PR #52/#53 manual-deploy incident |
| 5 | Staging environment | Not started | — | |
| 6 | Centralize scattered config/counts | Not started | — | |
| 7 | TypeScript/checkJs on catalog + worker | Not started | — | |
| 8 | Data-integrity safety nets (schema validation, ingest tests) | Not started | — | |

## Bugs — Critical / High (F1–F7)

| # | Finding | Status | PR / Branch | Notes |
|---|---|---|---|---|
| F1 | Crew HTTP → innerHTML XSS | Not started | — | Live, exploitable, hit by every visitor who taps ISS |
| F2 | Fabricated expedition data | Not started | — | |
| F3 | Crew fetch no stale-selection guard | Not started | — | |
| F4 | SGP4 wasted on hidden objects | Not started | — | |
| F5 | Boot ingest blocks main thread | Not started | — | |
| F6 | Time-machine × selection perf cliff | Not started | — | |
| F7 | Pass-alerts toggle can get stuck | Not started | — | |

## Bugs — Medium (F8–F18)

| # | Finding | Status | PR / Branch | Notes |
|---|---|---|---|---|
| F8 | Fallback merge-priority inversion | Not started | — | |
| F9 | OneWeb labeled Starlink | Fixed, not deployed | PR #92 (`claude/oneweb-kuiper-categories-g6g4uz`), open, not merged | Fixed 2026-07-15. groups.js now tags GROUP=oneweb records "oneweb" (was "starlink"); classify.js's new correctStarlinkCat() rescues by name any record still tagged "starlink" (stale bundled satellites.json, or any fetch that predates this fix), so the fix doesn't wait on a data refresh. info.js's inferOwner() now resolves OneWeb to GBR/"OneWeb (Eutelsat)" instead of "United States" — the task spec's literal regex (`/ STARLINK \| ONEWEB /`, space-padded) turned out to silently match zero real objects against hyphenated real names ("ONEWEB-0012"), the same bug class as F36, so it's matched via normalizeVehicleName()+\b instead. Verified against real catalog data: 651/651 OneWeb-named objects → oneweb category, correct ownership. Merging auto-deploys the web app (GitHub Pages); client-side ingest() re-running categorize() on every load means the fix is effective even against currently-stale bundled/cached data. The Worker's own /tle API output won't reflect it until a manual `wrangler deploy` (packages/catalog is bundled into the Worker even though worker/src/index.js itself isn't touched) — not required for app correctness, but needed for the Worker's raw API output and the CLAUDE.md verification curl command to match. |
| F10 | Kuiper category unreachable | Fixed, not deployed | PR #92 (`claude/oneweb-kuiper-categories-g6g4uz`), open, not merged | Fixed 2026-07-15 — classify.js gets a KUIPER_NAME_RE rescue in correctOtherCat(), same mechanism already used for other constellations with no dedicated CelesTrak group. Verified: 393/393 real Kuiper-named objects → kuiper category. Same merge/deploy notes as F9. |
| F11b | Decayed objects never pruned | Not started | — | |
| F11c | Capsule-status wipes history on corrupt file | Not started | — | |
| F11 | GSAT attributed to ESA | Not started | — | |
| F12 | Systemic unescaped-innerHTML (9 sinks) | Not started | — | F1 is the flagship instance of this same class |
| F13 | 12:00 UTC workflow collision | Not started | — | |
| F14 | Per-user direct SATCAT fetch | Not started | — | |
| F15 | Worker logs unrounded coordinates | Not started | — | |
| F16 | Privacy policy / iOS permission-string inaccuracies | **Fixed, not deployed** | PR #72 (`fix/privacy-policy-location-accuracy`), open, not merged | Fixed 2026-07-13. Needs: (1) merge PR, (2) cut new internal TestFlight build — merging alone does not update what testers have installed |
| F17 | `/passes` unauthenticated abuse risk | Not started | — | |
| F18 | Mobile rendering hotspots | Not started | — | |

## Bugs — Low (F19–F37)

| # | Finding | Status | PR / Branch | Notes |
|---|---|---|---|---|
| F19 | Every data commit triggers full Pages deploy | Not started | — | |
| F20 | Freshness signal writes to hidden elements | Not started | — | Same fix as Design item 1 |
| F21 | Desktop search keyboard inert | Not started | — | |
| F22 | enrichSatcat never retries after failure | Not started | — | |
| F23 | Dead "Today aboard" per-module config | Not started | — | |
| F24 | Double-caching understates real staleness | Not started | — | |
| F25 | Edge TTLs tighter than source cadence | Not started | — | |
| F26 | NEO catalog frozen, no refresh path | Not started | — | |
| F27 | Worker `/tle` cache stampede | Not started | — | |
| F28 | Service worker rough edges | Not started | — | |
| F29 | `fetchLive` no in-flight guard | Not started | — | Must ship alongside any periodic-refresh work (§4.1 of audit) |
| F30 | GPU/asset misc | Not started | — | |
| F31 | Stale hotlist facts stated as "now" | Not started | — | |
| F32 | Time-machine position tearing | Not started | — | |
| F33 | passAlerts non-atomic cancel+reschedule | Not started | — | |
| F34 | Project-doc drift (CLAUDE.md/ARCHITECTURE.md) | **Partially addressed** | — | The specific Worker-classification contradiction was resolved 2026-07-13 (audit corrected). The /passes-endpoint-missing-from-CLAUDE.md part of this finding is still open. |
| F35 | Capsule phase can flap | Not started | — | |
| F36 | Hyphen-bounded name regexes mislabel 61% of catalog | Not started | — | |
| F37 | predictPasses window-edge inaccuracies | Not started | — | |

## Open Questions (decisions, not fixes — see audit §10)

| Question | Status |
|---|---|
| Monetization shape | Undecided |
| Design direction (Aurora vs. Apple-minimal) | Undecided |
| Units (metric default?) | Undecided |
| Mobile Time Machine — intentional or oversight? | Undecided |
| iOS App Store status | **Answered: internal TestFlight testing, as of 2026-07-13** |
| Comfort level with adding accounts | Undecided |
| "COOL SHIT" category label | Undecided |
| Hotlist — hand-curated vs. derived | Undecided |

---

## Change log
*(newest first — brief, one line per sync)*

- 2026-07-15 — F9 and F10 fixed (OneWeb/Kuiper categories), both "Fixed, not deployed" pending PR review/merge; Design item 9 (Starlink/Kuiper duplicate color) fixed alongside F10 as the same root-cause change. Verified against real catalog data: 651/651 OneWeb and 393/393 Kuiper objects resolve correctly.
- 2026-07-13 — Initial tracker created. Seeded F16 as "Fixed, not deployed" (PR #72), the Worker-classification Architecture item as N/A (audit corrected), F34 as partially addressed, and the iOS App Store open question as answered (internal testing).

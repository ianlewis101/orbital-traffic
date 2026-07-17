# Orbital Traffic — Audit Status Tracker

**Source of truth:** this file, committed in the repo at `docs/audit-status.md`.
A copy is also kept as a project file here in Claude for quick reference —
if the two ever disagree, the repo copy wins.

**How this works:** Claude updates this file's content as work happens and
mentions it briefly — no need to ask permission each time. Actually syncing
a new version into the repo (or re-uploading here) still needs a deliberate
step, since Claude has no write access to GitHub.

**Last synced:** 2026-07-16

**Status values:** Not started · In progress · Fixed, not deployed · Fixed
and live · Won't fix · N/A (audit itself was corrected, no code issue)

---

## 📦 iOS build batch tracker

**Rule:** trigger a new internal TestFlight build (via the `iOS Build &
Upload` GitHub Actions workflow, `workflow_dispatch`, no Xcode needed) once
3–5 merged-but-undeployed fixes have piled up. Ian is currently the only
tester, so there's no urgency to ship a build for any single fix alone.

**Known extra step after every build:** a freshly uploaded build shows
"Missing Compliance" in App Store Connect → TestFlight → iOS Builds and
won't reach testers until you click "Manage" next to it and answer the
export-compliance question (No, for standard HTTPS — no custom encryption
in this app). This isn't a failure, just a one-time click needed per
build. Until it's answered, testers keep seeing the previous build with
no error — which is exactly what caused the "it didn't make it" confusion
on 2026-07-13.

**Merged, not yet in an iOS build (count: 3/3–5 — all three already live on orbitaltraffic.app; holding off on cutting a TestFlight build for now, per Ian):**

| # | Item | PR | Merged date |
|---|---|---|---|
| F4 | SGP4 wasted on hidden objects | #79 | 2026-07-13 |
| F5 | Boot ingest blocks main thread | #80 | 2026-07-13 |
| F6 | Time-machine × selection perf cliff | #81 | 2026-07-13 |

**Last build cut:** 2026-07-13 — via the "iOS Build & Upload" GitHub Actions
workflow, after PR #78 fixed the recurring build-number collision
(`CURRENT_PROJECT_VERSION` was hardcoded to 1; now auto-increments via
`github.run_number`). This build carried F16, F7, F3, F1, and F2.
Confirmed installed and running via TestFlight.

**Last build cut:** none yet since tracking started (2026-07-13) — build
number and date to be filled in once the first batch ships.

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
| 9 | Starlink/Kuiper duplicate color | **Fixed, not deployed** | PR #92 (`claude/oneweb-kuiper-categories-g6g4uz`), open | Fixed alongside F10, 2026-07-15 — kuiper's color changed from 0x8fd6ff (duplicate of starlink) to 0xa3e635; oneweb also gets its own distinct color (0x3d8bfd) as part of the same change |
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
| F1 | Crew HTTP → innerHTML XSS | **Fixed and live** | PR #76, merged; Worker deployed 2026-07-13; in TestFlight build | Live, exploitable, hit by every visitor who taps ISS |
| F2 | Fabricated expedition data | **Fixed and live** | PR #77, merged; in TestFlight build | |
| F3 | Crew fetch no stale-selection guard | **Fixed and live** | PR #75, merged; in TestFlight build | |
| F4 | SGP4 wasted on hidden objects | **Fixed and live on web** (not yet in an iOS build) | PR #79 (`fix/skip-hidden-category-propagation`), merged | Client-side only — auto-deployed to orbitaltraffic.app on merge, no Worker involved |
| F5 | Boot ingest blocks main thread | **Fixed and live on web** (not yet in an iOS build) | PR #80 (`fix/chunk-boot-ingest`), merged | Client-side only — auto-deployed to orbitaltraffic.app on merge, no Worker involved |
| F6 | Time-machine × selection perf cliff | **Fixed and live on web** (not yet in an iOS build) | PR #81 (`fix/time-machine-perf-cliff`), merged | Client-side only — auto-deployed to orbitaltraffic.app on merge, no Worker involved |
| F7 | Pass-alerts toggle can get stuck | **Fixed and live** | PR #74, merged; in TestFlight build | |

## Bugs — Medium (F8–F18)

| # | Finding | Status | PR / Branch | Notes |
|---|---|---|---|---|
| F8 | Fallback merge-priority inversion | **Fixed, not deployed** | PR #82 (`fix/fallback-merge-priority`), open | Web-app only, no Worker change — will auto-deploy to orbitaltraffic.app on merge |
| F9 | OneWeb labeled Starlink | **Fixed and live** | PR #92, merged; Worker deployed 2026-07-16 | Fixed 2026-07-15. groups.js now tags GROUP=oneweb records "oneweb" (was "starlink"); classify.js's new correctStarlinkCat() rescues by name any record still tagged "starlink" (stale bundled satellites.json, or any fetch that predates this fix), so the fix doesn't wait on a data refresh. info.js's inferOwner() now resolves OneWeb to GBR/"OneWeb (Eutelsat)" instead of "United States" — the task spec's literal regex (`/ STARLINK \| ONEWEB /`, space-padded) turned out to silently match zero real objects against hyphenated real names ("ONEWEB-0012"), the same bug class as F36, so it's matched via normalizeVehicleName()+\b instead. Verified against real catalog data: 651/651 OneWeb-named objects → oneweb category, correct ownership. Merging auto-deploys the web app (GitHub Pages); client-side ingest() re-running categorize() on every load means the fix is effective even against currently-stale bundled/cached data. **Worker deploy confirmed 2026-07-16** via the new deploy-worker skill: live Worker bundle's group-mapping table now reads `["oneweb", "oneweb"]` (was `["oneweb", "starlink"]`), and `correctStarlinkCat()`/`ONEWEB_NAME_RE` are present in the deployed source — checked directly via the Cloudflare MCP connector's worker-code read, not just an endpoint curl. |
| F10 | Kuiper category unreachable | **Fixed and live** | PR #92, merged; Worker deployed 2026-07-16 | Fixed 2026-07-15 — classify.js gets a KUIPER_NAME_RE rescue in correctOtherCat(), same mechanism already used for other constellations with no dedicated CelesTrak group. Verified: 393/393 real Kuiper-named objects → kuiper category. **Worker deploy confirmed 2026-07-16**: live bundle now has `KUIPER_NAME_RE = /KUIPER/` wired into `correctOtherCat()`, returning `"kuiper"` — previously "kuiper" appeared only once in the entire live bundle (the bare category enum) with nothing ever assigning it, exactly matching this finding's original "unreachable" description. |
| — | ISS Unity/Zvezda/Destiny missing from station allowlist | **Fixed and live** | PR #94, merged; Worker deployed 2026-07-16 | Not one of the original 37 findings — discovered 2026-07-16 during PR #93's (capsules-category-split) real-catalog verification, flagged there but not fixed since STATION_CORE_IDS was out of scope for that PR. STATION_CORE_IDS was missing all three real NORAD IDs (25575 Unity, 26400 Zvezda, 26700 Destiny), so all three resolved to cat:"other" (hidden by default). Adding the IDs alone didn't fix it against real data: correctStationCat() only consults STATION_CORE_IDS when a record already arrives tagged "stations", but these three arrive tagged "other" in the real CelesTrak feed today. correctOtherCat() needed a matching STATION_CORE_IDS promotion check too (mirroring its existing isStationVehicle() promotion). Verified against real catalog data: all three go from cat:"other" to cat:"stations". Also surfaced, unrelated and left untouched: one existing STATION_CORE_IDS entry (37224) doesn't match any ISS module in the current bundled catalog (collides harmlessly with an unrelated classified satellite's NORAD ID); three others (27386, 28654, 37820) have no matching record in the current bundled catalog at all — worth a follow-up look at STATION_CORE_IDS's remaining completeness/accuracy whenever convenient. **Worker deploy confirmed 2026-07-16**: live `STATION_CORE_IDS` set now includes 25575/26400/26700, and `correctOtherCat()`'s matching promotion check is present in the deployed source. Also confirmed the capsules-category-split (PR #93, merged, no dedicated finding row) deployed in the same push: live `CATEGORY_IDS` now includes `"capsules"`, and both `correctStationCat()` and `correctOtherCat()` promote `isStationVehicle()` matches to `"capsules"` rather than the old `"stations"`. |
| F11b | Decayed objects never pruned | **Fixed and live** | Pre-existing (predates this conversation's work) | Verified 2026-07-13: ingest.js's epoch-guard prune (10-day threshold) correctly protects against the "partial fallback" risk the audit flagged — confirmed via dedicated tests in ingest-prune.test.js. No further work needed. |
| F11c | Capsule-status wipes history on corrupt file | Not started | — | |
| F11 | GSAT attributed to ESA | **Fixed, not deployed** | PR #89 (`fix/gsat-owner-attribution`), open | Correct and matches the finding, but verified against real current catalog data to have no visible effect today — real GSAT satellites already get curated "ISRO" descriptions that take priority, and real Galileo satellites' names don't match either the old or new pattern due to the F36 tokenization issue. Defensive fix for future/uncurated data, not a visible behavior change right now. |
| F12 | Systemic unescaped-innerHTML (9 sinks) | **Fixed, not deployed** | PR #83 (`fix/escape-remaining-innerhtml-sinks`) + PR #84 (`feat/lint-unescaped-innerhtml`, includes an additional real gap found via the new lint rule: `s.ownerName` in info.js's chips row) | Web-app only — auto-deploys to orbitaltraffic.app on merge. Also added a permanent custom ESLint rule (with a same-scope const-resolver) preventing future unescaped innerHTML/attribute interpolations, not just a one-time fix. |
| F13 | 12:00 UTC workflow collision | **Fixed, not deployed** | PR #98 (`claude/workflow-schedule-collision-u642b9`), open | Collision was actually daily, not occasional, once update-capsule-status.yml went hourly: both it and update-iss-today.yml checkout main, commit different files, and `git push` with no retry, so every day at 12:00 UTC one push could lose the race and fail silently. Fix: both workflows now `git pull --rebase origin main` before `git push`, retrying up to 5 times, so a losing push rebases onto whatever the other job committed instead of failing outright — general, evergreen fix independent of scheduling. Also retimed update-iss-today.yml to "7 12 * * *" so the two schedules never technically coincide in the first place. No deploy step applies — GitHub Actions workflow files take effect on merge to main, no Worker/Pages deploy involved. |
| F14 | Per-user direct SATCAT fetch | Not started | — | |
| F15 | Worker logs unrounded coordinates | Not started | — | |
| F16 | Privacy policy / iOS permission-string inaccuracies | **Fixed and live** | PR #72, merged; in TestFlight build | Fixed 2026-07-13, confirmed live in TestFlight the same day |
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
| F29 | `fetchLive` no in-flight guard | Not started | — | Must ship alongside any periodic-refresh work (§4.1 of audit). **Note added 2026-07-13:** F5's async-ingest fix (PR #80) slightly widens the window where two overlapping live syncs could interleave, since ingest() no longer runs as one uninterrupted block. Not a live risk today since nothing triggers periodic syncs yet — but this makes F29 more important to actually do once periodic refresh is built, not just nice-to-have. |
| F30 | GPU/asset misc | Not started | — | |
| F31 | Stale hotlist facts stated as "now" | Not started | — | |
| F32 | Time-machine position tearing | Not started | — | |
| F33 | passAlerts non-atomic cancel+reschedule | Not started | — | |
| F34 | Project-doc drift (CLAUDE.md/ARCHITECTURE.md) | **Partially addressed** | — | The specific Worker-classification contradiction was resolved 2026-07-13 (audit corrected). The /passes-endpoint-missing-from-CLAUDE.md part of this finding is still open. |
| F35 | Capsule phase can flap | Not started | — | |
| F36 | Hyphen-bounded name regexes mislabel 61% of catalog | **Fixed and live** | PR #90, merged; Worker deployed 2026-07-16 | Full empirical breakdown verified 2026-07-15 against all 18,697 real catalog objects: STARLINK\|ONEWEB 11,439→0 fixed to 11,439 matched; capsule pattern and station pattern also fixed; GALILEO 32→0 fixed to 32 matched (previously zero Galileo satellites got ESA attribution at all); BEIDOU/FENGYUN/etc gap (1,925 of 2,146) fully closed, traced to 1,911 objects sharing the literal name "FENGYUN 1C DEB" (debris from China's 2007 ASAT test), not a bug. Telescope pattern and GPS/NAVSTAR pattern deliberately left untouched — confirmed the two "LEMUR-2-HUBBLE" Spire cubesats still correctly do NOT match "telescope" after the fix (a naive fix would have caused a new false-positive). Reused the already-proven normalizeVehicleName() helper (now exported from packages/catalog) rather than inventing new normalization logic. **Worker deploy confirmed 2026-07-16**: `normalizeVehicleName()` and the fixed capsule/station/OneWeb patterns are present in the deployed source (DEBRIS_NAME_RE/ISS_HARDWARE_RE remain intentionally untouched — outside this finding's scope). |
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
| Hotlist — hand-curated vs. derived | Undecided. (2026-07-16: JWST removed from `hotlist.json` — it's not an ID mismatch, JWST's Sun-Earth L2 orbit has no TLE/GP data in CelesTrak under any query, so it can never resolve to a trackable object in this pipeline regardless of hand-curation.) |
| Crew data reliability — Open Notify (`astros.json`) confirmed down in production 2026-07-16; should a committed-JSON fallback (same pattern as `/today`/`/capsules`, refreshed by a scheduled workflow) be built so crew names survive future outages? | Raised 2026-07-16. Not built yet — no live data was available this session to seed or validate the pipeline end-to-end. This session's fix only stops the Worker from caching a failed fetch for the full hour and gives an honest "temporarily unavailable" message instead of implying zero crew. |
| Pass alerts feature — keep, remove entirely, or replace with a link to NASA's Spot the Station | **Raised 2026-07-13. Real reason:** Ian doesn't want Orbital Traffic's identity to become centered on/associated with pass alerts — not primarily a NASA-redundancy or maintenance-burden argument, though those are true supporting points. Worth remembering if a middle-ground option is chosen later (e.g. a link out): it should stay deliberately low-key in the UI, not a featured element, since a prominent toggle with its own permission dialog and push notifications naturally risks becoming the app's headline association almost by accident. Removing (or replacing with a link out) would also eliminate six audit findings by deletion (F7, F15, F17, F33, F37, and the location half of F16) and drop the location permission from the app entirely — but that's a side benefit, not the actual motivation. Full removal-scope mapped: apps/web/src/ui/alerts.js, apps/web/src/native/passAlerts.js, packages/catalog/src/passes.js + its tests, the Worker's /passes endpoint + its tests, the toggle markup in index.html, two lines in main.js, the Location section of privacy.html, and the NSLocationWhenInUseUsageDescription key in Info.plist. Undecided — no urgency, revisit whenever ready. |

---

## Change log
*(newest first — brief, one line per sync)*

- 2026-07-16 — Six Ian-reported bugs fixed in one pass (branch `claude/app-issues-iss-neos-ui-eafvyv`), two with root causes different from what was assumed:
  - **Crew names not displaying**: verified against the *live* Worker (not just this session's sandbox) that Open Notify's `astros.json` is genuinely unreachable right now — both `buildCrew()` and `fetchAndRenderCrew()` were silently collapsing that failure into the same shape as "really 0 crew," and the Worker cached the failure for the full 1-hour CREW_TTL. Fixed to surface an honest "temporarily unavailable" state and skip caching failed fetches (`cached()` now takes a `shouldCache` predicate). Does **not** restore real names until Open Notify itself recovers — nothing can fabricate real astronaut data. A committed-JSON fallback (same pattern as `/today`/`/capsules`) is a real follow-up, not attempted this session since there was no live data available to seed or validate it against.
  - **JWST hotlist entry**: confirmed via CelesTrak's own satcat (`"ORBIT_CENTER":"EL2"`) that NORAD ID 50463 is correct for JWST, but CelesTrak publishes zero TLE/GP data for it under any query (standard or supplemental) because JWST's L2 orbit can't be modeled by SGP4 — no ID fixes this. Per Ian's decision, removed JWST from `hotlist.json` rather than building permanently-disabled UI for an object that can never resolve to a trackable record.
  - NEO search: `search.js` only ever filtered `state.sats`; NEOs live in `neoSats` (scene/neos.js) and were never included. Fixed by concatenating `neoSats` into the searched collection — selection already worked via scene picking, so no other changes needed.
  - Orbit Classes legend: header click only ever expanded, never collapsed, once auto-collapsed on object selection. Made bidirectional (same pattern as the existing Today-card toggle); auto-collapse-on-select behavior unchanged.
  - Privacy footer link: `#meta{pointer-events:none}` cascaded to the anchor since nothing re-enabled it and the generic `.hud>*` rule lost the specificity fight against the `#meta` ID selector. Added `#attr a{pointer-events:auto}`.
  - Globe Style card: moved from the bottom-left stack to sit directly under the top-right clock card, and made visibly more compact (tighter padding/font-size) per Ian's request.
  - Also renamed "Popular Objects Today" to "Popular Objects" (Ian's request, no bug).
- 2026-07-16 — Cloudflare Worker deployed (via the new `.claude/skills/deploy-worker` skill, run by Ian locally after this sandboxed session's `wrangler deploy` was blocked by missing credentials + network policy). Confirmed via the Cloudflare MCP connector's live worker-code read (not just an endpoint curl) that all five pending items are now live: F9 (OneWeb→oneweb), F10 (Kuiper→kuiper), F36 (tokenization fix), the capsules-category-split (PR #93), and the ISS Unity/Zvezda/Destiny station-allowlist fix (PR #94). Live `modified_on` timestamp jumped from 2026-07-13 to 2026-07-16T17:47:00Z, matching the deploy.
- 2026-07-16 — New (non-audit) finding fixed: ISS Unity/Zvezda/Destiny were missing from STATION_CORE_IDS, discovered during PR #93's verification. Fixing it required more than adding the three IDs — correctOtherCat() needed its own STATION_CORE_IDS promotion check, since these modules arrive tagged "other" in the real feed rather than "stations". Verified against real catalog data.
- 2026-07-15 — Resynced from Ian's working copy, which had drifted from the repo since 2026-07-13 (F1–F8, F11, F11b, F12, F16, F36, the iOS build-batch tracker, and the pass-alerts open question had never been committed back). Combined with this session's own F9/F10 fix: both now "Fixed, not deployed" (PR #92), along with Design item 9 (Starlink/Kuiper duplicate color, same root-cause change as F10). Verified against real catalog data: 651/651 OneWeb and 393/393 Kuiper objects resolve correctly. Note: the working copy's F9/F10/Design-9 rows still said "Not started" at the time it was captured — updated here to reflect this PR instead of taken verbatim, since that's what the rest of its own content (and Ian's own description of it) clearly intended.
- 2026-07-15 — CLAUDE.md updated (PR #91, merged) with new shared-utility conventions (esc(), normalizeVehicleName()), the missing /passes endpoint, corrected iOS build description, and two new Known Bugs entries.
- 2026-07-13 — F12 fully closed via PR #83 + #84, including a genuine additional gap (info.js's ownerName chips row) that the new custom ESLint rule surfaced on its own. That rule is now a permanent safety net, not just a one-time fix — includes a same-scope const-resolver so it checks inside previously-blanket-exempted multi-line templates too.
- 2026-07-13 — F8 merged (PR #82) — fallback data path now uses the same priority-preserving merge as the Worker.
- 2026-07-13 — F11b verified as already fixed (pre-existing, predates this conversation) — traced the epoch-guard prune mechanism and its dedicated test coverage, confirmed it fully addresses the finding.
- 2026-07-13 — F4, F5, F6 all merged (F4 fixed the GitHub-connector PR-opening snag along the way). Holding off on a new TestFlight build for now, per Ian — queue sitting at 3/3-5 until he's ready.
- 2026-07-13 — F16, F7, F3, F1, F2 all confirmed fixed and live via TestFlight build (after PR #78 fixed a build-number auto-increment bug that was blocking the upload). Build queue cleared.
- 2026-07-13 — Initial tracker created. Seeded F16 as "Fixed, not deployed" (PR #72), the Worker-classification Architecture item as N/A (audit corrected), F34 as partially addressed, and the iOS App Store open question as answered (internal testing).

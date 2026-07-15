You are the Lead Developer, UI/UX Designer, Product Manager,
Mobile Developer, DevOps Engineer, Full-Stack Developer, and
Software Architect for Orbital Traffic. Ian is the CEO. Your
role covers every technical and design decision.

── AUDIT & FIX TRACKING ──────────────────────────────────────

A full codebase audit (design, architecture, security, and 37
numbered bug findings) exists at docs/audit-status.md, which
tracks the live status of every finding (not started / fixed /
deployed / won't fix) plus a build-batch queue for when merged
fixes actually reach TestFlight. Check this before assuming
something is broken or already fixed — several findings citing
"Low" severity turned out to have much larger real-world impact
than described once verified against actual catalog data (e.g.
Finding F36 affected 61% of the tracked catalog), so don't assume
the severity label alone tells you the true impact.

── BEFORE STARTING ANY TASK ──────────────────────────────────

Always read the transcript before beginning work in a new
session. The transcript is stored at:
/mnt/transcripts/2026-07-01-20-58-13-orbital-traffic-pwa-build.txt

Read it incrementally — do not try to load it all at once.
This is critical because the project has months of decisions,
architectural choices, and hard-won bug fixes baked into it.
Acting without reading the transcript risks reintroducing
bugs we have already fixed, undoing intentional decisions,
or duplicating work.

Note: that transcript predates the July 1, 2026 monorepo
rebuild (PR #35, commit b7967b3). It's still valuable for
historical decisions and bug-fix rationale, but do not trust
any file paths or architecture details in it — cross-check
those against this document instead.

── CRITICAL RULES — NEVER VIOLATE ────────────────────────────

1. WORKER DEPLOY: Any PR that touches worker/src/index.js
   must be followed by a manual wrangler deploy IMMEDIATELY
   after merging. The GitHub repo and the live Cloudflare
   Worker are completely independent — nothing auto-deploys
   the Worker. (GitHub Actions only auto-deploys the web app,
   via deploy-pages.yml → GitHub Pages. There is no equivalent
   workflow for the Worker.) They only sync when you explicitly
   run `npx wrangler deploy` from the worker/ directory.
   Forgetting this is the single most common source of
   production bugs on this project. Also run `npm install` at
   the repo root first — see DEPLOY COMMANDS below; skipping it
   fails the build (worker/src/index.js imports from the
   @orbital-traffic/catalog workspace package).

2. CLASSIFICATION IS SHARED — ONE PIPELINE AT EVERY ENTRY
   POINT: All satellite classification logic (category
   assignment, name-pattern matching, station allowlist,
   crew/cargo-vehicle promotion, debris detection) lives in ONE
   place: packages/catalog/src/classify.js, exported as
   categorize(). parseTle() (packages/catalog/src/tle.js) runs
   it on every record it parses, so the Worker's /tle output,
   the bundled-data pipeline, and the capsule-status tool all
   emit fully classified records. On top of that,
   apps/web/src/data/ingest.js's ingest() re-runs categorize()
   on EVERY ingest — bundled boot data and live Worker data
   alike — so clients never depend on a stale Worker deploy or
   stale bundled JSON to pick up a classification fix.

   (Correction, 2026-07-09: this doc previously claimed the
   Worker "does NOT run categorize()" and that fine-grained
   categories never appear in /tle responses. That was stale —
   parseTle() applies the full pipeline, so expect
   "communications"/"classified"/"debris" etc. in raw Worker
   JSON.)

   CREW/CARGO VEHICLE PROMOTION: categorize()'s other-rescue
   promotes any isStationVehicle() name that arrives via the
   generic catch-alls ("active", "last-30-days") back to
   "stations" — the mirror of correctStationCat()'s demotion.
   Without it, a free-flying or just-launched vehicle classifies
   as "other", which the app hides by default. isStationVehicle()
   is isDockedCrewVehicle() (CREW_VEHICLE_PATTERNS table — also
   the source of capsuleFamily()) OR isCargoVehicle()
   (CARGO_VEHICLE_PATTERNS table — also the source of
   cargoFamily()); vehicleFamily() resolves across both. Every
   pattern is matched against a normalized name (hyphens/
   underscores collapsed to spaces) so catalog hyphenation
   variants can't break matching. The two tables must stay
   separate, never merged — CREW_VEHICLE_PATTERNS' dragon entry
   and CARGO_VEHICLE_PATTERNS' dragon-cargo entry deliberately
   anchor on mutually exclusive name forms (see the Known Bugs
   entry below). New crewed vehicles get added to
   CREW_VEHICLE_PATTERNS; new cargo vehicles get added to
   CARGO_VEHICLE_PATTERNS. Nowhere else.

   VEHICLE PHASE IS SEPARATE FROM CATEGORY: a crewed capsule
   (any CREW_VEHICLE_PATTERNS family — Dragon/Soyuz/Starliner/
   Shenzhou, plus Mengzhou/Gaganyaan/Orion pre-added) or cargo
   vehicle (any CARGO_VEHICLE_PATTERNS family — Progress/Cygnus/
   Tianzhou/cargo Dragon) keeps cat:"stations" for its entire
   tracked lifetime — launch through landing — regardless of
   whether it's actually docked. Its live docked/free-flying/
   landed phase is tracked separately in
   packages/catalog/src/capsules.js and served via the Worker's
   /capsules endpoint (see below); this is additional per-vehicle
   status, not a category. Each tracked entry also carries a
   "kind" field ("crew" | "cargo"). Never make categorize() itself
   phase-aware — that would break the single-source-of-truth
   boundary this rule establishes.

   Do not add classification logic anywhere else (e.g. inline
   in ingest.js or duplicated in the Worker) — categorize() in
   packages/catalog/src/classify.js is the single source of
   truth for every consumer.

3. NO EMBEDDED DATA ISLAND TO PATCH: This project no longer
   ships a single giant HTML file with an embedded TLE data
   blob, so there is no bracket-depth-scanner patching concern
   anymore. TLE data lives in separate files/live fetches
   (apps/web/public/data/, worker /tle endpoint, and the
   refresh-tle-data.yml GitHub Actions workflow). If you ever
   see a task that references scripts/update_tles.py or
   patch_html(), that script no longer exists — check with Ian
   before assuming it needs to be recreated.

4. NO IIFE CONSTRAINT ON NEO CODE: NEO/asteroid handling is
   its own ES module, apps/web/src/scene/neos.js, imported
   normally by apps/web/src/main.js. There is no IIFE-placement
   rule to worry about in the current architecture — that
   constraint applied only to the old single-file index.html.

5. NEO DATA/DESCRIPTION SYNC: apps/web/public/data/neos.json
   (orbital elements — what actually gets plotted) and
   apps/web/public/data/neo-descriptions.json (write-ups — what
   the info card shows) are two separately-maintained files that
   must stay in sync. On 2026-07-08, 22 objects — including
   Apophis, Bennu, Ryugu, Itokawa, and Didymos — had detailed
   descriptions written for them but no matching orbital-elements
   entry, so they silently never appeared anywhere in the app.
   apps/web/test/neo-consistency.test.js checks this
   automatically now (every description must have a matching
   plotted entry) — do not remove or weaken that test. If you add
   a new NEO description, add its orbital data to neos.json in
   the same change, fetched from JPL's Small-Body Database
   (ssd-api.jpl.nasa.gov/sbdb.api), never estimated or guessed.

6. STATION ALLOWLIST: The "stations" category is earned two
   ways, both in packages/catalog/src/classify.js. Permanent
   structural modules must be in STATION_CORE_IDS (an ID
   allowlist — ISS/CSS modules only; nothing transient ever
   goes in this set). Crewed capsules and cargo vehicles earn
   "stations" separately, by name, via isStationVehicle() —
   for as long as they're actively tracked; see VEHICLE PHASE
   IS SEPARATE FROM CATEGORY above for what happens on landing
   (hidden entirely, never "other"). Never trust CelesTrak's
   raw GROUP=stations feed directly — it also includes
   co-orbiting cubesats and decaying hardware that are
   genuinely not station traffic. correctStationCat() enforces
   this and demotes anything not on STATION_CORE_IDS or matched
   by isStationVehicle() to "other".

   (Policy change, 2026-07-10, PR #71: cargo vehicles were
   previously excluded from "stations" and fell to "other"
   permanently. Ian decided cargo vehicles should be treated
   identically to crewed capsules — both are "Famous Objects"
   users specifically search for, and both should read
   "stations" while flying and disappear completely, not
   demote to "other", once landed/de-orbited. If you find
   older docs, commits, or test names describing cargo vehicles
   as excluded from "stations", they predate this change.)

7. SHARED UTILITIES — USE THESE, DON'T REINVENT THEM:
   - apps/web/src/util/html.js's esc() is the standard way to
     safely insert any untrusted or semi-trusted text into
     innerHTML or an HTML attribute anywhere in the app. Added
     2026-07-15 after Findings F1/F12 (a crew-data XSS hole and
     eight more unescaped-innerHTML sinks). A custom ESLint rule
     (eslint-rules/no-unescaped-innerhtml.js) enforces this in CI —
     it fails the build on any new .innerHTML interpolation that
     doesn't go through esc() or one of a small allow-listed set of
     provably-safe formatters. If you hit this lint error, wrap the
     interpolation in esc(), don't disable the rule.
   - packages/catalog/src/classify.js's normalizeVehicleName()
     (now exported) is the standard way to match satellite names
     tolerantly of hyphens, underscores, and parentheses — real
     catalog names are inconsistently punctuated ("SOYUZ-MS 28",
     "CSS (TIANHE)", "GSAT0101 (GALILEO-PFM)"). Added 2026-07-15
     after Finding F36, which found several name-matching regexes
     across describe.js and info.js were silently matching zero
     real objects because they used space-padding instead of this
     helper. Any new name-pattern matching code should normalize
     with this + use \b-bounded regexes, not space-padding.

     EXCEPTION — do not "fix" describe.js's telescope pattern
     (HUBBLE|HST|KEPLER|etc.) to use normalizeVehicleName(). Two
     Spire Global cubesats are named "LEMUR-2-HUBBLE-4" and
     "LEMUR-2-HUBBLE-5" — a commemorative naming scheme, not the
     actual Hubble telescope. Making this pattern hyphen-aware
     causes it to incorrectly match these two objects as
     "telescope". The real Hubble telescope is already safely
     matched earlier in the same function via its hardcoded NORAD
     ID (id === "20580"), so this pattern's current space-bounded
     behavior is deliberately left broken-but-harmless. Confirmed
     via direct testing against the real catalog, 2026-07-15.

── BRANCH AND PR DISCIPLINE ──────────────────────────────────

- Never commit directly to main
- Always create a feature branch, make changes there, open
  a PR, and leave it open for Ian's review
- Do not merge PRs — Ian merges them
- Branch naming: fix/description, feat/description
- If Ian says "leave for review" or "don't commit," honor that
  literally over any default instinct to auto-commit — but
  flag clearly that uncommitted work in an ephemeral cloud
  session will be lost if the container is reclaimed, and
  offer to commit-and-push-without-a-PR as a safer middle
  ground if asked.

── ARCHITECTURE CONTEXT ──────────────────────────────────────

Monorepo (npm workspaces), rebuilt from scratch July 1, 2026
(PR #35, commit b7967b3 — "rebuild everything except the UI as
a tested, modular monorepo v2.0.0"):

- apps/web/ — the web app itself, built with Vite
  - src/main.js — boot sequence and render loop
  - src/scene/ — Three.js scene, picking, clouds (point-cloud
    rendering per category), earth, NEOs
  - src/data/ — ingest.js (classification entry point),
    live.js (Worker fetch), store.js
  - src/ui/ — info card, legend, search, time machine, etc.
  - public/ — manifest.json, sw.js, icons, data/*.json
  - Deployed via .github/workflows/deploy-pages.yml, which
    runs `npm run build` and publishes apps/web/dist to GitHub
    Pages automatically on every push to main. No manual step
    needed for the web app.

- packages/catalog/ — shared classification/data-fetch logic
  (packages/catalog/src/classify.js, groups.js, tle.js),
  imported by both apps/web and worker as
  @orbital-traffic/catalog. This is the single source of truth
  for categorize().

- worker/ — Cloudflare Worker (worker/src/index.js), proxies
  and edge-caches FIVE endpoints: /tle, /crew, /today,
  /capsules, /passes. Deploy is manual (see Critical Rule #1).
  Cache TTLs: /tle 20 min, /crew 1 hour, /today 5 min,
  /capsules 10 min. /passes has no fixed TTL — it's cached
  per unique (satellite, rounded lat/lng) combination.

  (Correction, 2026-07-15: this doc previously listed only
  four endpoints, omitting /passes. That was stale — /passes
  predicts ISS visibility windows for the iOS pass-alerts
  feature. Note: as of 2026-07-15 the future of the pass-alerts
  feature itself is an open product question — see Open
  Questions in docs/audit-status.md — do not assume this
  endpoint is permanent.)

- GitHub Actions also handles daily TLE refresh
  (refresh-tle-data.yml), ISS Today data updates
  (update-iss-today.yml), and crew/cargo vehicle phase tracking
  hourly (update-capsule-status.yml). The tracker reads
  CelesTrak's stations + last-30-days groups, CATNR-re-verifies
  any previously-tracked vehicle missing from both before
  letting it land, treats elsets older than STALE_TLE_DAYS (7)
  as absent, and aborts untouched if the stations feed lacks
  the ISS. Each active entry in capsule-status.json carries its
  l1/l2 so the web app can plot vehicles the group feeds miss,
  plus a "kind" field ("crew"/"cargo"); landed entries carry no
  elset. On every live sync the web app prunes objects absent
  from the feed whose epoch is >10 days old, injects active
  vehicles from /capsules, and immediately removes landed ones
  — cargo vehicles included as of 2026-07-10 (Critical Rule #6).

- PWA: manifest.json, sw.js, icons under apps/web/public/.
  iOS app is a Capacitor wrapper (apps/web/ios/), built and
  uploaded to App Store Connect via the "iOS Build & Upload"
  GitHub Actions workflow (.github/workflows/ios-build.yml,
  manually triggered via workflow_dispatch with an "upload"
  toggle) — no local Xcode/Mac needed to cut a build. Currently
  in internal TestFlight testing (confirmed 2026-07-15, one
  internal tester). Every fresh upload lands in "Missing
  Compliance" status in App Store Connect until someone
  manually answers the export-compliance question (Manage →
  No, standard HTTPS only) — this blocks testers from seeing
  the new build silently, with no error, until answered. Build
  numbers auto-increment via github.run_number in the workflow
  (fixed 2026-07-15 after a hardcoded CURRENT_PROJECT_VERSION
  caused every upload to collide with the last one) — do not
  hardcode a build number anywhere in this pipeline again.

  (Correction, 2026-07-15: this doc previously said submission
  was "via PWABuilder iOS package" with status TBD. That was
  stale/inaccurate — there is no PWABuilder step in this
  project's actual iOS pipeline.)

- 13 object categories (packages/catalog/src/classify.js's
  CATEGORY_IDS, mirrored in apps/web/src/config.js's CATS):
  stations, navigation, geostationary, starlink, oneweb, kuiper,
  communications, science, other, classified, debris,
  hazardous, cool — each with its own color/size defined in
  config.js.

  (Correction, 2026-07-15: this doc previously said "12 object
  categories" and that "kuiper" had no group fetch and no
  name-pattern rescue, so Kuiper satellites would misclassify
  as "other" or "starlink". Both fixed together (audit F9/F10):
  OneWeb is now its own category — groups.js tags GROUP=oneweb
  records "oneweb" directly, with correctStarlinkCat() in
  classify.js rescuing by name any record still tagged
  "starlink" from data fetched/bundled before this fix — and
  Kuiper gets a KUIPER_NAME_RE rescue in correctOtherCat(), the
  same mechanism already used for other constellations with no
  dedicated CelesTrak group.)

── KNOWN BUGS THAT MUST NOT BE REINTRODUCED ─────────────────

- Globe flipY: THREE texture flipY must be false — currently
  set correctly in apps/web/src/scene/earth.js (day/night
  texture setup)
- Cloudflare cache drift: after deploying the Worker, purge
  Cloudflare cache or wait up to 20 minutes (TLE_TTL) for edge
  nodes to refresh
- SZ-\d+ MODULE pattern: matches jettisoned Shenzhou modules —
  must classify as debris, not stations (see ISS_HARDWARE_RE
  in packages/catalog/src/classify.js)
- POISK (36086): must be in STATION_CORE_IDS — it is ISS
  MRM-2, a permanent module (confirmed still present)
- correctStationCat runs BEFORE the debris check and the
  "other" name-pattern rescue inside categorize()'s pipeline,
  and ingest() (which calls categorize()) always runs before
  buildClouds() — order matters, don't reorder without
  understanding why each step is sequenced that way
- Starliner must stay in classify.js's CREW_VEHICLE_PATTERNS
  (the shared table behind isDockedCrewVehicle() and
  capsuleFamily()) — without it, a docked or in-transit
  Starliner falls out of the station allowlist to "other"
  instead of "stations"
- The dragon pattern must never match bare DRAGON (cargo
  "DRAGON CRS-nn" is uncrewed) and GRACE must keep its
  (?! FO) guard — bare GRACE would swallow the GRACE-FO
  science pair. Never add a bare SZ-\d+ crew pattern either:
  jettisoned "SZ-nn MODULE" hardware must keep falling to
  debris
- CARGO_VEHICLE_PATTERNS' dragon-cargo entry ("DRAGON CRS") and
  CREW_VEHICLE_PATTERNS' dragon entry must stay mutually
  exclusive and never be merged into one table — a cargo Dragon
  resolving to the crew "dragon" family (or vice versa) would
  break the kind:"crew"/"cargo" field's guarantee in
  capsules.js. New cargo Dragon name formats get a new pattern
  in CARGO_VEHICLE_PATTERNS, never a change to
  CREW_VEHICLE_PATTERNS' dragon entry
- Cargo vehicles (Progress, Cygnus, Tianzhou, cargo Dragon)
  must never be added to STATION_CORE_IDS — that allowlist is
  for permanent structural modules only. They earn "stations"
  transiently through isStationVehicle()'s name check
  (CARGO_VEHICLE_PATTERNS), same mechanism as crewed capsules,
  not through the ID allowlist
- Landed entries in capsule-status.json must never carry
  l1/l2 — clients plot whatever elset they're given, so a
  stale one renders a ghost capsule (advanceCapsuleLog strips
  them on landing)
- Live-sync pruning must keep its epoch guard (absent from
  feed AND epoch >10 days) — pruning on absence alone would
  wipe healthy categories whenever one CelesTrak group fetch
  fails mid-sync
- GSAT (India/ISRO's satellite series) must resolve to India, not
  ESA, in info.js's inferOwner() — GSAT was previously bundled into
  the same pattern as Galileo (ESA's satellites). Fixed 2026-07-15
  (Finding F11); GSAT now lives in the existing India/ISRO pattern
  alongside INSAT/CARTOSAT/RESOURCESAT/IRNSS, never back in the
  ESA/GALILEO pattern.
- iOS build numbers must never be hardcoded in project.pbxproj's
  CURRENT_PROJECT_VERSION for CI purposes — it stays at its local-
  dev default of 1 there. The real, always-incrementing build
  number comes from a CURRENT_PROJECT_VERSION override injected at
  build time in ios-build.yml's archive step, using
  github.run_number. Removing that override reintroduces the
  "bundle version must be higher than the previously uploaded
  version" upload failure fixed 2026-07-15.
- OneWeb records can still arrive tagged "starlink" — from
  apps/web/public/data/satellites.json until its next scheduled
  refresh, or any other fetch that predates the groups.js fix.
  classify.js's correctStarlinkCat() rescues these by name before
  the debris/other rescues run (audit F9, fixed 2026-07-15). Don't
  remove it as "redundant" with the groups.js tag fix — it's the
  only thing that makes already-bundled data correct without
  waiting for a data refresh. Same reasoning as Kuiper's
  KUIPER_NAME_RE rescue in correctOtherCat() (audit F10, same
  date): both exist because relying on the upstream group tag
  alone leaves a stale-data gap.

── DEPLOY COMMANDS (reference) ───────────────────────────────

Worker deploy (run after ANY worker/src/index.js PR merges —
this step is never automatic):
  git pull origin main
  npm install
  cd worker
  npx wrangler deploy

  IMPORTANT: `npm install` must run at the REPO ROOT before
  `wrangler deploy`, not just `git pull` inside worker/. The
  Worker imports from the @orbital-traffic/catalog workspace
  package (worker/src/index.js's top import), which only
  resolves once npm has created the workspace symlink at
  node_modules/@orbital-traffic/catalog — running `npm install`
  from inside worker/ alone does not set this up; it has to be
  the monorepo root. Skipping this step fails wrangler's build
  with "Could not resolve @orbital-traffic/catalog" — confirmed
  this is what happens when the step is skipped, since the
  original commands above were missing it and that's exactly
  the error Ian hit trying to deploy PR #52.

Verify the Worker is returning data correctly:
  curl https://orbital-traffic.ianlewis101.workers.dev/tle
  Check for fully classified "cat" tags — parseTle() runs the
  complete categorize() pipeline, so "cat":"communications",
  "cat":"classified", "cat":"debris" etc. all appear in this
  raw response, and every crewed capsule or cargo vehicle
  (Progress/Cygnus/Tianzhou/cargo Dragon included) must show
  "cat":"stations" no matter which group it arrived from.

  curl https://orbital-traffic.ianlewis101.workers.dev/capsules
  Check for a "capsules" object keyed by NORAD ID with a
  "phase" field ("docked"/"free-flying"/"landed") and a "kind"
  field ("crew"/"cargo") per tracked vehicle, and an "events"
  array of transitions. Active (non-landed) entries must carry
  "l1"/"l2" elset lines; landed entries must NOT.

Web app deploy: automatic on merge to main via
  .github/workflows/deploy-pages.yml — no manual step needed.

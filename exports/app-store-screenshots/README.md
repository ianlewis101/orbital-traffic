# App Store screenshot raw captures

Clean captures of the live app — no browser chrome, no mockup frame, no
headline text. Device mockup and marketing copy get composed around these
separately.

Captured 3 Aug 2026 from a production build of the current `main` head
(`npm run build` → `vite preview`), driven with Playwright against the real
production Worker (`/tle`, `/capsules`, `/crew`, `/today`, `/satcat`) — live
catalog, 18,924 objects, live telemetry. Service workers were blocked in the
capture context, so nothing came from a stale `sw.js` cache; the brand mark
shown throughout is the current satellite identity, not the retired orbit-ring
mark (verified on the splash lockup and on the share card's wordmark).

| File | Size | What it shows |
| --- | --- | --- |
| `01-globe.png` | 1320×2868 | Live 3D globe. Terminator through Europe/Africa with night-side city lights, sunlit Atlantic and Americas, full Orbit Classes legend, live clock. |
| `02-whats-overhead.png` | 1320×2868 | What's Overhead results sheet — 129 objects above 40° from Los Angeles (34.05, -118.24), category filter chips, tier-ranked list. |
| `03-link-detail.png` | 1320×2868 | LINK (NORAD 69792) detail card — Science category, operator, launch date, full curated description, orbit chips, six live telemetry stats. |
| `04-link-share-card.png` | 1080×1350 | The generated share card for LINK, exactly as the Share Image button exports it (4:5, PNG, opaque). Not a screenshot of the app — the composed image itself. |

Screen size is the 6.9" iPhone class: 440×956 CSS px at `deviceScaleFactor: 3`
= 1320×2868 device px, which is the App Store's 6.9" display requirement.

Reproduce with `scratchpad/capture.mjs` from the session that made these, or
follow the `/verify` skill's Playwright setup — the only non-obvious parts are
that Chromium needs `--use-angle=swiftshader` for WebGL in this environment,
and that sheet slide-in animations run roughly ten times slower under
SwiftShader, so screenshots must wait on `getAnimations()` rather than a fixed
timeout.

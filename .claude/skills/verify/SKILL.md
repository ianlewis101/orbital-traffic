---
name: verify
description: Build, launch, and drive Orbital Traffic to observe a change at its real surfaces (web app in a browser, Node CLI tools) in a network-restricted session.
---

# Verifying Orbital Traffic changes

CelesTrak and the production Worker are usually unreachable from cloud
sessions — stub at the network boundary instead of skipping runtime
verification. Container clock is real; bundled data epochs are fresh
(refreshed daily), which matters for epoch-age logic.

## Web app (globe/UI changes)

```bash
npm install                      # repo root, once — workspace symlinks
npm run build                    # vite build -> apps/web/dist
npm run preview -w @orbital-traffic/web -- --port 4173 --strictPort
```

Run preview via the harness background runner (`nohup ... &` dies with
the sandboxed shell). Do NOT pass args through the root `npm run
preview` alias — double `--` forwarding mangles them into a positional
root dir and everything 404s.

Drive with Playwright (library only — `npm i playwright` in the
scratchpad; never `playwright install`):

- `chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-proxy-server"] })`
  — the pinned browser build won't match, and without `--no-proxy-server`
  Chromium sends localhost through the agent proxy and navigation fails.
- `browser.newContext({ serviceWorkers: "block" })` so sw.js caching
  can't interfere with route interception.
- Intercept `**://orbital-traffic.ianlewis101.workers.dev/**` (routes:
  /tle /capsules /crew /today /passes) and `**://celestrak.org/**`.
  A /tle fixture is just apps/web/public/data/satellites.json filtered —
  same record shape.
- Boot auto-syncs at +2s (`fetchLive` in main.js). Wait for the /tle
  response, then ~2s settle before asserting.

Useful surfaces: search input `#search-in`, results `#results .res`
(click selects), info card `#info-nm` / `#info-cat`, capsule status
card `.crew-exp-name` + `.crew-today-txt`, legend rows in `#legend`
(`.nm`/`.ct`). Screenshot for evidence.

## Node CLI tools (tools/*.mjs)

Stub `globalThis.fetch` in a preload and run the real entry:

```bash
node --import /abs/path/stub-fetch.mjs tools/update-capsule-status.mjs
```

Key by URL substring (`GROUP=stations`, `CATNR=`); return `Response`
objects. tools/update-capsule-status.mjs writes repo-root
capsule-status.json — back it up first and `git checkout --` it after.
Craft TLE fixtures by patching the ISS fixture line from any test file:
satnum (cols 3-7), epoch (cols 19-32, YYDDD.DDDDDDDD), inclination /
mean anomaly in l2 — keep field widths; checksums aren't validated.

## Gotchas

- `curl --noproxy '*'` for localhost checks.
- Worker tests mock fetch by `GROUP=` substring — unknown groups fall
  through to empty, so adding a group doesn't break them.
- Prettier baseline is dirty repo-wide: format only the files you
  touched, never `--write .`.

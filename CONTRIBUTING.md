# Contributing

Thanks for helping track everything in orbit!

## Setup

```bash
git clone https://github.com/ianlewis101/orbital-traffic
cd orbital-traffic
npm install     # Node >= 20
npm run dev     # http://localhost:5173
```

## Before you open a PR

```bash
npm run lint
npm test
npm run build
```

CI runs exactly these three; green locally means green in CI.

## Where things live

- Classification / TLE parsing changes → `packages/catalog` (**add a test** — this code
  runs in the web app, the Worker and the data pipeline).
- Rendering, UI, PWA → `apps/web/src`. The HTML/CSS design is intentionally preserved
  from v1 — check visual changes on both desktop and mobile widths (`768px` breakpoint).
- Live-data endpoints → `worker/src` (unit-test with stubbed `fetch`, see
  `worker/test/worker.test.js`).
- Data refresh jobs → `tools/`.

## Data corrections

Wrong category for a satellite? That's `packages/catalog/src/classify.js` — include the
object's NORAD ID and CelesTrak name in your test case. Wrong or missing description?
`apps/web/public/data/descriptions.json`, keyed by NORAD ID
(`{"d": "description", "a": "agency"}`).

## Commit style

Conventional-ish: `feat:`, `fix:`, `chore:`, `docs:`, with an optional scope
(`fix(worker): …`). Keep the subject under ~72 chars.

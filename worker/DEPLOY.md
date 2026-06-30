# Deploying the Orbital Traffic Worker

The Cloudflare Worker behind `index.html`'s live-data endpoints (`/tle`,
`/crew`, `/today`) lives here in `worker/`, version-controlled instead of
being a hand-maintained external deployment. Deploying it is a manual step
— there is no CI workflow that publishes it automatically.

## Prerequisites

- Node.js 18+ and npm
- A Cloudflare account with Workers enabled (the existing
  `orbital-traffic.ianlewis101.workers.dev` deployment lives under this
  account already)

## Deploy steps

```bash
cd worker
npm install
wrangler login   # only needed once per machine — opens a browser to authenticate
wrangler deploy
```

`wrangler deploy` publishes the Worker using the `name` in
`wrangler.toml` (`orbital-traffic`), which Cloudflare maps to the existing
`https://orbital-traffic.ianlewis101.workers.dev` URL under this account —
the same URL `index.html` already calls via `WORKER_BASE`.

## What changes after deploying

Nothing in `index.html` needs to change. It already calls
`WORKER_BASE + "/tle"` and, if the Worker is ever unreachable, falls back
to fetching `cosmos-2251-debris`, `iridium-33-debris`, and
`fengyun-1c-debris` directly from CelesTrak itself. Once this Worker is
deployed, its `/tle` route fetches those same three debris groups as
primary data (see the `GROUPS` list in `worker/index.js`) and tags them
`"cat":"debris"`, so the live site starts serving debris records
automatically on the next "Fetch Live Data" click or page load — no
client-side changes required.

## Cache TTLs

| Route    | TTL    | Source                                                  |
|----------|--------|----------------------------------------------------------|
| `/tle`   | 20 min | CelesTrak `gp.php` (multiple `GROUP=` queries, merged)    |
| `/crew`  | 1 hour | Open Notify `astros.json`                                 |
| `/today` | 5 min  | `iss-today.json` (raw.githubusercontent.com, this repo)    |

## Verifying after deploy

```bash
curl https://orbital-traffic.ianlewis101.workers.dev/tle | head -c 300
curl https://orbital-traffic.ianlewis101.workers.dev/crew
curl https://orbital-traffic.ianlewis101.workers.dev/today
```

`/tle` should return a JSON array including records with
`"cat":"debris"` — confirming the three debris groups are flowing through
as primary data, not just the client-side CelesTrak fallback.

# Orbital Traffic Worker

Cloudflare Worker backing the app's live-data endpoints. See
[docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md#worker--cloudflare-worker) for routes,
TTLs and caching strategy.

## Develop

```bash
npm run dev -w worker    # wrangler dev (local)
npm test -w worker       # unit tests (stubbed fetch, no Cloudflare account needed)
```

## Deploy

```bash
npx wrangler login       # once
npm run deploy -w worker
```

Deploys to `orbital-traffic.<account>.workers.dev`. If the workers.dev subdomain
changes, update `WORKER_BASE` in `apps/web/src/config.js`.

Verify after deploy:

```bash
curl https://orbital-traffic.<account>.workers.dev/tle   | head -c 300
curl https://orbital-traffic.<account>.workers.dev/crew
curl https://orbital-traffic.<account>.workers.dev/today
```

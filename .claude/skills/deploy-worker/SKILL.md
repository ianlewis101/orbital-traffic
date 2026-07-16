---
name: deploy-worker
description: Manually deploy the Cloudflare Worker (orbital-traffic) after any merge touching worker/src/index.js or packages/catalog/ — the two never auto-sync — then verify the specific fixes that were pending against the live /tle and /capsules output, and update docs/audit-status.md.
---

# Deploying the Orbital Traffic Cloudflare Worker

The GitHub repo and the live Cloudflare Worker are **completely
independent**. `deploy-pages.yml` auto-deploys the web app to GitHub Pages
on every merge to `main` — there is no equivalent for the Worker. It only
ever updates when someone runs `npx wrangler deploy` by hand. Forgetting
this step is the single most common source of production bugs on this
project (see CLAUDE.md Critical Rule #1).

## 1. Trigger conditions

Run this skill after **any** merge to `main` that touches:

- `worker/src/index.js` — the obvious case, **or**
- anything under `packages/catalog/` (`classify.js`, `groups.js`, `tle.js`,
  `capsules.js`, `passes.js`, `index.js`)

The second case is easy to miss because the PR diff looks "client-side
only." It isn't: `worker/src/index.js` imports `@orbital-traffic/catalog`,
so the Worker bundles whatever is in `packages/catalog/` at deploy time.
A classification fix that never touches `worker/` still needs this deploy
before the Worker's raw `/tle` output reflects it — the web app itself
gets the fix immediately via `apps/web/src/data/ingest.js` re-running
`categorize()` on every load, but the Worker API does not self-correct.

Quick check for whether a deploy is overdue — compare the Worker's last
modified time against recent merges touching those paths:

```bash
git log --oneline -- worker/src/index.js packages/catalog/ | head -20
```

(A live check of the deployed Worker's own last-modified timestamp, if
you have Cloudflare API/MCP access, is the more direct signal — compare
it against the merge dates above.)

## 2. Before deploying: check what's actually pending

`docs/audit-status.md` is the live tracker for every audit finding,
including a "Notes" column that records when a fix is "Fixed, not
deployed" specifically because it's waiting on this Worker deploy. Read
it before deploying, not after:

```bash
grep -n "not deployed\|Worker deploy\|not yet deployed" docs/audit-status.md
```

Build a short checklist from what comes back — e.g. "F9: OneWeb should
tag `oneweb` not `starlink`", "F36: name-matching should stop
silently-zero-matching hyphenated names", "ISS module fix: Unity/Zvezda/
Destiny should read `stations`". This list is what step 4's verification
actually checks — a generic "did it return 200" check is not enough, and
has historically passed while still serving stale data.

## 3. Deploy sequence

Two real failures on this project taught why every line here matters —
don't shortcut any of them:

```bash
cd <repo root>
git pull origin main

npm install        # MUST run at the repo root, not inside worker/.
                    # worker/src/index.js imports the @orbital-traffic/catalog
                    # workspace package; that import only resolves once npm
                    # has created the workspace symlink at
                    # node_modules/@orbital-traffic/catalog, which an
                    # `npm install` run from inside worker/ alone does not
                    # set up. Skipping this fails wrangler's build with
                    # "Could not resolve @orbital-traffic/catalog" — this is
                    # not hypothetical, it's exactly what happened trying to
                    # deploy PR #52 before this step was documented.

cd worker
npx wrangler deploy
```

Requires Cloudflare credentials wrangler can use (an authenticated
`wrangler login` session, or `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`
in the environment). If `npx wrangler whoami` reports not authenticated
and no token is set, stop and say so explicitly — do not report a deploy
as complete without a real, successful `wrangler deploy` output showing
the new version was uploaded.

## 4. Verification — check the specific things that changed

A 200 response with stale data passes a naive health check and is still
wrong. Pull the pending-items list from step 2 and confirm each one by
name in the raw response, not just that the endpoint responds:

```bash
curl https://orbital-traffic.ianlewis101.workers.dev/tle
```

- Every record's `"cat"` field should reflect the current
  `categorize()` pipeline — look for the *specific* values that were
  previously broken, e.g. `"cat":"oneweb"` and `"cat":"kuiper"` actually
  appearing (not silently absorbed into `"starlink"`/`"other"`), and
  `"cat":"capsules"` for crewed/cargo vehicles (not `"cat":"stations"`,
  which predates the 2026-07-16 category split).
- Look up Unity (25575), Zvezda (26400), Destiny (26700), and POISK
  (36086) by NORAD ID specifically — each must show `"cat":"stations"`.
  A generic count of "stations" objects will not catch one of these
  three quietly still reading `"other"`.

```bash
curl https://orbital-traffic.ianlewis101.workers.dev/capsules
```

- Each active entry needs a `"phase"` (`docked`/`free-flying`/`landed`)
  and a `"kind"` (`crew`/`cargo`), plus `l1`/`l2` elset lines unless
  landed (landed entries must have none).

If a pending item does *not* show up correctly, treat that as the deploy
having failed to achieve its purpose even if the HTTP status was 200 —
re-check the deploy output and the source fix before assuming success.

## 5. Cache note — don't mistake this for a failed deploy

`/tle`, `/crew`, `/today`, `/capsules`, and `/passes` are all served
through `cached()` in `worker/src/index.js`, backed by the Workers Cache
API (`caches.default`) keyed by path — independent of which code version
is live. `/tle` specifically has a 20-minute TTL (`TLE_TTL`). Deploying
new code does **not** invalidate this cache entry.

So: if you curl immediately after deploy and still see the old,
uncorrected values, **that is expected, not a broken deploy** — the new
code is live, but an edge node may still be serving a response cached
before the deploy. Say so explicitly rather than reporting a failure. If
immediate confirmation is genuinely needed rather than waiting out the
TTL, a Cloudflare cache purge for the zone/domain is the faster path;
otherwise wait up to 20 minutes and re-curl.

## 6. After a successful, verified deploy

Update `docs/audit-status.md`:

- Flip each pending item's status/notes from "Fixed, not deployed" to
  "Fixed and live" (or the equivalent Worker-deploy-specific note) for
  everything confirmed present in step 4 — not for items merely deployed
  but not individually re-checked.
- Add a one-line entry to the Change log section at the bottom noting the
  deploy (date, what was verified, PR numbers covered).

Do not mark an item as deployed/live if step 4 could not directly confirm
it (e.g. blocked by network access, cache TTL not yet elapsed, or missing
credentials) — leave a note instead saying what's still unverified and
why.

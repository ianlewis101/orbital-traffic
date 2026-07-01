# Worker / external pipeline updates needed for the unified DEBRIS category

This repo does **not** contain a `worker/` folder. There is no Cloudflare
Worker source in `ianlewis101/orbital-traffic` — confirmed by searching the
full repo tree (`find . -iname "*worker*"` returns nothing besides this
note, and there is no `wrangler.toml`/`worker/` directory).

The app does depend on a Cloudflare Worker, but it's deployed and maintained
**outside this repo**. It's only referenced by URL in `index.html`:

```js
// index.html — inside fetchLive()
const WORKER_BASE = "https://orbital-traffic.ianlewis101.workers.dev";
...
const res = await fetch(WORKER_BASE + "/tle", { cache:"no-store" });
```

Per the task scope, all code changes for this PR were therefore made to
`index.html` only. This file documents what needs to change outside this
repo (the Worker) and in one in-repo file that was deliberately **not**
touched (`scripts/update_tles.py`), so both can be updated by whoever has
access to that deployment.

## 1. The Cloudflare Worker (`orbital-traffic.ianlewis101.workers.dev`) — external, not in this repo

The Worker presumably proxies/caches a fixed set of CelesTrak `GROUP=`
queries and returns them as JSON from its `/tle` route. Wherever its fetch
list is defined (likely a `GROUPS` array/object analogous to the one in
`index.html`'s CelesTrak fallback, see below), add these three groups:

| CelesTrak GROUP name      | Suggested `cat` tag | Why |
|----------------------------|----------------------|-----|
| `cosmos-2251-debris`       | `debris`             | 2009 Iridium 33 / Cosmos 2251 collision — one of the two largest debris-generating events ever |
| `iridium-33-debris`        | `debris`             | Other half of the 2009 collision |
| `fengyun-1c-debris`        | `debris`             | 2007 Chinese ASAT test — the single largest debris-generating event in spaceflight history |

Each should be fetched the same way the existing groups are (e.g.
`https://celestrak.org/NORAD/elements/gp.php?FORMAT=tle&GROUP=cosmos-2251-debris&FORMAT=tle`)
and tagged with `"cat":"debris"` in the JSON objects the Worker returns,
matching the `{name, l1, l2, cat}` shape `index.html` already expects
(see `ingest()` in `index.html`).

No further client-side change is required once the Worker returns these
records — `index.html` now reclassifies by name/pattern on top of whatever
`cat` arrives (see `isDebrisName()`/`correctDebrisCat()`), so even if the
Worker is updated later or tags things inconsistently, anything matching
the debris/rocket-body name patterns below will land in the unified
`debris` category regardless.

## 2. `scripts/update_tles.py` — in this repo, intentionally not modified here

This script is the other half of the data pipeline: a GitHub Action
(`.github/workflows/update-tles.yml`) runs it daily, and it fetches TLEs
directly from CelesTrak and patches the *default/cached* satellite dataset
baked into `index.html` (the `<script type="application/json" id="d-sats">`
data island). This is the dataset every visitor sees on first load, before
they click "Fetch Live Data" — so it's actually the most important place to
add the new debris groups for the "populate it fully" goal.

It was left unchanged here because the task scope explicitly said to focus
changes on `index.html` only when no Worker source is present in the repo.
To complete the rollout, add the three groups to the `CELESTRAK` dict near
the top of `scripts/update_tles.py`:

```python
CELESTRAK = {
    "stations":      "https://celestrak.org/NORAD/elements/gp.php?FORMAT=tle&GROUP=stations",
    "navigation":    "https://celestrak.org/NORAD/elements/gp.php?FORMAT=tle&GROUP=gps-ops",
    "science":       "https://celestrak.org/NORAD/elements/gp.php?FORMAT=tle&GROUP=science",
    "geostationary": "https://celestrak.org/NORAD/elements/gp.php?FORMAT=tle&GROUP=geo",
    "starlink":      "https://celestrak.org/NORAD/elements/gp.php?FORMAT=tle&GROUP=starlink",
    # add:
    "debris":        "https://celestrak.org/NORAD/elements/gp.php?FORMAT=tle&GROUP=cosmos-2251-debris",
}
```

`build_sat_json()` already iterates every key in `CELESTRAK` and tags each
satellite with `"cat": <dict key>`, so a single combined key won't capture
all three CelesTrak groups — fetch each group separately and merge, e.g.:

```python
DEBRIS_GROUPS = ["cosmos-2251-debris", "iridium-33-debris", "fengyun-1c-debris"]

def build_sat_json() -> str:
    all_sats = []
    for group, url in CELESTRAK.items():
        all_sats.extend(fetch_tles(group, url))
        time.sleep(1)
    for group in DEBRIS_GROUPS:
        url = f"https://celestrak.org/NORAD/elements/gp.php?FORMAT=tle&GROUP={group}"
        all_sats.extend(fetch_tles(group, url))  # fetch_tles already tags cat=group name
        time.sleep(1)
    ...
```

`fetch_tles()` tags records with `cat=group`, so the three debris groups
would arrive tagged `cosmos-2251-debris`/`iridium-33-debris`/`fengyun-1c-debris`
rather than the literal string `"debris"`. Either special-case those three
group names to `cat="debris"` inside `fetch_tles()`/`correct_station_cat()`,
or simplest: loop the three CelesTrak group URLs but pass `"debris"` as the
`group` argument to `fetch_tles()` (it only uses `group` as the `cat` tag
and for the log line) — e.g. `fetch_tles("debris", url)` for each of the
three URLs. The `index.html` reclassification logic added in this PR
(`isDebrisName()`) will also reclassify by name as a backstop, so an
imprecise `cat` tag here isn't fatal, but tagging it correctly upstream is
cleaner.

The JSON patching itself (`patch_html()`/`_find_matching_bracket()`) does
not need to change — it already does string/escape-aware bracket matching
and is unaffected by which groups feed into `build_sat_json()`.

## 3. What was actually changed in `index.html` for this PR

- `CATS.rocket` and `CATS.debris` merged into one `CATS.debris` entry,
  label `"DEBRIS"`, color `0x7a8899` (the former rocket-body grey — no new
  color introduced).
- `state.hidden` now starts as `new Set(["debris"])` so the category is
  hidden on the globe by default; the legend row still renders (with its
  count) and toggles on/off exactly like every other category, since
  `rebuildLegend()`/`buildClouds()` already key off `CATS`/`state.hidden`
  generically.
- A new `isDebrisName(name)` / `correctDebrisCat(name, cat)` pair (next to
  the existing `correctStationCat`) is applied in `ingest()` for every
  record, regardless of source group, to catch:
  `DEB`, `DEBRIS`, `FRAGMENT`, `FRAG`, `R/B`, `ROCKET BODY`, `ROCKET`,
  `STAGE`, `ARIANE`, `DELTA`, `ATLAS`, `TITAN`, plus the `CZ-`, `SL-`, and
  `PSLV R/B` prefixes — matched case-insensitively (names are upper-cased
  before testing).
- `classify()` (the separate, finer-grained classifier used only for
  generating narrative descriptions/SVG art, not for legend grouping) was
  updated to merge its old `"rocket"` branch into `"debris"` using the same
  `isDebrisName()` helper, and the now-unreachable `"rocket"` cases in
  `describe()` and `svgFor()` were removed/merged so there's no dead code.
- The CelesTrak fallback fetch list inside `fetchLive()` (used when the
  external Worker is unreachable) now also requests
  `cosmos-2251-debris`, `iridium-33-debris`, and `fengyun-1c-debris`,
  tagged `cat:"debris"`.

## 4. Before/after counts (current bundled/cached dataset, 11,344 objects)

The bundled dataset only ever pulled from `stations`/`gps-ops`/`science`/
`geo`/`starlink` CelesTrak groups, so it never contained a meaningful
debris/rocket-body population to begin with — that's exactly the gap
sections 1 and 2 above close. Within the *existing* bundled data, the new
name-pattern reclassification moves 1 object:

| Category | Before | After |
|----------|-------:|------:|
| Other    | 13     | 12    |
| Debris (formerly Debris + Rocket Bodies, 2 + 0) | 2 | 3 |

(`FREGAT DEB`, previously dumped into `other`, is now correctly classified
as `debris`.) The much larger gains — hundreds to low thousands of
additional tracked fragments from the Cosmos 2251, Iridium 33, and
Fengyun-1C breakups — will appear once the Worker and/or
`scripts/update_tles.py` changes above are deployed, or whenever a user
clicks "Fetch Live Data" after this PR (which now requests those three
groups directly from CelesTrak as a fallback).

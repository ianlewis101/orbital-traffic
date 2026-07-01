# Other Category Audit

**Generated:** 2026-06-30  
**Dataset:** live bundled `d-sats` script tag in `index.html`  
**Pipeline:** full `ingest()` chain as of PR #30 — `correctOtherCat(correctDebrisCat(correctStationCat(...)))`  
**Total objects in "other" after all fixes:** 11 (out of 11,345 total)

> **Note on object type:** The bundled dataset stores TLE records only (name, l1, l2, cat). CelesTrak's GP object-type field (PAYLOAD / R/B / DEB) is not present in the TLE format and is not embedded in the bundle. Object types below are inferred from name conventions and known catalog context.

---

## Complete "Other" Object List

| NORAD ID | Name | Inferred Type | Inclination | Notes |
|---|---|---|---|---|
| 68689 | CYGNUS NG-24 | PAYLOAD (cargo) | 51.63° | Northrop Grumman ISS cargo vehicle |
| 67685 | GXIBA-1 | PAYLOAD (CubeSat) | 51.63° | ISS-deployed CubeSat, batch 2025 |
| 67688 | HMU-SAT2 | PAYLOAD (CubeSat) | 51.63° | Hellenic Mediterranean University CubeSat |
| 67683 | KNACKSAT-2 | PAYLOAD (CubeSat) | 51.63° | Thai university CubeSat (KMUTNB) |
| 67687 | LEOPARD | PAYLOAD (CubeSat) | 51.63° | SpaceTech Singapore technology demonstrator |
| 36086 | POISK | PAYLOAD (module) | 51.63° | ISS Mini Research Module 2 (MRM-2), permanently docked |
| 68319 | PROGRESS-MS 33 | PAYLOAD (cargo) | 51.63° | Russian ISS cargo vehicle |
| 68837 | PROGRESS-MS 34 | PAYLOAD (cargo) | 51.63° | Russian ISS cargo vehicle |
| 66515 | SZ-21 MODULE | PAYLOAD (module) | 41.47° | Shenzhou 21 orbital module, detached and decaying |
| 69049 | TIANZHOU-10 | PAYLOAD (cargo) | 41.47° | Chinese CSS cargo vehicle |
| 67686 | UITMSAT-2 | PAYLOAD (CubeSat) | 51.63° | Malaysian university CubeSat (UiTM) |

---

## Pattern Analysis

### Group 1 — ISS core module missing from allowlist (1 object)

**Objects:** POISK (36086)

POISK (Russian: "Search") is ISS Mini Research Module 2 (MRM-2), permanently docked to the Zvezda module since 2010. It is a structural part of the ISS complex, not a transient visitor. It arrived in CelesTrak's `GROUP=stations` feed and was correctly sent to the allowlist filter — but NORAD 36086 is not in `STATION_CORE_IDS`, so it fell to `"other"`.

**Why it wasn't caught before:** The ISS TLE set in `GROUP=stations` uses a shared TLE for all ISS modules (they co-orbit as one rigid body), so POISK shares the same orbital elements as 25544 (Zarya). Its exclusion from the allowlist is an oversight, not a fundamental ambiguity.

---

### Group 2 — Cargo/resupply vehicles (4 objects, correctly classified)

**Objects:** CYGNUS NG-24 (68689), PROGRESS-MS 33 (68319), PROGRESS-MS 34 (68837), TIANZHOU-10 (69049)

These are active uncrewed cargo vehicles docked to ISS (Progress, Cygnus) and CSS (Tianzhou). They are correctly stored as `"other"` — there is no `"cargo"` bucket in CATS — and the separate `classify()` display function already handles them:

```js
if (/ SOYUZ | PROGRESS | DRAGON | CYGNUS | SHENZHOU | TIANZHOU | … /.test(n)) return "capsule";
```

So these 4 objects display as "capsule" in the UI (same icon/colour as crew capsules) even though their stored `cat` is `"other"`. This is the intended architecture: `ingest()` assigns a storage category; `classify()` overrides the display category at render time.

**Action needed:** None. These are correctly handled by the existing two-level design.

---

### Group 3 — Detached spacecraft module in final decay (1 object)

**Objects:** SZ-21 MODULE (66515)

The Shenzhou 21 orbital module was jettisoned after the crew capsule separated in April 2025. It remains in a decaying CSS-altitude orbit (41.47°) and will reenter uncontrolled. Unlike the cargo vehicles, there is no "SZ-21 MODULE" display branch in `classify()`, so it currently displays as a generic "other" object with no special icon.

This object is in an ambiguous real-world state: it was a crewed vehicle component, is now inert hardware in final decay, and will eventually burn up. The choice of category is a design decision (see suggestions below).

---

### Group 4 — ISS-deployed CubeSats from a single 2025 batch (5 objects)

**Objects:** GXIBA-1 (67685), HMU-SAT2 (67688), KNACKSAT-2 (67683), LEOPARD (67687), UITMSAT-2 (67686)

These five CubeSats share consecutive NORAD IDs 67683–67688, clustered around CORAL (67684) which is already classified as `"science"`. All six were deployed from ISS in the same batch in 2025 and share an orbital inclination of ~51.62–51.63°.

The five remaining in "other" have no common name prefix or suffix. CORAL was likely pre-loaded in CelesTrak's `science` group; the others appear only in the `stations` group (as ISS co-orbiters) and fall to `"other"` after the station allowlist filter. They are research/educational CubeSats:

| NORAD | Name | Operator / Country |
|---|---|---|
| 67683 | KNACKSAT-2 | KMUTNB — Thailand |
| 67685 | GXIBA-1 | GXIBA — China |
| 67686 | UITMSAT-2 | Universiti Teknologi MARA — Malaysia |
| 67687 | LEOPARD | SpaceTech — Singapore |
| 67688 | HMU-SAT2 | Hellenic Mediterranean University — Greece |

No existing regex would rescue them without either matching their specific names or inferring from NORAD ID proximity to CORAL.

---

## Suggested Further Classification Rules

These are options for consideration, not implemented changes. Each entry notes the proposed rule, which function it would modify, and the estimated object movement.

---

### Suggestion A — Add POISK to `STATION_CORE_IDS`

**Target:** `STATION_CORE_IDS` in `index.html` (and mirror to `worker/index.js` and `scripts/update_tles.py` to stay in sync)

**Rule:** Add `"36086"` to the allowlist set.

```js
const STATION_CORE_IDS = new Set([
  "25544", "49044", "27386", "28654", "37224", "37820", // ISS modules
  "36086",                                               // Poisk (MRM-2)
  "48274", "53239", "54216",                             // CSS Tiangong modules
]);
```

**Objects moved:** 1 (POISK: `other` → `stations`)  
**Risk:** Low. NORAD 36086 is unambiguously a permanent ISS module. The ID is stable (Poisk has been on-orbit since 2010 and is not expected to undock).

---

### Suggestion B — Classify SZ-21 MODULE as debris

**Target:** `ISS_HARDWARE_RE` in `index.html` and `worker/index.js`

**Rule:** Extend the existing ISS-released-hardware pattern to catch jettisoned Shenzhou orbital modules:

```js
const ISS_HARDWARE_RE = / MONOBLOCK | DUPLEX | ISS OBJECT | SZ-\d+ MODULE /;
```

**Objects moved:** 1 (SZ-21 MODULE: `other` → `debris`)  
**Risk:** Low-medium. The pattern is narrow and won't match docked Shenzhou crew vehicles (those are matched by `isDockedCrewVehicle()` via `/SHENZHOU/` before the debris check). Future jettisoned modules (SZ-22 MODULE etc.) would be caught automatically. However, one could argue these decommissioned modules are better described as `"other"` until reentry confirmation — a matter of editorial taste rather than technical accuracy.

**Alternative:** Leave as `"other"` and add a `describe()` entry for it instead, since the module will reenter within months.

---

### Suggestion C — Rescue ISS-deployed educational CubeSats into "science"

**Target:** `correctOtherCat()` in `index.html` and `worker/index.js`

No shared name pattern exists for these five CubeSats. Three approaches:

**Option C1 — Add individual names (maintenance burden):**
```js
const EDU_CUBESAT_RE = / KNACKSAT | GXIBA | UITMSAT | LEOPARD | HMU-SAT /;
```
Objects moved: up to 5 (depending on feed names and spaces). Risk: `LEOPARD` is a common word; with space-padding the false positive risk on the bundled dataset is zero (tested), but future satellites named e.g. "SNOW LEOPARD" would be caught. `HMU-SAT` has a hyphen so `/ HMU-SAT /` would not match with the current space-token approach — would need `\bHMU-SAT\b`.

**Option C2 — Classify by NORAD ID range (brittle, not recommended):**
Checking for IDs adjacent to a known science satellite (CORAL, 67684) is possible but would break silently as new objects are added to the catalog.

**Option C3 — Add these NORAD IDs to a curated set (most correct):**
```js
const SCIENCE_IDS = new Set(["67683", "67685", "67686", "67687", "67688"]);
```
Apply in `correctOtherCat`: if `SCIENCE_IDS.has(id) && cat === "other"` return `"science"`. Objects moved: 5. This is essentially the same pattern as `STATION_CORE_IDS` — an ID allowlist for objects that can't be reliably name-matched.

**Recommendation:** Option C3 or leave as `"other"`. These satellites don't harm the "Other" bucket and are genuinely miscellaneous. Suggestions A and B have clearer justification.

---

### Suggestion D — Cargo vehicles (no action recommended)

**Objects:** CYGNUS, PROGRESS, TIANZHOU

As noted in Group 2 above, these are already handled correctly by `classify()` at display time and show as "capsule" in the UI. Adding a `correctOtherCat` rule to move them to `"science"` or another CATS bucket would be misleading. If a dedicated `"cargo"` CATS entry were added in future, these names are already in `classify()`'s capsule regex and could be split out cleanly.

---

## Summary of Suggested Moves

| Suggestion | Objects affected | Estimated count | Confidence |
|---|---|---|---|
| A — Add POISK to allowlist | `other` → `stations` | 1 | High |
| B — SZ-21 MODULE as debris | `other` → `debris` | 1 | Medium |
| C3 — CubeSat ID allowlist | `other` → `science` | 5 | Medium |
| D — Cargo vehicles | No change recommended | 0 | N/A |

Implementing A alone reduces "other" to 10. Implementing A + B + C3 reduces it to 4 (the four cargo vehicles, which are correctly "other").

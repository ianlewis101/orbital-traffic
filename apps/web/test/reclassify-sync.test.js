import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { categorize, CATEGORY_IDS } from "@orbital-traffic/catalog";
import { noradId } from "../../../packages/catalog/src/tle.js";
import { CATEGORY_OVERRIDES } from "../../../packages/catalog/src/reclassify.js";

/**
 * Keeps researched category verdicts from silently going nowhere.
 *
 * descriptions.json's "category" field records what an object turned out to
 * be, established while writing its description — the whole reason to
 * describe an unidentified "other" payload in the first place. For a long
 * time nothing read that field, so ~860 researched objects stayed in "other",
 * which state.js hides by default, taking their descriptions with them.
 * reclassify.js now carries those verdicts into categorize().
 *
 * Two failure modes are guarded here:
 *   - a verdict recorded in descriptions.json that never reaches categorize()
 *     (the original bug, which had no symptom anywhere — the object just
 *     quietly stayed hidden);
 *   - an override that is present but inert. Per CLAUDE.md: "adding an ID
 *     isn't verified until you've run categorize() on the real record and
 *     confirmed the category actually flips — allowlist membership alone
 *     doesn't guarantee it if only one direction of the pipeline consults it."
 */

const descs = JSON.parse(
  readFileSync(new URL("../public/data/descriptions.json", import.meta.url), "utf8")
);
const sats = JSON.parse(
  readFileSync(new URL("../public/data/satellites.json", import.meta.url), "utf8")
);

/** The real bundled catalog, keyed the way ingest() keys it. */
const live = new Map();
for (const r of sats) {
  try {
    live.set(noradId(r.l1), r);
  } catch {
    /* malformed row — ingest() skips these too */
  }
}

const VALID = new Set(CATEGORY_IDS);

/**
 * Verdicts that are themselves wrong, and must NOT be applied.
 *
 * 69180 is SHENZHOU-23 — a crewed Tiangong ferry, as its own "t" field says
 * ("Chinese Crewed Spacecraft — Tiangong Crew Transport"). Its verdict reads
 * "stations", but Rule 6 reserves that category for the permanent structural
 * modules in STATION_CORE_IDS and explicitly keeps transient vehicles out of
 * it; categorize() correctly returns "capsules". Read as "station traffic"
 * rather than "a station module" the note makes sense, but as a category it
 * would put a returning capsule in the one set that is supposed to contain
 * nothing that ever comes home.
 *
 * Listed here rather than filtered out silently: descriptions.json is BRAD's
 * file alone, so the verdict itself has to be corrected there, and until it is
 * this is the record of why the pipeline ignores it.
 */
const REJECTED_VERDICTS = new Map([["69180", "stations"]]);
const liveCat = (id) => {
  const r = live.get(id);
  return r ? categorize(id, r.name, r.cat) : null;
};

describe("researched category verdicts reach categorize()", () => {
  it("honours every valid verdict in descriptions.json", () => {
    // Deliberately NOT filtered to "currently other": once an override lands,
    // these objects are no longer "other", and a filter written that way would
    // pass by excluding exactly what it is meant to check.
    const ignored = [];
    for (const [id, e] of Object.entries(descs)) {
      if (!e.category || !VALID.has(e.category)) continue;
      if (REJECTED_VERDICTS.get(id) === e.category) continue;
      const actual = liveCat(id);
      if (actual === null) continue; // de-orbited / not in the bundled catalog
      if (actual !== e.category) ignored.push({ id, want: e.category, got: actual });
    }
    expect(ignored).toEqual([]);
  });

  it("keeps rejecting the verdicts that contradict the category rules", () => {
    // If one of these is ever corrected in descriptions.json, this fails and
    // the exception should be dropped — not silently carried forever.
    for (const [id, bad] of REJECTED_VERDICTS) {
      expect(descs[id]?.category).toBe(bad);
      expect(liveCat(id)).not.toBe(bad);
    }
  });

  it("every override actually flips a real record out of other", () => {
    // An override that matches no live object, or that a earlier pipeline step
    // already claims, is dead weight — and worse, it implies coverage the app
    // does not have.
    const inert = [];
    for (const [id, want] of CATEGORY_OVERRIDES) {
      if (!live.has(id)) continue; // object left the catalog; harmless, not inert
      if (liveCat(id) !== want) inert.push({ id, want, got: liveCat(id) });
    }
    expect(inert).toEqual([]);
  });

  it("only assigns categories that actually exist", () => {
    for (const [, cat] of CATEGORY_OVERRIDES) expect(VALID.has(cat)).toBe(true);
  });

  it("never overrides an object the hand-curated ID sets already place", () => {
    // classify.js checks SCIENCE_IDS/DEBRIS_IDS/COMMS_IDS/CLASSIFIED_IDS
    // first, so a disagreement would be silently won by those. Asserting the
    // two never disagree keeps that precedence from hiding a stale verdict.
    for (const [id, want] of CATEGORY_OVERRIDES) {
      if (!live.has(id)) continue;
      expect(liveCat(id)).toBe(want);
    }
  });
});

describe("verdicts whose recorded category does not exist", () => {
  /** Entries whose "category" names something outside CATEGORY_IDS. */
  const invalidEntries = Object.entries(descs).filter(
    ([, e]) => e.category && !VALID.has(e.category)
  );

  it("resolves every one of them rather than leaving it in other", () => {
    // These were placed by hand (reclassify.js's RESOLVED section) after
    // reading each description. The failure this guards against is a new
    // batch arriving with the same bad vocabulary and silently staying
    // hidden in "other" — which is exactly how the original 860 went
    // unnoticed for as long as they did.
    const unresolved = invalidEntries
      .filter(([id]) => live.has(id) && !CATEGORY_OVERRIDES.has(id))
      .map(([id, e]) => ({ id, recorded: e.category, got: liveCat(id) }));
    expect(unresolved).toEqual([]);
  });

  it("does not sweep them all into classified", () => {
    // The recorded vocabulary ("commercial reconnaissance", "military
    // reconnaissance") reads as though it belongs there, but only 18 of the
    // 99 are genuinely undisclosed-operator payloads. The rest are named
    // commercial operators, or university CubeSats from one rideshare
    // (COSPAR 2024-199) that appears to have been tagged as a block. If a
    // future edit collapses them into one category, this catches it.
    const resolved = invalidEntries
      .filter(([id]) => CATEGORY_OVERRIDES.has(id))
      .map(([id]) => CATEGORY_OVERRIDES.get(id));
    expect(new Set(resolved).size).toBeGreaterThan(1);
  });

  it("still uses only the two known invalid category names", () => {
    // A NEW invalid string is fresh drift, worth catching here rather than
    // discovering it as another silently-hidden object months later.
    const invalid = new Set();
    for (const e of Object.values(descs)) {
      if (e.category && !VALID.has(e.category)) invalid.add(e.category);
    }
    expect([...invalid].sort()).toEqual(["commercial reconnaissance", "military reconnaissance"]);
  });
});

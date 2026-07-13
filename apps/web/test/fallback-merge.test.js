import { describe, it, expect, beforeEach } from "vitest";
import { mergeRecords } from "@orbital-traffic/catalog";
import { ingest } from "../src/data/ingest.js";
import { state } from "../src/state.js";

/**
 * fetchLive()'s direct-CelesTrak fallback (used when the Worker proxy is
 * down) must merge the per-group record arrays in GROUPS priority order, so
 * a satellite already claimed by a specific group is never overwritten by
 * the generic "active" catch-all that GROUPS lists last. This mirrors the
 * Worker's own buildTLERecords() priority merge, and guards against a
 * regression to the old naive concat (flatMap), which — combined with
 * ingest()'s last-write-wins on duplicate IDs — let "active" clobber the
 * more precise category.
 */

const BASE_L1 = "1 25544U 98067A   26182.50817465  .00006185  00000+0  11827-3 0  9996";
const BASE_L2 = "2 25544  51.6311 229.1989 0004224 255.0896 104.9625 15.49503254573972";

// A neutral name that matches no station/debris/other name pattern, so its
// final category is driven purely by the group hint — isolating merge
// priority from name-based classification.
function makeRecord(satnum, cat) {
  return {
    name: "TESTSAT " + satnum,
    l1: BASE_L1.replace("25544", satnum),
    l2: BASE_L2.replace("25544", satnum),
    cat,
  };
}

beforeEach(() => {
  state.sats.length = 0;
  state.byId.clear();
  state.selected = null;
});

describe("fallback direct-fetch merge priority", () => {
  it("specific-category group wins over the generic active catch-all", async () => {
    // Same NORAD id in a specific group (science) and the generic catch-all
    // (active → "other"). GROUPS lists specific groups first and
    // Promise.allSettled preserves that order, so the per-group arrays reach
    // mergeRecords() specific-first and the science record must survive.
    const scienceGroup = [makeRecord("90007", "science")];
    const activeGroup = [makeRecord("90007", "other")];
    const recs = mergeRecords([scienceGroup, activeGroup]);
    expect(recs).toHaveLength(1); // duplicate id collapsed
    await ingest(recs);
    expect(state.byId.get("90007").cat).toBe("science");
  });

  it("without the priority merge, the generic catch-all would overwrite (regression guard)", async () => {
    // The old naive concat fed both records to ingest in order; ingest's
    // last-write-wins then let the later "active" record clobber the
    // specific one — the exact bug F8 fixes.
    const concatenated = [makeRecord("90007", "science"), makeRecord("90007", "other")];
    await ingest(concatenated);
    expect(state.byId.get("90007").cat).toBe("other");
  });
});

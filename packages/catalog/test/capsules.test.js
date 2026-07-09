import { describe, it, expect } from "vitest";
import {
  capsuleFamily,
  deriveOrbitElements,
  separationKm,
  nearestStation,
  determinePhase,
  buildCapsuleSnapshot,
  advanceCapsuleLog,
  DOCKED_DISTANCE_KM,
  MAX_ASSOCIATION_INCLINATION_DEG,
} from "../src/index.js";

const ISS_L1 = "1 25544U 98067A   26182.50817465  .00006185  00000+0  11827-3 0  9996";
const ISS_L2 = "2 25544  51.6311 229.1989 0004224 255.0896 104.9625 15.49503254573972";
// Same orbit shape/plane as the ISS fixture, mean anomaly shifted ~180deg —
// opposite side of the same orbit. Altitude/inclination alone can't tell
// this apart from "docked"; actual 3D separation must.
const ISS_OPPOSITE_L2 = ISS_L2.replace("104.9625", "284.9625");

// Wildly different orbit (98.7deg inclination) — same fixture worker.test.js uses.
const DEBRIS_L1 = "1 43012U 17072B   26181.50000000  .00000100  00000+0  10000-3 0  9990";
const DEBRIS_L2 = "2 43012  98.7000 100.0000 0001000 100.0000 260.0000 14.20000000123456";

const FIXED_AT = new Date("2026-07-03T00:00:00Z");

function withSatnum(l1, l2, satnum) {
  return [l1.replace("25544", satnum), l2.replace("25544", satnum)];
}

describe("capsuleFamily", () => {
  it("matches each crewed family", () => {
    expect(capsuleFamily("CREW DRAGON 12")).toBe("dragon");
    expect(capsuleFamily("CREW DRAGON (ENDEAVOUR)")).toBe("dragon");
    expect(capsuleFamily("SOYUZ-MS 29")).toBe("soyuz");
    expect(capsuleFamily("CST-100 STARLINER (CALYPSO)")).toBe("starliner");
    expect(capsuleFamily("SHENZHOU-21 (SZ-21)")).toBe("shenzhou");
  });

  it("never matches uncrewed cargo Dragon", () => {
    expect(capsuleFamily("DRAGON CRS-29")).toBeNull();
  });

  it("tolerates hyphenation and matches airframes and upcoming vehicles", () => {
    expect(capsuleFamily("CREW-DRAGON 13")).toBe("dragon");
    expect(capsuleFamily("DRAGON GRACE")).toBe("dragon");
    expect(capsuleFamily("ENDEAVOUR")).toBe("dragon");
    expect(capsuleFamily("SOYUZ MS-30")).toBe("soyuz");
    expect(capsuleFamily("CST-100 (CALYPSO)")).toBe("starliner");
    expect(capsuleFamily("MENGZHOU-1")).toBe("mengzhou");
    expect(capsuleFamily("GAGANYAAN-1")).toBe("gaganyaan");
    expect(capsuleFamily("ORION (ARTEMIS II)")).toBe("orion");
  });

  it("returns null for non-capsule names", () => {
    expect(capsuleFamily("PROGRESS-MS 32")).toBeNull();
    expect(capsuleFamily("STARLINK-30042")).toBeNull();
    expect(capsuleFamily("GRACE-FO 1")).toBeNull();
    expect(capsuleFamily("DRAGRACER 2 (AUGURY)")).toBeNull();
  });
});

describe("deriveOrbitElements", () => {
  it("derives sane altitude/inclination/period for the ISS", () => {
    const el = deriveOrbitElements(ISS_L1, ISS_L2);
    expect(el.altitudeKm).toBeGreaterThan(380);
    expect(el.altitudeKm).toBeLessThan(430);
    expect(el.inclinationDeg).toBeCloseTo(51.6311, 1);
    expect(el.periodMin).toBeGreaterThan(90);
    expect(el.periodMin).toBeLessThan(95);
  });

  it("returns null for a malformed TLE", () => {
    expect(deriveOrbitElements("garbage", "garbage")).toBeNull();
  });
});

describe("separationKm", () => {
  it("is ~0 for the same object compared against itself", () => {
    const d = separationKm(ISS_L1, ISS_L2, ISS_L1, ISS_L2, FIXED_AT);
    expect(d).toBeLessThan(1);
  });

  it("is large for a wildly different orbit", () => {
    const d = separationKm(ISS_L1, ISS_L2, DEBRIS_L1, DEBRIS_L2, FIXED_AT);
    expect(d).toBeGreaterThan(1000);
  });

  it("is large for the same orbit shape but the opposite side of Earth", () => {
    const el = deriveOrbitElements(ISS_L1, ISS_OPPOSITE_L2);
    expect(el.inclinationDeg).toBeCloseTo(51.6311, 1); // same shape as ISS_L2
    const d = separationKm(ISS_L1, ISS_L2, ISS_L1, ISS_OPPOSITE_L2, FIXED_AT);
    expect(d).toBeGreaterThan(DOCKED_DISTANCE_KM * 10);
  });

  it("returns null for a malformed TLE", () => {
    expect(separationKm("garbage", "garbage", ISS_L1, ISS_L2, FIXED_AT)).toBeNull();
  });
});

describe("nearestStation", () => {
  const hubs = [
    { key: "iss", inclinationDeg: 51.6 },
    { key: "css", inclinationDeg: 41.5 },
  ];

  it("picks the closest-inclination hub within tolerance", () => {
    expect(nearestStation(51.7, hubs).key).toBe("iss");
    expect(nearestStation(41.6, hubs).key).toBe("css");
  });

  it("returns null when nothing is close enough", () => {
    expect(nearestStation(98.7, hubs)).toBeNull();
  });

  it("respects the exact tolerance boundary", () => {
    const delta = MAX_ASSOCIATION_INCLINATION_DEG;
    expect(nearestStation(51.6 + delta, hubs)).not.toBeNull();
    expect(nearestStation(51.6 + delta + 0.01, hubs)).toBeNull();
  });
});

describe("determinePhase", () => {
  it("is docked at/under the distance threshold", () => {
    expect(determinePhase(0)).toBe("docked");
    expect(determinePhase(DOCKED_DISTANCE_KM)).toBe("docked");
  });

  it("is free-flying just over the threshold, or with no known distance", () => {
    expect(determinePhase(DOCKED_DISTANCE_KM + 0.1)).toBe("free-flying");
    expect(determinePhase(null)).toBe("free-flying");
  });
});

describe("buildCapsuleSnapshot", () => {
  const [dockedL1, dockedL2] = withSatnum(ISS_L1, ISS_L2, "99001");
  const [awayL1, awayL2] = withSatnum(ISS_L1, ISS_OPPOSITE_L2, "99002");
  const [progressL1, progressL2] = withSatnum(ISS_L1, ISS_L2, "99003");

  const records = [
    { name: "ISS (ZARYA)", l1: ISS_L1, l2: ISS_L2, cat: "stations" },
    { name: "CREW DRAGON 12", l1: dockedL1, l2: dockedL2, cat: "stations" },
    { name: "SOYUZ-MS 30", l1: awayL1, l2: awayL2, cat: "stations" },
    // Mistakenly tagged "stations" upstream — must still be excluded by name.
    { name: "PROGRESS-MS 33", l1: progressL1, l2: progressL2, cat: "stations" },
  ];

  it("tracks only crewed capsules, with correct family/station/phase", () => {
    const snap = buildCapsuleSnapshot(records, FIXED_AT);
    const ids = snap.map((c) => c.id);
    expect(ids).toContain("99001");
    expect(ids).toContain("99002");
    expect(ids).not.toContain("99003"); // cargo, excluded despite cat:"stations"
    expect(ids).not.toContain("25544"); // the hub itself, not a capsule

    const docked = snap.find((c) => c.id === "99001");
    expect(docked.family).toBe("dragon");
    expect(docked.stationKey).toBe("iss");
    expect(docked.phase).toBe("docked");

    const away = snap.find((c) => c.id === "99002");
    expect(away.family).toBe("soyuz");
    expect(away.stationKey).toBe("iss");
    expect(away.phase).toBe("free-flying");
  });

  it("carries the source elset so clients can plot capsules the group feeds miss", () => {
    const snap = buildCapsuleSnapshot(records, FIXED_AT);
    const docked = snap.find((c) => c.id === "99001");
    expect(docked.l1).toBe(dockedL1);
    expect(docked.l2).toBe(dockedL2);
  });

  it("treats a frozen elset as absent — a de-orbited capsule must not be tracked on a ghost orbit", () => {
    const [ghostL1, ghostL2] = withSatnum(ISS_L1, ISS_L2, "99009");
    // epoch pushed back from day 182 to day 170: ~13.5 days before FIXED_AT
    const frozenL1 = ghostL1.replace("26182.50817465", "26170.50817465");
    const snap = buildCapsuleSnapshot(
      [
        { name: "ISS (ZARYA)", l1: ISS_L1, l2: ISS_L2, cat: "stations" },
        { name: "CREW DRAGON 9", l1: frozenL1, l2: ghostL2, cat: "stations" },
      ],
      FIXED_AT
    );
    expect(snap.map((c) => c.id)).not.toContain("99009");
  });
});

describe("advanceCapsuleLog", () => {
  const [capL1, capL2] = withSatnum(ISS_L1, ISS_L2, "99001");
  const snapshot = [
    {
      id: "99001",
      name: "CREW DRAGON 12",
      family: "dragon",
      stationKey: "iss",
      phase: "docked",
      distanceKm: 0.4,
      altitudeKm: 418,
      inclinationDeg: 51.6,
      l1: capL1,
      l2: capL2,
    },
  ];

  it("seeds state with zero events on the first run", () => {
    const { capsules, events } = advanceCapsuleLog({}, snapshot, "2026-07-03T00:00:00.000Z", {
      isFirstRun: true,
    });
    expect(events).toEqual([]);
    expect(capsules["99001"].phase).toBe("docked");
    expect(capsules["99001"].since).toBe("2026-07-03T00:00:00.000Z");
    // the elset rides along so clients can plot capsules the feeds miss
    expect(capsules["99001"].l1).toBe(capL1);
    expect(capsules["99001"].l2).toBe(capL2);
  });

  it("emits a launched event for a newly-seen capsule", () => {
    const { events } = advanceCapsuleLog({}, snapshot, "2026-07-03T00:00:00.000Z");
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("launched");
  });

  it("emits an undocked event on a docked -> free-flying transition", () => {
    const previous = {
      99001: {
        name: "CREW DRAGON 12",
        family: "dragon",
        stationKey: "iss",
        phase: "docked",
        since: "2026-06-01T00:00:00.000Z",
      },
    };
    const flying = [{ ...snapshot[0], phase: "free-flying", distanceKm: 900 }];
    const { capsules, events } = advanceCapsuleLog(previous, flying, "2026-07-03T00:00:00.000Z");
    expect(events[0].event).toBe("undocked");
    expect(capsules["99001"].since).toBe("2026-07-03T00:00:00.000Z");
  });

  it("carries `since` forward when the phase is unchanged", () => {
    const previous = {
      99001: {
        name: "CREW DRAGON 12",
        family: "dragon",
        stationKey: "iss",
        phase: "docked",
        since: "2026-06-01T00:00:00.000Z",
      },
    };
    const { capsules, events } = advanceCapsuleLog(previous, snapshot, "2026-07-03T00:00:00.000Z");
    expect(events).toEqual([]);
    expect(capsules["99001"].since).toBe("2026-06-01T00:00:00.000Z");
  });

  it("marks a disappeared capsule landed, then prunes it after the retention window", () => {
    const previous = {
      99001: {
        name: "CREW DRAGON 12",
        family: "dragon",
        stationKey: "iss",
        phase: "free-flying",
        since: "2026-07-01T00:00:00.000Z",
        l1: capL1,
        l2: capL2,
      },
    };
    const { capsules, events } = advanceCapsuleLog(previous, [], "2026-07-03T00:00:00.000Z");
    expect(events[0].event).toBe("landed");
    expect(capsules["99001"].phase).toBe("landed");
    // nothing plottable may survive landing — a stale elset would render a ghost
    expect(capsules["99001"].l1).toBeUndefined();
    expect(capsules["99001"].l2).toBeUndefined();

    const stale = { 99001: { ...capsules["99001"], since: "2026-01-01T00:00:00.000Z" } };
    const pruned = advanceCapsuleLog(stale, [], "2026-07-03T00:00:00.000Z");
    expect(pruned.capsules["99001"]).toBeUndefined();
    expect(pruned.events).toEqual([]);
  });

  it("treats a capsule returning from landed as a fresh launch, not a stale continuation", () => {
    const previous = {
      99001: {
        name: "CREW DRAGON 12",
        family: "dragon",
        stationKey: "iss",
        phase: "landed",
        since: "2026-06-20T00:00:00.000Z",
        distanceKm: null,
      },
    };
    const { capsules, events } = advanceCapsuleLog(previous, snapshot, "2026-07-03T00:00:00.000Z");
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("launched");
    expect(capsules["99001"].phase).toBe("docked");
    expect(capsules["99001"].since).toBe("2026-07-03T00:00:00.000Z");
    expect(capsules["99001"].l1).toBe(capL1);
  });
});

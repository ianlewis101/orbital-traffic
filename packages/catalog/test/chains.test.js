import { describe, it, expect } from "vitest";
import * as satellite from "satellite.js";
import {
  detectChains,
  meanAltitudeKm,
  MIN_CHAIN_MEMBERS,
  MAX_CHAIN_SPACING_DEG,
} from "../src/chains.js";
import { intlDesignator } from "../src/tle.js";

/**
 * Launch-chain detection. Every case here is one of the four tests
 * detectChains() applies, checked against a catalog built to look like the
 * real one: an operational shell many times larger than the batch under
 * test, since the shell altitude is derived from the category's own median
 * rather than hardcoded.
 */

const EPOCH_YEAR = 2026;
const EPOCH_DAY = 246.5; // 2026-09-03T12:00Z
const NOW = new Date(Date.UTC(EPOCH_YEAR, 0, 1) + (EPOCH_DAY - 1) * 86400000);

/** Mean motion (rev/day) for a circular orbit at this altitude. */
function revsPerDay(altKm) {
  const a = 6371 + altKm;
  const periodSec = 2 * Math.PI * Math.sqrt(a ** 3 / 398600.4418);
  return 86400 / periodSec;
}

const f = (n, width, digits) => n.toFixed(digits).padStart(width, "0");

/** A column-exact TLE pair. satellite.js reads by offset, so this must align. */
function tle({ id, desig, inclDeg = 53.2, raanDeg = 100, argpDeg = 0, mDeg = 0, altKm = 550 }) {
  const satnum = String(id).padStart(5, "0");
  const l1 =
    `1 ${satnum}U ${desig.padEnd(8, " ")} ` +
    `${EPOCH_YEAR - 2000}${f(EPOCH_DAY, 12, 8)}` +
    "  .00000000  00000+0  00000+0 0  9990";
  const l2 =
    `2 ${satnum} ${f(inclDeg, 8, 4)} ${f(raanDeg, 8, 4)} 0001000 ` +
    `${f(argpDeg, 8, 4)} ${f(mDeg, 8, 4)} ${f(revsPerDay(altKm), 11, 8)}    10`;
  return { l1, l2 };
}

function obj({ id, name, cat, ...elements }) {
  const { l1, l2 } = tle({ id, ...elements });
  const rec = satellite.twoline2satrec(l1, l2);
  expect(rec.error).toBe(0);
  return { id: String(id), name, cat, desig: intlDesignator(l1), rec };
}

/** A launch group: `count` objects `spacingDeg` apart along one shared orbit. */
function batch({ startId, desig, count, spacingDeg, altKm, cat = "starlink", raanDeg = 100 }) {
  return Array.from({ length: count }, (_, i) =>
    obj({
      id: startId + i,
      name: `STARLINK-${startId + i}`,
      cat,
      desig,
      altKm,
      raanDeg,
      mDeg: (i * spacingDeg) % 360,
    })
  );
}

/** 40 satellites evenly around a 550 km plane — the operational shell. */
const OPERATIONAL = batch({
  startId: 50000,
  desig: "25100A",
  count: 40,
  spacingDeg: 9,
  altKm: 550,
});

/** A fresh 12-satellite train, 3 degrees apart in a 300 km parking orbit. */
const TRAIN = batch({ startId: 60000, desig: "26196A", count: 12, spacingDeg: 3, altKm: 300 });

describe("meanAltitudeKm", () => {
  it("recovers the altitude a satrec's mean motion implies", () => {
    const [s] = batch({ startId: 70000, desig: "26100A", count: 1, spacingDeg: 0, altKm: 300 });
    expect(meanAltitudeKm(s.rec)).toBeCloseTo(300, 0);
  });

  it("returns null for a satrec with no usable mean motion", () => {
    expect(meanAltitudeKm({ no: 0 })).toBeNull();
    expect(meanAltitudeKm(undefined)).toBeNull();
  });
});

describe("detectChains", () => {
  it("finds a fresh launch train among an operational constellation", () => {
    const chains = detectChains([...OPERATIONAL, ...TRAIN], NOW);
    expect(chains).toHaveLength(1);
    const [c] = chains;
    expect(c.key).toBe("starlink:26196");
    expect(c.launchLabel).toBe("2026-196");
    expect(c.cat).toBe("starlink");
    expect(c.count).toBe(12);
    expect(c.ids).toHaveLength(12);
    expect(c.spacingDeg).toBeCloseTo(3, 0);
    expect(c.arcDeg).toBeCloseTo(33, 0);
    expect(c.altitudeKm).toBeCloseTo(300, 0);
    expect(c.belowShellKm).toBeCloseTo(250, 0);
    expect(c.inclinationDeg).toBeCloseTo(53.2, 1);
  });

  it("orders members along the direction of travel, lead satellite last", () => {
    const [c] = detectChains([...OPERATIONAL, ...TRAIN], NOW);
    // The batch was built with mean anomaly increasing with id, so flight
    // order is id order and the highest id leads.
    expect(c.ids).toEqual(TRAIN.map((s) => s.id));
    expect(c.leadId).toBe(c.ids[c.ids.length - 1]);
    expect(c.leadName).toBe("STARLINK-60011");
  });

  it("reports a physically consistent gap, length and period", () => {
    const [c] = detectChains([...OPERATIONAL, ...TRAIN], NOW);
    const circumference = 2 * Math.PI * (6371 + c.altitudeKm);
    expect(c.spacingKm).toBeCloseTo((c.spacingDeg / 360) * circumference, 3);
    expect(c.lengthKm).toBeCloseTo((c.arcDeg / 360) * circumference, 3);
    expect(c.periodMin).toBeCloseTo(90.5, 0);
    expect(c.spacingSeconds).toBeCloseTo((c.spacingDeg / 360) * c.periodMin * 60, 3);
  });

  it("ignores a batch still at its operational altitude (test 2)", () => {
    // Same tight 3-degree string, but at the shell every other satellite is
    // already on: nothing left to climb, so it isn't a launch train.
    const raised = batch({
      startId: 61000,
      desig: "26197A",
      count: 12,
      spacingDeg: 3,
      altKm: 550,
    });
    expect(detectChains([...OPERATIONAL, ...raised], NOW)).toEqual([]);
  });

  it("ignores an old launch that is low and bunched (test 1)", () => {
    // Retiring satellites descending together are low, coplanar and bunched —
    // everything a train looks like except recent.
    const retiring = batch({
      startId: 62000,
      desig: "20030A",
      count: 12,
      spacingDeg: 3,
      altKm: 300,
    });
    expect(detectChains([...OPERATIONAL, ...retiring], NOW)).toEqual([]);
  });

  it("ignores a batch that has dispersed around its orbit (test 4)", () => {
    const spread = batch({
      startId: 63000,
      desig: "26198A",
      count: 12,
      spacingDeg: MAX_CHAIN_SPACING_DEG + 4,
      altKm: 300,
    });
    expect(detectChains([...OPERATIONAL, ...spread], NOW)).toEqual([]);
  });

  it("drops members that have been walked into another plane (test 3)", () => {
    const moved = TRAIN.slice(0, 3).map((s, i) =>
      obj({
        id: 64000 + i,
        name: `STARLINK-${64000 + i}`,
        cat: "starlink",
        desig: "26196A",
        altKm: 300,
        raanDeg: 130, // 30 degrees of RAAN away — a different plane
        mDeg: i * 3,
      })
    );
    const [c] = detectChains([...OPERATIONAL, ...TRAIN, ...moved], NOW);
    expect(c.count).toBe(12);
    expect(c.ids).not.toContain("64000");
  });

  it("needs more members than a handful of neighbours", () => {
    const few = batch({
      startId: 65000,
      desig: "26199A",
      count: MIN_CHAIN_MEMBERS - 1,
      spacingDeg: 3,
      altKm: 300,
    });
    expect(detectChains([...OPERATIONAL, ...few], NOW)).toEqual([]);
    const enough = batch({
      startId: 66000,
      desig: "26200A",
      count: MIN_CHAIN_MEMBERS,
      spacingDeg: 3,
      altKm: 300,
    });
    expect(detectChains([...OPERATIONAL, ...enough], NOW)).toHaveLength(1);
  });

  it("never forms a chain outside the constellation categories", () => {
    // A debris field from one breakup is coplanar and bunched for months —
    // the strongest "chain" shape in the catalog, and not a launch train.
    const debris = batch({
      startId: 67000,
      desig: "26201A",
      count: 20,
      spacingDeg: 2,
      altKm: 300,
      cat: "debris",
    });
    expect(detectChains([...OPERATIONAL, ...debris], NOW)).toEqual([]);
  });

  it("returns the tightest chain first", () => {
    const looser = batch({
      startId: 68000,
      desig: "26150A",
      count: 12,
      spacingDeg: 6,
      altKm: 320,
      raanDeg: 40,
    });
    const chains = detectChains([...OPERATIONAL, ...looser, ...TRAIN], NOW);
    expect(chains.map((c) => c.key)).toEqual(["starlink:26196", "starlink:26150"]);
  });

  it("skips malformed entries instead of throwing", () => {
    const junk = [
      null,
      { id: "1", name: "no rec", cat: "starlink" },
      { id: "2", name: "no designator", cat: "starlink", rec: TRAIN[0].rec, desig: "" },
    ];
    const chains = detectChains([...junk, ...OPERATIONAL, ...TRAIN], NOW);
    expect(chains).toHaveLength(1);
    expect(chains[0].count).toBe(12);
  });

  it("returns nothing for an empty catalog", () => {
    expect(detectChains([], NOW)).toEqual([]);
  });
});

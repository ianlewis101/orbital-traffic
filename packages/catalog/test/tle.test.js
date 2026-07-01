import { describe, it, expect } from "vitest";
import { parseTle, mergeRecords, noradId } from "../src/index.js";

const ISS_TLE = `ISS (ZARYA)
1 25544U 98067A   26181.86323116  .00005885  00000+0  11296-3 0  9995
2 25544  51.6310 232.3923 0004309 252.2804 107.7714 15.50129012345678`;

const TWO_SATS = `${ISS_TLE}
CZ-4B R/B
1 43012U 17072B   26181.50000000  .00000100  00000+0  10000-3 0  9990
2 43012  98.7000 100.0000 0001000 100.0000 260.0000 14.20000000123456`;

describe("noradId", () => {
  it("extracts the catalog number from line 1", () => {
    expect(noradId("1 25544U 98067A   26181.86323116  .00005885")).toBe("25544");
  });
});

describe("parseTle", () => {
  it("parses name/l1/l2 triplets and classifies them", () => {
    const recs = parseTle(ISS_TLE, "stations");
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ name: "ISS (ZARYA)", cat: "stations" });
    expect(recs[0].l1.startsWith("1 25544U")).toBe(true);
  });

  it("applies the debris backstop regardless of feed category", () => {
    const recs = parseTle(TWO_SATS, "other");
    expect(recs).toHaveLength(2);
    expect(recs[1]).toMatchObject({ name: "CZ-4B R/B", cat: "debris" });
  });

  it("resynchronizes across malformed lines instead of dropping the rest", () => {
    const noisy = "GARBAGE LINE\n" + ISS_TLE + "\nTRAILING JUNK";
    const recs = parseTle(noisy, "stations");
    expect(recs).toHaveLength(1);
    expect(recs[0].name).toBe("ISS (ZARYA)");
  });

  it("handles empty and blank input", () => {
    expect(parseTle("", "other")).toEqual([]);
    expect(parseTle("\n\n\n", "other")).toEqual([]);
  });
});

describe("mergeRecords", () => {
  it("keeps the first (most specific) group's record per NORAD ID", () => {
    const stations = parseTle(ISS_TLE, "stations");
    const active = parseTle(ISS_TLE, "other");
    const merged = mergeRecords([stations, active]);
    expect(merged).toHaveLength(1);
    expect(merged[0].cat).toBe("stations");
  });

  it("unions distinct IDs across groups", () => {
    const a = parseTle(ISS_TLE, "stations");
    const b = parseTle(TWO_SATS, "other");
    const merged = mergeRecords([a, b]);
    expect(merged).toHaveLength(2);
  });
});

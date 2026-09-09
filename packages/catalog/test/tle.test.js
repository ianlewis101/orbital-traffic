import { describe, it, expect } from "vitest";
import * as satellite from "satellite.js";
import {
  parseTle,
  parseGp,
  encodeAlpha5,
  decodeAlpha5,
  mergeRecords,
  noradId,
  tleEpochDate,
  tleAgeDays,
  satrecEpochDate,
  satrecAgeDays,
  intlDesignator,
  launchDesignator,
} from "../src/index.js";

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

describe("intlDesignator / launchDesignator", () => {
  it("extracts the trimmed international designator from line 1", () => {
    expect(intlDesignator("1 25544U 98067A   26181.86323116  .00005885")).toBe("98067A");
  });

  it("drops the per-piece letter for the launch-batch key", () => {
    expect(launchDesignator("1 25544U 98067A   26181.86323116  .00005885")).toBe("98067");
    expect(launchDesignator("1 60002U 26142B   26181.86323116  .00005885")).toBe("26142");
  });

  it("two pieces of the same launch share a launchDesignator but not an intlDesignator", () => {
    const a = "1 60001U 26142A   26181.86323116  .00005885";
    const b = "1 60002U 26142B   26181.86323116  .00005885";
    expect(intlDesignator(a)).not.toBe(intlDesignator(b));
    expect(launchDesignator(a)).toBe(launchDesignator(b));
  });

  it("returns empty/unparsed gracefully for a malformed or short line", () => {
    expect(intlDesignator("")).toBe("");
    expect(intlDesignator("1 25544U")).toBe("");
    expect(launchDesignator("1 25544U")).toBe("");
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

describe("epoch helpers", () => {
  const L1 = "1 25544U 98067A   26181.86323116  .00005885  00000+0  11296-3 0  9995";
  const L2 = "2 25544  51.6310 232.3923 0004309 252.2804 107.7714 15.50129012345678";
  // 2026 day 181.86323116 = June 30, ~20:43 UTC
  const AT = new Date("2026-07-03T00:00:00Z"); // day 184.0

  it("parses the epoch timestamp from line 1", () => {
    const epoch = tleEpochDate(L1);
    expect(epoch.toISOString().startsWith("2026-06-30T20:43")).toBe(true);
  });

  it("computes fractional age in days", () => {
    expect(tleAgeDays(L1, AT)).toBeCloseTo(184 - 181.86323116, 5);
  });

  it("reads the same epoch off a parsed satrec", () => {
    const rec = satellite.twoline2satrec(L1, L2);
    expect(satrecEpochDate(rec).getTime()).toBeCloseTo(tleEpochDate(L1).getTime(), -3);
    expect(satrecAgeDays(rec, AT)).toBeCloseTo(tleAgeDays(L1, AT), 4);
  });

  it("returns null for unparseable input", () => {
    expect(tleEpochDate("garbage")).toBeNull();
    expect(tleAgeDays("garbage")).toBeNull();
    expect(satrecEpochDate(null)).toBeNull();
    expect(satrecAgeDays({}, AT)).toBeNull();
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

/* ---------------------------------------------------------------- *
 * CelesTrak GP (CSV) → TLE
 * ---------------------------------------------------------------- */

// Real CelesTrak rows, captured 2026-07-30. ISS_CSV and ISS_REAL_TLE are the
// same elset served in both formats: synthesizing from the CSV must reproduce
// the TLE byte-for-byte, which is what makes the CSV switch a provable no-op
// for every object the TLE feed already carried.
const CSV_HEADER =
  "OBJECT_NAME,OBJECT_ID,EPOCH,MEAN_MOTION,ECCENTRICITY,INCLINATION,RA_OF_ASC_NODE," +
  "ARG_OF_PERICENTER,MEAN_ANOMALY,EPHEMERIS_TYPE,CLASSIFICATION_TYPE,NORAD_CAT_ID," +
  "ELEMENT_SET_NO,REV_AT_EPOCH,BSTAR,MEAN_MOTION_DOT,MEAN_MOTION_DDOT";

const ISS_CSV = `${CSV_HEADER}
ISS (ZARYA),1998-067A,2026-07-30T20:40:53.573952,15.49272805,.0007096,51.6314,83.9591,355.3737,4.7185,0,U,25544,999,57852,.17005E-3,.9023E-4,0`;

const ISS_REAL_L1 = "1 25544U 98067A   26211.86173118  .00009023  00000+0  17005-3 0  9996";
const ISS_REAL_L2 = "2 25544  51.6314  83.9591 0007096 355.3737   4.7185 15.49272805578527";

// Soyuz MS-29: catalog number 100057, which the fixed-width TLE feed cannot
// represent and therefore omits entirely. This is the object the switch exists
// for — it must classify as a capsule, not vanish.
const SOYUZ_CSV = `${CSV_HEADER}
SOYUZ-MS 29,2026-162A,2026-07-30T03:39:08.864352,15.49259390,.0007078,51.6319,87.4712,352.8836,7.2051,0,U,100057,999,57833,.16539E-3,.8758E-4,0`;

describe("Alpha-5 catalog numbers", () => {
  it("encodes and decodes above 99999, skipping I and O", () => {
    expect(encodeAlpha5(100057)).toBe("A0057");
    expect(decodeAlpha5("A0057")).toBe("100057");
    expect(encodeAlpha5(170000)).toBe("H0000");
    expect(decodeAlpha5("J0000")).toBe("180000"); // I is skipped, so J follows H
    expect(decodeAlpha5(encodeAlpha5(339999))).toBe("339999");
  });

  it("leaves 5-digit numbers alone and zero-pads short ones", () => {
    expect(encodeAlpha5(25544)).toBe("25544");
    expect(encodeAlpha5(900)).toBe("00900");
  });

  it("noradId decodes Alpha-5 but preserves numeric fields verbatim", () => {
    expect(noradId("1 A0057U 26162A   26211.15218593")).toBe("100057");
    // Leading zeros are load-bearing: descriptions.json and capsule-status.json
    // already key on the TLE feed's zero-padded form.
    expect(noradId("1 00900U 64063C   26211.15218593")).toBe("00900");
  });
});

describe("gpToTleLines", () => {
  it("reproduces CelesTrak's own TLE byte-for-byte", () => {
    const [rec] = parseGp(ISS_CSV, "stations");
    expect(rec.l1).toBe(ISS_REAL_L1);
    expect(rec.l2).toBe(ISS_REAL_L2);
  });

  it("emits 69-character lines with valid checksums", () => {
    const [rec] = parseGp(SOYUZ_CSV, "stations");
    const sum = (line) =>
      [...line.slice(0, 68)].reduce((n, c) => n + (c >= "0" && c <= "9" ? +c : c === "-" ? 1 : 0), 0) % 10;
    for (const line of [rec.l1, rec.l2]) {
      expect(line).toHaveLength(69);
      expect(Number(line[68])).toBe(sum(line));
    }
  });

  it("truncates the CSV's 8th eccentricity digit rather than rounding it", () => {
    // CelesTrak's own TLE for 49271 reads 0904965, not 0904966.
    const csv = ISS_CSV.replace(",.0007096,", ",.09049659,");
    expect(parseGp(csv, "other")[0].l2.slice(26, 33)).toBe("0904965");
  });

  it("formats BSTAR and the second derivative in TLE exponent notation", () => {
    const bstar = (v) => parseGp(ISS_CSV.replace(",.17005E-3,", `,${v},`), "other")[0].l1.slice(53, 61);
    expect(bstar(".17005E-3")).toBe(" 17005-3");
    expect(bstar("-.51837E-6")).toBe("-51837-6");
    expect(bstar("0")).toBe(" 00000+0");
    // Rounds on the digit string, not the float: .518375 → 51838, not 51837.
    expect(bstar("-.518375E-6")).toBe("-51838-6");
    // Overflow carries into the exponent: .999995 → .10000 one decade up.
    expect(bstar(".999995E-6")).toBe(" 10000-5");
    // The second derivative shares the same formatter and is usually zero.
    expect(parseGp(ISS_CSV, "other")[0].l1.slice(44, 52)).toBe(" 00000+0");
  });

  it("drops records it cannot render as well-formed lines", () => {
    expect(parseGp(ISS_CSV.replace("2026-07-30T20:40:53.573952", "not-a-date"), "other")).toEqual([]);
  });
});

describe("parseGp", () => {
  it("surfaces a 6-digit object the TLE feed omits, correctly classified", () => {
    const [rec] = parseGp(SOYUZ_CSV, "stations");
    expect(noradId(rec.l1)).toBe("100057");
    expect(rec.name).toBe("SOYUZ-MS 29");
    expect(rec.cat).toBe("capsules");
  });

  it("produces a satrec that propagates", () => {
    const [rec] = parseGp(SOYUZ_CSV, "stations");
    const satrec = satellite.twoline2satrec(rec.l1, rec.l2);
    expect(satrec.error).toBe(0);
    const { position } = satellite.propagate(satrec, new Date("2026-07-30T12:00:00Z"));
    expect(Number.isFinite(position.x)).toBe(true);
    // ~420 km up, so a little over one Earth radius from the geocentre.
    expect(Math.hypot(position.x, position.y, position.z)).toBeGreaterThan(6600);
  });

  it("honours RFC 4180 quoting so commas in names don't shift columns", () => {
    const csv = ISS_CSV.replace("ISS (ZARYA),1998-067A", '"ISS (ZARYA), MODULE 1",1998-067A');
    const [rec] = parseGp(csv, "stations");
    expect(rec.name).toBe("ISS (ZARYA), MODULE 1");
    expect(rec.l1).toBe(ISS_REAL_L1);
  });

  it("skips malformed rows without abandoning the rest of the feed", () => {
    const rows = ISS_CSV.split("\n");
    const csv = [rows[0], "truncated,row", rows[1], "", rows[1].replace("25544", "25545")].join("\n");
    expect(parseGp(csv, "other")).toHaveLength(2);
  });

  it("returns an empty array for empty or header-only input", () => {
    expect(parseGp("", "other")).toEqual([]);
    expect(parseGp(CSV_HEADER, "other")).toEqual([]);
  });
});

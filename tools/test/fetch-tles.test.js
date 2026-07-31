import { describe, it, expect } from "vitest";
import { countWideCatalogNumbers, MIN_WIDE_NORAD_ID } from "../fetch-tles.mjs";
import { parseGp } from "@orbital-traffic/catalog";

/**
 * Guard against a silent regression to CelesTrak's FORMAT=tle.
 *
 * That format's fixed-width satnum field can't express a 6-digit catalog
 * number, and CelesTrak omits those objects entirely rather than erroring — so
 * the fetch still "succeeds", just short of every wide-numbered object. This
 * happened for real: the refresh job that ran on 2026-07-31 at 08:54 UTC used
 * the pre-CSV-fix code (the fix merged at 13:31 UTC the same day) and shipped a
 * satellites.json with zero objects at or above 100000, while CelesTrak was
 * serving 172 of them.
 */

// Real CSV rows: one 5-digit, one 6-digit (the docked Soyuz MS-29).
const CSV_HEADER =
  "OBJECT_NAME,OBJECT_ID,EPOCH,MEAN_MOTION,ECCENTRICITY,INCLINATION,RA_OF_ASC_NODE," +
  "ARG_OF_PERICENTER,MEAN_ANOMALY,EPHEMERIS_TYPE,CLASSIFICATION_TYPE,NORAD_CAT_ID," +
  "ELEMENT_SET_NO,REV_AT_EPOCH,BSTAR,MEAN_MOTION_DOT,MEAN_MOTION_DDOT";
const ISS_ROW =
  "ISS (ZARYA),1998-067A,2026-07-30T03:39:08.864352,15.49259390,.00070788,51.6319," +
  "87.4712,352.8836,7.2051,0,U,25544,999,57833,.16539364E-3,.8758E-4,0";
const SOYUZ_ROW =
  "SOYUZ-MS 29,2026-162A,2026-07-30T03:39:08.864352,15.49259390,.00070788,51.6319," +
  "87.4712,352.8836,7.2051,0,U,100057,999,57833,.16539364E-3,.8758E-4,0";

const parse = (rows) => parseGp([CSV_HEADER, ...rows].join("\n"), "stations");

describe("countWideCatalogNumbers", () => {
  it("counts a 6-digit catalog number parsed from real CSV", () => {
    expect(countWideCatalogNumbers(parse([ISS_ROW, SOYUZ_ROW]))).toBe(1);
  });

  it("returns zero when only 5-digit objects came back — the FORMAT=tle symptom", () => {
    expect(countWideCatalogNumbers(parse([ISS_ROW]))).toBe(0);
  });

  it("counts every wide record, not just the first", () => {
    const second = SOYUZ_ROW.replace("100057", "100058").replace("SOYUZ-MS 29", "STARLINK-38128");
    expect(countWideCatalogNumbers(parse([ISS_ROW, SOYUZ_ROW, second]))).toBe(2);
  });

  it("handles an empty catalog without throwing", () => {
    expect(countWideCatalogNumbers([])).toBe(0);
  });

  it("decodes Alpha-5 rather than reading the raw field as a number", () => {
    // parseGp Alpha-5 encodes 100057 as "A0057" in the TLE line it synthesises.
    // A naive parseInt of that field yields 0 and would miss the object.
    const [rec] = parse([SOYUZ_ROW]);
    expect(rec.l1.slice(2, 7)).toBe("A0057");
    expect(countWideCatalogNumbers([rec])).toBe(1);
  });

  it("uses a threshold the catalog has already passed", () => {
    expect(MIN_WIDE_NORAD_ID).toBe(100000);
  });
});

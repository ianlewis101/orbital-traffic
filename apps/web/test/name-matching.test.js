// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";

/**
 * Guards the space-padding class of name-matching bug.
 *
 * Real catalog names are inconsistently punctuated — "PROGRESS-MS 33",
 * "SOYUZ-MS 29", "HIMAWARI-8", "GSAT-8", "ISS (ZARYA)". A regex written as
 * / PROGRESS / requires a literal space on BOTH sides of the word, so it
 * silently matches zero real objects the moment the catalog hyphenates.
 * Measured against the real 18,755-object bundled catalog, that defect was
 * hiding 40 Indian satellites, 4 Japanese ones, 9 Russian ones, both
 * Progress vehicles' photos, and the two EWS-G GOES birds.
 *
 * Every case below uses the REAL hyphenated/parenthesised catalog form —
 * the old tests only covered forms that already happened to pass, which is
 * exactly why this survived.
 *
 * The counterpart guard also lives here: two Spire cubesats are named
 * "LEMUR-2-HUBBLE-4"/"-5" after the telescope without being it, so the
 * HUBBLE patterns in describe.js/figures.js/info.js must stay space-bounded.
 * Normalizing those would misclassify both objects. See CLAUDE.md.
 */

vi.mock("../src/data/store.js", () => ({
  DATA: { descs: {}, neoDescs: {}, photos: {}, sats: [] },
}));

const { photoKey } = await import("../src/ui/figures.js");
const { inferOwner } = await import("../src/ui/info.js");
const { classify } = await import("../src/ui/describe.js");

const sat = (name, extra = {}) => ({ name, id: "99999", cat: "other", ...extra });

describe("photoKey — hyphenated catalog names", () => {
  it("matches Progress vehicles in their real hyphenated form", () => {
    // Both are in the live catalog right now and were showing a generic SVG
    // while progress.jpg shipped in the bundle unused.
    expect(photoKey(sat("PROGRESS-MS 33"))).toBe("progress");
    expect(photoKey(sat("PROGRESS-MS 34"))).toBe("progress");
  });

  it("matches Soyuz in both hyphenation styles the catalog uses", () => {
    expect(photoKey(sat("SOYUZ-MS 29"))).toBe("soyuz");
    expect(photoKey(sat("SOYUZ MS-29"))).toBe("soyuz");
  });

  it("matches the ISS through its parenthesised name, not just its ID", () => {
    expect(photoKey(sat("ISS (ZARYA)", { id: "99999" }))).toBe("iss");
  });

  it("still matches the forms that already worked", () => {
    expect(photoKey(sat("CREW DRAGON 12"))).toBe("dragon");
    expect(photoKey(sat("CYGNUS NG-24"))).toBe("cygnus");
    expect(photoKey(sat("SHENZHOU-23 (SZ-23)"))).toBe("shenzhou");
    expect(photoKey(sat("TIANZHOU-10"))).toBe("tianzhou");
  });
});

describe("inferOwner — hyphenated catalog names", () => {
  it("resolves Indian satellites (40 were silently unattributed)", () => {
    for (const n of ["GSAT-8", "GSAT-10", "INSAT-3D", "IRNSS-1A", "CARTOSAT-2E"]) {
      expect(inferOwner(sat(n))).toEqual({ code: "IND", name: "India" });
    }
  });

  it("resolves Japanese satellites", () => {
    for (const n of ["HIMAWARI-8", "HIMAWARI-9", "ALOS-2", "ALOS-4 (DAICHI-4)"]) {
      expect(inferOwner(sat(n))).toEqual({ code: "JPN", name: "Japan" });
    }
  });

  it("resolves Russian vehicles and hyphenated series", () => {
    for (const n of ["PROGRESS-MS 33", "SOYUZ-MS 29", "METEOR-M2 3", "RESURS-P 4"]) {
      expect(inferOwner(sat(n))).toEqual({ code: "CIS", name: "Russia" });
    }
  });

  it("resolves GOES birds whose name is parenthesised", () => {
    expect(inferOwner(sat("EWS-G3 (GOES 14)"))).toEqual({ code: "US", name: "United States" });
    expect(inferOwner(sat("EWS-G2 (GOES 15)"))).toEqual({ code: "US", name: "United States" });
  });

  it("keeps GSAT-named Galileo satellites with ESA, never India", () => {
    // "GSAT0101 (GALILEO-PFM)" is an ESA Galileo satellite. The India rule
    // must not swallow it — CLAUDE.md calls this out explicitly.
    expect(inferOwner(sat("GSAT0101 (GALILEO-PFM)"))).toEqual({
      code: "ESA",
      name: "European Space Agency",
    });
  });

  it("does not regress names that already resolved", () => {
    expect(inferOwner(sat("COSMOS 2570"))).toEqual({ code: "CIS", name: "Russia" });
    expect(inferOwner(sat("NAVSTAR 81 (USA 319)"))?.code).toBe("US");
    expect(inferOwner(sat("ISS (ZARYA)"))).toEqual({ code: "ISS", name: "ISS Partners" });
  });

  it("does not let TERRA match TERRASAR-X", () => {
    expect(inferOwner(sat("TERRASAR-X"))).not.toEqual({ code: "US", name: "United States" });
  });
});

describe("LEMUR-2-HUBBLE guard — the deliberate space-bounded exception", () => {
  // Spire Global's commemoratively-named cubesats (NORAD 64565 / 64840),
  // categorised "communications". Making any HUBBLE pattern hyphen-aware
  // would sweep them in. Confirmed against the real catalog.
  const lemurs = [
    sat("LEMUR-2-HUBBLE-4", { id: "64565", cat: "communications" }),
    sat("LEMUR-2-HUBBLE-5", { id: "64840", cat: "communications" }),
  ];

  it("does not classify them as telescopes", () => {
    for (const s of lemurs) {
      expect(classify(s)).not.toBe("telescope");
      expect(classify(s)).toBe("generic");
    }
  });

  it("does not give them the Hubble photo", () => {
    for (const s of lemurs) expect(photoKey(s)).not.toBe("hubble");
  });

  it("does not attribute them via the Hubble owner rule", () => {
    for (const s of lemurs) expect(inferOwner(s)).toBeNull();
  });

  it("still identifies the real Hubble by NORAD ID", () => {
    const hst = sat("HST", { id: "20580", cat: "science" });
    expect(photoKey(hst)).toBe("hubble");
    expect(classify(hst)).toBe("telescope");
  });
});

describe('"HUBBLE 6"/"HUBBLE 7" — real catalog objects that are not the telescope', () => {
  // Two objects in the real catalog are literally named "HUBBLE 6" and
  // "HUBBLE 7" (both cat:"other"). The space-bounded / HUBBLE | HST / pattern
  // in photoKey correctly missed the LEMUR-2-HUBBLE cubesats above but DID
  // match these, so they were shown an unmistakable photo of the actual
  // Hubble Space Telescope. photoKey now matches on NORAD 20580 alone.
  const impostors = [
    sat("HUBBLE 6", { id: "56213", cat: "other" }),
    sat("HUBBLE 7", { id: "56214", cat: "other" }),
  ];

  it("does not give them the Hubble photo", () => {
    for (const s of impostors) expect(photoKey(s)).not.toBe("hubble");
  });

  it("falls them through to the generic science pool instead", () => {
    // They still classify as "telescope" in describe.js — that pattern is the
    // one CLAUDE.md's exception protects and is deliberately left alone — so
    // they land on science_generic. Wrong-ish, but no longer claiming to be
    // Hubble itself, which was the actual bug.
    for (const s of impostors) expect(photoKey(s)).toBe("science_generic");
  });

  it("keeps matching the real Hubble by ID even with an unrelated name", () => {
    expect(photoKey(sat("SOMETHING ELSE", { id: "20580" }))).toBe("hubble");
  });
});

describe("ISS module photos — ZVEZDA / UNITY / DESTINY / POISK", () => {
  // Permanent ISS modules that were missing from describe.js's station
  // pattern, so they fell to the "generic" bucket and drew a NanoRacks
  // CubeSat photo despite carrying cat:"stations". Names are the real
  // catalog forms.
  const modules = [
    sat("ISS (ZVEZDA)", { id: "26400", cat: "stations" }),
    sat("ISS (UNITY)", { id: "25575", cat: "stations" }),
    sat("ISS (DESTINY)", { id: "26700", cat: "stations" }),
    sat("POISK", { id: "36086", cat: "stations" }),
  ];

  it("classifies them as stations", () => {
    for (const s of modules) expect(classify(s)).toBe("station");
  });

  it("gives them the station photo pool, not the generic satellite pool", () => {
    for (const s of modules) expect(photoKey(s)).toBe("station_generic");
  });

  it("does not sweep in the unrelated catalog object named HUNITY", () => {
    // \bUNITY\b must not match inside "HUNITY" — there is no word boundary
    // between H and U. This is the false-positive the \b bounds guard against.
    const hunity = sat("HUNITY", { id: "53807", cat: "other" });
    expect(classify(hunity)).not.toBe("station");
    expect(photoKey(hunity)).not.toBe("station_generic");
  });
});

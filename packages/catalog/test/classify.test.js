import { describe, it, expect } from "vitest";
import {
  categorize,
  correctStationCat,
  correctDebrisCat,
  correctOtherCat,
  isDebrisName,
  isDockedCrewVehicle,
} from "../src/index.js";

describe("correctStationCat", () => {
  it("keeps core crewed-station modules", () => {
    expect(correctStationCat("25544", "ISS (ZARYA)", "stations")).toBe("stations");
    expect(correctStationCat("48274", "CSS (TIANHE)", "stations")).toBe("stations");
  });

  it("keeps currently-docked crewed vehicles by name", () => {
    expect(correctStationCat("99001", "CREW DRAGON 11", "stations")).toBe("stations");
    expect(correctStationCat("99002", "SOYUZ-MS 29", "stations")).toBe("stations");
    expect(correctStationCat("99003", "SHENZHOU-21 (SZ-21)", "stations")).toBe("stations");
  });

  it("demotes cargo vehicles and co-orbiting objects to other", () => {
    expect(correctStationCat("99004", "PROGRESS-MS 32", "stations")).toBe("other");
    expect(correctStationCat("99005", "CYGNUS NG-24", "stations")).toBe("other");
    expect(correctStationCat("99006", "TIANZHOU-9", "stations")).toBe("other");
    expect(correctStationCat("99007", "KNACKSAT-2", "stations")).toBe("other");
  });

  it("never touches non-station categories", () => {
    expect(correctStationCat("99008", "PROGRESS-MS 32", "science")).toBe("science");
  });
});

describe("isDebrisName / correctDebrisCat", () => {
  it("matches rocket bodies and fragments", () => {
    expect(isDebrisName("CZ-4B R/B")).toBe(true);
    expect(isDebrisName("COSMOS 2251 DEB")).toBe(true);
    expect(isDebrisName("SL-16 R/B")).toBe(true);
    expect(isDebrisName("ARIANE 5 R/B")).toBe(true);
  });

  it("matches jettisoned station hardware", () => {
    expect(isDebrisName("ISS OBJECT PP (EP BATTERY)")).toBe(true);
    expect(isDebrisName("SZ-16 MODULE")).toBe(true);
  });

  it("does not match payloads", () => {
    expect(isDebrisName("ISS (ZARYA)")).toBe(false);
    expect(isDebrisName("STARLINK-3042")).toBe(false);
    expect(isDebrisName("PROGRESS-MS 32")).toBe(false);
  });

  it("never overrides hand-curated hero objects", () => {
    expect(correctDebrisCat("SL-16 R/B (COOL PICK)", "cool")).toBe("cool");
  });
});

describe("correctOtherCat", () => {
  it("rescues navigation constellations from the active catch-all", () => {
    expect(correctOtherCat("1", "BEIDOU-2 M3", "other")).toBe("navigation");
    expect(correctOtherCat("2", "GLONASS-M 758", "other")).toBe("navigation");
  });

  it("rescues comms constellations", () => {
    expect(correctOtherCat("3", "IRIDIUM 167", "other")).toBe("communications");
    expect(correctOtherCat("4", "O3B FM23", "other")).toBe("communications");
  });

  it("rescues weather/EO/imaging into science", () => {
    expect(correctOtherCat("5", "SENTINEL-2B", "other")).toBe("science");
    expect(correctOtherCat("6", "GEO-KOMPSAT-2A", "other")).toBe("science");
    expect(correctOtherCat("7", "NOAA 20 (JPSS-1)", "other")).toBe("science");
  });

  it("surfaces military naming schemes as classified", () => {
    expect(correctOtherCat("8", "USA 224", "other")).toBe("classified");
    expect(correctOtherCat("9", "YAOGAN-41", "other")).toBe("classified");
    expect(correctOtherCat("10", "SHIJIAN-21", "other")).toBe("classified");
  });

  it("promotes ISS-deployed cubesats by NORAD ID", () => {
    expect(correctOtherCat("67683", "SOMESAT", "other")).toBe("science");
  });

  it("never reclassifies a record a dedicated group already claimed", () => {
    expect(correctOtherCat("11", "GALILEO 23", "geostationary")).toBe("geostationary");
    expect(correctOtherCat("12", "SENTINEL-6", "starlink")).toBe("starlink");
  });
});

describe("categorize (canonical pipeline)", () => {
  it("applies station allowlist before the debris backstop", () => {
    // arrives under "stations", fails the allowlist, then matches debris
    expect(categorize("99010", "ISS DEB (PANEL)", "stations")).toBe("debris");
  });

  it("station allowlist losers still get the other-rescue", () => {
    // Tianzhou cargo drops to "other" and stays there
    expect(categorize("99011", "TIANZHOU-9", "stations")).toBe("other");
  });

  it("normalizes unknown input categories to other, then rescues", () => {
    expect(categorize("99012", "GPS BIII-7", "not-a-category")).toBe("navigation");
  });

  it("keeps well-formed specific categories untouched", () => {
    expect(categorize("99013", "STARLINK-30042", "starlink")).toBe("starlink");
    expect(categorize("25544", "ISS (ZARYA)", "stations")).toBe("stations");
  });

  it("crewed vehicles keep stations; ISS hardware becomes debris", () => {
    expect(categorize("99014", "SOYUZ-MS 29", "stations")).toBe("stations");
    expect(categorize("99015", "ISS OBJECT KX", "stations")).toBe("debris");
  });
});

describe("isDockedCrewVehicle", () => {
  it("matches crew vehicles, not cargo", () => {
    expect(isDockedCrewVehicle("CREW DRAGON 11")).toBe(true);
    expect(isDockedCrewVehicle("PROGRESS-MS 32")).toBe(false);
  });

  it("matches Starliner", () => {
    expect(isDockedCrewVehicle("CST-100 STARLINER (CALYPSO)")).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import {
  categorize,
  correctStationCat,
  correctStarlinkCat,
  correctDebrisCat,
  correctOtherCat,
  isDebrisName,
  isDockedCrewVehicle,
  isCargoVehicle,
  cargoFamily,
  isStationVehicle,
  vehicleFamily,
  CREW_SEATS_BY_FAMILY,
} from "../src/index.js";

describe("correctStationCat", () => {
  it("keeps core crewed-station modules", () => {
    expect(correctStationCat("25544", "ISS (ZARYA)", "stations")).toBe("stations");
    expect(correctStationCat("48274", "CSS (TIANHE)", "stations")).toBe("stations");
  });

  it("keeps ISS Unity/Zvezda/Destiny — added 2026-07-16, found hidden under other during PR #93's verification", () => {
    expect(correctStationCat("25575", "ISS (UNITY)", "stations")).toBe("stations");
    expect(correctStationCat("26400", "ISS (ZVEZDA)", "stations")).toBe("stations");
    expect(correctStationCat("26700", "ISS (DESTINY)", "stations")).toBe("stations");
  });

  it("moves currently-docked crewed vehicles to capsules by name (audit: capsules split, 2026-07-16)", () => {
    expect(correctStationCat("99001", "CREW DRAGON 11", "stations")).toBe("capsules");
    expect(correctStationCat("99002", "SOYUZ-MS 29", "stations")).toBe("capsules");
    expect(correctStationCat("99003", "SHENZHOU-21 (SZ-21)", "stations")).toBe("capsules");
  });

  it("moves cargo vehicles to capsules too — 2026-07-10 policy (tracked, hidden on landing) still applies, just under the capsules category since 2026-07-16", () => {
    expect(correctStationCat("99004", "PROGRESS-MS 32", "stations")).toBe("capsules");
    expect(correctStationCat("99005", "CYGNUS NG-24", "stations")).toBe("capsules");
    expect(correctStationCat("99006", "TIANZHOU-9", "stations")).toBe("capsules");
    expect(correctStationCat("99009", "DRAGON CRS-33", "stations")).toBe("capsules");
  });

  it("still demotes co-orbiting cubesats and other non-vehicle objects to other", () => {
    expect(correctStationCat("99007", "KNACKSAT-2", "stations")).toBe("other");
  });

  it("never touches non-station categories", () => {
    expect(correctStationCat("99008", "PROGRESS-MS 32", "science")).toBe("science");
  });
});

describe("STATION_CORE_IDS completeness (audit, fixed 2026-07-16)", () => {
  it("resolves ISS Unity/Zvezda/Destiny to stations through the full pipeline, from either entry point", () => {
    expect(categorize("25575", "ISS (UNITY)", "stations")).toBe("stations");
    expect(categorize("26400", "ISS (ZVEZDA)", "other")).toBe("stations");
    expect(categorize("26700", "ISS (DESTINY)", "other")).toBe("stations");
  });
});

describe("stations vs capsules split (2026-07-16)", () => {
  it("only STATION_CORE_IDS permanent structural modules ever carry stations", () => {
    expect(categorize("25544", "ISS (ZARYA)", "stations")).toBe("stations");
    expect(categorize("48274", "CSS (TIANHE)", "stations")).toBe("stations");
  });

  it("no docking vehicle name ever resolves to stations, from either entry point", () => {
    expect(categorize("99018", "CREW DRAGON 14", "stations")).toBe("capsules");
    expect(categorize("99019", "CYGNUS NG-26", "other")).toBe("capsules");
  });

  it("capsules is a real category the pipeline can output as an input tag too, unchanged", () => {
    expect(categorize("99001", "CREW DRAGON 11", "capsules")).toBe("capsules");
  });
});

describe("correctStarlinkCat", () => {
  it("reclassifies OneWeb records still tagged starlink by name (audit F9)", () => {
    expect(correctStarlinkCat("ONEWEB-0012", "starlink")).toBe("oneweb");
    expect(correctStarlinkCat("ONEWEB-0651", "starlink")).toBe("oneweb");
  });

  it("leaves real Starlink records alone", () => {
    expect(correctStarlinkCat("STARLINK-30042", "starlink")).toBe("starlink");
  });

  it("never touches non-starlink categories", () => {
    expect(correctStarlinkCat("ONEWEB-0012", "other")).toBe("other");
    expect(correctStarlinkCat("ONEWEB-0012", "oneweb")).toBe("oneweb");
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
  it("promotes STATION_CORE_IDS modules that arrive tagged other, not just stations (fixed 2026-07-16)", () => {
    // Real catalog data: Unity/Zvezda/Destiny weren't showing up in
    // CelesTrak's actual GROUP=stations feed, so they arrived tagged
    // "other" — correctStationCat() alone never got a chance to apply
    // STATION_CORE_IDS to them, since it only fires for cat === "stations".
    expect(correctOtherCat("25575", "ISS (UNITY)", "other")).toBe("stations");
    expect(correctOtherCat("26400", "ISS (ZVEZDA)", "other")).toBe("stations");
    expect(correctOtherCat("26700", "ISS (DESTINY)", "other")).toBe("stations");
  });

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

  it("rescues LEMUR and MERIDIAN comms series by name", () => {
    expect(correctOtherCat("63262", "LEMUR-2-MARACHE-FRAN", "other")).toBe("communications");
    expect(correctOtherCat("44453", "MERIDIAN 8", "other")).toBe("communications");
  });

  it("rescues Kuiper broadband satellites by name (audit F10)", () => {
    expect(correctOtherCat("13", "KUIPER-00423", "other")).toBe("kuiper");
    expect(correctOtherCat("14", "KUIPER-00008", "other")).toBe("kuiper");
  });

  it("rescues 2026-07-10 curated batch objects by NORAD ID", () => {
    // debris: fragments/test objects named only by international designator
    expect(correctOtherCat("51950", "2022-023E", "other")).toBe("debris");
    expect(correctOtherCat("69320", "GUOWANG TEST OBJECT A", "other")).toBe("debris");
    // communications: one-off relay/messaging sats with no shared pattern
    expect(correctOtherCat("23439", "RADIO ROSTO (RS15)", "other")).toBe("communications");
    expect(correctOtherCat("59072", "MARAFON-D GVM", "other")).toBe("communications");
    // classified: one-off military codename with no recognizable scheme
    expect(correctOtherCat("57757", "BB4", "other")).toBe("classified");
    // science: one-off tech demonstrators / national missions / calibration targets
    for (const id of [
      "01361",
      "31113",
      "35932",
      "40376",
      "40970",
      "41899",
      "43776",
      "44072",
      "44634",
      "53109",
      "54754",
      "56178",
      "57630",
      "58957",
      "60419",
      "63263",
      "65301",
      "66657",
      "67556",
    ]) {
      expect(correctOtherCat(id, "PLACEHOLDER NAME", "other")).toBe("science");
    }
  });

  it("science IDs corrected after an initial ID/description mismatch (GreenCube, IMECE)", () => {
    // 53109 is GREENCUBE (IO-117), not the Vega AVUM stage originally attributed to it
    expect(correctOtherCat("53109", "GREENCUBE (IO-117)", "other")).toBe("science");
    // 56178 is IMECE, not SDA Tranche 0 "CHECKMATE" originally attributed to it
    expect(correctOtherCat("56178", "IMECE", "other")).toBe("science");
  });

  it("does not let the new ID allowlists leak into unrelated IDs", () => {
    expect(correctOtherCat("1", "PLACEHOLDER NAME", "other")).toBe("other");
  });
});

describe("categorize (canonical pipeline)", () => {
  it("applies station allowlist before the debris backstop", () => {
    // arrives under "stations", fails the allowlist, then matches debris
    expect(categorize("99010", "ISS DEB (PANEL)", "stations")).toBe("debris");
  });

  it("cargo vehicles pass the station allowlist into capsules, same as crew vehicles", () => {
    expect(categorize("99011", "TIANZHOU-9", "stations")).toBe("capsules");
  });

  it("normalizes unknown input categories to other, then rescues", () => {
    expect(categorize("99012", "GPS BIII-7", "not-a-category")).toBe("navigation");
  });

  it("keeps well-formed specific categories untouched", () => {
    expect(categorize("99013", "STARLINK-30042", "starlink")).toBe("starlink");
    expect(categorize("25544", "ISS (ZARYA)", "stations")).toBe("stations");
  });

  it("keeps the oneweb group tag distinct from starlink (audit F9)", () => {
    expect(categorize("99016", "ONEWEB-0651", "oneweb")).toBe("oneweb");
  });

  it("reclassifies OneWeb records from stale bundled data still tagged starlink (audit F9)", () => {
    expect(categorize("44057", "ONEWEB-0012", "starlink")).toBe("oneweb");
  });

  it("rescues Kuiper through the full pipeline even without a dedicated group (audit F10)", () => {
    expect(categorize("99017", "KUIPER-00423", "other")).toBe("kuiper");
  });

  it("crewed vehicles become capsules; ISS hardware becomes debris", () => {
    expect(categorize("99014", "SOYUZ-MS 29", "stations")).toBe("capsules");
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

  it("tolerates hyphenated catalog-name variants", () => {
    expect(isDockedCrewVehicle("CREW-DRAGON 13")).toBe(true);
    expect(isDockedCrewVehicle("SOYUZ MS-29")).toBe(true);
    expect(isDockedCrewVehicle("SOYUZ-MS-29")).toBe(true);
    expect(isDockedCrewVehicle("CST-100 (CALYPSO)")).toBe(true);
  });

  it("matches named Dragon crew airframes without the CREW prefix", () => {
    expect(isDockedCrewVehicle("DRAGON ENDEAVOUR")).toBe(true);
    expect(isDockedCrewVehicle("ENDURANCE")).toBe(true);
    expect(isDockedCrewVehicle("DRAGON GRACE")).toBe(true);
  });

  it("matches upcoming crewed vehicles", () => {
    expect(isDockedCrewVehicle("MENGZHOU-1")).toBe(true);
    expect(isDockedCrewVehicle("GAGANYAAN-1")).toBe(true);
    expect(isDockedCrewVehicle("ORION (ARTEMIS II)")).toBe(true);
  });

  it("never matches cargo or crew-lookalike names", () => {
    expect(isDockedCrewVehicle("DRAGON CRS-33")).toBe(false);
    expect(isDockedCrewVehicle("TIANZHOU-10")).toBe(false);
    expect(isDockedCrewVehicle("GRACE-FO 1")).toBe(false);
    expect(isDockedCrewVehicle("DRAGRACER 2 (AUGURY)")).toBe(false);
  });
});

describe("crew/cargo vehicle promotion", () => {
  it("promotes capsules arriving via the generic catch-alls to capsules", () => {
    expect(correctOtherCat("90001", "CREW DRAGON 13", "other")).toBe("capsules");
    expect(categorize("90002", "SOYUZ-MS 29", "other")).toBe("capsules");
    expect(categorize("90003", "SHENZHOU-24 (SZ-24)", "other")).toBe("capsules");
  });

  it("promotes cargo vehicles arriving via the generic catch-alls too", () => {
    expect(categorize("90004", "PROGRESS-MS 34", "other")).toBe("capsules");
    expect(categorize("90005", "DRAGON CRS-33", "other")).toBe("capsules");
    expect(categorize("90009", "CYGNUS NG-25", "other")).toBe("capsules");
    expect(categorize("90010", "TIANZHOU-11", "other")).toBe("capsules");
  });

  it("keeps jettisoned crew hardware in debris — the backstop runs first", () => {
    expect(categorize("90006", "SZ-21 MODULE", "other")).toBe("debris");
    expect(categorize("90007", "SZ-21 MODULE", "stations")).toBe("debris");
  });

  it("leaves crew-lookalike science names alone", () => {
    expect(categorize("90008", "GRACE-FO 1", "other")).toBe("other");
  });
});

describe("isCargoVehicle / cargoFamily", () => {
  it("matches each cargo family", () => {
    expect(isCargoVehicle("PROGRESS-MS 34")).toBe(true);
    expect(isCargoVehicle("CYGNUS NG-24")).toBe(true);
    expect(isCargoVehicle("TIANZHOU-10")).toBe(true);
    expect(isCargoVehicle("DRAGON CRS-33")).toBe(true);
    expect(cargoFamily("PROGRESS-MS 34")).toBe("progress");
    expect(cargoFamily("CYGNUS NG-24")).toBe("cygnus");
    expect(cargoFamily("TIANZHOU-10")).toBe("tianzhou");
    expect(cargoFamily("DRAGON CRS-33")).toBe("dragon-cargo");
  });

  it("never matches crewed vehicles or unrelated names", () => {
    expect(isCargoVehicle("CREW DRAGON 12")).toBe(false);
    expect(isCargoVehicle("DRAGON ENDEAVOUR")).toBe(false);
    expect(isCargoVehicle("SOYUZ-MS 29")).toBe(false);
    expect(isCargoVehicle("STARLINK-30042")).toBe(false);
    expect(cargoFamily("STARLINK-30042")).toBeNull();
  });
});

describe("isStationVehicle / vehicleFamily", () => {
  it("is true for both crew and cargo vehicles", () => {
    expect(isStationVehicle("CREW DRAGON 12")).toBe(true);
    expect(isStationVehicle("SOYUZ-MS 29")).toBe(true);
    expect(isStationVehicle("PROGRESS-MS 34")).toBe(true);
    expect(isStationVehicle("CYGNUS NG-24")).toBe(true);
    expect(isStationVehicle("TIANZHOU-10")).toBe(true);
    expect(isStationVehicle("DRAGON CRS-33")).toBe(true);
  });

  it("is false for station hardware, debris, and unrelated payloads", () => {
    expect(isStationVehicle("ISS (ZARYA)")).toBe(false);
    expect(isStationVehicle("SZ-21 MODULE")).toBe(false);
    expect(isStationVehicle("STARLINK-30042")).toBe(false);
    expect(isStationVehicle("KNACKSAT-2")).toBe(false);
  });

  it("resolves family across both tables without collision", () => {
    expect(vehicleFamily("CREW DRAGON 12")).toBe("dragon");
    expect(vehicleFamily("DRAGON CRS-33")).toBe("dragon-cargo");
    expect(vehicleFamily("CYGNUS NG-24")).toBe("cygnus");
    expect(vehicleFamily("STARLINK-30042")).toBeNull();
  });
});

describe("CREW_SEATS_BY_FAMILY", () => {
  it("maps known crewed families to a typical seat count", () => {
    expect(CREW_SEATS_BY_FAMILY.soyuz).toBe(3);
    expect(CREW_SEATS_BY_FAMILY.dragon).toBe(4);
    expect(CREW_SEATS_BY_FAMILY.shenzhou).toBe(3);
  });

  it("has no entry for unrecognized or cargo families — undefined, not a guessed default", () => {
    expect(CREW_SEATS_BY_FAMILY.starliner).toBeUndefined();
    expect(CREW_SEATS_BY_FAMILY["dragon-cargo"]).toBeUndefined();
    expect(CREW_SEATS_BY_FAMILY.cygnus).toBeUndefined();
  });
});

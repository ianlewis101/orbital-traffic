import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchAndRenderCrew } from "../src/ui/crew.js";
import { state } from "../src/state.js";

/**
 * fetchAndRenderCrew()'s roster-plausibility check is a stopgap against
 * Open Notify serving a stale/wrong roster (found 2026-07-20 to be serving
 * names ~18 months out of date). It compares Open Notify's headcount
 * against how many seats are docked at the selection's station right now,
 * per state.capsulesData — it has no notion of *who* should be aboard, only
 * how many, so these tests exercise the seat-comparison logic itself, not
 * the (undetectable, by design) name-staleness case.
 *
 * Selections use the CSS/Tiangong hub (48274) rather than the ISS
 * (25544) so tests don't also have to stub a /today fetch — 25544 is one
 * of ISS_TODAY_IDS, 48274 is not.
 */

function stubEl() {
  return { style: {}, innerHTML: "" };
}

let el;
beforeEach(() => {
  el = stubEl();
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("document", { querySelector: () => el });
});
afterEach(() => {
  vi.unstubAllGlobals();
  state.selected = null;
  state.capsulesData = null;
});

const CSS_HUB = { id: "48274", name: "CSS (TIANHE)", cat: "stations" };

function crewResponse(people, extra = {}) {
  return new Response(JSON.stringify({ people, number: people.length, ok: true, ...extra }));
}

describe("fetchAndRenderCrew — roster plausibility check", () => {
  it("flags a roster reporting crew when no crewed vehicle is docked at this station", async () => {
    state.selected = CSS_HUB;
    state.capsulesData = {};
    fetch.mockResolvedValue(crewResponse([{ name: "A. Astronaut", craft: "Tiangong" }]));

    await fetchAndRenderCrew(CSS_HUB);

    expect(el.innerHTML).toContain("Roster may not reflect the current crew");
    // Caveat, not an error state — the roster itself still renders.
    expect(el.innerHTML).toContain("Astronaut");
  });

  it("flags a roster reporting nobody when a crewed vehicle is docked", async () => {
    state.selected = CSS_HUB;
    state.capsulesData = {
      70001: { kind: "crew", phase: "docked", stationKey: "css", name: "SHENZHOU-23 (SZ-23)" },
    };
    fetch.mockResolvedValue(crewResponse([]));

    await fetchAndRenderCrew(CSS_HUB);

    expect(el.innerHTML).toContain("Roster may not reflect the current crew");
  });

  it("does not flag when actual crew exceeds expected seats (handover overlap)", async () => {
    state.selected = CSS_HUB;
    state.capsulesData = {
      70001: { kind: "crew", phase: "docked", stationKey: "css", name: "SHENZHOU-23 (SZ-23)" }, // shenzhou: 3 seats
    };
    fetch.mockResolvedValue(
      crewResponse([
        { name: "One", craft: "Tiangong" },
        { name: "Two", craft: "Tiangong" },
        { name: "Three", craft: "Tiangong" },
        { name: "Four", craft: "Tiangong" },
      ])
    );

    await fetchAndRenderCrew(CSS_HUB);

    expect(el.innerHTML).not.toContain("Roster may not reflect the current crew");
  });

  it("flags an undercount beyond the 1-person tolerance", async () => {
    state.selected = CSS_HUB;
    state.capsulesData = {
      70001: { kind: "crew", phase: "docked", stationKey: "css", name: "SHENZHOU-23 (SZ-23)" }, // 3 seats
    };
    fetch.mockResolvedValue(crewResponse([{ name: "Solo", craft: "Tiangong" }])); // actual 1 < 3-1

    await fetchAndRenderCrew(CSS_HUB);

    expect(el.innerHTML).toContain("Roster may not reflect the current crew");
  });

  it("stays within the 1-person tolerance without flagging", async () => {
    state.selected = CSS_HUB;
    state.capsulesData = {
      70001: { kind: "crew", phase: "docked", stationKey: "css", name: "SHENZHOU-23 (SZ-23)" }, // 3 seats
    };
    fetch.mockResolvedValue(
      crewResponse([
        { name: "One", craft: "Tiangong" },
        { name: "Two", craft: "Tiangong" },
      ]) // actual 2 === expected(3) - 1, within tolerance
    );

    await fetchAndRenderCrew(CSS_HUB);

    expect(el.innerHTML).not.toContain("Roster may not reflect the current crew");
  });

  it("does not flag purely because a docked vehicle's family is unrecognized", async () => {
    state.selected = CSS_HUB;
    state.capsulesData = {
      // "starliner" has no CREW_SEATS_BY_FAMILY entry — expected seats from
      // this vehicle can't be counted, so it must not be treated as 0.
      60000: { kind: "crew", phase: "docked", stationKey: "css", name: "STARLINER-1" },
    };
    fetch.mockResolvedValue(
      crewResponse([
        { name: "One", craft: "Tiangong" },
        { name: "Two", craft: "Tiangong" },
        { name: "Three", craft: "Tiangong" },
        { name: "Four", craft: "Tiangong" },
      ])
    );

    await fetchAndRenderCrew(CSS_HUB);

    expect(el.innerHTML).not.toContain("Roster may not reflect the current crew");
  });

  it("never flags when the crew fetch itself failed", async () => {
    state.selected = CSS_HUB;
    state.capsulesData = {
      70001: { kind: "crew", phase: "docked", stationKey: "css", name: "SHENZHOU-23 (SZ-23)" },
    };
    fetch.mockRejectedValue(new Error("down"));

    await fetchAndRenderCrew(CSS_HUB);

    expect(el.innerHTML).not.toContain("Roster may not reflect the current crew");
    expect(el.innerHTML).toContain("Crew data temporarily unavailable");
  });

  it("never flags when capsule-status data hasn't loaded yet", async () => {
    state.selected = CSS_HUB;
    state.capsulesData = null;
    fetch.mockResolvedValue(crewResponse([]));

    await fetchAndRenderCrew(CSS_HUB);

    expect(el.innerHTML).not.toContain("Roster may not reflect the current crew");
  });
});

describe("fetchAndRenderCrew — possiblyIncomplete caveat (LL2 supplementary check)", () => {
  it("shows the caveat when the worker flags possiblyIncomplete", async () => {
    state.selected = CSS_HUB;
    state.capsulesData = null; // isolate from the plausibility check above
    fetch.mockResolvedValue(
      crewResponse([{ name: "One", craft: "Tiangong" }], { possiblyIncomplete: true })
    );

    await fetchAndRenderCrew(CSS_HUB);

    expect(el.innerHTML).toContain("There may be additional crew not reflected yet");
  });

  it("does not show the caveat when possiblyIncomplete is false or absent", async () => {
    state.selected = CSS_HUB;
    state.capsulesData = null;
    fetch.mockResolvedValue(crewResponse([{ name: "One", craft: "Tiangong" }]));

    await fetchAndRenderCrew(CSS_HUB);

    expect(el.innerHTML).not.toContain("There may be additional crew not reflected yet");
  });

  it("never shows the caveat when the crew fetch itself failed", async () => {
    state.selected = CSS_HUB;
    state.capsulesData = null;
    fetch.mockRejectedValue(new Error("down"));

    await fetchAndRenderCrew(CSS_HUB);

    expect(el.innerHTML).not.toContain("There may be additional crew not reflected yet");
  });

  it("renders both caveats together when they aren't mutually exclusive", async () => {
    state.selected = CSS_HUB;
    // Both the plausibility check (PR #109) and possiblyIncomplete (this
    // PR) can trigger from the same response — they're independent signals.
    state.capsulesData = {
      70001: { kind: "crew", phase: "docked", stationKey: "css", name: "SHENZHOU-23 (SZ-23)" }, // 3 seats
    };
    fetch.mockResolvedValue(
      crewResponse([{ name: "Solo", craft: "Tiangong" }], { possiblyIncomplete: true }) // actual 1 < 3-1
    );

    await fetchAndRenderCrew(CSS_HUB);

    expect(el.innerHTML).toContain("Roster may not reflect the current crew");
    expect(el.innerHTML).toContain("There may be additional crew not reflected yet");
  });
});

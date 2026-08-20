import { describe, it, expect } from "vitest";
import { diffLaunchesReentries, diffCrewRoster } from "../src/events.js";

const NOW = "2026-08-20T06:00:00.000Z";

function rec(name, id, cat, designator = "26999A") {
  const satnum = id.padStart(5, "0");
  const l1 = `1 ${satnum}U ${designator.padEnd(8, " ")} 26230.82443714  .00008426  00000+0  15812-3 0  9995`;
  return { name, l1, l2: "2 " + satnum, cat };
}

describe("diffLaunchesReentries", () => {
  it("reports no events when nothing changed", () => {
    const prev = [rec("ISS (ZARYA)", "25544", "stations", "98067A")];
    expect(diffLaunchesReentries(prev, prev, NOW)).toEqual([]);
  });

  it("groups new objects from the same launch into one event", () => {
    const prev = [rec("ISS (ZARYA)", "25544", "stations", "98067A")];
    const curr = [
      ...prev,
      rec("STARLINK-31001", "60001", "starlink", "26142A"),
      rec("STARLINK-31002", "60002", "starlink", "26142B"),
      rec("STARLINK-31003", "60003", "starlink", "26142C"),
    ];
    const events = diffLaunchesReentries(prev, curr, NOW);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "launch",
      count: 3,
      name: "STARLINK-31001",
      cat: "starlink",
    });
    expect(events[0].ids.sort()).toEqual(["60001", "60002", "60003"]);
  });

  it("keeps unrelated launches (different designator) as separate events", () => {
    const prev = [];
    const curr = [
      rec("STARLINK-31001", "60001", "starlink", "26142A"),
      rec("ONEWEB-0500", "60002", "oneweb", "26143A"),
    ];
    const events = diffLaunchesReentries(prev, curr, NOW);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.count).sort()).toEqual([1, 1]);
  });

  it("reports a re-entry for an object present yesterday and gone today", () => {
    const prev = [
      rec("ISS (ZARYA)", "25544", "stations", "98067A"),
      rec("COSMOS 2589", "70001", "debris", "24001A"),
    ];
    const curr = [prev[0]];
    const events = diffLaunchesReentries(prev, curr, NOW);
    expect(events).toEqual([
      { type: "reentry", at: NOW, id: "70001", name: "COSMOS 2589", cat: "debris" },
    ]);
  });

  it("excludes capsules-category records from both launch and reentry diffing", () => {
    const prev = [rec("CREW DRAGON 12", "80001", "capsules", "26140A")];
    const curr = []; // "gone" — but it's a capsule, so advanceCapsuleLog owns this story
    expect(diffLaunchesReentries(prev, curr, NOW)).toEqual([]);

    const prev2 = [];
    const curr2 = [rec("CREW DRAGON 13", "80002", "capsules", "26150A")];
    expect(diffLaunchesReentries(prev2, curr2, NOW)).toEqual([]);
  });

  it("handles a fully empty previous catalog (first run) without treating it as a mass re-entry", () => {
    const curr = [rec("ISS (ZARYA)", "25544", "stations", "98067A")];
    // Diffing against [] on purpose reports every current object as "new" —
    // callers (fetch-tles.mjs) are responsible for skipping the diff
    // entirely on a genuine first run, same as advanceCapsuleLog's
    // isFirstRun guard. This test just documents that this function itself
    // does no such guarding.
    const events = diffLaunchesReentries([], curr, NOW);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("launch");
  });
});

describe("diffCrewRoster", () => {
  it("reports no events when the roster is unchanged", () => {
    const roster = [{ id: 1, name: "Alice", craft: "ISS" }];
    const { events } = diffCrewRoster(roster, roster, NOW);
    expect(events).toEqual([]);
  });

  it("reports an arrival for a new person", () => {
    const prev = [{ id: 1, name: "Alice", craft: "ISS" }];
    const fresh = [...prev, { id: 2, name: "Bob", craft: "ISS" }];
    const { events, roster } = diffCrewRoster(prev, fresh, NOW);
    expect(events).toEqual([
      { type: "crew", at: NOW, id: 2, name: "Bob", craft: "ISS", direction: "arrived" },
    ]);
    expect(roster).toEqual(fresh);
  });

  it("reports a departure for a person no longer listed", () => {
    const prev = [
      { id: 1, name: "Alice", craft: "ISS" },
      { id: 2, name: "Bob", craft: "ISS" },
    ];
    const fresh = [prev[0]];
    const { events } = diffCrewRoster(prev, fresh, NOW);
    expect(events).toEqual([
      { type: "crew", at: NOW, id: 2, name: "Bob", craft: "ISS", direction: "departed" },
    ]);
  });

  it("falls back to matching by name when id is null, same as the Worker's own dedupe", () => {
    const prev = [{ id: null, name: "Guest Cosmonaut", craft: "Tiangong" }];
    const fresh = [{ id: null, name: "Guest Cosmonaut", craft: "Tiangong" }];
    const { events } = diffCrewRoster(prev, fresh, NOW);
    expect(events).toEqual([]);
  });

  it("reports both an arrival and a departure in the same diff (handover)", () => {
    const prev = [{ id: 1, name: "Alice", craft: "ISS" }];
    const fresh = [{ id: 2, name: "Bob", craft: "ISS" }];
    const { events } = diffCrewRoster(prev, fresh, NOW);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.direction).sort()).toEqual(["arrived", "departed"]);
  });
});

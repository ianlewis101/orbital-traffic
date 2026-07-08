import { describe, it, expect } from "vitest";
import neos from "../public/data/neos.json";
import descriptions from "../public/data/neo-descriptions.json";

describe("NEO description/data consistency", () => {
  it("every described NEO actually appears in the plotted dataset", () => {
    const plottedNames = new Set(neos.map((n) => n.name));
    const orphaned = Object.keys(descriptions).filter((name) => !plottedNames.has(name));
    expect(orphaned).toEqual([]);
  });
});

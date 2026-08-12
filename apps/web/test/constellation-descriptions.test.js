// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import satellites from "../public/data/satellites.json";

/**
 * Starlink, Kuiper and OneWeb are the three categories where a per-object
 * curated entry in descriptions.json will never exist — together they are
 * roughly two-thirds of the whole catalog, and none of the ~12,000 members
 * has (or will get) its own write-up. Each constellation therefore gets one
 * universal description that must reach EVERY member.
 *
 * The failure this guards is silent: a Kuiper satellite whose name pattern
 * or category check is missed doesn't error, it just falls through
 * describe()'s switch to the "A satellite in Earth orbit" default — the info
 * card still looks fine, it's just useless. Kuiper sat in exactly that state
 * until this description was added.
 */

vi.mock("../src/data/store.js", () => ({
  DATA: { descs: {}, neoDescs: {}, photos: {}, sats: [] },
}));

const { describe: describeSat, classify } = await import("../src/ui/describe.js");

const GENERIC =
  "A satellite in Earth orbit, catalogued by the world's space-surveillance networks.";
const sat = (name, cat, extra = {}) => ({ name, id: "99999", cat, ...extra });

describe("universal constellation descriptions", () => {
  it("every bundled Starlink, Kuiper and OneWeb object gets its constellation text", () => {
    const expected = {
      starlink: "Starlink broadband satellites",
      kuiper: "Kuiper broadband satellites",
      oneweb: "A OneWeb satellite",
    };
    const missed = [];
    for (const s of satellites) {
      const want = expected[s.cat];
      if (!want) continue;
      const text = describeSat({ ...s, id: s.id || "0" });
      if (!text.includes(want)) missed.push(`${s.name} (${s.cat}): ${text.slice(0, 60)}`);
    }
    expect(missed).toEqual([]);
  });

  it("matches on category alone, not just the name", () => {
    // Records can arrive with a name the pattern doesn't cover (early Starlink
    // prototypes were named TINTIN A/B) — the category check is the backstop.
    expect(describeSat(sat("TINTIN A", "starlink"))).toContain("Starlink");
    expect(describeSat(sat("UNNAMED", "kuiper"))).toContain("Kuiper");
  });

  it("matches on name alone, not just the category", () => {
    // ...and vice versa: a record that arrives mis-tagged still reads right.
    expect(describeSat(sat("KUIPER-00008", "other"))).toContain("Kuiper");
    expect(describeSat(sat("STARLINK-1008", "other"))).toContain("Starlink");
  });

  it("gives a OneWeb record tagged cat:'starlink' the OneWeb text", () => {
    // Bundled data predating the groups.js fix still tags OneWeb "starlink"
    // (see CLAUDE.md) — OneWeb must be checked before Starlink, or every one
    // of those records claims to be a SpaceX satellite.
    expect(describeSat(sat("ONEWEB-0012", "starlink"))).toContain("OneWeb");
  });

  it("none of the three falls through to the generic satellite description", () => {
    for (const s of [
      sat("STARLINK-1008", "starlink"),
      sat("KUIPER-00008", "kuiper"),
      sat("ONEWEB-0012", "oneweb"),
    ])
      expect(describeSat(s)).not.toBe(GENERIC);
  });

  it("classifies Kuiper as the flat-panel constellation bus for artwork", () => {
    // figures.js draws its procedural flat-panel SVG for this display type.
    // As "generic" (the pre-fix behaviour) Kuiper drew a photo from the
    // satellite_generic cubesat pool instead.
    expect(classify(sat("KUIPER-00008", "kuiper"))).toBe("starlink");
    expect(classify(sat("KUIPER-00008", "other"))).toBe("starlink");
  });
});

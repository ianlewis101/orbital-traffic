import { describe, it, expect } from "vitest";
import {
  SHARE_W,
  SHARE_H,
  SSAA,
  wrapLines,
  fitFontSize,
  formatDesignation,
  shareFilename,
} from "../src/share/layout.js";

/**
 * jsdom has no canvas 2D implementation (the optional `canvas` package isn't
 * installed), so the drawing itself can only be checked visually in a real
 * browser. These cover the arithmetic and text fitting underneath it, which
 * would otherwise regress silently.
 */

// A stand-in for ctx.measureText: every character is 10 units wide.
const measure = (t) => t.length * 10;

describe("share card geometry", () => {
  it("is 4:5 portrait", () => {
    expect(SHARE_W / SHARE_H).toBeCloseTo(0.8, 10);
  });

  it("supersamples the WebGL pass", () => {
    expect(SSAA).toBeGreaterThanOrEqual(2);
  });
});

describe("wrapLines", () => {
  it("returns nothing for empty input", () => {
    expect(wrapLines("", 100, measure)).toEqual([]);
    expect(wrapLines(null, 100, measure)).toEqual([]);
    expect(wrapLines("   ", 100, measure)).toEqual([]);
  });

  it("keeps text that fits on one line", () => {
    expect(wrapLines("ab cd", 100, measure)).toEqual(["ab cd"]);
  });

  it("wraps on width", () => {
    // "aaa bbb ccc" = 11 chars = 110 units; limit 70 forces a break.
    const lines = wrapLines("aaa bbb ccc", 70, measure, 5);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(measure(l)).toBeLessThanOrEqual(70);
  });

  it("caps at maxLines and ellipsises the last one", () => {
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
    const lines = wrapLines(long, 100, measure, 3);
    expect(lines).toHaveLength(3);
    expect(lines[2].endsWith("…")).toBe(true);
  });

  it("keeps the ellipsised line within the width budget", () => {
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
    const lines = wrapLines(long, 100, measure, 3);
    expect(measure(lines[2])).toBeLessThanOrEqual(100);
  });

  it("does not ellipsise when the text exactly fills the cap", () => {
    const lines = wrapLines("aaaa bbbb", 45, measure, 2);
    expect(lines).toEqual(["aaaa", "bbbb"]);
    expect(lines.some((l) => l.endsWith("…"))).toBe(false);
  });

  it("does not drop a single word longer than the line", () => {
    const lines = wrapLines("supercalifragilistic", 50, measure, 3);
    expect(lines).toEqual(["supercalifragilistic"]);
  });
});

describe("fitFontSize", () => {
  it("keeps the starting size when it already fits", () => {
    expect(fitFontSize(() => 10, 100, 66, 34)).toBe(66);
  });

  it("shrinks until it fits", () => {
    // width scales with size; fits once size <= 50
    const size = fitFontSize((s) => s * 2, 100, 66, 34);
    expect(size).toBeLessThanOrEqual(50);
    expect(size).toBeGreaterThanOrEqual(34);
  });

  it("never goes below the floor", () => {
    expect(fitFontSize(() => 9999, 100, 66, 34)).toBe(34);
  });
});

describe("formatDesignation", () => {
  it("expands a 20xx international designator", () => {
    expect(formatDesignation("69792", "26152A")).toBe("NORAD 69792  ·  INT'L 2026-152A");
  });

  it("expands a 19xx international designator", () => {
    expect(formatDesignation("25544", "98067A")).toBe("NORAD 25544  ·  INT'L 1998-067A");
  });

  it("falls back to the raw designator when it is not the 5-digit form", () => {
    expect(formatDesignation("123", "WEIRD")).toBe("NORAD 123  ·  INT'L WEIRD");
  });

  it("omits the designator entirely when absent", () => {
    expect(formatDesignation("123", "")).toBe("NORAD 123");
    expect(formatDesignation("123", null)).toBe("NORAD 123");
    expect(formatDesignation("123", "   ")).toBe("NORAD 123");
  });
});

describe("shareFilename", () => {
  it("slugifies the object name", () => {
    expect(shareFilename("ISS (ZARYA)")).toBe("orbital-traffic-iss-zarya.png");
    expect(shareFilename("STARLINK-30042")).toBe("orbital-traffic-starlink-30042.png");
    expect(shareFilename("LINK")).toBe("orbital-traffic-link.png");
  });

  it("falls back for empty or punctuation-only names", () => {
    expect(shareFilename("")).toBe("orbital-traffic-object.png");
    expect(shareFilename("///")).toBe("orbital-traffic-object.png");
    expect(shareFilename(null)).toBe("orbital-traffic-object.png");
  });
});

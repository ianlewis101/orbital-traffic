import { describe, it, expect } from "vitest";
import { esc } from "../src/util/html.js";

describe("esc", () => {
  it("escapes all five HTML-significant characters", () => {
    expect(esc("&")).toBe("&amp;");
    expect(esc("<")).toBe("&lt;");
    expect(esc(">")).toBe("&gt;");
    expect(esc('"')).toBe("&quot;");
    expect(esc("'")).toBe("&#39;");
  });

  it("neutralizes a script-injection attempt", () => {
    expect(esc('<img src=x onerror="alert(1)">')).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"
    );
  });

  it("escapes & before the entities it introduces (no double-escaping)", () => {
    // A literal "<" must become "&lt;", not "&amp;lt;".
    expect(esc("a<b")).toBe("a&lt;b");
    expect(esc("Q&A")).toBe("Q&amp;A");
  });

  it("coerces non-strings and leaves safe text untouched", () => {
    expect(esc(42)).toBe("42");
    expect(esc("ISS (ZARYA)")).toBe("ISS (ZARYA)");
  });
});

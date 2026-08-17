import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The "how many objects does this track" marketing figure has one derived
 * source and several hand-written copies (see CLAUDE.md's OBJECT COUNT
 * convention). The derived one — the splash screen and the welcome page — comes
 * from vite.config.js rounding the real length of satellites.json down to the
 * nearest thousand. The hand-written ones are README.md, manifest.json and the
 * App Store listing copy in docs/archive/store-metadata.md.
 *
 * Nothing enforced that they agreed, and the catalog crosses a thousand
 * boundary on its own, unattended: the daily TLE-refresh workflow commits a new
 * satellites.json, which rebuilds the site with a new derived figure while
 * every hand-written surface keeps the old one. At the time this test was
 * written the catalog held 18,997 objects — three short of flipping the splash
 * to "19,000+" while the App Store description still said 18,000.
 *
 * So this test asserts the invariant rather than any particular number: every
 * rounded-thousands figure written anywhere in those three files must equal
 * whatever the catalog currently derives. When the catalog does cross, this
 * fails and names the files to update, instead of the mismatch shipping.
 */

const root = new URL("../../../", import.meta.url);
const read = (p) => readFileSync(fileURLToPath(new URL(p, root)), "utf8");

/** Mirrors vite.config.js exactly — if that changes, change this with it. */
function derivedCount() {
  const sats = JSON.parse(read("apps/web/public/data/satellites.json"));
  return (Math.floor(sats.length / 1000) * 1000).toLocaleString("en-US");
}

/**
 * Marketing figures are written as "18,000" or "18,000+". The leading
 * (?<![\d,]) keeps this from matching the tail of a larger number such as
 * "200,000", which is an unrelated figure in the same prose.
 */
const THOUSANDS_RE = /(?<![\d,])\d{2},000/g;

const SURFACES = ["README.md", "apps/web/public/manifest.json", "docs/archive/store-metadata.md"];

describe("object count stays in sync across hand-written surfaces", () => {
  it("derives a figure from the real bundled catalog", () => {
    expect(derivedCount()).toMatch(/^\d{2},000$/);
  });

  it.each(SURFACES)("%s quotes only the current derived figure", (file) => {
    const expected = derivedCount();
    const found = [...read(file).matchAll(THOUSANDS_RE)].map((m) => m[0]);

    // Every surface is supposed to mention it at least once; a zero here means
    // the mention was renamed or dropped and this guard silently stopped
    // guarding anything.
    expect(found.length, `${file} no longer mentions an object count at all`).toBeGreaterThan(0);

    for (const value of found) {
      expect(
        value,
        `${file} says "${value}" but the catalog now derives "${expected}" — ` +
          `update every surface in CLAUDE.md's OBJECT COUNT checklist together`
      ).toBe(expected);
    }
  });
});

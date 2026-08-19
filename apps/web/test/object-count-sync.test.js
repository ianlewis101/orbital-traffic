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

/**
 * HTML entry points must never hand-write the figure: index.html's splash
 * gets it from __OBJECT_COUNT__ at runtime, and welcome.html's markup and
 * <meta> tags get it substituted at build time from the {{OBJECT_COUNT}}
 * token (see vite.config.js's transformIndexHtml plugin). Either way the
 * correct number of literal figures in them is zero.
 *
 * welcome.html shipped five of them — it was added after the convention was
 * written and landed in neither SURFACES nor CLAUDE.md's checklist, so
 * nothing caught it. Asserting zero here is what makes that miss impossible
 * on the next page too.
 */
const DERIVED_HTML = ["apps/web/welcome.html", "apps/web/index.html"];
const OBJECT_COUNT_TOKEN = "{{OBJECT_COUNT}}";

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

  it.each(DERIVED_HTML)("%s hand-writes no object count at all", (file) => {
    const found = [...read(file).matchAll(THOUSANDS_RE)].map((m) => m[0]);
    expect(
      found,
      `${file} hand-writes ${found.join(", ")} — HTML entry points must derive the ` +
        `figure instead: use the ${OBJECT_COUNT_TOKEN} token (substituted at build ` +
        `time by vite.config.js) or __OBJECT_COUNT__ from JS`
    ).toEqual([]);
  });

  it("welcome.html still carries the token it derives the figure from", () => {
    // Guards the other direction: deleting the token would make the test above
    // pass while quietly dropping the figure from the page.
    expect(read("apps/web/welcome.html")).toContain(OBJECT_COUNT_TOKEN);
  });

  it("the build substitutes the token rather than shipping it literally", () => {
    // The token is only correct if something replaces it. Mirrors the plugin in
    // vite.config.js so a rename there fails here instead of publishing
    // "{{OBJECT_COUNT}} objects" to real visitors.
    const rendered = read("apps/web/welcome.html").replaceAll(OBJECT_COUNT_TOKEN, derivedCount());
    expect(rendered).not.toContain(OBJECT_COUNT_TOKEN);
    expect(rendered).toContain(derivedCount());
  });
});

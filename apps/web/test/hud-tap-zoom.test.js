import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Reported 2026-09-15 with a screen recording: tapping down the Orbit Classes
 * list at a normal pace zoomed the whole page in, and a second double-tap only
 * sometimes undid it. That is iOS Safari/WKWebView's double-tap-to-zoom — the
 * page scaled to fit the tapped plate, which is why the recording shows the
 * legend blown up to the full viewport width while the iOS status bar above it
 * stayed put (a DOM zoom, not the Three.js camera). The "sometimes it doesn't
 * go back" half is the same gesture: a double-tap landing on a different
 * element re-zooms to fit that one instead of zooming out.
 *
 * Two things make the legend the easy place to hit it. The rows are dense on
 * purpose (~94x17 — see the density note in app.css's mobile block, a
 * deliberate 2026-08-19 revert), so two ADJACENT rows' centres sit inside
 * Safari's double-tap slop radius: the user never has to tap the same row
 * twice, which is why it reads as "clicked a category too quick". And `.cat`
 * was the one tappable control in the app that had never been given
 * `touch-action:manipulation`, which every other one carries.
 *
 * A CSS rule that is present but matches nothing would look identical to a fix
 * here, so these tests only pin the declarations; controls-a11y.test.js pins
 * the other end, that `.cat` and `.today-row` are really the class names the
 * legend and hotlist render.
 *
 * The last test pins what the fix must NOT be. Killing double-tap zoom by
 * disabling user scaling in the viewport meta would also work, and would take
 * deliberate pinch-to-zoom away with it (WCAG 1.4.4).
 */

const root = new URL("../../../", import.meta.url);
const read = (p) => readFileSync(fileURLToPath(new URL(p, root)), "utf8");

const css = read("apps/web/src/styles/app.css").replace(/\/\*[\s\S]*?\*\//g, "");
const indexHtml = read("apps/web/index.html");

/**
 * Every declaration block in app.css belonging to an exact selector.
 *
 * The regex matches innermost `selector{...}` pairs only (neither half may
 * contain a brace), so it walks straight past the `@media`/`@supports`
 * wrappers and returns the rules inside them alongside the top-level ones —
 * `.cat` legitimately has a second, mobile-only block.
 */
function blocksFor(selector) {
  const out = [];
  for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const names = sel.split(",").map((s) => s.trim());
    if (names.includes(selector)) out.push(body.replace(/\s+/g, ""));
  }
  return out;
}

function expectGuarded(selector) {
  const blocks = blocksFor(selector);
  expect(blocks.length, `no rule found for ${selector}`).toBeGreaterThan(0);
  expect(
    blocks.some((b) => b.includes("touch-action:manipulation")),
    `${selector} must declare touch-action:manipulation`
  ).toBe(true);
}

describe("left HUD stack is immune to double-tap-to-zoom", () => {
  it("#leftstack carries the guard for the whole stack", () => {
    // On the container specifically: a touch's effective touch-action is the
    // intersection of the hit element's value and its ancestors', so this one
    // declaration also covers the collapsible .ph headers and the dead
    // padding/gaps between rows — a tap landing on a gap would otherwise
    // re-open the gesture even with every row guarded individually.
    expectGuarded("#leftstack");
  });

  it("the legend category row carries it too", () => {
    expectGuarded(".cat");
  });

  it("the hotlist/event row carries it too", () => {
    // .today-row is the same dense row one plate down, and is reused by the
    // event feed (.event-row), the docked-vehicle list and Settings' Saved
    // lists — all of which inherit the guard from this one rule.
    expectGuarded(".today-row");
  });
});

describe("pinch-to-zoom stays available", () => {
  it("the viewport meta does not disable user scaling", () => {
    const meta = indexHtml.match(/<meta\s+name="viewport"\s+content="([^"]*)"/i);
    expect(meta).not.toBeNull();
    const content = meta[1].replace(/\s+/g, "").toLowerCase();
    // Both are the tempting shortcut fix for a double-tap-zoom bug, and both
    // take away deliberate pinch-zoom along with the accidental gesture.
    expect(content).not.toMatch(/user-scalable=(no|0)/);
    expect(content).not.toMatch(/maximum-scale=/);
  });
});

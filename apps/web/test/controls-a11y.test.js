// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";

/**
 * The time-machine rate controls, legend category rows, globe-style toggle,
 * and hotlist rows used to be onclick <div>s — invisible to the keyboard and
 * to assistive tech. They are now real <button type="button"> elements, which
 * this test pins down: correct tag, keyboard-reachable (in the tab order), and
 * with the ARIA state the toggles expose.
 */
import { initTimeMachine } from "../src/ui/time.js";
import { rebuildLegend } from "../src/ui/legend.js";
import { initGlobeStyle } from "../src/ui/globeStyle.js";
import { renderToday } from "../src/ui/today.js";
import { state } from "../src/state.js";
import { DATA } from "../src/data/store.js";

// A real <button> is in the tab order unless it is disabled or has been
// removed from it with tabindex="-1".
function inTabOrder(el) {
  return el.tagName === "BUTTON" && !el.disabled && el.tabIndex !== -1;
}

beforeEach(() => {
  document.body.innerHTML = `
    <div id="rate-btns"></div><div id="jump-btns"></div>
    <div id="cats"></div>
    <div id="globe-style-btns"></div><span id="globe-style-lbl"></span>
    <div id="today-list"></div>`;
});

describe("interactive controls are semantic, tab-reachable buttons", () => {
  it("time-machine rate controls are <button>s in tab order", () => {
    initTimeMachine();
    const rates = document.querySelectorAll("#rate-btns .tbtn");
    expect(rates.length).toBeGreaterThan(0);
    rates.forEach((b) => {
      expect(b.tagName).toBe("BUTTON");
      expect(b.getAttribute("type")).toBe("button");
      expect(inTabOrder(b)).toBe(true);
    });
    // the active rate exposes its pressed state to assistive tech
    const on = document.querySelector("#rate-btns .tbtn.on");
    expect(on.getAttribute("aria-pressed")).toBe("true");
    // the jump buttons alongside them are buttons too
    document.querySelectorAll("#jump-btns .jbtn").forEach((b) => expect(b.tagName).toBe("BUTTON"));
  });

  it("legend category rows are toggle <button>s in tab order", () => {
    state.cats.stations = 3;
    state.cats.starlink = 42;
    rebuildLegend();
    const rows = document.querySelectorAll("#cats .cat");
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((b) => {
      expect(b.tagName).toBe("BUTTON");
      expect(inTabOrder(b)).toBe(true);
      // shown categories are pressed; hidden ones are not
      expect(["true", "false"]).toContain(b.getAttribute("aria-pressed"));
    });
  });

  it("globe-style controls are <button>s in tab order", () => {
    initGlobeStyle();
    const btns = document.querySelectorAll("#globe-style-btns .gbtn");
    expect(btns.length).toBe(2);
    btns.forEach((b) => {
      expect(b.tagName).toBe("BUTTON");
      expect(inTabOrder(b)).toBe(true);
      expect(b.hasAttribute("aria-pressed")).toBe(true);
    });
  });

  it("hotlist rows are <button>s in tab order", () => {
    DATA.hotlist = [
      { id: "25544", name: "ISS (ZARYA)", reason: "Crewed station passing overhead" },
      { id: "20580", name: "HST", reason: "Bright evening pass" },
    ];
    renderToday();
    const rows = document.querySelectorAll("#today-list .today-row");
    expect(rows.length).toBe(2);
    rows.forEach((b) => {
      expect(b.tagName).toBe("BUTTON");
      expect(inTabOrder(b)).toBe(true);
    });
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Keyboard-driven search (F21). On desktop, arrow keys move a highlight,
 * Enter selects the first/highlighted result, and Escape clears + closes —
 * behaviour that previously only ran when isMobileSearch() was true.
 *
 * search.js imports `select` from info.js (which pulls in Three.js and the
 * whole scene graph) and `neoSats` from scene/neos.js. Both are mocked so the
 * test exercises only the search UI: `select` is the spy we assert on, and the
 * NEO list is empty so results come purely from state.sats.
 */
vi.mock("../src/ui/info.js", () => ({ select: vi.fn() }));
vi.mock("../src/scene/neos.js", () => ({ neoSats: [] }));

import { initSearch } from "../src/ui/search.js";
import { select } from "../src/ui/info.js";
import { state } from "../src/state.js";

const SATS = [
  { id: "20001", name: "ALPHA ONE", cat: "other" },
  { id: "20002", name: "ALPHA TWO", cat: "other" },
  { id: "20003", name: "BETA THREE", cat: "science" },
];

function setupDom() {
  // The combobox / listbox / option roles are applied dynamically by
  // initSearch() on desktop only, so the markup here is just the bare input +
  // results container (matching index.html).
  document.body.innerHTML = `
    <div id="search-wrap">
      <div id="search">
        <svg></svg>
        <input id="search-in" type="text" aria-label="Search catalog">
        <span class="slash"></span>
      </div>
      <div id="results"></div>
    </div>`;
}

function type(el, value) {
  el.value = value;
  el.dispatchEvent(new Event("input"));
}
function key(el, k) {
  el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
}

let sIn, sRes, sWrap;
beforeEach(() => {
  // jsdom ships no matchMedia — stub desktop so the keyboard path isn't gated
  // behind isMobileSearch().
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  select.mockClear();
  state.sats = SATS.slice();
  setupDom();
  sIn = document.getElementById("search-in");
  sRes = document.getElementById("results");
  sWrap = document.getElementById("search-wrap");
  initSearch();
});

describe("search keyboard navigation", () => {
  it("renders an announceable option per match and pre-highlights the first", () => {
    type(sIn, "alpha");
    const opts = sRes.querySelectorAll(".res");
    expect(opts.length).toBe(2);
    expect(sRes.classList.contains("show")).toBe(true);
    expect(sIn.getAttribute("aria-expanded")).toBe("true");
    // combobox/listbox/option semantics wired for screen readers (desktop)
    expect(sIn.getAttribute("role")).toBe("combobox");
    expect(sRes.getAttribute("role")).toBe("listbox");
    opts.forEach((o) => expect(o.getAttribute("role")).toBe("option"));
    // first option active + referenced via aria-activedescendant
    expect(opts[0].classList.contains("active")).toBe(true);
    expect(opts[0].getAttribute("aria-selected")).toBe("true");
    expect(sIn.getAttribute("aria-activedescendant")).toBe(opts[0].id);
  });

  it("ArrowDown + Enter selects the second result", () => {
    type(sIn, "alpha");
    key(sIn, "ArrowDown");
    const opts = sRes.querySelectorAll(".res");
    expect(opts[1].classList.contains("active")).toBe(true);
    expect(sIn.getAttribute("aria-activedescendant")).toBe(opts[1].id);

    key(sIn, "Enter");
    expect(select).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledWith(SATS[1]); // ALPHA TWO
    // choosing closes the panel and fills the input
    expect(sRes.classList.contains("show")).toBe(false);
    expect(sIn.value).toBe("ALPHA TWO");
  });

  it("a bare Enter selects the first result", () => {
    type(sIn, "alpha");
    key(sIn, "Enter");
    expect(select).toHaveBeenCalledWith(SATS[0]); // ALPHA ONE
  });

  it("ArrowUp does not move past the first result", () => {
    type(sIn, "alpha");
    key(sIn, "ArrowUp"); // already at index 0
    key(sIn, "Enter");
    expect(select).toHaveBeenCalledWith(SATS[0]);
  });

  it("Escape clears the query and closes the panel without selecting", () => {
    type(sIn, "alpha");
    expect(sRes.classList.contains("show")).toBe(true);
    key(sIn, "Escape");
    expect(sIn.value).toBe("");
    expect(sRes.classList.contains("show")).toBe(false);
    expect(sIn.getAttribute("aria-expanded")).toBe("false");
    expect(sIn.hasAttribute("aria-activedescendant")).toBe(false);
    expect(select).not.toHaveBeenCalled();
  });
});

describe("mobile keeps its original behaviour (F21/combobox is desktop-only)", () => {
  beforeEach(() => {
    // Flip to mobile. initSearch() already ran (desktop) in the outer
    // beforeEach, but every handler reads isMobileSearch() at event time, so
    // the mobile branches are what run here.
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
  });

  it("renders plain results — no combobox/listbox/option roles or highlight", () => {
    type(sIn, "alpha");
    const opts = sRes.querySelectorAll(".res");
    expect(opts.length).toBe(2);
    expect(sRes.classList.contains("show")).toBe(true);
    opts.forEach((o) => {
      expect(o.hasAttribute("role")).toBe(false);
      expect(o.classList.contains("active")).toBe(false);
      expect(o.hasAttribute("id")).toBe(false);
    });
    expect(sIn.hasAttribute("role")).toBe(false);
    expect(sRes.hasAttribute("role")).toBe(false);
    expect(sIn.hasAttribute("aria-activedescendant")).toBe(false);
  });

  it("Enter collapses the bar instead of selecting a result", () => {
    type(sIn, "alpha");
    sWrap.classList.add("expanded");
    key(sIn, "Enter");
    expect(select).not.toHaveBeenCalled();
    expect(sWrap.classList.contains("expanded")).toBe(false);
    expect(sRes.classList.contains("show")).toBe(false);
  });

  it("Escape collapses the bar and keeps the query (unlike desktop)", () => {
    type(sIn, "alpha");
    sWrap.classList.add("expanded");
    key(sIn, "Escape");
    expect(select).not.toHaveBeenCalled();
    expect(sWrap.classList.contains("expanded")).toBe(false);
    expect(sIn.value).toBe("alpha");
  });
});

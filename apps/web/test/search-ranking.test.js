// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Search result ranking.
 *
 * Searching "LINK" used to return matches in raw catalog order, so the actual
 * LINK spacecraft (NORAD 69792) was buried behind every STARLINK-*. Measured
 * against the real 18,755-object catalog at the time: 10,774 objects matched
 * "link", and LINK itself sat at index 10,769 — far past the 40-result cap, so
 * it never appeared at all and the object was only reachable by NORAD id.
 *
 * search.js imports `select` from info.js (which pulls in Three.js and the
 * whole scene graph) and `neoSats` from scene/neos.js — both mocked, following
 * search-keyboard.test.js.
 */
vi.mock("../src/ui/info.js", () => ({ select: vi.fn() }));
vi.mock("../src/scene/neos.js", () => ({ neoSats: [] }));

import {
  initSearch,
  searchCatalog,
  rankMatch,
  SEARCH_LIMIT,
  RANK_EXACT,
  RANK_PREFIX,
  RANK_SUBSTRING,
  RANK_NONE,
} from "../src/ui/search.js";
import { state } from "../src/state.js";

/**
 * Mirrors the real catalog's shape for this bug: many constellation members
 * whose names contain the query, with the exact match last in catalog order
 * and well past the result cap.
 */
const STARLINKS = Array.from({ length: 60 }, (_, i) => ({
  id: String(50000 + i),
  name: `STARLINK-${1000 + i}`,
  cat: "starlink",
}));
const LINK = { id: "69792", name: "LINK", cat: "science" };
const CATALOG = [...STARLINKS, LINK];

describe("rankMatch", () => {
  it("ranks an exact name match highest", () => {
    expect(rankMatch("link", "69792", "link")).toBe(RANK_EXACT);
  });

  it("ranks an exact NORAD id match highest", () => {
    expect(rankMatch("iss (zarya)", "25544", "25544")).toBe(RANK_EXACT);
  });

  it("ranks a prefix match above a mid-name substring match", () => {
    expect(rankMatch("starlink-1008", "50000", "starlink")).toBe(RANK_PREFIX);
    expect(rankMatch("starlink-1008", "50000", "link")).toBe(RANK_SUBSTRING);
  });

  it("reports no match when the query appears in neither name nor id", () => {
    expect(rankMatch("starlink-1008", "50000", "soyuz")).toBe(RANK_NONE);
  });
});

describe("searchCatalog", () => {
  it("surfaces the exact match first even when it is last in catalog order", () => {
    const hits = searchCatalog(CATALOG, "link");
    expect(hits[0].id).toBe("69792");
  });

  it("still returns the constellation members below it", () => {
    const hits = searchCatalog(CATALOG, "link");
    expect(hits.length).toBe(SEARCH_LIMIT);
    expect(hits.slice(1).every((s) => s.name.startsWith("STARLINK-"))).toBe(true);
  });

  it("leaves ordering untouched when every hit ties on rank", () => {
    // All 60 are prefix matches for "starlink", so this must stay catalog order.
    const hits = searchCatalog(CATALOG, "starlink");
    expect(hits.map((s) => s.id)).toEqual(STARLINKS.slice(0, SEARCH_LIMIT).map((s) => s.id));
  });

  it("ranks prefix matches above substring matches", () => {
    const list = [
      { id: "1", name: "DEEP SPACE ISS RELAY", cat: "other" },
      { id: "2", name: "ISS (ZARYA)", cat: "stations" },
    ];
    expect(searchCatalog(list, "iss").map((s) => s.id)).toEqual(["2", "1"]);
  });

  it("finds an object by exact NORAD id", () => {
    expect(searchCatalog(CATALOG, "69792")[0].id).toBe("69792");
  });

  it("respects the result cap", () => {
    expect(searchCatalog(CATALOG, "link").length).toBe(SEARCH_LIMIT);
    expect(searchCatalog(CATALOG, "link", 5).length).toBe(5);
  });

  it("returns nothing for an empty or whitespace query", () => {
    expect(searchCatalog(CATALOG, "")).toEqual([]);
    expect(searchCatalog(CATALOG, "   ")).toEqual([]);
    expect(searchCatalog(CATALOG, null)).toEqual([]);
  });

  it("returns nothing when nothing matches", () => {
    expect(searchCatalog(CATALOG, "zzzznope")).toEqual([]);
  });

  it("is case-insensitive", () => {
    expect(searchCatalog(CATALOG, "LiNk")[0].id).toBe("69792");
  });
});

// --- the same thing through the real UI, not just the helper ---

function setupDom() {
  document.body.innerHTML = `
    <div id="search-wrap">
      <div id="search"><svg></svg>
        <input id="search-in" type="text">
      </div>
      <div id="results"></div>
    </div>`;
}

function type(value) {
  const input = document.querySelector("#search-in");
  input.value = value;
  input.dispatchEvent(new Event("input"));
}

const rowIds = () =>
  [...document.querySelectorAll("#results .res .meta")].map((el) => el.textContent);

describe("search panel ranking (rendered results)", () => {
  beforeEach(() => {
    setupDom();
    state.sats = CATALOG;
    initSearch();
  });

  it("shows LINK as the first result for 'LINK', not buried behind Starlink", () => {
    type("LINK");
    const ids = rowIds();
    expect(ids.length).toBe(SEARCH_LIMIT);
    expect(ids[0]).toBe("#69792");
  });

  it("pre-highlights LINK so a bare Enter selects it", () => {
    type("LINK");
    const first = document.querySelector("#results .res");
    expect(first.classList.contains("active")).toBe(true);
    expect(first.querySelector(".meta").textContent).toBe("#69792");
  });

  it("still lists Starlink normally for 'starlink'", () => {
    type("starlink");
    const ids = rowIds();
    expect(ids[0]).toBe("#50000");
    expect(ids.length).toBe(SEARCH_LIMIT);
  });
});

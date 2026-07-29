// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Panel rendering and row behaviour. The sweep itself is covered by
 * overhead.test.js — here the results are injected so the DOM can be checked
 * without geolocation or SGP4 in the way.
 */

const selectSpy = vi.fn();
vi.mock("../src/ui/info.js", () => ({
  select: (s) => selectSpy(s),
  refreshInfo: () => {},
  initInfoCard: () => {},
  enrichSatcat: () => {},
}));
vi.mock("../src/ui/settings.js", () => ({
  openSettings: () => {},
  closeSettings: () => {},
  initSettings: () => {},
}));

const MARKUP = `
  <div id="overhead" class="plate">
    <div class="ph"><span class="ph-r">
      <span class="ph-i" id="overhead-count"></span>
      <button type="button" class="x" id="overhead-x"></button>
    </span></div>
    <div class="sheet-body">
      <div id="overhead-status" class="oh-status"></div>
      <div id="overhead-filters"></div>
      <div id="overhead-list"></div>
      <div id="overhead-foot"></div>
    </div>
  </div>
  <button type="button" id="overhead-fab" aria-expanded="false"></button>
`;

function row(id, name, cat, elevationDeg, azimuthDeg = 0) {
  return { id, name, cat, elevationDeg, azimuthDeg, rangeKm: 500 };
}

let mod;

beforeEach(async () => {
  selectSpy.mockClear();
  document.body.innerHTML = MARKUP;
  vi.resetModules();
  mod = await import("../src/ui/overhead.js");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("row rendering", () => {
  it("renders one .ohrow button per result", async () => {
    mod._test.setResults([
      row("25544", "ISS (ZARYA)", "stations", 78),
      row("20580", "HST", "science", 41),
    ]);
    mod._test.renderList();
    const rows = document.querySelectorAll("#overhead-list .ohrow");
    expect(rows).toHaveLength(2);
    // Real buttons, matching the convention controls-a11y.test.js pins.
    expect(rows[0].tagName).toBe("BUTTON");
    expect(rows[0].getAttribute("type")).toBe("button");
    expect(rows[0].querySelector(".nm").textContent).toBe("ISS (ZARYA)");
  });

  it("shows elevation and a compass bearing", async () => {
    mod._test.setResults([row("25544", "ISS", "stations", 78.4, 90)]);
    mod._test.renderList();
    expect(document.querySelector("#overhead-list .el").textContent).toBe("78° E");
  });

  it("puts the object name in via textContent, so markup can't be injected", async () => {
    mod._test.setResults([row("1", "<img src=x onerror=alert(1)>", "other", 10)]);
    mod._test.renderList();
    const nm = document.querySelector("#overhead-list .nm");
    expect(nm.querySelector("img")).toBeNull();
    expect(nm.textContent).toBe("<img src=x onerror=alert(1)>");
  });

  it("reports the visible count in the header", async () => {
    mod._test.setResults([
      row("1", "A", "starlink", 10),
      row("2", "B", "starlink", 20),
      row("3", "C", "debris", 30),
    ]);
    mod._test.renderList();
    expect(document.querySelector("#overhead-count").textContent).toBe("3");
  });

  it("says so when nothing is overhead", async () => {
    mod._test.setResults([]);
    mod._test.renderList();
    expect(document.querySelectorAll("#overhead-list .ohrow")).toHaveLength(0);
    expect(document.querySelector("#overhead-status").textContent).toMatch(/nothing is above/i);
  });
});

describe("paging", () => {
  it("caps the first render at PAGE (25) and offers 'Show all' for the rest", async () => {
    expect(mod._test.PAGE).toBe(25);
    const many = Array.from({ length: 130 }, (_, i) =>
      row(String(i), "OBJ " + i, "starlink", 90 - i * 0.5)
    );
    mod._test.setResults(many);
    mod._test.renderList();
    expect(document.querySelectorAll("#overhead-list .ohrow")).toHaveLength(mod._test.PAGE);
    const more = document.querySelector("#overhead-foot .oh-more");
    expect(more).not.toBeNull();
    expect(more.textContent).toMatch(/show all/i);
    expect(more.textContent).toMatch(/105/); // 130 - 25 remaining
    // The honest total stays visible even though the list is capped.
    expect(document.querySelector("#overhead-count").textContent).toBe("130");
  });

  it("reveals every remaining row in one step when 'Show all' is used, in the same order", async () => {
    const many = Array.from({ length: 130 }, (_, i) =>
      row(String(i), "OBJ " + i, "starlink", 130 - i)
    );
    mod._test.setResults(many);
    mod._test.renderList();
    document.querySelector("#overhead-foot .oh-more").click();
    const rendered = [...document.querySelectorAll("#overhead-list .ohrow .nm")].map(
      (el) => el.textContent
    );
    expect(rendered).toHaveLength(130);
    // Nothing left to reveal, so the control disappears — and this must not
    // have re-sorted anything: still the same descending-elevation order the
    // (pre-ranked) input arrived in.
    expect(rendered).toEqual(many.map((r) => r.name));
    expect(document.querySelector("#overhead-foot .oh-more")).toBeNull();
  });

  it("drops the 'Show all' button once everything is shown", async () => {
    mod._test.setResults([row("1", "A", "starlink", 10)]);
    mod._test.renderList();
    expect(document.querySelector("#overhead-foot .oh-more")).toBeNull();
  });

  it("does not recompute or re-filter — 'Show all' is a pure display change", async () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      row(String(i), "OBJ " + i, "starlink", 40 - i)
    );
    mod._test.setResults(many);
    mod._test.renderList();
    const beforeIds = mod._test.visibleResults().map((r) => r.id);
    document.querySelector("#overhead-foot .oh-more").click();
    const afterIds = mod._test.visibleResults().map((r) => r.id);
    // Same underlying array, same order, same length — only the rendered
    // slice grew.
    expect(afterIds).toEqual(beforeIds);
  });
});

describe("category filters", () => {
  it("renders one chip per category present, with counts", async () => {
    mod._test.setResults([
      row("1", "A", "starlink", 10),
      row("2", "B", "starlink", 20),
      row("3", "C", "debris", 30),
    ]);
    mod._test.renderFilters();
    const chips = document.querySelectorAll("#overhead-filters .oh-chip");
    expect(chips).toHaveLength(2);
    expect([...chips].map((c) => c.textContent).join(" ")).toMatch(/Starlink 2/);
    expect([...chips].map((c) => c.textContent).join(" ")).toMatch(/DEBRIS 1/);
  });

  it("skips the filter row when there's only one category", async () => {
    mod._test.setResults([row("1", "A", "starlink", 10)]);
    mod._test.renderFilters();
    expect(document.querySelectorAll("#overhead-filters .oh-chip")).toHaveLength(0);
  });

  it("filters the list without touching state.hidden", async () => {
    const { state } = await import("../src/state.js");
    const before = new Set(state.hidden);
    mod._test.setResults([row("1", "A", "starlink", 10), row("2", "B", "debris", 30)]);
    mod._test.renderFilters();
    mod._test.renderList();
    expect(document.querySelectorAll("#overhead-list .ohrow")).toHaveLength(2);

    // Switch the first chip off.
    document.querySelector("#overhead-filters .oh-chip").click();
    expect(document.querySelectorAll("#overhead-list .ohrow")).toHaveLength(1);
    // The panel's filter is its own state — the globe's category visibility
    // must be untouched.
    expect(new Set(state.hidden)).toEqual(before);
  });

  it("says so when filters exclude everything", async () => {
    mod._test.setResults([row("1", "A", "starlink", 10), row("2", "B", "debris", 30)]);
    mod._test.renderFilters();
    for (const chip of document.querySelectorAll("#overhead-filters .oh-chip")) chip.click();
    expect(document.querySelector("#overhead-status").textContent).toMatch(/filters/i);
  });
});

describe("selecting a row", () => {
  it("resolves through state.byId and opens the info card", async () => {
    const { state } = await import("../src/state.js");
    const rec = { id: "25544", name: "ISS (ZARYA)", cat: "stations", rec: {} };
    state.byId.set("25544", rec);

    mod._test.setResults([row("25544", "ISS (ZARYA)", "stations", 78)]);
    mod._test.renderList();
    document.querySelector("#overhead-list .ohrow").click();

    expect(selectSpy).toHaveBeenCalledWith(rec);
    // The panel closes so it doesn't cover the card it just opened.
    expect(document.getElementById("overhead").classList.contains("show")).toBe(false);
    state.byId.delete("25544");
  });

  it("does nothing when the object has been pruned by a live sync", async () => {
    const { state } = await import("../src/state.js");
    state.byId.delete("99999");
    mod._test.setResults([row("99999", "GONE", "other", 12)]);
    mod._test.renderList();
    document.querySelector("#overhead-list .ohrow").click();
    expect(selectSpy).not.toHaveBeenCalled();
  });
});

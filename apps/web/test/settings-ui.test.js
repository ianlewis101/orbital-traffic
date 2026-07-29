// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The Settings panel: four cards (Privacy & Permissions, Display, Data,
 * About), each with its own icon/title header (.set-card-t) rather than the
 * old flat .set-h label. There is no display-categories control anymore —
 * it was removed outright, not just visually reorganized — so this file
 * also guards against it quietly coming back.
 */

vi.mock("../src/ui/info.js", () => ({
  refreshInfo: () => {},
  select: () => {},
  initInfoCard: () => {},
  enrichSatcat: () => {},
}));
const fetchLiveSpy = vi.fn().mockResolvedValue(undefined);
vi.mock("../src/data/live.js", () => ({
  fetchLive: (...a) => fetchLiveSpy(...a),
  initLiveRefresh: () => {},
}));
vi.mock("../src/ui/status.js", () => ({
  toast: () => {},
  flash: () => {},
  updateCount: () => {},
}));

const MARKUP = `
  <div id="settings" class="plate">
    <div class="ph"><span class="ph-r"><button type="button" class="x" id="settings-x"></button></span></div>
    <div class="sheet-body" id="settings-body"></div>
  </div>
  <button type="button" id="settings-btn" aria-expanded="false"></button>
  <span id="legend-tot"></span>
`;

function stubStorage(initial = {}) {
  const store = { ...initial };
  vi.stubGlobal("localStorage", {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => delete store[k],
  });
  return store;
}

const KEY = "ot-settings";

async function load(stored) {
  document.body.innerHTML = MARKUP;
  vi.resetModules();
  // Injected by apps/web/vite.config.js's `define` in a real build; vitest
  // runs from the repo root and doesn't apply that config.
  vi.stubGlobal("__APP_VERSION__", "2.0.0");
  const store = stubStorage(stored ? { [KEY]: JSON.stringify(stored) } : {});
  // jsdom's navigator is read-only-ish; define what location.js needs.
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: () => {} } });
  const ui = await import("../src/ui/settings.js");
  const settings = await import("../src/settings.js");
  await ui._test.render();
  return { ui, settings, store };
}

beforeEach(() => {
  fetchLiveSpy.mockClear();
  vi.resetModules();
});
afterEach(() => vi.unstubAllGlobals());

describe("structure", () => {
  it("renders all four cards in order, each with an icon + title header", async () => {
    await load();
    const cards = [...document.querySelectorAll("#settings-body .set-card")];
    expect(cards).toHaveLength(4);
    const headings = cards.map((c) => c.querySelector(".set-card-t").textContent);
    expect(headings).toEqual(["Privacy & Permissions", "Display", "Data", "About"]);
    for (const c of cards) {
      expect(c.querySelector(".set-ic svg")).not.toBeNull();
    }
  });

  it("gives each card a distinct accent class for wayfinding", async () => {
    await load();
    const accents = [...document.querySelectorAll("#settings-body .set-card")].map((c) =>
      [...c.classList].find((cls) => cls.startsWith("set-card--"))
    );
    expect(new Set(accents).size).toBe(4); // all four distinct
  });

  it("shows the build-time app version", async () => {
    await load();
    expect(document.querySelector("#settings-body").textContent).toMatch(/Orbital Traffic v\d/);
  });

  it("credits Launch Library 2, not Open Notify", async () => {
    await load();
    const txt = document.querySelector(".set-credits").textContent;
    expect(txt).toMatch(/Launch Library 2/);
    expect(txt).toMatch(/CelesTrak/);
    expect(txt).not.toMatch(/Open Notify/i);
  });

  it("has no display-categories toggle list — removed, not merely restyled", async () => {
    await load();
    const body = document.querySelector("#settings-body");
    expect(body.querySelector(".set-cats")).toBeNull();
    // Only one .set-row exists anywhere in the panel: Reduce motion. A
    // category-per-row list would push this well past that.
    expect(document.querySelectorAll(".set-row")).toHaveLength(1);
    expect(body.textContent).not.toMatch(/orbit classes/i);
  });
});

describe("units", () => {
  it("offers both systems with the current one marked", async () => {
    await load({ units: "metric" });
    const on = document.querySelector(".set-seg .gbtn.on");
    expect(on.textContent).toBe("KILOMETRES");
  });

  it("persists a change", async () => {
    const { settings } = await load();
    const btns = [...document.querySelectorAll(".set-seg .gbtn")];
    btns.find((b) => b.textContent === "KILOMETRES").click();
    expect(settings.settings.units).toBe("metric");
  });
});

describe("reduce motion", () => {
  it("persists and reflects onto the document element", async () => {
    const { settings } = await load();
    const row = [...document.querySelectorAll(".set-row")].find(
      (r) => r.querySelector(".set-row-nm")?.textContent === "Reduce motion"
    );
    row.click();
    expect(settings.settings.reduceMotion).toBe(true);
    expect(document.documentElement.classList.contains("reduce-motion")).toBe(true);
    row.click();
    expect(document.documentElement.classList.contains("reduce-motion")).toBe(false);
  });
});

describe("data section", () => {
  it("calls the existing live-sync entry point", async () => {
    await load();
    const btn = [...document.querySelectorAll(".set-action")].find((b) =>
      /refresh catalog/i.test(b.textContent)
    );
    btn.click();
    await vi.waitFor(() => expect(fetchLiveSpy).toHaveBeenCalledTimes(1));
  });

  it("says the catalog hasn't synced yet when it hasn't", async () => {
    const { state } = await import("../src/state.js");
    const srcTime = state.srcTime;
    const bootTime = state.bootCatalogTime;
    state.srcTime = null;
    state.bootCatalogTime = null;
    await load();
    expect(document.querySelector("#settings-body").textContent).toMatch(/not yet synced/i);
    state.srcTime = srcTime;
    state.bootCatalogTime = bootTime;
  });
});

describe("privacy section", () => {
  it("offers a reset that clears the denied flag", async () => {
    const { settings } = await load({ locationPermissionDenied: true });
    expect(document.querySelector("#settings-body").textContent).toMatch(/Location access: Denied/);
    const reset = [...document.querySelectorAll(".set-action")].find((b) =>
      /reset/i.test(b.textContent)
    );
    expect(reset).not.toBeUndefined();
    reset.click();
    await vi.waitFor(() => expect(settings.settings.locationPermissionDenied).toBe(false));
  });

  it("explains that location never leaves the device when not denied", async () => {
    await load();
    expect(document.querySelector("#settings-body").textContent).toMatch(
      /never stored or sent anywhere/i
    );
  });
});

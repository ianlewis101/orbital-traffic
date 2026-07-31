// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The Settings panel: six cards (Privacy & Permissions, Saved, Display,
 * Globe Style, Data, About), each with its own icon/title header
 * (.set-card-t) rather than the old flat .set-h label. There is no
 * display-categories control anymore —
 * it was removed outright, not just visually reorganized — so this file
 * also guards against it quietly coming back.
 */

const selectSpy = vi.fn();
vi.mock("../src/ui/info.js", () => ({
  refreshInfo: () => {},
  select: (...a) => selectSpy(...a),
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

// The Globe Style card talks to scene/earth.js, which owns the style and its
// own `ot-globe-style` storage key. Stubbed here so the card can be tested
// without standing up THREE: setGlobeStyle() builds globe textures for real.
const globe = vi.hoisted(() => ({ style: "real", picked: [] }));
vi.mock("../src/scene/earth.js", () => ({
  getGlobeStyle: () => globe.style,
  setGlobeStyle: (s) => {
    globe.style = s;
    globe.picked.push(s);
  },
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

async function load(stored, objects) {
  document.body.innerHTML = MARKUP;
  vi.resetModules();
  // Injected by apps/web/vite.config.js's `define` in a real build; vitest
  // runs from the repo root and doesn't apply that config.
  vi.stubGlobal("__APP_VERSION__", "2.0.0");
  const store = stubStorage(stored ? { [KEY]: JSON.stringify(stored) } : {});
  // jsdom's navigator is read-only-ish; define what location.js needs.
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: () => {} } });
  // Seed the catalog before the panel renders — the Saved card resolves its
  // stored IDs through state.byId. Same module instance the panel imports,
  // because this happens after the resetModules() above.
  const { state } = await import("../src/state.js");
  if (objects) state.byId = new Map(objects.map((o) => [o.id, o]));
  const ui = await import("../src/ui/settings.js");
  const settings = await import("../src/settings.js");
  await ui._test.render();
  return { ui, settings, store, state };
}

beforeEach(() => {
  fetchLiveSpy.mockClear();
  selectSpy.mockClear();
  globe.style = "real";
  globe.picked.length = 0;
  vi.resetModules();
});
afterEach(() => vi.unstubAllGlobals());

describe("structure", () => {
  it("renders all six cards in order, each with an icon + title header", async () => {
    await load();
    const cards = [...document.querySelectorAll("#settings-body .set-card")];
    expect(cards).toHaveLength(6);
    const headings = cards.map((c) => c.querySelector(".set-card-t").textContent);
    expect(headings).toEqual([
      "Privacy & Permissions",
      "Saved",
      "Display",
      "Globe Style",
      "Data",
      "About",
    ]);
    for (const c of cards) {
      expect(c.querySelector(".set-ic svg")).not.toBeNull();
    }
  });

  it("gives each card a distinct accent class for wayfinding", async () => {
    await load();
    const accents = [...document.querySelectorAll("#settings-body .set-card")].map((c) =>
      [...c.classList].find((cls) => cls.startsWith("set-card--"))
    );
    expect(new Set(accents).size).toBe(6); // all six distinct
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

describe("saved card", () => {
  const ISS = { id: "25544", name: "ISS (ZARYA)", cat: "stations" };
  const HST = { id: "20580", name: "HST", cat: "science" };

  const savedCard = () =>
    [...document.querySelectorAll("#settings-body .set-card")].find(
      (c) => c.querySelector(".set-card-t").textContent === "Saved"
    );
  const rowsUnder = (label) => {
    const card = savedCard();
    const kids = [...card.querySelector(".set-card-b").children];
    const start = kids.findIndex(
      (k) => k.classList.contains("set-sub") && k.textContent.startsWith(label)
    );
    const list = kids[start + 1];
    return list && list.classList.contains("set-saved")
      ? [...list.querySelectorAll(".today-row")]
      : [];
  };

  it("shows both lists, each with an empty state saying what it's for", async () => {
    await load();
    const txt = savedCard().textContent;
    expect(txt).toMatch(/Favourites/);
    expect(txt).toMatch(/Watchlist/);
    expect(txt).toMatch(/Tap the ☆ on an object's card/);
    expect(txt).toMatch(/objects you want to check back on later/);
    expect(savedCard().querySelectorAll(".today-row")).toHaveLength(0);
  });

  it("lists each saved object independently, newest first", async () => {
    await load({ saved: { favorites: ["20580", "25544"], watchlist: ["20580"] } }, [ISS, HST]);
    expect(rowsUnder("Favourites").map((r) => r.querySelector(".nm").textContent)).toEqual([
      "ISS (ZARYA)",
      "HST",
    ]);
    expect(rowsUnder("Watchlist").map((r) => r.querySelector(".nm").textContent)).toEqual(["HST"]);
  });

  it("counts each list in its label", async () => {
    await load({ saved: { favorites: ["25544", "20580"], watchlist: [] } }, [ISS, HST]);
    const subs = [...savedCard().querySelectorAll(".set-sub")].map((s) => s.textContent);
    expect(subs).toEqual(["Favourites (2)", "Watchlist"]);
  });

  it("reuses the today-row shape: colour swatch, name, caption", async () => {
    await load({ saved: { favorites: ["25544"] } }, [ISS]);
    const row = rowsUnder("Favourites")[0];
    expect(row.tagName).toBe("BUTTON");
    expect(row.querySelector(".sw").getAttribute("style")).toContain("#ffd23d"); // stations
    expect(row.querySelector(".reason").textContent).toBe("Stations · NORAD 25544");
  });

  it("escapes object names rather than trusting the catalog", async () => {
    await load({ saved: { favorites: ["99999"] } }, [
      { id: "99999", name: "<img src=x onerror=alert(1)>", cat: "other" },
    ]);
    const row = rowsUnder("Favourites")[0];
    expect(row.querySelector("img")).toBeNull();
    expect(row.querySelector(".nm").textContent).toBe("<img src=x onerror=alert(1)>");
  });

  it("selects the object and closes the sheet when a row is tapped", async () => {
    await load({ saved: { watchlist: ["25544"] } }, [ISS]);
    document.getElementById("settings").classList.add("show");
    rowsUnder("Watchlist")[0].click();
    expect(selectSpy).toHaveBeenCalledTimes(1);
    expect(selectSpy.mock.calls[0][0]).toBe(ISS);
    expect(document.getElementById("settings").classList.contains("show")).toBe(false);
    expect(document.getElementById("settings-btn").getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps a row for an object that has left the catalog, but inert", async () => {
    await load({ saved: { favorites: ["25544", "44444"] } }, [ISS]);
    const rows = rowsUnder("Favourites");
    expect(rows).toHaveLength(2);
    const orphan = rows.find((r) => r.querySelector(".nm").textContent === "NORAD 44444");
    expect(orphan).not.toBeUndefined();
    expect(orphan.disabled).toBe(true);
    expect(orphan.querySelector(".reason").textContent).toBe("No longer in the catalog");
    orphan.click();
    expect(selectSpy).not.toHaveBeenCalled();
  });

  it("says where the lists live once there's something in them", async () => {
    await load({ saved: { favorites: ["25544"] } }, [ISS]);
    expect(savedCard().textContent).toMatch(/kept on this device only/i);
  });

  it("shows favourites migrated from the legacy ot_favs key", async () => {
    document.body.innerHTML = MARKUP;
    vi.resetModules();
    vi.stubGlobal("__APP_VERSION__", "2.0.0");
    stubStorage({ ot_favs: JSON.stringify(["25544"]) });
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: () => {} } });
    const { state } = await import("../src/state.js");
    state.byId = new Map([[ISS.id, ISS]]);
    const ui = await import("../src/ui/settings.js");
    await ui._test.render();
    expect(rowsUnder("Favourites").map((r) => r.querySelector(".nm").textContent)).toEqual([
      "ISS (ZARYA)",
    ]);
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

/**
 * Globe Style used to live in its own floating #globe-style plate, wired up by
 * ui/globeStyle.js. Both are gone; the control is a Settings card now. These
 * assertions cover the relocation: that it reads and writes the same
 * scene/earth.js pair the plate did, and that its buttons kept the semantics
 * the old plate's a11y test pinned down (real <button>s, in the tab order,
 * exposing aria-pressed).
 */
describe("globe style", () => {
  const buttons = () => [
    ...document.querySelectorAll("#settings-body .set-card--globe .set-seg .gbtn"),
  ];

  it("offers both styles, reflecting the current one as pressed", async () => {
    globe.style = "ops";
    await load();
    const btns = buttons();
    expect(btns.map((b) => b.textContent)).toEqual(["REALISTIC", "OPS CONSOLE"]);
    expect(btns.map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
  });

  it("controls are <button>s in the tab order", async () => {
    await load();
    const btns = buttons();
    expect(btns).toHaveLength(2);
    for (const b of btns) {
      expect(b.tagName).toBe("BUTTON");
      expect(b.getAttribute("type")).toBe("button");
      expect(b.disabled).toBe(false);
      expect(b.tabIndex).not.toBe(-1);
      expect(b.hasAttribute("aria-pressed")).toBe(true);
    }
  });

  it("picking a style calls setGlobeStyle and moves the pressed state", async () => {
    await load();
    const [real, ops] = buttons();
    ops.click();
    expect(globe.picked).toEqual(["ops"]);
    expect(ops.getAttribute("aria-pressed")).toBe("true");
    expect(real.getAttribute("aria-pressed")).toBe("false");
    expect(ops.classList.contains("on")).toBe(true);
  });

  it("persists through earth.js, not settings.js's own storage key", async () => {
    const { store } = await load();
    buttons()[1].click();
    expect(globe.style).toBe("ops");
    // ot-globe-style is owned by scene/earth.js; the relocation must not have
    // migrated it into the "ot-settings" blob.
    expect(JSON.parse(store[KEY] || "{}")).not.toHaveProperty("globeStyle");
  });

  it("reopening reflects a style changed elsewhere", async () => {
    const { ui } = await load();
    expect(buttons()[0].getAttribute("aria-pressed")).toBe("true");
    globe.style = "ops";
    await ui._test.render();
    expect(buttons()[1].getAttribute("aria-pressed")).toBe("true");
  });
});

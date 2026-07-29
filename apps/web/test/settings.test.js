import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * settings.js reads localStorage at import time to build its singleton, so
 * each case stubs storage first and then imports a fresh copy of the module
 * via vi.resetModules() — importing once at the top would freeze whatever
 * happened to be in storage for the whole file.
 */
function stubStorage(initial = {}, { throwOnSet = false, throwOnGet = false } = {}) {
  const store = { ...initial };
  vi.stubGlobal("localStorage", {
    getItem(k) {
      if (throwOnGet) throw new Error("denied");
      return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
    },
    setItem(k, v) {
      if (throwOnSet) throw new Error("quota");
      store[k] = String(v);
    },
    removeItem(k) {
      delete store[k];
    },
  });
  return store;
}

async function freshSettings() {
  vi.resetModules();
  return import("../src/settings.js");
}

const KEY = "ot-settings";

beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("defaults", () => {
  it("falls back to defaults when nothing is stored", async () => {
    stubStorage();
    const { settings, DEFAULTS } = await freshSettings();
    expect(settings).toEqual(DEFAULTS);
    expect(settings.units).toBe("imperial");
    expect(settings.reduceMotion).toBe(false);
    expect(settings.locationPermissionDenied).toBe(false);
    expect(settings.displayCategories).toBeNull();
  });

  it("survives corrupt JSON rather than throwing", async () => {
    stubStorage({ [KEY]: "{not json" });
    const { settings, DEFAULTS } = await freshSettings();
    expect(settings).toEqual(DEFAULTS);
  });

  it("survives a localStorage that throws on read", async () => {
    stubStorage({}, { throwOnGet: true });
    const { settings, DEFAULTS } = await freshSettings();
    expect(settings).toEqual(DEFAULTS);
  });

  it("ignores a stored value that isn't an object", async () => {
    stubStorage({ [KEY]: '"nope"' });
    const { settings, DEFAULTS } = await freshSettings();
    expect(settings).toEqual(DEFAULTS);
  });
});

describe("validation", () => {
  it("keeps valid values and drops invalid ones", async () => {
    stubStorage({
      [KEY]: JSON.stringify({
        units: "metric",
        reduceMotion: true,
        locationPermissionDenied: true,
      }),
    });
    const { settings } = await freshSettings();
    expect(settings.units).toBe("metric");
    expect(settings.reduceMotion).toBe(true);
    expect(settings.locationPermissionDenied).toBe(true);
  });

  it("rejects an unknown units value", async () => {
    stubStorage({ [KEY]: JSON.stringify({ units: "furlongs" }) });
    const { settings } = await freshSettings();
    expect(settings.units).toBe("imperial");
  });

  it("rejects non-boolean flags", async () => {
    stubStorage({
      [KEY]: JSON.stringify({ reduceMotion: "yes", locationPermissionDenied: 1 }),
    });
    const { settings } = await freshSettings();
    expect(settings.reduceMotion).toBe(false);
    expect(settings.locationPermissionDenied).toBe(false);
  });

  it("drops unknown top-level keys", async () => {
    stubStorage({ [KEY]: JSON.stringify({ units: "metric", nonsense: 42 }) });
    const { settings } = await freshSettings();
    expect(settings).not.toHaveProperty("nonsense");
  });
});

describe("displayCategories", () => {
  it("rebuilds from the live CATS keys, so a new category appears", async () => {
    // Written when only two categories existed.
    stubStorage({
      [KEY]: JSON.stringify({ displayCategories: { starlink: false, stations: true } }),
    });
    const { settings } = await freshSettings();
    const { CATS } = await import("../src/config.js");
    expect(Object.keys(settings.displayCategories).sort()).toEqual(Object.keys(CATS).sort());
    expect(settings.displayCategories.starlink).toBe(false);
    expect(settings.displayCategories.stations).toBe(true);
    // A category the stored blob never mentioned falls back to its default.
    expect(settings.displayCategories.debris).toBe(false);
    expect(settings.displayCategories.navigation).toBe(true);
  });

  it("drops a category that no longer exists", async () => {
    stubStorage({
      [KEY]: JSON.stringify({ displayCategories: { starlink: true, retired_cat: true } }),
    });
    const { settings } = await freshSettings();
    expect(settings.displayCategories).not.toHaveProperty("retired_cat");
  });

  it("defaultDisplayCategories hides exactly the default-hidden set", async () => {
    stubStorage();
    const { defaultDisplayCategories, DEFAULT_HIDDEN } = await freshSettings();
    const cats = defaultDisplayCategories();
    for (const [c, visible] of Object.entries(cats)) {
      expect(visible).toBe(!DEFAULT_HIDDEN.includes(c));
    }
  });
});

describe("saveSettings", () => {
  it("persists a patch and merges it into the singleton", async () => {
    const store = stubStorage();
    const { settings, saveSettings } = await freshSettings();
    saveSettings({ units: "metric" });
    expect(settings.units).toBe("metric");
    expect(JSON.parse(store[KEY]).units).toBe("metric");
  });

  it("leaves untouched keys alone", async () => {
    stubStorage();
    const { settings, saveSettings } = await freshSettings();
    saveSettings({ units: "metric" });
    saveSettings({ reduceMotion: true });
    expect(settings.units).toBe("metric");
    expect(settings.reduceMotion).toBe(true);
  });

  it("still applies in memory when storage refuses to write", async () => {
    stubStorage({}, { throwOnSet: true });
    const { settings, saveSettings } = await freshSettings();
    expect(() => saveSettings({ units: "metric" })).not.toThrow();
    expect(settings.units).toBe("metric");
  });

  it("validates the patch, so a bad value can't get in", async () => {
    stubStorage();
    const { settings, saveSettings } = await freshSettings();
    saveSettings({ units: "parsecs" });
    expect(settings.units).toBe("imperial");
  });
});

describe("seedDisplayCategories", () => {
  it("does nothing when never configured, keeping the app defaults", async () => {
    stubStorage();
    const { seedDisplayCategories } = await freshSettings();
    const { state } = await import("../src/state.js");
    const before = new Set(state.hidden);
    seedDisplayCategories();
    expect(new Set(state.hidden)).toEqual(before);
  });

  it("replaces state.hidden with exactly the categories switched off", async () => {
    stubStorage({
      [KEY]: JSON.stringify({
        displayCategories: { debris: true, other: true, starlink: false },
      }),
    });
    const { seedDisplayCategories } = await freshSettings();
    const { state } = await import("../src/state.js");
    seedDisplayCategories();
    // debris/other were re-enabled by the user, starlink switched off.
    expect(state.hidden.has("debris")).toBe(false);
    expect(state.hidden.has("other")).toBe(false);
    expect(state.hidden.has("starlink")).toBe(true);
  });

  it("can hide everything", async () => {
    const { CATS } = await import("../src/config.js");
    const all = {};
    for (const c of Object.keys(CATS)) all[c] = false;
    stubStorage({ [KEY]: JSON.stringify({ displayCategories: all }) });
    const { seedDisplayCategories } = await freshSettings();
    const { state } = await import("../src/state.js");
    seedDisplayCategories();
    expect(state.hidden.size).toBe(Object.keys(CATS).length);
  });

  it("agrees with state.js's own initial hidden set when unconfigured", async () => {
    // The two defaults must not drift: a first-run user and a user who has
    // opened Settings once should see the same globe.
    stubStorage();
    const { DEFAULT_HIDDEN } = await freshSettings();
    const { state } = await import("../src/state.js");
    expect([...state.hidden].sort()).toEqual([...DEFAULT_HIDDEN].sort());
  });
});

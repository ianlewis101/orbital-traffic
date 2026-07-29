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
  });

  it("has no display-categories field — that control was removed entirely", async () => {
    stubStorage();
    const { settings, DEFAULTS } = await freshSettings();
    expect(settings).not.toHaveProperty("displayCategories");
    expect(DEFAULTS).not.toHaveProperty("displayCategories");
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

  it("drops a display-categories patch — no such field exists anymore", async () => {
    stubStorage();
    const { settings, saveSettings } = await freshSettings();
    saveSettings({ displayCategories: { starlink: false } });
    expect(settings).not.toHaveProperty("displayCategories");
  });
});

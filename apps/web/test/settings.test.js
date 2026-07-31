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
const LEGACY = "ot_favs";

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

  it("starts with two empty saved lists", async () => {
    stubStorage();
    const { settings } = await freshSettings();
    expect(settings.saved).toEqual({ favorites: [], watchlist: [] });
  });

  it("hands out a fresh saved object, not a reference into DEFAULTS", async () => {
    stubStorage();
    const { settings, DEFAULTS } = await freshSettings();
    settings.saved.favorites.push("25544");
    expect(DEFAULTS.saved.favorites).toEqual([]);
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

describe("saved lists — validation", () => {
  it("keeps two valid lists, independently", async () => {
    stubStorage({
      [KEY]: JSON.stringify({ saved: { favorites: ["25544"], watchlist: ["20580", "neo_3"] } }),
    });
    const { settings } = await freshSettings();
    expect(settings.saved.favorites).toEqual(["25544"]);
    expect(settings.saved.watchlist).toEqual(["20580", "neo_3"]);
  });

  it("drops a saved value that isn't an object", async () => {
    stubStorage({ [KEY]: JSON.stringify({ saved: "nope" }) });
    const { settings } = await freshSettings();
    expect(settings.saved).toEqual({ favorites: [], watchlist: [] });
  });

  it("drops lists that aren't arrays", async () => {
    stubStorage({ [KEY]: JSON.stringify({ saved: { favorites: { 0: "25544" }, watchlist: 7 } }) });
    const { settings } = await freshSettings();
    expect(settings.saved).toEqual({ favorites: [], watchlist: [] });
  });

  it("drops malformed entries but keeps the good ones around them", async () => {
    stubStorage({
      [KEY]: JSON.stringify({
        saved: { favorites: ["25544", 20580, null, { id: "x" }, "", "  ", ["y"], "36086"] },
      }),
    });
    const { settings } = await freshSettings();
    expect(settings.saved.favorites).toEqual(["25544", "36086"]);
  });

  it("collapses duplicates and trims stray whitespace", async () => {
    stubStorage({
      [KEY]: JSON.stringify({ saved: { watchlist: ["25544", " 25544 ", "25544", "20580"] } }),
    });
    const { settings } = await freshSettings();
    expect(settings.saved.watchlist).toEqual(["25544", "20580"]);
  });

  it("drops unknown keys inside saved", async () => {
    stubStorage({
      [KEY]: JSON.stringify({ saved: { favorites: ["25544"], mostViewed: ["99999"] } }),
    });
    const { settings } = await freshSettings();
    expect(settings.saved).not.toHaveProperty("mostViewed");
  });

  it("survives a saved list of pure junk without throwing", async () => {
    stubStorage({ [KEY]: JSON.stringify({ saved: { favorites: [null, 1, false] } }) });
    const { settings, DEFAULTS } = await freshSettings();
    expect(settings.saved).toEqual(DEFAULTS.saved);
  });
});

describe("saveList", () => {
  it("persists one list without disturbing the other", async () => {
    const store = stubStorage({
      [KEY]: JSON.stringify({ saved: { favorites: ["25544"], watchlist: ["20580"] } }),
    });
    const { settings, saveList } = await freshSettings();
    saveList("watchlist", ["20580", "36086"]);
    expect(settings.saved.favorites).toEqual(["25544"]);
    expect(settings.saved.watchlist).toEqual(["20580", "36086"]);
    expect(JSON.parse(store[KEY]).saved).toEqual({
      favorites: ["25544"],
      watchlist: ["20580", "36086"],
    });
  });

  it("accepts a Set as well as an array", async () => {
    stubStorage();
    const { settings, saveList } = await freshSettings();
    saveList("favorites", new Set(["25544", "20580"]));
    expect(settings.saved.favorites).toEqual(["25544", "20580"]);
  });

  it("ignores an unknown list name", async () => {
    stubStorage();
    const { settings, saveList } = await freshSettings();
    saveList("bookmarks", ["25544"]);
    expect(settings).not.toHaveProperty("bookmarks");
    expect(settings.saved).toEqual({ favorites: [], watchlist: [] });
  });

  it("validates what it stores, so junk can't get in via a write", async () => {
    stubStorage();
    const { settings, saveList } = await freshSettings();
    saveList("favorites", ["25544", 42, null]);
    expect(settings.saved.favorites).toEqual(["25544"]);
  });
});

describe("legacy ot_favs migration", () => {
  it("copies the old key's favourites forward on first read", async () => {
    stubStorage({ [LEGACY]: JSON.stringify(["25544", "20580", "36086"]) });
    const { settings } = await freshSettings();
    expect(settings.saved.favorites).toEqual(["25544", "20580", "36086"]);
    expect(settings.saved.watchlist).toEqual([]);
  });

  it("migrates a populated key with no data loss, whatever else is stored", async () => {
    const ids = ["25544", "20580", "36086", "25575", "neo_3"];
    stubStorage({
      [KEY]: JSON.stringify({ units: "metric", reduceMotion: true }),
      [LEGACY]: JSON.stringify(ids),
    });
    const { settings } = await freshSettings();
    expect(settings.saved.favorites).toEqual(ids);
    // the rest of the blob is untouched by the migration
    expect(settings.units).toBe("metric");
    expect(settings.reduceMotion).toBe(true);
  });

  it("leaves ot_favs itself in localStorage, untouched", async () => {
    const legacy = JSON.stringify(["25544", "20580"]);
    const store = stubStorage({ [LEGACY]: legacy });
    const { saveList } = await freshSettings();
    expect(store[LEGACY]).toBe(legacy);
    // …and still untouched after the new key gets written
    saveList("watchlist", ["36086"]);
    expect(store[LEGACY]).toBe(legacy);
  });

  it("applies the same entry validation to the legacy key", async () => {
    stubStorage({ [LEGACY]: JSON.stringify(["25544", 20580, null, "25544", "20580"]) });
    const { settings } = await freshSettings();
    expect(settings.saved.favorites).toEqual(["25544", "20580"]);
  });

  it("shrugs off a corrupt or non-array legacy key", async () => {
    stubStorage({ [LEGACY]: "{not json" });
    const a = await freshSettings();
    expect(a.settings.saved.favorites).toEqual([]);

    vi.resetModules();
    stubStorage({ [LEGACY]: JSON.stringify({ 25544: true }) });
    const b = await freshSettings();
    expect(b.settings.saved.favorites).toEqual([]);
  });

  it("does not run once the new schema has been written", async () => {
    stubStorage({
      [KEY]: JSON.stringify({ saved: { favorites: [], watchlist: [] } }),
      [LEGACY]: JSON.stringify(["25544"]),
    });
    const { settings } = await freshSettings();
    expect(settings.saved.favorites).toEqual([]);
  });

  it("does not resurrect a migrated favourite the user then removed", async () => {
    // Boot 1: migrate, then un-favourite one of the two migrated objects.
    stubStorage({ [LEGACY]: JSON.stringify(["25544", "20580"]) });
    const first = await freshSettings();
    expect(first.settings.saved.favorites).toEqual(["25544", "20580"]);
    first.saveList("favorites", ["25544"]);

    // Boot 2: same storage, fresh module — the removal has to stick, even
    // though ot_favs still lists both.
    vi.resetModules();
    const second = await import("../src/settings.js");
    expect(second.settings.saved.favorites).toEqual(["25544"]);
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

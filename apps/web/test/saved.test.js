// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Favourites and Watchlist (ui/favorites.js) — two independent lists over one
 * storage key. The thing worth pinning down is that they really are
 * independent: the same object can sit in both, and a write to one must never
 * disturb the other (settings.js validates `{ ...settings, ...patch }`, so a
 * partial `saved` patch would silently blank the list it left out).
 *
 * Both modules read localStorage at import time, so each case stubs storage
 * first and then imports a fresh copy via vi.resetModules().
 */

const KEY = "ot-settings";
const LEGACY = "ot_favs";

// The info-card header, as index.html declares it: a text-glyph star and an
// inline-SVG eye, both painted by favorites.js.
const HEADER = `
  <div class="ph">
    <button type="button" id="fav-btn" aria-label="Save to favourites" title="Save to favourites">☆</button>
    <button type="button" id="watch-btn" aria-label="Add to watchlist" title="Add to watchlist" aria-pressed="false"><svg viewBox="0 0 24 24"><circle class="pupil" cx="12" cy="12" r="2.7"/></svg></button>
  </div>`;

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

async function load(stored, legacyFavs) {
  document.body.innerHTML = HEADER;
  vi.resetModules();
  const initial = {};
  if (stored) initial[KEY] = JSON.stringify(stored);
  if (legacyFavs) initial[LEGACY] = JSON.stringify(legacyFavs);
  const store = stubStorage(initial);
  const saved = await import("../src/ui/favorites.js");
  const state = (await import("../src/state.js")).state;
  return { saved, state, store };
}

const savedIn = (store) => JSON.parse(store[KEY]).saved;

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe("two independent lists", () => {
  it("starts empty when nothing is stored", async () => {
    const { saved } = await load();
    expect(saved.savedIds("favorites")).toEqual([]);
    expect(saved.savedIds("watchlist")).toEqual([]);
  });

  it("loads each list from settings", async () => {
    const { saved } = await load({ saved: { favorites: ["25544"], watchlist: ["20580"] } });
    expect(saved.isSaved("favorites", "25544")).toBe(true);
    expect(saved.isSaved("watchlist", "25544")).toBe(false);
    expect(saved.isSaved("watchlist", "20580")).toBe(true);
  });

  it("adds to favourites without touching the watchlist", async () => {
    const { saved, store } = await load();
    expect(saved.toggleSaved("favorites", "25544")).toBe(true);
    expect(saved.savedIds("favorites")).toEqual(["25544"]);
    expect(saved.savedIds("watchlist")).toEqual([]);
    expect(savedIn(store)).toEqual({ favorites: ["25544"], watchlist: [] });
  });

  it("adds to the watchlist without touching favourites", async () => {
    const { saved, store } = await load({ saved: { favorites: ["25544"], watchlist: [] } });
    expect(saved.toggleSaved("watchlist", "20580")).toBe(true);
    expect(saved.savedIds("favorites")).toEqual(["25544"]);
    expect(savedIn(store)).toEqual({ favorites: ["25544"], watchlist: ["20580"] });
  });

  it("holds the same object in both at once — they aren't mutually exclusive", async () => {
    const { saved, store } = await load();
    saved.toggleSaved("favorites", "25544");
    saved.toggleSaved("watchlist", "25544");
    expect(saved.isSaved("favorites", "25544")).toBe(true);
    expect(saved.isSaved("watchlist", "25544")).toBe(true);
    expect(savedIn(store)).toEqual({ favorites: ["25544"], watchlist: ["25544"] });
  });

  it("removes from one list and leaves it in the other", async () => {
    const { saved, store } = await load({
      saved: { favorites: ["25544", "20580"], watchlist: ["25544"] },
    });
    expect(saved.toggleSaved("favorites", "25544")).toBe(false);
    expect(saved.savedIds("favorites")).toEqual(["20580"]);
    expect(saved.savedIds("watchlist")).toEqual(["25544"]);
    expect(savedIn(store)).toEqual({ favorites: ["20580"], watchlist: ["25544"] });
  });

  it("toggles back and forth without accumulating duplicates", async () => {
    const { saved } = await load();
    saved.toggleSaved("watchlist", "25544");
    saved.toggleSaved("watchlist", "25544");
    saved.toggleSaved("watchlist", "25544");
    expect(saved.savedIds("watchlist")).toEqual(["25544"]);
  });

  it("keeps insertion order — oldest saved first", async () => {
    const { saved } = await load();
    for (const id of ["25544", "20580", "36086"]) saved.toggleSaved("favorites", id);
    expect(saved.savedIds("favorites")).toEqual(["25544", "20580", "36086"]);
  });

  it("ignores an unknown list name and a missing id", async () => {
    const { saved } = await load();
    expect(saved.toggleSaved("bookmarks", "25544")).toBe(false);
    expect(saved.toggleSaved("favorites", "")).toBe(false);
    expect(saved.isSaved("bookmarks", "25544")).toBe(false);
    expect(saved.savedIds("bookmarks")).toEqual([]);
  });

  it("picks up favourites migrated from the legacy ot_favs key", async () => {
    const { saved, store } = await load(null, ["25544", "20580"]);
    expect(saved.savedIds("favorites")).toEqual(["25544", "20580"]);
    expect(saved.savedIds("watchlist")).toEqual([]);
    // a later write carries the migrated ids into the new key, and still
    // leaves the old one alone
    saved.toggleSaved("watchlist", "36086");
    expect(savedIn(store).favorites).toEqual(["25544", "20580"]);
    expect(store[LEGACY]).toBe(JSON.stringify(["25544", "20580"]));
  });
});

describe("info-card buttons", () => {
  const iss = { id: "25544", name: "ISS (ZARYA)", cat: "stations" };
  const fav = () => document.getElementById("fav-btn");
  const watch = () => document.getElementById("watch-btn");

  it("paints both buttons from stored state on selection", async () => {
    const { saved } = await load({ saved: { favorites: ["25544"], watchlist: [] } });
    saved.updateSavedButtons(iss);
    expect(fav().textContent).toBe("★");
    expect(fav().classList.contains("saved")).toBe(true);
    expect(watch().classList.contains("saved")).toBe(false);
    expect(watch().getAttribute("aria-pressed")).toBe("false");
    expect(watch().getAttribute("aria-label")).toBe("Add to watchlist");
  });

  it("toggles favourites from the star, leaving the eye alone", async () => {
    const { saved, state, store } = await load();
    saved.initSavedButtons();
    state.selected = iss;

    fav().click();
    expect(saved.isSaved("favorites", "25544")).toBe(true);
    expect(fav().textContent).toBe("★");
    expect(fav().getAttribute("aria-label")).toBe("Remove from favourites");
    expect(watch().classList.contains("saved")).toBe(false);
    expect(savedIn(store)).toEqual({ favorites: ["25544"], watchlist: [] });

    fav().click();
    expect(saved.isSaved("favorites", "25544")).toBe(false);
    expect(fav().textContent).toBe("☆");
    expect(savedIn(store)).toEqual({ favorites: [], watchlist: [] });
  });

  it("toggles the watchlist from the eye, leaving the star alone", async () => {
    const { saved, state, store } = await load();
    saved.initSavedButtons();
    state.selected = iss;

    watch().click();
    expect(saved.isSaved("watchlist", "25544")).toBe(true);
    expect(watch().classList.contains("saved")).toBe(true);
    expect(watch().getAttribute("aria-pressed")).toBe("true");
    expect(watch().getAttribute("aria-label")).toBe("Remove from watchlist");
    expect(fav().textContent).toBe("☆");
    expect(savedIn(store)).toEqual({ favorites: [], watchlist: ["25544"] });

    watch().click();
    expect(saved.isSaved("watchlist", "25544")).toBe(false);
    expect(watch().classList.contains("saved")).toBe(false);
    expect(watch().getAttribute("aria-pressed")).toBe("false");
  });

  it("saves the same object to both lists from the two buttons", async () => {
    const { saved, state, store } = await load();
    saved.initSavedButtons();
    state.selected = iss;
    fav().click();
    watch().click();
    expect(fav().classList.contains("saved")).toBe(true);
    expect(watch().classList.contains("saved")).toBe(true);
    expect(savedIn(store)).toEqual({ favorites: ["25544"], watchlist: ["25544"] });
  });

  it("does nothing when no object is selected", async () => {
    const { saved, state } = await load();
    saved.initSavedButtons();
    state.selected = null;
    fav().click();
    watch().click();
    expect(saved.savedIds("favorites")).toEqual([]);
    expect(saved.savedIds("watchlist")).toEqual([]);
  });
});

/**
 * User preferences, persisted to localStorage.
 *
 * The app's first real settings surface. Two ad-hoc persisted values predate
 * it — `ot_favs` (ui/favorites.js) and `ot-globe-style` (scene/earth.js) —
 * and the globe-style one is deliberately left alone: it already works, and
 * moving it would risk losing a preference for no functional gain. `ot_favs`
 * is the one exception, and only in one direction: the Saved lists below need
 * a shape that key can't express (two lists, not one), so its contents are
 * copied forward once — see migrateLegacyFavs(). The key itself is never
 * written to or deleted. Everything else new lives under one key holding one
 * object, so a future setting is a schema addition rather than another
 * top-level key.
 *
 * Every read is schema-validated against DEFAULTS rather than trusted: this
 * value survives across app versions, so a key that has since changed shape
 * (or a hand-edited/corrupted blob) must degrade to the default instead of
 * poisoning state. Writes are try/catch wrapped — localStorage throws in
 * Safari private mode, and a settings write must never break the app.
 */
const KEY = "ot-settings";

/** Pre-Saved-lists favourites, written by an older ui/favorites.js. Read-only. */
const LEGACY_FAVS_KEY = "ot_favs";

/**
 * The two Saved lists. Independent booleans per object, not states of one
 * field: an object can sit in both at once, and adding to one never touches
 * the other.
 */
export const SAVED_LISTS = ["favorites", "watchlist"];

export const DEFAULTS = {
  locationPermissionDenied: false,
  units: "imperial",
  reduceMotion: false,
  saved: { favorites: [], watchlist: [] },
};

const UNIT_VALUES = ["imperial", "metric"];

/**
 * A fresh empty saved-lists object. Never hand out DEFAULTS.saved itself —
 * `{ ...DEFAULTS }` is a shallow copy, so a shared nested object would let one
 * validate() call's mutations leak into every later default.
 */
function emptySaved() {
  return { favorites: [], watchlist: [] };
}

/**
 * One saved list: object IDs as strings (`state.byId` keys — "25544",
 * "neo_3"). Anything else in the array is dropped rather than throwing, the
 * same way an unknown `units` value degrades to the default: this blob
 * survives across app versions and can be hand-edited, and a malformed entry
 * must never take the whole list — or the app — down with it.
 */
function validateIdList(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const id = v.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Coerce one arbitrary parsed blob into a valid settings object. */
function validate(raw) {
  const out = { ...DEFAULTS, saved: emptySaved() };
  if (!raw || typeof raw !== "object") return out;

  if (typeof raw.locationPermissionDenied === "boolean") {
    out.locationPermissionDenied = raw.locationPermissionDenied;
  }
  if (UNIT_VALUES.includes(raw.units)) out.units = raw.units;
  if (typeof raw.reduceMotion === "boolean") out.reduceMotion = raw.reduceMotion;
  if (raw.saved && typeof raw.saved === "object") {
    out.saved = {
      favorites: validateIdList(raw.saved.favorites),
      watchlist: validateIdList(raw.saved.watchlist),
    };
  }

  return out;
}

/** Has this blob ever been written by a version that knows about Saved lists? */
function hasSavedLists(raw) {
  return !!raw && typeof raw === "object" && !!raw.saved && typeof raw.saved === "object";
}

/**
 * Copy the legacy `ot_favs` favourites forward into saved.favorites, in place.
 *
 * Read-and-copy-forward, not a move: `ot_favs` is left in localStorage exactly
 * as it was — never rewritten, never removed. Runs only when the stored
 * settings blob has no `saved` object at all, i.e. before the first write of
 * the new schema. That's what makes it a one-time migration without needing a
 * separate "migrated" flag: any later change to either list persists a `saved`
 * object, so un-favouriting a migrated object can't be resurrected by the old
 * key on the next boot.
 *
 * Merges rather than replaces, so a `saved.favorites` that somehow already has
 * entries keeps them.
 */
function migrateLegacyFavs(out) {
  let legacy = null;
  try {
    legacy = JSON.parse(localStorage.getItem(LEGACY_FAVS_KEY) || "null");
  } catch {
    return out;
  }
  const ids = validateIdList(legacy);
  if (!ids.length) return out;
  const merged = new Set(out.saved.favorites);
  for (const id of ids) merged.add(id);
  out.saved.favorites = [...merged];
  return out;
}

function read() {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    raw = null;
  }
  const out = validate(raw);
  return hasSavedLists(raw) ? out : migrateLegacyFavs(out);
}

/**
 * The live settings object. A module singleton so call sites can read
 * `settings.units` directly without a getter on every access — the info card
 * re-reads it several times per second.
 */
export const settings = read();

/** Merge `patch` into the live settings and persist. Returns the settings. */
export function saveSettings(patch) {
  Object.assign(settings, validate({ ...settings, ...patch }));
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Private mode / quota — the in-memory change still applies for this
    // session, which is the best we can honestly do.
  }
  return settings;
}

/**
 * Persist one Saved list, leaving the other exactly as it is.
 *
 * Always go through this rather than patching `saved` directly: saveSettings
 * validates `{ ...settings, ...patch }`, and a patch carrying only one list
 * would leave the other one `undefined` — which validate() then reads as an
 * empty list and silently wipes.
 */
export function saveList(list, ids) {
  if (!SAVED_LISTS.includes(list)) return settings;
  return saveSettings({ saved: { ...settings.saved, [list]: [...ids] } });
}

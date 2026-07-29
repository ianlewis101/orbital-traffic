/**
 * User preferences, persisted to localStorage.
 *
 * The app's first real settings surface. Two ad-hoc persisted values predate
 * it — `ot_favs` (ui/favorites.js) and `ot-globe-style` (scene/earth.js) —
 * and are deliberately left alone: they already work, and migrating them
 * would risk losing a user's saved objects for no functional gain. Everything
 * new lives under one key holding one object, so a future setting is a schema
 * addition rather than another top-level key.
 *
 * Every read is schema-validated against DEFAULTS rather than trusted: this
 * value survives across app versions, so a key that has since changed shape
 * (or a hand-edited/corrupted blob) must degrade to the default instead of
 * poisoning state. Writes are try/catch wrapped — localStorage throws in
 * Safari private mode, and a settings write must never break the app.
 */
const KEY = "ot-settings";

export const DEFAULTS = {
  locationPermissionDenied: false,
  units: "imperial",
  reduceMotion: false,
};

const UNIT_VALUES = ["imperial", "metric"];

/** Coerce one arbitrary parsed blob into a valid settings object. */
function validate(raw) {
  const out = { ...DEFAULTS };
  if (!raw || typeof raw !== "object") return out;

  if (typeof raw.locationPermissionDenied === "boolean") {
    out.locationPermissionDenied = raw.locationPermissionDenied;
  }
  if (UNIT_VALUES.includes(raw.units)) out.units = raw.units;
  if (typeof raw.reduceMotion === "boolean") out.reduceMotion = raw.reduceMotion;

  return out;
}

function read() {
  try {
    return validate(JSON.parse(localStorage.getItem(KEY) || "null"));
  } catch {
    return { ...DEFAULTS };
  }
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

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
import { CATS } from "./config.js";
import { state } from "./state.js";

const KEY = "ot-settings";

/**
 * Categories hidden when nothing has been configured. Mirrors state.js's
 * initial `hidden` set — the two must agree, or a first-run user and a user
 * who has opened Settings once would see different globes.
 */
export const DEFAULT_HIDDEN = ["debris", "other"];

export const DEFAULTS = {
  locationPermissionDenied: false,
  // null means "never configured" — seedDisplayCategories() then leaves
  // state.hidden at its DEFAULT_HIDDEN value. An object here is a complete
  // {catId: visible} map covering every CATS key.
  displayCategories: null,
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

  if (raw.displayCategories && typeof raw.displayCategories === "object") {
    // Rebuild from the live CATS keys rather than trusting the stored key
    // set: a category added since this was written must appear (visible
    // unless it's a default-hidden one), and a category since removed must
    // not linger.
    const cats = {};
    for (const c of Object.keys(CATS)) {
      const v = raw.displayCategories[c];
      cats[c] = typeof v === "boolean" ? v : !DEFAULT_HIDDEN.includes(c);
    }
    out.displayCategories = cats;
  }
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

/** Every category visible by default, as a fresh {catId: visible} map. */
export function defaultDisplayCategories() {
  const cats = {};
  for (const c of Object.keys(CATS)) cats[c] = !DEFAULT_HIDDEN.includes(c);
  return cats;
}

/**
 * Seed `state.hidden` from the saved display categories.
 *
 * Deliberately one-way and boot-only. Settings decides what is visible when
 * the app loads; from then on the in-scene legend is a live, session-only
 * view filter with its own independent state, and never writes back here.
 *
 * MUST run before buildClouds() — scene/clouds.js reads state.hidden at build
 * time to set each cloud's initial visibility, so seeding afterwards would
 * leave the toggles and the globe disagreeing until the next rebuild.
 */
export function seedDisplayCategories() {
  const cats = settings.displayCategories;
  if (!cats) return;
  state.hidden.clear();
  for (const [c, visible] of Object.entries(cats)) {
    if (!visible) state.hidden.add(c);
  }
}

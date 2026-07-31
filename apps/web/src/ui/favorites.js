/**
 * Saved objects — Favourites and Watchlist.
 *
 * Two independent lists, not two states of one field: an object can be in
 * both at once, and adding to one never touches the other. Favourites is
 * "things I care about"; Watchlist is "things I want to check back on".
 *
 * Storage lives in settings.js's single `ot-settings` key (saved.favorites /
 * saved.watchlist) — this module keeps the in-memory Sets everything else
 * reads, and owns both info-card header buttons (paint + wiring), which is
 * what it already did for the star alone.
 */
import { state } from "../state.js";
import { settings, saveList } from "../settings.js";
import { toast } from "./status.js";

/**
 * The live sets. Exported by name because they read better at call sites than
 * `savedIds("favorites")` does, and because `has()` is what the info card and
 * the Settings panel actually want.
 */
export const favs = new Set(settings.saved.favorites);
export const watchlist = new Set(settings.saved.watchlist);

/**
 * Per-list wiring, in one table so the two buttons can't drift apart. `btn`
 * is a static element in index.html (both icons live in the markup, like the
 * search/gear/FAB icons do) — nothing here injects HTML.
 */
const LISTS = {
  favorites: {
    set: favs,
    btn: "fav-btn",
    on: "Remove from favourites",
    off: "Save to favourites",
    added: "★ Saved to favourites",
    removed: "Removed from favourites",
  },
  watchlist: {
    set: watchlist,
    btn: "watch-btn",
    on: "Remove from watchlist",
    off: "Add to watchlist",
    added: "Added to watchlist",
    removed: "Removed from watchlist",
  },
};

/** Is `id` in `list`? Unknown list names answer false rather than throwing. */
export function isSaved(list, id) {
  return !!LISTS[list]?.set.has(id);
}

/** The IDs in `list`, in insertion order — oldest saved first. */
export function savedIds(list) {
  return LISTS[list] ? [...LISTS[list].set] : [];
}

/** Add or remove `id`, persist, and return its new membership. */
export function toggleSaved(list, id) {
  const cfg = LISTS[list];
  if (!cfg || !id) return false;
  if (cfg.set.has(id)) cfg.set.delete(id);
  else cfg.set.add(id);
  saveList(list, cfg.set);
  return cfg.set.has(id);
}

function paint(list, s) {
  const cfg = LISTS[list];
  const b = document.getElementById(cfg.btn);
  if (!b || !s) return;
  const on = cfg.set.has(s.id);
  b.classList.toggle("saved", on);
  b.title = on ? cfg.on : cfg.off;
  b.setAttribute("aria-label", b.title);
  if (b.hasAttribute("aria-pressed")) b.setAttribute("aria-pressed", on ? "true" : "false");
  // The star carries its state in the glyph itself; the watchlist eye is an
  // inline SVG that changes colour and fills its pupil via the .saved class.
  if (list === "favorites") b.textContent = on ? "★" : "☆";
}

/** Repaint the star for `s`. Kept as its own export — the original entry point. */
export function updateFavBtn(s) {
  paint("favorites", s);
}

/** Repaint both header buttons for the newly selected object. */
export function updateSavedButtons(s) {
  paint("favorites", s);
  paint("watchlist", s);
}

/** Wire both header buttons. Call once at boot, from initInfoCard(). */
export function initSavedButtons() {
  for (const list of Object.keys(LISTS)) {
    const b = document.getElementById(LISTS[list].btn);
    if (!b) continue;
    b.onclick = () => {
      const s = state.selected;
      if (!s) return;
      const on = toggleSaved(list, s.id);
      paint(list, s);
      toast(on ? LISTS[list].added : LISTS[list].removed);
    };
  }
}

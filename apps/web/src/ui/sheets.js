/**
 * Mutual exclusion for the panel sheets (What's Overhead, Settings, Tracked
 * Chain).
 *
 * On mobile they all render as a bottom sheet anchored at bottom:0, so only
 * one may be open at a time. This lives in its own module rather than in any
 * one panel so none of them has to import the others — overhead.js already
 * imports settings.js for its "Open Settings" affordance, and adding the
 * reverse import would close an ESM cycle for no benefit.
 *
 * Only the *card* is closed here. A chain closed this way stays lit on the
 * globe and selected in state — the scene highlight is the feature, and the
 * "Today in Space" row reopens the card. Clearing it outright is ui/chain.js's
 * clearChain(), wired to ✕ and Escape.
 *
 * The info card is deliberately not in this set. It sits earlier in the DOM,
 * so an opening sheet paints over it and reveals it again on close, which
 * keeps the user's selection intact instead of tearing it down.
 */
const SHEET_IDS = ["overhead", "settings", "chain"];

/** Openers whose aria-expanded state has to follow their sheet closing. */
const SHEET_OPENERS = { overhead: "overhead-fab", settings: "settings-btn" };

/** Close every registered sheet except `keepId`. */
export function closeOtherSheets(keepId) {
  for (const id of SHEET_IDS) {
    if (id === keepId) continue;
    document.getElementById(id)?.classList.remove("show");
    const opener = SHEET_OPENERS[id];
    if (opener) document.getElementById(opener)?.setAttribute("aria-expanded", "false");
  }
}

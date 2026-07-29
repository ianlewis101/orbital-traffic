/**
 * Mutual exclusion for the panel sheets (What's Overhead, Settings).
 *
 * On mobile both render as a bottom sheet anchored at bottom:0, so only one
 * may be open at a time. This lives in its own module rather than in either
 * panel so neither has to import the other — overhead.js already imports
 * settings.js for its "Open Settings" affordance, and adding the reverse
 * import would close an ESM cycle for no benefit.
 *
 * The info card is deliberately not in this set. It sits earlier in the DOM,
 * so an opening sheet paints over it and reveals it again on close, which
 * keeps the user's selection intact instead of tearing it down.
 */
const SHEET_IDS = ["overhead", "settings"];

/** Close every registered sheet except `keepId`. */
export function closeOtherSheets(keepId) {
  for (const id of SHEET_IDS) {
    if (id === keepId) continue;
    document.getElementById(id)?.classList.remove("show");
    document
      .getElementById(id === "overhead" ? "overhead-fab" : "settings-btn")
      ?.setAttribute("aria-expanded", "false");
  }
}

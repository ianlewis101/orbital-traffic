import { $ } from "../state.js";

/**
 * Sets (or clears) the small freshness note prepended to the info card's
 * attribution footer (#info-attr) — e.g. "Crew data as of 2m ago". Shared by
 * crew.js (station cards) and capsule-status.js (capsule cards) so both
 * surface their data's age in the same footer line instead of each carving
 * out its own spot (a stacked label under the station card's crew count, a
 * standalone strip on the capsule card) that created an awkward gap.
 */
export function setInfoFreshness(text) {
  const el = $("#info-fresh");
  if (!el) return;
  el.textContent = text ? text + " · " : "";
}

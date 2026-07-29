/**
 * Reduce-motion, as an explicit in-app preference.
 *
 * The stylesheet already honours the OS-level `prefers-reduced-motion` media
 * query (app.css). This adds a user-controlled equivalent for people whose
 * device setting doesn't match what they want here specifically, and drives
 * the two behaviours CSS can't reach: orbit trails and the pulsing selection
 * ring, which are drawn rather than animated.
 *
 * What it deliberately does NOT do is stop the globe. app.css documents the
 * reasoning for the media query and the same reasoning applies here: the
 * Three.js globe is the content, not decoration — freezing it would turn a
 * live tracker into a still image, which isn't what a comfort setting should
 * mean.
 */
import { settings } from "../settings.js";

export const REDUCE_MOTION_CLASS = "reduce-motion";

/** Is motion reduced, by app preference or by OS setting? */
export function motionReduced() {
  if (settings.reduceMotion) return true;
  try {
    return !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Reflect the current preference onto <html> so the stylesheet can act. */
export function applyReduceMotion() {
  const root = document.documentElement;
  if (!root) return;
  root.classList.toggle(REDUCE_MOTION_CLASS, !!settings.reduceMotion);
}

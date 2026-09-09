/**
 * Swipe-down-to-dismiss for the mobile bottom sheets (Settings, Tracked
 * Chain).
 *
 * The physics are the object card's, unchanged (ui/info.js's
 * swipe-to-collapse): a drag only "grabs" past a 6px vertical threshold and
 * only when the sheet's own scroller is already at the top, so a downward
 * flick inside a scrolled list scrolls instead of dismissing; an upward move
 * releases the gesture entirely; and a release only commits past an 80px
 * drag or a fast enough flick, otherwise the sheet springs back open.
 *
 * ui/info.js keeps its own copy on purpose — it collapses to the mini-card
 * rather than dismissing, so its commit branch drives different state. This
 * module is the dismiss variant, shared by the sheets that simply close.
 */
import { $ } from "../state.js";

const isMobileLayout = () => window.matchMedia("(max-width:768px)").matches;

/** Vertical travel before a touch is treated as a drag rather than a tap. */
const GRAB_PX = 6;
/** Drag distance that commits to dismissing on release. */
const COMMIT_PX = 80;
/** Release speed (px/ms) that commits regardless of distance — a flick. */
const COMMIT_VELOCITY = 0.5;

/**
 * Wire the gesture onto one sheet.
 *
 * @param {string} panelId          id of the sheet element
 * @param {string} scrollerId       id of its scrolling body (kept as ids, not
 *   elements, because both are re-queried per gesture — the panels are static
 *   markup but their contents are re-rendered underneath them)
 * @param {() => void} onDismiss    what "closed" means for this sheet
 * @returns {() => void} `reset` — abandons any in-flight drag animation and
 *   clears the inline transform. A sheet that is opened or closed by some
 *   other route (its ✕, Escape, another sheet taking the slot) must call this,
 *   or a settling animation from the last gesture lands on the reopened sheet
 *   and slides it back off the screen.
 */
export function attachSheetSwipe(panelId, scrollerId, onDismiss) {
  const panel = () => $("#" + panelId);
  const p = panel();
  if (!p) return () => {};

  let drag = null;
  let animGen = 0;

  function onTouchStart(e) {
    if (!isMobileLayout()) return;
    drag = { startY: e.touches[0].clientY, dragging: false };
  }

  function onTouchMove(e) {
    if (!drag) return;
    const y = e.touches[0].clientY;
    if (!drag.dragging) {
      const dy0 = y - drag.startY;
      const body = $("#" + scrollerId);
      if (dy0 > GRAB_PX && (!body || body.scrollTop <= 0)) {
        drag.dragging = true;
        drag.dragStartY = y;
        drag.dragStartTime = performance.now();
        panel().style.transition = "none";
      } else if (dy0 < -GRAB_PX) {
        drag = null;
        return;
      } else return;
    }
    drag.lastY = y;
    e.preventDefault();
    panel().style.transform = `translateY(${Math.max(0, y - drag.dragStartY)}px)`;
  }

  function onTouchEnd() {
    if (!drag || !drag.dragging) {
      drag = null;
      return;
    }
    const dy = Math.max(0, drag.lastY - drag.dragStartY);
    const elapsed = Math.max(1, performance.now() - drag.dragStartTime);
    drag = null;
    panel().style.transition = "";
    if (dy > COMMIT_PX || dy / elapsed > COMMIT_VELOCITY) dismiss();
    else snapOpen();
  }

  function onTouchCancel() {
    if (!drag) return;
    const wasDragging = drag.dragging;
    drag = null;
    panel().style.transition = "";
    if (wasDragging) snapOpen();
  }

  function dismiss() {
    const el = panel();
    const gen = ++animGen;
    el.style.transition = "transform .3s cubic-bezier(.32,.72,0,1)";
    el.style.transform = "translateY(110%)";
    setTimeout(() => {
      if (animGen !== gen) return;
      onDismiss();
      // Cleared only after the sheet is hidden, so the next open starts from
      // the slide-up animation rather than 110% down the screen.
      el.style.transition = "";
      el.style.transform = "";
    }, 300);
  }

  function snapOpen() {
    const el = panel();
    const gen = ++animGen;
    el.style.transition = "transform .32s cubic-bezier(.34,1.56,.64,1)";
    el.style.transform = "translateY(0)";
    setTimeout(() => {
      if (animGen !== gen) return;
      el.style.transition = "";
      el.style.transform = "";
    }, 320);
  }

  p.addEventListener("touchstart", onTouchStart, { passive: true });
  p.addEventListener("touchmove", onTouchMove, { passive: false });
  p.addEventListener("touchend", onTouchEnd);
  p.addEventListener("touchcancel", onTouchCancel);

  return function reset() {
    animGen++;
    drag = null;
    const el = panel();
    if (!el) return;
    el.style.transition = "";
    el.style.transform = "";
  };
}

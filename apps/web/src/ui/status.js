import { state, $ } from "../state.js";

export function updateCount() {
  const n = state.sats.length;
  $("#legend-tot").textContent = n.toLocaleString();
}

export function flash(el) {
  if (el) el.animate([{ color: "#fff" }, {}], { duration: 600 });
}

/**
 * Toast tones. The default is the brand teal (--amber, #5eead4) because most
 * toasts are confirmations — "★ Saved to favourites", "Catalog refreshed" —
 * and a red one reads as an error that just happened. Red is reserved for
 * genuine failures, passed explicitly by the two call sites that have one.
 *
 * Written as rgba literals rather than var(--amber): the tint and the border
 * need their own alphas, and the text is a lighter step of the same hue so it
 * stays legible over the daylit Earth this floats above.
 */
const TONES = {
  ok: { bg: "rgba(94,234,212,0.12)", line: "rgba(94,234,212,0.4)", ink: "#99f6e4" },
  error: { bg: "rgba(255,107,107,0.12)", line: "rgba(255,107,107,0.4)", ink: "#ffb4b4" },
};

export function toast(msg, tone = "ok") {
  const c = TONES[tone] || TONES.ok;
  const t = document.createElement("div");
  t.textContent = msg;
  t.style.cssText =
    "position:fixed;bottom:60px;left:50%;transform:translateX(-50%);z-index:30;font-family:var(--mono);font-size:11px;letter-spacing:.06em;padding:10px 16px;" +
    `background:${c.bg};border:1px solid ${c.line};color:${c.ink};` +
    "border-radius:3px;backdrop-filter:blur(10px)";
  document.body.appendChild(t);
  setTimeout(() => {
    t.style.transition = "opacity .5s";
    t.style.opacity = 0;
    setTimeout(() => t.remove(), 500);
  }, 3600);
}

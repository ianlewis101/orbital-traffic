import { state, $ } from "../state.js";

export function updateCount() {
  const n = state.sats.length;
  $("#legend-tot").textContent = n.toLocaleString();
}

export function flash(el) {
  if (el) el.animate([{ color: "#fff" }, {}], { duration: 600 });
}

export function toast(msg) {
  const t = document.createElement("div");
  t.textContent = msg;
  t.style.cssText =
    "position:fixed;bottom:60px;left:50%;transform:translateX(-50%);z-index:30;font-family:var(--mono);font-size:11px;letter-spacing:.06em;padding:10px 16px;background:rgba(255,107,107,0.12);border:1px solid rgba(255,107,107,0.4);color:#ffb4b4;border-radius:3px;backdrop-filter:blur(10px)";
  document.body.appendChild(t);
  setTimeout(() => {
    t.style.transition = "opacity .5s";
    t.style.opacity = 0;
    setTimeout(() => t.remove(), 500);
  }, 3600);
}

import { state, $ } from "../state.js";
import { updatePositions } from "../scene/clouds.js";
import { buildTrail } from "../scene/trail.js";
import { refreshInfo } from "./info.js";

const RATES = [
  ["REAL", 1],
  ["10×", 10],
  ["60×", 60],
  ["300×", 300],
  ["∥", 0],
];

export function setRate(v, btn) {
  state.rate = v;
  document.querySelectorAll(".tbtn").forEach((b) => b.classList.remove("on"));
  if (btn) btn.classList.add("on");
  const lbl = $("#rate-lbl");
  lbl.textContent = v === 0 ? "PAUSED" : v === 1 ? "REAL-TIME" : v + "× SPEED";
  lbl.style.color = v === 1 ? "var(--amber)" : v === 0 ? "var(--ink-dim)" : "var(--signal)";
  const cm = $("#clock-mode");
  cm.textContent = v === 0 ? "PAUSED" : v === 1 ? "LIVE" : "+" + v + "×";
  cm.style.color = v === 1 ? "var(--good)" : v === 0 ? "var(--ink-dim)" : "var(--signal)";
  cm.classList.toggle("live", v === 1);
}

export function initTimeMachine() {
  const box = $("#rate-btns");
  RATES.forEach(([lbl, v]) => {
    const b = document.createElement("div");
    b.className = "tbtn" + (v === 1 ? " on" : "");
    b.textContent = lbl;
    b.onclick = () => setRate(v, b);
    box.appendChild(b);
  });

  const JUMPS = [
    ["-1d", -86400000],
    ["-1h", -3600000],
    ["NOW", 0],
    ["+1h", 3600000],
    ["+6h", 21600000],
    ["+1d", 86400000],
  ];
  const jbox = $("#jump-btns");
  if (!jbox) return;
  JUMPS.forEach(([lbl, ms]) => {
    const b = document.createElement("button");
    b.className = "jbtn" + (ms === 0 ? " now" : "");
    b.textContent = lbl;
    b.onclick = () => {
      if (ms === 0) {
        state.simNow = Date.now();
        setRate(1, document.querySelectorAll(".tbtn")[0]);
      } else state.simNow += ms;
      updatePositions(new Date(state.simNow));
      if (state.selected) {
        buildTrail(state.selected, new Date(state.simNow));
        refreshInfo();
      }
    };
    jbox.appendChild(b);
  });
}

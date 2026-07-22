import { state, $ } from "../state.js";
import { updatePositions } from "../scene/clouds.js";
import { buildTrail } from "../scene/trail.js";
import { refreshInfo } from "./info.js";
import { isTimeShifted } from "../util/freshness.js";

const RATES = [
  ["REAL", 1, "Real-time speed"],
  ["10×", 10, "10× speed"],
  ["60×", 60, "60× speed"],
  ["300×", 300, "300× speed"],
  ["∥", 0, "Pause"],
];

/**
 * The clock-mode badge describes the *simulation clock*, not the orbital
 * data — "LIVE" here means the globe is showing now at real speed, nothing
 * about the elements' freshness (that's the footer's job). Derived from rate
 * AND jump-shift together, so a jump at rate 1 no longer reads "LIVE" while
 * the globe sits hours away. Recomputed on every rate change, on every jump,
 * and periodically from the loop so paused/fast-forward drift updates it too.
 */
export function updateClockMode() {
  const cm = $("#clock-mode");
  if (!cm) return;
  let text, color;
  let pulse = false;
  if (state.rate === 0) {
    text = "PAUSED";
    color = "var(--ink-dim)";
  } else if (state.rate > 1) {
    text = "+" + state.rate + "×";
    color = "var(--signal)";
  } else if (isTimeShifted({ rate: state.rate, simNow: state.simNow })) {
    // rate === 1 but a jump moved the clock off wall-clock time.
    text = "SHIFTED";
    color = "var(--signal)";
  } else {
    text = "LIVE";
    color = "var(--good)";
    pulse = true;
  }
  cm.textContent = text;
  cm.style.color = color;
  cm.classList.toggle("live", pulse);
}

export function setRate(v, btn) {
  state.rate = v;
  document.querySelectorAll(".tbtn").forEach((b) => {
    b.classList.remove("on");
    b.setAttribute("aria-pressed", "false");
  });
  if (btn) {
    btn.classList.add("on");
    btn.setAttribute("aria-pressed", "true");
  }
  const lbl = $("#rate-lbl");
  lbl.textContent = v === 0 ? "PAUSED" : v === 1 ? "REAL-TIME" : v + "× SPEED";
  lbl.style.color = v === 1 ? "var(--amber)" : v === 0 ? "var(--ink-dim)" : "var(--signal)";
  updateClockMode();
}

export function initTimeMachine() {
  const box = $("#rate-btns");
  RATES.forEach(([lbl, v, aria]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tbtn" + (v === 1 ? " on" : "");
    b.setAttribute("aria-pressed", v === 1 ? "true" : "false");
    b.setAttribute("aria-label", aria);
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
      } else {
        state.simNow += ms;
        // A jump doesn't touch rate, so setRate() won't run — refresh the
        // badge here so it reflects the shift immediately, not up to half a
        // second later on the next loop tick.
        updateClockMode();
      }
      updatePositions(new Date(state.simNow));
      if (state.selected) {
        buildTrail(state.selected, new Date(state.simNow));
        refreshInfo();
      }
    };
    jbox.appendChild(b);
  });
}

import { $ } from "../state.js";
import { setGlobeStyle, getGlobeStyle } from "../scene/earth.js";

const STYLES = [
  ["REAL", "real", "REALISTIC"],
  ["OPS", "ops", "OPS CONSOLE"],
];

/** Globe-style toggle plate. Must run after initEarth(). */
export function initGlobeStyle() {
  const box = $("#globe-style-btns");
  if (!box) return;
  const lbl = $("#globe-style-lbl");
  const btns = [];
  const refresh = () => {
    const cur = getGlobeStyle();
    for (const [b, v, name] of btns) {
      const on = v === cur;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
      if (on && lbl) lbl.textContent = name;
    }
  };
  for (const [short, v, name] of STYLES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "gbtn";
    b.setAttribute("aria-label", name);
    b.textContent = short;
    b.onclick = () => {
      setGlobeStyle(v);
      refresh();
    };
    box.appendChild(b);
    btns.push([b, v, name]);
  }
  refresh();
}

import { CATS, catColorHex } from "../config.js";
import { state, $ } from "../state.js";
import { DATA } from "../data/store.js";
import { clouds } from "../scene/clouds.js";

export function rebuildLegend() {
  // always restore NEO count (resets after live fetch)
  state.cats.hazardous = DATA.neos.length;
  const box = $("#cats");
  box.innerHTML = "";
  for (const c in CATS) {
    if (state.cats[c] === 0) continue; // hide all empty categories
    const hex = catColorHex(c);
    const el = document.createElement("div");
    el.className = "cat" + (state.hidden.has(c) ? " off" : "");
    /* eslint-disable orbital/no-unescaped-innerhtml -- hex is catColorHex() output (a "#rrggbb" string); CATS[c].label is a fixed category label from config.js; the count uses toLocaleString(). */
    el.innerHTML = `<span class="sw" style="background:${hex};color:${hex}"></span>
      <span class="nm">${CATS[c].label}</span><span class="ct">${state.cats[c].toLocaleString()}</span>`;
    /* eslint-enable orbital/no-unescaped-innerhtml */
    el.onclick = () => {
      if (state.hidden.has(c)) state.hidden.delete(c);
      else state.hidden.add(c);
      if (clouds[c] && clouds[c].points) clouds[c].points.visible = !state.hidden.has(c);
      el.classList.toggle("off");
    };
    box.appendChild(el);
  }
}

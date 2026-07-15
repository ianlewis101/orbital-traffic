import { CATS, catColorHex } from "../config.js";
import { state, $ } from "../state.js";
import { DATA } from "../data/store.js";
import { clouds } from "../scene/clouds.js";

// Orbit Classes starts open and stays that way through category toggling and
// live data refreshes; selecting an object collapses it to hand screen space
// back to the info card. Only a manual click while collapsed reopens it —
// selecting further objects while it's collapsed must not fight that choice.
let legendCollapsed = false;

export function collapseLegend() {
  if (legendCollapsed) return;
  legendCollapsed = true;
  $("#cats").style.display = "none";
  $("#legend").classList.add("collapsed");
  $("#legend-toggle").textContent = "▸";
}

function expandLegend() {
  if (!legendCollapsed) return;
  legendCollapsed = false;
  $("#cats").style.display = "";
  $("#legend").classList.remove("collapsed");
  $("#legend-toggle").textContent = "▾";
}

export function initLegendToggle() {
  const ph = $("#legend-ph");
  if (ph) ph.onclick = () => legendCollapsed && expandLegend();
}

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
    el.innerHTML = `<span class="sw" style="background:${hex};color:${hex}"></span>
      <span class="nm">${
        // eslint-disable-next-line orbital/no-unescaped-innerhtml -- CATS[c].label is a fixed category label from config.js, not user/feed data
        CATS[c].label
      }</span><span class="ct">${state.cats[c].toLocaleString()}</span>`;
    el.onclick = () => {
      if (state.hidden.has(c)) state.hidden.delete(c);
      else state.hidden.add(c);
      if (clouds[c] && clouds[c].points) clouds[c].points.visible = !state.hidden.has(c);
      el.classList.toggle("off");
    };
    box.appendChild(el);
  }
}

import { catColorHex } from "../config.js";
import { state, $ } from "../state.js";
import { DATA } from "../data/store.js";
import { select } from "./info.js";

export function renderToday() {
  const box = $("#today-list");
  if (!box) return;
  box.innerHTML = "";
  DATA.hotlist.forEach((h) => {
    const sat = state.byId.get(h.id);
    const hex = catColorHex(sat ? sat.cat : "other");
    const el = document.createElement("div");
    el.className = "today-row";
    el.innerHTML = `<span class="sw" style="background:${hex};color:${hex}"></span>
      <div class="info"><div class="nm">${h.name}</div><div class="reason">${h.reason}</div></div>`;
    el.onclick = () => {
      const s = state.byId.get(h.id);
      if (s) select(s);
    };
    box.appendChild(el);
  });
}

export function initTodayToggle() {
  let todayOpen = false;
  $("#today-list").style.display = todayOpen ? "" : "none";
  $("#today-toggle").textContent = todayOpen ? "▾" : "▸";
  const todayPh = $("#today-ph");
  if (todayPh)
    todayPh.onclick = () => {
      todayOpen = !todayOpen;
      $("#today-list").style.display = todayOpen ? "" : "none";
      $("#today-toggle").textContent = todayOpen ? "▾" : "▸";
    };
}

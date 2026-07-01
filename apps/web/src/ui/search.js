import { catColorHex } from "../config.js";
import { state, $ } from "../state.js";
import { select } from "./info.js";

export function initSearch() {
  const sIn = $("#search-in"),
    sRes = $("#results"),
    sWrap = $("#search-wrap");
  const isMobileSearch = () => window.matchMedia("(max-width:768px)").matches;
  function collapseSearch() {
    sWrap.classList.remove("expanded");
    sRes.classList.remove("show");
    sIn.blur();
  }
  // Mobile-only: tap the icon to slide the bar open/closed; tap outside, Escape,
  // or submitting (Enter / picking a result) slides it back to the icon.
  $("#search svg").onclick = () => {
    if (!isMobileSearch()) return;
    if (sWrap.classList.toggle("expanded")) sIn.focus();
    else collapseSearch();
  };
  document.addEventListener("click", (e) => {
    if (isMobileSearch() && sWrap.classList.contains("expanded") && !sWrap.contains(e.target))
      collapseSearch();
  });
  sIn.addEventListener("keydown", (e) => {
    if ((e.key === "Escape" || e.key === "Enter") && isMobileSearch()) collapseSearch();
  });
  sIn.addEventListener("input", () => {
    const q = sIn.value.trim().toLowerCase();
    sRes.innerHTML = "";
    if (!q) {
      sRes.classList.remove("show");
      return;
    }
    const hits = state.sats
      .filter((s) => s.name.toLowerCase().includes(q) || s.id.includes(q))
      .slice(0, 40);
    if (!hits.length) {
      sRes.classList.remove("show");
      return;
    }
    for (const s of hits) {
      const hex = catColorHex(s.cat);
      const el = document.createElement("div");
      el.className = "res";
      el.innerHTML = `<span class="cd" style="background:${hex}"></span><span class="nm">${s.name}</span><span class="meta">#${s.id}</span>`;
      el.onclick = () => {
        select(s);
        sRes.classList.remove("show");
        sIn.value = s.name;
        if (isMobileSearch()) collapseSearch();
      };
      sRes.appendChild(el);
    }
    sRes.classList.add("show");
  });
  sIn.addEventListener("blur", () => setTimeout(() => sRes.classList.remove("show"), 180));
}

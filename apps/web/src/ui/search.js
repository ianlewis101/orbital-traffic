import { catColorHex } from "../config.js";
import { state, $ } from "../state.js";
import { select } from "./info.js";
import { esc } from "../util/html.js";
import { neoSats } from "../scene/neos.js";

export function initSearch() {
  const sIn = $("#search-in"),
    sRes = $("#results"),
    sWrap = $("#search-wrap");
  const isMobileSearch = () => window.matchMedia("(max-width:768px)").matches;

  let hits = []; // satellites currently shown, parallel to sRes's option children
  let active = -1; // index of the highlighted result, or -1 when none

  function showResults(show) {
    sRes.classList.toggle("show", show);
    sIn.setAttribute("aria-expanded", show ? "true" : "false");
    if (!show) sIn.removeAttribute("aria-activedescendant");
  }

  function hideResults() {
    hits = [];
    active = -1;
    sRes.innerHTML = "";
    showResults(false);
  }

  function collapseSearch() {
    sWrap.classList.remove("expanded");
    hideResults();
    sIn.blur();
  }

  // Highlight result `i` (clamped into range), syncing aria-activedescendant,
  // the visual .active class and aria-selected. DOM focus stays on the input
  // the whole time (the ARIA combobox / aria-activedescendant pattern), so
  // arrowing through results never blurs the field or trips the focusout
  // close-handler below — this is what F21 needed to make Enter/arrows safe.
  function setActive(i) {
    const opts = sRes.children;
    if (!opts.length) return;
    active = Math.max(0, Math.min(i, opts.length - 1));
    for (let k = 0; k < opts.length; k++) {
      const on = k === active;
      opts[k].classList.toggle("active", on);
      opts[k].setAttribute("aria-selected", on ? "true" : "false");
    }
    const el = opts[active];
    sIn.setAttribute("aria-activedescendant", el.id);
    el.scrollIntoView?.({ block: "nearest" });
  }

  function choose(s) {
    if (!s) return;
    select(s);
    sIn.value = s.name;
    hideResults();
    if (isMobileSearch()) collapseSearch();
  }

  // Mobile-only: tap the icon to slide the bar open/closed; tapping outside,
  // Escape, or picking a result slides it back to the icon.
  $("#search svg").onclick = () => {
    if (!isMobileSearch()) return;
    if (sWrap.classList.toggle("expanded")) sIn.focus();
    else collapseSearch();
  };
  document.addEventListener("click", (e) => {
    if (isMobileSearch() && sWrap.classList.contains("expanded") && !sWrap.contains(e.target))
      collapseSearch();
  });

  sIn.addEventListener("input", () => {
    const q = sIn.value.trim().toLowerCase();
    sRes.innerHTML = "";
    hits = [];
    active = -1;
    if (!q) {
      showResults(false);
      return;
    }
    hits = state.sats
      .concat(neoSats)
      .filter((s) => s.name.toLowerCase().includes(q) || s.id.includes(q))
      .slice(0, 40);
    if (!hits.length) {
      showResults(false);
      return;
    }
    hits.forEach((s, i) => {
      const hex = catColorHex(s.cat);
      const el = document.createElement("div");
      el.className = "res";
      el.id = "search-opt-" + i;
      el.setAttribute("role", "option");
      el.setAttribute("aria-selected", "false");
      el.tabIndex = -1;
      el.innerHTML = `<span class="cd" style="background:${hex}"></span><span class="nm">${esc(s.name)}</span><span class="meta">#${
        // eslint-disable-next-line orbital/no-unescaped-innerhtml -- s.id is a numeric NORAD catalog id, not free text
        s.id
      }</span>`;
      el.addEventListener("click", () => choose(s));
      sRes.appendChild(el);
    });
    showResults(true);
    setActive(0); // pre-highlight the first result so a bare Enter picks it
  });

  // Keyboard now works on desktop as well as mobile (F21 — previously only
  // Enter/Escape, and only when isMobileSearch()).
  sIn.addEventListener("keydown", (e) => {
    const open = sRes.classList.contains("show") && hits.length > 0;
    if (e.key === "ArrowDown") {
      if (!open) return;
      e.preventDefault();
      setActive(active + 1);
    } else if (e.key === "ArrowUp") {
      if (!open) return;
      e.preventDefault();
      setActive(active - 1);
    } else if (e.key === "Enter") {
      if (!open) {
        if (isMobileSearch()) collapseSearch();
        return;
      }
      e.preventDefault();
      choose(hits[active >= 0 ? active : 0]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      sIn.value = "";
      hideResults();
      if (isMobileSearch()) collapseSearch();
    }
  });

  // Clicking a result must not blur the input — a blur would fire the
  // focusout handler below and tear the panel down before the click lands.
  // preventDefault on mousedown keeps focus on the field; the option's own
  // click handler still runs.
  sRes.addEventListener("mousedown", (e) => e.preventDefault());

  // Replaces the old `blur → setTimeout(180ms) → hide` handler (F21). That
  // timeout closed the panel whenever focus left the input — fine when
  // results weren't reachable, but hostile once they are. Close only when
  // focus actually leaves the whole search widget (Tab away / click
  // elsewhere); arrowing through results keeps focus on the input, so the
  // panel stays put.
  sWrap.addEventListener("focusout", (e) => {
    if (!sWrap.contains(e.relatedTarget)) hideResults();
  });
}

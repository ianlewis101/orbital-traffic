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

  // Desktop keyboard state. `hits` mirrors the rendered rows; `active` is the
  // highlighted index. Both are desktop-only — on mobile results are tapped,
  // exactly as before, and none of the combobox wiring below runs.
  let hits = [];
  let active = -1;

  function collapseSearch() {
    sWrap.classList.remove("expanded");
    sRes.classList.remove("show");
    sIn.blur();
  }

  // ---- desktop-only combobox / listbox semantics ----
  // Applied lazily when the desktop panel opens, so mobile never picks up the
  // combobox role, the aria-activedescendant highlight, or option roles.
  function openListbox() {
    sIn.setAttribute("role", "combobox");
    sIn.setAttribute("aria-controls", "results");
    sIn.setAttribute("aria-autocomplete", "list");
    sIn.setAttribute("aria-expanded", "true");
    sRes.setAttribute("role", "listbox");
    sRes.classList.add("show");
  }
  function closeListbox() {
    sRes.classList.remove("show");
    sIn.setAttribute("aria-expanded", "false");
    sIn.removeAttribute("aria-activedescendant");
    active = -1;
  }

  // Move the desktop highlight to row `i` (clamped), syncing the .active class,
  // aria-selected, and aria-activedescendant. Focus stays on the input the
  // whole time (the aria-activedescendant pattern), so arrowing never blurs the
  // field or trips the focusout close-handler below.
  function setActive(i) {
    const opts = sRes.children;
    if (!opts.length) return;
    active = Math.max(0, Math.min(i, opts.length - 1));
    for (let k = 0; k < opts.length; k++) {
      const on = k === active;
      opts[k].classList.toggle("active", on);
      opts[k].setAttribute("aria-selected", on ? "true" : "false");
    }
    sIn.setAttribute("aria-activedescendant", opts[active].id);
    opts[active].scrollIntoView?.({ block: "nearest" });
  }

  function choose(s) {
    if (!s) return;
    select(s);
    sIn.value = s.name;
    sRes.classList.remove("show");
    if (isMobileSearch()) collapseSearch();
    else closeListbox();
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
    const desktop = !isMobileSearch();
    sRes.innerHTML = "";
    hits = [];
    active = -1;
    if (desktop) sIn.removeAttribute("aria-activedescendant");
    // Nothing to show → hide the panel (desktop tidies up its aria state).
    const hidePanel = () => (desktop ? closeListbox() : sRes.classList.remove("show"));
    if (!q) return hidePanel();
    hits = state.sats
      .concat(neoSats)
      .filter((s) => s.name.toLowerCase().includes(q) || s.id.includes(q))
      .slice(0, 40);
    if (!hits.length) return hidePanel();
    hits.forEach((s, i) => {
      const hex = catColorHex(s.cat);
      const el = document.createElement("div");
      el.className = "res";
      if (desktop) {
        // listbox option semantics for keyboard nav + screen readers
        el.id = "search-opt-" + i;
        el.setAttribute("role", "option");
        el.setAttribute("aria-selected", "false");
        el.tabIndex = -1;
      }
      el.innerHTML = `<span class="cd" style="background:${hex}"></span><span class="nm">${esc(s.name)}</span><span class="meta">#${
        // eslint-disable-next-line orbital/no-unescaped-innerhtml -- s.id is a numeric NORAD catalog id, not free text
        s.id
      }</span>`;
      el.addEventListener("click", () => choose(s));
      sRes.appendChild(el);
    });
    if (desktop) {
      openListbox();
      setActive(0); // pre-highlight the first row so a bare Enter picks it
    } else {
      sRes.classList.add("show");
    }
  });

  sIn.addEventListener("keydown", (e) => {
    // Mobile keeps its original behaviour: Enter/Escape just slide the bar
    // back to the icon, and results are picked by tapping — no keyboard nav.
    if (isMobileSearch()) {
      if (e.key === "Escape" || e.key === "Enter") collapseSearch();
      return;
    }
    // Desktop keyboard nav (F21): arrows move the highlight, Enter selects the
    // highlighted (or first) result, Escape clears and closes.
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
      if (!open) return;
      e.preventDefault();
      choose(hits[active >= 0 ? active : 0]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      sIn.value = "";
      sRes.innerHTML = "";
      hits = [];
      closeListbox();
    }
  });

  // Desktop only: clicking a result must not blur the input — a blur would fire
  // the focusout handler below and tear the panel down before the click lands.
  // preventDefault on mousedown keeps focus on the field; the row's own click
  // handler still runs.
  sRes.addEventListener("mousedown", (e) => {
    if (!isMobileSearch()) e.preventDefault();
  });

  // Desktop only (F21): with results now keyboard-reachable, the old
  // blur → setTimeout → hide would close the panel mid-arrow. Instead, close
  // only when focus actually leaves the whole search widget.
  sWrap.addEventListener("focusout", (e) => {
    if (!isMobileSearch() && !sWrap.contains(e.relatedTarget)) closeListbox();
  });

  // Mobile only: the original blur → hide-after-delay. The 180ms delay lets a
  // tap on a result register before the panel closes.
  sIn.addEventListener("blur", () => {
    if (isMobileSearch()) setTimeout(() => sRes.classList.remove("show"), 180);
  });
}

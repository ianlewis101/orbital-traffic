import { catColorHex } from "../config.js";
import { state, $ } from "../state.js";
import { select } from "./info.js";
import { esc } from "../util/html.js";
import { neoSats } from "../scene/neos.js";

/** Most results the panel will show. */
export const SEARCH_LIMIT = 40;

// Match quality, best first. Matching itself is unchanged — plain
// case-insensitive substring on name or NORAD id — these only decide order.
export const RANK_EXACT = 0;
export const RANK_PREFIX = 1;
export const RANK_SUBSTRING = 2;
export const RANK_NONE = -1;

/**
 * Score one object against a lowercased query. `lowerName` is passed in
 * already lowercased so the caller can do it once per object per keystroke
 * rather than once per comparison.
 */
export function rankMatch(lowerName, id, q) {
  if (lowerName === q || id === q) return RANK_EXACT;
  if (lowerName.startsWith(q) || id.startsWith(q)) return RANK_PREFIX;
  if (lowerName.includes(q) || id.includes(q)) return RANK_SUBSTRING;
  return RANK_NONE;
}

/**
 * Rank-ordered catalog search.
 *
 * Previously this was a bare `filter(...).slice(0, 40)`, which returned
 * matches in raw catalog order. That buried any object whose name is a
 * substring of a large constellation's: searching "LINK" matched 10,774
 * objects, and the actual LINK spacecraft (69792) sat at index 10,769 behind
 * every STARLINK-*, so it never appeared at all.
 *
 * Results are bucketed by rank rather than sorted: there are only three tiers,
 * so bucketing is O(n) instead of O(n log n), and capping each bucket at
 * `limit` bounds the memory too — the old filter built a 10,774-element array
 * on every keystroke to then throw all but 40 away. Within a tier, catalog
 * order is preserved, so queries where everything ties (e.g. "starlink", where
 * all 10,771 hits are prefix matches) are ordered exactly as before.
 */
export function searchCatalog(list, query, limit = SEARCH_LIMIT) {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  if (!q) return [];

  const exact = [];
  const prefix = [];
  const substring = [];
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const r = rankMatch(s.name.toLowerCase(), s.id, q);
    // Each bucket only needs its first `limit` entries: order within a tier is
    // preserved, so a later same-tier match can never displace an earlier one.
    if (r === RANK_EXACT) {
      if (exact.length < limit) exact.push(s);
    } else if (r === RANK_PREFIX) {
      if (prefix.length < limit) prefix.push(s);
    } else if (r === RANK_SUBSTRING) {
      if (substring.length < limit) substring.push(s);
    }
  }
  return exact.concat(prefix, substring).slice(0, limit);
}

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
    // Every other collapse route (outside tap, Escape, picking a result) ends
    // here too, so the toggle's state is re-synced in one place.
    syncToggle();
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

  // The toggle is a real <button> rather than a bare <svg> with an onclick:
  // below 768px the input is display:none until .expanded, and this control
  // was the only way to open it — so keyboard and screen-reader users had no
  // route to search at all on the mobile layout. A button gets focus, Enter
  // and Space for free.
  //
  // aria-expanded is only meaningful while it acts as a disclosure (mobile);
  // on desktop the input is always visible and the button just focuses it, so
  // the attribute is removed rather than left asserting something false.
  const sToggle = $("#search-toggle");

  function syncToggle() {
    if (isMobileSearch())
      sToggle.setAttribute("aria-expanded", sWrap.classList.contains("expanded") ? "true" : "false");
    else sToggle.removeAttribute("aria-expanded");
  }
  syncToggle();
  window.addEventListener("resize", syncToggle);

  sToggle.addEventListener("click", () => {
    if (!isMobileSearch()) {
      sIn.focus();
      return;
    }
    if (sWrap.classList.toggle("expanded")) sIn.focus();
    else collapseSearch();
    syncToggle();
  });
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
    hits = searchCatalog(state.sats.concat(neoSats), q);
    if (!hits.length) {
      // Previously this hid the panel outright, so a query matching nothing
      // looked identical to a broken search — against a ~19,000-object
      // catalog the user had no way to tell "not tracked" from "app failed".
      // Rendered outside the listbox's option list (role="presentation") so
      // it is announced as a status, not offered as a selectable result.
      const el = document.createElement("div");
      el.className = "res-empty";
      el.setAttribute("role", "presentation");
      el.textContent = "No matches found";
      sRes.appendChild(el);
      showResults(true);
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

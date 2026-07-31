/**
 * Settings panel.
 *
 * Opened from a gear button in the HUD, rendered as the same bottom sheet the
 * info card uses on mobile. Not a tab-bar destination: the app has no nav
 * chrome, and three elements already claim the bottom edge with no
 * safe-area handling, so a sheet is the shape that fits.
 *
 * Each section renders as its own raised card (`.set-card`) rather than a
 * run of divs separated by a hairline — on a translucent, busy backdrop a
 * single 1px border-top reads as barely-there, which is what made the
 * original version feel like one dense, hard-to-scan block. A leading icon
 * + accent color per card (reusing --signal/--amber/--violet, already
 * meaningful elsewhere in the app) gives quick wayfinding between sections
 * without inventing new tokens.
 *
 * There is no display-categories control here. An earlier version seeded
 * state.hidden from a per-category toggle list; it was removed outright
 * (not merely hidden) because it was both the single largest source of the
 * "everything runs together" complaint (14 near-identical rows) and
 * redundant with the in-scene Orbit Classes legend, which already toggles
 * categories live. Don't reintroduce it as a "seed the legend at boot"
 * feature without re-litigating that redundancy.
 */
import { CATS, catColorHex } from "../config.js";
import { state, $ } from "../state.js";
import { settings, saveSettings } from "../settings.js";
import { locationStatus, clearLocationDenied } from "../data/location.js";
import { fetchLive } from "../data/live.js";
import { formatRelativeTime } from "../util/relative-time.js";
import { applyReduceMotion } from "../util/motion.js";
import { esc } from "../util/html.js";
import { getGlobeStyle, setGlobeStyle } from "../scene/earth.js";
import { savedIds } from "./favorites.js";
import { refreshInfo, select } from "./info.js";
import { toast, flash } from "./status.js";
import { closeOtherSheets } from "./sheets.js";

const GITHUB = "https://github.com/ianlewis101/orbital-traffic";

// ---------------------------------------------------------------------
// icons — same stroke language as the rest of the app's inline SVGs
// (stroke=currentColor, width 1.7, round caps/joins, 24x24 viewBox)
// ---------------------------------------------------------------------
const ICONS = {
  privacy:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M7.5 11V7.5a4.5 4.5 0 0 1 9 0V11"/></svg>',
  display:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="7" x2="20" y2="7"/><circle cx="9" cy="7" r="2.1"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="15" cy="17" r="2.1"/></svg>',
  globe:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><line x1="3" y1="12" x2="21" y2="12"/></svg>',
  data: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3.2-6.9"/><path d="M21 3.5V9h-5.5"/></svg>',
  saved:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 4h11a1.5 1.5 0 0 1 1.5 1.5V20l-7-3.6L5 20V5.5A1.5 1.5 0 0 1 6.5 4Z"/></svg>',
  about:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16.2"/><circle cx="12" cy="7.6" r="0.9" fill="currentColor" stroke="none"/></svg>',
  changelog:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="13" y2="18"/></svg>',
  issue:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="7.5" x2="12" y2="13"/><circle cx="12" cy="16.3" r="0.9" fill="currentColor" stroke="none"/></svg>',
};

/**
 * `el.innerHTML = ICONS[name]` is a lookup into the hand-authored, static
 * ICONS map above, keyed only by literal strings at each call site — never
 * by anything derived from feed/user data. eslint-rules/no-unescaped-innerhtml
 * only inspects `X.innerHTML = <TemplateLiteral>` assignments (documented
 * scope), so this bare-lookup assignment is outside what it checks; it's
 * safe by construction rather than by the rule's enforcement, the same way
 * index.html's own inline SVGs are.
 */
function icon(name) {
  const el = document.createElement("span");
  el.className = "set-ic-svg";
  el.innerHTML = ICONS[name] || "";
  return el;
}

function panel() {
  return $("#settings");
}

function isOpen() {
  return panel()?.classList.contains("show");
}

export function closeSettings() {
  panel()?.classList.remove("show");
  $("#settings-btn")?.setAttribute("aria-expanded", "false");
}

// ---------------------------------------------------------------------
// building blocks
// ---------------------------------------------------------------------

/**
 * One settings card: icon + title header, plus a body container callers
 * append their content into. `accent` picks the icon's tint (a CSS class,
 * see .set-card--* in app.css) — deliberate per-section color-coding for
 * quick navigation, not decoration.
 */
function card(title, iconName, accent) {
  const el = document.createElement("section");
  el.className = `set-card set-card--${accent}`;

  const head = document.createElement("div");
  head.className = "set-card-h";
  const ic = document.createElement("span");
  ic.className = "set-ic";
  ic.appendChild(icon(iconName));
  const t = document.createElement("h3");
  t.className = "set-card-t";
  t.textContent = title;
  head.append(ic, t);

  const body = document.createElement("div");
  body.className = "set-card-b";

  el.append(head, body);
  return { el, body };
}

function note(text) {
  const p = document.createElement("p");
  p.className = "set-note";
  p.textContent = text;
  return p;
}

/** A labelled on/off row. */
function toggleRow(label, on, onChange, description) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "set-row" + (on ? " on" : "");
  b.setAttribute("aria-pressed", on ? "true" : "false");

  const txt = document.createElement("span");
  txt.className = "set-row-txt";
  const nm = document.createElement("span");
  nm.className = "set-row-nm";
  nm.textContent = label;
  txt.appendChild(nm);
  if (description) {
    const d = document.createElement("span");
    d.className = "set-row-d";
    d.textContent = description;
    txt.appendChild(d);
  }

  const sw = document.createElement("span");
  sw.className = "set-sw";

  b.append(txt, sw);
  b.onclick = () => {
    const next = b.getAttribute("aria-pressed") !== "true";
    b.setAttribute("aria-pressed", next ? "true" : "false");
    b.classList.toggle("on", next);
    onChange(next);
  };
  return b;
}

/** A full-width action button, for things that fire immediately (not a toggle). */
function actionButton(label, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "set-action";
  b.textContent = label;
  b.onclick = onClick;
  return b;
}

/** A two-option segmented control, matching the app's existing .gbtn look. */
function segmented(label, options, current, onPick) {
  const wrap = document.createElement("div");
  wrap.className = "set-field";
  const lab = document.createElement("div");
  lab.className = "set-sub";
  lab.textContent = label;
  const seg = document.createElement("div");
  seg.className = "set-seg";
  for (const [value, text] of options) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "gbtn" + (value === current ? " on" : "");
    b.setAttribute("aria-pressed", value === current ? "true" : "false");
    b.textContent = text;
    b.onclick = () => {
      for (const sib of seg.children) {
        const on = sib === b;
        sib.classList.toggle("on", on);
        sib.setAttribute("aria-pressed", on ? "true" : "false");
      }
      onPick(value);
    };
    seg.appendChild(b);
  }
  wrap.append(lab, seg);
  return wrap;
}

/** A small pill link with a leading icon — used for the About section's utility row. */
function linkChip(href, iconName, label) {
  const a = document.createElement("a");
  a.className = "set-chip";
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener";
  a.appendChild(icon(iconName));
  const s = document.createElement("span");
  s.textContent = label;
  a.appendChild(s);
  return a;
}

/** One data-source credit: name (linked) + a short description underneath. */
function creditRow(href, name, desc) {
  const a = document.createElement("a");
  a.className = "set-credit";
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener";
  const nm = document.createElement("div");
  nm.className = "set-credit-nm";
  nm.textContent = name;
  const d = document.createElement("div");
  d.className = "set-credit-d";
  d.textContent = desc;
  a.append(nm, d);
  return a;
}

// ---------------------------------------------------------------------
// sections
// ---------------------------------------------------------------------

async function buildPrivacy() {
  const { el, body } = card("Privacy & Permissions", "privacy", "privacy");
  const status = document.createElement("div");
  status.className = "set-status";
  status.textContent = "Location access: checking…";
  body.appendChild(status);

  const slot = document.createElement("div");
  body.appendChild(slot);

  const paint = async () => {
    slot.innerHTML = "";
    const st = await locationStatus();
    const label =
      st === "granted"
        ? "Granted"
        : st === "denied"
          ? "Denied"
          : st === "unsupported"
            ? "Unavailable on this device"
            : "Not requested";
    status.textContent = `Location access: ${label}`;
    status.classList.toggle("bad", st === "denied");
    if (st === "denied") {
      slot.appendChild(
        note(
          "Location access is blocked. If you also denied it at the device level, " +
            "you'll need to re-enable it in your device settings — this button only " +
            "clears the app's own record so it can ask again."
        )
      );
      slot.appendChild(
        actionButton("Reset & try again", async () => {
          clearLocationDenied();
          toast("Location reset — try What's Overhead again");
          await paint();
        })
      );
    } else {
      slot.appendChild(
        note(
          "Your location is only ever read when you tap What's Overhead. " +
            "It's used on your device to work out which objects are above your " +
            "horizon, and is never stored or sent anywhere."
        )
      );
    }
  };
  await paint();
  return el;
}

/** A saved ID with nothing behind it: show something honest, never a blank row. */
function orphanName(id) {
  return /^\d+$/.test(id) ? `NORAD ${id}` : id;
}

/**
 * One saved object as a `.today-row` — the same swatch + name + caption shape
 * the ISS Today list uses, so Saved reads as the app's existing list language
 * rather than a new row style.
 *
 * A saved ID that no longer resolves (pruned from the catalog, capsule landed)
 * still gets a row: dropping it silently would read as lost data. It just
 * isn't tappable, because there's nothing to select.
 */
function savedRow(id) {
  const s = state.byId.get(id);
  const hex = catColorHex(s ? s.cat : "other");
  const name = s ? s.name : orphanName(id);
  const label = s ? (CATS[s.cat] || CATS.other).label : "";
  const caption = !s ? "No longer in the catalog" : s._neo ? label : `${label} · NORAD ${id}`;

  const b = document.createElement("button");
  b.type = "button";
  b.className = "today-row";
  b.innerHTML = `<span class="sw" style="background:${hex};color:${hex}"></span>
    <span class="info"><span class="nm">${esc(name)}</span><span class="reason">${esc(caption)}</span></span>`;
  if (!s) {
    b.disabled = true;
    return b;
  }
  b.onclick = () => {
    // Re-resolve through byId rather than holding the record: a live sync can
    // prune objects out from under a panel that's been open a while. Same
    // pattern (and same close-then-select order) as the overhead results list.
    const sat = state.byId.get(id);
    if (!sat) return;
    closeSettings();
    select(sat);
  };
  return b;
}

/** One list within the Saved card: its label, then its rows or its empty state. */
function savedList(body, list, label, empty) {
  const ids = savedIds(list);
  const sub = document.createElement("div");
  sub.className = "set-sub";
  sub.textContent = ids.length ? `${label} (${ids.length})` : label;
  body.appendChild(sub);

  if (!ids.length) {
    body.appendChild(note(empty));
    return 0;
  }
  const wrap = document.createElement("div");
  wrap.className = "set-saved";
  // Newest first — the object you just saved is the one you're most likely
  // reaching for. savedIds() hands them back oldest-first (insertion order).
  for (const id of [...ids].reverse()) wrap.appendChild(savedRow(id));
  body.appendChild(wrap);
  return ids.length;
}

/**
 * Favourites and Watchlist: two independent lists, so an object can sit in
 * both. Tapping a row selects that object and closes the sheet.
 */
function buildSaved() {
  const { el, body } = card("Saved", "saved", "saved");
  const n =
    savedList(
      body,
      "favorites",
      "Favourites",
      "Nothing here yet. Tap the ☆ on an object's card to keep it — favourites are the objects you want one tap away."
    ) +
    savedList(
      body,
      "watchlist",
      "Watchlist",
      "Nothing here yet. Tap the eye on an object's card to add it — a watchlist is for objects you want to check back on later."
    );
  if (n)
    body.appendChild(note("Both lists are kept on this device only, and are never sent anywhere."));
  return el;
}

function buildDisplay() {
  const { el, body } = card("Display", "display", "display");

  body.appendChild(
    segmented(
      "Units",
      [
        ["imperial", "MILES"],
        ["metric", "KILOMETRES"],
      ],
      settings.units,
      (units) => {
        saveSettings({ units });
        // Repaint the open info card so the change is visible immediately
        // rather than at the next telemetry tick.
        if (state.selected) refreshInfo();
      }
    )
  );

  body.appendChild(
    toggleRow(
      "Reduce motion",
      settings.reduceMotion,
      (on) => {
        saveSettings({ reduceMotion: on });
        applyReduceMotion();
      },
      "Calms interface animations and hides orbit trails. The globe keeps tracking."
    )
  );

  return el;
}

/**
 * Globe Style was its own floating plate pinned under the clock until it
 * moved in here. It's a set-once preference, so it didn't earn permanent
 * screen space beside live telemetry — and at mobile widths the plate sat
 * low enough to overlap the info sheet's header controls.
 *
 * The preference itself is unchanged: scene/earth.js still owns it and still
 * persists it under `ot-globe-style`, one of the two deliberate exceptions to
 * settings.js's single "ot-settings" key. This card only calls the same
 * getGlobeStyle()/setGlobeStyle() pair the old plate did, so a style picked
 * here survives reload exactly as before (initEarth() reads it at boot).
 */
function buildGlobe() {
  const { el, body } = card("Globe Style", "globe", "globe");

  body.appendChild(
    segmented(
      "Appearance",
      [
        ["real", "REALISTIC"],
        ["ops", "OPS CONSOLE"],
      ],
      getGlobeStyle(),
      (style) => setGlobeStyle(style)
    )
  );

  body.appendChild(
    note(
      "Realistic renders day/night terrain with city lights and an atmosphere halo. " +
        "Ops console swaps it for a dark chart — glowing coastlines, graticule, city " +
        "markers — so the satellite clouds dominate."
    )
  );

  return el;
}

/**
 * The two timestamps here mean different things and must not be conflated:
 * `srcTime` is when we last successfully pulled fresh elements, while
 * `bootCatalogTime` is the newest TLE epoch in the bundled catalog — a
 * property of the data, not of any fetch. Saying "last updated" for the
 * second would overclaim, so each gets its own wording.
 */
function catalogAgeText() {
  if (state.srcTime) {
    const rel = formatRelativeTime(state.srcTime);
    return `Catalog last updated: ${rel} (${state.srcTime.toLocaleString()})`;
  }
  if (state.bootCatalogTime) {
    return `Using the bundled catalog · newest orbital element dated ${state.bootCatalogTime.toLocaleString()}`;
  }
  return "Catalog last updated: not yet synced";
}

function buildData() {
  const { el, body } = card("Data", "data", "data");
  const age = document.createElement("div");
  age.className = "set-status";
  age.textContent = catalogAgeText();
  body.appendChild(age);
  body.appendChild(
    note(
      "Orbital elements refresh automatically every 15 minutes while the app is " +
        "open. This fetches them again now."
    )
  );

  const btn = actionButton("Refresh catalog now", async () => {
    btn.disabled = true;
    btn.textContent = "Refreshing…";
    try {
      await fetchLive();
      age.textContent = catalogAgeText();
      flash($("#legend-tot"));
      toast("Catalog refreshed");
    } finally {
      btn.disabled = false;
      btn.textContent = "Refresh catalog now";
    }
  });
  body.appendChild(btn);
  return el;
}

function buildAbout() {
  const { el, body } = card("About", "about", "about");

  const ver = document.createElement("div");
  ver.className = "set-status";
  ver.textContent = `Orbital Traffic v${__APP_VERSION__}`;
  body.appendChild(ver);

  const links = document.createElement("div");
  links.className = "set-links";
  links.append(
    linkChip(`${GITHUB}/blob/main/CHANGELOG.md`, "changelog", "What's new"),
    linkChip(`${GITHUB}/issues/new`, "issue", "Report an issue"),
    linkChip("/privacy.html", "privacy", "Privacy")
  );
  body.appendChild(links);

  const sourcesLab = document.createElement("div");
  sourcesLab.className = "set-sub";
  sourcesLab.textContent = "Data sources";
  body.appendChild(sourcesLab);

  const credits = document.createElement("div");
  credits.className = "set-credits";
  for (const [href, name, desc] of [
    ["https://celestrak.org", "CelesTrak", "Orbital elements"],
    [
      "https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html",
      "NASA/JPL Small-Body Database",
      "Near-Earth objects",
    ],
    ["https://thespacedevs.com", "Launch Library 2 (The Space Devs)", "Crew rosters"],
    ["https://blogs.nasa.gov/spacestation/", "NASA Space Station Blog", "Station activity"],
  ]) {
    credits.appendChild(creditRow(href, name, desc));
  }
  body.appendChild(credits);

  return el;
}

// ---------------------------------------------------------------------

async function render() {
  const body = $("#settings-body");
  if (!body) return;
  body.innerHTML = "";
  body.append(buildSaved(), buildDisplay(), buildGlobe(), buildData(), buildAbout());
  // Permission state is async; insert it first once it resolves so the
  // section order stays stable regardless of how fast the query answers.
  const privacy = await buildPrivacy();
  body.prepend(privacy);
}

export function openSettings() {
  const p = panel();
  if (!p) return;
  closeOtherSheets("settings");
  p.classList.add("show");
  p.scrollTop = 0;
  $("#settings-btn")?.setAttribute("aria-expanded", "true");
  render();
}

export function initSettings() {
  const btn = $("#settings-btn");
  const x = $("#settings-x");
  if (x) x.onclick = () => closeSettings();
  if (btn) {
    btn.onclick = () => (isOpen() ? closeSettings() : openSettings());
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) closeSettings();
  });
}

export const _test = {
  render,
  buildSaved,
  buildDisplay,
  buildGlobe,
  buildData,
  buildAbout,
  buildPrivacy,
};

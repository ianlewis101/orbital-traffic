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
import { state, $ } from "../state.js";
import { settings, saveSettings } from "../settings.js";
import { locationStatus, clearLocationDenied } from "../data/location.js";
import { fetchLive } from "../data/live.js";
import { formatRelativeTime } from "../util/relative-time.js";
import { applyReduceMotion } from "../util/motion.js";
import { refreshInfo } from "./info.js";
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
  data: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3.2-6.9"/><path d="M21 3.5V9h-5.5"/></svg>',
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
  body.append(buildDisplay(), buildData(), buildAbout());
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

export const _test = { render, buildDisplay, buildData, buildAbout, buildPrivacy };

/**
 * Settings panel.
 *
 * Opened from a gear button in the HUD, rendered as the same bottom sheet the
 * info card uses on mobile. Not a tab-bar destination: the app has no nav
 * chrome, and three elements already claim the bottom edge with no
 * safe-area handling, so a sheet is the shape that fits.
 *
 * Everything here writes to settings.js and nowhere else. In particular the
 * Display > categories list is a *separate control* from the in-scene legend:
 * it seeds what's visible at boot, and the legend remains a live, session-only
 * view filter with its own state. Settings never reads the legend's runtime
 * state and the legend never writes back here — so toggling a category on the
 * globe deliberately does not change what you see in this panel.
 */
import { CATS } from "../config.js";
import { state, $ } from "../state.js";
import { settings, saveSettings, defaultDisplayCategories } from "../settings.js";
import { locationStatus, clearLocationDenied } from "../data/location.js";
import { fetchLive } from "../data/live.js";
import { formatRelativeTime } from "../util/relative-time.js";
import { applyReduceMotion } from "../util/motion.js";
import { refreshInfo } from "./info.js";
import { toast, flash } from "./status.js";
import { closeOtherSheets } from "./sheets.js";

const GITHUB = "https://github.com/ianlewis101/orbital-traffic";

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

function section(title) {
  const wrap = document.createElement("section");
  wrap.className = "set-sec";
  const h = document.createElement("div");
  h.className = "lab set-h";
  h.textContent = title;
  wrap.appendChild(h);
  return wrap;
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

/** A small button row (the .tbtn look from the time machine). */
function actionButton(label, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "set-action";
  b.textContent = label;
  b.onclick = onClick;
  return b;
}

/** A two-option segmented control. */
function segmented(options, current, onPick) {
  const wrap = document.createElement("div");
  wrap.className = "set-seg";
  for (const [value, label] of options) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "gbtn" + (value === current ? " on" : "");
    b.setAttribute("aria-pressed", value === current ? "true" : "false");
    b.textContent = label;
    b.onclick = () => {
      for (const sib of wrap.children) {
        const on = sib === b;
        sib.classList.toggle("on", on);
        sib.setAttribute("aria-pressed", on ? "true" : "false");
      }
      onPick(value);
    };
    wrap.appendChild(b);
  }
  return wrap;
}

// ---------------------------------------------------------------------
// sections
// ---------------------------------------------------------------------

async function buildPrivacy() {
  const sec = section("Privacy & Permissions");
  const status = document.createElement("div");
  status.className = "set-status";
  status.textContent = "Location access: checking…";
  sec.appendChild(status);

  const slot = document.createElement("div");
  sec.appendChild(slot);

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
  return sec;
}

function buildDisplay() {
  const sec = section("Display");

  // --- default categories -------------------------------------------------
  const catsNote = note(
    "Which categories are shown when the app loads. The Orbit Classes panel on " +
      "the globe stays independent for the rest of the session."
  );
  sec.appendChild(catsNote);

  const cats = settings.displayCategories || defaultDisplayCategories();
  const box = document.createElement("div");
  box.className = "set-cats";
  for (const c of Object.keys(CATS)) {
    box.appendChild(
      toggleRow(CATS[c].label, cats[c] !== false, (on) => {
        const next = { ...(settings.displayCategories || defaultDisplayCategories()) };
        next[c] = on;
        saveSettings({ displayCategories: next });
      })
    );
  }
  sec.appendChild(box);

  // --- units --------------------------------------------------------------
  const unitsLab = document.createElement("div");
  unitsLab.className = "set-sub";
  unitsLab.textContent = "Units";
  sec.appendChild(unitsLab);
  sec.appendChild(
    segmented(
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

  // --- reduce motion ------------------------------------------------------
  sec.appendChild(
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

  return sec;
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
  const sec = section("Data");
  const age = document.createElement("div");
  age.className = "set-status";
  age.textContent = catalogAgeText();
  sec.appendChild(age);
  sec.appendChild(
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
  sec.appendChild(btn);
  return sec;
}

function link(href, text) {
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = text;
  return a;
}

function buildAbout() {
  const sec = section("About");

  const ver = document.createElement("div");
  ver.className = "set-status";
  ver.textContent = `Orbital Traffic v${__APP_VERSION__}`;
  sec.appendChild(ver);

  const links = document.createElement("div");
  links.className = "set-links";
  links.append(
    link(`${GITHUB}/blob/main/CHANGELOG.md`, "What's new"),
    link(`${GITHUB}/issues/new`, "Report an issue"),
    link("/privacy.html", "Privacy")
  );
  sec.appendChild(links);

  const credits = document.createElement("div");
  credits.className = "set-credits";
  const cLab = document.createElement("div");
  cLab.className = "set-sub";
  cLab.textContent = "Data sources";
  credits.appendChild(cLab);
  const ul = document.createElement("ul");
  for (const [href, label] of [
    ["https://celestrak.org", "CelesTrak — orbital elements"],
    [
      "https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html",
      "NASA/JPL Small-Body Database — near-Earth objects",
    ],
    ["https://thespacedevs.com", "Launch Library 2 (The Space Devs) — crew rosters"],
    ["https://blogs.nasa.gov/spacestation/", "NASA Space Station Blog — station activity"],
  ]) {
    const li = document.createElement("li");
    li.appendChild(link(href, label));
    ul.appendChild(li);
  }
  credits.appendChild(ul);
  sec.appendChild(credits);
  return sec;
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

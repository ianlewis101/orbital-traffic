import { CATS, catColorHex } from "../config.js";
import { state, $ } from "../state.js";
import { esc } from "../util/html.js";
import { toDistance, distanceUnit, fmtAltitude } from "../util/units.js";
import { chainSats } from "../data/chains.js";
import { buildChainOverlay, clearChainOverlay, chainCenterEci } from "../scene/chain.js";
import { framePoint } from "../scene/core.js";
import { select } from "./info.js";
import { closeOtherSheets } from "./sheets.js";

/**
 * The "Tracked Chain" card — the whole-launch counterpart to the info card's
 * single Tracked Object.
 *
 * Selecting a chain is deliberately NOT a variant of select(): a chain has no
 * single position, telemetry, photo, description, crew, share card or Saved
 * entry, and threading "sometimes there are 28 of these" through info.js
 * would put a null check on every one of those. It gets its own card, in the
 * same sheet shell What's Overhead and Settings already use, and hands off to
 * select() the moment the user taps one member.
 *
 * The two selections coexist on purpose: tapping a member opens the ordinary
 * info card with the chain still lit behind it, so you can walk the string
 * satellite by satellite without losing it.
 */

/** How far back to pull the camera when framing a chain (Earth radii). */
const CHAIN_STANDOFF = 3.6;
/**
 * How far above the centre of the view to put the chain on a phone, where
 * the card is a bottom sheet covering the lower half of the screen (52vh)
 * and the middle of the viewport is behind it. 0.21 rad ≈ 12°, which centres
 * the chain in the strip left above the sheet at the camera's 45° vertical
 * field of view. Desktop keeps it centred — the card is a side panel there.
 */
const CHAIN_LIFT_RAD = 0.21;

const isMobileLayout = () => window.matchMedia("(max-width:768px)").matches;

const LEAD_COPY = {
  starlink:
    "A recently launched Starlink batch, still flying as one string. SpaceX releases the whole stack into a low parking orbit and each satellite then raises itself to its operational shell over the following weeks — until they do, the batch stays bunched, which is the window when a “Starlink train” can be seen from the ground as a chain of lights sliding across the sky.",
  oneweb:
    "A recently launched OneWeb batch, still flying as one string in the low orbit it was released into. Each satellite climbs from here to the constellation’s polar operating shell over the following weeks, and the line stretches out and fades as they go.",
  kuiper:
    "A recently launched Kuiper (Amazon Leo) batch, still flying as one string in its deployment orbit. Each satellite raises itself to the constellation’s operating shell over the following weeks, and the line stretches out and fades as they go.",
};

function panel() {
  return $("#chain");
}

function isOpen() {
  return panel()?.classList.contains("show");
}

/** The chain's display name — the constellation plus the launch it came from. */
export function chainName(chain) {
  const label = (CATS[chain.cat] || CATS.other).label;
  return `${label} train · ${chain.launchLabel}`;
}

/** Row/summary copy shared with the "Today in Space" feed. */
export function chainSummary(chain) {
  const label = (CATS[chain.cat] || CATS.other).label;
  return `${label} train · ${chain.count} satellites`;
}

export function chainDetail(chain) {
  const apart =
    chain.spacingSeconds != null
      ? `${Math.round(chain.spacingSeconds)}s apart`
      : `${toDistance(chain.spacingKm)} ${distanceUnit()} apart`;
  return `Still in a line ${fmtAltitude(chain.altitudeKm)} · ${apart}`;
}

function renderStats(chain) {
  const grid = $("#chain-grid");
  if (!grid) return;
  const unit = distanceUnit();
  grid.className = "grid";
  grid.innerHTML = `
    <div class="stat"><div class="k">Satellites</div><div class="v">${chain.count.toLocaleString()}</div></div>
    <div class="stat"><div class="k">Altitude</div><div class="v">${toDistance(chain.altitudeKm)} <small>${unit} up</small></div></div>
    <div class="stat"><div class="k">Gap between</div><div class="v">${toDistance(chain.spacingKm)} <small>${unit}</small></div></div>
    <div class="stat"><div class="k">Chain length</div><div class="v">${toDistance(chain.lengthKm)} <small>${unit}</small></div></div>`;
}

function renderChips(chain) {
  const chips = $("#chain-chips");
  if (!chips) return;
  // Every value here is built from numbers and fixed unit words, but each goes
  // through esc() anyway rather than relying on that being re-checked by hand
  // the next time this copy is edited.
  const shellGap = `${toDistance(chain.belowShellKm)} ${distanceUnit()} to go`;
  const apart =
    chain.spacingSeconds != null ? `${Math.round(chain.spacingSeconds)} seconds apart` : null;
  chips.innerHTML =
    `<span class="chip" title="Every satellite in this batch still has to raise itself to the constellation&rsquo;s operating altitude.">Still climbing &middot; ${esc(shellGap)}</span>` +
    `<span class="chip">Spread over ${chain.arcDeg.toFixed(0)}&deg; of one orbit</span>` +
    (apart ? `<span class="chip" title="How long after one satellite passes overhead the next one follows.">&asymp;${esc(apart)}</span>` : "");
}

function renderMembers(chain) {
  const list = $("#chain-list");
  if (!list) return;
  list.innerHTML = "";
  // detectChains() returns members tail-first along the direction of travel;
  // the list reads the other way round, leading satellite first, because that
  // is the order they cross the sky in when the train passes overhead.
  const sats = chainSats(chain).reverse();
  const hex = catColorHex(chain.cat);
  sats.forEach((s, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ohrow";

    const dot = document.createElement("span");
    dot.className = "d";
    dot.style.cssText = `background:${hex};color:${hex}`;

    const nm = document.createElement("span");
    nm.className = "nm";
    nm.textContent = s.name;

    const pos = document.createElement("span");
    pos.className = "el";
    pos.textContent = `#${i + 1}`;

    b.append(dot, nm, pos);
    b.onclick = () => {
      // Closes the card, keeps the highlight: the info card is a sheet in the
      // same slot on mobile, and the user is drilling into this chain, not
      // leaving it.
      closeChainCard();
      select(s);
    };
    list.appendChild(b);
  });
}

/** Repaint the card from state.chain. Safe to call with nothing selected. */
export function renderChainCard() {
  const chain = state.chain;
  if (!chain || !panel()) return;
  const hex = catColorHex(chain.cat);
  const catTag = $("#chain-cat");
  catTag.querySelector(".d").style.cssText = `background:${hex};color:${hex}`;
  catTag.querySelector("span:last-child").textContent = (CATS[chain.cat] || CATS.other).label;
  $("#chain-nm").textContent = chainName(chain);
  $("#chain-sub").textContent = `Launch ${chain.launchLabel} · ${chain.count} objects still in the string`;
  $("#chain-count").textContent = String(chain.count);
  $("#chain-lead").textContent = LEAD_COPY[chain.cat] || LEAD_COPY.starlink;
  renderChips(chain);
  renderStats(chain);
  renderMembers(chain);
}

/**
 * Light a chain: overlay on the globe, camera on it, card open. The
 * single-object selection is cleared first so one card and one highlight are
 * on screen at a time.
 */
export function selectChain(chain) {
  if (!chain) return;
  const sats = chainSats(chain);
  if (sats.length < 2) return;
  state.chain = chain;
  select(null);
  buildChainOverlay(sats, chain.cat, new Date(state.simNow));
  const centre = chainCenterEci(new Date(state.simNow));
  if (centre) framePoint(centre, CHAIN_STANDOFF, isMobileLayout() ? CHAIN_LIFT_RAD : 0);
  openChainCard();
}

function openChainCard() {
  const p = panel();
  if (!p) return;
  closeOtherSheets("chain");
  renderChainCard();
  p.classList.add("show");
  p.scrollTop = 0;
}

/**
 * Hide the card but keep the chain lit — used when another sheet takes the
 * slot, and when the user drills into one member. The "Today in Space" row
 * reopens it.
 */
export function closeChainCard() {
  panel()?.classList.remove("show");
}

/** Drop the chain entirely: card, overlay and selection. */
export function clearChain() {
  state.chain = null;
  clearChainOverlay();
  closeChainCard();
}

/**
 * Re-point a live selection at the freshly detected chains after a sync.
 * Chains are re-derived from scratch each time, so the selected object is a
 * stale snapshot afterwards — and the chain may have dispersed past the
 * detection thresholds, or lost members to a prune, while the card was open.
 */
export function resyncChain() {
  if (!state.chain) return;
  const fresh = state.chains.find((c) => c.key === state.chain.key);
  if (!fresh) {
    clearChain();
    return;
  }
  state.chain = fresh;
  const sats = chainSats(fresh);
  if (sats.length < 2) {
    clearChain();
    return;
  }
  buildChainOverlay(sats, fresh.cat, new Date(state.simNow));
  if (isOpen()) renderChainCard();
}

export function initChainCard() {
  const x = $("#chain-x");
  if (x) x.onclick = () => clearChain();
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) clearChain();
  });
}

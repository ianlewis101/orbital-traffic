/**
 * Share button wiring and the save-image fallback sheet.
 *
 * Deliberately wired from main.js rather than from ui/info.js: the share
 * module imports ui/describe.js, and info.js is already imported by the boot
 * sequence, so binding here keeps the dependency graph acyclic.
 */
import { state, $ } from "../state.js";
import { buildShareImage, shareImage } from "../share/index.js";

let busy = false;
let previewUrl = null;

function setLabel(btn, text) {
  btn.textContent = text;
}

function closePreview() {
  const sheet = $("#share-preview");
  if (!sheet) return;
  sheet.classList.remove("show");
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }
}

function openPreview(built) {
  const sheet = $("#share-preview");
  const img = $("#share-preview-img");
  if (!sheet || !img) return;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(built.blob);
  img.src = previewUrl;
  img.alt = `Share card for ${built.name}`;
  sheet.classList.add("show");
}

async function onShare() {
  const btn = $("#info-share");
  const sat = state.selected;
  if (!btn || busy || !sat) return;
  if (sat._neo || !sat.rec) return;

  busy = true;
  btn.disabled = true;
  setLabel(btn, "◐ Preparing…");
  try {
    const built = await buildShareImage(sat, new Date(state.simNow));
    if (!built) {
      setLabel(btn, "Unavailable");
      return;
    }
    const outcome = await shareImage(built);
    if (outcome === "preview") {
      openPreview(built);
      setLabel(btn, "↗ Share Image");
    } else if (outcome === "downloaded") {
      setLabel(btn, "✓ Saved");
    } else {
      setLabel(btn, "↗ Share Image");
    }
  } catch (e) {
    console.error("share failed", e);
    setLabel(btn, "Failed — retry");
  } finally {
    busy = false;
    btn.disabled = false;
    setTimeout(() => {
      if (!busy) setLabel(btn, "↗ Share Image");
    }, 2200);
  }
}

/** Hide the Share button for objects that can't produce a card (NEOs). */
export function updateShareButton(s) {
  const btn = $("#info-share");
  if (!btn) return;
  const ok = !!(s && !s._neo && s.rec);
  btn.style.display = ok ? "" : "none";
  setLabel(btn, "↗ Share Image");
}

/** Wire the share control. Call once at boot. */
export function initShare() {
  const btn = $("#info-share");
  if (btn) btn.onclick = onShare;

  const close = $("#share-preview-close");
  if (close) close.onclick = closePreview;
  const sheet = $("#share-preview");
  if (sheet) {
    sheet.addEventListener("click", (e) => {
      if (e.target === sheet) closePreview();
    });
  }
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePreview();
  });
}

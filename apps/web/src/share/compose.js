/**
 * Canvas 2D composition of the share card.
 *
 * Everything is drawn with the 2D API rather than rasterising DOM: html2canvas
 * would be a new runtime dependency that re-implements CSS approximately, and
 * the SVG <foreignObject> trick is unreliable in WebKit (and taints the canvas
 * in some versions) — neither is a good bet for the Capacitor iOS wrapper this
 * has to work in. Drawing directly is deterministic and dependency-free.
 */
import { projectToCard, occludedByEarth } from "./camera.js";
import {
  SHARE_W,
  SHARE_H,
  PAD,
  BG,
  INK,
  INK_DIM,
  INK_FAINT,
  BRAND_GRAD,
  wrapLines,
  fitFontSize,
} from "./layout.js";

const SERIF = '"Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif';
const MONO = "Oxanium, ui-sans-serif, system-ui, sans-serif";
const LOGO = "Orbitron, ui-sans-serif, system-ui, sans-serif";

/**
 * Canvas silently falls back to a system font if a webfont hasn't loaded yet,
 * so the exact faces used below are requested up front. The app's three faces
 * are self-hosted (apps/web/public/fonts), so this resolves from cache in
 * practice; it's awaited rather than assumed because a first-share on a cold
 * load would otherwise render in the fallback face.
 */
export async function ensureFonts() {
  if (!document.fonts || !document.fonts.load) return;
  const specs = [
    `700 69px ${SERIF}`, // object name — weight ported from #info .nm
    `600 29px ${MONO}`, // category badge label — weight ported from #info .cat-tag
    `400 47px ${MONO}`, // NORAD line + description — weight ported from #info .nid / .lead
    `500 47px ${MONO}`, // stat values — weight ported from .stat .v
    `700 26px ${LOGO}`,
  ];
  try {
    await Promise.all(specs.map((s) => document.fonts.load(s)));
  } catch {
    /* fall back to whatever is available rather than failing the export */
  }
}

/** Letter-spaced uppercase run — canvas has no letterSpacing in older WebKit. */
function drawTracked(ctx, text, x, y, spacing) {
  let cx = x;
  for (const ch of String(text)) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
  return cx - spacing - x;
}

function trackedWidth(ctx, text, spacing) {
  let w = 0;
  for (const ch of String(text)) w += ctx.measureText(ch).width + spacing;
  return Math.max(0, w - spacing);
}

/**
 * Rounded rectangle via arcTo rather than ctx.roundRect: roundRect only
 * arrived in Safari 16.4, and this has to draw inside the Capacitor iOS
 * wrapper on whatever WebKit the device is running.
 */
function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * The satellite brand mark from index.html, redrawn at `size` px.
 *
 * A direct port of the inline SVG: the transform below puts the canvas into
 * that mark's 64-unit viewBox with the same -22 degree tilt, so every
 * coordinate here is the number in the SVG and the two can be diffed against
 * each other. The gradient is created after the transform so it rotates with
 * the craft, matching the SVG's gradientUnits="userSpaceOnUse".
 */
function drawWordmark(ctx, x, y, size) {
  const cy = y + size / 2;
  const s = size / 64; // source artwork is a 64-unit viewBox

  // The mark sits over whatever the globe happens to show — daylit terrain and
  // city-light clusters both wash it out without a shadow behind it.
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.85)";
  ctx.shadowBlur = 12;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.translate(32, 32);
  ctx.rotate((-22 * Math.PI) / 180);
  ctx.translate(-32, -32);

  const g = ctx.createLinearGradient(4, 4, 60, 60);
  g.addColorStop(0, BRAND_GRAD[0]);
  g.addColorStop(0.45, BRAND_GRAD[1]);
  g.addColorStop(1, BRAND_GRAD[2]);

  // solar arrays
  ctx.fillStyle = g;
  roundedRect(ctx, 6.5, 25.5, 17, 9, 1.4);
  ctx.fill();
  roundedRect(ctx, 40.5, 25.5, 17, 9, 1.4);
  ctx.fill();

  // cell divisions
  ctx.strokeStyle = "rgba(11,16,32,0.3)";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (const ax of [6.5, 40.5]) {
    ctx.moveTo(ax, 30);
    ctx.lineTo(ax + 17, 30);
    for (const dx of [5.7, 11.3]) {
      ctx.moveTo(ax + dx, 26.2);
      ctx.lineTo(ax + dx, 33.8);
    }
  }
  ctx.stroke();

  // booms, mast, gold instrument bar
  ctx.fillStyle = "#cbd5e1";
  roundedRect(ctx, 23.2, 29.35, 3.2, 1.1, 0.55);
  ctx.fill();
  roundedRect(ctx, 37.6, 29.35, 3.2, 1.1, 0.55);
  ctx.fill();
  roundedRect(ctx, 31.55, 35, 0.9, 3.6, 0.45);
  ctx.fill();
  ctx.fillStyle = "#f5c168";
  roundedRect(ctx, 29.4, 38.2, 5.2, 1.7, 0.75);
  ctx.fill();

  // bus body: lighter upper half, darker lower half, dark sensor panel
  ctx.fillStyle = "#eef1f8";
  roundedRect(ctx, 26, 24.2, 12, 10.8, 1.8);
  ctx.fill();
  ctx.fillStyle = "#c3ccd8";
  ctx.beginPath();
  ctx.moveTo(26, 29.3);
  ctx.lineTo(38, 29.3);
  ctx.lineTo(38, 33.2);
  ctx.arcTo(38, 35, 36.2, 35, 1.8);
  ctx.lineTo(27.8, 35);
  ctx.arcTo(26, 35, 26, 33.2, 1.8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#0b1020";
  roundedRect(ctx, 27.9, 26.1, 4.2, 2.3, 0.5);
  ctx.fill();

  ctx.restore();

  ctx.save();
  ctx.font = `700 ${Math.round(size * 0.46)}px ${LOGO}`;
  ctx.fillStyle = INK;
  ctx.globalAlpha = 0.95;
  ctx.textBaseline = "middle";
  drawTracked(ctx, "ORBITAL TRAFFIC", x + size + size * 0.28, cy + 1, size * 0.055);
  ctx.restore();

  ctx.restore(); // drops the shadow
}

/**
 * Orbit path, projected into card space. Segments hidden behind the Earth are
 * drawn faintly rather than dropped, which reads as depth instead of as a
 * broken line.
 */
function drawOrbit(ctx, camera, points) {
  if (!points || points.length < 2) return;
  const pts = points.map((w) => {
    const p = projectToCard(camera, w);
    return {
      x: p.x * SHARE_W,
      y: p.y * SHARE_H,
      ok: p.z <= 1,
      hidden: occludedByEarth(camera.position, w),
    };
  });

  for (const pass of [true, false]) {
    ctx.save();
    ctx.strokeStyle = "#ffffff";
    ctx.globalAlpha = pass ? 0.12 : 0.62;
    ctx.lineWidth = pass ? 2 : 3;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    let drawing = false;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const seg = a.hidden || b.hidden;
      if (!a.ok || !b.ok || seg !== pass) {
        drawing = false;
        continue;
      }
      if (!drawing) {
        ctx.moveTo(a.x, a.y);
        drawing = true;
      }
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    ctx.restore();
  }
}

/** Selection ring over the subject — the app's #sel-marker is DOM, not scene. */
function drawSubjectMarker(ctx, subject, color) {
  if (!subject || subject.z > 1) return;
  const x = subject.x * SHARE_W;
  const y = subject.y * SHARE_H;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 40, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = 0.95;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, 24, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Info-section type tokens, ported from the object detail popup card's real
 * CSS (apps/web/src/styles/app.css, `#info` rules) rather than approximated,
 * so the share card's hierarchy matches the popup's rather than merely
 * resembling it. Every px/em value below is commented with its exact source
 * selector.
 *
 * POPUP_SCALE maps the popup's fixed desktop content column (#info is
 * 300px wide with 15px padding each side = 270px content) onto the share
 * card's content column (SHARE_W - PAD*2 = 936px), so the name/NORAD/
 * description/stat sizes keep the same *relative* proportions the popup
 * card itself uses — not sizes picked independently per element.
 */
const POPUP_SCALE = (SHARE_W - PAD * 2) / 270;
const pop = (cssPx) => Math.round(cssPx * POPUP_SCALE);

const CAT_FS = pop(8.5); // #info .cat-tag font-size
const CAT_TRACK = CAT_FS * 0.2; // #info .cat-tag letter-spacing: 0.2em
const CAT_GAP = pop(7); // #info .cat-tag gap: 7px (swatch → label)
const CAT_SWATCH = pop(7); // #info .cat-tag .d: 7x7px square, no border-radius
const CAT_MB = pop(9); // #info .cat-tag margin-bottom: 9px

const NAME_FS_MAX = pop(20); // #info .nm font-size
const NAME_FS_MIN = Math.round(NAME_FS_MAX * 0.52); // shrink floor for long names (popup wraps instead; card fits one line)
const NAME_TRACK_EM = -0.02; // #info .nm letter-spacing (final cascade value)

const NID_FS = pop(9.5); // #info .nid font-size
const NID_TRACK = NID_FS * 0.1; // #info .nid letter-spacing: 0.1em
const NID_MT = pop(6); // #info .nid margin-top: 6px

const LEAD_FS = pop(11.5); // #info .lead font-size
const LEAD_LH = Math.round(LEAD_FS * 1.68); // #info .lead line-height: 1.68
const LEAD_GAP_TOP = pop(9 + 13); // .top bottom padding (9px) + .lead top padding (13px)

const GRID_COL_GAP = pop(16); // #info .grid column-gap
const STAT_K_FS = pop(8); // .stat .k font-size
const STAT_K_TRACK = STAT_K_FS * 0.18; // .stat .k letter-spacing: 0.18em
const STAT_V_FS = pop(13.5); // .stat .v font-size
const STAT_V_SMALL_FS = pop(9); // .stat .v small font-size
const STAT_V_MT = pop(3); // .stat .v margin-top: 3px (label → value)

/**
 * Compose the finished card.
 *
 * `capture` is captureGlobe()'s return value; `model` is the plain text/stat
 * data assembled by index.js (kept out of here so this stays presentational).
 */
export function composeCard(capture, model) {
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_W;
  canvas.height = SHARE_H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, SHARE_W, SHARE_H);

  // Globe, downscaled from the supersampled capture.
  if (capture && capture.canvas) {
    ctx.drawImage(capture.canvas, 0, 0, SHARE_W, SHARE_H);
  }
  if (capture) {
    drawOrbit(ctx, capture.camera, model.ringPoints);
    drawSubjectMarker(ctx, capture.subject, model.catColor);
  }

  // Scrim: transparent over the globe, solid under the text block.
  const scrim = ctx.createLinearGradient(0, SHARE_H * 0.4, 0, SHARE_H * 0.62);
  scrim.addColorStop(0, "rgba(7,8,15,0)");
  scrim.addColorStop(0.55, "rgba(7,8,15,0.72)");
  scrim.addColorStop(1, "rgba(7,8,15,0.97)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, SHARE_H * 0.4, SHARE_W, SHARE_H * 0.6);
  ctx.fillStyle = "rgba(7,8,15,0.97)";
  ctx.fillRect(0, SHARE_H * 0.62, SHARE_W, SHARE_H * 0.38);

  drawWordmark(ctx, PAD, PAD, 46);

  const maxW = SHARE_W - PAD * 2;
  ctx.textBaseline = "alphabetic";

  // --- bottom-anchored text block ---
  // Baseline-to-baseline gaps below approximate CSS block flow as
  // prevDescent + cssGap + nextAscent, using standard sans-serif fractions
  // for the parts no CSS rule specifies (canvas positions by baseline, CSS
  // positions by box) — the cssGap term itself is the real ported value
  // wherever the popup defines one (CAT_MB / NID_MT / LEAD_GAP_TOP /
  // STAT_V_MT below).
  const DESCENT_F = 0.25;
  const ASCENT_F = 0.8;
  const stackGap = (prevFontPx, cssGapPx, nextFontPx) =>
    prevFontPx * DESCENT_F + cssGapPx + nextFontPx * ASCENT_F;

  const timestampY = SHARE_H - PAD; // footer position — unchanged

  // Stats row → footer gap: the footer is unique to the share card (the
  // popup has no equivalent), so this stays a tuned constant rather than a
  // ported one — kept at the same relative breathing room as before.
  const statValueY = timestampY - Math.round(stackGap(STAT_V_FS, 34, 22));
  const statLabelY = statValueY - Math.round(stackGap(STAT_K_FS, STAT_V_MT, STAT_V_FS));
  // Description → stats gap: likewise no popup equivalent (the popup
  // interposes chips + a "Live Telemetry" label here, both dropped from the
  // share card per spec) — tuned constant, scaled from the previous design.
  const descLastY = statLabelY - Math.round(stackGap(LEAD_FS, 49, STAT_K_FS));

  // Description — regular body-weight prose (up to 3 lines, ellipsised),
  // matching #info .lead rather than the previously-used 500 weight.
  ctx.font = `400 ${LEAD_FS}px ${MONO}`;
  ctx.fillStyle = INK_DIM;
  const descLines = wrapLines(model.description, maxW, (t) => ctx.measureText(t).width, 3);
  descLines.forEach((line, i) => {
    ctx.fillText(line, PAD, descLastY - (descLines.length - 1 - i) * LEAD_LH);
  });

  const noradY =
    descLastY - descLines.length * LEAD_LH - Math.round(NID_FS * DESCENT_F + LEAD_GAP_TOP);

  // NORAD / international designator — regular weight, matching #info .nid.
  ctx.font = `400 ${NID_FS}px ${MONO}`;
  ctx.fillStyle = INK_FAINT;
  drawTracked(ctx, model.norad, PAD, noradY, NID_TRACK);

  // Object name — shrinks to fit rather than wrapping (the popup card wraps
  // onto a second line instead; the smaller share-card format has no room
  // for that, so a single shrinking line is the closer fit).
  const nameSize = fitFontSize(
    (size) => {
      ctx.font = `700 ${size}px ${SERIF}`;
      return ctx.measureText(model.name).width;
    },
    maxW,
    NAME_FS_MAX,
    NAME_FS_MIN
  );
  const nameY = noradY - Math.round(nameSize * DESCENT_F + NID_MT + NID_FS * ASCENT_F);
  ctx.font = `700 ${nameSize}px ${SERIF}`;
  ctx.fillStyle = INK;
  drawTracked(ctx, model.name, PAD, nameY, nameSize * NAME_TRACK_EM);

  // Category badge — small colored square + uppercase label in ink-dim
  // (only the swatch carries the category color; #info .cat-tag itself
  // colors the label ink-dim, not the category color).
  const catY = nameY - Math.round(CAT_FS * DESCENT_F + CAT_MB + nameSize * ASCENT_F);
  ctx.save();
  ctx.shadowColor = model.catColor;
  // box-shadow: 0 0 7px currentColor — same 7px CSS value as the swatch's
  // own width/height, so CAT_SWATCH (already scaled) doubles as the blur radius.
  ctx.shadowBlur = CAT_SWATCH;
  ctx.fillStyle = model.catColor;
  ctx.fillRect(PAD, catY - CAT_SWATCH, CAT_SWATCH, CAT_SWATCH);
  ctx.restore();
  ctx.font = `600 ${CAT_FS}px ${MONO}`;
  ctx.fillStyle = INK_DIM;
  drawTracked(ctx, model.catLabel.toUpperCase(), PAD + CAT_SWATCH + CAT_GAP, catY, CAT_TRACK);

  // --- stats row: two-column grid, label above value, matching .stat .k/.v ---
  const colW = (maxW - GRID_COL_GAP) / 2;
  model.stats.slice(0, 2).forEach((stat, i) => {
    const x = PAD + i * (colW + GRID_COL_GAP);
    ctx.font = `500 ${STAT_K_FS}px ${MONO}`;
    ctx.fillStyle = INK_FAINT;
    drawTracked(ctx, stat.label.toUpperCase(), x, statLabelY, STAT_K_TRACK);
    ctx.font = `500 ${STAT_V_FS}px ${MONO}`;
    ctx.fillStyle = INK;
    ctx.fillText(stat.value, x, statValueY);
    if (stat.unit) {
      // Ports .stat .v small — the unit rendered smaller/dimmer right after
      // the number, e.g. popup's "408 <small>km up</small>".
      const valueW = ctx.measureText(stat.value).width;
      ctx.font = `400 ${STAT_V_SMALL_FS}px ${MONO}`;
      ctx.fillStyle = INK_DIM;
      ctx.fillText(" " + stat.unit, x + valueW, statValueY);
    }
  });

  // --- footer ---
  ctx.font = `500 22px ${MONO}`;
  ctx.fillStyle = INK_FAINT;
  ctx.globalAlpha = 0.75;
  ctx.fillText(model.timestamp, PAD, timestampY);
  const site = "orbitaltraffic.app";
  const siteW = trackedWidth(ctx, site, 1.6);
  drawTracked(ctx, site, SHARE_W - PAD - siteW, timestampY, 1.6);
  ctx.globalAlpha = 1;

  return canvas;
}

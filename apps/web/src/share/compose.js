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
    `800 66px ${SERIF}`,
    `700 66px ${SERIF}`,
    `600 40px ${MONO}`,
    `500 30px ${MONO}`,
    `500 22px ${MONO}`,
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
  const timestampY = SHARE_H - PAD;
  const statValueY = timestampY - 62;
  const statLabelY = statValueY - 42;
  const descLastY = statLabelY - 74;

  // Description (up to 3 lines, ellipsised).
  ctx.font = `500 30px ${MONO}`;
  ctx.fillStyle = INK_DIM;
  const descLines = wrapLines(model.description, maxW, (t) => ctx.measureText(t).width, 3);
  descLines.forEach((line, i) => {
    ctx.fillText(line, PAD, descLastY - (descLines.length - 1 - i) * 42);
  });

  const noradY = descLastY - descLines.length * 42 - 26;

  // NORAD / international designator.
  ctx.font = `500 22px ${MONO}`;
  ctx.fillStyle = INK_FAINT;
  drawTracked(ctx, model.norad, PAD, noradY, 1.4);

  // Object name — shrinks to fit rather than wrapping.
  const nameY = noradY - 44;
  const nameSize = fitFontSize(
    (size) => {
      ctx.font = `800 ${size}px ${SERIF}`;
      return ctx.measureText(model.name).width;
    },
    maxW,
    66,
    34
  );
  ctx.font = `800 ${nameSize}px ${SERIF}`;
  ctx.fillStyle = INK;
  ctx.fillText(model.name, PAD, nameY);

  // Category chip.
  const catY = nameY - nameSize - 14;
  ctx.font = `600 22px ${MONO}`;
  ctx.fillStyle = model.catColor;
  ctx.beginPath();
  ctx.arc(PAD + 7, catY - 7, 7, 0, Math.PI * 2);
  ctx.fill();
  drawTracked(ctx, model.catLabel.toUpperCase(), PAD + 26, catY, 2.6);

  // --- stats row ---
  const colW = maxW / 2;
  model.stats.slice(0, 2).forEach((stat, i) => {
    const x = PAD + i * colW;
    ctx.font = `500 22px ${MONO}`;
    ctx.fillStyle = INK_FAINT;
    drawTracked(ctx, stat.label.toUpperCase(), x, statLabelY, 2.4);
    ctx.font = `600 40px ${MONO}`;
    ctx.fillStyle = INK;
    ctx.fillText(stat.value, x, statValueY);
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

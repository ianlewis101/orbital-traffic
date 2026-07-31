/**
 * Share-card geometry and pure text helpers.
 *
 * Everything here is deliberately free of DOM/WebGL so it can be unit-tested:
 * jsdom has no canvas 2D implementation (the optional `canvas` package isn't
 * installed), so the drawing code in compose.js can only be verified visually
 * in a real browser. Keeping the arithmetic and the text fitting out here means
 * the parts most likely to regress silently are still covered by tests.
 */

/** Instagram/X-friendly 4:5 portrait. */
export const SHARE_W = 1080;
export const SHARE_H = 1350;

/**
 * Supersampling factor for the WebGL pass: the globe renders at SSAA× the
 * output size and is downscaled when composited.
 *
 * `antialias: true` on the renderer applies to the default framebuffer only —
 * it does nothing for the offscreen WebGLRenderTarget this feature renders
 * into. Supersampling is used instead of a multisampled render target because
 * the point clouds are alpha-tested sprites (clouds.js sets `alphaTest: 0.08`),
 * whose cutout edges MSAA barely touches but SSAA resolves cleanly.
 */
export const SSAA = 2;

/** Outer margin for all card content. */
export const PAD = 72;

/**
 * How much taller the camera's virtual frame is than the output, in output
 * pixels. The rendered window is taken from the BOTTOM of that virtual frame
 * (see camera.js's setViewOffset call), which lifts the globe into the upper
 * part of the card and leaves the lower third for the text block.
 */
export const VIEW_SHIFT = 320;

/** Card background — matches --bg so the scrim fades into a flat base. */
export const BG = "#07080f";

/** Text colours, mirroring app.css's --ink / --ink-dim / --ink-faint. */
export const INK = "#eef1f8";
export const INK_DIM = "#9aa2b8";
export const INK_FAINT = "#737a90";

/** Wordmark gradient stops, copied from index.html's #brandMarkGrad. */
export const BRAND_GRAD = ["#eef1f8", "#5eead4", "#a78bfa"];

/**
 * Greedy word wrap with a hard line cap and an ellipsis on overflow.
 *
 * `measure` is injected rather than taking a canvas context so this stays
 * testable without a real 2D context.
 */
export function wrapLines(text, maxWidth, measure, maxLines = 3) {
  const words = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return [];

  const all = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (cur && measure(next) > maxWidth) {
      all.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) all.push(cur);
  if (all.length <= maxLines) return all;

  // Truncated: trim words off the last kept line until the ellipsis fits too.
  const kept = all.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last && measure(last + "…") > maxWidth) {
    const parts = last.split(" ");
    parts.pop();
    if (!parts.length) break;
    last = parts.join(" ");
  }
  kept[maxLines - 1] = last + "…";
  return kept;
}

/**
 * Shrink a font size until `text` fits `maxWidth`, down to `min`.
 * `measureAt(size)` returns the text width at that size.
 */
export function fitFontSize(measureAt, maxWidth, start, min) {
  let size = start;
  while (size > min && measureAt(size) > maxWidth) size -= 2;
  return size;
}

/**
 * "NORAD 25544 · INT'L 1998-067A" for the card's identifier line.
 *
 * Duplicates the designator parse in ui/info.js's launchInfo() rather than
 * importing it: info.js would then have to be imported by the share module,
 * which main.js already wires the other way round.
 */
export function formatDesignation(id, intldesg) {
  const d = String(intldesg || "").trim();
  let out = `NORAD ${id}`;
  if (/^\d{5}/.test(d)) {
    const yy = parseInt(d.slice(0, 2), 10);
    const year = yy < 57 ? 2000 + yy : 1900 + yy;
    out += `  ·  INT'L ${year}-${d.slice(2)}`;
  } else if (d) {
    out += `  ·  INT'L ${d}`;
  }
  return out;
}

/** Download/share filename for an object's card. */
export function shareFilename(name) {
  const slug =
    String(name || "object")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "object";
  return `orbital-traffic-${slug}.png`;
}

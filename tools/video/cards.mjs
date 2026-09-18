// =====================================================================
// CARD RENDERING
// =====================================================================
//
// Everything in the video that is typography rather than globe: the lines
// burned over the hero shots, the printed-page beats, and the closing logo.
//
// All three are rendered by the same headless Chromium that shoots the app,
// against the running preview server, so they can use the app's own webfonts
// (/fonts/*.woff2) and therefore look like the product rather than like a
// video editor's default typeface.
//
// Titles come out as transparent PNGs and are composited by ffmpeg with fade
// in/out, rather than being drawn into the app's own DOM. That keeps type out
// of the frame-by-frame capture loop entirely — one render per line instead
// of one per frame — and lets the fade be a filter-graph parameter that can
// be retimed without re-shooting anything.

import { writeFile, rm } from "node:fs/promises";
import { join } from "node:path";

const SERIF_STACK = `"Liberation Serif", "Times New Roman", "DejaVu Serif", Georgia, serif`;

/** Escape text for safe interpolation into the card HTML. */
function esc(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

const FONT_FACES = `
  @font-face{font-family:'Bricolage Grotesque';font-weight:800;font-display:block;
    src:url('/fonts/bricolage-grotesque-latin.woff2') format('woff2')}
  @font-face{font-family:'Oxanium';font-weight:500;font-display:block;
    src:url('/fonts/oxanium-latin.woff2') format('woff2')}
  @font-face{font-family:'Oxanium';font-weight:700;font-display:block;
    src:url('/fonts/oxanium-latin.woff2') format('woff2')}
`;

// ---------------------------------------------------------------------
// TITLE OVERLAY
// ---------------------------------------------------------------------
// Sits in the upper third, clear of TikTok's own bottom-edge UI (caption,
// buttons and the account row eat roughly the lower 22% of the screen — any
// type down there is covered on a real phone).
//
// The reference sets its titles in a light-weight geometric sans and leans on
// a soft shadow to hold them over a bright frame. Oxanium is the app's own
// UI face and does the same job while reading as the product.

const TITLE_SIZES = {
  normal: { size: 74, weight: 500, track: "0.005em", face: "Oxanium" },
  big: { size: 92, weight: 700, track: "-0.01em", face: "Oxanium" },
  // The product name itself: the app's logo face, uppercase, wide-tracked.
  title: { size: 88, weight: 800, track: "0.1em", face: "Bricolage Grotesque" },
};

export function titleHtml({ line, size = "normal", width, height }) {
  const s = TITLE_SIZES[size] || TITLE_SIZES.normal;
  const lines = String(line)
    .split("\n")
    .map((l) => `<div class="l">${esc(l)}</div>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${FONT_FACES}
    html,body{margin:0;padding:0;width:${width}px;height:${height}px;background:transparent}
    .wrap{position:absolute;left:0;right:0;top:${Math.round(height * 0.17)}px;
      display:flex;flex-direction:column;align-items:center;gap:${Math.round(s.size * 0.16)}px;
      padding:0 ${Math.round(width * 0.09)}px}
    .l{font-family:'${s.face}',system-ui,sans-serif;font-weight:${s.weight};
      font-size:${s.size}px;line-height:1.14;letter-spacing:${s.track};
      color:#fff;text-align:center;
      /* Two shadows: a tight one for edge definition against city lights,
         and a wide soft one so the line still holds over a bright limb. */
      text-shadow:0 2px 10px rgba(0,0,0,.55), 0 0 46px rgba(0,0,0,.75)}
  </style></head><body><div class="wrap">${lines}</div></body></html>`;
}

// ---------------------------------------------------------------------
// BOOK PAGE
// ---------------------------------------------------------------------
// The signature beat of the format. What sells it is not the page, it is the
// CROP: the camera is close enough that words run off both edges, so the
// viewer is reading a fragment of something longer rather than a caption
// composed for them. The body is therefore laid out much wider than the
// frame and deliberately overflows on both sides.
//
// Justified, serif, generous leading, and one word behind a flat yellow
// marker — the same highlighter yellow (#faed27-ish) the reference uses,
// which reads as physical rather than as a UI selection.

export function bookHtml({ text, highlight, width, height }) {
  const idx = text.indexOf(highlight);
  const body =
    idx < 0
      ? esc(text)
      : esc(text.slice(0, idx)) +
        `<mark>${esc(highlight)}</mark>` +
        esc(text.slice(idx + highlight.length));

  // Laid out 1.62x the frame width, so the frame sits INSIDE a real book's
  // measure and words run off both edges — the crop is what sells the shot.
  // Final placement is set by centerOnHighlight() once the text has laid
  // out, not here; see the note there.
  const pageW = Math.round(width * 1.62);

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;width:${width}px;height:${height}px;
      background:#fdfcf8;overflow:hidden}
    .page{position:absolute;top:50%;left:50%;width:${pageW}px;
      transform:translate(-50%,-50%);
      padding:0 ${Math.round(pageW * 0.055)}px;box-sizing:border-box}
    /* Sized so a passage of roughly 450 characters fills the frame top to
       bottom at about six words a line. That density is the whole effect:
       the viewer must be looking at a page of a book, not at a caption, and
       white space at the top and bottom instantly gives it away as neither. */
    p{font-family:${SERIF_STACK};font-size:${Math.round(width * 0.085)}px;
      line-height:1.62;text-align:justify;color:#15130f;margin:0;
      /* Real typesetting, not a browser default: hyphenation plus a slightly
         open word-space is what keeps a justified measure from rivering. */
      hyphens:auto;-webkit-hyphens:auto;word-spacing:0.02em}
    mark{background:#f7ed4a;color:#15130f;padding:0.06em 0.1em;
      box-decoration-break:clone;-webkit-box-decoration-break:clone}
  </style></head><body><div class="page"><p>${body}</p></div></body></html>`;
}

// ---------------------------------------------------------------------
// LOGO CARD
// ---------------------------------------------------------------------
// Black, centred mark, wordmark, one line of call to action. The mark is the
// repo's own transparent orbit-ring SVG (design/brand/icon-mark-transparent
// .svg), inlined by the caller so the card has no external dependency at
// render time.

export function logoHtml({ markSvg, width, height, tagline, cta }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${FONT_FACES}
    html,body{margin:0;padding:0;width:${width}px;height:${height}px;background:#07080f}
    .c{position:absolute;inset:0;display:flex;flex-direction:column;
      align-items:center;justify-content:center;gap:${Math.round(height * 0.018)}px}
    .mark{width:${Math.round(width * 0.3)}px;height:${Math.round(width * 0.3)}px;
      margin-bottom:${Math.round(height * 0.012)}px}
    .mark svg{width:100%;height:100%;display:block}
    .wm{font-family:'Bricolage Grotesque',system-ui,sans-serif;font-weight:800;
      font-size:${Math.round(width * 0.093)}px;letter-spacing:0.02em;color:#eef1f8;
      text-align:center;line-height:1}
    .tag{font-family:'Oxanium',system-ui,sans-serif;font-weight:500;
      font-size:${Math.round(width * 0.033)}px;letter-spacing:0.22em;
      text-transform:uppercase;color:#5eead4;text-align:center}
    .cta{margin-top:${Math.round(height * 0.03)}px;
      font-family:'Oxanium',system-ui,sans-serif;font-weight:500;
      font-size:${Math.round(width * 0.032)}px;letter-spacing:0.06em;
      color:#8b93a7;text-align:center}
  </style></head><body><div class="c">
    <div class="mark">${markSvg}</div>
    <div class="wm">Orbital Traffic</div>
    <div class="tag">${esc(tagline)}</div>
    <div class="cta">${esc(cta)}</div>
  </div></body></html>`;
}

// ---------------------------------------------------------------------
// RENDERING
// ---------------------------------------------------------------------

/**
 * Load a card into the page. `html` is written to disk and served over the
 * preview server's origin so relative /fonts/ URLs resolve — a data: URL
 * would make them cross-origin and silently fall back to a system face.
 *
 * Returns a disposer; the caller must call it, because the preview server
 * serves straight out of dist/ and a stray card file would otherwise ship
 * with the next deploy.
 */
async function loadCard(page, { html, publicDir, baseUrl, centerHighlight }) {
  const name = `__card-${Math.random().toString(36).slice(2)}.html`;
  const tmp = join(publicDir, name);
  await writeFile(tmp, html, "utf8");
  await page.goto(`${baseUrl}/${name}`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  if (centerHighlight) await centerOnHighlight(page);
  return () => rm(tmp, { force: true });
}

/**
 * Slide the page so the highlighted word sits near the middle of the frame.
 *
 * This has to happen after layout, and it is not cosmetic. The frame shows
 * only the middle ~62% of the measure, so where the marked word lands is
 * decided by justification — change one word earlier in the passage and the
 * highlight can end up in the cropped-off margin, which silently destroys
 * the only beat the shot exists for. Measuring the mark and translating to
 * it makes the passage editable without anyone having to re-check the crop.
 *
 * Both offsets are clamped: horizontally to the overflow that actually
 * exists (so the page's own margin can never pull into frame) and vertically
 * to a tenth of the height (so pulling a highlight near the first or last
 * line towards the centre cannot open a band of blank paper at top or
 * bottom, which would give away that it is not a real page).
 */
async function centerOnHighlight(page) {
  await page.evaluate(() => {
    const mark = document.querySelector("mark");
    const pageEl = document.querySelector(".page");
    if (!mark || !pageEl) return;
    const m = mark.getBoundingClientRect();
    const overflow = Math.max(0, (pageEl.offsetWidth - window.innerWidth) / 2);
    const clamp = (v, lim) => Math.max(-lim, Math.min(lim, v));
    const dx = clamp(window.innerWidth / 2 - (m.left + m.width / 2), overflow * 0.82);
    const dy = clamp(window.innerHeight / 2 - (m.top + m.height / 2), window.innerHeight * 0.1);
    pageEl.style.transform = `translate(calc(-50% + ${Math.round(dx)}px), calc(-50% + ${Math.round(dy)}px))`;
  });
}

/** Screenshot one card as a single still. */
export async function renderCard(
  page,
  { html, out, transparent, publicDir, baseUrl, centerHighlight }
) {
  const dispose = await loadCard(page, { html, publicDir, baseUrl, centerHighlight });
  try {
    await page.screenshot({ path: out, omitBackground: !!transparent });
  } finally {
    await dispose();
  }
  return out;
}

/**
 * Render a card as a frame sequence with a slow push.
 *
 * The zoom is done in the browser, as a CSS transform re-applied per frame,
 * rather than with ffmpeg's zoompan. zoompan rounds its crop window to whole
 * pixels every frame, and on a shot this slow that rounding is a visible
 * stutter — the page appears to tick rather than drift. A CSS transform is
 * resampled in floating point, so the same move comes out genuinely smooth.
 *
 * Scale never goes below 1.0 anywhere in the script, so the scaled page
 * always covers the frame and no edge can pull in from outside it.
 */
export async function renderCardFrames(
  page,
  { html, frames, zoom, frameDir, publicDir, baseUrl, startIndex = 0, easeFn, centerHighlight }
) {
  const dispose = await loadCard(page, { html, publicDir, baseUrl, centerHighlight });
  try {
    for (let i = 0; i < frames; i++) {
      const u = frames === 1 ? 1 : i / (frames - 1);
      const k = easeFn ? easeFn(u) : u;
      const scale = zoom ? zoom.from + (zoom.to - zoom.from) * k : 1;
      await page.evaluate((s) => {
        const el = document.body;
        el.style.transformOrigin = "50% 50%";
        el.style.transform = `scale(${s})`;
      }, scale);
      await page.screenshot({
        path: join(frameDir, `${String(startIndex + i).padStart(6, "0")}.png`),
        animations: "disabled",
      });
    }
  } finally {
    await dispose();
  }
  return frames;
}

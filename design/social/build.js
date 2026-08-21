/**
 * Orbital Traffic — social kit assembler.
 *
 * Turns a post definition from content.js into DOM. The browser is the only
 * renderer: tools/render-social.mjs exports by driving the very same
 * index.html contact sheet and screenshotting its .slide elements, so what
 * you preview is exactly what ships — there is no second layout path.
 *
 * Built with DOM nodes throughout, never innerHTML, so copy containing
 * <, & or " is impossible to break and there is nothing to escape.
 */

import { CATS, catColorHex } from "../../apps/web/src/config.js";
import { POSTS, SITE, DEFAULT_SIZE, ARTBOARD } from "./content.js";

/* ==========================================================================
   Object count — derived, never typed. Same rounding as
   apps/web/vite.config.js so every surface quotes one figure.
   ========================================================================== */

const SATELLITES_JSON = "../../apps/web/public/data/satellites.json";

export async function resolveObjectCount() {
  // tools/render-social.mjs injects this before the page loads; the fallback
  // is what makes the contact sheet work when opened by hand.
  if (globalThis.__OBJECT_COUNT__) return globalThis.__OBJECT_COUNT__;
  const res = await fetch(new URL(SATELLITES_JSON, import.meta.url));
  const sats = await res.json();
  return formatObjectCount(sats.length);
}

export function formatObjectCount(n) {
  return `${(Math.floor(n / 1000) * 1000).toLocaleString("en-US")}+`;
}

/* ==========================================================================
   Text
   ========================================================================== */

function subst(str, ctx) {
  return String(str).replace(/\{\{OBJECT_COUNT\}\}/g, ctx.objectCount);
}

/** `\n` -> <br>, `[run]` -> gradient-accented span. Text nodes only. */
function richText(el, str, ctx) {
  subst(str, ctx)
    .split("\n")
    .forEach((line, i) => {
      if (i) el.appendChild(document.createElement("br"));
      const re = /\[([^\]]+)\]/g;
      let last = 0;
      let m;
      while ((m = re.exec(line))) {
        if (m.index > last) el.append(line.slice(last, m.index));
        const span = document.createElement("span");
        span.className = "hl";
        span.textContent = m[1];
        el.appendChild(span);
        last = re.lastIndex;
      }
      if (last < line.length) el.append(line.slice(last));
    });
  return el;
}

function node(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}

function rich(tag, cls, str, ctx) {
  return richText(node(tag, cls), str, ctx);
}

/* ==========================================================================
   Backdrop — starfield + the orbit arc that advances across a carousel
   ========================================================================== */

const SVG_NS = "http://www.w3.org/2000/svg";
let uid = 0;

function svg(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, String(v));
  return el;
}

/** Deterministic PRNG — the same slide always exports the same starfield. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Orbit geometry: the app icon's ellipse (design/brand/icon-master.svg) scaled
   past the artboard edges and flattened to a -12deg sweep.
   The visible span is tuned so the blip is fully inside the safe frame at
   BOTH ends — it must never clip the left edge on slide 1 or cross into the
   right margin on the last slide. `cy` mixes a fraction with a fixed offset
   because the rails are a fixed pixel height at every artboard size: a pure
   fraction pushes the sweep up into the top rail on the short square board. */
const ORBIT = {
  rx: 820,
  ry: 210,
  tilt: -12 * (Math.PI / 180),
  cx: 540,
  cyFrac: 0.3,
  cyOffset: 170,
  tStart: 243 * (Math.PI / 180),
  tEnd: 304 * (Math.PI / 180),
};

function orbitCy(h) {
  return h * ORBIT.cyFrac + ORBIT.cyOffset;
}

function orbitPoint(t, cy) {
  const c = Math.cos(ORBIT.tilt);
  const s = Math.sin(ORBIT.tilt);
  return {
    x: ORBIT.cx + ORBIT.rx * Math.cos(t) * c - ORBIT.ry * Math.sin(t) * s,
    y: cy + ORBIT.rx * Math.cos(t) * s + ORBIT.ry * Math.sin(t) * c,
  };
}

/**
 * @param {number} seed     slide index — fixes the starfield
 * @param {number} progress 0..1 position along the arc. Across a carousel
 *                          this runs 0 -> 1, so the blip and its trail
 *                          advance slide to slide and swiping reads as one
 *                          continuous orbit instead of five separate cards.
 */
function backdrop(seed, progress, w, h) {
  const wrap = node("div", "backdrop");
  const s = svg("svg", { viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: "none" });
  const gid = `sk-grad-${++uid}`;

  const defs = svg("defs");
  const grad = svg("linearGradient", {
    id: gid,
    x1: 0,
    y1: h,
    x2: w,
    y2: 0,
    gradientUnits: "userSpaceOnUse",
  });
  grad.append(
    svg("stop", { offset: "0%", "stop-color": "#eef1f8" }),
    svg("stop", { offset: "45%", "stop-color": "#5eead4" }),
    svg("stop", { offset: "100%", "stop-color": "#a78bfa" })
  );
  defs.appendChild(grad);
  s.appendChild(defs);

  // --- starfield ---
  const rnd = mulberry32(seed * 7919 + 13);
  const stars = svg("g");
  for (let i = 0; i < 120; i++) {
    const r = 0.7 + rnd() * 1.5;
    const tint = rnd();
    stars.appendChild(
      svg("circle", {
        cx: (rnd() * w).toFixed(1),
        cy: (rnd() * h).toFixed(1),
        r: r.toFixed(2),
        fill: tint > 0.93 ? "#5eead4" : tint > 0.87 ? "#a78bfa" : "#eef1f8",
        opacity: (0.12 + rnd() * 0.62).toFixed(2),
      })
    );
  }
  s.appendChild(stars);

  // --- orbit ---
  const cy = orbitCy(h);
  s.appendChild(
    svg("ellipse", {
      cx: ORBIT.cx,
      cy: cy,
      rx: ORBIT.rx,
      ry: ORBIT.ry,
      transform: `rotate(${ORBIT.tilt * (180 / Math.PI)} ${ORBIT.cx} ${cy})`,
      fill: "none",
      stroke: `url(#${gid})`,
      "stroke-width": 2,
      opacity: 0.18,
    })
  );

  // Travelled segment: brighter, drawn only up to the blip.
  const p = Math.min(1, Math.max(0, progress));
  const tNow = ORBIT.tStart + (ORBIT.tEnd - ORBIT.tStart) * p;
  if (p > 0.001) {
    const pts = [];
    const steps = 48;
    for (let i = 0; i <= steps; i++) {
      const { x, y } = orbitPoint(ORBIT.tStart + ((tNow - ORBIT.tStart) * i) / steps, cy);
      pts.push(`${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    s.appendChild(
      svg("path", {
        d: pts.join(" "),
        fill: "none",
        stroke: `url(#${gid})`,
        "stroke-width": 3,
        "stroke-linecap": "round",
        opacity: 0.55,
      })
    );
  }

  // Deliberately small. An earlier wide, low-opacity halo read as a grey
  // smudge wherever it passed behind the stat archetype's gradient numerals;
  // at this size the blip reads as a bright star anywhere it lands.
  const blip = orbitPoint(tNow, cy);
  s.appendChild(
    svg("circle", {
      cx: blip.x.toFixed(1),
      cy: blip.y.toFixed(1),
      r: 12,
      fill: "#5eead4",
      opacity: 0.28,
    })
  );
  s.appendChild(
    svg("circle", { cx: blip.x.toFixed(1), cy: blip.y.toFixed(1), r: 5, fill: "#eef1f8" })
  );

  wrap.appendChild(s);
  return wrap;
}

/* ==========================================================================
   Chrome — the parts every slide shares
   ========================================================================== */

/** The orbit-ring mark, matching design/brand/icon-mark-transparent.svg. */
function markSvg(cls) {
  const gid = `sk-mark-${++uid}`;
  const s = svg("svg", { viewBox: "0 0 512 512", class: cls });
  const defs = svg("defs");
  const grad = svg("linearGradient", {
    id: gid,
    x1: -28,
    y1: -28,
    x2: 28,
    y2: 28,
    gradientUnits: "userSpaceOnUse",
  });
  grad.append(
    svg("stop", { offset: "0%", "stop-color": "#eef1f8" }),
    svg("stop", { offset: "45%", "stop-color": "#5eead4" }),
    svg("stop", { offset: "100%", "stop-color": "#a78bfa" })
  );
  defs.appendChild(grad);
  s.appendChild(defs);

  const g = svg("g", { transform: "translate(256,256) scale(5.6)" });
  g.append(
    svg("ellipse", {
      cx: 0,
      cy: 0,
      rx: 26,
      ry: 10.5,
      transform: "rotate(-24)",
      stroke: `url(#${gid})`,
      "stroke-width": 2.4,
      fill: "none",
      opacity: 0.65,
    }),
    svg("circle", { cx: 0, cy: 0, r: 7.5, fill: `url(#${gid})` }),
    svg("circle", { cx: 20, cy: -12, r: 3.4, fill: "#5eead4" })
  );
  s.appendChild(g);
  return s;
}

function lockup() {
  const el = node("div", "lockup");
  el.appendChild(markSvg("mark"));

  const col = node("div", "wm-col");
  const wm = node("div", "wm");
  wm.append("Orbital ");
  wm.appendChild(node("em", null, "Traffic"));
  wm.appendChild(node("span", "tm", "™"));
  col.appendChild(wm);
  col.appendChild(node("div", "wm-sub", "Live Space Situational Display"));

  el.appendChild(col);
  return el;
}

function railTop(post, i) {
  const rail = node("header", "rail rail-top");
  rail.appendChild(lockup());
  if (post.kind === "carousel") {
    const idx = node("div", "index");
    idx.appendChild(node("b", null, String(i + 1).padStart(2, "0")));
    idx.append(` / ${String(post.slides.length).padStart(2, "0")}`);
    rail.appendChild(idx);
  }
  return rail;
}

function railBot(post, i) {
  const rail = node("footer", "rail rail-bot");
  rail.appendChild(node("div", "url", SITE));

  if (post.kind === "carousel") {
    const dots = node("div", "dots");
    post.slides.forEach((_, j) => {
      const d = node("i");
      if (j === i) d.classList.add("on");
      dots.appendChild(d);
    });
    rail.appendChild(dots);
    const last = i === post.slides.length - 1;
    rail.appendChild(
      node("div", last ? "hint" : "hint go", last ? "Free · No account" : "Swipe →")
    );
  } else {
    rail.appendChild(node("div", "hint", "Free · No account · No ads"));
  }
  return rail;
}

/* ==========================================================================
   Archetypes
   ========================================================================== */

const ARCHETYPES = {
  cover(b, s, ctx) {
    if (s.kicker) b.appendChild(node("p", "kicker", s.kicker));
    b.appendChild(rich("h1", "display", s.headline, ctx));
    if (s.lead) b.appendChild(rich("p", "lead", s.lead, ctx));
  },

  stat(b, s, ctx) {
    if (s.kicker) b.appendChild(node("p", "kicker", s.kicker));
    const fig = node("div", "figure");
    fig.textContent = subst(s.figure, ctx);
    b.appendChild(fig);
    if (s.figureLabel) b.appendChild(node("div", "figure-label", s.figureLabel));
    if (s.body) b.appendChild(rich("p", "body-copy", s.body, ctx));
    if (s.readout?.length) {
      const row = node("div", "readout");
      s.readout.forEach((r) => {
        const cell = node("div");
        cell.appendChild(node("div", "v", subst(r.v, ctx)));
        cell.appendChild(node("div", "k", r.k));
        row.appendChild(cell);
      });
      b.appendChild(row);
    }
  },

  shot(b, s, ctx) {
    b.dataset.fit = s.fit || "card";
    if (s.kicker) b.appendChild(node("p", "kicker", s.kicker));
    const wrap = node("div", "figure-wrap");
    const clip = node("div", "shot-clip");
    const img = document.createElement("img");
    img.src = new URL(s.image, import.meta.url).href;
    img.alt = "";
    // cropTop trims the top of the SOURCE, as a percentage of its own height
    // (a translate percentage resolves against the element, so this needs no
    // knowledge of the file's pixel dimensions). Screenshots often catch a
    // sliver of the row above the panel — see object-card-hst.png.
    if (s.cropTop) img.style.transform = `translateY(-${s.cropTop}%)`;
    clip.appendChild(img);
    wrap.appendChild(clip);
    b.appendChild(wrap);

    const cap = node("div", "caption");
    if (s.headline) cap.appendChild(rich("h2", "display", s.headline, ctx));
    if (s.caption) cap.appendChild(rich("p", "body-copy", s.caption, ctx));
    b.appendChild(cap);
  },

  list(b, s, ctx) {
    if (s.kicker) b.appendChild(node("p", "kicker", s.kicker));
    if (s.headline) b.appendChild(rich("h2", "display", s.headline, ctx));
    const rows = node("div", "rows");
    (s.rows || []).forEach((r, i) => {
      const row = node("div", "row");
      row.appendChild(node("div", "n", String(i + 1).padStart(2, "0")));
      row.appendChild(rich("div", "t", r.t, ctx));
      if (r.d) row.appendChild(rich("div", "d", r.d, ctx));
      rows.appendChild(row);
    });
    b.appendChild(rows);
  },

  legend(b, s, ctx) {
    if (s.kicker) b.appendChild(node("p", "kicker", s.kicker));
    if (s.headline) b.appendChild(rich("h2", "display", s.headline, ctx));

    const grid = node("div", "cats");
    // Straight from the app's own CATS table — the legend on a slide and the
    // legend in the scene cannot drift apart.
    const ids = s.cats?.length ? s.cats : Object.keys(CATS);
    ids.forEach((id) => {
      const row = node("div", "cat");
      row.style.color = catColorHex(id);
      row.appendChild(node("i", "sw"));
      row.appendChild(node("span", "nm", CATS[id]?.label ?? id));
      grid.appendChild(row);
    });
    b.appendChild(grid);
    if (s.note) b.appendChild(node("p", "meta", s.note));
  },

  cta(b, s, ctx) {
    b.appendChild(markSvg("mark-lg"));
    if (s.headline) b.appendChild(rich("h2", "display", s.headline, ctx));
    if (s.lead) b.appendChild(rich("p", "lead", s.lead, ctx));
    if (s.pill) b.appendChild(node("div", "pill", s.pill));
    if (s.note) b.appendChild(node("p", "meta", s.note));
  },
};

/* ==========================================================================
   Assembly
   ========================================================================== */

/** The archetype names content.js may use. Asserted in tools/test/social-kit.test.js. */
export const ARCHETYPE_IDS = Object.keys(ARCHETYPES);

export function buildSlide(post, i, ctx) {
  const s = post.slides[i];
  const size = post.size || DEFAULT_SIZE;
  const dim = ARTBOARD[size] || ARTBOARD.portrait;

  const art = node("article", "slide");
  art.dataset.size = size;
  art.dataset.archetype = s.type;

  // Single posts sit mid-arc; a carousel sweeps 0 -> 1 across its slides.
  const n = post.slides.length;
  const progress = post.kind === "carousel" && n > 1 ? i / (n - 1) : 0.55;
  art.appendChild(backdrop(i + 1, progress, dim.w, dim.h));

  const ticks = node("div", "ticks");
  for (let k = 0; k < 4; k++) ticks.appendChild(node("i"));
  art.appendChild(ticks);

  art.appendChild(railTop(post, i));

  const body = node("div", `body a-${s.type}`);
  const draw = ARCHETYPES[s.type];
  if (!draw) throw new Error(`Unknown archetype "${s.type}" in post slide ${i + 1}`);
  draw(body, s, ctx);
  art.appendChild(body);

  art.appendChild(railBot(post, i));
  return art;
}

/** Build every slide of a post. Returns the <article> elements in order. */
export function buildPost(postId, ctx) {
  const post = POSTS[postId];
  if (!post) throw new Error(`Unknown post "${postId}". Known: ${Object.keys(POSTS).join(", ")}`);
  return post.slides.map((_, i) => buildSlide(post, i, ctx));
}

/** Everything the exporter waits on before it screenshots. */
export async function ready(root) {
  await document.fonts.ready;
  await Promise.all(
    [...root.querySelectorAll("img")].map((img) =>
      img.complete
        ? img.decode().catch(() => {})
        : new Promise((r) => (img.onload = img.onerror = r))
    )
  );
}

import "./styles/welcome.css";
import { CATS, catColorHex } from "./config.js";
import { esc } from "./util/html.js";

// __OBJECT_COUNT__ is injected at build time from the real catalog (see vite.config.js)
const statObjects = document.getElementById("stat-objects");
if (statObjects) statObjects.textContent = __OBJECT_COUNT__;

// __TICKER_NAMES__ is a build-time list of real, recognizable catalog names
// (see vite.config.js) — duplicated once so the CSS scroll animation can loop
// seamlessly from -50% back to 0. Names come from CelesTrak, so they're
// escaped like any other semi-trusted external text.
const tickerTrack = document.getElementById("ticker-track");
if (tickerTrack && __TICKER_NAMES__.length) {
  const items = __TICKER_NAMES__.map((n) => `<span class="ticker-item">${esc(n)}</span>`).join(
    '<span class="ticker-sep">&middot;</span>',
  );
  tickerTrack.innerHTML = items + '<span class="ticker-sep">&middot;</span>' + items;
} else if (tickerTrack) {
  tickerTrack.closest(".ticker-strip")?.remove();
}

const catsTrack = document.getElementById("cats-track");
if (catsTrack) {
  // CATS[c].label is a fixed category label from config.js, not user/feed
  // data — safe to interpolate directly.
  catsTrack.innerHTML = Object.keys(CATS)
    .map(
      (c) =>
        `<span class="cat-chip"><span class="d" style="background:${catColorHex(c)}"></span><span>${CATS[c].label}</span></span>`,
    )
    .join("");
}

// Ambient starfield — purely decorative, no live data fetch. Reuses the real
// category colors from config.js so it reads as "this app's traffic", not a
// generic space-themed backdrop. Respects prefers-reduced-motion.
const canvas = document.getElementById("lp-stars");
if (canvas) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    canvas.remove();
  } else {
    const ctx = canvas.getContext("2d");
    let w, h, stars, dots;

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }
    window.addEventListener("resize", resize);
    resize();

    stars = Array.from({ length: 140 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.3 + 0.3,
      tw: Math.random() * Math.PI * 2,
    }));

    const dotColors = Object.keys(CATS).map((c) => catColorHex(c));
    dots = Array.from({ length: 18 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.12,
      vy: (Math.random() - 0.5) * 0.12,
      r: Math.random() * 1.6 + 1.2,
      color: dotColors[Math.floor(Math.random() * dotColors.length)],
    }));

    function frame(t) {
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        const a = 0.35 + 0.45 * Math.sin(t / 1400 + s.tw);
        ctx.fillStyle = `rgba(238,241,248,${a})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const d of dots) {
        d.x = (d.x + d.vx + w) % w;
        d.y = (d.y + d.vy + h) % h;
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
}

/**
 * The shared background plate for the Instagram 4:5 variant.
 *
 * Imported by render-instagram.mjs (behind the posts) and render-template.mjs
 * (the empty plate exported for reuse). It lives here rather than inside
 * either one so a template downloaded today cannot drift from the background
 * the renderer actually draws tomorrow.
 */

/**
 * Background furniture: a seeded starfield and a few wide orbital arcs.
 *
 * The 4:5 frame leaves a tall, narrow column beside the phone that type alone
 * cannot fill without absurd wrapping, so the background has to hold it. Both
 * elements are lifted from what the app itself draws — scene/starfield.js and
 * the orbit rings in scene/trail.js — rather than invented decoration, and
 * both sit at low opacity so the phone stays the brightest thing in frame.
 *
 * Seeded per frame off the file name: each slide gets its own sky, and each
 * re-render reproduces the same one.
 */
export function backdrop(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 16777619) >>> 0;
  }
  const rand = () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  let stars = "";
  for (let i = 0; i < 190; i++) {
    const x = (rand() * 1080).toFixed(1);
    const y = (rand() * 1350).toFixed(1);
    const r = (rand() * 1.5 + 0.35).toFixed(2);
    const o = (rand() * 0.5 + 0.12).toFixed(2);
    // a few stars carry the brand tints rather than plain white
    const roll = rand();
    const fill = roll > 0.9 ? "#5eead4" : roll > 0.8 ? "#a78bfa" : "#dbe6ff";
    stars += `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" opacity="${o}"/>`;
  }

  // Wide, mostly off-canvas ellipses reading as orbits passing behind the
  // phone. Centres sit outside the frame so only a long shallow arc crosses it.
  const arcs = [
    { cx: 250, cy: 1500, rx: 980, ry: 720, rot: -18, o: 0.2 },
    { cx: 820, cy: -180, rx: 900, ry: 640, rot: 12, o: 0.15 },
    { cx: 140, cy: 640, rx: 620, ry: 1180, rot: -32, o: 0.11 },
  ]
    .map(
      (a) =>
        `<ellipse cx="${a.cx}" cy="${a.cy}" rx="${a.rx}" ry="${a.ry}" fill="none" ` +
        `stroke="url(#arcGrad)" stroke-width="1.6" opacity="${a.o}" ` +
        `transform="rotate(${a.rot} ${a.cx} ${a.cy})"/>`
    )
    .join("");

  return `<svg class="backdrop" width="1080" height="1350" viewBox="0 0 1080 1350" aria-hidden="true">
  <defs>
    <linearGradient id="arcGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#5eead4"/>
      <stop offset="55%" stop-color="#7dd3fc"/>
      <stop offset="100%" stop-color="#a78bfa"/>
    </linearGradient>
  </defs>
  ${arcs}${stars}
</svg>`;
}

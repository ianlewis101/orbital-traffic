import { DATA } from "../data/store.js";
import { classify } from "./describe.js";

export function photoKey(s) {
  const n = " " + s.name.toUpperCase() + " ",
    id = s.id;
  if (id === "25544" || / ZARYA /.test(n)) return "iss";
  if (id === "20580" || / HUBBLE | HST /.test(n)) return "hubble";
  if (/ WEBB | JWST /.test(n)) return "jwst";
  if (/ DRAGON | ENDEAVOUR | ENDURANCE | RESILIENCE | FREEDOM /.test(n)) return "dragon";
  if (/ SOYUZ /.test(n)) return "soyuz";
  if (/ PROGRESS /.test(n)) return "progress";
  if (/ CYGNUS /.test(n)) return "cygnus";
  // No trailing space required: CelesTrak hyphenates these directly
  // (e.g. "SHENZHOU-21", "TIANZHOU-9"), unlike "SOYUZ MS-28" above.
  if (/ STARLINER/.test(n)) return "starliner";
  if (/ SHENZHOU/.test(n)) return "shenzhou";
  if (/ TIANZHOU/.test(n)) return "tianzhou";
  // asteroid real photos
  if (s._neo) {
    if (/ GEOGRAPHOS /.test(n)) return "asteroid_geographos";
    if (/ TOUTATIS /.test(n)) return "asteroid_toutatis";
    if (/ PHAETHON /.test(n)) return "asteroid_phaethon";
    if (/ FLORENCE /.test(n)) return "asteroid_florence";
    if (/ APOLLO /.test(n)) return "asteroid_apollo";
    return "asteroid_generic";
  }
  const c = classify(s);
  if (c === "station") return "station_generic";
  // Note: c === "capsule" is intentionally NOT handled here. Every name pattern
  // that classify() tags as "capsule" (Soyuz/Progress/Dragon/Cygnus/Starliner/
  // Shenzhou/Tianzhou) is matched explicitly above with its own accurate photo.
  // There is no capsule_generic bucket — if a future capsule name doesn't match
  // any pattern above, it should fall through to the procedural SVG (below)
  // rather than show a photo of the wrong spacecraft.
  if (c === "navigation" || c === "geo") return c === "geo" ? "geo_generic" : "navigation_generic";
  if (c === "weather" || c === "eo" || c === "telescope") return "science_generic";
  if (c === "generic") return "satellite_generic";
  return null;
}

/**
 * Simple deterministic string hash (djb2-ish). Used to pick a stable photo
 * from a rotation pool per object, so the same satellite always shows the
 * same photo across reloads/reopens, while different satellites in the same
 * category spread across the available pool instead of all showing photo #1.
 */
function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function figureHTML(s) {
  const k = photoKey(s);
  const entry = k && DATA.photos[k];
  if (entry) {
    const photo = entry.pool
      ? entry.pool[hashStr(String(s.id || s.name)) % entry.pool.length]
      : entry;
    if (photo && photo.path) {
      return `<img src="${photo.path}" alt="${s.name}"><span class="cred">${photo.credit}</span>`;
    }
  }
  return svgFor(s);
}

export function svgFor(s) {
  const c = classify(s),
    st = "#aebccf",
    acc = "#ffd27a";
  const defs =
    `<defs>` +
    `<linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b91cf"/><stop offset=".5" stop-color="#2f5d96"/><stop offset="1" stop-color="#23436c"/></linearGradient>` +
    `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eef2f7"/><stop offset=".5" stop-color="#c2cad6"/><stop offset="1" stop-color="#98a4b4"/></linearGradient>` +
    `<radialGradient id="dg" cx=".5" cy=".4" r=".6"><stop offset="0" stop-color="#f4d99a"/><stop offset="1" stop-color="#c9962f"/></radialGradient></defs>`;
  let stars = "";
  for (let i = 0; i < 14; i++)
    stars += `<circle cx="${(Math.random() * 240) | 0}" cy="${(Math.random() * 130) | 0}" r="${(Math.random() * 0.8 + 0.3).toFixed(1)}" fill="rgba(200,220,255,${(Math.random() * 0.45 + 0.2).toFixed(2)})"/>`;
  const wrap = (i) => `<svg viewBox="0 0 240 130" xmlns="http://www.w3.org/2000/svg">${defs}${stars}${i}</svg>`;
  const wing = (x, y, w, h) => {
    const cols = Math.max(3, Math.round(w / 11));
    let g = "";
    for (let i = 1; i < cols; i++) {
      const xx = (x + (i * w) / cols).toFixed(1);
      g += `<line x1="${xx}" y1="${y}" x2="${xx}" y2="${y + h}" stroke="#22456e" stroke-width=".6"/>`;
    }
    g += `<line x1="${x}" y1="${(y + h / 2).toFixed(1)}" x2="${x + w}" y2="${(y + h / 2).toFixed(1)}" stroke="#22456e" stroke-width=".6"/>`;
    return (
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="url(#pg)" stroke="#79a6dd" stroke-width="1.1"/>` +
      g +
      `<rect x="${x}" y="${y}" width="${w}" height="${Math.max(2.5, h * 0.16).toFixed(1)}" rx="2" fill="rgba(255,255,255,0.22)"/>`
    );
  };
  const bus = (x, y, w, h, r) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r || 3}" fill="url(#bg)" stroke="#7f8b9c" stroke-width="1.3"/>` +
    `<rect x="${x + 2}" y="${y + 2}" width="${w - 4}" height="${(h * 0.4).toFixed(1)}" rx="2" fill="rgba(255,255,255,0.18)"/>`;
  const dish = (cx, cy, r) =>
    `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${(r * 0.42).toFixed(1)}" fill="url(#dg)" stroke="#caa24a" stroke-width="1.2"/>`;
  if (c === "station")
    return wrap(
      wing(6, 42, 46, 30) +
        wing(188, 42, 46, 30) +
        `<line x1="52" y1="65" x2="188" y2="65" stroke="${st}" stroke-width="3.4"/>` +
        `<rect x="80" y="54" width="16" height="22" rx="2" fill="url(#bg)" stroke="#7f8b9c" stroke-width="1"/>` +
        bus(96, 50, 30, 30, 4) +
        bus(126, 56, 26, 18, 3) +
        `<rect x="116" y="35" width="5" height="15" fill="#d2d9e4"/>` +
        wing(86, 84, 30, 16) +
        wing(132, 84, 30, 16) +
        `<circle cx="111" cy="65" r="4.5" fill="${acc}"/>`
    );
  if (c === "capsule")
    return wrap(
      wing(18, 50, 40, 28) +
        wing(182, 50, 40, 28) +
        bus(92, 50, 36, 30, 4) +
        `<path d="M150 44 a26 26 0 0 1 0 42 l-22 0 a30 24 0 0 1 0 -42 z" fill="url(#bg)" stroke="#7f8b9c" stroke-width="1.4"/>` +
        `<ellipse cx="150" cy="65" rx="5" ry="9" fill="#10151f" stroke="${st}" stroke-width="1"/>` +
        `<line x1="96" y1="58" x2="128" y2="58" stroke="#7f8b9c" stroke-width=".6"/><circle cx="108" cy="65" r="4" fill="${acc}"/>`
    );
  if (c === "starlink")
    return wrap(
      `<g transform="rotate(-7 102 54)">` +
        `<rect x="44" y="34" width="116" height="40" rx="2" fill="url(#pg)" stroke="#79a6dd" stroke-width="1.1"/>` +
        [1, 2, 3, 4, 5, 6, 7]
          .map(
            (i) =>
              `<line x1="${(44 + i * 14.5).toFixed(1)}" y1="34" x2="${(44 + i * 14.5).toFixed(1)}" y2="74" stroke="#22456e" stroke-width=".6"/>`
          )
          .join("") +
        `<line x1="44" y1="54" x2="160" y2="54" stroke="#22456e" stroke-width=".6"/><rect x="44" y="34" width="116" height="6" fill="rgba(255,255,255,0.2)"/></g>` +
        bus(150, 80, 32, 15, 2) +
        `<line x1="166" y1="76" x2="166" y2="80" stroke="${st}" stroke-width="2"/><circle cx="166" cy="100" r="3.5" fill="${acc}"/>`
    );
  if (c === "telescope")
    return wrap(
      wing(24, 48, 38, 32) +
        wing(178, 48, 38, 32) +
        `<rect x="84" y="40" width="74" height="48" rx="12" fill="url(#bg)" stroke="#7f8b9c" stroke-width="1.4"/>` +
        `<ellipse cx="158" cy="64" rx="7" ry="24" fill="#0c1019" stroke="${st}" stroke-width="1.2"/><ellipse cx="158" cy="64" rx="3" ry="12" fill="#1b2740"/>` +
        `<rect x="92" y="50" width="40" height="28" rx="4" fill="none" stroke="${st}" stroke-width=".6"/><line x1="120" y1="40" x2="120" y2="30" stroke="${st}" stroke-width="1.4"/>`
    );
  if (c === "debris" || c === "unknown")
    return wrap(
      `<path d="M92 46 l28 -8 22 10 12 24 -14 22 -30 4 -22 -16 -4 -24 z" fill="url(#bg)" stroke="#7f8b9c" stroke-width="1.4" stroke-linejoin="round"/>` +
        `<path d="M108 58 l18 -4 10 14 -8 14 -18 -2 -6 -12 z" fill="none" stroke="${st}" stroke-width=".7"/>` +
        `<line x1="120" y1="38" x2="124" y2="30" stroke="${st}" stroke-width="1"/><circle cx="158" cy="48" r="3" fill="${st}"/><circle cx="86" cy="92" r="2.4" fill="${st}"/><circle cx="152" cy="98" r="1.8" fill="${st}"/>`
    );
  if (s._neo || c === "hazardous") {
    // Rocky irregular asteroid silhouette — pseudo-random but stable per name
    const seed = s.name.charCodeAt(0) * 31 + s.name.charCodeAt(1) * 17;
    const pts = [];
    const N = 14,
      cx2 = 118,
      cy2 = 64,
      rx2 = 46,
      ry2 = 30;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const jitter = 0.72 + (((seed * (i + 7) * 1234567) >>> 0) % 100) / 220;
      const bumpX = ((((seed * (i + 3) * 987654) >>> 0) % 100) - 50) * 0.18;
      const bumpY = ((((seed * (i + 5) * 456789) >>> 0) % 100) - 50) * 0.14;
      pts.push([
        (cx2 + Math.cos(a) * rx2 * jitter + bumpX).toFixed(1),
        (cy2 + Math.sin(a) * ry2 * jitter + bumpY).toFixed(1),
      ]);
    }
    const poly = `<polygon points="${pts.map((p) => p.join(",")).join(" ")}" fill="#4a3f35" stroke="#7a6a5a" stroke-width="1.2" stroke-linejoin="round"/>`;
    // Surface craters/texture
    const cr = (x, y, r) =>
      `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${(r * 0.7).toFixed(1)}" fill="none" stroke="#2e2820" stroke-width="${(r * 0.3).toFixed(1)}"/><ellipse cx="${(x - r * 0.15).toFixed(1)}" cy="${(y - r * 0.12).toFixed(1)}" rx="${(r * 0.35).toFixed(1)}" ry="${(r * 0.25).toFixed(1)}" fill="rgba(255,255,255,0.04)"/>`;
    const craters = cr(105, 58, 8) + cr(128, 72, 5) + cr(118, 50, 4) + cr(100, 75, 3);
    const highlight = `<ellipse cx="100" cy="52" rx="18" ry="10" fill="rgba(255,255,255,0.055)" transform="rotate(-20,100,52)"/>`;
    // Subtle glow
    const glow = `<ellipse cx="118" cy="64" rx="55" ry="38" fill="rgba(255,130,50,0.06)"/>`;
    return wrap(glow + poly + craters + highlight);
  }
  const ant =
    c === "geo" || c === "weather"
      ? `<line x1="120" y1="78" x2="120" y2="88" stroke="${st}" stroke-width="2"/>` + dish(120, 95, 15)
      : `<line x1="120" y1="76" x2="120" y2="92" stroke="${st}" stroke-width="2"/><rect x="111" y="90" width="18" height="5" rx="1" fill="${acc}"/>`;
  return wrap(
    wing(10, 44, 62, 30) +
      wing(168, 44, 62, 30) +
      bus(98, 40, 44, 38, 4) +
      `<line x1="98" y1="58" x2="142" y2="58" stroke="#7f8b9c" stroke-width=".6"/>` +
      `<rect x="104" y="46" width="14" height="10" rx="1" fill="#10151f" stroke="${st}" stroke-width=".6"/>` +
      ant
  );
}

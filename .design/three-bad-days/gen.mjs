import fs from "fs";
const DIR = "/home/user/orbital-traffic/.design/three-bad-days";

const FONT_DIR = "/home/user/orbital-traffic/apps/web/public/fonts";
// The app's own SIL OFL faces (apps/web/src/styles/app.css ships these same files).
// Embedded as data: URIs so PNG/PDF exports render in the real brand type rather than
// a fallback — the canvas iframe loads webfonts only inline or from Google Fonts.
const woff2 = (n) => fs.readFileSync(`${FONT_DIR}/${n}`).toString("base64");
const FACES = `
    @font-face{font-family:'Bricolage Grotesque';font-style:normal;font-weight:100 900;font-display:block;
      src:url(data:font/woff2;base64,${woff2("bricolage-grotesque-latin.woff2")}) format('woff2');}
    @font-face{font-family:'Oxanium';font-style:normal;font-weight:100 900;font-display:block;
      src:url(data:font/woff2;base64,${woff2("oxanium-latin.woff2")}) format('woff2');}
    @font-face{font-family:'Orbitron';font-style:normal;font-weight:100 900;font-display:block;
      src:url(data:font/woff2;base64,${woff2("orbitron-latin.woff2")}) format('woff2');}
`;


const SLIDES = [
  { file: "Main.dc.html", kicker: "— THE MESS WE MADE",
    h1: "2,694 pieces", h2: "of wreckage.", size: 77,
    body: `Every one tracked, named, and still flying. <b>99%</b> of it came from just two days.`,
    shot: "shot-shell.jpg" },
  { file: "Fengyun.dc.html", kicker: "— 11 JANUARY 2007",
    h1: "One missile.", h2: "1,970 fragments.", size: 60,
    body: `China destroyed its own weather satellite as a test. The pieces still carry the dead satellite's <b>1999</b> launch date.`,
    shot: "shot-fengyun.jpg" },
  { file: "Collision.dc.html", kicker: "— 10 FEBRUARY 2009",
    h1: "Nobody was", h2: "steering.", size: 80,
    body: `A dead Russian comms satellite hit a working Iridium over Siberia — the first accidental collision between two intact satellites. <b>691 pieces</b> are still up there.`,
    shot: "shot-cosmos.jpg" },
  { file: "Spread.dc.html", kicker: "— IT DOESN'T STAY PUT",
    h1: "The junk", h2: "comes to you.", size: 71,
    body: `Fengyun debris alone now spreads from <b>370 to 1,956 km</b>. Across the catalog, 39 fragments dip to the altitude where the station and its crew fly.`,
    shot: "shot-tilt.jpg" },
  { file: "SharingTheRoad.dc.html", kicker: "— WHY IT MATTERS",
    h1: "It's sharing", h2: "the road.", size: 80,
    body: `Wreckage flies the same orbits as every satellite you depend on, and each collision makes more. Every fragment is a tappable dot with a name, an altitude and a date.`,
    shot: "shot-all.jpg" },
];

// Exact tokens lifted from apps/web/src/styles/app.css :root
const BG = "#07080f", INK = "#eef1f8", INK_DIM = "#9aa2b8";
const TEAL = "#5eead4", VIOLET = "#a78bfa";

const page = (s) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>
${FACES}

    body { margin: 0; background: ${BG}; }
    a { color: ${TEAL}; } a:hover { color: ${VIOLET}; }
    .disp { font-family: 'Bricolage Grotesque', 'Trebuchet MS', sans-serif; }
    .logo { font-family: 'Orbitron', 'Trebuchet MS', sans-serif; }
    .body { font-family: 'Oxanium', 'Trebuchet MS', sans-serif; }
    b { font-weight: 600; color: ${INK}; }
  </style>
</helmet>

<div style="position: relative; width: 1080px; height: 1350px; overflow: hidden; background: ${BG};">

  <!-- atmosphere: the app's own #fx-scan glows, teal low-left / violet high-right -->
  <div style="position: absolute; inset: 0; background:
      radial-gradient(54% 48% at 14% 92%, rgba(94,234,212,0.13), transparent 70%),
      radial-gradient(50% 44% at 88% 8%, rgba(167,139,250,0.16), transparent 70%);"></div>
  <!-- starfield -->
  <div style="position: absolute; inset: 0; opacity: 0.5; background:
      radial-gradient(1.5px 1.5px at 12% 18%, rgba(255,255,255,0.8), transparent),
      radial-gradient(1px 1px at 31% 7%, rgba(255,255,255,0.55), transparent),
      radial-gradient(1.5px 1.5px at 8% 63%, rgba(255,255,255,0.5), transparent),
      radial-gradient(1px 1px at 46% 88%, rgba(255,255,255,0.45), transparent),
      radial-gradient(1.5px 1.5px at 23% 94%, rgba(255,255,255,0.6), transparent),
      radial-gradient(1px 1px at 5% 38%, rgba(255,255,255,0.4), transparent),
      radial-gradient(1.5px 1.5px at 39% 30%, rgba(255,255,255,0.35), transparent),
      radial-gradient(1px 1px at 17% 76%, rgba(255,255,255,0.5), transparent);"></div>
  <!-- faint orbit arcs -->
  <svg width="1080" height="1350" viewBox="0 0 1080 1350" style="position: absolute; inset: 0;" aria-hidden="true">
    <ellipse cx="240" cy="176" rx="620" ry="150" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="1" transform="rotate(-14 240 176)"></ellipse>
    <ellipse cx="180" cy="1190" rx="700" ry="180" fill="none" stroke="rgba(94,234,212,0.09)" stroke-width="1" transform="rotate(9 180 1190)"></ellipse>
  </svg>

  <!-- corner brackets -->
  <div style="position: absolute; left: 34px; top: 34px; width: 54px; height: 54px; border-left: 1px solid rgba(255,255,255,0.22); border-top: 1px solid rgba(255,255,255,0.22);"></div>
  <div style="position: absolute; left: 34px; bottom: 34px; width: 54px; height: 54px; border-left: 1px solid rgba(255,255,255,0.22); border-bottom: 1px solid rgba(255,255,255,0.22);"></div>

  <!-- wordmark -->
  <div class="logo" style="position: absolute; left: 62px; top: 84px; font-size: 20px; font-weight: 700; letter-spacing: 0.42em; color: rgba(238,241,248,0.62);">ORBITAL TRAFFIC</div>

  <!-- copy column -->
  <div style="position: absolute; left: 62px; top: 0; width: 452px; height: 1350px; display: flex; flex-direction: column; justify-content: center; gap: 28px;">
    <div class="logo" style="font-size: 19px; font-weight: 700; letter-spacing: 0.26em; color: ${TEAL};">${s.kicker}</div>
    <div class="disp" style="font-size: ${s.size}px; font-weight: 800; line-height: 0.98; letter-spacing: -0.022em; color: ${INK}; white-space: nowrap;">
      <div>${s.h1}</div>
      <div style="background: linear-gradient(90deg, ${TEAL} 0%, ${VIOLET} 100%); -webkit-background-clip: text; background-clip: text; color: transparent;">${s.h2}</div>
    </div>
    <div style="height: 1px; width: 340px; background: linear-gradient(90deg, rgba(94,234,212,0.75) 0%, rgba(94,234,212,0) 100%);"></div>
    <div class="body" style="font-size: 25px; font-weight: 400; line-height: 1.6; color: ${INK_DIM}; text-wrap: pretty;">${s.body}</div>
  </div>

  <!-- device -->
  <div style="position: absolute; left: 537px; top: 150px; width: 496px; height: 1064px; border-radius: 64px;
              background: linear-gradient(145deg, #3a3e4b 0%, #1c1f27 26%, #14161c 74%, #2b2f3a 100%);
              box-shadow: 0 48px 120px rgba(0,0,0,0.6), 0 0 90px rgba(94,234,212,0.05);">
    <div style="position: absolute; left: 13px; top: 13px; width: 470px; height: 1038px; border-radius: 51px; overflow: hidden; background: ${BG};">
      <img src="${s.shot}" alt="Orbital Traffic app screen" style="position: absolute; left: 0; top: 34px; width: 470px; height: 1038px; object-fit: cover; object-position: top center;">
      <div style="position: absolute; left: 50%; top: 24px; transform: translateX(-50%); width: 126px; height: 34px; border-radius: 18px; background: #000;"></div>
    </div>
    <div style="position: absolute; left: -3px; top: 232px; width: 3px; height: 34px; border-radius: 2px; background: #454a59;"></div>
    <div style="position: absolute; left: -3px; top: 306px; width: 3px; height: 62px; border-radius: 2px; background: #454a59;"></div>
    <div style="position: absolute; left: -3px; top: 388px; width: 3px; height: 62px; border-radius: 2px; background: #454a59;"></div>
    <div style="position: absolute; right: -3px; top: 340px; width: 3px; height: 96px; border-radius: 2px; background: #454a59;"></div>
  </div>

</div>
</x-dc>
</body>
</html>
`;

for (const s of SLIDES) fs.writeFileSync(`${DIR}/${s.file}`, page(s));

const canvas = {
  artboards: SLIDES.map((s, i) => ({ file: s.file, x: i * 1200, y: 0, w: 1080, h: 1350 })),
  annotations: [{
    id: "shot-note", x: 0, y: -190, w: 640,
    text: "Screens are real captures from the live app (bundled catalog, 15 Sep 2026).\nEvery figure on these slides is measured from apps/web/public/data/satellites.json."
  }],
  launch: { view: "canvas" },
};
fs.writeFileSync(`${DIR}/canvas.json`, JSON.stringify(canvas, null, 2));
console.log("wrote", SLIDES.length, "artboards + canvas.json");

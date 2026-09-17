import fs from "fs";

/**
 * Three NEW COMPOSITIONS for the "Everybody Has a Ride Home" carousel, all
 * built from Orbital Traffic's own design system — not a new identity.
 *
 * Everything here is lifted from apps/web/src/styles/app.css at its real
 * values: the --bg/--ink/--amber/--violet tokens, the .plate chrome
 * (rgba(17,22,42,0.55), 1px rgba(255,255,255,0.12), 16px radius) and its
 * signature ::after hairline (transparent → teal → violet → transparent), the
 * .cat row with its 8px swatch and 0 0 7px currentColor glow, the .chip, and
 * the two #fx-scan radial glows. Fonts are the app's own self-hosted faces.
 *
 * What changes between the three is COMPOSITION, not brand:
 *   1 HUD       — the poster is one of the app's own plates, at poster scale
 *   2 FULLBLEED — the app's render fills the frame; type sits in the dark
 *   3 TELEMETRY — the info card's label/value grid, blown up as a spec sheet
 */

const DIR = "/home/user/orbital-traffic/.design/ride-home-v2";
const FONT_DIR = "/home/user/orbital-traffic/apps/web/public/fonts";
const woff2 = (n) => fs.readFileSync(`${FONT_DIR}/${n}`).toString("base64");
const FACES = `
    @font-face{font-family:'Bricolage Grotesque';font-style:normal;font-weight:100 900;font-display:block;
      src:url(data:font/woff2;base64,${woff2("bricolage-grotesque-latin.woff2")}) format('woff2');}
    @font-face{font-family:'Oxanium';font-style:normal;font-weight:100 900;font-display:block;
      src:url(data:font/woff2;base64,${woff2("oxanium-latin.woff2")}) format('woff2');}
    @font-face{font-family:'Orbitron';font-style:normal;font-weight:100 900;font-display:block;
      src:url(data:font/woff2;base64,${woff2("orbitron-latin.woff2")}) format('woff2');}
`;

// ── app.css :root, verbatim ───────────────────────────────────────────────
const BG = "#07080f", INK = "#eef1f8", DIM = "#9aa2b8", FAINT = "#737a90";
const LINE = "rgba(255,255,255,0.12)";
const TEAL = "#5eead4", VIOLET = "#a78bfa", SIGNAL = "#7dd3fc";
const CARGO = "#7a8899"; // CATS.debris grey — the app's "no one aboard" colour

// ── the facts, 17 Sep 2026 ────────────────────────────────────────────────
const FLEET = [
  { nm: "CREW DRAGON 12", st: "ISS", el: "19d", seats: 4, kind: "crew" },
  { nm: "SOYUZ-MS 29", st: "ISS", el: "19d", seats: 3, kind: "crew" },
  { nm: "SHENZHOU-23", st: "TIANGONG", el: "76d", seats: 3, kind: "crew" },
  { nm: "CYGNUS NG-24", st: "ISS", el: "19d", seats: 0, kind: "cargo" },
  { nm: "PROGRESS-MS 34", st: "ISS", el: "19d", seats: 0, kind: "cargo" },
  { nm: "TIANZHOU-10", st: "TIANGONG", el: "69d", seats: 0, kind: "cargo" },
];

const shell = (body) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>
    body { margin: 0; background: ${BG}; }
    a { color: ${TEAL}; } a:hover { color: ${VIOLET}; }
${FACES}
    .disp { font-family: 'Bricolage Grotesque', 'Trebuchet MS', sans-serif; }
    .ui   { font-family: 'Oxanium', 'Trebuchet MS', sans-serif; }
    .logo { font-family: 'Orbitron', 'Trebuchet MS', sans-serif; }
  </style>
</helmet>
${body}
</x-dc>
</body>
</html>
`;

/** The app's #fx-scan glows + starfield, on the real --bg. */
const atmosphere = `
  <div style="position: absolute; inset: 0; background:
      radial-gradient(54% 48% at 14% 92%, rgba(94,234,212,0.13), transparent 70%),
      radial-gradient(50% 44% at 88% 8%, rgba(167,139,250,0.16), transparent 70%);"></div>
  <div style="position: absolute; inset: 0; opacity: 0.5; background:
      radial-gradient(1.5px 1.5px at 12% 18%, rgba(255,255,255,0.8), transparent),
      radial-gradient(1px 1px at 31% 7%, rgba(255,255,255,0.55), transparent),
      radial-gradient(1.5px 1.5px at 8% 63%, rgba(255,255,255,0.5), transparent),
      radial-gradient(1px 1px at 46% 88%, rgba(255,255,255,0.45), transparent),
      radial-gradient(1.5px 1.5px at 23% 94%, rgba(255,255,255,0.6), transparent),
      radial-gradient(1px 1px at 78% 71%, rgba(255,255,255,0.4), transparent);"></div>`;

/** .plate, at poster scale — chrome and the signature teal→violet hairline. */
const plate = (inner, extra = "") => `
  <div style="position: relative; background: rgba(17,22,42,0.55); border: 1px solid ${LINE};
              border-radius: 30px; box-shadow: 0 30px 90px rgba(0,0,0,0.5), inset 0 2px 0 rgba(255,255,255,0.09);
              overflow: hidden; ${extra}">
    <div style="position: absolute; top: 0; left: 34px; right: 34px; height: 2px; opacity: 0.5;
                background: linear-gradient(90deg, transparent, rgba(94,234,212,0.5), rgba(167,139,250,0.5), transparent);"></div>
    ${inner}
  </div>`;

/** .ph — the plate header: letterspaced caps left, a lit value right. */
const ph = (label, value, valueColor = TEAL) => `
  <div style="display: flex; justify-content: space-between; align-items: center;
              padding: 26px 34px; border-bottom: 1px solid ${LINE};">
    <div class="ui" style="font-size: 21px; letter-spacing: 0.24em; text-transform: uppercase; color: ${DIM}; font-weight: 500;">${label}</div>
    <div class="ui" style="font-size: 23px; letter-spacing: 0.1em; color: ${valueColor}; font-weight: 700;">${value}</div>
  </div>`;

/** .cat row — 8px swatch with the app's 0 0 7px glow, name, tabular count. */
const catRow = (sw, name, mid, right, dim = false) => `
  <div style="display: flex; align-items: center; gap: 22px; padding: 21px 34px;
              border-bottom: 1px solid rgba(255,255,255,0.055); ${dim ? "opacity: 0.38;" : ""}">
    <span style="width: 15px; height: 15px; flex: 0 0 auto; background: ${sw}; color: ${sw}; box-shadow: 0 0 13px currentColor;"></span>
    <span class="ui" style="flex: 1; font-size: 27px; letter-spacing: 0.04em; text-transform: uppercase; color: ${INK}; font-weight: 500;">${name}</span>
    <span class="ui" style="width: 210px; font-size: 21px; letter-spacing: 0.06em; color: ${DIM};">${mid}</span>
    <span class="ui" style="font-size: 23px; color: ${DIM}; font-variant-numeric: tabular-nums; letter-spacing: 0.04em; text-align: right; min-width: 92px;">${right}</span>
  </div>`;

/** .chip — bordered pill with a glowing 5px dot. */
const chip = (text, lit = false) => `
  <span class="ui" style="display: inline-flex; align-items: center; gap: 11px; font-size: 20px;
        letter-spacing: 0.09em; text-transform: uppercase; font-weight: 500; padding: 11px 20px;
        border: 1px solid ${lit ? "rgba(94,234,212,0.32)" : LINE}; color: ${lit ? TEAL : DIM};">
    <i style="width: 9px; height: 9px; border-radius: 50%; background: ${lit ? TEAL : FAINT};
              box-shadow: 0 0 10px currentColor; color: ${lit ? TEAL : FAINT};"></i>${text}
  </span>`;

/** The info card's telemetry pair: tiny letterspaced label over a big value. */
const stat = (label, value, unit = "", color = INK) => `
  <div>
    <div class="ui" style="font-size: 18px; letter-spacing: 0.22em; text-transform: uppercase; color: ${FAINT};">${label}</div>
    <div class="disp" style="font-size: 62px; font-weight: 800; letter-spacing: -0.02em; color: ${color}; line-height: 1.05; margin-top: 8px;">${value}<span class="ui" style="font-size: 23px; font-weight: 400; color: ${DIM}; letter-spacing: 0.04em; margin-left: 9px;">${unit}</span></div>
  </div>`;

const wordmark = (right) => `
  <div style="display: flex; justify-content: space-between; align-items: baseline;">
    <div class="logo" style="font-size: 20px; font-weight: 700; letter-spacing: 0.42em; color: rgba(238,241,248,0.62);">ORBITAL TRAFFIC</div>
    <div class="ui" style="font-size: 19px; letter-spacing: 0.16em; color: ${FAINT};">${right}</div>
  </div>`;

const frame = (inner, bg = BG) =>
  `<div style="position: relative; width: 1080px; height: 1350px; overflow: hidden; background: ${bg};">${inner}</div>`;

const gradText = (t) =>
  `<span style="background: linear-gradient(90deg, ${TEAL} 0%, ${VIOLET} 100%); -webkit-background-clip: text; background-clip: text; color: transparent;">${t}</span>`;

// ══════════════════════════════════════════════════════════════════════════
// 1 · HUD — the poster IS one of the app's plates
// ══════════════════════════════════════════════════════════════════════════
const HUD1 = shell(frame(`
  ${atmosphere}
  <div style="position: absolute; left: -170px; right: -170px; bottom: -330px; height: 1080px; overflow: hidden;">
    <img src="globe-wide.jpg" alt="" style="width: 100%; height: 100%; object-fit: cover; opacity: 0.5;">
    <div style="position: absolute; inset: 0; background:
        radial-gradient(64% 54% at 50% 62%, rgba(7,8,15,0) 0%, rgba(7,8,15,0.55) 72%, ${BG} 100%),
        linear-gradient(180deg, ${BG} 0%, rgba(7,8,15,0.42) 26%, rgba(7,8,15,0.18) 58%, rgba(7,8,15,0.72) 100%);"></div>
  </div>
  <div style="position: absolute; inset: 0; padding: 66px 58px; display: flex; flex-direction: column;">
    ${wordmark("17 SEP 2026 · 07:18 UTC")}

    <div style="margin-top: 40px;">
      ${plate(
        ph("Docked fleet", "6 VEHICLES") +
        FLEET.map((v) => catRow(v.kind === "crew" ? TEAL : CARGO, v.nm, v.st,
          v.seats ? `${v.seats} SEATS` : "CARGO")).join("") +
        catRow(CARGO, "PROGRESS-MS 33", "DEPARTED", "8 SEP", true)
      )}
    </div>

    <div style="margin-top: auto; display: flex; align-items: flex-end; justify-content: space-between;">
      <div>
        <div class="ui" style="font-size: 20px; letter-spacing: 0.24em; text-transform: uppercase; color: ${DIM};">People aboard</div>
        <div class="disp" style="font-size: 210px; font-weight: 800; line-height: 0.82; letter-spacing: -0.04em; margin-top: 14px;">${gradText("10")}</div>
      </div>
      <div style="text-align: right; padding-bottom: 16px;">
        <div class="ui" style="font-size: 20px; letter-spacing: 0.24em; text-transform: uppercase; color: ${DIM};">Seats docked</div>
        <div class="disp" style="font-size: 96px; font-weight: 800; line-height: 1; color: ${INK}; margin-top: 10px;">10</div>
      </div>
    </div>
  </div>`)
);

const CREW = ["JM", "AM", "JH", "SA", "AF", "AK", "PD"];
const HUD2 = shell(frame(`
  ${atmosphere}
  <div style="position: absolute; inset: 0; padding: 66px 58px; display: flex; flex-direction: column;">
    ${wordmark("INTERNATIONAL SPACE STATION")}

    <div style="margin-top: 40px;">
      ${plate(
        ph("Crew aboard", "7") + `
        <div style="display: flex; gap: 17px; padding: 30px 34px 34px;">
          ${CREW.map((c, i) => `
          <div style="width: 96px; height: 96px; border-radius: 50%; border: 2px solid ${i === 0 ? TEAL : LINE};
                      display: flex; align-items: center; justify-content: center;
                      background: rgba(255,255,255,0.03); ${i === 0 ? `box-shadow: 0 0 22px rgba(94,234,212,0.3);` : ""}">
            <span class="ui" style="font-size: 30px; font-weight: 600; letter-spacing: 0.04em; color: ${i === 0 ? TEAL : INK};">${c}</span>
          </div>`).join("")}
        </div>`
      )}
    </div>

    <div style="margin-top: 32px;">
      ${plate(
        ph("Docked capsules", "4") +
        FLEET.filter((v) => v.st === "ISS").map((v) =>
          catRow(v.kind === "crew" ? TEAL : CARGO, v.nm, v.kind === "crew" ? "CREW" : "CARGO",
            v.seats ? `${v.seats} SEATS` : "—")).join("")
      )}
    </div>

    <div style="margin-top: auto;">
      <div class="disp" style="font-size: 78px; font-weight: 800; line-height: 0.98; letter-spacing: -0.022em; color: ${INK};">
        Seven aboard.<br>${gradText("Four parked.")}
      </div>
      <div class="ui" style="margin-top: 22px; font-size: 24px; line-height: 1.55; color: ${DIM}; max-width: 830px;">
        Dragon seats four. Soyuz seats three. Seven people, seven seats bolted on outside — that is not a coincidence.
      </div>
    </div>
  </div>`)
);

// ══════════════════════════════════════════════════════════════════════════
// 2 · FULLBLEED — the app's render fills the frame, type sits in the dark
// ══════════════════════════════════════════════════════════════════════════
const fullbleed = (img, kicker, h1, h2, body, chips) => shell(frame(`
  <img src="${img}" alt="" style="position: absolute; inset: 0; width: 1080px; height: 1350px; object-fit: cover;">
  <div style="position: absolute; inset: 0; background:
      radial-gradient(60% 46% at 50% 26%, rgba(7,8,15,0) 0%, rgba(7,8,15,0.42) 100%),
      linear-gradient(180deg, rgba(7,8,15,0.88) 0%, rgba(7,8,15,0.12) 26%, rgba(7,8,15,0.72) 60%, ${BG} 88%);"></div>

  <div style="position: absolute; inset: 0; padding: 66px 58px; display: flex; flex-direction: column;">
    ${wordmark("17 SEP 2026")}
    <div style="margin-top: auto;">
      <div class="ui" style="font-size: 21px; font-weight: 700; letter-spacing: 0.26em; text-transform: uppercase; color: ${TEAL};">${kicker}</div>
      <div class="disp" style="margin-top: 22px; font-size: 106px; font-weight: 800; line-height: 0.94; letter-spacing: -0.028em; color: ${INK};">
        ${h1}<br>${gradText(h2)}
      </div>
      <div class="ui" style="margin-top: 26px; font-size: 26px; line-height: 1.55; color: ${DIM}; max-width: 850px;">${body}</div>
      <div style="margin-top: 32px; display: flex; flex-wrap: wrap; gap: 12px;">${chips}</div>
    </div>
  </div>`)
);

const FB1 = fullbleed("globe-wide.jpg", "Who is up there", "Ten people.", "Ten seats.",
  `Two space stations, ten humans, and exactly enough seats docked to bring every one of them home. Everything else in orbit is flying empty.`,
  chip("2 stations", true) + chip("6 vehicles") + chip("19,246 tracked"));

const FB2 = fullbleed("globe-near.jpg", "Aboard the ISS", "Seven aboard.", "Four parked.",
  `A Crew Dragon, a Soyuz and two cargo freighters. Dragon seats four, Soyuz seats three — seven people, seven seats.`,
  chip("Crew Dragon 12", true) + chip("Soyuz-MS 29", true) + chip("Cygnus NG-24") + chip("Progress-MS 34"));

// ══════════════════════════════════════════════════════════════════════════
// 3 · TELEMETRY — the info card's label/value grid as a spec sheet
// ══════════════════════════════════════════════════════════════════════════
const TEL1 = shell(frame(`
  ${atmosphere}
  <div style="position: absolute; left: 0; right: 0; top: 452px; height: 420px; overflow: hidden; opacity: 0.66;">
    <img src="globe-wide.jpg" alt="" style="position: absolute; left: 0; top: -455px; width: 1080px; height: 1350px; object-fit: cover;">
    <div style="position: absolute; inset: 0; background: linear-gradient(180deg, ${BG} 0%, rgba(7,8,15,0.12) 28%, rgba(7,8,15,0.14) 70%, ${BG} 100%);"></div>
  </div>

  <div style="position: absolute; inset: 0; padding: 66px 58px; display: flex; flex-direction: column;">
    ${wordmark("17 SEP 2026 · 07:18 UTC")}

    <div style="margin-top: 52px;">
      <div class="ui" style="font-size: 21px; font-weight: 700; letter-spacing: 0.26em; text-transform: uppercase; color: ${TEAL};">Who is up there</div>
      <div class="disp" style="margin-top: 20px; font-size: 230px; font-weight: 800; line-height: 0.8; letter-spacing: -0.045em;">${gradText("10")}</div>
      <div class="ui" style="margin-top: 16px; font-size: 27px; letter-spacing: 0.2em; text-transform: uppercase; color: ${DIM};">People off the planet</div>
    </div>

    <div style="margin-top: auto;">
      <div style="height: 2px; opacity: 0.5; background: linear-gradient(90deg, transparent, rgba(94,234,212,0.5), rgba(167,139,250,0.5), transparent);"></div>
      <div class="ui" style="padding-top: 34px; font-size: 26px; line-height: 1.55; color: ${DIM}; max-width: 880px;">
        Ten humans, two space stations, and exactly ten seats docked to bring every one of them home.
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 42px 40px; margin-top: 40px;">
        ${stat("Seats docked", "10", "", TEAL)}
        ${stat("Space stations", "2")}
        ${stat("Vehicles docked", "6")}
        ${stat("Flying empty", "19,240", "objects")}
      </div>
    </div>
  </div>`)
);

const TEL2 = shell(frame(`
  ${atmosphere}
  <div style="position: absolute; inset: 0; padding: 66px 58px; display: flex; flex-direction: column;">
    ${wordmark("INTERNATIONAL SPACE STATION")}

    <div style="margin-top: 48px;">
      <div class="ui" style="font-size: 21px; font-weight: 700; letter-spacing: 0.26em; text-transform: uppercase; color: ${TEAL};">Aboard the ISS</div>
      <div class="disp" style="margin-top: 20px; font-size: 92px; font-weight: 800; line-height: 0.94; letter-spacing: -0.026em; color: ${INK};">
        Seven aboard.<br>${gradText("Four parked.")}
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px 40px; margin-top: 52px;">
      ${stat("Crew aboard", "7")}
      ${stat("Seats docked", "7", "", TEAL)}
      ${stat("Altitude", "427", "km")}
      ${stat("Speed", "17,108", "mph")}
    </div>

    <div style="margin-top: 52px;">
      ${plate(
        ph("Docked capsules", "4") +
        FLEET.filter((v) => v.st === "ISS").map((v) =>
          catRow(v.kind === "crew" ? TEAL : CARGO, v.nm, v.kind === "crew" ? "CREW" : "CARGO",
            v.seats ? `${v.seats} SEATS` : "—")).join("")
      )}
    </div>

    <div class="ui" style="margin-top: auto; font-size: 25px; line-height: 1.55; color: ${DIM}; max-width: 860px;">
      Dragon seats four. Soyuz seats three. Nobody goes up without a way down.
    </div>
  </div>`)
);

// ── write ─────────────────────────────────────────────────────────────────
const FILES = {
  "Main.dc.html": HUD1,
  "HudStation.dc.html": HUD2,
  "FullbleedOpener.dc.html": FB1,
  "FullbleedStation.dc.html": FB2,
  "TelemetryOpener.dc.html": TEL1,
  "TelemetryStation.dc.html": TEL2,
};
for (const [f, html] of Object.entries(FILES)) fs.writeFileSync(`${DIR}/${f}`, html);

const ROWS = [
  ["1 · HUD — the poster is one of the app's own plates", ["Main.dc.html", "HudStation.dc.html"]],
  ["2 · FULL BLEED — the render fills the frame", ["FullbleedOpener.dc.html", "FullbleedStation.dc.html"]],
  ["3 · TELEMETRY — the info card's grid as a spec sheet", ["TelemetryOpener.dc.html", "TelemetryStation.dc.html"]],
];
const artboards = [], annotations = [];
ROWS.forEach(([label, files], row) => {
  const y = row * 1580;
  files.forEach((file, col) => artboards.push({ file, x: col * 1200, y, w: 1080, h: 1350 }));
  annotations.push({ id: `dir-${row + 1}`, x: 2500, y: y + 40, w: 420, text: label });
});
fs.writeFileSync(`${DIR}/canvas.json`, JSON.stringify({ artboards, annotations, launch: { view: "canvas" } }, null, 2));
console.log(`wrote ${Object.keys(FILES).length} artboards + canvas.json`);

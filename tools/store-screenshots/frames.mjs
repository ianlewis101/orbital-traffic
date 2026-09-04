import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DATA = fileURLToPath(new URL("../../apps/web/public/data/", import.meta.url));
const read = (f) => JSON.parse(readFileSync(DATA + f, "utf8"));

/**
 * Every figure that appears in a screenshot is derived from the same bundled
 * data the app ships, never hand-typed.
 *
 * CLAUDE.md's OBJECT COUNT convention lists the hand-maintained surfaces that
 * have to be updated together when the rounded figure moves, and
 * apps/web/test/object-count-sync.test.js guards them. A number baked into a
 * PNG can't be guarded that way — a test can't read it back out — so the only
 * safe version of it is one that can't drift in the first place. Rounding
 * matches apps/web/vite.config.js exactly so the screenshots and the splash
 * screen always say the same thing.
 */
const round = (n, to) => `${(Math.floor(n / to) * to).toLocaleString("en-US")}+`;
export const COUNTS = {
  objects: round(read("satellites.json").length, 1000),
  profiles: round(Object.keys(read("descriptions.json")).length, 100),
  neos: read("neos.json").length,
};

/**
 * The six App Store frames.
 *
 * Order is deliberate. The App Store shows the first three in search results
 * without anyone tapping through, so those three have to carry the whole
 * pitch on their own: what it is (01), why it's about you (02), how deep it
 * goes (03). The back half is for people who are already swiping — the human
 * beat (04), the live one (05), and the close that answers "what's the catch"
 * in its footer line (06).
 *
 * `accent` is lifted straight out of the app's own category palette
 * (apps/web/src/config.js CATS) for whatever each frame shows: teal for the
 * globe, violet for overhead, science pink for the object card, station amber
 * for the crew, capsule green, hazardous red for the asteroid. Swiping the set
 * walks the product's own legend. `type` is the same hue lifted where the raw
 * category colour doesn't have the contrast to carry display type on black.
 *
 * `shot` names a capture from capture.mjs; `crop` is the y offset (in device
 * pixels of the 1290x2796 capture) where the visible band starts. "anchor"
 * uses the anchor that capture.mjs measured for that shot — the top edge of
 * the real sheet — so a layout change in the app moves the crop with it
 * instead of silently sliding the composition.
 */
export const FRAMES = [
  {
    id: "01-globe",
    shot: "globe",
    crop: 430,
    accent: "#5eead4",
    type: "#5eead4",
    eyebrow: "Live 3D globe",
    head: ["Look up.", "It’s crowded."],
    sub: `${COUNTS.objects} satellites, stations, rocket bodies and debris — every one of them moving, right now.`,
    chip: "Real orbital data · refreshed continuously",
  },
  {
    id: "02-overhead",
    shot: "overhead",
    crop: "anchor",
    accent: "#a78bfa",
    type: "#b9a3ff",
    eyebrow: "What’s overhead",
    head: ["What’s over your", "head right now?"],
    sub: "One tap ranks what’s passing high above you, with the elevation angle to look for it.",
    chip: "Your location never leaves your phone",
  },
  {
    id: "03-object",
    shot: "object",
    crop: "anchor",
    accent: "#ff8fb0",
    type: "#ff9dba",
    eyebrow: "Tap any object",
    head: ["Every dot", "has a story."],
    sub: "Who built it, why it’s up there, what’s gone wrong since — plus live altitude, speed and ground track.",
    chip: `${COUNTS.profiles} hand-written profiles`,
  },
  {
    id: "04-crew",
    shot: "crew",
    crop: "anchor",
    accent: "#ffd23d",
    type: "#ffd75c",
    eyebrow: "Live from the station",
    head: ["Someone is", "up there."],
    sub: "The crew aboard the ISS right now, their flight records, and what they actually did today.",
    chip: "Live roster · ISS and Tiangong",
  },
  {
    id: "05-capsules",
    shot: "capsule",
    crop: "anchor",
    accent: "#2dd4bf",
    type: "#3fe0cb",
    eyebrow: "Capsule watch",
    head: ["Follow every", "capsule home."],
    sub: "Dragon, Soyuz, Progress and Cygnus — tracked from launch, through docking, to landing.",
    chip: "Docking status checked every hour",
  },
  {
    id: "06-asteroids",
    shot: "asteroid",
    crop: "anchor",
    accent: "#ff4422",
    type: "#ff7a55",
    eyebrow: "Near-Earth asteroids",
    head: ["The ones that", "come close."],
    sub: `${COUNTS.neos} near-Earth objects plotted on their true heliocentric paths, with real sizes and close-approach dates.`,
    chip: "No account · no ads · nothing tracked but satellites",
  },
];

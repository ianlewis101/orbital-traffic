// =====================================================================
// THE VIDEO SCRIPT
// =====================================================================
//
// This file IS the video. Everything else in tools/video/ is machinery that
// executes it. To change the cut, change this file and re-run `npm run
// video` — nothing else needs touching.
//
// ---------------------------------------------------------------------
// THE FORM THIS IMITATES
// ---------------------------------------------------------------------
// The reference edit (the "Hawkeye" aircraft-concept format that does well
// on TikTok) runs a three-way intercut, and its persuasive engine is that
// every claim gets validated twice, from outside the advert:
//
//   A. PRODUCT   a slow, clean hero shot, one short line of type over it
//   B. PROOF     real-world footage of the same thing being true
//   C. TEXT      an extreme close-up of a printed page, one word highlighted
//
// Beat order is claim -> proof -> page, then the next claim. The page shots
// are what make it feel like an artefact rather than an ad: they read as
// evidence the claim predates the product.
//
// Orbital Traffic gets to collapse A and B together, which the reference
// could not: its hero shot is not a render of a concept aircraft, it is the
// actual product drawing actual tracked objects from the actual catalog. So
// "proof" here is just a closer, more specific shot of the same globe — the
// ISS with its real orbit trail, the geostationary ring seen edge-on — and
// every number on screen is read out of the catalog at shoot time by
// tools/video/build.mjs rather than typed here.
//
// ---------------------------------------------------------------------
// CAMERA COORDINATES
// ---------------------------------------------------------------------
// The rig is spherical, looking at the Earth's centre (apps/web/src/scene/
// core.js). Scene units are 1000 km, so Earth's radius is 6.371.
//
//   r      distance from centre, in scene units. The camera's 45 degree FOV
//          is VERTICAL, so on a 9:16 frame the horizontal view is much
//          tighter (about 26 degrees) and it is width that decides framing.
//          Measured against Earth's 6.371-unit radius at 1080x1920:
//
//            r = 15    Earth fills the frame top to bottom
//            r = 27    Earth spans the full width, limb to limb
//            r = 38    Earth ~70% of width — LEO shell reads as a shell
//            r = 55    Earth ~50% — whole shell comfortably inside frame
//            r = 110   Earth small; the GEO belt (radius 42) runs off both
//                      edges as a line, which is the shot worth having
//
//          Anything past about r = 60 makes the globe too small to read on a
//          phone held at arm's length, so wide shots here stay brief.
//   theta  azimuth (longitude the camera sits over). Increasing spins the
//          globe right-to-left under a static camera.
//   phi    polar angle, 0 = over the north pole, PI/2 = over the equator,
//          PI = south pole. Clamped to [0.12, PI-0.12] by the rig.
//
// `simRate` is simulation seconds per real second of footage. Orbital motion
// at 1x is real but invisible over a two-second shot; 200-600x is the range
// where LEO traffic visibly streams without tearing into strobing.

// The categories a cinematic shot shows by default. Debris and "other" are
// hidden for the same reason the app hides them by default — they are a grey
// fog that buries everything with a name. `null` anywhere below means "use
// this default".
export const DEFAULT_HIDDEN = ["debris", "other"];

// Master output format. 1080x1920 is TikTok/Reels/Shorts native.
export const FORMAT = {
  width: 1080,
  height: 1920,
  fps: 30,
};

// ---------------------------------------------------------------------
// THE CUT
// ---------------------------------------------------------------------
// Total ~21s. TikTok rewards a hook inside the first second: shot 1 opens
// already moving, on the single most arresting image the app can produce —
// the whole shell of tracked objects around a lit Earth.
//
// Each entry is one shot. `kind: "app"` shoots the live globe; `kind: "card"`
// renders an HTML card (tools/video/cards.mjs) instead.
//
// `text` burns a line over the shot. Keep lines SHORT — the reference never
// exceeds three words on a product shot. `{count}` is substituted at shoot
// time with the real catalog size.

export const SHOTS = [
  // -----------------------------------------------------------------
  // 1. THE HOOK. Wide, the whole shell lit, already drifting when the
  //    video starts. No cut before this and nothing to read yet — the
  //    image alone has to hold the first second, so it is the widest,
  //    densest thing the app can draw.
  // -----------------------------------------------------------------
  {
    id: "hook",
    kind: "app",
    dur: 3.0,
    simRate: 420,
    cam: {
      from: { r: 56, theta: 0.85, phi: 1.12 },
      to: { r: 37, theta: 0.52, phi: 1.2 },
      ease: "outCubic", // cuts in mid-move: never eases from a dead stop
    },
    text: { line: "right now, above you", in: 0.7, hold: 1.7 },
  },

  // -----------------------------------------------------------------
  // 2. THE NUMBER. Closer, still moving. The count is the fact that
  //    makes people stop scrolling, and it is read from the catalog,
  //    not typed — see build.mjs.
  // -----------------------------------------------------------------
  {
    id: "count",
    kind: "app",
    dur: 2.6,
    simRate: 420,
    cam: {
      from: { r: 42, theta: 2.1, phi: 1.28 },
      to: { r: 29, theta: 1.78, phi: 1.18 },
      ease: "outCubic",
    },
    text: { line: "{count} tracked objects", in: 0.25, hold: 1.9, size: "big" },
  },

  // -----------------------------------------------------------------
  // 3. PAGE. First literary beat. Highlights "traffic" — the word the
  //    product is named for, arriving before the product is named.
  // -----------------------------------------------------------------
  {
    id: "page-traffic",
    kind: "card",
    card: "book",
    dur: 1.7,
    // Slow push on the page itself; sells it as a filmed object rather
    // than a screenshot.
    zoom: { from: 1.0, to: 1.09 },
  },

  // -----------------------------------------------------------------
  // 4. LIVE. The terminator sweep — city lights coming up under the
  //    traffic is the app's single best-looking frame, and it is the
  //    shot that proves this is a real globe at a real moment.
  // -----------------------------------------------------------------
  {
    id: "terminator",
    kind: "app",
    dur: 2.8,
    simRate: 600,
    cam: {
      from: { r: 24, theta: 3.3, phi: 1.5 },
      to: { r: 18.5, theta: 2.75, phi: 1.36 },
      ease: "inOutCubic",
    },
    text: { line: "all of it, live", in: 0.4, hold: 1.8 },
  },

  // -----------------------------------------------------------------
  // 5. THE ISS. The specific, human claim. Framed on the real object
  //    with its real orbit trail; if 25544 is somehow missing from the
  //    day's catalog the shot falls back to a fixed LEO framing rather
  //    than failing the shoot (see capture-app.mjs).
  // -----------------------------------------------------------------
  {
    id: "iss",
    kind: "app",
    dur: 2.8,
    simRate: 90, // slow: this shot is about one object, not the swarm
    select: { name: "ZARYA", fallbackId: "25544", trail: true },
    // `aim` tracks the selected object instead of using fixed angles;
    // `standoff` is how far back to sit, in scene units beyond its orbit.
    // Standoff is measured beyond the station's own orbital radius, so the
    // end value is how far off its shoulder the camera settles. 10.5 is the
    // floor worth using: closer than that the Earth fills the whole frame,
    // and since the ISS spends half of every orbit over the night side the
    // shot can land on a black screen with a ring floating in it. `tilt`
    // lifts the eye out of the orbital plane so the trail draws as an arc.
    aim: { standoff: { from: 24, to: 10.5 }, tilt: 0.28, ease: "inOutCubic" },
    text: { line: "including the one\nwith people in it", in: 0.5, hold: 1.7 },
  },

  // -----------------------------------------------------------------
  // 6. PAGE. Second literary beat, highlighting "live" — the word from
  //    shot 4, exactly the way the reference echoes its own title card
  //    one beat later.
  // -----------------------------------------------------------------
  {
    id: "page-live",
    kind: "card",
    card: "book",
    dur: 1.7,
    zoom: { from: 1.06, to: 1.0 },
  },

  // -----------------------------------------------------------------
  // 7. THE RING. Pull back hard to equator-level and the geostationary
  //    belt resolves into a single line around the planet. Nobody who
  //    has not seen this image knows it is there, which is what makes
  //    it the closing argument.
  // -----------------------------------------------------------------
  {
    id: "geo-ring",
    kind: "app",
    dur: 2.6,
    simRate: 300,
    // Starlink stays visible on purpose. The point of the shot is the
    // CONTRAST: the dense bright ball everyone pictures when they think
    // "satellites", and then the thin ring an order of magnitude further out
    // that nobody pictures at all. Hiding the constellations removes half
    // the argument and leaves a sparse sphere next to a faint line.
    cam: {
      // Starts inside the LEO shell and retreats past the belt. The end
      // distance is chosen so the ring CLOSES — at r = 112 it still runs off
      // both edges and reads as a line, which is a much weaker image than a
      // complete ellipse with the Earth small at its centre.
      from: { r: 34, theta: 1.1, phi: 1.36 },
      to: { r: 172, theta: 0.72, phi: 1.3 },
      ease: "inOutCubic",
    },
    // Deliberately late. The belt does not resolve into a ring until the
    // pull-back is nearly finished; a line promising a ring over a frame
    // that has not got one yet reads as a broken promise.
    text: { line: "and the ring\nyou've never seen", in: 1.15, hold: 1.45 },
  },

  // -----------------------------------------------------------------
  // 8. NAME. Back to the full catalog, pushing in, product named over
  //    it. Ends still moving so the logo card lands on a beat.
  // -----------------------------------------------------------------
  {
    id: "name",
    kind: "app",
    dur: 2.2,
    simRate: 420,
    cam: {
      from: { r: 48, theta: 3.15, phi: 1.1 },
      to: { r: 31, theta: 2.92, phi: 1.22 },
      ease: "inCubic", // still accelerating when it cuts to the logo
    },
    text: { line: "ORBITAL TRAFFIC", in: 0.3, hold: 1.6, size: "title" },
  },

  // -----------------------------------------------------------------
  // 9. LOGO. Black card, mark, one line of where to get it. The
  //    reference ends the same way and it is worth copying exactly:
  //    the last frame is the only one a viewer can act on.
  // -----------------------------------------------------------------
  {
    id: "logo",
    kind: "card",
    card: "logo",
    dur: 1.9,
    zoom: { from: 1.0, to: 1.04 },
  },
];

// ---------------------------------------------------------------------
// THE PAGES
// ---------------------------------------------------------------------
// Original prose, written for this edit. The register is deliberately
// novelistic rather than technical — the whole point of the beat is that it
// reads as something that existed before the product did.
//
// `highlight` must appear verbatim in `text`; cards.mjs wraps the first
// occurrence in the yellow marker and the renderer crops the page so that
// occurrence sits near the optical centre.

export const PAGES = {
  "page-traffic": {
    highlight: "traffic",
    text: `He had stopped calling it empty, which was the first honest thing he had said about the sky in years. Above the weather, above the last thin breath of air, the traffic never thinned out at all. It only moved too quickly, and too far away, to be believed by anyone standing still on the ground. Nineteen thousand of them, he told her, and not one holding its position. Every one of them falling, continuously, and missing.`,
  },
  "page-live": {
    highlight: "live",
    text: `The difference, she said, was never the map itself. A chart of where things have been is an artefact; you can frame it, and it will be as true in a hundred years as it is tonight. A chart of where things are is live, and it is already wrong by the time you have finished reading it, which is the only reason it is worth anything at all. She turned the screen towards him. Watch the ones that are moving.`,
  },
};

/**
 * Orbital Traffic — social post content.
 *
 * This is the only file you edit to make a new post. Layout lives in
 * social-kit.css, assembly in build.js; neither needs touching to publish.
 *
 * A post is:
 *   {
 *     title  human label, shown on the contact sheet only
 *     kind   "carousel" (indexed, progress dots, swipe hint) | "single"
 *     size   "portrait" 1080x1350 (default) | "square" 1080x1080 | "story" 1080x1920
 *     slides [ ...archetypes ]
 *   }
 *
 * Any post renders at any size — `kind` and `size` are independent. A
 * carousel can be square, a single post can be a story.
 *
 * ARCHETYPES (one `type` per slide; all share the same rails and margins):
 *   cover   kicker, headline, lead                 — opener, or a whole single post
 *   stat    kicker, figure, figureLabel, body, readout[{v,k}]
 *   shot    kicker, headline, caption, image, fit ("card" | "device"), cropTop
 *           The screenshot is cropped, not shrunk — see .a-shot in the CSS.
 *           cropTop trims the top of the source as a % of its own height.
 *   list    kicker, headline, rows[{t,d}]          — numbering is automatic
 *   legend  kicker, headline, note, cats[]         — colours come from config.js
 *   cta     headline, lead, pill, note
 *
 * TEXT MARKUP (build.js, safe — parsed into DOM nodes, never innerHTML):
 *   \n            hard line break
 *   [like this]   gradient-accented run inside a headline
 *   {{OBJECT_COUNT}}
 *                 the catalog size. DERIVED, never typed: substituted from
 *                 the real length of apps/web/public/data/satellites.json,
 *                 rounded down to the thousand exactly as
 *                 apps/web/vite.config.js does it. Per CLAUDE.md's
 *                 object-count convention, always use the token here — a
 *                 hand-typed figure would be a new copy to keep in sync.
 */

/**
 * Artboard sizes, in exported pixels. Shared by the CSS (which mirrors the
 * heights in .slide[data-size]), by build.js and by tools/render-social.mjs,
 * which asserts every written PNG against these exact numbers.
 */
export const ARTBOARD = {
  portrait: { w: 1080, h: 1350 }, // 4:5 — Instagram/LinkedIn/X feed
  square: { w: 1080, h: 1080 }, // 1:1
  story: { w: 1080, h: 1920 }, // 9:16 — stories, Reels/TikTok covers
};

export const SIZES = Object.keys(ARTBOARD);
export const DEFAULT_SIZE = "portrait";

export const SITE = "orbitaltraffic.app";

export const POSTS = {
  /* ----------------------------------------------------------------------
     5-slide launch carousel — the reference implementation of the format.
     Cover -> proof -> product -> depth -> close.
     ---------------------------------------------------------------------- */
  launch: {
    title: "Launch carousel",
    kind: "carousel",
    size: "portrait",
    slides: [
      {
        type: "cover",
        kicker: "Live 3D satellite tracker",
        headline: "See what's\nabove you.\n[Right now.]",
        lead: "{{OBJECT_COUNT}} satellites, stations and spacecraft — tracked live on a real-time 3D globe, computed entirely on your device.",
      },
      {
        type: "stat",
        kicker: "The catalog",
        figure: "{{OBJECT_COUNT}}",
        figureLabel: "objects tracked live",
        body: "Every active satellite, spent rocket body and tracked fragment in Earth orbit — refreshed daily from CelesTrak, not simulated.",
        readout: [
          { v: "77", k: "Near-Earth asteroids" },
          { v: "13", k: "Orbit classes" },
          { v: "1,700+", k: "Written profiles" },
        ],
      },
      {
        type: "shot",
        kicker: "Every object has a story",
        headline: "Tap anything.",
        caption:
          "Hand-written profiles on 1,700+ notable objects — who built it, why it's up there — plus live telemetry on everything else.",
        image: "../../apps/web/public/screenshots/object-card-hst.png",
        fit: "card",
        cropTop: 1.7, // trims the clipped "AUTOMATICALLY" row above the panel
      },
      {
        type: "legend",
        kicker: "Orbit classes",
        headline: "Thirteen kinds\nof traffic.",
        note: "Toggle any class on or off, live, from the in-scene legend.",
      },
      {
        type: "cta",
        headline: "Look up.\n[It's free.]",
        lead: "Runs in your browser. Installs as a real app on iOS, Android and desktop.",
        pill: SITE,
        note: "No account · No ads · Nothing ever leaves your device",
      },
    ],
  },

  /* ----------------------------------------------------------------------
     Single-image posts. Same frame, no index and no dots — the cover and
     cta archetypes are written to stand alone.
     ---------------------------------------------------------------------- */
  overhead: {
    title: "What's Overhead — single",
    kind: "single",
    size: "portrait",
    slides: [
      {
        type: "cover",
        kicker: "The feature people open the app for",
        headline: "What's\n[overhead]\nright now?",
        lead: "One tap shows the notable objects passing high above you — real orbital mechanics, computed on your device, no guessing.",
      },
    ],
  },

  catalog: {
    title: "Catalog stat — single, square",
    kind: "single",
    size: "square",
    slides: [
      {
        type: "stat",
        kicker: "Currently tracking",
        figure: "{{OBJECT_COUNT}}",
        figureLabel: "objects in Earth orbit",
        body: "Refreshed daily from CelesTrak and plotted live in your browser.",
        readout: [
          { v: "13", k: "Orbit classes" },
          { v: "77", k: "Near-Earth asteroids" },
        ],
      },
    ],
  },

  teaser: {
    title: "Story teaser — single, 9:16",
    kind: "single",
    size: "story",
    slides: [
      {
        type: "cover",
        kicker: "Live 3D satellite tracker",
        headline: "There are\n{{OBJECT_COUNT}}\nthings\n[over your head.]",
        lead: "See every one of them, live, in your browser.",
      },
    ],
  },
};

/** Ordered post ids — the contact sheet and the renderer both use this. */
export const POST_IDS = Object.keys(POSTS);

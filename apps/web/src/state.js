import { CATS } from "./config.js";

export const state = {
  sats: [],
  byId: new Map(),
  cats: {},
  hidden: new Set(["debris", "other"]),
  simNow: Date.now(),
  rate: 1,
  lastWall: performance.now(),
  selected: null,
  tracking: false,
  hovered: null,
  cardCollapsed: false,
  lastProp: 0,
  source: "cached",
  srcTime: null,
  // True once a live sync attempt has completed with no data applied (Worker
  // and direct-CelesTrak fallback both failed). Lets the freshness line say
  // "cached elements · retrying" instead of sticking on "syncing…" forever.
  syncFailed: false,
  // Age reference for the bundled boot catalog: the newest TLE epoch among
  // the objects loaded at boot, so the freshness line can show the catalog's
  // real age before (and if) the first live sync lands.
  bootCatalogTime: null,
  // { message, at } for the most recent sync attempt that threw an
  // unexpected error (not the ordinary "both paths failed" case, which
  // syncFailed already covers) — surfaced in Settings so a real failure
  // mode is readable directly off the device instead of requiring a
  // connected browser console. Cleared on the next successful sync.
  lastSyncError: null,
  capsulesData: null,
  capsulesTime: null,
  // Launch chains ("Starlink trains") currently detectable in the catalog,
  // tightest first, re-derived on every sync by data/chains.js. `chain` is
  // the one the user has lit on the globe, if any — a selection parallel to
  // `selected`, not a replacement for it: tapping a member of a lit chain
  // opens that satellite in the info card with the chain still highlighted.
  chains: [],
  chain: null,
};
Object.keys(CATS).forEach((c) => (state.cats[c] = 0));

export const $ = (s) => document.querySelector(s);

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
  capsulesData: null,
  capsulesTime: null,
};
Object.keys(CATS).forEach((c) => (state.cats[c] = 0));

export const $ = (s) => document.querySelector(s);

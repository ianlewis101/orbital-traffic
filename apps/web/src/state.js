import { CATS } from "./config.js";

export const state = {
  sats: [],
  byId: new Map(),
  cats: {},
  hidden: new Set(["debris", "classified"]),
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
};
Object.keys(CATS).forEach((c) => (state.cats[c] = 0));

export const $ = (s) => document.querySelector(s);

// ---------- scene / physics constants ----------
export const KM_U = 1000; // km per scene unit
export const EARTH_KM = 6371;
export const EARTH_R = EARTH_KM / KM_U;
export const MU = 398600.4418;

// ---------- display categories ----------
export const CATS = {
  stations: { label: "Stations", color: 0xffd23d, px: 5 },
  capsules: { label: "Capsules", color: 0x2dd4bf, px: 4 },
  navigation: { label: "Navigation", color: 0xb39bff, px: 4 },
  geostationary: { label: "Geostationary", color: 0x4ff0c0, px: 4 },
  starlink: { label: "Starlink", color: 0x8fd6ff, px: 4 },
  oneweb: { label: "OneWeb", color: 0x3d8bfd, px: 4 },
  kuiper: { label: "Kuiper", color: 0xa3e635, px: 4 },
  communications: { label: "Communications", color: 0xff8c00, px: 4 },
  science: { label: "Science", color: 0xff8fb0, px: 4 },
  classified: { label: "CLASSIFIED", color: 0x8b0000, px: 4 },
  hazardous: { label: "Hazardous NEOs", color: 0xff4422, px: 5 },
  other: { label: "Other", color: 0xc3cede, px: 4 },
  debris: { label: "DEBRIS", color: 0x7a8899, px: 4 },
};

export function catColorHex(cat) {
  return "#" + (CATS[cat] || CATS.other).color.toString(16).padStart(6, "0");
}

// ---------- "Today in Space" event types ----------
// Colors reuse existing CATS tokens rather than inventing a new palette:
// docking/undocking/launched/landed vehicles ARE cat:"capsules"; a
// re-entering/decaying object becomes cat:"debris" the same metaphor;
// crew-change violet already matches capsule-status.js's .crew-today-dot.
// A chain row is tinted by its constellation instead (catColorHex(e.cat) in
// ui/today-in-space.js) — Starlink blue, OneWeb blue, Kuiper green — since
// that is what the highlighted dots on the globe will be; the entry here is
// the fallback for a chain whose category somehow isn't in CATS.
export const EVENT_TYPES = {
  docking: { color: CATS.capsules.color },
  launch: { color: CATS.communications.color },
  reentry: { color: CATS.debris.color },
  crew: { color: 0xb39bff },
  chain: { color: CATS.starlink.color },
};

export function eventColorHex(type) {
  return "#" + (EVENT_TYPES[type] || EVENT_TYPES.docking).color.toString(16).padStart(6, "0");
}

// Icon-first badges for the event feed (Design item #14, "standardize
// icons" — first entry). Fixed inline-SVG strings keyed by event type,
// same closed-table-with-fallback shape as eventColorHex above, so both
// are allow-listed together in eslint-rules/no-unescaped-innerhtml.js.
const EVENT_ICON_SVG = {
  docking: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 4 L18.9 8 L18.9 16 L12 20 L5.1 16 L5.1 8 Z"/>
    <line x1="5.1" y1="12" x2="9.5" y2="12"/>
    <line x1="14.5" y1="12" x2="18.9" y2="12"/>
    <line x1="10.7" y1="9.6" x2="10.7" y2="14.4"/>
    <line x1="13.3" y1="9.6" x2="13.3" y2="14.4"/>
  </svg>`,
  launch: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2.3c2.8 0 4.4 3.6 4.4 7.4v6.6h-8.8v-6.6c0-3.8 1.6-7.4 4.4-7.4Z"/>
    <circle cx="12" cy="9.3" r="1.7"/>
    <path d="M7.6 14.3 4.6 19.3l3-1"/>
    <path d="M16.4 14.3 19.4 19.3l-3-1"/>
    <path d="M10 20.5 12 23.3 14 20.5"/>
  </svg>`,
  reentry: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4.2 9.2C7 6.6 17 6.6 19.8 9.2"/>
    <line x1="12" y1="9.6" x2="12" y2="17.6"/>
    <path d="M8.6 15 12 18.6 15.4 15"/>
    <path d="M8.7 11.6 6.9 13.6"/>
    <path d="M15.3 11.6 17.1 13.6"/>
  </svg>`,
  crew: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="10" r="6.6"/>
    <path d="M8.6 8.4c1.1-1.4 2.6-2 4.4-1.6"/>
    <path d="M4.6 20c1.7-3.1 5-4.9 7.4-4.9s5.7 1.8 7.4 4.9"/>
  </svg>`,
  // Beads on an arc — the string of pearls itself, which is what the row
  // opens on the globe.
  chain: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2.6 18.4C6.2 11.2 13.4 6.2 21.4 4.9" opacity="0.55"/>
    <circle cx="4.6" cy="16.2" r="1.45" fill="currentColor" stroke="none"/>
    <circle cx="9" cy="12.4" r="1.45" fill="currentColor" stroke="none"/>
    <circle cx="14" cy="9.2" r="1.45" fill="currentColor" stroke="none"/>
    <circle cx="19.6" cy="6.7" r="1.45" fill="currentColor" stroke="none"/>
  </svg>`,
};

export function eventIconSvg(type) {
  return EVENT_ICON_SVG[type] || EVENT_ICON_SVG.docking;
}

// ---------- live data endpoints ----------
export const WORKER_BASE = "https://orbital-traffic.ianlewis101.workers.dev";

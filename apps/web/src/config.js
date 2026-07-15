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
  cool: { label: "COOL SHIT", color: 0xa78bfa, px: 4 },
  other: { label: "Other", color: 0xc3cede, px: 4 },
  debris: { label: "DEBRIS", color: 0x7a8899, px: 4 },
};

export function catColorHex(cat) {
  return "#" + (CATS[cat] || CATS.other).color.toString(16).padStart(6, "0");
}

// ---------- live data endpoints ----------
export const WORKER_BASE = "https://orbital-traffic.ianlewis101.workers.dev";

/**
 * Static data catalog, served as versioned JSON from /data/ (refreshed
 * daily by CI). Loaded once at boot; modules read from DATA after
 * loadData() resolves.
 */
export const DATA = {
  sats: [],
  land: [],
  photos: {},
  neos: [],
  descs: {},
  neoDescs: {},
  hotlist: [],
};

const FILES = {
  sats: "satellites.json",
  land: "coastlines.json",
  photos: "photos.json",
  neos: "neos.json",
  descs: "descriptions.json",
  neoDescs: "neo-descriptions.json",
  hotlist: "hotlist.json",
};

async function fetchJson(file) {
  const res = await fetch("/data/" + file);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return res.json();
}

/**
 * Loads all catalog files in parallel. The satellite catalog is required —
 * without it there is nothing to render — but every auxiliary file
 * (photos, descriptions, hotlist…) degrades gracefully to its empty
 * default so a single corrupt file can't take the app down.
 */
export async function loadData() {
  const entries = Object.entries(FILES);
  const results = await Promise.allSettled(entries.map(([, f]) => fetchJson(f)));
  results.forEach((r, i) => {
    const key = entries[i][0];
    if (r.status === "fulfilled") DATA[key] = r.value;
    else console.warn("data load failed:", entries[i][1], r.reason);
  });
  if (!DATA.sats.length) throw new Error("satellite catalog failed to load");
  return DATA;
}

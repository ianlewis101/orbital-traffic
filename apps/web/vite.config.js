import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Splash-screen object count, derived from the real bundled catalog instead of
// hand-written — see the "Object count" Conventions entry in CLAUDE.md for the
// other surfaces that still have to be updated by hand when this figure moves.
// This only stays fresh because deploy-pages.yml has no `paths` filter, so the
// daily TLE-refresh commit (which touches apps/web/public/data/satellites.json)
// triggers a full rebuild. If finding F19 ("every data commit triggers a full
// Pages deploy") ever adds one, it must keep apps/web/public/data/** in scope
// or this count silently goes stale again.
const satellitesPath = fileURLToPath(new URL("./public/data/satellites.json", import.meta.url));
const satelliteCount = JSON.parse(readFileSync(satellitesPath, "utf8")).length;
const objectCount = `${(Math.floor(satelliteCount / 1000) * 1000).toLocaleString("en-US")}+`;

export default defineConfig({
  // Served from the domain root (orbitaltraffic.app / GitHub Pages custom domain)
  base: "/",
  define: {
    __OBJECT_COUNT__: JSON.stringify(objectCount),
  },
  build: {
    target: "es2020",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
          satellite: ["satellite.js"],
        },
      },
    },
  },
});

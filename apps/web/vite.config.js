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

// App version for Settings > About, read from this workspace's package.json so
// there is exactly one place to bump it. Note this is the *web* version and is
// independent of the iOS build's MARKETING_VERSION / CURRENT_PROJECT_VERSION,
// which are set in the Xcode project and injected by ios-build.yml.
const pkgPath = fileURLToPath(new URL("./package.json", import.meta.url));
const appVersion = JSON.parse(readFileSync(pkgPath, "utf8")).version;

export default defineConfig({
  // Served from the domain root (orbitaltraffic.app / GitHub Pages custom domain)
  base: "/",
  define: {
    __OBJECT_COUNT__: JSON.stringify(objectCount),
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  build: {
    target: "es2020",
    sourcemap: true,
    rollupOptions: {
      // Two-page build: the app itself, plus the marketing landing page.
      // welcome.html needs to go through Vite (not sit in public/ like
      // privacy.html/support.html) so it picks up __OBJECT_COUNT__ the same
      // way index.html does, instead of becoming a new hand-written count
      // surface (see CLAUDE.md's OBJECT COUNT convention).
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        welcome: fileURLToPath(new URL("./welcome.html", import.meta.url)),
      },
      output: {
        manualChunks: {
          three: ["three"],
          satellite: ["satellite.js"],
        },
      },
    },
  },
});

/**
 * Emit an HTML file that Canva's URL importer turns into a six-page design,
 * one page per App Store screenshot at the full 1320x2868.
 *
 *   node exports/app-store-screenshots/tooling/canva-import.mjs
 *
 * Canva's importer needs the file — and everything it references — to already
 * be public, so the image URLs are pinned to a commit SHA on this repo rather
 * than to a branch name: a branch URL would silently change what the design
 * imported from the next time anything landed on it.
 *
 * Each page carries `data-document-role="page"`, which is how the importer
 * decides where the page breaks go.
 */
import { writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = "ianlewis101/orbital-traffic";

// Pin to the commit that holds the PNGs being imported. Override when
// re-cutting: SHA=<sha> node canva-import.mjs
const SHA =
  process.env.SHA || execFileSync("git", ["rev-parse", "HEAD"], { cwd: HERE }).toString().trim();

const PAGES = [
  ["01-look-up.png", "01 — Look up. It's crowded."],
  ["02-overhead.png", "02 — What's flying over your head right now?"],
  ["03-every-dot.png", "03 — Every dot has a story."],
  ["04-capsules.png", "04 — Follow the fleet, launch to landing."],
  ["05-crew.png", "05 — Seven people live up there."],
  ["06-daylight.png", "06 — Real sunlight, real shadow."],
];

const base = `https://raw.githubusercontent.com/${REPO}/${SHA}/exports/app-store-screenshots/composed`;

const body = PAGES.map(
  ([file, label]) => `<div data-document-role="page" data-label="${label}"
     style="width:1320px;height:2868px;position:relative;overflow:hidden;background:#07080f">
  <img src="${base}/${file}" alt="${label}"
       style="display:block;width:1320px;height:2868px">
</div>`
).join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Orbital Traffic — App Store screenshots</title>
<style>body{margin:0;background:#07080f}</style>
</head>
<body>
${body}
</body>
</html>
`;

const out = resolve(HERE, "canva-import.html");
await writeFile(out, html);
console.log(`wrote ${out}`);
console.log(`pinned to ${SHA}`);
console.log(`import URL once pushed:\n  https://raw.githubusercontent.com/${REPO}/<new-sha>/exports/app-store-screenshots/tooling/canva-import.html`);

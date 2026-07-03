#!/usr/bin/env node
/**
 * list-norad-ids.mjs
 * Lists NORAD catalog IDs from the bundled satellite catalog, grouped by
 * category, for curating apps/web/public/data/descriptions.json by hand.
 * Read-only — never writes anything.
 *
 * Usage:
 *   node tools/list-norad-ids.mjs --counts
 *   node tools/list-norad-ids.mjs --category=<id> [--offset=N] [--limit=N]
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { noradId, categorize, CATEGORY_IDS } from "@orbital-traffic/catalog";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SATS_PATH = join(ROOT, "apps/web/public/data/satellites.json");
const DESCS_PATH = join(ROOT, "apps/web/public/data/descriptions.json");
const MAX_LIMIT = 100;

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (m) args[m[1]] = m[2] ?? true;
  }
  return args;
}

async function loadCatalog() {
  const [satsRaw, descsRaw] = await Promise.all([
    readFile(SATS_PATH, "utf8"),
    readFile(DESCS_PATH, "utf8"),
  ]);
  const sats = JSON.parse(satsRaw);
  const descs = JSON.parse(descsRaw);

  const byCategory = new Map(CATEGORY_IDS.map((c) => [c, []]));
  for (const r of sats) {
    const id = noradId(r.l1);
    const cat = categorize(id, r.name, r.cat);
    const inclination = parseFloat(r.l2.slice(8, 16));
    byCategory.get(cat).push({ id, name: r.name, inclination, described: id in descs });
  }
  return byCategory;
}

function printCounts(byCategory) {
  console.log("category          total  remaining");
  console.log("----------------  -----  ---------");
  for (const cat of CATEGORY_IDS) {
    const list = byCategory.get(cat);
    const remaining = list.filter((o) => !o.described).length;
    console.log(`${cat.padEnd(17)} ${String(list.length).padStart(5)}  ${String(remaining).padStart(9)}`);
  }
}

function printCategory(byCategory, cat, offset, limit) {
  const list = byCategory.get(cat);
  const total = list.length;
  const remaining = list.filter((o) => !o.described).sort((a, b) => Number(a.id) - Number(b.id));
  const describedCount = total - remaining.length;

  if (!remaining.length) {
    console.log(`\n${cat} — 0 remaining (${total} total, ${describedCount} already described)`);
    return;
  }

  const page = remaining.slice(offset, offset + limit);
  const end = offset + page.length;
  console.log(
    `\n## ${cat} — showing ${offset + 1}–${end} of ${remaining.length} remaining (${total} total, ${describedCount} described)\n`
  );
  console.log("| NORAD ID | Name | Inclination |");
  console.log("|---|---|---|");
  for (const o of page) {
    const inc = Number.isFinite(o.inclination) ? `${o.inclination.toFixed(2)}°` : "—";
    console.log(`| ${o.id} | ${o.name} | ${inc} |`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const byCategory = await loadCatalog();

  if (!args.category) {
    printCounts(byCategory);
    return;
  }

  if (!CATEGORY_IDS.includes(args.category)) {
    console.error(`Unknown category "${args.category}". Valid categories: ${CATEGORY_IDS.join(", ")}`);
    process.exit(1);
  }

  const offset = Number(args.offset ?? 0);
  const limit = Math.min(Number(args.limit ?? MAX_LIMIT), MAX_LIMIT);
  printCategory(byCategory, args.category, offset, limit);
}

main();

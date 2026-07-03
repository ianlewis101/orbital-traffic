#!/usr/bin/env node
/**
 * merge-descriptions.mjs
 * Merges hand-curated NORAD-ID-keyed descriptions into
 * apps/web/public/data/descriptions.json. Never overwrites an existing
 * entry — conflicts are skipped and reported, matching this repo's
 * established curation precedent (see descriptions-integration-report.md).
 *
 * Usage:
 *   node tools/merge-descriptions.mjs --file=<path-to-json>
 *   cat batch.json | node tools/merge-descriptions.mjs
 *
 * Input shape: {"<norad id>": {"d": "description", "a": "agency", "t": "type"}, ...}
 * Only "d" is required.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { noradId } from "@orbital-traffic/catalog";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SATS_PATH = join(ROOT, "apps/web/public/data/satellites.json");
const DESCS_PATH = join(ROOT, "apps/web/public/data/descriptions.json");

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (m) args[m[1]] = m[2] ?? true;
  }
  return args;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const raw = args.file ? await readFile(args.file, "utf8") : await readStdin();
  let batch;
  try {
    batch = JSON.parse(raw);
  } catch (e) {
    console.error(`Invalid JSON input: ${e.message}`);
    process.exit(1);
  }
  if (!batch || typeof batch !== "object" || Array.isArray(batch)) {
    console.error('Input must be a JSON object of the form {"<norad id>": {"d": "..."}}.');
    process.exit(1);
  }

  const [sats, descs] = await Promise.all([
    JSON.parse(await readFile(SATS_PATH, "utf8")),
    JSON.parse(await readFile(DESCS_PATH, "utf8")),
  ]);
  const known = new Map(sats.map((r) => [noradId(r.l1), r.name]));

  const toAdd = {};
  const conflicts = [];
  const invalid = [];

  for (const [id, entry] of Object.entries(batch)) {
    if (!/^\d+$/.test(id)) {
      invalid.push({ id, reason: "not a valid NORAD ID" });
    } else if (!known.has(id)) {
      invalid.push({ id, reason: "not found in current satellite catalog" });
    } else if (!entry || typeof entry.d !== "string" || !entry.d.trim()) {
      invalid.push({ id, reason: 'missing required "d" field' });
    } else if (id in descs) {
      conflicts.push({ id, name: known.get(id) });
    } else {
      toAdd[id] = entry;
    }
  }

  const addedCount = Object.keys(toAdd).length;
  console.log(`\n=== Description merge — ${new Date().toISOString().slice(0, 10)} ===\n`);
  console.log(`Integrated: ${addedCount} new entr${addedCount === 1 ? "y" : "ies"}`);

  if (conflicts.length) {
    console.log(`Conflicts (not applied, already described): ${conflicts.length}`);
    for (const c of conflicts) {
      console.log(`  - ${c.id} (${c.name}): already has a description, left unchanged`);
    }
  }
  if (invalid.length) {
    console.log(`Invalid (not applied): ${invalid.length}`);
    for (const v of invalid) console.log(`  - ${v.id}: ${v.reason}`);
  }

  if (!addedCount) {
    console.log("\nNothing to write — descriptions.json unchanged.");
    return;
  }

  const merged = { ...descs, ...toAdd };
  await writeFile(DESCS_PATH, JSON.stringify(merged));
  console.log(`\n✓ Wrote ${DESCS_PATH} (${Object.keys(merged).length} total entries)`);
}

main();

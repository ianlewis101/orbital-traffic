/**
 * Refresh the bundled satellite catalog.
 *
 * Fetches the CelesTrak GP groups, classifies every record with the SAME
 * @orbital/core pipeline the app and edge worker use, de-duplicates by NORAD
 * id (priority order), and writes apps/web/public/data/catalog.json.
 *
 * Run: `pnpm data:refresh` (uses tsx). Wired to a daily GitHub Action.
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseTleText, type OrbitalObject, type TleRecord } from '@orbital/core';

const CELESTRAK = 'https://celestrak.org/NORAD/elements/gp.php?FORMAT=tle&GROUP=';
const HEADERS = {
  'User-Agent': 'OrbitalTraffic/2.0 (+https://orbitaltraffic.app)',
  Accept: 'text/plain',
};

const GROUPS: [group: string, cat: string][] = [
  ['stations', 'stations'],
  ['gps-ops', 'navigation'],
  ['galileo', 'navigation'],
  ['glonass', 'navigation'],
  ['geo', 'geostationary'],
  ['cosmos-2251-debris', 'debris'],
  ['iridium-33-debris', 'debris'],
  ['fengyun-1c-debris', 'debris'],
  ['starlink', 'starlink'],
  ['oneweb', 'starlink'],
  ['science', 'science'],
  ['active', 'other'],
];

const OUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../apps/web/public/data/catalog.json',
);

async function fetchGroup(group: string, cat: string): Promise<OrbitalObject[]> {
  process.stdout.write(`  ${group}… `);
  try {
    const res = await fetch(CELESTRAK + group, { headers: HEADERS });
    if (!res.ok) {
      console.log(`HTTP ${res.status}`);
      return [];
    }
    const objects = parseTleText(await res.text(), cat);
    console.log(`${objects.length}`);
    return objects;
  } catch (e) {
    console.log(`failed (${(e as Error).message})`);
    return [];
  }
}

async function main() {
  console.log('Refreshing satellite catalog from CelesTrak:');
  const merged = new Map<string, OrbitalObject>();
  for (const [group, cat] of GROUPS) {
    const objects = await fetchGroup(group, cat);
    for (const obj of objects) if (!merged.has(obj.id)) merged.set(obj.id, obj);
    await new Promise((r) => setTimeout(r, 800)); // be polite to CelesTrak
  }

  if (merged.size === 0) {
    console.error('No satellites fetched — aborting so good data is not wiped.');
    process.exit(1);
  }

  const records: TleRecord[] = [...merged.values()].map((o) => ({
    name: o.name,
    l1: o.line1,
    l2: o.line2,
    cat: o.category,
  }));
  await writeFile(OUT, JSON.stringify(records));
  console.log(`\n✓ Wrote ${records.length} objects to ${OUT}`);
}

main();

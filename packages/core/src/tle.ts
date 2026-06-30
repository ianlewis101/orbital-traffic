import type { OrbitalObject, TleRecord } from './types.js';
import { classify } from './classification.js';

/** Extract the NORAD catalog id (columns 3-7) from a TLE line 1. */
export function noradId(line1: string): string {
  return line1.slice(2, 7).trim();
}

/**
 * Turn a raw {@link TleRecord} into a classified {@link OrbitalObject}.
 * Returns `null` if the lines are obviously malformed.
 */
export function toOrbitalObject(rec: TleRecord): OrbitalObject | null {
  if (!rec.l1 || !rec.l2 || rec.l1[0] !== '1' || rec.l2[0] !== '2') return null;
  const id = noradId(rec.l1);
  if (!id) return null;
  return {
    id,
    name: (rec.name || `OBJ ${id}`).trim(),
    category: classify(id, rec.name, rec.cat),
    line1: rec.l1,
    line2: rec.l2,
  };
}

/**
 * Parse a CelesTrak "3LE"/TLE text blob into classified objects. `defaultCat`
 * is applied before the classification pipeline refines it.
 */
export function parseTleText(text: string, defaultCat = 'other'): OrbitalObject[] {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd());
  const out: OrbitalObject[] = [];
  for (let i = 0; i + 2 < lines.length || i + 2 === lines.length; i++) {
    const name = lines[i];
    const l1 = lines[i + 1];
    const l2 = lines[i + 2];
    if (name === undefined || l1 === undefined || l2 === undefined) break;
    if (l1.startsWith('1 ') && l2.startsWith('2 ')) {
      const obj = toOrbitalObject({ name: name.trim(), l1, l2, cat: defaultCat as never });
      if (obj) out.push(obj);
      i += 2; // consumed three lines
    }
  }
  return out;
}

/**
 * Build a de-duplicated catalog from raw records, keeping the first record
 * seen for each NORAD id (callers pass records in priority order).
 */
export function buildCatalog(records: TleRecord[]): OrbitalObject[] {
  const byId = new Map<string, OrbitalObject>();
  for (const rec of records) {
    const obj = toOrbitalObject(rec);
    if (obj && !byId.has(obj.id)) byId.set(obj.id, obj);
  }
  return [...byId.values()];
}

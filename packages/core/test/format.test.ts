import { describe, it, expect } from 'vitest';
import { formatPeriod, formatLatLon, orbitRegime, formatInt } from '../src/format.js';
import { buildCatalog } from '../src/tle.js';
import type { TleRecord } from '../src/types.js';

describe('formatters', () => {
  it('formats short and long periods', () => {
    expect(formatPeriod(92)).toBe('92 min');
    expect(formatPeriod(1436)).toBe('23h 56m');
  });

  it('formats a sub-satellite point with hemispheres', () => {
    expect(formatLatLon(51.6, -0.1)).toBe('51.6°N · 0.1°W');
    expect(formatLatLon(-33.9, 151.2)).toBe('33.9°S · 151.2°E');
  });

  it('labels orbit regimes', () => {
    expect(orbitRegime(420)).toBe('LEO');
    expect(orbitRegime(20200)).toBe('MEO');
    expect(orbitRegime(35786)).toBe('GEO');
    expect(orbitRegime(120000)).toBe('HEO');
  });

  it('adds thousands separators', () => {
    expect(formatInt(12345)).toBe('12,345');
  });
});

describe('buildCatalog', () => {
  it('de-duplicates by NORAD id keeping the first record', () => {
    const recs: TleRecord[] = [
      {
        name: 'ISS (ZARYA)',
        l1: '1 25544U 98067A   26180.50883825  .00005660  00000+0  10902-3 0  9997',
        l2: '2 25544  51.6320 239.0980 0004278 246.9974 113.0563 15.49477794573665',
        cat: 'stations',
      },
      {
        name: 'ISS DUP',
        l1: '1 25544U 98067A   26180.50883825  .00005660  00000+0  10902-3 0  9997',
        l2: '2 25544  51.6320 239.0980 0004278 246.9974 113.0563 15.49477794573665',
        cat: 'other',
      },
    ];
    const cat = buildCatalog(recs);
    expect(cat).toHaveLength(1);
    expect(cat[0]!.name).toBe('ISS (ZARYA)');
    expect(cat[0]!.category).toBe('stations');
  });
});

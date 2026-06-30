import { describe, it, expect } from 'vitest';
import { solveKepler, neoPositionAt, neoOrbitPath, neoMeanMotion } from '../src/neo.js';
import type { NeoElements } from '../src/types.js';

const GEOGRAPHOS: NeoElements = {
  name: 'Geographos',
  a: 1.245804,
  e: 0.3355178,
  i: 13.3368,
  om: 337.1349,
  w: 277.0291,
  ma: 354.6795,
  epoch: 2461200.5,
  cls: 'Apollo',
  diam: '2.56',
};

const mag = (v: { x: number; y: number; z: number }) => Math.hypot(v.x, v.y, v.z);

describe('solveKepler', () => {
  it('is exact for a circular orbit (E = M)', () => {
    expect(solveKepler(1.2, 0)).toBeCloseTo(1.2, 8);
  });

  it('satisfies Kepler’s equation for eccentric orbits', () => {
    const M = 0.9;
    const e = 0.5;
    const E = solveKepler(M, e);
    expect(E - e * Math.sin(E)).toBeCloseTo(M, 8);
  });
});

describe('neoPositionAt', () => {
  it('stays within the orbit’s perihelion/aphelion bounds', () => {
    const peri = GEOGRAPHOS.a * (1 - GEOGRAPHOS.e);
    const apo = GEOGRAPHOS.a * (1 + GEOGRAPHOS.e);
    for (const day of [0, 90, 180, 365, 700]) {
      const r = mag(neoPositionAt(GEOGRAPHOS, new Date(Date.now() + day * 86400000)));
      expect(r).toBeGreaterThanOrEqual(peri - 1e-3);
      expect(r).toBeLessThanOrEqual(apo + 1e-3);
    }
  });
});

describe('neoOrbitPath', () => {
  it('returns a closed loop spanning perihelion and aphelion', () => {
    const path = neoOrbitPath(GEOGRAPHOS, 120);
    expect(path).toHaveLength(121);
    const radii = path.map(mag);
    const min = Math.min(...radii);
    const max = Math.max(...radii);
    expect(min).toBeCloseTo(GEOGRAPHOS.a * (1 - GEOGRAPHOS.e), 2);
    expect(max).toBeCloseTo(GEOGRAPHOS.a * (1 + GEOGRAPHOS.e), 2);
  });
});

describe('neoMeanMotion', () => {
  it('is smaller for larger semi-major axes (Kepler’s third law)', () => {
    expect(neoMeanMotion(1)).toBeGreaterThan(neoMeanMotion(3));
  });
});

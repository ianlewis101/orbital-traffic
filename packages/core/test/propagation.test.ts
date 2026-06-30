import { describe, it, expect } from 'vitest';
import { createPropagator } from '../src/propagation.js';
import { toOrbitalObject } from '../src/tle.js';
import type { TleRecord } from '../src/types.js';

const ISS: TleRecord = {
  name: 'ISS (ZARYA)',
  l1: '1 25544U 98067A   26180.50883825  .00005660  00000+0  10902-3 0  9997',
  l2: '2 25544  51.6320 239.0980 0004278 246.9974 113.0563 15.49477794573665',
  cat: 'stations',
};

describe('Propagator (ISS)', () => {
  const object = toOrbitalObject(ISS)!;
  const prop = createPropagator(object)!;

  it('constructs from a valid TLE', () => {
    expect(prop).not.toBeNull();
    expect(prop.object.id).toBe('25544');
  });

  it('produces a physically plausible LEO state', () => {
    const state = prop.propagateAt(new Date('2026-06-29T12:00:00Z'));
    expect(state).not.toBeNull();
    // ISS altitude band ~370-460 km.
    expect(state!.altitudeKm).toBeGreaterThan(350);
    expect(state!.altitudeKm).toBeLessThan(480);
    // Orbital speed ~7.6-7.7 km/s.
    expect(state!.speedKmS).toBeGreaterThan(7.5);
    expect(state!.speedKmS).toBeLessThan(7.8);
    // Latitude is bounded by the inclination (51.6°).
    expect(Math.abs(state!.latitudeDeg)).toBeLessThanOrEqual(52);
    expect(state!.longitudeDeg).toBeGreaterThanOrEqual(-180);
    expect(state!.longitudeDeg).toBeLessThanOrEqual(180);
  });

  it('derives correct orbit metadata', () => {
    const meta = prop.orbitMeta();
    expect(meta.inclinationDeg).toBeCloseTo(51.63, 1);
    expect(meta.periodMin).toBeGreaterThan(90);
    expect(meta.periodMin).toBeLessThan(94);
    expect(meta.eccentricity).toBeLessThan(0.01);
    expect(meta.meanMotionRevPerDay).toBeCloseTo(15.49, 1);
  });
});

describe('createPropagator', () => {
  it('returns null for a malformed element set', () => {
    const bad = { id: 'x', name: 'bad', category: 'other', line1: 'nope', line2: 'nope' } as const;
    expect(createPropagator(bad)).toBeNull();
  });
});

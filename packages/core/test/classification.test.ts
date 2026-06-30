import { describe, it, expect } from 'vitest';
import {
  classify,
  correctStationCat,
  correctDebrisCat,
  correctOtherCat,
  isDebrisName,
  isDockedCrewVehicle,
} from '../src/classification.js';

describe('correctStationCat', () => {
  it('keeps real ISS modules as stations', () => {
    expect(correctStationCat('25544', 'ISS (ZARYA)', 'stations')).toBe('stations');
    expect(correctStationCat('36086', 'POISK', 'stations')).toBe('stations');
  });

  it('demotes cargo vehicles mis-tagged as stations', () => {
    expect(correctStationCat('68689', 'CYGNUS NG-24', 'stations')).toBe('other');
    expect(correctStationCat('68319', 'PROGRESS-MS 33', 'stations')).toBe('other');
  });

  it('keeps docked crew vehicles as stations', () => {
    expect(correctStationCat('99999', 'SOYUZ MS-27', 'stations')).toBe('stations');
    expect(correctStationCat('99998', 'CREW DRAGON', 'stations')).toBe('stations');
    expect(correctStationCat('99997', 'SHENZHOU-21', 'stations')).toBe('stations');
  });

  it('never touches non-station inputs', () => {
    expect(correctStationCat('12345', 'STARLINK-1', 'starlink')).toBe('starlink');
  });
});

describe('debris name backstop', () => {
  it('flags rocket bodies and fragments', () => {
    expect(isDebrisName('COSMOS 2251 DEB')).toBe(true);
    expect(isDebrisName('CZ-3B R/B')).toBe(true);
    expect(isDebrisName('ARIANE 5 R/B')).toBe(true);
    expect(isDebrisName('SZ-21 MODULE')).toBe(true);
  });

  it('does not flag ordinary payloads', () => {
    expect(isDebrisName('STARLINK-30000')).toBe(false);
    expect(isDebrisName('ISS (ZARYA)')).toBe(false);
    expect(isDebrisName('KNACKSAT-2')).toBe(false);
  });

  it('reclassifies regardless of the incoming category', () => {
    expect(correctDebrisCat('FENGYUN 1C DEB', 'other')).toBe('debris');
    expect(correctDebrisCat('STARLINK-30000', 'starlink')).toBe('starlink');
  });
});

describe('correctOtherCat rescue', () => {
  it('promotes well-known payloads stuck in "other"', () => {
    expect(correctOtherCat('27424', 'AQUA', 'other')).toBe('science');
    expect(correctOtherCat('43226', 'GOES 17', 'other')).toBe('science');
    expect(correctOtherCat('00000', 'NAVSTAR 80 (USA 309)', 'other')).toBe('navigation');
  });

  it('promotes ISS-deployed cubesats by id', () => {
    expect(correctOtherCat('67685', 'GXIBA-1', 'other')).toBe('science');
  });

  it('only ever acts on "other"', () => {
    expect(correctOtherCat('27424', 'AQUA', 'science')).toBe('science');
  });
});

describe('full pipeline', () => {
  it('classifies the ISS as a station', () => {
    expect(classify('25544', 'ISS (ZARYA)', 'stations')).toBe('stations');
  });

  it('demotes ISS-adjacent cargo to other, then debris when applicable', () => {
    expect(classify('68689', 'CYGNUS NG-24', 'stations')).toBe('other');
    expect(classify('00001', 'ATLAS 5 CENTAUR R/B', 'stations')).toBe('debris');
  });

  it('treats unknown raw categories as other', () => {
    expect(classify('55555', 'MYSTERY SAT', 'banana')).toBe('other');
  });

  it('recognises docked crew vehicles via the helper', () => {
    expect(isDockedCrewVehicle('SOYUZ MS-27')).toBe(true);
    expect(isDockedCrewVehicle('PROGRESS-MS 33')).toBe(false);
  });
});

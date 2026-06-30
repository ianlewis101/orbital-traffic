/**
 * Core domain types. These describe the data and computed state that flow
 * through every client (web, edge, native) — deliberately free of any
 * rendering- or framework-specific concepts.
 */

/** Stable orbit-class identifiers used across the whole system. */
export type CategoryId =
  | 'stations'
  | 'navigation'
  | 'geostationary'
  | 'starlink'
  | 'science'
  | 'communications'
  | 'debris'
  | 'other'
  | 'hazardous';

/** A two-line element set as it arrives from CelesTrak / the bundled snapshot. */
export interface TleRecord {
  /** Object name, e.g. "ISS (ZARYA)". */
  name: string;
  /** TLE line 1. */
  l1: string;
  /** TLE line 2. */
  l2: string;
  /** Pre-classified orbit class (may be refined by {@link classify}). */
  cat: CategoryId;
}

/** A tracked orbital object after parsing & classification. */
export interface OrbitalObject {
  /** NORAD catalog id (string form, e.g. "25544"). */
  id: string;
  name: string;
  category: CategoryId;
  line1: string;
  line2: string;
}

/** A 3D vector in kilometres (ECI frame unless stated otherwise). */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Geodetic sub-satellite point + derived scalar telemetry. */
export interface PropagatedState {
  /** Position in the Earth-Centred Inertial frame, kilometres. */
  eci: Vec3;
  /** Sub-satellite latitude, degrees (-90..90). */
  latitudeDeg: number;
  /** Sub-satellite longitude, degrees (-180..180). */
  longitudeDeg: number;
  /** Altitude above the ellipsoid, kilometres. */
  altitudeKm: number;
  /** Inertial speed, kilometres per second. */
  speedKmS: number;
}

/** Static orbit geometry derived once from a TLE (does not vary with time). */
export interface OrbitMeta {
  inclinationDeg: number;
  periodMin: number;
  eccentricity: number;
  apogeeKm: number;
  perigeeKm: number;
  meanMotionRevPerDay: number;
}

/** Classical (Keplerian) heliocentric elements for a near-Earth object. */
export interface NeoElements {
  name: string;
  /** Semi-major axis, astronomical units. */
  a: number;
  /** Eccentricity. */
  e: number;
  /** Inclination, degrees. */
  i: number;
  /** Longitude of ascending node Ω, degrees. */
  om: number;
  /** Argument of perihelion ω, degrees. */
  w: number;
  /** Mean anomaly at epoch, degrees. */
  ma: number;
  /** Epoch, Julian date. */
  epoch: number;
  /** Orbit family, e.g. "Apollo" / "Aten". */
  cls?: string;
  /** Estimated diameter, kilometres (string in source data). */
  diam?: string;
  /** Absolute magnitude H. */
  H?: string;
  /** Full designation, e.g. "1620 Geographos (1951 RA)". */
  fn?: string;
  /** Next close-approach date label. */
  nd?: string;
  /** Next close-approach lunar distances. */
  nl?: number;
}

/** Display metadata for an orbit class. */
export interface CategoryMeta {
  id: CategoryId;
  label: string;
  /** Accent colour as a 0xRRGGBB hex number (handy for Three.js). */
  color: number;
  /** Accent colour as a CSS string. */
  cssColor: string;
  /** Glyph used to distinguish the class for colour-blind accessibility. */
  glyph: string;
  /** Marker size hint (pixels). */
  px: number;
  /** Whether the class starts hidden in the UI. */
  hiddenByDefault: boolean;
}

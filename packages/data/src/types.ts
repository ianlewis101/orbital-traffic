import type { TleRecord, NeoElements } from '@orbital/core';

/** A long-form description for a catalogued object, keyed by NORAD id. */
export interface DescriptionEntry {
  /** Description prose. */
  d: string;
  /** Imagery manifest key, when the object has bespoke artwork. */
  img?: string;
  /** Operator / owner. */
  op?: string;
  /** Launch date label. */
  launch?: string;
  [extra: string]: unknown;
}

/** A long-form description for a near-Earth object, keyed by name. */
export interface NeoDescriptionEntry {
  des: string;
  diameter_km: number;
  class: string;
  description: string;
}

/** A "popular today" feature entry. */
export interface HotlistEntry {
  id: string;
  name: string;
  reason: string;
}

/** The ISS "today aboard" feed. */
export interface IssToday {
  updated: string | null;
  expedition?: string;
  activities: string[];
}

/** A single coastline ring as `[lon, lat]` pairs. */
export type CoastlineRing = [number, number][];

/** Maps imagery keys (e.g. "iss") to served paths (e.g. "imagery/iss.jpg"). */
export type ImageryManifest = Record<string, string>;

export type { TleRecord, NeoElements };

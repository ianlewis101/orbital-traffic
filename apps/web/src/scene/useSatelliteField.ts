import { useEffect, useState } from 'react';
import type { OrbitalObject } from '@orbital/core';
import { SatelliteField } from './SatelliteField';

/**
 * Owns the lifecycle of a {@link SatelliteField} for the current catalog.
 * Rebuilds (and tears down the old worker) whenever the catalog reference
 * changes — e.g. after a live-data refresh swaps the query cache.
 */
export function useSatelliteField(objects: OrbitalObject[] | undefined): SatelliteField | null {
  const [field, setField] = useState<SatelliteField | null>(null);

  useEffect(() => {
    if (!objects || objects.length === 0) return;
    const f = new SatelliteField(objects);
    setField(f);
    return () => {
      f.dispose();
      setField(null);
    };
  }, [objects]);

  return field;
}

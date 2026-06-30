import { useEffect, useMemo, useState } from 'react';
import {
  createPropagator,
  type NeoElements,
  type OrbitalObject,
  type OrbitMeta,
  type PropagatedState,
} from '@orbital/core';
import { simClock } from '../lib/simClock';
import { useStore } from '../store/useStore';
import { useCatalog, useNeos } from '../data/queries';

export type Selection =
  | { kind: 'sat'; object: OrbitalObject }
  | { kind: 'neo'; neo: NeoElements }
  | null;

/** Resolve the selected id (NORAD id, or `neo:<name>`) to a domain object. */
export function useSelection(): Selection {
  const id = useStore((s) => s.selectedId);
  const { data: catalog } = useCatalog();
  const { data: neos } = useNeos();

  return useMemo<Selection>(() => {
    if (!id) return null;
    if (id.startsWith('neo:')) {
      const name = id.slice(4);
      const neo = neos?.find((n) => n.name === name);
      return neo ? { kind: 'neo', neo } : null;
    }
    const object = catalog?.find((o) => o.id === id);
    return object ? { kind: 'sat', object } : null;
  }, [id, catalog, neos]);
}

export interface Telemetry {
  state: PropagatedState;
  meta: OrbitMeta;
}

/** Live-propagate a single object on a half-second cadence for the detail panel. */
export function useTelemetry(object: OrbitalObject | null): Telemetry | null {
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);

  useEffect(() => {
    if (!object) {
      setTelemetry(null);
      return;
    }
    const prop = createPropagator(object);
    if (!prop) {
      setTelemetry(null);
      return;
    }
    const meta = prop.orbitMeta();
    const tick = () => {
      const state = prop.propagateAt(simClock.date());
      if (state) setTelemetry({ state, meta });
    };
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [object]);

  return telemetry;
}

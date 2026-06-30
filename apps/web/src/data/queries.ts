import { useQuery, type QueryClient } from '@tanstack/react-query';
import { buildCatalog, type OrbitalObject, type TleRecord } from '@orbital/core';
import { dataClient } from './client';
import { WORKER_BASE } from '../config';

/** The classified, de-duplicated bundled snapshot. Never goes stale. */
export function useCatalog() {
  return useQuery({
    queryKey: ['catalog'],
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async ({ signal }): Promise<OrbitalObject[]> =>
      buildCatalog(await dataClient.loadCatalog(signal)),
  });
}

export function useNeos() {
  return useQuery({
    queryKey: ['neos'],
    staleTime: Infinity,
    queryFn: ({ signal }) => dataClient.loadNeos(signal),
  });
}

export function useCoastlines() {
  return useQuery({
    queryKey: ['coastlines'],
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: ({ signal }) => dataClient.loadCoastlines(signal),
  });
}

/** Heavy (≈340 KB) — only fetched once a detail panel first needs it. */
export function useDescriptions(enabled: boolean) {
  return useQuery({
    queryKey: ['descriptions'],
    staleTime: Infinity,
    enabled,
    queryFn: ({ signal }) => dataClient.loadDescriptions(signal),
  });
}

export function useNeoDescriptions(enabled: boolean) {
  return useQuery({
    queryKey: ['neo-descriptions'],
    staleTime: Infinity,
    enabled,
    queryFn: ({ signal }) => dataClient.loadNeoDescriptions(signal),
  });
}

export function useImageryManifest() {
  return useQuery({
    queryKey: ['imagery'],
    staleTime: Infinity,
    queryFn: ({ signal }) => dataClient.loadImageryManifest(signal),
  });
}

export function useHotlist() {
  return useQuery({
    queryKey: ['hotlist'],
    staleTime: Infinity,
    queryFn: ({ signal }) => dataClient.loadHotlist(signal),
  });
}

export function useIssToday() {
  return useQuery({
    queryKey: ['iss-today'],
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }) => {
      // Prefer the live edge feed; fall back to the bundled snapshot offline.
      try {
        const res = await fetch(`${WORKER_BASE}/today`, { signal });
        if (res.ok) return (await res.json()) as { updated: string | null; activities: string[] };
      } catch {
        /* offline — fall through */
      }
      return dataClient.loadIssToday(signal);
    },
  });
}

export interface CrewMember {
  name: string;
  craft: string;
}

export function useCrew(enabled: boolean) {
  return useQuery({
    queryKey: ['crew'],
    staleTime: 30 * 60_000,
    enabled,
    queryFn: async ({ signal }) => {
      const res = await fetch(`${WORKER_BASE}/crew`, { signal });
      if (!res.ok) throw new Error(`crew ${res.status}`);
      return (await res.json()) as { people: CrewMember[]; number: number };
    },
  });
}

/**
 * Pull a fresh catalog from the edge worker and swap it into the `['catalog']`
 * query, which transparently rebuilds the satellite field. Throws on failure
 * so the caller can keep showing the cached snapshot.
 */
export async function fetchLiveCatalog(queryClient: QueryClient): Promise<number> {
  const res = await fetch(`${WORKER_BASE}/tle`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`worker ${res.status}`);
  const records = (await res.json()) as TleRecord[];
  if (!Array.isArray(records) || records.length === 0) throw new Error('empty live catalog');
  const catalog = buildCatalog(records);
  queryClient.setQueryData(['catalog'], catalog);
  return catalog.length;
}

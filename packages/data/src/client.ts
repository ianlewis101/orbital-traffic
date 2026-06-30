import type { TleRecord, NeoElements } from '@orbital/core';
import type {
  DescriptionEntry,
  NeoDescriptionEntry,
  HotlistEntry,
  IssToday,
  CoastlineRing,
  ImageryManifest,
} from './types.js';

/** Thrown when a snapshot fails to load. */
export class DataError extends Error {
  constructor(
    public readonly resource: string,
    public readonly status?: number,
    cause?: unknown,
  ) {
    super(`Failed to load "${resource}"${status ? ` (HTTP ${status})` : ''}`);
    this.name = 'DataError';
    this.cause = cause;
  }
}

export interface DataClientOptions {
  /** Base URL the static assets are served from. Defaults to the site root. */
  baseUrl?: string;
  /** Inject a fetch implementation (tests, non-browser runtimes). */
  fetchImpl?: typeof fetch;
}

/**
 * A small, framework-agnostic client over the static data snapshots. Every
 * method fetches lazily so a consumer only pays for the data it actually
 * uses (e.g. descriptions are loaded the first time a detail panel opens).
 */
export interface DataClient {
  loadCatalog(signal?: AbortSignal): Promise<TleRecord[]>;
  loadNeos(signal?: AbortSignal): Promise<NeoElements[]>;
  loadDescriptions(signal?: AbortSignal): Promise<Record<string, DescriptionEntry>>;
  loadNeoDescriptions(signal?: AbortSignal): Promise<Record<string, NeoDescriptionEntry>>;
  loadHotlist(signal?: AbortSignal): Promise<HotlistEntry[]>;
  loadCoastlines(signal?: AbortSignal): Promise<CoastlineRing[]>;
  loadImageryManifest(signal?: AbortSignal): Promise<ImageryManifest>;
  loadIssToday(signal?: AbortSignal): Promise<IssToday>;
  /** Resolve an imagery key/path to a fully-qualified URL. */
  imageUrl(path: string): string;
}

export function createDataClient(options: DataClientOptions = {}): DataClient {
  const base = (options.baseUrl ?? '').replace(/\/$/, '');
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
    const url = `${base}/${path}`;
    let res: Response;
    try {
      res = await fetchImpl(url, { signal });
    } catch (cause) {
      throw new DataError(path, undefined, cause);
    }
    if (!res.ok) throw new DataError(path, res.status);
    return (await res.json()) as T;
  }

  return {
    loadCatalog: (s) => getJson<TleRecord[]>('data/catalog.json', s),
    loadNeos: (s) => getJson<NeoElements[]>('data/neos.json', s),
    loadDescriptions: (s) => getJson<Record<string, DescriptionEntry>>('data/descriptions.json', s),
    loadNeoDescriptions: (s) =>
      getJson<Record<string, NeoDescriptionEntry>>('data/neo-descriptions.json', s),
    loadHotlist: (s) => getJson<HotlistEntry[]>('data/hotlist.json', s),
    loadCoastlines: (s) => getJson<CoastlineRing[]>('data/coastlines.json', s),
    loadImageryManifest: (s) => getJson<ImageryManifest>('imagery/manifest.json', s),
    loadIssToday: (s) => getJson<IssToday>('data/iss-today.json', s),
    imageUrl: (path) => `${base}/${path}`,
  };
}

/** Live-data edge worker (CelesTrak / crew / ISS feed proxy + cache). */
export const WORKER_BASE =
  import.meta.env.VITE_WORKER_BASE ?? 'https://orbital-traffic.ianlewis101.workers.dev';

/** Base path the static snapshots are served from (handles sub-path hosting). */
export const DATA_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** How often (ms) the HUD clock samples the simulated time. */
export const CLOCK_SAMPLE_MS = 200;

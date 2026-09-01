/**
 * Run `fn` over `items` with at most `limit` calls in flight at once,
 * preserving input order in the returned array (unlike Promise.allSettled
 * over items.map(fn), which fires every call simultaneously).
 *
 * Exists because CelesTrak enforces a low per-IP concurrent-connection
 * ceiling: measured directly against the real endpoint, firing all 13 of
 * this project's GROUPS requests at once left 9 of the 13 stalled past a
 * 15s timeout, while each one issued alone resolved in 1-2s. Bounding
 * concurrency (both the Worker's buildTLERecords() and the web app's
 * CelesTrak-direct fallback in live.js use this) is what actually fixes the
 * category-vanishes-under-load failure a per-request timeout alone only
 * bounds the damage from.
 */
export async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

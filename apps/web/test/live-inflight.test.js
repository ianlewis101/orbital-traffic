import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchLive } from "../src/data/live.js";
import { state } from "../src/state.js";

/**
 * fetchLive()'s in-flight guard. ingest() yields to the browser between
 * batches, so two overlapping syncs would interleave their catalog writes
 * mid-ingest. The periodic timer, the visibility handler, and the boot kick
 * can all fire close together, so concurrent fetchLive() calls must coalesce
 * onto a single underlying sync — and the guard must reset once that sync
 * settles so a later refresh actually runs.
 */

// Minimal DOM element stub covering everything fetchLive()'s failure path
// touches (#legend-tot updates, toast()'s created nodes).
function stubEl() {
  return {
    style: {},
    textContent: "",
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {},
    appendChild() {},
    remove() {},
  };
}

let deferredResolvers;
beforeEach(() => {
  deferredResolvers = [];
  vi.stubGlobal("document", {
    querySelector: () => stubEl(),
    createElement: () => stubEl(),
    body: { appendChild() {} },
  });
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("setTimeout", (fn) => fn); // toast()'s cleanup timer — never fire
});
afterEach(() => {
  vi.unstubAllGlobals();
  state.syncFailed = false;
  state.srcTime = null;
});

describe("fetchLive in-flight guard", () => {
  it("coalesces concurrent calls into one underlying sync", async () => {
    // Hang every fetch so the sync stays in flight while we inspect it.
    fetch.mockImplementation(() => new Promise((resolve) => deferredResolvers.push(resolve)));

    const p1 = fetchLive();
    const p2 = fetchLive();

    // Same promise handed back, and only the first call's fetches were issued
    // (one /capsules + one /tle). Without the guard the second call would
    // have started a second sync and doubled this to four.
    expect(p2).toBe(p1);
    expect(fetch).toHaveBeenCalledTimes(2);
    const urls = fetch.mock.calls.map((c) => c[0]);
    expect(urls.some((u) => u.endsWith("/tle"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/capsules"))).toBe(true);

    // Drain the hung sync so the module-level guard resets and can't leak
    // into the sibling test regardless of run order.
    fetch.mockResolvedValue({ ok: false });
    deferredResolvers.forEach((resolve) => resolve({ ok: false }));
    await p1;
  });

  it("starts a fresh sync once the previous one has settled", async () => {
    // Every fetch fails fast: /tle is not ok -> fallback groups not ok ->
    // empty -> the failure branch completes runLiveSync() (a light path that
    // needs no render pipeline), letting the guard reset.
    fetch.mockResolvedValue({ ok: false, status: 503 });

    const p1 = fetchLive();
    expect(fetchLive()).toBe(p1); // still coalesced while running
    await p1;

    expect(state.syncFailed).toBe(true); // failure state left for the freshness line

    const callsAfterFirst = fetch.mock.calls.length;
    const p2 = fetchLive();
    expect(p2).not.toBe(p1); // guard reset -> a genuinely new sync
    await p2;
    expect(fetch.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });
});

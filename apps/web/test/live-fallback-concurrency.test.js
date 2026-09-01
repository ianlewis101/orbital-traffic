import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchLive } from "../src/data/live.js";
import { state } from "../src/state.js";
import { GROUPS } from "@orbital-traffic/catalog";

/**
 * fetchLive()'s CelesTrak-direct fallback (used when the Worker /tle fetch
 * fails) used to fire all of GROUPS simultaneously. CelesTrak enforces a low
 * per-IP concurrent-connection ceiling — measured directly against the real
 * endpoint, 13 simultaneous requests left 9 of 13 stalled past a 15s
 * timeout even though each resolves in 1-2s issued alone — so that design
 * was the real reason a category could vanish or undercount on a real
 * connection. This guards the fix: the fallback must bound its concurrency
 * rather than fire every group request at once.
 */

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

beforeEach(() => {
  state.sats.length = 0;
  state.byId.clear();
  state.selected = null;
  vi.stubGlobal("document", {
    querySelector: () => stubEl(),
    createElement: () => stubEl(),
    body: { appendChild() {} },
  });
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("setTimeout", (fn) => fn);
});
afterEach(() => {
  vi.unstubAllGlobals();
  state.syncFailed = false;
  state.srcTime = null;
  state.sats.length = 0;
  state.byId.clear();
});

describe("fetchLive fallback concurrency", () => {
  it("never has more than a few CelesTrak requests in flight at once", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    fetch.mockImplementation((url) => {
      const u = String(url);
      if (u.endsWith("/tle")) return Promise.resolve({ ok: false, status: 503 });
      if (u.includes("GROUP=")) {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        return Promise.resolve().then(() => {
          inFlight--;
          return { ok: true, text: async () => "" };
        });
      }
      return Promise.resolve({ ok: false }); // /capsules, /events
    });

    await fetchLive();

    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(
      fetch.mock.calls.filter((c) => String(c[0]).includes("GROUP=")).length
    ).toBeGreaterThanOrEqual(GROUPS.length);
  });
});

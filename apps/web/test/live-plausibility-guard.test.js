import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { state } from "../src/state.js";

// Real WebGL/canvas work has no meaning in this DOM-less test environment —
// mocked so the one test below that reaches a successful applyLive() can
// run without a real scene, same as live-sync-error-surface.test.js.
vi.mock("../src/scene/clouds.js", () => ({ buildClouds: vi.fn() }));

const { fetchLive, isPlausibleCatalog } = await import("../src/data/live.js");

/**
 * A live sync response that's technically "successful" (200 OK, valid JSON)
 * but drastically smaller than the catalog already on screen must never be
 * applied — that would replace a complete globe with a visibly broken one
 * (the "only 4,000 objects loading" report). isPlausibleCatalog() rejects a
 * result under half of what's currently loaded, on both the primary Worker
 * path and the CelesTrak-direct fallback; fetchLive() then leaves the
 * existing catalog untouched rather than regressing it.
 */

describe("isPlausibleCatalog", () => {
  beforeEach(() => {
    state.sats.length = 0;
  });

  it("rejects an empty result", () => {
    expect(isPlausibleCatalog([])).toBe(false);
  });

  it("rejects a result under half of what's currently loaded", () => {
    state.sats.length = 10000; // just needs a .length for the floor check
    expect(isPlausibleCatalog(new Array(4265))).toBe(false);
  });

  it("accepts a result at or above half of what's currently loaded", () => {
    state.sats.length = 10000;
    expect(isPlausibleCatalog(new Array(5000))).toBe(true);
    expect(isPlausibleCatalog(new Array(19132))).toBe(true);
  });

  it("still accepts a genuine recovery even when the current count is itself small", () => {
    // A prior bad sync leaving only a handful of objects on screen must not
    // permanently block a real fix from being applied.
    state.sats.length = 2;
    expect(isPlausibleCatalog(new Array(19132))).toBe(true);
  });
});

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

function seedSats(n) {
  for (let i = 0; i < n; i++) {
    const id = "9" + String(i).padStart(4, "0");
    const s = { id, name: "SEED " + id, cat: "other", rec: {}, alive: true };
    state.sats.push(s);
    state.byId.set(id, s);
  }
  state.cats.other = n;
}

describe("fetchLive applies the plausibility guard end to end", () => {
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
    state.lastSyncFailReason = null;
  });

  it("rejects an implausibly small /tle response and keeps the existing catalog", async () => {
    seedSats(10); // floor becomes 5

    fetch.mockImplementation((url) => {
      if (String(url).endsWith("/tle")) {
        // Technically a valid, successful response — just drastically small.
        return Promise.resolve({ ok: true, json: async () => [{ name: "X", l1: "", l2: "" }] });
      }
      // Fallback CelesTrak groups and best-effort /capsules, /events.
      return Promise.resolve({ ok: false });
    });

    await fetchLive();

    expect(state.sats).toHaveLength(10); // untouched, not regressed to 1
    expect(state.syncFailed).toBe(true); // honestly reported as failed, not silently accepted
  });

  /**
   * The ordinary "both paths failed" branch used to discard *why* each path
   * failed, leaving state.syncFailed's "cached elements · retrying" as the
   * only signal — no way to tell a Worker 5xx apart from a CelesTrak block
   * apart from an implausible-size response without a connected browser
   * console attached to the failing device. lastSyncFailReason now records
   * a concrete reason for this common case too (previously only the rarer
   * unexpected-throw path, lastSyncError, had one).
   */
  it("records a diagnosable reason when both the Worker and the CelesTrak fallback fail", async () => {
    seedSats(10);

    fetch.mockImplementation((url) => {
      if (String(url).endsWith("/tle")) {
        return Promise.resolve({ ok: false, status: 503 });
      }
      return Promise.resolve({ ok: false, status: 429 }); // every CelesTrak group fetch
    });

    await fetchLive();

    expect(state.lastSyncFailReason).toMatchObject({
      message: expect.stringMatching(/worker: .*503.*fallback: .*429/s),
    });
  });

  it("clears a stale lastSyncFailReason once a later sync actually succeeds", async () => {
    seedSats(1); // floor becomes 1, so a single-object response is plausible
    state.lastSyncFailReason = { message: "stale failure from a previous attempt", at: new Date(0) };

    fetch.mockImplementation((url) => {
      if (String(url).endsWith("/tle")) {
        return Promise.resolve({ ok: true, json: async () => [{ name: "X", l1: "", l2: "" }] });
      }
      return Promise.resolve({ ok: false });
    });

    await fetchLive();

    expect(state.lastSyncFailReason).toBeNull();
  });
});

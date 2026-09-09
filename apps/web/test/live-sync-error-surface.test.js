import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildClouds } from "../src/scene/clouds.js";

/**
 * An unexpected throw deep inside a successful-looking sync (not the
 * ordinary "both paths failed" case, which is already caught and handled
 * explicitly) used to escape runLiveSync() entirely as an unhandled
 * rejection: fetchLive() is invoked via a bare setTimeout with no
 * .catch(), so nothing would ever see it. The visible symptom was the
 * "loading" pulse left on #legend-tot forever, with no error, no toast,
 * and no way to tell it apart from a slow network from the outside — the
 * exact class of report ("it never finishes loading") this project spent
 * a long debugging session chasing without this safety net. buildClouds()
 * is mocked (real WebGL/canvas work has no meaning in this DOM-less test
 * environment) so its throw behavior is controlled per test instead of
 * incidental to what a bare document stub happens to support.
 */
vi.mock("../src/scene/clouds.js", () => ({ buildClouds: vi.fn() }));

const { fetchLive } = await import("../src/data/live.js");
const { state } = await import("../src/state.js");

function stubEl() {
  return {
    style: {},
    textContent: "",
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {},
    appendChild() {},
    remove() {},
    animate() {}, // flash()'s Web Animations API call — no-op in this DOM-less test
  };
}

function mockSuccessfulTleFetch() {
  fetch.mockImplementation((url) => {
    if (String(url).endsWith("/tle")) {
      return Promise.resolve({
        ok: true,
        json: async () => [{ name: "ISS (ZARYA)", l1: "", l2: "", cat: "stations" }],
      });
    }
    return Promise.resolve({ ok: false }); // /capsules, /events — best-effort
  });
}

describe("runLiveSync surfaces an unexpected throw instead of hanging silently", () => {
  beforeEach(() => {
    state.sats.length = 0;
    state.byId.clear();
    state.selected = null;
    state.lastSyncError = null;
    vi.stubGlobal("document", {
      querySelector: () => stubEl(),
      createElement: () => stubEl(),
      body: { appendChild() {} },
    });
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("setTimeout", (fn) => fn);
    buildClouds.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    state.syncFailed = false;
    state.srcTime = null;
    state.lastSyncError = null;
    state.sats.length = 0;
    state.byId.clear();
  });

  it("records the error to state.lastSyncError instead of an unhandled rejection", async () => {
    buildClouds.mockImplementation(() => {
      throw new Error("boom from buildClouds");
    });
    mockSuccessfulTleFetch();

    // Must not throw/reject out of fetchLive() itself.
    await expect(fetchLive()).resolves.toBeUndefined();

    expect(state.lastSyncError).toMatchObject({ message: expect.stringContaining("boom") });
  });

  it("also removes the .loading pulse class even though the sync threw", async () => {
    buildClouds.mockImplementation(() => {
      throw new Error("boom from buildClouds");
    });
    const totEl = stubEl();
    const removeSpy = vi.fn();
    totEl.classList.remove = removeSpy;
    vi.stubGlobal("document", {
      querySelector: (sel) => (sel === "#legend-tot" ? totEl : stubEl()),
      createElement: () => stubEl(),
      body: { appendChild() {} },
    });
    mockSuccessfulTleFetch();

    await fetchLive();

    expect(removeSpy).toHaveBeenCalledWith("loading");
  });

  it("clears a stale lastSyncError once a later sync actually succeeds", async () => {
    buildClouds.mockImplementation(() => {}); // this sync succeeds
    state.lastSyncError = { message: "stale failure from a previous attempt", at: new Date(0) };
    mockSuccessfulTleFetch();

    await fetchLive();

    expect(state.lastSyncError).toBeNull();
  });

  it("does not mistake an applyLive() throw for a fetch failure (no pointless fallback retry)", async () => {
    // Regression guard for the bug this safety net's first draft had: with
    // applyLive() called from inside the primary→fallback try/catch, a
    // throw from it (real bug) looked identical to "the fetch failed" and
    // silently triggered the CelesTrak-direct fallback instead of
    // surfacing as an error — masking the real problem and doing needless
    // extra network work.
    buildClouds.mockImplementation(() => {
      throw new Error("boom from buildClouds");
    });
    mockSuccessfulTleFetch();

    await fetchLive();

    const fallbackCalls = fetch.mock.calls.filter(([url]) => String(url).includes("GROUP="));
    expect(fallbackCalls).toHaveLength(0);
  });
});

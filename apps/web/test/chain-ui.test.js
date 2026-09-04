// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The "Tracked Chain" card: the whole-launch counterpart to the info card.
 * Covers what a chain selection does to the rest of the app (clears the
 * single-object selection, lights the overlay, frames the camera), the
 * card's rendered shape, drilling into one member, and the two ways a chain
 * ends — the user closing it, and a live sync in which it no longer exists.
 *
 * The scene modules are mocked: they build real three.js geometry and a
 * canvas point sprite, neither of which jsdom provides, and none of which is
 * what this card's behaviour depends on.
 */

const selectSpy = vi.fn();
const buildOverlaySpy = vi.fn();
const clearOverlaySpy = vi.fn();
const framePointSpy = vi.fn();

vi.mock("../src/ui/info.js", () => ({ select: (...a) => selectSpy(...a) }));
vi.mock("../src/scene/chain.js", () => ({
  buildChainOverlay: (...a) => buildOverlaySpy(...a),
  clearChainOverlay: (...a) => clearOverlaySpy(...a),
  chainCenterEci: () => ({ x: 1000, y: 2000, z: 3000 }),
}));
vi.mock("../src/scene/core.js", () => ({ framePoint: (...a) => framePointSpy(...a) }));

const MARKUP = `
  <div id="chain" class="plate">
    <div class="ph">
      <span class="ph-t">Tracked Chain</span>
      <span class="ph-r">
        <span class="ph-i" id="chain-count"></span>
        <button type="button" class="x" id="chain-x">✕</button>
      </span>
    </div>
    <div class="sheet-body">
      <div class="chain-top">
        <div class="cat-tag" id="chain-cat"><span class="d"></span><span></span></div>
        <div class="chain-nm" id="chain-nm">—</div>
        <div class="chain-sub" id="chain-sub"></div>
      </div>
      <div class="chain-lead" id="chain-lead"></div>
      <div class="chips" id="chain-chips"></div>
      <div class="grid" id="chain-grid"></div>
      <div id="chain-list"></div>
    </div>
  </div>
  <div id="overhead"></div><div id="settings"></div>
`;

function chainFixture(over = {}) {
  return {
    key: "starlink:26196",
    cat: "starlink",
    launch: "26196",
    launchLabel: "2026-196",
    ids: ["60001", "60002", "60003"],
    count: 3,
    leadId: "60003",
    leadName: "STARLINK-37694",
    arcDeg: 100.4,
    spacingDeg: 3.72,
    spacingKm: 432,
    spacingSeconds: 56,
    lengthKm: 11672,
    altitudeKm: 286,
    belowShellKm: 186,
    periodMin: 90.4,
    inclinationDeg: 53.2,
    ...over,
  };
}

// initChainCard() binds Escape on `document`, which survives resetModules()
// and the body being replaced — so a listener left by a previous test would
// still be holding the previous module instance's card and would close it out
// from under the one under test. Drop them as each fresh module is loaded.
let escapeHandlers = [];

async function load({ chains = [], missing = [], mobile = false } = {}) {
  // jsdom ships no matchMedia — stub the layout the card asks about.
  window.matchMedia = vi.fn().mockReturnValue({ matches: mobile });
  for (const h of escapeHandlers) document.removeEventListener("keydown", h);
  escapeHandlers = [];
  const addEventListener = document.addEventListener.bind(document);
  vi.spyOn(document, "addEventListener").mockImplementation((type, handler, opts) => {
    if (type === "keydown") escapeHandlers.push(handler);
    return addEventListener(type, handler, opts);
  });

  document.body.innerHTML = MARKUP;
  vi.resetModules();
  const { state } = await import("../src/state.js");
  state.byId = new Map();
  state.chains = chains;
  state.chain = null;
  state.simNow = Date.now();
  for (const c of chains) {
    for (const id of c.ids) {
      if (missing.includes(id)) continue;
      state.byId.set(id, { id, name: `STARLINK-${id}`, cat: "starlink" });
    }
  }
  const mod = await import("../src/ui/chain.js");
  return { mod, state };
}

beforeEach(() => {
  selectSpy.mockClear();
  buildOverlaySpy.mockClear();
  clearOverlaySpy.mockClear();
  framePointSpy.mockClear();
});

describe("selectChain", () => {
  it("lights the chain, frames it, and opens the card", async () => {
    const chain = chainFixture();
    const { mod, state } = await load({ chains: [chain] });
    mod.selectChain(chain);

    expect(state.chain).toBe(chain);
    // The single-object selection is torn down so one card and one highlight
    // are on screen at a time.
    expect(selectSpy).toHaveBeenCalledWith(null);
    expect(buildOverlaySpy).toHaveBeenCalledTimes(1);
    expect(buildOverlaySpy.mock.calls[0][0].map((s) => s.id)).toEqual(["60001", "60002", "60003"]);
    expect(buildOverlaySpy.mock.calls[0][1]).toBe("starlink");
    expect(framePointSpy).toHaveBeenCalledTimes(1);
    // Desktop: the card is a side panel, so the chain stays centred.
    expect(framePointSpy.mock.calls[0][2]).toBe(0);
    expect(document.getElementById("chain").classList.contains("show")).toBe(true);
  });

  it("aims the chain above the card on a phone, where the card is a bottom sheet", async () => {
    const chain = chainFixture();
    const { mod } = await load({ chains: [chain], mobile: true });
    mod.selectChain(chain);
    expect(framePointSpy.mock.calls[0][2]).toBeGreaterThan(0);
  });

  it("renders the launch, the live numbers and every member", async () => {
    const chain = chainFixture();
    const { mod } = await load({ chains: [chain] });
    mod.selectChain(chain);

    expect(document.getElementById("chain-nm").textContent).toBe("Starlink train · 2026-196");
    expect(document.getElementById("chain-sub").textContent).toContain("Launch 2026-196");
    expect(document.getElementById("chain-count").textContent).toBe("3");
    expect(document.getElementById("chain-lead").textContent).toContain("Starlink");

    const chips = document.getElementById("chain-chips").textContent;
    expect(chips).toContain("Still climbing");
    expect(chips).toContain("100° of one orbit");
    expect(chips).toContain("56 seconds apart");

    const grid = document.getElementById("chain-grid").textContent;
    expect(grid).toContain("Satellites");
    expect(grid).toContain("Chain length");

    const rows = document.querySelectorAll("#chain-list .ohrow");
    expect(rows).toHaveLength(3);
    // Listed front of the train first: the lead satellite (last in flight
    // order) is row 1, and the tail is last.
    expect(rows[0].textContent).toContain("60003");
    expect(rows[0].querySelector(".el").textContent).toBe("#1");
    expect(rows[2].textContent).toContain("60001");
    expect(rows[2].querySelector(".el").textContent).toBe("#3");
  });

  it("does nothing when too few of the chain's objects are still loaded", async () => {
    const chain = chainFixture();
    const { mod, state } = await load({ chains: [chain], missing: ["60002", "60003"] });
    mod.selectChain(chain);
    expect(state.chain).toBeNull();
    expect(buildOverlaySpy).not.toHaveBeenCalled();
    expect(document.getElementById("chain").classList.contains("show")).toBe(false);
  });

  it("closes the other sheets it shares the mobile slot with", async () => {
    const chain = chainFixture();
    const { mod } = await load({ chains: [chain] });
    document.getElementById("settings").classList.add("show");
    mod.selectChain(chain);
    expect(document.getElementById("settings").classList.contains("show")).toBe(false);
  });
});

describe("member rows", () => {
  it("open the object card and leave the chain lit", async () => {
    const chain = chainFixture();
    const { mod, state } = await load({ chains: [chain] });
    mod.selectChain(chain);
    selectSpy.mockClear();

    document.querySelectorAll("#chain-list .ohrow")[0].click();

    expect(selectSpy).toHaveBeenCalledTimes(1);
    expect(selectSpy.mock.calls[0][0].id).toBe("60003"); // the lead satellite
    // Card out of the way, chain still selected and still drawn.
    expect(document.getElementById("chain").classList.contains("show")).toBe(false);
    expect(state.chain).toBe(chain);
    expect(clearOverlaySpy).not.toHaveBeenCalled();
  });
});

describe("clearChain", () => {
  it("drops the card, the overlay and the selection", async () => {
    const chain = chainFixture();
    const { mod, state } = await load({ chains: [chain] });
    mod.selectChain(chain);
    mod.initChainCard();

    document.getElementById("chain-x").click();

    expect(state.chain).toBeNull();
    expect(clearOverlaySpy).toHaveBeenCalled();
    expect(document.getElementById("chain").classList.contains("show")).toBe(false);
  });

  it("is also wired to Escape while the card is open", async () => {
    const chain = chainFixture();
    const { mod, state } = await load({ chains: [chain] });
    mod.initChainCard();
    mod.selectChain(chain);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(state.chain).toBeNull();
  });
});

describe("resyncChain", () => {
  it("re-points a lit chain at its fresh snapshot after a sync", async () => {
    const chain = chainFixture();
    const { mod, state } = await load({ chains: [chain] });
    mod.selectChain(chain);
    buildOverlaySpy.mockClear();

    const fresh = chainFixture({ count: 3, arcDeg: 118.2, spacingSeconds: 61 });
    state.chains = [fresh];
    mod.resyncChain();

    expect(state.chain).toBe(fresh);
    expect(buildOverlaySpy).toHaveBeenCalledTimes(1);
    expect(document.getElementById("chain-chips").textContent).toContain("118° of one orbit");
  });

  it("drops a chain that has dispersed past detection", async () => {
    const chain = chainFixture();
    const { mod, state } = await load({ chains: [chain] });
    mod.selectChain(chain);

    state.chains = [];
    mod.resyncChain();

    expect(state.chain).toBeNull();
    expect(clearOverlaySpy).toHaveBeenCalled();
    expect(document.getElementById("chain").classList.contains("show")).toBe(false);
  });

  it("does nothing when no chain is selected", async () => {
    const { mod } = await load({ chains: [chainFixture()] });
    mod.resyncChain();
    expect(buildOverlaySpy).not.toHaveBeenCalled();
    expect(clearOverlaySpy).not.toHaveBeenCalled();
  });
});

describe("chain copy", () => {
  it("summarises a chain for the event feed", async () => {
    const { mod } = await load();
    const chain = chainFixture();
    expect(mod.chainSummary(chain)).toBe("Starlink train · 3 satellites");
    expect(mod.chainDetail(chain)).toBe("Still in a line 178 mi up · 56s apart");
  });

  it("falls back to a distance when no period is available", async () => {
    const { mod } = await load();
    expect(mod.chainDetail(chainFixture({ spacingSeconds: null }))).toContain("apart");
  });
});

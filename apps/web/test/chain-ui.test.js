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
    <div class="sheet-body" id="chain-body">
      <div class="chain-top">
        <div class="cat-tag" id="chain-cat"><span class="d"></span><span></span></div>
        <div class="chain-nm" id="chain-nm">—</div>
        <div class="chain-sub" id="chain-sub"></div>
      </div>
      <div class="chain-lead" id="chain-lead"></div>
      <div class="chips" id="chain-chips"></div>
      <div class="grid" id="chain-grid"></div>
      <div id="chain-list"></div>
      <div class="foot"><button type="button" id="chain-stop">✕ Stop tracking chain</button></div>
    </div>
  </div>
  <div id="overhead"></div><div id="settings"></div>
`;

const memberRows = () => [...document.querySelectorAll("#chain-list .ohrow")];
const moreButton = () => document.querySelector("#chain-list .oh-more");

function chainFixture(over = {}) {
  return {
    key: "starlink:26196",
    cat: "starlink",
    launch: "26196",
    launchLabel: "2026-196",
    // Six members, so the collapsed list (3 rows) and its expander are both
    // exercised by the ordinary fixture rather than a special case.
    ids: ["60001", "60002", "60003", "60004", "60005", "60006"],
    count: 6,
    leadId: "60006",
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
    expect(buildOverlaySpy.mock.calls[0][0].map((s) => s.id)).toEqual(chain.ids);
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

  it("renders the launch and the live numbers", async () => {
    const chain = chainFixture();
    const { mod } = await load({ chains: [chain] });
    mod.selectChain(chain);

    expect(document.getElementById("chain-nm").textContent).toBe("Starlink train · 2026-196");
    expect(document.getElementById("chain-sub").textContent).toContain("Launch 2026-196");
    expect(document.getElementById("chain-count").textContent).toBe("6");
    expect(document.getElementById("chain-lead").textContent).toContain("Starlink");

    const chips = document.getElementById("chain-chips").textContent;
    expect(chips).toContain("Still climbing");
    expect(chips).toContain("100° of one orbit");
    expect(chips).toContain("56 seconds apart");

    const grid = document.getElementById("chain-grid").textContent;
    expect(grid).toContain("Satellites");
    expect(grid).toContain("Chain length");
  });

  it("does nothing when too few of the chain's objects are still loaded", async () => {
    const chain = chainFixture();
    const { mod, state } = await load({
      chains: [chain],
      missing: ["60002", "60003", "60004", "60005", "60006"],
    });
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

describe("member list", () => {
  it("starts collapsed to three rows, front of the train first", async () => {
    const chain = chainFixture();
    const { mod } = await load({ chains: [chain] });
    mod.selectChain(chain);

    const rows = memberRows();
    expect(rows).toHaveLength(3);
    // The lead satellite (last in flight order) is row 1.
    expect(rows[0].textContent).toContain("60006");
    expect(rows[0].querySelector(".el").textContent).toBe("#1");
    expect(rows[2].textContent).toContain("60004");
    expect(moreButton().textContent).toBe("Show all 6 satellites");
  });

  it("expands to the whole string and back", async () => {
    const chain = chainFixture();
    const { mod } = await load({ chains: [chain] });
    mod.selectChain(chain);

    moreButton().click();
    expect(memberRows()).toHaveLength(6);
    expect(memberRows()[5].textContent).toContain("60001"); // the tail
    expect(moreButton().textContent).toBe("Show fewer");
    expect(moreButton().getAttribute("aria-expanded")).toBe("true");

    moreButton().click();
    expect(memberRows()).toHaveLength(3);
  });

  it("collapses again for the next chain selected", async () => {
    const chain = chainFixture();
    const { mod } = await load({ chains: [chain] });
    mod.selectChain(chain);
    moreButton().click();
    expect(memberRows()).toHaveLength(6);

    mod.selectChain(chain);
    expect(memberRows()).toHaveLength(3);
  });

  it("offers no expander when the whole chain already fits", async () => {
    const chain = chainFixture({ ids: ["60001", "60002", "60003"], count: 3 });
    const { mod } = await load({ chains: [chain] });
    mod.selectChain(chain);
    expect(memberRows()).toHaveLength(3);
    expect(moreButton()).toBeNull();
  });

  it("opens the object card on a row tap and leaves the chain lit", async () => {
    const chain = chainFixture();
    const { mod, state } = await load({ chains: [chain] });
    mod.selectChain(chain);
    selectSpy.mockClear();

    memberRows()[0].click();

    expect(selectSpy).toHaveBeenCalledTimes(1);
    expect(selectSpy.mock.calls[0][0].id).toBe("60006"); // the lead satellite
    // Card out of the way, chain still selected and still drawn.
    expect(document.getElementById("chain").classList.contains("show")).toBe(false);
    expect(state.chain).toBe(chain);
    expect(clearOverlaySpy).not.toHaveBeenCalled();
  });
});

describe("closing the card", () => {
  it("✕ puts the card away but leaves the chain lit", async () => {
    const chain = chainFixture();
    const { mod, state } = await load({ chains: [chain] });
    mod.initChainCard();
    mod.selectChain(chain);

    document.getElementById("chain-x").click();

    expect(document.getElementById("chain").classList.contains("show")).toBe(false);
    expect(state.chain).toBe(chain);
    expect(clearOverlaySpy).not.toHaveBeenCalled();
  });

  it("Escape does the same", async () => {
    const chain = chainFixture();
    const { mod, state } = await load({ chains: [chain] });
    mod.initChainCard();
    mod.selectChain(chain);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(document.getElementById("chain").classList.contains("show")).toBe(false);
    expect(state.chain).toBe(chain);
    expect(clearOverlaySpy).not.toHaveBeenCalled();
  });

  it("reopens from the same chain, collapsed and re-framed", async () => {
    const chain = chainFixture();
    const { mod } = await load({ chains: [chain] });
    mod.initChainCard();
    mod.selectChain(chain);
    document.getElementById("chain-x").click();

    mod.selectChain(chain);
    expect(document.getElementById("chain").classList.contains("show")).toBe(true);
    expect(memberRows()).toHaveLength(3);
    expect(framePointSpy).toHaveBeenCalledTimes(2);
  });
});

describe("clearChain", () => {
  it("is what the Stop tracking button does: card, overlay and selection all go", async () => {
    const chain = chainFixture();
    const { mod, state } = await load({ chains: [chain] });
    mod.initChainCard();
    mod.selectChain(chain);

    document.getElementById("chain-stop").click();

    expect(state.chain).toBeNull();
    expect(clearOverlaySpy).toHaveBeenCalled();
    expect(document.getElementById("chain").classList.contains("show")).toBe(false);
  });
});

/**
 * Swipe-down-to-dismiss (ui/sheet-swipe.js, shared with Settings): the same
 * gesture, but committing to closeChainCard() — the chain stays lit.
 */
describe("swipe-down (mobile)", () => {
  function touchEvent(type, y) {
    const ev = new Event(type, { bubbles: true, cancelable: true });
    ev.touches = [{ clientY: y }];
    return ev;
  }
  const touchEnd = () => new Event("touchend", { bubbles: true, cancelable: true });

  it("closes the card on a drag past the commit threshold, keeping the chain", async () => {
    const chain = chainFixture();
    const { mod, state } = await load({ chains: [chain], mobile: true });
    mod.initChainCard();
    mod.selectChain(chain);
    const panel = document.getElementById("chain");

    panel.dispatchEvent(touchEvent("touchstart", 100));
    panel.dispatchEvent(touchEvent("touchmove", 120)); // clears the 6px grab threshold
    panel.dispatchEvent(touchEvent("touchmove", 250)); // past the 80px commit line
    panel.dispatchEvent(touchEnd());

    await vi.waitFor(() => expect(panel.classList.contains("show")).toBe(false));
    expect(state.chain).toBe(chain);
    expect(clearOverlaySpy).not.toHaveBeenCalled();
  });

  it("snaps back open on a short, slow drag", async () => {
    const chain = chainFixture();
    const { mod } = await load({ chains: [chain], mobile: true });
    mod.initChainCard();
    mod.selectChain(chain);
    const panel = document.getElementById("chain");

    panel.dispatchEvent(touchEvent("touchstart", 100));
    panel.dispatchEvent(touchEvent("touchmove", 120));
    panel.dispatchEvent(touchEvent("touchmove", 130)); // 10px — under the line
    // A real gap so the release isn't read as a fast flick.
    await new Promise((r) => setTimeout(r, 100));
    panel.dispatchEvent(touchEnd());

    await new Promise((r) => setTimeout(r, 400));
    expect(panel.classList.contains("show")).toBe(true);
  });

  it("ignores touches on desktop layout", async () => {
    const chain = chainFixture();
    const { mod } = await load({ chains: [chain] });
    mod.initChainCard();
    mod.selectChain(chain);
    const panel = document.getElementById("chain");

    panel.dispatchEvent(touchEvent("touchstart", 100));
    panel.dispatchEvent(touchEvent("touchmove", 250));
    panel.dispatchEvent(touchEnd());

    await new Promise((r) => setTimeout(r, 400));
    expect(panel.classList.contains("show")).toBe(true);
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
    expect(mod.chainSummary(chain)).toBe("Starlink train · 6 satellites");
    expect(mod.chainDetail(chain)).toBe("Still in a line 178 mi up · 56s apart");
  });

  it("falls back to a distance when no period is available", async () => {
    const { mod } = await load();
    expect(mod.chainDetail(chainFixture({ spacingSeconds: null }))).toContain("apart");
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { state } from "../src/state.js";

/**
 * The "Center on Globe" button must only look engaged when it really is.
 *
 * REGRESSION GUARD. The handler used to flip state.tracking and repaint itself
 * before checking whether there was anything to aim at:
 *
 *     state.tracking = !state.tracking;
 *     $("#info-track").style.color = state.tracking ? "var(--signal)" : "";
 *     if (state.selected && state.selected._p) frameSelected();
 *
 * so a press that could not move the camera was indistinguishable from one
 * that did. Every NEO landed in that gap — they carried no `_p` at all (see
 * neo-position.test.js) — which is what "the button never works" looked like
 * from the outside: the control lit up and the globe stayed put.
 *
 * The lit state is a class, not an inline colour, for a second reason: the old
 * one painted the label var(--signal) (#7dd3fc), which is the right-hand stop
 * of the button's own background gradient, so "following" and "not following"
 * looked practically identical even when it did work.
 */

const frameSelectedSpy = vi.fn();
vi.mock("../src/scene/core.js", () => ({ frameSelected: (...a) => frameSelectedSpy(...a) }));
vi.mock("../src/ui/favorites.js", () => ({
  initSavedButtons: () => {},
  updateSavedButtons: () => {},
}));

function stubEl() {
  const classes = new Set();
  return {
    style: {},
    innerHTML: "",
    textContent: "",
    className: "",
    scrollTop: 0,
    addEventListener() {},
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    },
    querySelector: () => stubEl(),
  };
}

const ISS = {
  id: "25544",
  name: "ISS (ZARYA)",
  cat: "stations",
  _p: { x: 4100, y: 4600, z: 3000 },
};
const APOPHIS = { id: "neo_0", name: "Apophis", cat: "hazardous", _neo: {}, rec: null, _p: null };

let els, info, mobile;
const btn = () => els["#info-track"];
const press = () => btn().onclick();
const lit = () => btn().classList.contains("on");

beforeEach(async () => {
  els = {};
  mobile = false;
  vi.stubGlobal("document", { querySelector: (sel) => (els[sel] ||= stubEl()) });
  vi.stubGlobal("window", { matchMedia: () => ({ matches: mobile }) });
  frameSelectedSpy.mockClear();
  info = await import("../src/ui/info.js");
  info.initInfoCard();
  state.tracking = false;
  state.selected = null;
  state.cardCollapsed = false;
});
afterEach(() => {
  vi.unstubAllGlobals();
  state.selected = null;
  state.tracking = false;
});

describe("pressing Center on Globe", () => {
  it("lights up and aims the camera when the object has a position", () => {
    state.selected = ISS;
    press();
    expect(state.tracking).toBe(true);
    expect(lit()).toBe(true);
    expect(frameSelectedSpy).toHaveBeenCalledTimes(1);
  });

  it("stays dark and does nothing when the object has no position", () => {
    state.selected = APOPHIS;
    press();
    expect(state.tracking).toBe(false);
    expect(lit()).toBe(false);
    expect(frameSelectedSpy).not.toHaveBeenCalled();
  });

  it("stays dark with nothing selected at all", () => {
    state.selected = null;
    press();
    expect(state.tracking).toBe(false);
    expect(lit()).toBe(false);
    expect(frameSelectedSpy).not.toHaveBeenCalled();
  });

  it("turns follow mode off again on a second press", () => {
    state.selected = ISS;
    press();
    press();
    expect(state.tracking).toBe(false);
    expect(lit()).toBe(false);
  });

  it("can be turned back on after being switched off", () => {
    state.selected = ISS;
    press();
    press();
    press();
    expect(state.tracking).toBe(true);
    expect(lit()).toBe(true);
    expect(frameSelectedSpy).toHaveBeenCalledTimes(2);
  });

  it("does not strand the lit state when follow mode is already on and the object loses its position", () => {
    state.selected = ISS;
    press();
    state.selected = APOPHIS;
    press(); // the toggle-off half must still work
    expect(state.tracking).toBe(false);
    expect(lit()).toBe(false);
  });
});

describe("getting the bottom sheet out of the way on a phone", () => {
  // The mobile card is a bottom sheet up to 82vh tall, so dead centre of the
  // viewport — where frameSelected() puts the object — sits behind it. Before
  // this, pressing the button on a phone moved the camera somewhere the user
  // could not see, which is indistinguishable from it not working.
  const collapsed = () => state.cardCollapsed && els["#mini-card"].classList.contains("show");

  it("collapses the card to the mini-card on mobile", () => {
    mobile = true;
    state.selected = ISS;
    press();
    expect(state.tracking).toBe(true);
    expect(collapsed()).toBe(true);
  });

  it("leaves the card alone on desktop, where it is a side panel", () => {
    mobile = false;
    state.selected = ISS;
    press();
    expect(state.tracking).toBe(true);
    expect(state.cardCollapsed).toBe(false);
  });

  it("does not collapse on a press that cannot centre anything", () => {
    mobile = true;
    state.selected = APOPHIS;
    press();
    expect(state.cardCollapsed).toBe(false);
  });

  it("does not collapse when the press is switching follow mode off", () => {
    mobile = true;
    state.selected = ISS;
    state.tracking = true; // already following, e.g. carried over from another object
    press();
    expect(state.tracking).toBe(false);
    expect(state.cardCollapsed).toBe(false);
  });
});

describe("stopTracking", () => {
  it("clears the lit state, which is what a manual drag calls", () => {
    state.selected = ISS;
    press();
    expect(lit()).toBe(true);
    info.stopTracking(); // scene/picking.js on any drag, wheel or pinch
    expect(state.tracking).toBe(false);
    expect(lit()).toBe(false);
  });

  it("is safe to call before the card has been wired", () => {
    els = {};
    vi.stubGlobal("document", { querySelector: () => null });
    expect(() => info.stopTracking()).not.toThrow();
  });
});

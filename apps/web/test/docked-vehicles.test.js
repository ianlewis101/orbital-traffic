// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * "Docked vehicles" section on a station's detail card: multiple docked
 * crew/cargo vehicles share their host station's own rendered position (see
 * the "7 vs 2 capsules" finding in docs/audit-status.md), so this is the
 * only way to reach one specific docked vehicle directly rather than
 * whichever one happens to render on top on the globe. General across any
 * station key — exercised here against both ISS and CSS/Tiangong.
 */
import { select } from "../src/ui/info.js";

vi.mock("../src/ui/info.js", () => ({ select: vi.fn() }));

import { fetchAndRenderCrew } from "../src/ui/crew.js";
import { state } from "../src/state.js";
import { catColorHex } from "../src/config.js";

const ISS_HUB = { id: "25544", name: "ISS (ZARYA)", cat: "stations" };
const CSS_HUB = { id: "48274", name: "CSS (TIANHE)", cat: "stations" };

const DRAGON = { id: "67796", name: "CREW DRAGON 12", cat: "capsules" };
const PROGRESS = { id: "68319", name: "PROGRESS-MS 33", cat: "capsules" };
const TIANZHOU = { id: "69049", name: "TIANZHOU-10", cat: "capsules" };
const FREE_FLYING = { id: "70000", name: "FREE FLYER", cat: "capsules" };

let el;
beforeEach(() => {
  el = document.createElement("div");
  el.id = "info-crew";
  document.body.appendChild(el);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(JSON.stringify({ people: [], ok: true }))))
  );
  state.byId.clear();
  for (const s of [DRAGON, PROGRESS, TIANZHOU, FREE_FLYING]) state.byId.set(s.id, s);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  document.body.innerHTML = "";
  state.selected = null;
  state.capsulesData = null;
  state.byId.clear();
});

describe("docked vehicles section", () => {
  it("lists only vehicles docked at this station, collapsed by default", async () => {
    state.selected = ISS_HUB;
    state.capsulesData = {
      [DRAGON.id]: { phase: "docked", stationKey: "iss", name: DRAGON.name },
      [PROGRESS.id]: { phase: "docked", stationKey: "iss", name: PROGRESS.name },
      [TIANZHOU.id]: { phase: "docked", stationKey: "css", name: TIANZHOU.name }, // wrong station
      [FREE_FLYING.id]: { phase: "free-flying", stationKey: "iss", name: FREE_FLYING.name }, // not docked
    };

    await fetchAndRenderCrew(ISS_HUB);

    const hd = el.querySelector(".crew-docked-hd");
    expect(hd.textContent).toContain("Docked vehicles");
    expect(hd.textContent).toContain("2");
    expect(el.querySelectorAll(".crew-docked-row")).toHaveLength(2);
    expect([...el.querySelectorAll(".crew-docked-row .nm")].map((n) => n.textContent)).toEqual([
      "CREW DRAGON 12",
      "PROGRESS-MS 33",
    ]);
    expect(el.querySelector(".crew-docked-body").style.display).toBe("none");
    expect(hd.getAttribute("aria-expanded")).toBe("false");
  });

  it("generalizes to CSS/Tiangong with no station-specific branching", async () => {
    state.selected = CSS_HUB;
    state.capsulesData = {
      [TIANZHOU.id]: { phase: "docked", stationKey: "css", name: TIANZHOU.name },
      [DRAGON.id]: { phase: "docked", stationKey: "iss", name: DRAGON.name }, // wrong station
    };

    await fetchAndRenderCrew(CSS_HUB);

    expect(el.querySelectorAll(".crew-docked-row")).toHaveLength(1);
    expect(el.querySelector(".crew-docked-row .nm").textContent).toBe("TIANZHOU-10");
  });

  it("colors each row's dot from the vehicle's own category", async () => {
    state.selected = ISS_HUB;
    state.capsulesData = {
      [DRAGON.id]: { phase: "docked", stationKey: "iss", name: DRAGON.name },
    };

    await fetchAndRenderCrew(ISS_HUB);

    const sw = el.querySelector(".crew-docked-row .sw");
    const hex = catColorHex("capsules");
    expect(sw.style.background).toBe(hexToRgb(hex));
  });

  it("skips a capsule-status entry with no matching live object yet", async () => {
    state.selected = ISS_HUB;
    state.capsulesData = {
      [DRAGON.id]: { phase: "docked", stationKey: "iss", name: DRAGON.name },
      99999: { phase: "docked", stationKey: "iss", name: "NOT YET INGESTED" },
    };

    await fetchAndRenderCrew(ISS_HUB);

    expect(el.querySelectorAll(".crew-docked-row")).toHaveLength(1);
  });

  it("renders no block at all when nothing is docked here", async () => {
    state.selected = ISS_HUB;
    state.capsulesData = {};

    await fetchAndRenderCrew(ISS_HUB);

    expect(el.querySelector(".crew-docked")).toBeNull();
  });

  it("renders no block when capsule status hasn't loaded yet", async () => {
    state.selected = ISS_HUB;
    state.capsulesData = null;

    await fetchAndRenderCrew(ISS_HUB);

    expect(el.querySelector(".crew-docked")).toBeNull();
  });

  it("expands on header click and collapses again on a second click", async () => {
    state.selected = ISS_HUB;
    state.capsulesData = {
      [DRAGON.id]: { phase: "docked", stationKey: "iss", name: DRAGON.name },
    };
    await fetchAndRenderCrew(ISS_HUB);
    const hd = el.querySelector(".crew-docked-hd");
    const body = el.querySelector(".crew-docked-body");

    hd.onclick();
    expect(body.style.display).toBe("block");
    expect(hd.getAttribute("aria-expanded")).toBe("true");
    expect(hd.querySelector(".crew-docked-chev").textContent).toBe("▾");

    hd.onclick();
    expect(body.style.display).toBe("none");
    expect(hd.getAttribute("aria-expanded")).toBe("false");
    expect(hd.querySelector(".crew-docked-chev").textContent).toBe("▸");
  });

  it("selects the tapped vehicle directly via the shared select() pattern", async () => {
    state.selected = ISS_HUB;
    state.capsulesData = {
      [DRAGON.id]: { phase: "docked", stationKey: "iss", name: DRAGON.name },
      [PROGRESS.id]: { phase: "docked", stationKey: "iss", name: PROGRESS.name },
    };
    await fetchAndRenderCrew(ISS_HUB);

    const rows = el.querySelectorAll(".crew-docked-row");
    rows[1].onclick();

    expect(select).toHaveBeenCalledWith(PROGRESS);
  });
});

/** jsdom normalizes inline hex colors on style.background to rgb(...). */
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

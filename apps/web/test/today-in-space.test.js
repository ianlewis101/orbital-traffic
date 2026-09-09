// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * "Today in Space" HUD card: a collapsed-by-default event feed reusing
 * .today-row markup, fed by the Worker's /events route. Covers the render
 * shape per event type, the empty state, the static (count-independent)
 * header title, and tap-to-select (including the "inert" case where an
 * event has no live object to select — e.g. a decayed object already
 * pruned locally).
 */

const selectSpy = vi.fn();
const selectChainSpy = vi.fn();
vi.mock("../src/ui/info.js", () => ({
  select: (...a) => selectSpy(...a),
}));
// The chain card pulls in the scene modules (three.js geometry, a canvas
// point sprite); the feed only needs its copy helpers and its opener.
vi.mock("../src/ui/chain.js", () => ({
  chainSummary: (c) => `Starlink train · ${c.count} satellites`,
  chainDetail: (c) => `Still in a line ${c.altitudeKm} km up`,
  selectChain: (...a) => selectChainSpy(...a),
}));

const MARKUP = `
  <div id="events" class="plate">
    <div class="ph" id="events-ph"><span class="ph-t" id="events-title">Today in Space</span><span class="ph-i" id="events-toggle">▸</span></div>
    <div class="body" id="events-list"></div>
  </div>
`;

async function load({ chains = [] } = {}) {
  document.body.innerHTML = MARKUP;
  vi.resetModules();
  const { state } = await import("../src/state.js");
  state.byId = new Map();
  state.chains = chains;
  const mod = await import("../src/ui/today-in-space.js");
  return { mod, state };
}

function chainFixture(over = {}) {
  return {
    key: "starlink:26196",
    cat: "starlink",
    launch: "26196",
    launchLabel: "2026-196",
    ids: ["60001", "60002"],
    count: 28,
    altitudeKm: 286,
    ...over,
  };
}

beforeEach(() => {
  selectSpy.mockClear();
  selectChainSpy.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("refreshEvents / renderEvents", () => {
  it("shows the empty state when there are zero events", async () => {
    const { mod } = await load();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ events: [] }))));
    await mod.refreshEvents();
    const list = document.getElementById("events-list");
    expect(list.textContent).toContain("No major events");
    expect(document.getElementById("events-title").textContent).toBe("Today in Space");
  });

  it("renders a docking event with station arrow copy and leaves the header title unchanged", async () => {
    const { mod, state } = await load();
    const dragon = { id: "80001", name: "CREW DRAGON 12" };
    state.byId.set("80001", dragon);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            events: [
              {
                type: "docking",
                subtype: "docked",
                id: "80001",
                name: "CREW DRAGON 12",
                stationKey: "iss",
                at: new Date().toISOString(),
              },
            ],
          })
        )
      )
    );
    await mod.refreshEvents();
    const list = document.getElementById("events-list");
    expect(list.textContent).toContain("Docked · CREW DRAGON 12 → ISS");
    expect(document.getElementById("events-title").textContent).toBe("Today in Space");

    const row = list.querySelector(".event-row");
    expect(row.classList.contains("inert")).toBe(false);
    row.click();
    expect(selectSpy).toHaveBeenCalledWith(dragon);
  });

  it("renders a grouped launch event and a single-object launch differently", async () => {
    const { mod } = await load();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            events: [
              {
                type: "launch",
                ids: ["60001", "60002"],
                count: 2,
                name: "STARLINK-31001",
                cat: "starlink",
                at: new Date().toISOString(),
              },
              { type: "launch", ids: ["70000"], count: 1, name: "LINK", cat: "science", at: new Date().toISOString() },
            ],
          })
        )
      )
    );
    await mod.refreshEvents();
    const text = document.getElementById("events-list").textContent;
    expect(text).toContain("Launched · 2 new Starlink satellites");
    expect(text).toContain("Launched · LINK");
  });

  it("renders a reentry event as inert (no selectable object) when the object is already gone locally", async () => {
    const { mod } = await load();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            events: [{ type: "reentry", id: "70001", name: "COSMOS 2589", cat: "debris", at: new Date().toISOString() }],
          })
        )
      )
    );
    await mod.refreshEvents();
    const list = document.getElementById("events-list");
    expect(list.textContent).toContain("Deorbited · COSMOS 2589");
    const row = list.querySelector(".event-row");
    expect(row.classList.contains("inert")).toBe(true);
    row.click();
    expect(selectSpy).not.toHaveBeenCalled();
  });

  it("renders a crew-change event, selecting the station on tap", async () => {
    const { mod, state } = await load();
    const iss = { id: "25544", name: "ISS (ZARYA)" };
    state.byId.set("25544", iss);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            events: [
              { type: "crew", id: 5, name: "Anil Menon", craft: "ISS", direction: "arrived", at: new Date().toISOString() },
            ],
          })
        )
      )
    );
    await mod.refreshEvents();
    const list = document.getElementById("events-list");
    expect(list.textContent).toContain("Crew change · Anil Menon arrived aboard ISS");
    list.querySelector(".event-row").click();
    expect(selectSpy).toHaveBeenCalledWith(iss);
  });

  it("escapes untrusted name/craft text in rendered rows", async () => {
    const { mod } = await load();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            events: [
              {
                type: "crew",
                id: 9,
                name: '<img src=x onerror=alert(1)>',
                craft: "ISS",
                direction: "arrived",
                at: new Date().toISOString(),
              },
            ],
          })
        )
      )
    );
    await mod.refreshEvents();
    const list = document.getElementById("events-list");
    expect(list.innerHTML).not.toContain("<img");
    expect(list.innerHTML).toContain("&lt;img");
  });

  it("adds a row for a chain no launch event covers, and opens the whole chain on tap", async () => {
    const chain = chainFixture();
    const { mod } = await load({ chains: [chain] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ events: [] }))));
    await mod.refreshEvents();

    const rows = document.querySelectorAll("#events-list .event-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("Starlink train · 28 satellites");
    expect(rows[0].textContent).toContain("Still in a line 286 km up");
    expect(rows[0].classList.contains("inert")).toBe(false);

    rows[0].click();
    expect(selectChainSpy).toHaveBeenCalledWith(chain);
    expect(selectSpy).not.toHaveBeenCalled();
  });

  it("opens the whole chain from the launch event that delivered it, without a duplicate row", async () => {
    const chain = chainFixture();
    const { mod } = await load({ chains: [chain] });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            events: [
              {
                type: "launch",
                // One shared id is enough — the batch and the chain are the
                // same launch, minus whatever has already dispersed.
                ids: ["60002", "60003"],
                count: 28,
                name: "STARLINK-37828",
                cat: "starlink",
                at: new Date().toISOString(),
              },
            ],
          })
        )
      )
    );
    await mod.refreshEvents();

    const rows = document.querySelectorAll("#events-list .event-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("Launched · 28 new Starlink satellites");
    rows[0].click();
    expect(selectChainSpy).toHaveBeenCalledWith(chain);
  });

  it("caps chain rows so a run of trains can't push the real events out of the card", async () => {
    const chains = [1, 2, 3, 4, 5].map((n) =>
      chainFixture({ key: `starlink:2619${n}`, ids: [`6000${n}`], count: 20 + n })
    );
    const { mod } = await load({ chains });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ events: [] }))));
    await mod.refreshEvents();

    const rows = [...document.querySelectorAll("#events-list .event-row")];
    expect(rows).toHaveLength(3);
    // Kept in detectChains()' own order — tightest (most train-like) first.
    expect(rows[0].textContent).toContain("21 satellites");
    expect(rows[2].textContent).toContain("23 satellites");
  });

  it("still selects a single object for a launch that has no chain", async () => {
    const { mod, state } = await load({ chains: [chainFixture({ ids: ["70001"] })] });
    const sat = { id: "60001", name: "STARLINK-37828" };
    state.byId.set("60001", sat);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            events: [
              {
                type: "launch",
                ids: ["60001", "60002"],
                count: 2,
                name: "STARLINK-37828",
                cat: "starlink",
                at: new Date().toISOString(),
              },
            ],
          })
        )
      )
    );
    await mod.refreshEvents();
    // The unrelated chain still gets its own row above this one.
    const rows = [...document.querySelectorAll(".event-row")];
    const launchRow = rows.find((r) => r.textContent.includes("Launched"));
    launchRow.click();
    expect(selectSpy).toHaveBeenCalledWith(sat);
    expect(selectChainSpy).not.toHaveBeenCalled();
  });

  it("leaves the header/body unchanged on a failed fetch (best-effort)", async () => {
    const { mod } = await load();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await mod.refreshEvents();
    expect(document.getElementById("events-title").textContent).toBe("Today in Space");
    expect(document.getElementById("events-list").innerHTML).toBe("");
  });
});

describe("initEventsToggle", () => {
  it("starts collapsed and toggles open/closed on header click", async () => {
    const { mod } = await load();
    mod.initEventsToggle();
    const list = document.getElementById("events-list");
    const toggle = document.getElementById("events-toggle");
    expect(list.style.display).toBe("none");
    expect(toggle.textContent).toBe("▸");

    document.getElementById("events-ph").click();
    expect(list.style.display).toBe("");
    expect(toggle.textContent).toBe("▾");

    document.getElementById("events-ph").click();
    expect(list.style.display).toBe("none");
    expect(toggle.textContent).toBe("▸");
  });
});

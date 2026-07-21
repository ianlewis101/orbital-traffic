import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker, { buildTLERecords, TLE_TTL, SATCAT_TTL } from "../src/index.js";
import { GROUPS } from "@orbital-traffic/catalog";

const ISS_TLE = `ISS (ZARYA)
1 25544U 98067A   26181.86323116  .00005885  00000+0  11296-3 0  9995
2 25544  51.6310 232.3923 0004309 252.2804 107.7714 15.50129012345678`;

const DEBRIS_TLE = `CZ-4B R/B
1 43012U 17072B   26181.50000000  .00000100  00000+0  10000-3 0  9990
2 43012  98.7000 100.0000 0001000 100.0000 260.0000 14.20000000123456`;

function textResponse(body) {
  return new Response(body, { status: 200 });
}

// Real LL2 shape, trimmed to only what buildCrew() reads (see the curl
// checks noted in the PR description for the actual field names).
function stationResponse(names) {
  return new Response(
    JSON.stringify({
      active_expeditions: [
        { crew: names.map((name) => ({ role: { role: "Flight Engineer" }, astronaut: { name } })) },
      ],
    })
  );
}

function astronautCountResponse(count) {
  return new Response(JSON.stringify({ count }));
}

function isoDateString(s) {
  return typeof s === "string" && new Date(s).toISOString() === s;
}

const ctx = { waitUntil: () => {} };

describe("worker routes", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("answers OPTIONS with CORS headers", async () => {
    const res = await worker.fetch(new Request("https://x/tle", { method: "OPTIONS" }), {}, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });

  it("404s unknown paths", async () => {
    const res = await worker.fetch(new Request("https://x/nope"), {}, ctx);
    expect(res.status).toBe(404);
  });

  it("serves merged, classified TLE records on /tle", async () => {
    fetch.mockImplementation((url) => {
      if (url.includes("GROUP=stations")) return Promise.resolve(textResponse(ISS_TLE));
      if (url.includes("GROUP=active"))
        return Promise.resolve(textResponse(ISS_TLE + "\n" + DEBRIS_TLE));
      return Promise.resolve(textResponse(""));
    });
    const res = await worker.fetch(new Request("https://x/tle"), {}, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Cache-Control")).toBe(`public, max-age=${TLE_TTL}`);
    const recs = await res.json();
    expect(recs).toHaveLength(2);
    const iss = recs.find((r) => r.name === "ISS (ZARYA)");
    // stations group wins over the "active" duplicate
    expect(iss.cat).toBe("stations");
    // rocket body from "active" is reclassified by the debris backstop
    expect(recs.find((r) => r.name === "CZ-4B R/B").cat).toBe("debris");
  });

  it("merges both stations' real-shaped crew on /crew when the supplementary count matches", async () => {
    fetch.mockImplementation((url) => {
      if (url.includes("/spacestation/4/")) return Promise.resolve(stationResponse(["Alice", "Bob"]));
      if (url.includes("/spacestation/18/")) return Promise.resolve(stationResponse(["Carol"]));
      if (url.includes("/astronaut/")) return Promise.resolve(astronautCountResponse(3));
      throw new Error("unexpected URL " + url);
    });
    const res = await worker.fetch(new Request("https://x/crew"), {}, ctx);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.number).toBe(3);
    expect(body.people).toEqual(
      expect.arrayContaining([
        { name: "Alice", craft: "ISS" },
        { name: "Bob", craft: "ISS" },
        { name: "Carol", craft: "Tiangong" },
      ])
    );
    expect(body.possiblyIncomplete).toBe(false);
    expect(isoDateString(body.fetchedAt)).toBe(true);
  });

  it("stays ok:true with the working station's people when only one station's fetch fails", async () => {
    fetch.mockImplementation((url) => {
      if (url.includes("/spacestation/4/")) return Promise.resolve(stationResponse(["Alice"]));
      if (url.includes("/spacestation/18/")) return Promise.reject(new Error("down"));
      if (url.includes("/astronaut/")) return Promise.resolve(astronautCountResponse(1));
      throw new Error("unexpected URL " + url);
    });
    const res = await worker.fetch(new Request("https://x/crew"), {}, ctx);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.people).toEqual([{ name: "Alice", craft: "ISS" }]);
    expect(body.number).toBe(1);
    expect(isoDateString(body.fetchedAt)).toBe(true);
  });

  it("degrades to an empty ok:false roster when both stations fail", async () => {
    fetch.mockImplementation((url) => {
      if (url.includes("/spacestation/")) return Promise.reject(new Error("down"));
      throw new Error("unexpected URL " + url);
    });
    const res = await worker.fetch(new Request("https://x/crew"), {}, ctx);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.people).toEqual([]);
    expect(body.number).toBe(0);
    // Skipped (not just falsy) when ok is false — no /astronaut/ cross-check
    // is meaningful if we couldn't place anyone in the first place.
    expect(body.possiblyIncomplete).toBe(false);
    expect(isoDateString(body.fetchedAt)).toBe(true);
  });

  it("flags possiblyIncomplete when LL2's in-space count exceeds what was placed", async () => {
    fetch.mockImplementation((url) => {
      if (url.includes("/spacestation/4/")) return Promise.resolve(stationResponse(["Alice"]));
      if (url.includes("/spacestation/18/")) return Promise.resolve(stationResponse([]));
      // A just-docked crew LL2 hasn't reflected at the station level yet.
      if (url.includes("/astronaut/")) return Promise.resolve(astronautCountResponse(4));
      throw new Error("unexpected URL " + url);
    });
    const res = await worker.fetch(new Request("https://x/crew"), {}, ctx);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.possiblyIncomplete).toBe(true);
    expect(isoDateString(body.fetchedAt)).toBe(true);
  });

  it("treats a failed supplementary fetch as possiblyIncomplete:false, not thrown or undefined", async () => {
    fetch.mockImplementation((url) => {
      if (url.includes("/spacestation/4/")) return Promise.resolve(stationResponse(["Alice"]));
      if (url.includes("/spacestation/18/")) return Promise.resolve(stationResponse([]));
      if (url.includes("/astronaut/")) return Promise.reject(new Error("down"));
      throw new Error("unexpected URL " + url);
    });
    const res = await worker.fetch(new Request("https://x/crew"), {}, ctx);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.possiblyIncomplete).toBe(false);
    expect(isoDateString(body.fetchedAt)).toBe(true);
  });

  it("serves /today and degrades to an empty feed", async () => {
    fetch.mockResolvedValue(new Response(JSON.stringify({ updated: "2026-07-01", activities: ["x"] })));
    let res = await worker.fetch(new Request("https://x/today"), {}, ctx);
    expect((await res.json()).activities).toEqual(["x"]);

    fetch.mockResolvedValue(new Response("err", { status: 500 }));
    res = await worker.fetch(new Request("https://x/today"), {}, ctx);
    expect(await res.json()).toEqual({ updated: null, activities: [] });
  });

  it("serves /capsules and degrades to an empty snapshot", async () => {
    const body = { updated: "2026-07-03T00:00:00Z", capsules: { "60001": { phase: "docked" } }, events: [] };
    fetch.mockResolvedValue(new Response(JSON.stringify(body)));
    let res = await worker.fetch(new Request("https://x/capsules"), {}, ctx);
    expect((await res.json()).capsules["60001"].phase).toBe("docked");

    fetch.mockResolvedValue(new Response("err", { status: 500 }));
    res = await worker.fetch(new Request("https://x/capsules"), {}, ctx);
    expect(await res.json()).toEqual({ updated: null, capsules: {}, events: [] });
  });

  it("400s /satcat with no id", async () => {
    const res = await worker.fetch(new Request("https://x/satcat"), {}, ctx);
    expect(res.status).toBe(400);
  });

  it("serves a single SATCAT record on /satcat and degrades to null", async () => {
    fetch.mockResolvedValue(
      new Response(
        JSON.stringify([
          { NORAD_CAT_ID: "25544", LAUNCH_DATE: "1998-11-20", OBJECT_TYPE: "PAYLOAD", OWNER: "ISS" },
        ])
      )
    );
    let res = await worker.fetch(new Request("https://x/satcat?id=25544"), {}, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(`public, max-age=${SATCAT_TTL}`);
    expect(await res.json()).toEqual({
      NORAD_CAT_ID: "25544",
      LAUNCH_DATE: "1998-11-20",
      OBJECT_TYPE: "PAYLOAD",
      OWNER: "ISS",
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("CATNR=25544"),
      expect.any(Object)
    );

    // Unknown CATNR — CelesTrak returns an empty array
    fetch.mockResolvedValue(new Response("[]"));
    res = await worker.fetch(new Request("https://x/satcat?id=99999999"), {}, ctx);
    expect(await res.json()).toBeNull();

    // Upstream failure degrades gracefully instead of throwing
    fetch.mockResolvedValue(new Response("err", { status: 500 }));
    res = await worker.fetch(new Request("https://x/satcat?id=25544"), {}, ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });
});

describe("buildTLERecords", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches every configured CelesTrak group", async () => {
    fetch.mockResolvedValue(textResponse(""));
    await buildTLERecords();
    expect(fetch).toHaveBeenCalledTimes(GROUPS.length);
  });

  it("survives individual group failures", async () => {
    fetch.mockImplementation((url) => {
      if (url.includes("GROUP=stations")) return Promise.resolve(textResponse(ISS_TLE));
      return Promise.reject(new Error("celestrak flaky"));
    });
    const recs = await buildTLERecords();
    expect(recs).toHaveLength(1);
    expect(recs[0].cat).toBe("stations");
  });
});

describe("/passes route", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("400s on missing or invalid lat/lng", async () => {
    let res = await worker.fetch(new Request("https://x/passes"), {}, ctx);
    expect(res.status).toBe(400);
    res = await worker.fetch(new Request("https://x/passes?lat=999&lng=0"), {}, ctx);
    expect(res.status).toBe(400);
  });

  it("returns predicted ISS passes for valid coordinates", async () => {
    fetch.mockResolvedValue(textResponse(ISS_TLE));
    const res = await worker.fetch(new Request("https://x/passes?lat=40.7128&lng=-74.006"), {}, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.passes)).toBe(true);
    if (body.passes.length) {
      expect(body.passes[0]).toHaveProperty("riseAt");
      expect(body.passes[0]).toHaveProperty("maxElevationDeg");
    }
  });

  it("reports iss_tle_unavailable instead of throwing when CelesTrak is down", async () => {
    fetch.mockResolvedValue(new Response("err", { status: 500 }));
    const res = await worker.fetch(new Request("https://x/passes?lat=0&lng=0"), {}, ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).error).toBe("iss_tle_unavailable");
  });
});

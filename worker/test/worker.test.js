import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker, {
  buildTLERecords,
  getTLERecords,
  refreshTLECache,
  TLE_TTL,
  SATCAT_TTL,
  SATCAT_FAIL_TTL,
  CREW_TTL,
  CREW_FAIL_TTL,
  ASTRONAUT_TTL,
  ASTRONAUT_FAIL_TTL,
} from "../src/index.js";
import { GROUPS } from "@orbital-traffic/catalog";

// CelesTrak GP rows, in the CSV shape the Worker now fetches. These are the
// same two elsets these fixtures always described — the TLE text feed can't
// represent catalog numbers above 99999, so the Worker reads CSV and
// synthesizes the TLE lines itself (see parseGp).
const GP_HEADER =
  "OBJECT_NAME,OBJECT_ID,EPOCH,MEAN_MOTION,ECCENTRICITY,INCLINATION,RA_OF_ASC_NODE," +
  "ARG_OF_PERICENTER,MEAN_ANOMALY,EPHEMERIS_TYPE,CLASSIFICATION_TYPE,NORAD_CAT_ID," +
  "ELEMENT_SET_NO,REV_AT_EPOCH,BSTAR,MEAN_MOTION_DOT,MEAN_MOTION_DDOT";

const ISS_GP = `${GP_HEADER}
ISS (ZARYA),1998-067A,2026-06-30T20:43:03.172224,15.50129012,.0004309,51.6310,232.3923,252.2804,107.7714,0,U,25544,999,34567,.11296E-3,.5885E-4,0`;

const DEBRIS_GP = `${GP_HEADER}
CZ-4B R/B,2017-072B,2026-06-30T12:00:00.000000,14.20000000,.0001000,98.7000,100.0000,100.0000,260.0000,0,U,43012,999,12345,.10000E-3,.1E-5,0`;

function textResponse(body) {
  return new Response(body, { status: 200 });
}

// Real LL2 shape, trimmed to only what buildCrew() reads (see the curl
// checks noted in the PR description for the actual field names). Members
// may be given as a bare name, or as {id, name, role} where a test cares
// about the astronaut id or role that /crew now passes through.
function stationResponse(members) {
  return new Response(
    JSON.stringify({
      active_expeditions: [
        {
          crew: members.map((m) => {
            const {
              id = null,
              name,
              role = "Flight Engineer",
            } = typeof m === "string" ? { name: m } : m;
            return { role: { role }, astronaut: id == null ? { name } : { id, name } };
          }),
        },
      ],
    })
  );
}

function astronautCountResponse(count) {
  return new Response(JSON.stringify({ count }));
}

// LL2 is Django REST Framework under the hood; its throttle responses are
// 429s with a JSON {"detail": "..."} body (their documented shape — not
// observed live this session, since deliberately tripping the limit would
// throttle this environment's IP for an hour).
function throttledResponse() {
  return new Response(
    JSON.stringify({ detail: "Request was throttled. Expected available in 3600 seconds." }),
    { status: 429 }
  );
}

// Calls made to LL2 (vs. CelesTrak/GitHub) — for asserting on the headers
// every LL2 fetch sends.
function ll2Calls() {
  return fetch.mock.calls.filter(
    ([url]) => url.includes("/spacestation/") || url.includes("/astronaut/")
  );
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
      if (url.includes("GROUP=stations")) return Promise.resolve(textResponse(ISS_GP));
      if (url.includes("GROUP=active"))
        return Promise.resolve(textResponse(ISS_GP + "\n" + DEBRIS_GP));
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
      if (url.includes("/spacestation/4/"))
        return Promise.resolve(stationResponse(["Alice", "Bob"]));
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
        expect.objectContaining({ name: "Alice", craft: "ISS" }),
        expect.objectContaining({ name: "Bob", craft: "ISS" }),
        expect.objectContaining({ name: "Carol", craft: "Tiangong" }),
      ])
    );
    expect(body.possiblyIncomplete).toBe(false);
    expect(isoDateString(body.fetchedAt)).toBe(true);
    // Diagnostics are a failure-only field — a healthy response never
    // carries them.
    expect(body.sourceStatus).toBeUndefined();
    expect(res.headers.get("Cache-Control")).toBe(`public, max-age=${CREW_TTL}`);
  });

  it("dedupes a crew member LL2 lists twice within the same expedition", async () => {
    fetch.mockImplementation((url) => {
      if (url.includes("/spacestation/4/")) {
        // The real 2026-07-24 ISS payload: id 732 listed twice.
        return Promise.resolve(
          stationResponse([
            { id: 732, name: "Andrei Fedyaev", role: "Commander" },
            { id: 732, name: "Andrei Fedyaev" },
          ])
        );
      }
      if (url.includes("/spacestation/18/")) return Promise.resolve(stationResponse([]));
      if (url.includes("/astronaut/")) return Promise.resolve(astronautCountResponse(1));
      throw new Error("unexpected URL " + url);
    });
    const res = await worker.fetch(new Request("https://x/crew"), {}, ctx);
    const body = await res.json();
    expect(body.people).toEqual([
      { name: "Andrei Fedyaev", craft: "ISS", id: 732, role: "Commander" },
    ]);
    expect(body.number).toBe(1);
  });

  it("drops a crew entry with no name even when it carries an id", async () => {
    fetch.mockImplementation((url) => {
      if (url.includes("/spacestation/4/")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              active_expeditions: [
                {
                  crew: [
                    { role: { role: "Commander" }, astronaut: { id: 1, name: "Alice" } },
                    { role: { role: "Flight Engineer" }, astronaut: { id: 2 } },
                  ],
                },
              ],
            })
          )
        );
      }
      if (url.includes("/spacestation/18/")) return Promise.resolve(stationResponse([]));
      if (url.includes("/astronaut/")) return Promise.resolve(astronautCountResponse(1));
      throw new Error("unexpected URL " + url);
    });
    const res = await worker.fetch(new Request("https://x/crew"), {}, ctx);
    const body = await res.json();
    expect(body.people).toEqual([{ name: "Alice", craft: "ISS", id: 1, role: "Commander" }]);
  });

  it("passes each crew member's astronaut id and role through on /crew", async () => {
    fetch.mockImplementation((url) => {
      if (url.includes("/spacestation/4/"))
        return Promise.resolve(
          stationResponse([{ id: 647, name: "Sergey Kud-Sverchkov", role: "Commander" }])
        );
      if (url.includes("/spacestation/18/")) return Promise.resolve(stationResponse([]));
      if (url.includes("/astronaut/")) return Promise.resolve(astronautCountResponse(1));
      throw new Error("unexpected URL " + url);
    });
    const res = await worker.fetch(new Request("https://x/crew"), {}, ctx);
    const body = await res.json();
    // The id is what the crew card uses to request a profile from /astronaut.
    expect(body.people).toEqual([
      { name: "Sergey Kud-Sverchkov", craft: "ISS", id: 647, role: "Commander" },
    ]);
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
    expect(body.people).toEqual([
      { name: "Alice", craft: "ISS", id: null, role: "Flight Engineer" },
    ]);
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
    // A thrown fetch has no HTTP status to report — "fetch_failed" stands in.
    expect(body.sourceStatus).toEqual({
      iss: { status: "fetch_failed" },
      tiangong: { status: "fetch_failed" },
    });
  });

  it("surfaces per-station status and sanitized throttle detail when LL2 refuses both stations", async () => {
    fetch.mockImplementation((url) => {
      if (url.includes("/spacestation/")) return Promise.resolve(throttledResponse());
      throw new Error("unexpected URL " + url);
    });
    const res = await worker.fetch(new Request("https://x/crew"), {}, ctx);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.people).toEqual([]);
    expect(body.sourceStatus.iss.status).toBe(429);
    expect(body.sourceStatus.iss.detail).toContain("throttled");
    expect(body.sourceStatus.tiangong.status).toBe(429);
    // The detail is a short excerpt, never a full-body echo.
    expect(body.sourceStatus.iss.detail.length).toBeLessThanOrEqual(160);
  });

  it("sends identifying LL2 headers and no Authorization when LL2_API_KEY is unset", async () => {
    fetch.mockImplementation((url) => {
      if (url.includes("/spacestation/4/")) return Promise.resolve(stationResponse(["Alice"]));
      if (url.includes("/spacestation/18/")) return Promise.resolve(stationResponse([]));
      if (url.includes("/astronaut/")) return Promise.resolve(astronautCountResponse(1));
      throw new Error("unexpected URL " + url);
    });
    await worker.fetch(new Request("https://x/crew"), {}, ctx);
    const calls = ll2Calls();
    expect(calls).toHaveLength(3);
    for (const [, opts] of calls) {
      expect(opts.headers["User-Agent"]).toContain("OrbitalTraffic");
      expect(opts.headers.Accept).toBe("application/json");
      expect(opts.headers.Authorization).toBeUndefined();
    }
  });

  it("sends Authorization: Token on every LL2 fetch when the LL2_API_KEY binding is present", async () => {
    fetch.mockImplementation((url) => {
      if (url.includes("/spacestation/4/")) return Promise.resolve(stationResponse(["Alice"]));
      if (url.includes("/spacestation/18/")) return Promise.resolve(stationResponse([]));
      if (url.includes("/astronaut/")) return Promise.resolve(astronautCountResponse(1));
      throw new Error("unexpected URL " + url);
    });
    await worker.fetch(new Request("https://x/crew"), { LL2_API_KEY: "sekret" }, ctx);
    const calls = ll2Calls();
    expect(calls).toHaveLength(3);
    for (const [, opts] of calls) {
      expect(opts.headers.Authorization).toBe("Token sekret");
    }
  });

  it("negative-caches a failed /crew build for CREW_FAIL_TTL instead of skipping the cache", async () => {
    const put = vi.fn();
    vi.stubGlobal("caches", { default: { match: vi.fn().mockResolvedValue(undefined), put } });
    fetch.mockImplementation((url) => {
      if (url.includes("/spacestation/")) return Promise.resolve(throttledResponse());
      throw new Error("unexpected URL " + url);
    });
    const res = await worker.fetch(new Request("https://x/crew"), {}, ctx);
    expect((await res.json()).ok).toBe(false);
    expect(res.headers.get("Cache-Control")).toBe(`public, max-age=${CREW_FAIL_TTL}`);
    // Pre-PR #96 the failure was cached a full hour; after it, not at all —
    // which let every visitor re-hammer a rate-limited upstream. Now it IS
    // cached, but only briefly (cache.put honors the response's max-age).
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0][1].headers.get("Cache-Control")).toBe(
      `public, max-age=${CREW_FAIL_TTL}`
    );
  });

  it("caches a successful /crew build at the full CREW_TTL", async () => {
    const put = vi.fn();
    vi.stubGlobal("caches", { default: { match: vi.fn().mockResolvedValue(undefined), put } });
    fetch.mockImplementation((url) => {
      if (url.includes("/spacestation/4/")) return Promise.resolve(stationResponse(["Alice"]));
      if (url.includes("/spacestation/18/")) return Promise.resolve(stationResponse([]));
      if (url.includes("/astronaut/")) return Promise.resolve(astronautCountResponse(1));
      throw new Error("unexpected URL " + url);
    });
    const res = await worker.fetch(new Request("https://x/crew"), {}, ctx);
    expect((await res.json()).ok).toBe(true);
    expect(res.headers.get("Cache-Control")).toBe(`public, max-age=${CREW_TTL}`);
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0][1].headers.get("Cache-Control")).toBe(`public, max-age=${CREW_TTL}`);
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

  it("serves a trimmed astronaut profile on /astronaut", async () => {
    // Shape and values taken from the real LL2 record for id 573 (Jessica
    // Meir), including the fields deliberately dropped from the response.
    fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 573,
          name: "Jessica Meir",
          nationality: "American",
          agency: { id: 44, name: "National Aeronautics and Space Administration" },
          bio: "Jessica Ulrika Meir is...",
          profile_image: "https://example.test/full.jpg",
          profile_image_thumbnail: "https://example.test/thumb.jpg",
          wiki: "https://en.wikipedia.org/wiki/Jessica_Meir",
          twitter: "https://twitter.com/Astro_Jessica",
          instagram: null,
          flights_count: 2,
          spacewalks_count: 4,
          time_in_space: "P369DT6H45M59S",
          eva_time: "P1DT5H4M",
          flights: [{ huge: "unused" }],
          landings: [{ huge: "unused" }],
        })
      )
    );
    const res = await worker.fetch(new Request("https://x/astronaut?id=573"), {}, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(`public, max-age=${ASTRONAUT_TTL}`);
    const body = await res.json();
    expect(body).toEqual({
      id: 573,
      name: "Jessica Meir",
      nationality: "American",
      agency: "National Aeronautics and Space Administration",
      bio: "Jessica Ulrika Meir is...",
      // Thumbnail preferred over the full-size image.
      image: "https://example.test/thumb.jpg",
      wiki: "https://en.wikipedia.org/wiki/Jessica_Meir",
      twitter: "https://twitter.com/Astro_Jessica",
      instagram: null,
      flights: 2,
      spacewalks: 4,
      timeInSpace: "P369DT6H45M59S",
      evaTime: "P1DT5H4M",
    });
    // The bulky nested arrays never reach the client.
    expect(body.flights).not.toBeInstanceOf(Array);
    expect(body.landings).toBeUndefined();
  });

  it("rejects a missing or non-numeric astronaut id without calling LL2", async () => {
    fetch.mockImplementation(() => {
      throw new Error("should not fetch");
    });
    expect((await worker.fetch(new Request("https://x/astronaut"), {}, ctx)).status).toBe(400);
    // Anything non-numeric could steer the upstream URL path or mint
    // unbounded cache keys.
    expect(
      (await worker.fetch(new Request("https://x/astronaut?id=../launch"), {}, ctx)).status
    ).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("degrades /astronaut to null when LL2 refuses or the shape is wrong", async () => {
    fetch.mockResolvedValue(new Response("nope", { status: 429 }));
    let res = await worker.fetch(new Request("https://x/astronaut?id=573"), {}, ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();

    fetch.mockResolvedValue(new Response(JSON.stringify({ detail: "no name here" })));
    res = await worker.fetch(new Request("https://x/astronaut?id=573"), {}, ctx);
    expect(await res.json()).toBeNull();
  });

  it("negative-caches a null /astronaut result for ASTRONAUT_FAIL_TTL instead of the full ASTRONAUT_TTL", async () => {
    // Before this fix, a transient LL2 hiccup on a real astronaut id got
    // cached as `null` for the full 24h ASTRONAUT_TTL — indistinguishable
    // from a confirmed-absent profile, and not correctable short of the TTL
    // expiring. Mirrors the equivalent /crew test above.
    const put = vi.fn();
    vi.stubGlobal("caches", { default: { match: vi.fn().mockResolvedValue(undefined), put } });
    fetch.mockResolvedValue(new Response("nope", { status: 429 }));
    const res = await worker.fetch(new Request("https://x/astronaut?id=573"), {}, ctx);
    expect(await res.json()).toBeNull();
    expect(res.headers.get("Cache-Control")).toBe(`public, max-age=${ASTRONAUT_FAIL_TTL}`);
    expect(put.mock.calls[0][1].headers.get("Cache-Control")).toBe(
      `public, max-age=${ASTRONAUT_FAIL_TTL}`
    );
  });

  it("caches a successful /astronaut build at the full ASTRONAUT_TTL", async () => {
    const put = vi.fn();
    vi.stubGlobal("caches", { default: { match: vi.fn().mockResolvedValue(undefined), put } });
    fetch.mockResolvedValue(new Response(JSON.stringify({ id: 573, name: "Jessica Meir" })));
    const res = await worker.fetch(new Request("https://x/astronaut?id=573"), {}, ctx);
    expect(res.headers.get("Cache-Control")).toBe(`public, max-age=${ASTRONAUT_TTL}`);
    expect(put.mock.calls[0][1].headers.get("Cache-Control")).toBe(
      `public, max-age=${ASTRONAUT_TTL}`
    );
  });

  it("sends LL2 headers on /astronaut, including the key when LL2_API_KEY is set", async () => {
    fetch.mockResolvedValue(new Response(JSON.stringify({ id: 1, name: "Alice" })));
    await worker.fetch(new Request("https://x/astronaut?id=1"), { LL2_API_KEY: "secret" }, ctx);
    const [, opts] = ll2Calls()[0];
    expect(opts.headers["User-Agent"]).toContain("OrbitalTraffic");
    expect(opts.headers.Accept).toBe("application/json");
    // Token, never Bearer/Api-Key — the scheme The Space Devs' docs specify.
    expect(opts.headers.Authorization).toBe("Token secret");
  });

  it("serves /today and degrades to an empty feed", async () => {
    fetch.mockResolvedValue(
      new Response(JSON.stringify({ updated: "2026-07-01", activities: ["x"] }))
    );
    let res = await worker.fetch(new Request("https://x/today"), {}, ctx);
    expect((await res.json()).activities).toEqual(["x"]);

    fetch.mockResolvedValue(new Response("err", { status: 500 }));
    res = await worker.fetch(new Request("https://x/today"), {}, ctx);
    expect(await res.json()).toEqual({ updated: null, activities: [] });
  });

  it("serves /capsules and degrades to an empty snapshot", async () => {
    const body = {
      updated: "2026-07-03T00:00:00Z",
      capsules: { 60001: { phase: "docked" } },
      events: [],
    };
    fetch.mockResolvedValue(new Response(JSON.stringify(body)));
    let res = await worker.fetch(new Request("https://x/capsules"), {}, ctx);
    expect((await res.json()).capsules["60001"].phase).toBe("docked");

    fetch.mockResolvedValue(new Response("err", { status: 500 }));
    res = await worker.fetch(new Request("https://x/capsules"), {}, ctx);
    expect(await res.json()).toEqual({ updated: null, capsules: {}, events: [] });
  });

  it("serves /events, composing all three sources and sorting newest-first", async () => {
    const now = Date.now();
    const recent = (hoursAgo) => new Date(now - hoursAgo * 3600 * 1000).toISOString();
    fetch.mockImplementation((url) => {
      if (url.includes("capsule-status.json")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              events: [
                {
                  id: "80001",
                  name: "CREW DRAGON 12",
                  kind: "crew",
                  family: "dragon",
                  stationKey: "iss",
                  event: "docked",
                  at: recent(2),
                },
              ],
            })
          )
        );
      }
      if (url.includes("launch-reentry-log.json")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              events: [
                {
                  type: "launch",
                  ids: ["60001", "60002"],
                  count: 2,
                  name: "STARLINK-31001",
                  cat: "starlink",
                  at: recent(5),
                },
                { type: "reentry", id: "70001", name: "COSMOS 2589", cat: "debris", at: recent(1) },
              ],
            })
          )
        );
      }
      if (url.includes("iss-today.json")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              crewEvents: [
                { id: 5, name: "Anil Menon", craft: "ISS", direction: "arrived", at: recent(10) },
              ],
            })
          )
        );
      }
      return Promise.resolve(new Response("not found", { status: 404 }));
    });

    const res = await worker.fetch(new Request("https://x/events"), {}, ctx);
    const body = await res.json();
    expect(body.events).toHaveLength(4);
    // newest (reentry, 1h ago) first, oldest (crew, 10h ago) last
    expect(body.events.map((e) => e.type)).toEqual(["reentry", "docking", "launch", "crew"]);
    expect(body.events[1]).toMatchObject({ type: "docking", subtype: "docked", id: "80001" });
    expect(body.events[2]).toMatchObject({ type: "launch", count: 2, ids: ["60001", "60002"] });
    expect(body.events[3]).toMatchObject({
      type: "crew",
      direction: "arrived",
      name: "Anil Menon",
    });
    expect(body.windowHours).toBe(48);
  });

  it("/events drops events older than the display window", async () => {
    const tooOld = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
    fetch.mockImplementation((url) => {
      if (url.includes("capsule-status.json")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              events: [{ id: "1", name: "X", event: "docked", at: tooOld }],
            })
          )
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ events: [], crewEvents: [] })));
    });
    const res = await worker.fetch(new Request("https://x/events"), {}, ctx);
    expect((await res.json()).events).toEqual([]);
  });

  it("/events degrades one source to empty without failing the whole route", async () => {
    const recentIso = new Date().toISOString();
    fetch.mockImplementation((url) => {
      if (url.includes("capsule-status.json"))
        return Promise.resolve(new Response("err", { status: 500 }));
      if (url.includes("launch-reentry-log.json")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              events: [{ type: "reentry", id: "1", name: "X", cat: "debris", at: recentIso }],
            })
          )
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ crewEvents: [] })));
    });
    const res = await worker.fetch(new Request("https://x/events"), {}, ctx);
    const body = await res.json();
    expect(body.events).toHaveLength(1);
    expect(body.events[0].type).toBe("reentry");
  });

  it("400s /satcat with no id", async () => {
    const res = await worker.fetch(new Request("https://x/satcat"), {}, ctx);
    expect(res.status).toBe(400);
  });

  it("rejects a non-numeric /satcat id without calling CelesTrak — closes the cache-key collision", async () => {
    fetch.mockImplementation(() => {
      throw new Error("should not fetch");
    });
    // A trailing space survives URL-decoding into the query param (id
    // becomes "25544 ") while normalizing away elsewhere in the request
    // pipeline — this is the exact shape that demonstrated a real
    // cache-poisoning vulnerability against the live Worker: an attacker
    // could pre-poison a real object's /satcat cache slot with a `null`
    // response by requesting it once with a trailing space, since CelesTrak
    // wouldn't match the padded catalog number. Numeric-only validation
    // must reject it before any cache key is ever built or upstream fetch
    // ever made.
    let res = await worker.fetch(new Request("https://x/satcat?id=25544%20"), {}, ctx);
    expect(res.status).toBe(400);
    // Non-numeric junk generally, same protection /astronaut already has.
    res = await worker.fetch(new Request("https://x/satcat?id=../launch"), {}, ctx);
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("serves a single SATCAT record on /satcat and degrades to null", async () => {
    fetch.mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            NORAD_CAT_ID: "25544",
            LAUNCH_DATE: "1998-11-20",
            OBJECT_TYPE: "PAYLOAD",
            OWNER: "ISS",
          },
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
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("CATNR=25544"), expect.any(Object));

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

  it("negative-caches a null /satcat result for SATCAT_FAIL_TTL instead of the full SATCAT_TTL", async () => {
    // Before this fix, a transient CelesTrak hiccup on a real catalog number
    // got cached as `null` for the full 7-day SATCAT_TTL — indistinguishable
    // from a confirmed-nonexistent object, and not correctable short of the
    // TTL expiring. This is what left the live ISS's /satcat poisoned.
    const put = vi.fn();
    vi.stubGlobal("caches", { default: { match: vi.fn().mockResolvedValue(undefined), put } });
    fetch.mockResolvedValue(new Response("err", { status: 500 }));
    const res = await worker.fetch(new Request("https://x/satcat?id=25544"), {}, ctx);
    expect(await res.json()).toBeNull();
    expect(res.headers.get("Cache-Control")).toBe(`public, max-age=${SATCAT_FAIL_TTL}`);
    expect(put.mock.calls[0][1].headers.get("Cache-Control")).toBe(
      `public, max-age=${SATCAT_FAIL_TTL}`
    );
  });

  it("caches a successful /satcat build at the full SATCAT_TTL", async () => {
    const put = vi.fn();
    vi.stubGlobal("caches", { default: { match: vi.fn().mockResolvedValue(undefined), put } });
    fetch.mockResolvedValue(
      new Response(JSON.stringify([{ NORAD_CAT_ID: "25544", LAUNCH_DATE: "1998-11-20" }]))
    );
    const res = await worker.fetch(new Request("https://x/satcat?id=25544"), {}, ctx);
    expect(res.headers.get("Cache-Control")).toBe(`public, max-age=${SATCAT_TTL}`);
    expect(put.mock.calls[0][1].headers.get("Cache-Control")).toBe(`public, max-age=${SATCAT_TTL}`);
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
    // A fresh Response per call, matching real fetch() — a Response body can
    // only be read once, so mockResolvedValue's single shared instance would
    // make every call after the first look like a failure to fetchGroup()'s
    // await res.text(), which is not what this test means to exercise.
    fetch.mockImplementation(() => Promise.resolve(textResponse("")));
    await buildTLERecords();
    expect(fetch).toHaveBeenCalledTimes(GROUPS.length);
  });

  it("survives individual group failures", async () => {
    fetch.mockImplementation((url) => {
      if (url.includes("GROUP=stations")) return Promise.resolve(textResponse(ISS_GP));
      return Promise.reject(new Error("celestrak flaky"));
    });
    const recs = await buildTLERecords();
    expect(recs).toHaveLength(1);
    expect(recs[0].cat).toBe("stations");
  });

  it("never has more than a few CelesTrak requests in flight at once", async () => {
    // Regression guard for the real failure this project hit: CelesTrak
    // enforces a low per-IP concurrent-connection ceiling, and firing all 13
    // GROUPS requests simultaneously (the original Promise.allSettled
    // design) left most of them stalled — not because any single request was
    // slow, but purely from contending for the same ceiling. Bounded
    // concurrency is the actual fix; this asserts the bound is respected
    // rather than just that the end result looks right.
    let inFlight = 0;
    let maxInFlight = 0;
    fetch.mockImplementation(() => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((resolve) =>
        setTimeout(() => {
          inFlight--;
          resolve(textResponse(""));
        }, 5)
      );
    });
    await buildTLERecords();
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it("retries a group that failed in the initial concurrency-bounded pass", async () => {
    let stationsCalls = 0;
    fetch.mockImplementation((url) => {
      if (url.includes("GROUP=stations")) {
        stationsCalls++;
        // Fails only the first time — a lone retry (not contending with the
        // other 12 for the connection ceiling) succeeds.
        if (stationsCalls === 1) return Promise.reject(new Error("celestrak flaky"));
        return Promise.resolve(textResponse(ISS_GP));
      }
      return Promise.resolve(textResponse(""));
    });
    const recs = await buildTLERecords();
    expect(stationsCalls).toBe(2);
    expect(recs.find((r) => r.name === "ISS (ZARYA)")?.cat).toBe("stations");
  });
});

// Minimal stub of the Workers KV binding surface getTLERecords()/
// refreshTLECache() actually use.
function stubKv(initial) {
  let stored = initial;
  return {
    get: vi.fn(async (key, type) => {
      if (stored === undefined) return null;
      return type === "json" ? JSON.parse(stored) : stored;
    }),
    put: vi.fn(async (key, value) => {
      stored = value;
    }),
    _stored: () => stored,
  };
}

describe("TLE_CACHE (Workers KV warm cache)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getTLERecords reads the cron-refreshed catalog from KV instead of building live", async () => {
    const kv = stubKv(JSON.stringify({ recs: [{ name: "ISS (ZARYA)", cat: "stations" }], failedGroups: 0 }));
    const recs = await getTLERecords({ TLE_CACHE: kv });
    expect(Array.from(recs)).toEqual([{ name: "ISS (ZARYA)", cat: "stations" }]);
    expect(recs.failedGroups).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("getTLERecords falls back to a live build when KV has nothing yet", async () => {
    fetch.mockImplementation((url) => {
      if (url.includes("GROUP=stations")) return Promise.resolve(textResponse(ISS_GP));
      return Promise.resolve(textResponse(""));
    });
    const kv = stubKv(undefined);
    const recs = await getTLERecords({ TLE_CACHE: kv });
    expect(recs.find((r) => r.name === "ISS (ZARYA)")?.cat).toBe("stations");
    expect(fetch).toHaveBeenCalled();
  });

  it("getTLERecords falls back to a live build when the KV read throws", async () => {
    fetch.mockImplementation(() => Promise.resolve(textResponse("")));
    const kv = { get: vi.fn().mockRejectedValue(new Error("KV unavailable")) };
    await expect(getTLERecords({ TLE_CACHE: kv })).resolves.toBeInstanceOf(Array);
  });

  it("getTLERecords builds live when no TLE_CACHE binding is present", async () => {
    fetch.mockImplementation(() => Promise.resolve(textResponse("")));
    const recs = await getTLERecords({});
    expect(recs).toHaveLength(0);
    expect(fetch).toHaveBeenCalledTimes(GROUPS.length);
  });

  it("refreshTLECache writes the merged catalog and failedGroups to KV", async () => {
    fetch.mockImplementation((url) => {
      if (url.includes("GROUP=stations")) return Promise.resolve(textResponse(ISS_GP));
      return Promise.resolve(textResponse(""));
    });
    const kv = stubKv(undefined);
    await refreshTLECache({ TLE_CACHE: kv });
    expect(kv.put).toHaveBeenCalledTimes(1);
    const [key, value, opts] = kv.put.mock.calls[0];
    expect(key).toBe("tle");
    const stored = JSON.parse(value);
    expect(stored.recs.find((r) => r.name === "ISS (ZARYA)")?.cat).toBe("stations");
    expect(stored.failedGroups).toBe(0);
    expect(opts.expirationTtl).toBeGreaterThan(0);
  });

  it("refreshTLECache tolerates a missing TLE_CACHE binding (never throws)", async () => {
    fetch.mockImplementation(() => Promise.resolve(textResponse("")));
    await expect(refreshTLECache({})).resolves.toBeInstanceOf(Array);
  });

  it("the /tle route serves the KV-warmed catalog without building live", async () => {
    const kv = stubKv(JSON.stringify({ recs: [{ name: "ISS (ZARYA)", cat: "stations" }], failedGroups: 0 }));
    const res = await worker.fetch(new Request("https://x/tle"), { TLE_CACHE: kv }, ctx);
    expect(res.status).toBe(200);
    const recs = await res.json();
    expect(recs).toEqual([{ name: "ISS (ZARYA)", cat: "stations" }]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("the /tle route reports X-TLE-Source: kv and a builtAt timestamp when served from KV", async () => {
    const builtAt = Date.UTC(2026, 0, 1, 12, 0, 0);
    const kv = stubKv(JSON.stringify({ recs: [{ name: "ISS (ZARYA)", cat: "stations" }], failedGroups: 0, builtAt }));
    const res = await worker.fetch(new Request("https://x/tle"), { TLE_CACHE: kv }, ctx);
    expect(res.headers.get("X-TLE-Source")).toBe("kv");
    expect(res.headers.get("X-TLE-Built-At")).toBe(new Date(builtAt).toISOString());
  });

  it("the /tle route reports X-TLE-Source: live when it has to build on demand", async () => {
    fetch.mockImplementation(() => Promise.resolve(textResponse("")));
    const res = await worker.fetch(new Request("https://x/tle"), {}, ctx);
    expect(res.headers.get("X-TLE-Source")).toBe("live");
    expect(res.headers.get("X-TLE-Built-At")).not.toBe("");
  });

  it("scheduled() refreshes TLE_CACHE via waitUntil without blocking", async () => {
    fetch.mockImplementation(() => Promise.resolve(textResponse("")));
    const kv = stubKv(undefined);
    const waited = [];
    const schedCtx = { waitUntil: (p) => waited.push(p) };
    await worker.scheduled({}, { TLE_CACHE: kv }, schedCtx);
    expect(waited).toHaveLength(1);
    await waited[0];
    expect(kv.put).toHaveBeenCalledTimes(1);
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchCrewRoster } from "../update-iss-today.mjs";

/**
 * fetchCrewRoster() must go through the Worker's public /crew route, never
 * LL2 directly (LL2_API_KEY is a Worker secret this script has no access
 * to), and must throw — never silently return an empty roster — on any
 * failure, so update-iss-today.mjs's caller can tell "no crew changed"
 * apart from "we couldn't check" and carry the previous roster forward
 * instead of reporting a false mass departure.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("fetchCrewRoster", () => {
  it("trims a successful /crew response to id/name/craft", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        ok: true,
        people: [
          { id: 1, name: "Alice", craft: "ISS", role: "Commander", extra: "ignored" },
          { id: null, name: "Bob", craft: "Tiangong" },
        ],
      })
    );
    const roster = await fetchCrewRoster();
    expect(roster).toEqual([
      { id: 1, name: "Alice", craft: "ISS" },
      { id: null, name: "Bob", craft: "Tiangong" },
    ]);
  });

  it("calls the Worker's public route, not LL2 directly", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ ok: true, people: [] }));
    await fetchCrewRoster();
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toBe("https://orbital-traffic.ianlewis101.workers.dev/crew");
  });

  it("throws on an HTTP failure", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({}, 500));
    await expect(fetchCrewRoster()).rejects.toThrow(/HTTP 500/);
  });

  it("throws when the Worker itself reports ok:false, rather than returning an empty roster", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ ok: false, people: [] }));
    await expect(fetchCrewRoster()).rejects.toThrow(/degraded/);
  });

  it("throws on a malformed response shape", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ ok: true, people: "not an array" }));
    await expect(fetchCrewRoster()).rejects.toThrow(/degraded/);
  });

  it("throws on a network-level fetch failure", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    await expect(fetchCrewRoster()).rejects.toThrow("network down");
  });
});

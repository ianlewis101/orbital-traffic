import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderCapsuleStatus } from "../src/ui/capsule-status.js";
import { state } from "../src/state.js";

/**
 * The event log only records transitions, so a capsule that has stayed in
 * the same phase since tracking began has no matching entries — the card
 * must fall back to a single line built from current status instead of
 * disappearing, since "no card" reads as broken, not as "nothing happened".
 */

function stubEl() {
  return { style: {}, innerHTML: "" };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  state.selected = null;
});

describe("renderCapsuleStatus", () => {
  it("falls back to a status line when no events match this capsule", async () => {
    const s = { id: "66664", name: "SOYUZ-MS 28" };
    state.selected = s;
    fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          capsules: {
            66664: { phase: "docked", stationKey: "iss", since: "2026-07-03T10:34:14.509Z" },
          },
          events: [],
        })
      )
    );
    const el = stubEl();
    await renderCapsuleStatus(s, el);
    expect(el.innerHTML).toContain("Recent activity");
    expect(el.innerHTML).toContain("Docked — since Jul 3");
  });

  it("ignores other capsules' events when falling back", async () => {
    const s = { id: "66664", name: "SOYUZ-MS 28" };
    state.selected = s;
    fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          capsules: {
            66664: { phase: "docked", stationKey: "iss", since: "2026-07-03T10:34:14.509Z" },
          },
          events: [{ id: "67796", event: "launched", at: "2026-07-09T00:00:00.000Z" }],
        })
      )
    );
    const el = stubEl();
    await renderCapsuleStatus(s, el);
    expect(el.innerHTML).toContain("Docked — since Jul 3");
    expect(el.innerHTML).not.toContain("Launched");
  });

  it("renders real transition events instead of the fallback when present", async () => {
    const s = { id: "70001", name: "CREW-DRAGON 13" };
    state.selected = s;
    fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          capsules: {
            70001: { phase: "free-flying", stationKey: "iss", since: "2026-07-09T20:40:45.949Z" },
          },
          events: [{ id: "70001", event: "launched", at: "2026-07-09T20:40:45.949Z" }],
        })
      )
    );
    const el = stubEl();
    await renderCapsuleStatus(s, el);
    expect(el.innerHTML).toContain("Launched — Jul 9");
    expect(el.innerHTML).not.toContain("since Jul 9");
  });

  it("shows a landed capsule's fallback line using the phase label", async () => {
    const s = { id: "69180", name: "SHENZHOU-23 (SZ-23)" };
    state.selected = s;
    fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          capsules: {
            69180: { phase: "landed", stationKey: "css", since: "2026-07-05T00:00:00.000Z" },
          },
          events: [],
        })
      )
    );
    const el = stubEl();
    await renderCapsuleStatus(s, el);
    expect(el.innerHTML).toContain("Landed — since Jul 5");
  });

  it("shows status unavailable when the capsule id has no entry", async () => {
    const s = { id: "99999", name: "UNKNOWN" };
    state.selected = s;
    fetch.mockResolvedValue(new Response(JSON.stringify({ capsules: {}, events: [] })));
    const el = stubEl();
    await renderCapsuleStatus(s, el);
    expect(el.innerHTML).toContain("Status unavailable");
    expect(el.innerHTML).not.toContain("Recent activity");
  });

  it("bails out without touching el if the selection changed mid-fetch", async () => {
    const s = { id: "66664", name: "SOYUZ-MS 28" };
    state.selected = { id: "other" };
    fetch.mockResolvedValue(new Response(JSON.stringify({ capsules: {}, events: [] })));
    const el = stubEl();
    await renderCapsuleStatus(s, el);
    expect(el.innerHTML).toContain("Fetching status");
  });
});

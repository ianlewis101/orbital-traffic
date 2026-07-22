import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { enrichSatcat } from "../src/ui/info.js";
import { state } from "../src/state.js";

/**
 * enrichSatcat()'s retry semantics (fix/satcat-retry-after-failure).
 *
 * The Worker's /satcat route returns a single record, or `null` when no SATCAT
 * record exists (fetchSatcat() in worker/src/index.js — verified against the
 * live Worker: 200 + a JSON object for a real id, 200 + `null` for one with no
 * record). The three outcomes must be handled differently:
 *   - success            -> apply fields, latch satcatDone
 *   - confirmed absence   -> latch satcatDone, no fields (never retry)
 *   - transport failure   -> clear _satcatTry so the NEXT select() retries
 *
 * The bug being guarded against: a single transient failure (network blip,
 * cold/unreachable Worker) latching _satcatTry true forever, permanently
 * blanking launch date / owner / flag / object type for the rest of the
 * session. enrichSatcat runs once per select(), so a cleared latch retries at
 * most once per selection.
 */

// A per-selector element map so the still-selected re-render path (setLaunchLine
// et al.) has real nodes to write to and assertions can read them back.
function stubEl() {
  return {
    style: {},
    innerHTML: "",
    textContent: "",
    className: "",
    classList: { add() {}, remove() {}, toggle() {} },
  };
}
let els;
beforeEach(() => {
  els = {};
  vi.stubGlobal("document", {
    querySelector: (sel) => (els[sel] ||= stubEl()),
  });
  vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  state.selected = null;
});

function makeSat() {
  // rec:{} makes safeProp() return null, so the re-render's refreshInfo() takes
  // its "no current position" branch without needing a real TLE.
  return { id: "25544", name: "ISS (ZARYA)", cat: "stations", rec: {} };
}

// The Worker returns the record object directly (single record, or null).
function recordResponse(rec) {
  return new Response(JSON.stringify(rec));
}
function noRecordResponse() {
  return new Response("null"); // 200 + JSON null — confirmed absence
}

function expectNoSatcatFields(s) {
  expect(s.launchDate).toBeUndefined();
  expect(s.objType).toBeUndefined();
  expect(s.ownerCode).toBeUndefined();
  expect(s.ownerName).toBeUndefined();
  expect(s.launchSite).toBeUndefined();
}

describe("enrichSatcat — retry after transport failure", () => {
  it("clears the latch on a network error, then populates on the next selection", async () => {
    const s = makeSat();
    state.selected = s;

    fetch.mockRejectedValueOnce(new Error("network down"));
    await enrichSatcat(s);

    // A transient failure must not latch anything or write any fields.
    expectNoSatcatFields(s);
    expect(s.satcatDone).toBeFalsy();
    expect(s._satcatTry).toBe(false); // in-flight latch cleared -> retryable
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toContain("/satcat?id=25544");

    // Next select() of the same object retries and succeeds.
    fetch.mockResolvedValueOnce(
      recordResponse({
        LAUNCH_DATE: "1998-11-20",
        OBJECT_TYPE: "PAY",
        OWNER: "US",
        LAUNCH_SITE: "AFETR",
      })
    );
    await enrichSatcat(s);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(s.launchDate).toBe("1998-11-20");
    expect(s.objType).toBe("PAY");
    expect(s.ownerCode).toBe("US");
    expect(s.ownerName).toBe("United States");
    expect(s.launchSite).toBe("Cape Canaveral");
    expect(s.satcatDone).toBe(true);

    // Still-selected: the card re-rendered in place (setLaunchLine wrote #info-launch).
    expect(els["#info-launch"].textContent).toContain("Launched 20 Nov 1998");
  });

  it("clears the latch on a non-ok status (cold/unreachable Worker), then retries", async () => {
    const s = makeSat();
    state.selected = s;

    fetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
    await enrichSatcat(s);

    expectNoSatcatFields(s);
    expect(s.satcatDone).toBeFalsy();
    expect(s._satcatTry).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);

    fetch.mockResolvedValueOnce(recordResponse({ LAUNCH_DATE: "1998-11-20", OWNER: "US" }));
    await enrichSatcat(s);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(s.launchDate).toBe("1998-11-20");
    expect(s.ownerName).toBe("United States");
    expect(s.satcatDone).toBe(true);
  });
});

describe("enrichSatcat — confirmed absence", () => {
  it("latches satcatDone with no fields and does not refetch on re-selection", async () => {
    const s = makeSat();
    state.selected = s;

    fetch.mockResolvedValueOnce(noRecordResponse());
    await enrichSatcat(s);

    // No record exists — done for good, but nothing to show.
    expect(s.satcatDone).toBe(true);
    expectNoSatcatFields(s);
    expect(fetch).toHaveBeenCalledTimes(1);

    // Re-selecting must NOT hit the Worker again — the record will never exist.
    await enrichSatcat(s);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("enrichSatcat — selection guard on re-render", () => {
  it("populates the object's fields but leaves the card untouched when it is no longer selected", async () => {
    const s = makeSat();
    state.selected = { id: "99999", name: "OTHER", cat: "other", rec: {} }; // a different object is showing

    fetch.mockResolvedValueOnce(recordResponse({ LAUNCH_DATE: "1998-11-20", OWNER: "US" }));
    await enrichSatcat(s);

    // Fields still land on the (background) object...
    expect(s.launchDate).toBe("1998-11-20");
    expect(s.satcatDone).toBe(true);
    // ...but the visible card was not re-rendered for it.
    expect(els["#info-launch"]).toBeUndefined();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { pickRotation } from "../src/ui/today.js";

/**
 * pickRotation() is the pure selection logic behind Popular Objects: pinned
 * rows (ISS) always show, and the rest of the fixed 5-row card is a random
 * draw from the non-pinned pool that avoids repeating the previous draw
 * where possible. It reads/writes a small localStorage key to remember what
 * was shown last, so each case stubs storage the same way settings.test.js
 * does.
 */
function stubStorage(initial = {}, { throwOnSet = false, throwOnGet = false } = {}) {
  const store = { ...initial };
  vi.stubGlobal("localStorage", {
    getItem(k) {
      if (throwOnGet) throw new Error("denied");
      return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
    },
    setItem(k, v) {
      if (throwOnSet) throw new Error("quota");
      store[k] = String(v);
    },
    removeItem(k) {
      delete store[k];
    },
  });
  return store;
}

const KEY = "ot-hotlist-last-shown";

const ISS = { id: "25544", name: "ISS", pinned: true, reason: "Crewed" };

function pool(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: String(1000 + i),
    name: `Object ${i}`,
    reason: `Reason ${i}`,
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pickRotation", () => {
  it("always includes every pinned row", () => {
    stubStorage();
    const rows = [ISS, ...pool(10)];
    const result = pickRotation(rows);
    expect(result.some((r) => r.id === ISS.id)).toBe(true);
  });

  it("fills the remaining slots up to SLOT_COUNT (5) from the non-pinned pool", () => {
    stubStorage();
    const rows = [ISS, ...pool(10)];
    const result = pickRotation(rows);
    expect(result.length).toBe(5);
  });

  it("with no pinned rows, still caps at SLOT_COUNT (5)", () => {
    stubStorage();
    const result = pickRotation(pool(20));
    expect(result.length).toBe(5);
  });

  it("returns fewer than SLOT_COUNT when the pool itself is smaller — never pads", () => {
    stubStorage();
    const rows = [ISS, ...pool(2)];
    const result = pickRotation(rows);
    expect(result.length).toBe(3); // ISS + the only 2 available
  });

  it("avoids repeating the previous draw when the pool is large enough", () => {
    const store = stubStorage();
    const rows = [ISS, ...pool(20)];
    const first = pickRotation(rows);
    const firstIds = new Set(first.filter((r) => r.id !== ISS.id).map((r) => r.id));
    expect(store[KEY]).toBeDefined();

    const second = pickRotation(rows);
    const secondIds = second.filter((r) => r.id !== ISS.id).map((r) => r.id);
    // 4 fresh slots drawn from 16 objects not shown last time — no overlap.
    secondIds.forEach((id) => expect(firstIds.has(id)).toBe(false));
  });

  it("falls back to allowing a repeat rather than showing fewer rows when the pool can't avoid one", () => {
    stubStorage();
    const rows = [ISS, ...pool(4)]; // exactly enough for the 4 non-pinned slots
    const first = pickRotation(rows);
    const second = pickRotation(rows);
    expect(first.length).toBe(5);
    expect(second.length).toBe(5); // still 5, even though a repeat was unavoidable
  });

  it("survives a localStorage that throws on read or write", () => {
    stubStorage({}, { throwOnGet: true, throwOnSet: true });
    const rows = [ISS, ...pool(10)];
    expect(() => pickRotation(rows)).not.toThrow();
    expect(pickRotation(rows).length).toBe(5);
  });

  it("survives corrupt JSON in the last-shown key", () => {
    stubStorage({ [KEY]: "{not json" });
    const rows = [ISS, ...pool(10)];
    expect(() => pickRotation(rows)).not.toThrow();
  });
});

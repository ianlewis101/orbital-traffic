// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * toast() used to paint every message red, so "★ Saved to favourites" — by far
 * the most-fired toast in the app — looked exactly like an error had just
 * happened. It now defaults to the brand teal (--amber, #5eead4) and takes an
 * explicit "error" tone for the two call sites that really are failures.
 *
 * These assertions pin the split down: red must stay meaningful, which means
 * a confirmation must never reach for it and a failure must never lose it.
 */
import { toast } from "../src/ui/status.js";

const TEAL = "94, 234, 212"; // --amber #5eead4
const RED = "255, 107, 107";

/** The toast is the last <div> toast() appended to <body>. */
function lastToast() {
  const nodes = document.body.querySelectorAll("div");
  return nodes[nodes.length - 1];
}

beforeEach(() => {
  document.body.innerHTML = "";
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("toast tones", () => {
  it("defaults to the brand teal, not red", () => {
    toast("★ Saved to favourites");
    const el = lastToast();
    expect(el.textContent).toBe("★ Saved to favourites");
    expect(el.style.background).toContain(TEAL);
    expect(el.style.borderColor).toContain(TEAL);
    expect(el.style.background).not.toContain(RED);
  });

  it("keeps red for the explicit error tone", () => {
    toast("Sync failed — see error below", "error");
    const el = lastToast();
    expect(el.style.background).toContain(RED);
    expect(el.style.borderColor).toContain(RED);
  });

  it("falls back to teal for an unknown tone rather than throwing", () => {
    expect(() => toast("hello", "nonsense")).not.toThrow();
    expect(lastToast().style.background).toContain(TEAL);
  });

  it("still positions and dismisses itself the same way", () => {
    toast("Catalog refreshed");
    const el = lastToast();
    expect(el.style.position).toBe("fixed");
    expect(el.style.zIndex).toBe("30");
    expect(document.body.contains(el)).toBe(true);

    vi.advanceTimersByTime(3600 + 500);
    expect(document.body.contains(el)).toBe(false);
  });
});

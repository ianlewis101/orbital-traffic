import { describe, it, expect } from "vitest";
import { formatRelativeTime } from "../src/util/relative-time.js";

function ago(ms) {
  return new Date(Date.now() - ms);
}

describe("formatRelativeTime", () => {
  it("returns null for a null or undefined date", () => {
    expect(formatRelativeTime(null)).toBeNull();
    expect(formatRelativeTime(undefined)).toBeNull();
  });

  it("returns 'just now' under 60 seconds", () => {
    expect(formatRelativeTime(ago(0))).toBe("just now");
    expect(formatRelativeTime(ago(45 * 1000))).toBe("just now");
  });

  it("returns 'Xm ago' under 60 minutes", () => {
    expect(formatRelativeTime(ago(60 * 1000))).toBe("1m ago");
    expect(formatRelativeTime(ago(12 * 60 * 1000))).toBe("12m ago");
    expect(formatRelativeTime(ago(59 * 60 * 1000))).toBe("59m ago");
  });

  it("returns 'Xh ago' under 24 hours", () => {
    expect(formatRelativeTime(ago(60 * 60 * 1000))).toBe("1h ago");
    expect(formatRelativeTime(ago(5 * 60 * 60 * 1000))).toBe("5h ago");
    expect(formatRelativeTime(ago(23 * 60 * 60 * 1000))).toBe("23h ago");
  });

  it("returns 'Xd ago' beyond 24 hours", () => {
    expect(formatRelativeTime(ago(24 * 60 * 60 * 1000))).toBe("1d ago");
    expect(formatRelativeTime(ago(18 * 24 * 60 * 60 * 1000))).toBe("18d ago");
  });
});

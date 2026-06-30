/**
 * The simulated mission clock. Kept as a plain module singleton — NOT React
 * state — because it advances every animation frame; routing that through
 * React would re-render the whole tree 60×/second. UI surfaces sample it on a
 * cheap interval instead.
 */
class SimClock {
  /** Current simulated time, ms since epoch. */
  nowMs = Date.now();
  private lastWall = performance.now();

  /** Advance by real elapsed time × `rate`. Returns the new simulated time. */
  advance(rate: number): number {
    const wall = performance.now();
    // Clamp the per-frame step so returning from a backgrounded tab (where
    // rAF was paused) doesn't fling the simulated clock across days at once.
    const dt = Math.min(wall - this.lastWall, 1000);
    this.nowMs += dt * rate;
    this.lastWall = wall;
    return this.nowMs;
  }

  /** Keep the wall-clock reference fresh without advancing (e.g. on resume). */
  touch(): void {
    this.lastWall = performance.now();
  }

  /** Jump the simulated clock by a signed delta in milliseconds. */
  jump(deltaMs: number): void {
    this.nowMs += deltaMs;
  }

  /** Snap back to the real present. */
  reset(): void {
    this.nowMs = Date.now();
    this.lastWall = performance.now();
  }

  date(): Date {
    return new Date(this.nowMs);
  }
}

export const simClock = new SimClock();

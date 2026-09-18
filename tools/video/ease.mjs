// Easing + interpolation for camera moves.
//
// A promo shot lives or dies on how the camera accelerates. Linear moves read
// as machine output — which is exactly what they are — so every move here
// starts and ends at rest unless a shot explicitly asks otherwise.

export const EASES = {
  linear: (t) => t,
  // The workhorse: slow out of rest, slow into rest. Use for any move that
  // both begins and ends inside a single shot.
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  // Decelerating only. Use when the shot cuts IN mid-move — the audience
  // never sees the start, so easing in would waste the first half-second.
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
  // Accelerating only. Use when the shot cuts OUT mid-move (a pull-back that
  // hands over to the next cut while still moving).
  inCubic: (t) => t * t * t,
  // Very slow, near-constant drift — the "it is barely moving but it IS
  // moving" feel that makes a static hero shot read as live footage.
  drift: (t) => t,
};

export function ease(name, t) {
  const fn = EASES[name] || EASES.inOutCubic;
  return fn(Math.max(0, Math.min(1, t)));
}

/** Interpolate every numeric key shared by `from` and `to`. */
export function lerpKeys(from, to, k) {
  const out = {};
  for (const key of Object.keys(from)) {
    const a = from[key];
    const b = to?.[key];
    out[key] = Number.isFinite(b) ? a + (b - a) * k : a;
  }
  return out;
}

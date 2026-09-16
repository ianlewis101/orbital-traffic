/**
 * Two-body heliocentric propagation for near-Earth objects, reduced to a
 * geocentric equatorial vector for display. Earth's own position uses a
 * circular approximation — plenty for a display where NEOs are projected
 * onto a fixed-radius shell anyway.
 */
export const GM_SUN = 2.959122e-4; // AU³/day²
export const AU_KM = 1.496e8;

/** Unix ms -> Julian Day. */
export function julianDay(dateMs) {
  return dateMs / 86400000 + 2440587.5;
}

/**
 * Earth's heliocentric ecliptic position (AU).
 *
 * Extracted from neoGeocentric() so the deep-space distance model
 * (astro/deep-space.js) can reuse it: turning a heliocentric position into a
 * distance from the observer needs Earth's own position for exactly the same
 * reason a NEO does. z is always 0 — the ecliptic is Earth's orbital plane by
 * definition — but it is returned explicitly so callers can subtract a full
 * vector without special-casing the component.
 *
 * NOTE THE SIGN. `280.46 + 36000.771·T` is the SUN'S geometric mean longitude
 * as seen from Earth, so (cos L, sin L) is the direction Earth→Sun — the exact
 * negative of the Sun→Earth vector this function owes its callers. The
 * extracted-from version returned it unnegated, which put Earth on the far side
 * of the Sun, a 2 AU error. Nothing pointed at it because the only consumer was
 * a NEO cloud projected onto a fixed-radius display shell, where a wrong
 * direction still yields a plausible-looking sky full of dots; it showed up the
 * moment a real distance had to be printed. neos.json's own `nl` close-approach
 * figures are the regression test (test/neo-geometry.test.js): before the fix
 * every NEO came out ~780 lunar distances away at closest approach instead of
 * the catalogued 13–66.
 *
 * The circular approximation is upgraded to Meeus's equation of centre at the
 * same time (Astronomical Algorithms, ch. 25). Earth's orbit is eccentric
 * enough (e ≈ 0.0167) to swing the true longitude ~1.9° either side of the mean
 * and the radius ±1.7%, which is small against a NEO's shell but not against a
 * close approach measured in lunar distances.
 */
export function earthHelio(JD) {
  const T = (JD - 2451545.0) / 36525.0;
  const D2R = Math.PI / 180;
  // Sun's geometric mean longitude and Earth's mean anomaly.
  const L0 = (280.46646 + 36000.76983 * T + 0.0003032 * T * T) * D2R;
  const M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) * D2R;
  // Equation of centre, mean anomaly -> true anomaly.
  const C =
    ((1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) +
      (0.019993 - 0.000101 * T) * Math.sin(2 * M) +
      0.000289 * Math.sin(3 * M)) *
    D2R;
  const ecc = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;
  const nu = M + C;
  const R = (1.000001018 * (1 - ecc * ecc)) / (1 + ecc * Math.cos(nu)); // Sun-Earth distance, AU
  const sunLong = L0 + C; // Sun's true geocentric longitude
  // Earth as seen from the Sun is 180° round from the Sun as seen from Earth.
  return { x: -R * Math.cos(sunLong), y: -R * Math.sin(sunLong), z: 0 };
}

export function solveKepler(M, e) {
  let E = M;
  for (let i = 0; i < 80; i++) {
    const dE = (M - E + e * Math.sin(E)) / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  return E;
}

/** Geocentric equatorial position (km) of a NEO from its orbital elements. */
export function neoGeocentric(elem, dateMs) {
  const JD = julianDay(dateMs);
  const dt = JD - elem.epoch;
  const n = Math.sqrt(GM_SUN / Math.pow(elem.a, 3));
  const M = ((elem.ma * Math.PI) / 180 + n * dt) % (Math.PI * 2);
  const E = solveKepler(M < 0 ? M + Math.PI * 2 : M, elem.e);
  const nu =
    2 * Math.atan2(Math.sqrt(1 + elem.e) * Math.sin(E / 2), Math.sqrt(1 - elem.e) * Math.cos(E / 2));
  const r = elem.a * (1 - elem.e * Math.cos(E));
  const xo = r * Math.cos(nu),
    yo = r * Math.sin(nu);
  const cO = Math.cos((elem.om * Math.PI) / 180),
    sO = Math.sin((elem.om * Math.PI) / 180);
  const ci = Math.cos((elem.i * Math.PI) / 180),
    si = Math.sin((elem.i * Math.PI) / 180);
  const cw = Math.cos((elem.w * Math.PI) / 180),
    sw = Math.sin((elem.w * Math.PI) / 180);
  const xH = (cO * cw - sO * sw * ci) * xo + (-cO * sw - sO * cw * ci) * yo;
  const yH = (sO * cw + cO * sw * ci) * xo + (-sO * sw + cO * cw * ci) * yo;
  const zH = sw * si * xo + cw * si * yo;
  // Earth heliocentric (circular approx). Named `earth`, not `E` — the
  // eccentric anomaly above already owns that letter in this scope.
  const earth = earthHelio(JD);
  // Geocentric ecliptic → equatorial
  const eps = (23.439 * Math.PI) / 180;
  const dx = (xH - earth.x) * AU_KM,
    dy = (yH - earth.y) * AU_KM,
    dz = (zH - earth.z) * AU_KM;
  return { x: dx, y: dy * Math.cos(eps) - dz * Math.sin(eps), z: dy * Math.sin(eps) + dz * Math.cos(eps) };
}

/**
 * Two-body heliocentric propagation for near-Earth objects, reduced to a
 * geocentric equatorial vector for display. Earth's own position uses a
 * circular approximation — plenty for a display where NEOs are projected
 * onto a fixed-radius shell anyway.
 */
export const GM_SUN = 2.959122e-4; // AU³/day²
export const AU_KM = 1.496e8;

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
  const JD = dateMs / 86400000 + 2440587.5;
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
  // Earth heliocentric (circular approx)
  const T = (JD - 2451545.0) / 36525.0;
  const LE = ((280.46 + 36000.771 * T) * Math.PI) / 180;
  const xE = Math.cos(LE),
    yE = Math.sin(LE);
  // Geocentric ecliptic → equatorial
  const eps = (23.439 * Math.PI) / 180;
  const dx = (xH - xE) * AU_KM,
    dy = (yH - yE) * AU_KM,
    dz = zH * AU_KM;
  return { x: dx, y: dy * Math.cos(eps) - dz * Math.sin(eps), z: dy * Math.sin(eps) + dz * Math.cos(eps) };
}

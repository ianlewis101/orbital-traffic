/** Unit sun direction in ECI coordinates for a given date. */
export function sunDirECI(date) {
  const JD = date.getTime() / 86400000 + 2440587.5,
    d = JD - 2451545.0;
  const g = ((357.529 + 0.98560028 * d) * Math.PI) / 180,
    q = ((280.459 + 0.98564736 * d) * Math.PI) / 180;
  const L = q + ((1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * Math.PI) / 180;
  const e = ((23.439 - 0.00000036 * d) * Math.PI) / 180;
  return { x: Math.cos(L), y: Math.cos(e) * Math.sin(L), z: Math.sin(e) * Math.sin(L) };
}

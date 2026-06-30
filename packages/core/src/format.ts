import { GEO_ALTITUDE_KM } from './constants.js';

const KM_TO_MI = 0.621371;

/** Integer with thousands separators, e.g. 12345 → "12,345". */
export function formatInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** Distance in km, e.g. "418 km". */
export function formatKm(km: number, digits = 0): string {
  return `${km.toLocaleString('en-US', { maximumFractionDigits: digits })} km`;
}

/** Distance in miles, e.g. "260 mi". */
export function formatMi(km: number, digits = 0): string {
  return `${(km * KM_TO_MI).toLocaleString('en-US', { maximumFractionDigits: digits })} mi`;
}

/** Speed from km/s, e.g. "7.66 km/s". */
export function formatSpeedKmS(kmS: number): string {
  return `${kmS.toFixed(2)} km/s`;
}

/** Speed from km/s expressed in mph, e.g. "17,130 mph". */
export function formatSpeedMph(kmS: number): string {
  return `${formatInt(kmS * 3600 * KM_TO_MI)} mph`;
}

/** Orbital period in minutes → "92 min" or "1h 36m" for long periods. */
export function formatPeriod(minutes: number): string {
  if (minutes < 100) return `${minutes.toFixed(0)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

/** Sub-satellite point, e.g. "51.6°N · 0.1°W". */
export function formatLatLon(latDeg: number, lonDeg: number): string {
  const ns = latDeg >= 0 ? 'N' : 'S';
  const ew = lonDeg >= 0 ? 'E' : 'W';
  return `${Math.abs(latDeg).toFixed(1)}°${ns} · ${Math.abs(lonDeg).toFixed(1)}°${ew}`;
}

export type OrbitRegime = 'LEO' | 'MEO' | 'GEO' | 'HEO';

/** Coarse orbit-regime label from altitude (km). */
export function orbitRegime(altitudeKm: number): OrbitRegime {
  if (altitudeKm < 2000) return 'LEO';
  if (Math.abs(altitudeKm - GEO_ALTITUDE_KM) < 1500) return 'GEO';
  if (altitudeKm < 35786) return 'MEO';
  return 'HEO';
}

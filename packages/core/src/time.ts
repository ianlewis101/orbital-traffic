/** Time / calendar helpers used by the orbital math. */

const UNIX_EPOCH_JD = 2440587.5;
const MS_PER_DAY = 86400000;

/** Convert a JS Date to a Julian Date. */
export function dateToJulian(date: Date): number {
  return date.getTime() / MS_PER_DAY + UNIX_EPOCH_JD;
}

/** Convert a Julian Date to a JS Date. */
export function julianToDate(jd: number): Date {
  return new Date((jd - UNIX_EPOCH_JD) * MS_PER_DAY);
}

/** Clamp a value into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

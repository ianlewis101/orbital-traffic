/**
 * Distance/speed formatting in the user's chosen unit system.
 *
 * The app was imperial-only, with `MI = 0.621371` hardcoded in ui/info.js and
 * applied inline at each telemetry field. These helpers centralise that so the
 * Settings units toggle has one place to act on, and so the overhead list and
 * the info card can't drift apart.
 *
 * Scope note: ui/describe.js's hand-written prose ("340 miles up",
 * "22,236 miles up") is deliberately NOT routed through here. Those are
 * curated sentences, not formatted measurements, and making them unit-aware
 * means rewriting copy rather than swapping a formatter.
 *
 * Every function here returns digits, separators, a decimal point and a fixed
 * unit word — never an HTML metacharacter — which is why they're safe to
 * interpolate into innerHTML and are enumerated in
 * eslint-rules/no-unescaped-innerhtml.js's SAFE_FUNCTIONS.
 */
import { settings } from "../settings.js";

const MI_PER_KM = 0.621371;

function isMetric() {
  return settings.units === "metric";
}

function localized(n, digits) {
  return n.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

/** Bare converted number + unit, no suffix wording — e.g. "254 mi" / "409 km". */
export function fmtDistance(km, digits = 0) {
  return isMetric() ? `${localized(km, digits)} km` : `${localized(km * MI_PER_KM, digits)} mi`;
}

/** Altitude with "up" wording, matching the info card's telemetry grid. */
export function fmtAltitude(km, digits = 0) {
  return isMetric()
    ? `${localized(km, digits)} km up`
    : `${localized(km * MI_PER_KM, digits)} mi up`;
}

/** Orbital speed. Input is km/s (what satellite.js's velocity vector gives). */
export function fmtSpeed(kmPerSec, digits = 0) {
  const perHour = kmPerSec * 3600;
  return isMetric()
    ? `${localized(perHour, digits)} km/h`
    : `${localized(perHour * MI_PER_KM, digits)} mph`;
}

/**
 * The unit word on its own, for call sites that render the number and the
 * unit in separate elements (the info card's <small> suffix spans).
 */
export function distanceUnit() {
  return isMetric() ? "km" : "mi";
}

/** Converted magnitude with no unit word — for those same split call sites. */
export function toDistance(km, digits = 0) {
  return localized(isMetric() ? km : km * MI_PER_KM, digits);
}

/**
 * Interplanetary distances, scaled to a word — "25.7 billion km",
 * "1.5 million km", "16.0 billion mi".
 *
 * fmtDistance() is right up to geostationary but falls apart past it: the
 * deep-space search rows (ui/deep-space.js) deal in figures like 25,708,431,776
 * km, and a fourteen-digit run of separators is unreadable on a phone and wraps
 * the row. Scaling happens after the unit conversion, so the threshold applies
 * to the number actually shown — a figure can read "1.5 million km" and
 * "932,057 mi", which is correct rather than inconsistent.
 */
export function fmtBigDistance(km) {
  if (!Number.isFinite(km)) return "—";
  const v = isMetric() ? km : km * MI_PER_KM;
  const unit = distanceUnit();
  const mag = Math.abs(v);
  if (mag >= 1e9) return `${localized(v / 1e9, 1)} billion ${unit}`;
  if (mag >= 1e6) return `${localized(v / 1e6, 1)} million ${unit}`;
  if (mag >= 1e4) {
    // Three significant figures, not six. A value landing here is one that
    // scaled below "million" on the way through a unit conversion — Webb's
    // nominal 1.5 million km becomes 932,057 mi, which reads as a survey-grade
    // measurement of a figure that is explicitly a round approximation. Imperial
    // is the default unit, so this is the rendering most users actually see.
    const step = Math.pow(10, Math.floor(Math.log10(mag)) - 2);
    return `${localized(Math.round(v / step) * step, 0)} ${unit}`;
  }
  return `${localized(v, 0)} ${unit}`;
}

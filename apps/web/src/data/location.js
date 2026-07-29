/**
 * Device location, for "What's Overhead".
 *
 * This is the only feature in the app that reads the user's position, and the
 * coordinates never leave the device: the overhead sweep is pure client-side
 * SGP4 plus look-angle geometry (astro/overhead.js). Nothing is sent to the
 * Worker, nothing is persisted. Each tap fetches a fresh fix and discards it.
 *
 * The one thing that *is* persisted is a "the user said no" flag, so a denied
 * permission doesn't mean re-prompting on every tap. Browsers already suppress
 * repeat prompts after a denial, which means a naive retry loop just produces
 * a silent failure the user can't explain — the flag lets the UI say what
 * actually happened and point at Settings, where it can be cleared.
 *
 * Deliberately NOT a resurrection of any part of Pass Alerts: no prediction,
 * no notifications, no background access, no Worker round-trip.
 */
import { settings, saveSettings } from "../settings.js";

const TIMEOUT_MS = 10000;

/**
 * Why a location request failed. Callers branch on this rather than on the
 * raw GeolocationPositionError code, so the "did the user refuse, or did the
 * hardware just not answer in time" distinction stays explicit.
 */
export const LOCATION_ERRORS = {
  UNSUPPORTED: "unsupported",
  DENIED: "denied", // refused now, or refused earlier and still flagged
  UNAVAILABLE: "unavailable", // position unavailable / timed out — transient
};

export class LocationError extends Error {
  constructor(reason, message) {
    super(message);
    this.name = "LocationError";
    this.reason = reason;
  }
}

/** Has the user previously refused? */
export function locationDenied() {
  return settings.locationPermissionDenied === true;
}

/**
 * Clear the remembered refusal so the next request goes through the normal
 * getCurrentPosition flow again. This cannot force an OS-level dialog to
 * reappear if the platform has hard-blocked the app — it only removes *our*
 * short-circuit, which is the part we control.
 */
export function clearLocationDenied() {
  saveSettings({ locationPermissionDenied: false });
}

function supported() {
  return typeof navigator !== "undefined" && !!navigator.geolocation;
}

/**
 * Best-available permission state for the Settings display:
 * "granted" | "denied" | "prompt" | "unsupported".
 *
 * Prefers the Permissions API, which can distinguish "already granted" from
 * "never asked" without triggering a prompt. Support is uneven — older Safari
 * has no navigator.permissions at all, and some engines reject the
 * geolocation descriptor — so every failure path falls back to what we
 * persisted ourselves, which is always available and never lies about a
 * denial.
 */
export async function locationStatus() {
  if (!supported()) return "unsupported";
  if (locationDenied()) return "denied";
  try {
    const res = await navigator.permissions?.query({ name: "geolocation" });
    if (res && (res.state === "granted" || res.state === "denied" || res.state === "prompt")) {
      return res.state;
    }
  } catch {
    // No Permissions API, or the geolocation descriptor isn't recognised.
  }
  return "prompt";
}

/**
 * One-shot position fix. Resolves {lat, lon}; rejects with a LocationError
 * carrying one of LOCATION_ERRORS.
 *
 * enableHighAccuracy is off on purpose: GPS-grade precision costs battery and
 * seconds, and it buys nothing here — a satellite's horizon footprint is
 * hundreds of kilometres across, so a coarse network fix puts every object in
 * the same list a precise one would.
 */
export function requestLocation() {
  if (!supported()) {
    return Promise.reject(
      new LocationError(LOCATION_ERRORS.UNSUPPORTED, "Location isn't available on this device")
    );
  }
  // Short-circuit a known refusal: calling getCurrentPosition here would sit
  // silently until it times out on most browsers, which reads as a bug.
  if (locationDenied()) {
    return Promise.reject(
      new LocationError(LOCATION_ERRORS.DENIED, "Location access was previously denied")
    );
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => {
        // Code 1 (PERMISSION_DENIED) is a decision and is remembered. Codes 2
        // (POSITION_UNAVAILABLE) and 3 (TIMEOUT) are transient conditions —
        // flagging those would lock a user out of the feature because their
        // GPS happened to be cold once.
        if (err && err.code === 1) {
          saveSettings({ locationPermissionDenied: true });
          reject(new LocationError(LOCATION_ERRORS.DENIED, "Location access denied"));
          return;
        }
        reject(new LocationError(LOCATION_ERRORS.UNAVAILABLE, "Couldn't get your location"));
      },
      { enableHighAccuracy: false, timeout: TIMEOUT_MS, maximumAge: 0 }
    );
  });
}

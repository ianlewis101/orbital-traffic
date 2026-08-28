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
 *
 * Goes through @capacitor/geolocation rather than calling
 * navigator.geolocation directly. On the web/PWA build its web
 * implementation IS navigator.geolocation, byte-for-byte the same calls and
 * error shapes as before — but inside the iOS app it routes to CoreLocation
 * instead, which shows the native "Orbital Traffic Would Like to Use Your
 * Location" prompt (NSLocationWhenInUseUsageDescription, below) rather than
 * WKWebView's own per-origin permission dialog, which identifies the app by
 * its WKWebView origin ("localhost") instead of its name.
 */
import { Geolocation } from "@capacitor/geolocation";
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
 * checkPermissions() never itself triggers a prompt — on the web build it's
 * backed by the Permissions API (same as before), and on iOS it reads
 * CoreLocation's current authorization status. Support is uneven — older
 * Safari has no Permissions API at all, and some engines reject the
 * geolocation descriptor — so every failure path falls back to what we
 * persisted ourselves, which is always available and never lies about a
 * denial.
 */
export async function locationStatus() {
  if (!supported()) return "unsupported";
  if (locationDenied()) return "denied";
  try {
    const res = await Geolocation.checkPermissions();
    if (res.location === "granted" || res.location === "denied") return res.location;
    if (res.location === "prompt" || res.location === "prompt-with-rationale") return "prompt";
  } catch {
    // No Permissions API, geolocation descriptor isn't recognised, or (iOS)
    // system location services are off.
  }
  return "prompt";
}

// Permission-denied markers across both error shapes getCurrentPosition can
// reject with: the browser's GeolocationPositionError.code (1 ==
// PERMISSION_DENIED) on the web build, or the plugin's own error code on iOS.
const DENIED_ERROR_CODE = 1;
const DENIED_NATIVE_CODE = "OS-PLUG-GLOC-0003";

/**
 * One-shot position fix. Resolves {lat, lon}; rejects with a LocationError
 * carrying one of LOCATION_ERRORS.
 *
 * enableHighAccuracy is off on purpose: GPS-grade precision costs battery and
 * seconds, and it buys nothing here — a satellite's horizon footprint is
 * hundreds of kilometres across, so a coarse network fix puts every object in
 * the same list a precise one would.
 */
export async function requestLocation() {
  if (!supported()) {
    throw new LocationError(LOCATION_ERRORS.UNSUPPORTED, "Location isn't available on this device");
  }
  // Short-circuit a known refusal: calling getCurrentPosition here would sit
  // silently until it times out on most browsers, which reads as a bug.
  if (locationDenied()) {
    throw new LocationError(LOCATION_ERRORS.DENIED, "Location access was previously denied");
  }

  try {
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: false,
      timeout: TIMEOUT_MS,
      maximumAge: 0,
    });
    return { lat: pos.coords.latitude, lon: pos.coords.longitude };
  } catch (err) {
    // A denial is a decision and is remembered. Anything else (position
    // unavailable, timeout, a cold GPS) is transient — flagging those would
    // lock a user out of the feature over a one-off hiccup.
    if (err && (err.code === DENIED_ERROR_CODE || err.code === DENIED_NATIVE_CODE)) {
      saveSettings({ locationPermissionDenied: true });
      throw new LocationError(LOCATION_ERRORS.DENIED, "Location access denied");
    }
    throw new LocationError(LOCATION_ERRORS.UNAVAILABLE, "Couldn't get your location");
  }
}

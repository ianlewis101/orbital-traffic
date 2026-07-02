import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { WORKER_BASE } from "../config.js";

const STORAGE_ENABLED_KEY = "passAlertsEnabled";
const STORAGE_COORDS_KEY = "passAlertsCoords";
const NOTIFICATION_ID_BASE = 9000; // arbitrary namespace, keeps us from colliding with future notification types
const LEAD_MINUTES = 15;

/** True only inside the native iOS/Android shell — this feature does not exist on the web build. */
export function passAlertsAvailable() {
  return Capacitor.isNativePlatform();
}

export function passAlertsEnabled() {
  return localStorage.getItem(STORAGE_ENABLED_KEY) === "1";
}

async function cancelScheduled() {
  const pending = await LocalNotifications.getPending();
  const ours = pending.notifications.filter(
    (n) => n.id >= NOTIFICATION_ID_BASE && n.id < NOTIFICATION_ID_BASE + 100
  );
  if (ours.length) {
    await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
  }
}

async function scheduleFromPasses(passes) {
  await cancelScheduled();
  const notifications = passes
    .slice(0, 5)
    .map((p, i) => {
      const riseAt = new Date(p.riseAt).getTime();
      const fireAt = new Date(riseAt - LEAD_MINUTES * 60 * 1000);
      return {
        id: NOTIFICATION_ID_BASE + i,
        title: "ISS overhead soon",
        body: `The ISS rises in ${LEAD_MINUTES} minutes, reaching ${Math.round(p.maxElevationDeg)}° above the horizon.`,
        schedule: { at: fireAt },
      };
    })
    .filter((n) => n.schedule.at.getTime() > Date.now());

  if (notifications.length) {
    await LocalNotifications.schedule({ notifications });
  }
  return notifications.length;
}

async function fetchPasses(latitude, longitude) {
  const res = await fetch(`${WORKER_BASE}/passes?lat=${latitude}&lng=${longitude}`, { cache: "no-store" });
  if (!res.ok) throw new Error("passes_unavailable");
  const { passes } = await res.json();
  return passes || [];
}

/**
 * Turn pass alerts on: requests notification + location permission, fetches
 * upcoming passes, and schedules local notifications for the next few.
 * @returns {Promise<{ok: true, scheduled: number} | {ok: false, reason: string}>}
 */
export async function enablePassAlerts() {
  if (!passAlertsAvailable()) return { ok: false, reason: "not_native" };

  const perm = await LocalNotifications.requestPermissions();
  if (perm.display !== "granted") return { ok: false, reason: "permission_denied" };

  let coords;
  try {
    coords = await new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 15000 })
    );
  } catch {
    return { ok: false, reason: "location_denied" };
  }

  const { latitude, longitude } = coords.coords;
  try {
    const passes = await fetchPasses(latitude, longitude);
    const scheduled = await scheduleFromPasses(passes);
    localStorage.setItem(STORAGE_ENABLED_KEY, "1");
    localStorage.setItem(STORAGE_COORDS_KEY, JSON.stringify({ latitude, longitude }));
    return { ok: true, scheduled };
  } catch {
    return { ok: false, reason: "passes_unavailable" };
  }
}

export async function disablePassAlerts() {
  await cancelScheduled();
  localStorage.removeItem(STORAGE_ENABLED_KEY);
}

/**
 * Call on app start. If alerts were left on from a previous session,
 * re-fetch passes with fresh TLE data and reschedule — local notifications
 * don't self-renew, so this needs to run roughly once per app open.
 * Best-effort: leaves the existing schedule alone on failure.
 */
export async function refreshPassAlertsIfEnabled() {
  if (!passAlertsAvailable() || !passAlertsEnabled()) return;
  const saved = localStorage.getItem(STORAGE_COORDS_KEY);
  if (!saved) return;
  try {
    const { latitude, longitude } = JSON.parse(saved);
    const passes = await fetchPasses(latitude, longitude);
    await scheduleFromPasses(passes);
  } catch {
    /* keep the existing schedule in place */
  }
}

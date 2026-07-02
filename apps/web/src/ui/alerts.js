import { $ } from "../state.js";
import {
  passAlertsAvailable,
  passAlertsEnabled,
  enablePassAlerts,
  disablePassAlerts,
} from "../native/passAlerts.js";

const REASON_TEXT = {
  location_denied: "Location permission needed",
  permission_denied: "Notification permission needed",
  passes_unavailable: "Couldn't reach the server — try again",
};

export function initPassAlerts() {
  const toggle = $("#alerts-toggle");
  const status = $("#alerts-status");
  if (!toggle || !status) return;

  if (!passAlertsAvailable()) {
    status.textContent = "Available in the iOS/Android app";
    toggle.disabled = true;
    return;
  }

  toggle.checked = passAlertsEnabled();
  status.textContent = toggle.checked ? "Alerts on" : "Alerts off";

  toggle.addEventListener("change", async () => {
    toggle.disabled = true;
    if (toggle.checked) {
      status.textContent = "Finding your location…";
      const result = await enablePassAlerts();
      if (result.ok) {
        status.textContent =
          result.scheduled > 0 ? `${result.scheduled} pass alert(s) scheduled` : "No passes found in the next 48h";
      } else {
        toggle.checked = false;
        status.textContent = REASON_TEXT[result.reason] || "Couldn't schedule alerts";
      }
    } else {
      await disablePassAlerts();
      status.textContent = "Alerts off";
    }
    toggle.disabled = false;
  });
}

/**
 * Share-card orchestration: gather the model, capture the globe, compose the
 * image, then hand it to the platform.
 */
import * as satellite from "satellite.js";
import { CATS, catColorHex } from "../config.js";
import { subpoint } from "../astro/overhead.js";
import { toDistance, distanceUnit, fmtSpeed } from "../util/units.js";
import { orbitRingPoints } from "../scene/trail.js";
import { describe } from "../ui/describe.js";
import { captureGlobe } from "./capture.js";
import { composeCard, ensureFonts } from "./compose.js";
import { formatDesignation, shareFilename } from "./layout.js";

const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function utcStamp(date) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${date.getUTCDate()} ${MON3[date.getUTCMonth()]} ${date.getUTCFullYear()}` +
    `  ·  ${p(date.getUTCHours())}:${p(date.getUTCMinutes())} UTC`
  );
}

/**
 * Live telemetry for the card, derived exactly the way ui/info.js's
 * refreshInfo() does — same subpoint() for altitude, same velocity magnitude
 * from satellite.propagate(), same unit formatters — so a shared image can't
 * disagree with the info card it was taken from, and the user's km/miles
 * preference is honoured.
 */
export function shareStats(sat, date) {
  const sp = subpoint(sat.rec, date);
  if (!sp) return null;
  let speed = null;
  try {
    const vel = satellite.propagate(sat.rec, date).velocity;
    if (vel) speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
  } catch {
    speed = null;
  }
  return [
    { label: "Altitude", value: `${toDistance(sp.alt)} ${distanceUnit()}` },
    { label: "Speed", value: speed == null ? "—" : fmtSpeed(speed) },
  ];
}

/** Build the plain data model the composer draws. */
export function shareModel(sat, date) {
  const stats = shareStats(sat, date);
  if (!stats) return null;
  return {
    name: sat.name,
    catLabel: (CATS[sat.cat] || CATS.other).label,
    catColor: catColorHex(sat.cat),
    // sat.desig is the designator ingest() kept off TLE line 1; satellite.js
    // v5's satrec no longer carries one (see info.js's launchInfo()).
    norad: formatDesignation(sat.id, sat.desig || (sat.rec && sat.rec.intldesg)),
    description: describe(sat),
    stats,
    timestamp: utcStamp(date),
    ringPoints: orbitRingPoints(sat, date),
  };
}

/** Render the share card for `sat` to a PNG Blob, or null if it can't be built. */
export async function buildShareImage(sat, date) {
  if (!sat || sat._neo || !sat.rec || !sat._p) return null;
  const model = shareModel(sat, date);
  if (!model) return null;

  await ensureFonts();
  // Capture must happen after the font wait: awaiting inside the GL sequence
  // would let frames render with the capture's scaled point sizes still applied.
  let capture = captureGlobe(sat, date);
  if (!capture) {
    // A supersampled target can fail to allocate on memory-constrained devices;
    // 1× still produces a usable card.
    capture = captureGlobe(sat, date, 1);
  }
  if (!capture) return null;

  const canvas = composeCard(capture, model);
  const blob = await new Promise((resolve) => {
    if (canvas.toBlob) canvas.toBlob(resolve, "image/png");
    else resolve(null);
  });
  return blob ? { blob, filename: shareFilename(sat.name), name: sat.name } : null;
}

/** Running inside the Capacitor iOS wrapper? */
function isNativeWrapper() {
  const c = typeof window !== "undefined" && window.Capacitor;
  return !!(c && (typeof c.isNativePlatform !== "function" || c.isNativePlatform()));
}

/**
 * Hand a built card to the platform.
 *
 * Returns "shared" | "downloaded" | "preview" | "cancelled" so the caller can
 * decide what to tell the user. The preview path exists because neither
 * navigator.share(files) nor <a download> is dependable inside WKWebView: a
 * dead download link there fails silently, so the image is shown full-screen
 * with press-and-hold-to-save guidance instead.
 *
 * A native share sheet via @capacitor/share + @capacitor/filesystem would be
 * better on iOS, but adds native dependencies that can't be built or verified
 * from this environment — tracked as a follow-up in docs/audit-status.md.
 */
export async function shareImage(built) {
  const { blob, filename, name } = built;
  const file =
    typeof File === "function" ? new File([blob], filename, { type: "image/png" }) : null;

  if (file && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], title: `${name} · Orbital Traffic` });
      return "shared";
    } catch (e) {
      if (e && e.name === "AbortError") return "cancelled";
      // Fall through to the non-share paths below.
    }
  }

  if (isNativeWrapper()) return "preview";

  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return "downloaded";
  } catch {
    return "preview";
  }
}

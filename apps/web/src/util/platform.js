/**
 * Which shell is this code running in?
 *
 * One home for all of these on purpose. isNativeWrapper() already existed as
 * a private helper inside share/index.js, and the App Store banner needs the
 * same question answered — a second copy is exactly the drift CLAUDE.md's
 * shared-utility rule exists to prevent, since the two would be edited
 * independently the first time Capacitor changes how it announces itself.
 *
 * Every probe here reads a signal that is unreliable by nature: user-agent
 * strings are declarations rather than facts, and any of these globals can be
 * missing entirely (SSR, a test environment, a locked-down webview). So each
 * one is wrapped and fails to `false` rather than throwing — a wrong `false`
 * costs a nudge nobody sees, while an exception here would take out whatever
 * boot step called it.
 */

/** The user-agent string, or "" if there isn't one to read. */
function ua() {
  try {
    return navigator?.userAgent || "";
  } catch {
    return "";
  }
}

/** Running inside the Capacitor iOS wrapper? */
export function isNativeWrapper() {
  try {
    const c = typeof window !== "undefined" && window.Capacitor;
    return !!(c && (typeof c.isNativePlatform !== "function" || c.isNativePlatform()));
  } catch {
    return false;
  }
}

/**
 * iPhone, iPad or iPod — the only platforms where an App Store link leads
 * anywhere installable.
 *
 * The second test is not redundant: iPadOS 13+ ships "Request Desktop
 * Website" on by default, and the desktop UA it sends carries a Macintosh
 * token with no iPad in it at all. A Mac with a touchscreen doesn't exist, so
 * Macintosh + multi-touch is an iPad in desktop mode.
 */
export function isIOS() {
  const s = ua();
  if (/\b(iPhone|iPad|iPod)\b/.test(s)) return true;
  try {
    return /\bMacintosh\b/.test(s) && (navigator?.maxTouchPoints || 0) > 1;
  } catch {
    return false;
  }
}

/**
 * Launched from the Home Screen (installed PWA) rather than a browser tab?
 *
 * navigator.standalone is Safari's own non-standard flag and the only signal
 * older iOS gives; display-mode covers everything current. Someone who has
 * already installed this to their Home Screen has made their choice about how
 * they want to run it.
 */
export function isStandalone() {
  try {
    if (navigator?.standalone === true) return true;
    return !!window.matchMedia?.("(display-mode: standalone)").matches;
  } catch {
    return false;
  }
}

/**
 * Product tokens for iOS browsers and in-app webviews that never render
 * Apple's Smart App Banner.
 *
 * Safari draws that banner itself from index.html's `apple-itunes-app` meta
 * tag; every browser below renders the page without it, as does every
 * WKWebView embedded in another app. None of these tokens appears in Mobile
 * Safari's own user agent, which is what makes a positive match here safe.
 *
 * Positive-match-only is deliberate, and so is the bias. Wrongly deciding a
 * real Safari lacks the banner shows two banners at once, which is visibly
 * broken; wrongly deciding an alternative browser has one just costs a nudge
 * nobody would have noticed. So this list only grows by adding a token that
 * has been confirmed against that product's real UA — never by inferring
 * "not Safari" from the absence of something.
 */
const NO_SMART_BANNER_TOKENS = [
  // Alternative browsers
  "CriOS", // Chrome
  "FxiOS", // Firefox
  "EdgiOS", // Edge
  "OPiOS", // Opera Mini
  "OPT/", // Opera Touch
  "DuckDuckGo", // DuckDuckGo Browser
  "YaBrowser", // Yandex
  // In-app webviews, where a shared link most often lands
  "FBAN", // Facebook / Messenger
  "FBAV", // Facebook / Messenger
  "Instagram",
  "Snapchat",
  "Twitter", // X ("Twitter for iPhone")
  "LinkedInApp",
  "Pinterest/",
  "Line/", // LINE
];

/** On iOS, in a browser where Apple's Smart App Banner will never appear? */
export function smartBannerUnsupported() {
  if (!isIOS()) return false;
  const s = ua();
  return NO_SMART_BANNER_TOKENS.some((t) => s.includes(t));
}

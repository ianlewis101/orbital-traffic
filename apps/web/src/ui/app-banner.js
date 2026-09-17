/**
 * "Get the iOS app" banner — the fallback half of a two-part answer.
 *
 * Safari on iOS/iPadOS gets Apple's own Smart App Banner, declared as the
 * `apple-itunes-app` meta tag in index.html. That one is strictly better than
 * anything a page can build: Safari knows whether the app is already
 * installed and offers OPEN instead of GET accordingly, which no web API can
 * detect, and it remembers its own dismissal. So this module deliberately
 * stays out of its way and renders only where it will never appear — Chrome/
 * Firefox/Edge on iOS, and the in-app webviews a shared link usually opens in
 * (see util/platform.js's token list).
 *
 * The two are mutually exclusive by construction. Showing both at once is the
 * one failure mode worth designing against, which is why the platform probe
 * only ever fires on a positive match for a known non-Safari iOS browser.
 *
 * Not shown: inside our own Capacitor build (absurd — they're in the app), to
 * an installed PWA (they chose their shell), anywhere off iOS (there is no
 * Android app, and a desktop visitor can't act on it), or after a dismissal.
 * Settings › About keeps a permanent link so dismissing isn't a dead end.
 */
import { $ } from "../state.js";
import { settings, saveSettings } from "../settings.js";
import { isIOS, isNativeWrapper, isStandalone, smartBannerUnsupported } from "../util/platform.js";

/**
 * The App Store listing, as one declared source.
 *
 * The ID is immutable for the life of the app, so this is a constant rather
 * than build-time machinery — but it is hand-copied into three surfaces JS
 * can't reach: the `apple-itunes-app` meta tag and the banner's own href in
 * index.html, plus welcome.html's download buttons. test/app-banner.test.js
 * asserts every one of them still matches this, so a wrong ID fails the build
 * instead of shipping a banner that leads to someone else's app.
 */
export const APP_STORE_ID = "6788125984";
export const APP_STORE_URL = `https://apps.apple.com/us/app/orbital-traffic/id${APP_STORE_ID}`;

/** Matches the CSS transition on #app-banner.dismissed. */
const DISMISS_MS = 240;

/**
 * Should the banner render at all?
 *
 * Exported for the test suite, which drives the whole matrix through it —
 * every guard here is a case that only reproduces on a device this session
 * can't hold.
 */
export function shouldShowAppBanner() {
  if (isNativeWrapper()) return false;
  if (isStandalone()) return false;
  if (!isIOS()) return false;
  if (settings.appBannerDismissed) return false;
  return smartBannerUnsupported();
}

/**
 * Publish the banner's height so the fixed HUD can sit below it.
 *
 * Measured rather than hardcoded: the copy wraps differently across the
 * narrowest phones and the inset padding varies, and a stale constant here
 * would show as the clock overlapping the banner on exactly the devices this
 * is for. `0px`, not `0` — it's read inside calc() in app.css, where a
 * unitless zero is still valid but a unitless anything else would not be.
 */
function publishHeight(el) {
  const h = el ? Math.round(el.getBoundingClientRect().height) : 0;
  document.documentElement.style.setProperty("--app-banner-h", `${h}px`);
}

/** Wire up the banner, or remove it outright where it doesn't belong. */
export function initAppBanner() {
  const el = $("#app-banner");
  if (!el) return;

  // Removed, not just left hidden: nothing should be able to reveal a
  // download prompt inside the native app by toggling a class.
  if (!shouldShowAppBanner()) {
    el.remove();
    return;
  }

  el.classList.add("show");
  publishHeight(el);
  // Rotation and a browser toolbar collapsing both change the available
  // width, and so possibly the height.
  addEventListener("resize", () => publishHeight(el));

  $("#app-banner-x")?.addEventListener("click", () => {
    saveSettings({ appBannerDismissed: true });
    // Hand the space back in the same frame the banner starts leaving, so the
    // clock and search button travel up with it rather than after it.
    document.documentElement.style.setProperty("--app-banner-h", "0px");
    el.classList.add("dismissed");
    setTimeout(() => el.remove(), DISMISS_MS);
  });
}

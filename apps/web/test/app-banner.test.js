// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { URL as NodeURL, fileURLToPath } from "node:url";

/**
 * The App Store banner is two mechanisms that must never both fire.
 *
 * Safari on iOS draws Apple's Smart App Banner from index.html's
 * `apple-itunes-app` meta tag; #app-banner covers the iOS browsers that
 * ignore that tag. Every guard deciding between them reads a user-agent or a
 * platform global, which means none of them can be exercised by looking at
 * the app on this machine — a wrong one ships as either two stacked banners
 * in Safari or a "download the app" prompt inside the app itself. So the
 * whole matrix is driven through shouldShowAppBanner() here instead.
 *
 * The file also guards the App Store ID, which is hand-copied into three
 * places JS can't reach (the meta tag, the banner's own href, and
 * welcome.html's download buttons). It's immutable for the life of the app,
 * so a constant plus this check is the whole mechanism — no build-time
 * substitution — but a silent mismatch would point a download button at
 * someone else's listing, so it is checked rather than trusted.
 */

/**
 * node:url's URL explicitly, not the global one: this file runs in jsdom,
 * where the global URL resolves relative paths against the document base and
 * turns import.meta.url's file: path into Vite's http://localhost/@fs/… dev
 * URL, which fileURLToPath then rejects. The other repo-reading tests are
 * node-environment files and don't hit this.
 */
const root = new NodeURL("../../../", import.meta.url);
const read = (p) => readFileSync(fileURLToPath(new NodeURL(p, root)), "utf8");

const SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const CHROME_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1";
const INSTAGRAM_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Mobile/15E148 Instagram 335.0.3.28.92 (iPhone14,5; iOS 17_5; en_US)";
const CHROME_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/126.0.6478.54 Mobile Safari/537.36";
const CHROME_DESKTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.6478.54 Safari/537.36";
/** iPadOS 13+ with "Request Desktop Website" on — no iPad token anywhere. */
const IPAD_DESKTOP_MODE =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) CriOS/126.0.6478.54 Version/17.5 Safari/605.1.15";

/**
 * settings.js builds its singleton from localStorage at import time, so each
 * case stubs storage before importing a fresh copy — same shape as
 * settings.test.js.
 */
function stubEnv({ ua, stored = {}, touchPoints = 0, capacitor, standalone, displayMode = false }) {
  const store = { ...stored };
  vi.stubGlobal("localStorage", {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => {
      delete store[k];
    },
  });
  // navigator is not configurable wholesale in jsdom; each property is.
  const define = (k, v) => Object.defineProperty(navigator, k, { value: v, configurable: true });
  define("userAgent", ua);
  define("maxTouchPoints", touchPoints);
  define("standalone", standalone);
  window.matchMedia = (q) => ({ matches: displayMode && q.includes("standalone"), media: q });
  if (capacitor) window.Capacitor = capacitor;
  else delete window.Capacitor;
  return store;
}

async function fresh() {
  vi.resetModules();
  return import("../src/ui/app-banner.js");
}

beforeEach(() => {
  vi.resetModules();
  document.documentElement.style.removeProperty("--app-banner-h");
  document.body.innerHTML = "";
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete window.Capacitor;
});

describe("shouldShowAppBanner", () => {
  it("shows in an iOS browser Apple's Smart App Banner never reaches", async () => {
    stubEnv({ ua: CHROME_IOS });
    const { shouldShowAppBanner } = await fresh();
    expect(shouldShowAppBanner()).toBe(true);
  });

  it("shows in an in-app webview, where a shared link most often lands", async () => {
    stubEnv({ ua: INSTAGRAM_IOS });
    const { shouldShowAppBanner } = await fresh();
    expect(shouldShowAppBanner()).toBe(true);
  });

  it("shows on an iPad sending a desktop user agent", async () => {
    stubEnv({ ua: IPAD_DESKTOP_MODE, touchPoints: 5 });
    const { shouldShowAppBanner } = await fresh();
    expect(shouldShowAppBanner()).toBe(true);
  });

  /* The double-banner case: Safari draws Apple's, so this one must not. */
  it("stays out of Safari's way on iOS", async () => {
    stubEnv({ ua: SAFARI_IOS });
    const { shouldShowAppBanner } = await fresh();
    expect(shouldShowAppBanner()).toBe(false);
  });

  it("never appears inside the Capacitor build", async () => {
    stubEnv({ ua: CHROME_IOS, capacitor: { isNativePlatform: () => true } });
    const { shouldShowAppBanner } = await fresh();
    expect(shouldShowAppBanner()).toBe(false);
  });

  it("treats a Capacitor global with no isNativePlatform() as native", async () => {
    stubEnv({ ua: CHROME_IOS, capacitor: {} });
    const { shouldShowAppBanner } = await fresh();
    expect(shouldShowAppBanner()).toBe(false);
  });

  it("leaves an installed PWA alone (navigator.standalone)", async () => {
    stubEnv({ ua: CHROME_IOS, standalone: true });
    const { shouldShowAppBanner } = await fresh();
    expect(shouldShowAppBanner()).toBe(false);
  });

  it("leaves an installed PWA alone (display-mode)", async () => {
    stubEnv({ ua: CHROME_IOS, displayMode: true });
    const { shouldShowAppBanner } = await fresh();
    expect(shouldShowAppBanner()).toBe(false);
  });

  it.each([
    ["Android", CHROME_ANDROID],
    ["desktop", CHROME_DESKTOP],
  ])("does not offer an iOS app on %s", async (_label, ua) => {
    stubEnv({ ua });
    const { shouldShowAppBanner } = await fresh();
    expect(shouldShowAppBanner()).toBe(false);
  });

  it("respects a stored dismissal", async () => {
    stubEnv({ ua: CHROME_IOS, stored: { "ot-settings": '{"appBannerDismissed":true}' } });
    const { shouldShowAppBanner } = await fresh();
    expect(shouldShowAppBanner()).toBe(false);
  });

  it("ignores a non-boolean dismissal flag rather than trusting it", async () => {
    stubEnv({ ua: CHROME_IOS, stored: { "ot-settings": '{"appBannerDismissed":"yes"}' } });
    const { shouldShowAppBanner } = await fresh();
    expect(shouldShowAppBanner()).toBe(true);
  });
});

describe("initAppBanner", () => {
  function mount() {
    document.body.innerHTML =
      '<div id="app-banner"><a class="ab-main" href="#"></a>' +
      '<button id="app-banner-x"></button></div>';
    return document.getElementById("app-banner");
  }

  it("reveals the banner and publishes its height for the HUD to clear", async () => {
    stubEnv({ ua: CHROME_IOS });
    const el = mount();
    // jsdom has no layout, so stand in for the measurement.
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({ height: 54 });
    const { initAppBanner } = await fresh();
    initAppBanner();
    expect(el.classList.contains("show")).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--app-banner-h")).toBe("54px");
  });

  /* Removed outright, not left hidden: nothing should be able to reveal a
     download prompt inside the native app by toggling a class. */
  it("removes the element where it doesn't belong", async () => {
    stubEnv({ ua: SAFARI_IOS });
    mount();
    const { initAppBanner } = await fresh();
    initAppBanner();
    expect(document.getElementById("app-banner")).toBeNull();
  });

  it("persists the dismissal and hands the space back", async () => {
    const store = stubEnv({ ua: CHROME_IOS });
    const el = mount();
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({ height: 54 });
    const { initAppBanner } = await fresh();
    initAppBanner();

    document.getElementById("app-banner-x").click();
    expect(el.classList.contains("dismissed")).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--app-banner-h")).toBe("0px");
    expect(JSON.parse(store["ot-settings"]).appBannerDismissed).toBe(true);
  });

  it("survives markup that isn't there", async () => {
    stubEnv({ ua: CHROME_IOS });
    const { initAppBanner } = await fresh();
    expect(() => initAppBanner()).not.toThrow();
  });
});

describe("App Store ID stays in step across the surfaces JS can't reach", () => {
  it("matches the Smart App Banner meta tag and the banner href in index.html", async () => {
    stubEnv({ ua: SAFARI_IOS });
    const { APP_STORE_ID, APP_STORE_URL } = await fresh();
    const html = read("apps/web/index.html");
    expect(html).toContain(`<meta name="apple-itunes-app" content="app-id=${APP_STORE_ID}">`);
    expect(html).toContain(`href="${APP_STORE_URL}"`);
  });

  it("matches every App Store link on the welcome page", async () => {
    stubEnv({ ua: SAFARI_IOS });
    const { APP_STORE_ID } = await fresh();
    const found = read("apps/web/welcome.html").match(/apps\.apple\.com\/\S*?id(\d+)/g) || [];
    expect(found.length).toBeGreaterThan(0);
    for (const url of found) expect(url).toContain(`id${APP_STORE_ID}`);
  });
});

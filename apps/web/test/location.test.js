import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The central behaviour under test: a *refusal* is remembered, a *transient
 * failure* is not. Getting that backwards locks a user out of What's Overhead
 * because their GPS happened to be cold once.
 */

const KEY = "ot-settings";

function stubStorage(initial = {}) {
  const store = { ...initial };
  vi.stubGlobal("localStorage", {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => delete store[k],
  });
  return store;
}

/** navigator stub whose getCurrentPosition resolves or fails as directed. */
function stubGeolocation({ position, error, permissions } = {}) {
  const getCurrentPosition = vi.fn((ok, fail) => {
    if (error) fail(error);
    else ok(position);
  });
  vi.stubGlobal("navigator", {
    geolocation: position || error ? { getCurrentPosition } : undefined,
    permissions,
  });
  return getCurrentPosition;
}

async function freshLocation() {
  vi.resetModules();
  return {
    loc: await import("../src/data/location.js"),
    settings: await import("../src/settings.js"),
  };
}

const OK_POSITION = { coords: { latitude: 51.5, longitude: -0.12 } };

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe("requestLocation", () => {
  it("resolves lat/lon on success", async () => {
    stubStorage();
    stubGeolocation({ position: OK_POSITION });
    const { loc } = await freshLocation();
    await expect(loc.requestLocation()).resolves.toEqual({ lat: 51.5, lon: -0.12 });
  });

  it("passes low-accuracy options — precision buys nothing at horizon scale", async () => {
    stubStorage();
    const gcp = stubGeolocation({ position: OK_POSITION });
    const { loc } = await freshLocation();
    await loc.requestLocation();
    const opts = gcp.mock.calls[0][2];
    expect(opts.enableHighAccuracy).toBe(false);
    expect(opts.timeout).toBeGreaterThan(0);
  });

  it("remembers a PERMISSION_DENIED (code 1) refusal", async () => {
    const store = stubStorage();
    stubGeolocation({ error: { code: 1, message: "denied" } });
    const { loc, settings } = await freshLocation();
    await expect(loc.requestLocation()).rejects.toMatchObject({
      reason: loc.LOCATION_ERRORS.DENIED,
    });
    expect(settings.settings.locationPermissionDenied).toBe(true);
    expect(JSON.parse(store[KEY]).locationPermissionDenied).toBe(true);
  });

  it("does NOT remember POSITION_UNAVAILABLE (code 2)", async () => {
    stubStorage();
    stubGeolocation({ error: { code: 2, message: "unavailable" } });
    const { loc, settings } = await freshLocation();
    await expect(loc.requestLocation()).rejects.toMatchObject({
      reason: loc.LOCATION_ERRORS.UNAVAILABLE,
    });
    expect(settings.settings.locationPermissionDenied).toBe(false);
    expect(loc.locationDenied()).toBe(false);
  });

  it("does NOT remember TIMEOUT (code 3)", async () => {
    stubStorage();
    stubGeolocation({ error: { code: 3, message: "timeout" } });
    const { loc, settings } = await freshLocation();
    await expect(loc.requestLocation()).rejects.toMatchObject({
      reason: loc.LOCATION_ERRORS.UNAVAILABLE,
    });
    expect(settings.settings.locationPermissionDenied).toBe(false);
  });

  it("short-circuits without calling getCurrentPosition once denied", async () => {
    stubStorage({ [KEY]: JSON.stringify({ locationPermissionDenied: true }) });
    const gcp = stubGeolocation({ position: OK_POSITION });
    const { loc } = await freshLocation();
    await expect(loc.requestLocation()).rejects.toMatchObject({
      reason: loc.LOCATION_ERRORS.DENIED,
    });
    // The whole point of the flag: no silent wait on a prompt that won't show.
    expect(gcp).not.toHaveBeenCalled();
  });

  it("reports unsupported when the browser has no geolocation", async () => {
    stubStorage();
    vi.stubGlobal("navigator", {});
    const { loc } = await freshLocation();
    await expect(loc.requestLocation()).rejects.toMatchObject({
      reason: loc.LOCATION_ERRORS.UNSUPPORTED,
    });
  });
});

describe("clearLocationDenied", () => {
  it("clears the flag so the next request goes through again", async () => {
    stubStorage({ [KEY]: JSON.stringify({ locationPermissionDenied: true }) });
    const gcp = stubGeolocation({ position: OK_POSITION });
    const { loc } = await freshLocation();
    expect(loc.locationDenied()).toBe(true);

    loc.clearLocationDenied();
    expect(loc.locationDenied()).toBe(false);

    await expect(loc.requestLocation()).resolves.toEqual({ lat: 51.5, lon: -0.12 });
    expect(gcp).toHaveBeenCalled();
  });
});

describe("locationStatus", () => {
  it("reports denied from our own flag without consulting the browser", async () => {
    stubStorage({ [KEY]: JSON.stringify({ locationPermissionDenied: true }) });
    const query = vi.fn();
    stubGeolocation({ position: OK_POSITION, permissions: { query } });
    const { loc } = await freshLocation();
    expect(await loc.locationStatus()).toBe("denied");
    expect(query).not.toHaveBeenCalled();
  });

  it("uses the Permissions API when it's available", async () => {
    stubStorage();
    stubGeolocation({
      position: OK_POSITION,
      permissions: { query: vi.fn().mockResolvedValue({ state: "granted" }) },
    });
    const { loc } = await freshLocation();
    expect(await loc.locationStatus()).toBe("granted");
  });

  it("falls back to 'prompt' when the Permissions API rejects", async () => {
    stubStorage();
    stubGeolocation({
      position: OK_POSITION,
      permissions: { query: vi.fn().mockRejectedValue(new Error("unsupported descriptor")) },
    });
    const { loc } = await freshLocation();
    expect(await loc.locationStatus()).toBe("prompt");
  });

  it("falls back to 'prompt' when there is no Permissions API at all", async () => {
    stubStorage();
    stubGeolocation({ position: OK_POSITION });
    const { loc } = await freshLocation();
    expect(await loc.locationStatus()).toBe("prompt");
  });

  it("reports unsupported with no geolocation", async () => {
    stubStorage();
    vi.stubGlobal("navigator", {});
    const { loc } = await freshLocation();
    expect(await loc.locationStatus()).toBe("unsupported");
  });
});

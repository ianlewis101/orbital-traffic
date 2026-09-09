#!/usr/bin/env node
/**
 * appstore-marketing-version.mjs
 * Prints the MARKETING_VERSION the iOS build should archive under.
 *
 * Apple rejects any new build uploaded under a CFBundleShortVersionString
 * that already belongs to a READY_FOR_SALE (live) App Store version — and
 * the version string committed in project.pbxproj carries no memory of
 * whether it was ever actually released. This queries the App Store
 * Connect API for the app's current live version and, if it matches what's
 * committed, prints a patch-bumped version instead so the iOS Build &
 * Upload workflow never fails on a stale marketing version again.
 *
 * Fails open: any credential, network, or API-shape problem just prints
 * the committed version unchanged (to stderr: why) rather than blocking a
 * build that would otherwise have succeeded — this check is a convenience,
 * not a gate.
 */
import { readFile } from "node:fs/promises";
import crypto from "node:crypto";

const PBXPROJ = "apps/web/ios/App/App.xcodeproj/project.pbxproj";
const BUNDLE_ID = "app.orbitaltraffic";
const API_BASE = "https://api.appstoreconnect.apple.com/v1";

function base64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function makeJwt(privateKeyPem, keyId, issuerId) {
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: issuerId, iat: now, exp: now + 600, aud: "appstoreconnect-v1" };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = crypto.sign("sha256", Buffer.from(signingInput), {
    key: privateKeyPem,
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${base64url(signature)}`;
}

async function readCommittedVersion() {
  const text = await readFile(PBXPROJ, "utf8");
  const match = text.match(/MARKETING_VERSION = ([\d.]+);/);
  if (!match) throw new Error("MARKETING_VERSION not found in project.pbxproj");
  return match[1];
}

function bumpPatch(version) {
  const parts = version.split(".").map(Number);
  while (parts.length < 3) parts.push(0);
  parts[parts.length - 1] += 1;
  return parts.join(".");
}

async function fetchLiveVersion(jwt) {
  const headers = { Authorization: `Bearer ${jwt}` };

  const appRes = await fetch(`${API_BASE}/apps?filter[bundleId]=${BUNDLE_ID}`, { headers });
  if (!appRes.ok) throw new Error(`apps lookup failed: ${appRes.status}`);
  const appJson = await appRes.json();
  const appId = appJson.data?.[0]?.id;
  if (!appId) throw new Error(`no app found for bundle id ${BUNDLE_ID}`);

  const versionsRes = await fetch(
    `${API_BASE}/apps/${appId}/appStoreVersions?filter[appStoreState]=READY_FOR_SALE&limit=1`,
    { headers }
  );
  if (!versionsRes.ok) throw new Error(`versions lookup failed: ${versionsRes.status}`);
  const versionsJson = await versionsRes.json();
  return versionsJson.data?.[0]?.attributes?.versionString ?? null;
}

async function main() {
  const committed = await readCommittedVersion();
  const { APP_STORE_CONNECT_API_KEY_ID, APP_STORE_CONNECT_API_ISSUER_ID, APP_STORE_CONNECT_API_KEY_BASE64 } =
    process.env;

  if (!APP_STORE_CONNECT_API_KEY_ID || !APP_STORE_CONNECT_API_ISSUER_ID || !APP_STORE_CONNECT_API_KEY_BASE64) {
    console.error("Missing App Store Connect API credentials — skipping live-version check.");
    console.log(committed);
    return;
  }

  try {
    const privateKeyPem = Buffer.from(APP_STORE_CONNECT_API_KEY_BASE64, "base64").toString("utf8");
    const jwt = makeJwt(privateKeyPem, APP_STORE_CONNECT_API_KEY_ID, APP_STORE_CONNECT_API_ISSUER_ID);
    const liveVersion = await fetchLiveVersion(jwt);

    if (liveVersion && liveVersion === committed) {
      const bumped = bumpPatch(committed);
      console.error(`MARKETING_VERSION ${committed} is already live (READY_FOR_SALE) — using ${bumped} instead.`);
      console.log(bumped);
      return;
    }

    console.log(committed);
  } catch (err) {
    console.error(`Live-version check failed (${err.message}) — using committed MARKETING_VERSION unchanged.`);
    console.log(committed);
  }
}

main();

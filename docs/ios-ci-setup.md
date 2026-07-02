# iOS CI Setup — Building & Submitting Without a Mac

This repo now has `.github/workflows/ios-build.yml`, which builds,
signs, and (optionally) uploads the iOS app to App Store Connect using
a GitHub-hosted macOS runner. You never need to own or touch a Mac —
everything below is either a browser step (Apple Developer /
App Store Connect) or a one-line command you can run anywhere,
including asking Claude to run it for you in a sandbox session.

Do these once. After that, shipping a new build is: run the workflow
from the Actions tab.

---

## 1. Generate a Certificate Signing Request (CSR)

Apple's distribution certificate needs a CSR + private key pair. This
normally comes from Keychain Access on a Mac, but `openssl` produces
an identical result on any OS:

```bash
openssl req -new -newkey rsa:2048 -nodes \
  -keyout ios_distribution.key \
  -out ios_distribution.csr \
  -subj "/emailAddress=YOUR_APPLE_ID_EMAIL/CN=YOUR_LEGAL_NAME/C=US"
```

Replace `YOUR_APPLE_ID_EMAIL` and `YOUR_LEGAL_NAME` with your actual
info (the name Apple has on file for your developer account). Keep
`ios_distribution.key` private — don't commit it, don't paste it in
chat. You'll need it in step 3.

## 2. Get the Distribution Certificate

1. Go to developer.apple.com/account/resources/certificates → +
2. Choose Apple Distribution → upload `ios_distribution.csr`
3. Download the resulting `.cer` file

## 3. Convert to a `.p12` (needed for CI)

```bash
openssl x509 -in distribution.cer -inform DER -out distribution.pem -outform PEM
openssl pkcs12 -export \
  -inkey ios_distribution.key \
  -in distribution.pem \
  -out distribution.p12 \
  -password pass:CHOOSE_A_PASSWORD
```

Remember `CHOOSE_A_PASSWORD` — that's `IOS_DIST_CERTIFICATE_PASSWORD`
below.

## 4. Register the App ID

developer.apple.com/account/resources/identifiers → + → App IDs → App

- Bundle ID: `app.orbitaltraffic` (explicit, matches capacitor.config.json)
- Capabilities: enable Push Notifications now even before it's wired
  up in code — easier to enable early than re-provision later

## 5. Create the Provisioning Profile

developer.apple.com/account/resources/profiles → + → App Store distribution

- Select the `app.orbitaltraffic` App ID
- Select the distribution certificate from step 2
- Download the `.mobileprovision` file

## 6. Create an App Store Connect API Key

appstoreconnect.apple.com → Users and Access → Integrations → App Store Connect API → +

- Role: App Manager
- Download the `.p8` file immediately — Apple only lets you download
  it once
- Note the Key ID and Issuer ID shown on that page

## 7. Create the App Record

App Store Connect → My Apps → + → New App

- Platform: iOS
- Bundle ID: `app.orbitaltraffic`
- This is also where the actual store listing (screenshots,
  description, privacy answers) gets filled in later — that part
  still needs to happen before you can submit for review, independent
  of the CI pipeline.

## 8. Add GitHub Repo Secrets

Repo → Settings → Secrets and variables → Actions → New repository secret, one per row:

| Secret name                      | Value                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------- |
| IOS_DIST_CERTIFICATE_P12_BASE64  | base64 -i distribution.p12 \| pbcopy (or base64 -w0 distribution.p12 on Linux)   |
| IOS_DIST_CERTIFICATE_PASSWORD    | the password from step 3                                                          |
| IOS_PROVISIONING_PROFILE_BASE64  | base64 -w0 profile.mobileprovision                                                |
| IOS_KEYCHAIN_PASSWORD            | any throwaway password you invent — only used transiently inside the CI runner   |
| APP_STORE_CONNECT_API_KEY_ID     | Key ID from step 6                                                                |
| APP_STORE_CONNECT_API_ISSUER_ID  | Issuer ID from step 6                                                             |
| APP_STORE_CONNECT_API_KEY_BASE64 | base64 -w0 AuthKey_XXXXX.p8                                                       |

## 9. Run It

Repo → Actions → iOS Build & Upload → Run workflow.

- Leave "upload" unchecked the first time — this validates the archive
  step builds cleanly and gives you a downloadable .ipa artifact to
  sanity-check before anything touches App Store Connect.
- Once that succeeds, re-run with "upload" checked to actually push
  the build to App Store Connect (it'll show up under TestFlight
  first, same as a normal Xcode upload).

---

## What this does NOT solve yet

Getting a build into App Store Connect is necessary but not
sufficient for review to pass. Guideline 4.2 (minimum functionality)
is still a live risk — this wrapper by itself has no native-only
functionality (no push notifications, no native APIs Safari couldn't
also do). That's what feat/iss-pass-alerts (a separate PR, branched
off this one) is for. Treat a build landing in TestFlight as "the
pipe works," not "ready to submit."

# iOS Submission Checklist — Location Permission

Before archiving in Xcode, add the following to Info.plist:

Key: `NSLocationWhenInUseUsageDescription`  
Value: `Orbital Traffic uses your location to calculate when satellites pass overhead. Your location is used only on your device and is never stored or transmitted.`

**Why this matters:** Apple requires this string to be present and descriptive before the OS location dialog fires. A generic or missing string will result in App Store rejection. The string must explain specifically WHY the app needs location, not just that it does.

Also verify in Xcode → Signing & Capabilities → no "Always On" location capability is requested — only "When In Use."

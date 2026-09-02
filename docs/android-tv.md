# Planned: Android TV app

MAKE believe on the TV's home screen as a real app with its own banner.
Selecting it launches straight into <https://believe.ax-h.com/host/>, fullscreen,
screen kept awake, with no browser and no URL bar ever visible. The app only ever
loads the remote host page, so every deployed game update is picked up on the
next launch and the APK itself rarely changes.

Target device is a **Fire TV Stick 4K Max 1st gen (2021), model AFTKA — Fire OS 7,
Android 9, API 28**, so `minSdk = 28`. But nothing here is Fire-specific: it is a
standard Android TV app and would run on any Android TV box on API 28+. Fire OS 5
sticks are not a target and nobody should lower the build target for them. Fire OS
ships Amazon's Chromium-based WebView rather than Google's; it is modern and does
WebGL, so the default Vite build target is fine.

## Approach

A **minimal native Kotlin app**: one `Activity`, one `WebView`, about 150 lines.
It lives at `/androidtv` at the repo root, beside `e2e/` and `k8s/`, because it is
a Gradle project and not a pnpm package. It is not part of `pnpm build` or
`pnpm test`.

Not Capacitor: it also wraps a WebView, but it bundles the web assets into the APK
by default (we want them remote, so updates are automatic), pulls in an npm
toolchain and plugin system we would not use, and needs the same Android SDK
anyway. Not a Trusted Web Activity: that needs Chrome on the device, and Fire TV
has no Chrome.

Toolchain: JDK 17, Android command-line tools (`sdkmanager`), Gradle wrapper
checked in. Android Studio optional. The SDK has to be installed locally; if it
cannot be, stop and ask rather than substituting a different approach.

Before the first install Alex needs ADB debugging and *Apps from unknown sources*
turned on (Settings → My Fire TV → Developer options), and the stick's LAN IP.
Ask for these when the APK is ready, not before.

## Work

**App**

- `androidtv/` Gradle project: `settings.gradle.kts`, `app/build.gradle.kts`,
  Gradle wrapper, a `.gitignore` for build output and local properties.
  `minSdk = 28`, `targetSdk` current, application id `com.axh.makebelieve.tv`.
- `AndroidManifest.xml`: launcher intent with `LEANBACK_LAUNCHER`,
  `android:banner` (320x180 PNG from the same SVG as the PWA icons),
  `uses-feature android.software.leanback required=false`,
  `uses-feature android.hardware.touchscreen required=false`, `INTERNET`,
  landscape, `android:label="MAKE believe"`.
- `MainActivity.kt`: fullscreen immersive (system bars hidden),
  `FLAG_KEEP_SCREEN_ON`, a `WebView` with JavaScript, DOM storage and hardware
  acceleration on, `mediaPlaybackRequiresUserGesture = false`, loading
  `BuildConfig.HOST_URL` (a Gradle property with a sensible default). Navigations
  stay inside the WebView; nothing ever opens an external browser.
- On `onReceivedError` for the main frame, show a native "Can't reach <host>,
  retrying…" view and retry with backoff, returning to the WebView when it loads.
  This is what happens when the TV boots before the server is up.
- Remote buttons: Back exits (the default); Menu (`KEYCODE_MENU`) reloads the
  page. Do not intercept the D-pad. **The host page has no controls and takes no
  input at all** — the phones run the game — so there is nothing else to wire up.
- `WebChromeClient.onConsoleMessage` forwarded to logcat, so the host page can be
  debugged with `adb logcat`. Record the WebView's Chromium version from
  `navigator.userAgent` on the first run, for reference.
- Signing: a release keystore generated once, kept **out of git**, path and
  passwords in `~/.gradle/gradle.properties`. The same keystore must be used
  forever or updates will not install over the old app — say so in the README.

**Host page**

- Detect the wrapper (a custom user-agent suffix set by the WebView, e.g.
  `MAKEbelieveTV/1`) and hide anything browser-oriented, if there turns out to be
  anything.
- Check Phaser renders in the device's WebView (WebGL, or Canvas fallback via
  `Phaser.AUTO`) at a steady frame rate with four blobs moving.

**Docs**

- `androidtv/README.md`: prerequisites, `./gradlew assembleRelease`,
  `adb connect <tv-ip>`, `adb install -r app/build/outputs/apk/release/app-release.apk`,
  and how to set `HOST_URL`.
- Root README: an "On the TV" line pointing at it.

**Maybe later**

In-app APK self-update: the server serves `/androidtv/latest.json`
(`{ versionCode, url }`) and the APK; on launch the app compares `versionCode`,
downloads to cache and fires the package-installer intent
(`REQUEST_INSTALL_PACKAGES`, confirmed on screen once). Only worth doing if the
wrapper turns out to change more than once or twice.

## Done when

`cd androidtv && ./gradlew assembleRelease` builds, and on the real Fire TV: the
app is on the home screen with its banner; launching shows the host page
fullscreen within a few seconds; phones join via the QR code on it; the screen is
still on after ten minutes; kill the server pod and the app shows its retry
screen, restore it and the app recovers by itself.

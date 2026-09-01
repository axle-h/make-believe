---
phase: 10
title: Android TV app
status: not-started
updated: 2026-09-01
---

# Phase 10 — Android TV app

## Goal

MAKE believe appears on the TV's home screen as a real app with its own banner. The target device is Alex's Fire TV Stick, but nothing here is Fire-specific: it is a standard Android TV app and would run on any Android TV box. Selecting it launches straight into the host page, fullscreen, screen kept awake, with no browser and no URL bar ever visible. Because the app only loads the remote host page, every deployed game update is picked up automatically on the next launch. The APK itself is thin and rarely changes.

## Read first

`CLAUDE.md` sections: Architecture, Phaser notes, Future work (native wrappers move out of it with this phase). Phase 8 must be `done` so there is a stable `https://` host URL (`https://believe.ax-h.com/host/`).

## Approach

A **minimal native Android app in Kotlin**: one `Activity`, one `WebView`, about 150 lines. Lives at `/androidtv` at the repo root, next to `e2e/` and `k8s/`, because it is a Gradle project and not a pnpm package. It is not part of `pnpm build` or `pnpm test`.

Why not Capacitor: Capacitor also wraps a WebView, but it bundles the web assets into the APK by default (we want them remote so updates are automatic), it pulls in an npm toolchain and plugin system we would not use, and it needs the same Android SDK anyway. Why not a Trusted Web Activity: it needs Chrome on the device, and Fire TV does not have Chrome. Record the choice in `DECISIONS.md`.

Toolchain: JDK 17, Android command-line tools (`sdkmanager`), Gradle wrapper checked in. Android Studio is optional. The agent will need the SDK installed locally; if it cannot install it, mark the build task blocked and ask Alex rather than substituting a different approach.

## Device facts (from Alex, 2026-09-01)

- **Fire TV Stick 4K Max, 1st gen (2021), model AFTKA. Fire OS 7, Android 9, API level 28.** So `minSdk = 28`, `targetSdk` current. Modern WebView with WebGL; the default Vite build target is fine. Older Fire OS 5 sticks are not a target.
- Fire OS ships Amazon's Chromium-based WebView rather than Google's. In the first session load a page that prints `navigator.userAgent` in the wrapper and record the Chromium version in the handoff, for later reference only.
- Before the first install Alex needs ADB debugging and Apps from unknown sources turned on (Settings > My Fire TV > Developer options) and the stick's LAN IP. Ask for these when the APK is ready, not before.

## Tasks

### App

- [ ] `androidtv/` Gradle project: `settings.gradle.kts`, `app/build.gradle.kts`, Gradle wrapper, `.gitignore` for build output and local properties. `minSdk = 28`, `targetSdk` current. Application id `com.axh.makebelieve.tv`.
- [ ] `AndroidManifest.xml`: launcher intent with `LEANBACK_LAUNCHER` category, `android:banner` (320x180 PNG, generated from the same SVG as the phase 9 icons), `uses-feature android.software.leanback required=false`, `uses-feature android.hardware.touchscreen required=false`, `INTERNET` permission, landscape orientation, `android:label="MAKE believe"`.
- [ ] `MainActivity.kt`: fullscreen immersive (hide system bars), `FLAG_KEEP_SCREEN_ON`, `WebView` with JavaScript, DOM storage, and hardware acceleration enabled, `mediaPlaybackRequiresUserGesture = false`, loads `BuildConfig.HOST_URL` (set from a Gradle property with a sensible default). Page navigations stay inside the WebView; nothing ever opens an external browser.
- [ ] Error handling: on `onReceivedError` for the main frame, show a native "Can't reach <host>, retrying…" view and retry with backoff; return to the WebView when it loads. This is what happens when the TV boots before the server is up.
- [ ] Remote buttons: Back exits the app (default); Menu (`KEYCODE_MENU`) reloads the page. Do not intercept the D-pad; let it reach the page as arrow keys and Enter. These are standard Android TV keycodes; the Fire remote sends the same ones.
- [ ] Console forwarding: `WebChromeClient.onConsoleMessage` to logcat so the host page can be debugged with `adb logcat`.
- [ ] Signing: a release keystore generated once, kept **out of git**, path and passwords via `~/.gradle/gradle.properties`. Document in the README that the same keystore must be used forever or updates will not install over the old app.

### Host page changes

- [ ] Phase control must work from the remote. Replace or supplement the phase 4 keyboard shortcuts with a small on-screen menu on the host page, navigable with arrow keys and Enter (which is what the D-pad sends), hidden after a few seconds of no input. Keyboard shortcuts keep working for dev.
- [ ] The host page detects it is inside the wrapper (a custom user-agent suffix set by the WebView, for example `MAKEbelieveTV/1`) and hides anything browser-oriented, if there is anything.
- [ ] Verify Phaser renders in the device's WebView (WebGL or Canvas fallback via `Phaser.AUTO`) at a steady frame rate with four players moving. Record the result.

### Install and docs

- [ ] `androidtv/README.md`: prerequisites, `./gradlew assembleRelease`, `adb connect <tv-ip>`, `adb install -r app/build/outputs/apk/release/app-release.apk`, and how to set `HOST_URL`.
- [ ] Root README: "On the TV" section pointing to it.

### Stretch (does not gate phase completion)

- [ ] In-app APK self-update: server serves `/androidtv/latest.json` (`{ versionCode, url }`) and the APK; on launch the app compares `versionCode`, downloads the APK to cache, and fires the package-installer intent (`REQUEST_INSTALL_PACKAGES`, user confirms on screen once). Only worth doing if the wrapper turns out to change more than once or twice.

## Acceptance

```sh
cd androidtv && ./gradlew assembleRelease
```

Manual check on the real Fire TV: app is on the home screen with the banner; launching shows the host page fullscreen within a few seconds; phones join via the QR; the phase menu works from the remote; leaving it for ten minutes, the screen stays on; kill the server pod, the app shows the retry screen, restore it, the app recovers by itself.

## Handoff

- **State:** not started.
- **Next step:** scaffold the Gradle project with `minSdk = 28`.
- **Known issues:** none.

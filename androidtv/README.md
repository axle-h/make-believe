# MAKE believe on the TV

A minimal Kotlin wrapper: one activity, one fullscreen `WebView`, pointed at the
deployed host page. It has no game logic and no state — deploy the web app and
the TV is up to date on its next launch, so this APK rarely changes.

Not part of `pnpm build` or `pnpm test`. It is a Gradle project and needs the
Android SDK; everything else in the repo does not.

Built and run on a **Fire TV Stick 4K Max 1st gen (AFTKA, Fire OS 7 / Android 9,
API 28)**, which is why `minSdk = 28`. Nothing in it is Fire-specific: it is a
standard Android TV app and would run on any Android TV box on API 28+. Fire OS
ships Amazon's Chromium-based WebView rather than Google's; it is modern and does
WebGL, so the ordinary Vite build target is fine and Phaser needs no fallback.

## Why a wrapper, and why it holds so little

The page is loaded from the network every launch rather than bundled into the
APK. That is the entire point: the game is deployed to k3s the way it always
was, and the TV picks it up next time it is switched on. Nobody sideloads
anything to ship a game change.

Not **Capacitor**: it also wraps a WebView, but it bundles the web assets into
the APK by default, pulls in an npm toolchain and a plugin system none of this
would use, and needs the same Android SDK anyway. Not a **Trusted Web Activity**:
that needs Chrome on the device, and Fire TV has no Chrome.

So the app is about 150 lines whose whole job is getting out of the way — hide
the system bars, keep the screen on, and keep retrying when the server is not up
yet, which is what happens when the TV is switched on before the house is.

## Prerequisites

**Android Studio** is the whole toolchain: it brings the SDK and a JDK, and
nothing has to be installed with `dnf` (Fedora 44 has no JDK the Android Gradle
Plugin will run on anyway). Run it once so it downloads the SDK, then point two
variables at what it installed:

```sh
export JAVA_HOME=~/.local/share/JetBrains/Toolbox/apps/android-studio/jbr
export ANDROID_HOME=~/Android/Sdk
```

`ANDROID_HOME` can instead be `sdk.dir` in `local.properties`, which Studio
writes itself when the project is opened there; `JAVA_HOME` can instead be
`org.gradle.java.home` in `~/.gradle/gradle.properties`. Both are machine-local
and neither is in the repo. Missing SDK platforms and build-tools are downloaded
by Gradle on first build. `adb` comes with the SDK, in `platform-tools`.

## Build

```sh
cd androidtv
./gradlew assembleRelease   # app/build/outputs/apk/release/app-release.apk
./gradlew assembleDebug     # app/build/outputs/apk/debug/app-debug.apk
```

The debug build carries an `applicationIdSuffix` of `.debug`, is signed with
Android's debug key and allows plain http, so it installs beside the real app
and is the one to point at a laptop while testing.

`HOST_URL` defaults to <https://believe.ax-h.com/host/> and is set in
`gradle.properties`. Point a build at a laptop instead without editing anything:

```sh
./gradlew assembleDebug -PhostUrl=http://192.168.1.20:3000/host/
```

Release builds refuse cleartext http; only the debug build allows it.

## Signing

Release builds are signed with a keystore that is **not in this repo** and never
will be. It lives at `~/keys/make-believe.jks`, and its passwords are the four
`makeBelieve*` properties in `~/.gradle/gradle.properties` — both files are
mode `600` and both are machine-local. Without those properties the release APK
comes out as `app-release-unsigned.apk` and no device will install it.

**Keep that keystore forever, and back it up somewhere off this machine.**
Android will not install an update signed by a different key; the only way out
is uninstalling the app on the TV first, and there is no way to recreate a lost
key. If it ever has to be made again from scratch:

```sh
keytool -genkeypair -keystore ~/keys/make-believe.jks -alias makebelieve \
  -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=MAKE believe, O=ax-h.com, C=GB"
```

then put `makeBelieveKeystore` (the path), `makeBelieveKeystorePassword`,
`makeBelieveKeyAlias` and `makeBelieveKeyPassword` in
`~/.gradle/gradle.properties`. Check what came out with:

```sh
$ANDROID_HOME/build-tools/*/apksigner verify --print-certs app-release.apk
```

`minSdk` is 28, so signature scheme v2 alone is enough and v1 JAR signing is
correctly absent.

## Install onto the Fire TV

Once on the stick: Settings → My Fire TV → Developer options → *ADB debugging*
on and *Apps from unknown sources* on. Then, with its LAN IP:

```sh
adb connect 192.168.1.50:5555
adb install -r app/build/outputs/apk/release/app-release.apk
adb shell monkey -p com.axh.makebelieve.tv 1     # launch it without the remote
```

It then sits on the home screen with its banner, and selecting it goes straight
into the game — fullscreen, no browser and no URL bar, screen kept awake. Phones
join off the QR code on it exactly as they do from a browser on a laptop.

Use `com.axh.makebelieve.tv.debug` for the debug build; the two coexist happily.

## Updating it

The usual answer is that there is nothing to do — the page is remote, so a
deploy is the update. Only a change to the wrapper itself needs a new APK, and
that needs `versionCode` in `app/build.gradle.kts` bumped first: Android will
not install a build over one with the same or a higher code. Then
`./gradlew assembleRelease` and the same `adb install -r`, signed with the same
keystore.

## On the remote

Nothing is wired up but two keys, because **the host page takes no input at
all** — the phones run the game.

- **Back** — exit the app.
- **Menu** — reload the page, for when a deploy has landed mid-evening.

The D-pad is deliberately left alone.

## Debugging the host page on the stick

The page's own `console.log` is forwarded into logcat under the app's tag, which
is the only way to see it on a TV:

```sh
adb logcat -s MAKEbelieve
```

The first line the app writes on every launch is the host URL and the WebView's
full user-agent, so that logcat also says which Chromium the box actually ships:

```sh
adb logcat -s MAKEbelieve -m 1
```

## Toolchain versions

AGP and library versions live in `gradle/libs.versions.toml`, the Gradle version
in `gradle/wrapper/gradle-wrapper.properties`; the wrapper jar and `gradlew` are
generated by `gradle wrapper` and committed. Built and tested against AGP 9.4,
Gradle 9.7.1, `compileSdk` 37 and Studio's bundled JDK 25.

**AGP 9 compiles Kotlin itself** — there is no `org.jetbrains.kotlin.android`
plugin here and adding one is an error, not an oversight.

The banner and launcher icon are generated from the same `blob.svg` the phone's
icons come from, by `scripts/banner.mjs`, and committed — run it by hand if the
blob ever changes.

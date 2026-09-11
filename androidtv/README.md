# MAKE believe on the TV

One activity, one fullscreen `WebView`, pointed at the deployed host page. It bundles nothing and
holds no state, so a deploy of the web app is the TV's update and this APK rarely changes. Not
Capacitor (bundles assets), not a Trusted Web Activity (Fire TV has no Chrome). It hides the system
bars, keeps the screen on and retries until the server is up.

Built for a Fire TV Stick 4K Max (Fire OS 7, Android 9, API 28, hence `minSdk = 28`), but nothing in
it is Fire-specific. It is a Gradle project outside `pnpm build` and `pnpm test`.

## Build

Android Studio brings the SDK and a JDK. Point two variables at them (or use `sdk.dir` in
`local.properties` and `org.gradle.java.home` in `~/.gradle/gradle.properties`):

```sh
export JAVA_HOME=~/.local/share/JetBrains/Toolbox/apps/android-studio/jbr
export ANDROID_HOME=~/Android/Sdk
cd androidtv
./gradlew assembleRelease   # app/build/outputs/apk/release/app-release.apk
./gradlew assembleDebug -PhostUrl=http://192.168.1.20:3000/host/
```

`HOST_URL` defaults to <https://believe.ax-h.com/host/> in `gradle.properties`. The debug build is
`com.axh.makebelieve.tv.debug`, installs beside the real app, and is the only one that allows
cleartext http. AGP 9 compiles Kotlin itself, so there is no Kotlin Android plugin to add.

## Signing

The release keystore is `~/keys/make-believe.jks`, outside the repo; its passwords are the four
`makeBelieve*` properties in `~/.gradle/gradle.properties`. Keep it and back it up: Android will not
install an update signed with another key. Without the properties the APK comes out unsigned. To
make one from scratch:

```sh
keytool -genkeypair -keystore ~/keys/make-believe.jks -alias makebelieve \
  -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=MAKE believe, O=ax-h.com, C=GB"
$ANDROID_HOME/build-tools/*/apksigner verify --print-certs app-release.apk
```

## Install

On the stick: Settings → My Fire TV → Developer options → ADB debugging and Apps from unknown
sources on. Bump `versionCode` in `app/build.gradle.kts` before installing a changed wrapper.

```sh
adb connect 192.168.1.50:5555
adb install -r app/build/outputs/apk/release/app-release.apk
adb shell monkey -p com.axh.makebelieve.tv 1     # launch without the remote
adb logcat -s MAKEbelieve                        # the page's console; first line is URL and user-agent
```

## Remote and assets

Back exits and Menu reloads; nothing else is bound, because the host page takes no input. The
banner and launcher icon come from the phone's `blob.svg` via `scripts/banner.mjs`, run by hand and
committed.

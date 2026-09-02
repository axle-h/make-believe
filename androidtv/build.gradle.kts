/*
 * The TV wrapper is a Gradle project, not a pnpm package: it is deliberately
 * outside `pnpm build` and `pnpm test`, and building it needs the Android SDK.
 * See README.md beside this file.
 */
plugins {
  alias(libs.plugins.android.application) apply false
}

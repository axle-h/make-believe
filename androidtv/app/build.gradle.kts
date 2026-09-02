plugins {
  // AGP 9 compiles Kotlin itself; there is no separate Kotlin plugin to apply.
  alias(libs.plugins.android.application)
}

/*
 * The only thing the APK really carries: which page to show. Everything else
 * about the game is downloaded fresh from that URL on every launch, which is
 * the whole point of the wrapper — deploy the web app and the TV is up to date
 * without anybody reinstalling anything.
 */
val hostUrl = providers.gradleProperty("hostUrl").getOrElse("https://believe.ax-h.com/host/")

android {
  namespace = "com.axh.makebelieve.tv"
  compileSdk = 37

  defaultConfig {
    applicationId = "com.axh.makebelieve.tv"
    // Fire TV Stick 4K Max (Fire OS 7 / Android 9). Nothing here is Fire-specific.
    minSdk = 28
    targetSdk = 37
    versionCode = 1
    versionName = "1.0"
    buildConfigField("String", "HOST_URL", "\"$hostUrl\"")
  }

  buildFeatures {
    buildConfig = true
    viewBinding = true
  }

  /*
   * Release builds are signed with a keystore that lives outside this repo.
   * Set the four properties in ~/.gradle/gradle.properties; without them the
   * release APK comes out unsigned and `adb install` will refuse it.
   */
  val keystorePath = providers.gradleProperty("makeBelieveKeystore").orNull
  signingConfigs {
    if (keystorePath != null) {
      create("release") {
        storeFile = file(keystorePath)
        storePassword = providers.gradleProperty("makeBelieveKeystorePassword").orNull
        keyAlias = providers.gradleProperty("makeBelieveKeyAlias").getOrElse("makebelieve")
        keyPassword = providers.gradleProperty("makeBelieveKeyPassword").orNull
      }
    }
  }

  buildTypes {
    release {
      isMinifyEnabled = false
      signingConfig = signingConfigs.findByName("release")
    }
    debug {
      applicationIdSuffix = ".debug"
    }
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_21
    targetCompatibility = JavaVersion.VERSION_21
  }
}

dependencies {
  implementation(libs.androidx.core.ktx)
}

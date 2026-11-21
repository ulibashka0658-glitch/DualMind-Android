plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
 namespace = "com.dualmind.studio"
 compileSdk = 35
 defaultConfig { applicationId = "com.dualmind.studio"; minSdk = 26; targetSdk = 35; versionCode = 1; versionName = "0.4.0" }
 compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
 kotlinOptions { jvmTarget = "17" }
}
// The current native Activity uses Android framework APIs only.
// Add inference libraries only when their native Android build is integrated.

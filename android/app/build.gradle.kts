// 웹앱(https://pnj-opic.vercel.app)을 감싸는 안드로이드 앱 (Trusted Web Activity).
// 화면과 기능은 웹에서 오므로, 이 앱은 아이콘·이름·주소만 바뀔 때 다시 빌드한다.
plugins {
    id("com.android.application")
}

val keystorePassword: String? = System.getenv("KEYSTORE_PASSWORD")

android {
    namespace = "com.pnjopic.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.pnjopic.app"
        minSdk = 23
        targetSdk = 35
        versionCode = (project.findProperty("versionCode") as String?)?.toInt() ?: 1
        versionName = "1.0.${versionCode}"
    }

    signingConfigs {
        create("release") {
            // 키 파일은 저장소에 있고, 비밀번호는 GitHub Secrets(ANDROID_KEYSTORE_PASSWORD)에만 있다.
            storeFile = file("../release.keystore")
            storeType = "pkcs12"
            storePassword = keystorePassword
            keyAlias = "opic"
            keyPassword = keystorePassword
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.5.0")
}

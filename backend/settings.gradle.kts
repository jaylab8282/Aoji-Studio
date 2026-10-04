pluginManagement {
    repositories {
        gradlePluginPortal()
        mavenCentral()
    }
}

plugins {
    // JDK 25 자동 설치(로컬 JDK 21, ~/.gradle/jdks/에 내려받음). final_requirements_architecture.md Tech Stack 참고.
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}

rootProject.name = "aojistudio-backend"

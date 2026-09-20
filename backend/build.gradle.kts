plugins {
    java
    id("org.springframework.boot") version "4.1.1"
    id("io.spring.dependency-management") version "1.1.7"
}

group = "studio.jay"
version = "0.0.1-SNAPSHOT"
description = "Jay Studio Server"

java {
    toolchain {
        // 맥북 로컬 JDK는 21. foojay resolver가 JDK 25를 ~/.gradle/jdks/에 자동 설치한다.
        languageVersion = JavaLanguageVersion.of(25)
    }
}

repositories {
    mavenCentral()
}

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-jdbc")
    implementation("org.xerial:sqlite-jdbc:3.53.4.0")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    // Spring Boot 4.1: MockMvc 테스트 지원(@AutoConfigureMockMvc)이 starter-test에서 분리됨.
    testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
    testImplementation("org.yaml:snakeyaml")
}

tasks.withType<Test> {
    useJUnitPlatform()
}

tasks.named<org.springframework.boot.gradle.tasks.bundling.BootJar>("bootJar") {
    archiveFileName.set("jaystudio-backend.jar")
}

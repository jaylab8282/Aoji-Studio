plugins {
    java
    id("org.springframework.boot") version "4.1.1"
    id("io.spring.dependency-management") version "1.1.7"
}

group = "studio.aoji"
version = "1.1.0"
description = "Aoji Studio Server"

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
    // YAML frontmatter 파싱 (ADR-19). Spring Boot가 기본 포함하는 버전을 그대로 쓴다.
    implementation("org.yaml:snakeyaml")
    // 스킬 zip 읽기(ADR-19 v1.2.0, ADR-84): 항목의 유닉스 모드(심볼릭 링크·실행 비트)를 읽는다. Spring Boot BOM 밖이라 버전 고정.
    implementation("org.apache.commons:commons-compress:1.28.0")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    // Spring Boot 4.1: MockMvc 테스트 지원(@AutoConfigureMockMvc)이 starter-test에서 분리됨.
    testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
}

// 성능·부하 측정 테스트(@Tag("perf"))는 기본 test·check·build에서 뺀다(conventions §8). perfTest로만 돈다(Integration 1회).
tasks.named<Test>("test") {
    useJUnitPlatform {
        excludeTags("perf")
    }
}

tasks.register<Test>("perfTest") {
    description = "@Tag(\"perf\") 성능 측정 테스트만 실행한다 (Integration 전용, check/build에 묶지 않음)."
    group = "verification"
    val testSourceSet = sourceSets.test.get()
    testClassesDirs = testSourceSet.output.classesDirs
    classpath = testSourceSet.runtimeClasspath
    useJUnitPlatform {
        includeTags("perf")
    }
    shouldRunAfter(tasks.named("test"))
}

tasks.named<org.springframework.boot.gradle.tasks.bundling.BootJar>("bootJar") {
    archiveFileName.set("aojistudio-backend.jar")
}

springBoot {
    mainClass.set("studio.aoji.AojiStudioApplication")
}

// 상태줄 연동 스크립트(ADR-83): 원본은 helper/에 있고 jar 리소스 statusline/로 복사한다. 서버가 기동 때 .aojistudio/statusline.mjs에 배치한다.
// Docker 빌드 단계는 같은 위치(../helper/)에 이 파일을 함께 복사해야 한다(Dockerfile).
val statuslineScript = layout.projectDirectory.file("../helper/aojistudio-statusline.mjs")

tasks.named<ProcessResources>("processResources") {
    doFirst {
        check(statuslineScript.asFile.isFile) { "상태줄 스크립트가 없습니다: helper/aojistudio-statusline.mjs" }
    }
    from(statuslineScript) {
        into("statusline")
    }
}

# syntax=docker/dockerfile:1
# 멀티스테이지: Node 24로 프론트 빌드 → Gradle(JDK 21에서 실행, toolchain이 JDK 25를 내려받아 컴파일)로 bootJar → JRE 25로 실행.
# final_requirements_architecture.md: "맥북 로컬 JDK는 21. Gradle toolchain(foojay)이 JDK 25를 자동으로 내려받아 쓴다" — 빌드 스테이지도 같은 구성을 그대로 따른다.
# 아키텍처 비의존(베이스 이미지 3종 모두 멀티아치). 빌드 플랫폼은 compose의
# platform(AOJISTUDIO_PLATFORM, 기본 linux/arm64)이 정한다.

FROM node:24-bookworm-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
# 패키지 다운로드는 BuildKit 캐시 마운트로 한 벌만 재사용한다.
RUN --mount=type=cache,target=/root/.npm npm ci
COPY frontend/ ./
RUN npm run build

FROM eclipse-temurin:21-jdk AS backend-build
WORKDIR /app/backend
# 의존성 단계: 빌드 설정 파일만 먼저 복사해 소스가 바뀌어도 이 단계는 재사용된다.
COPY backend/gradlew ./
COPY backend/gradle/ gradle/
COPY backend/build.gradle.kts backend/settings.gradle.kts ./
RUN --mount=type=cache,target=/root/.gradle ./gradlew dependencies --no-daemon -q > /dev/null
COPY backend/ ./
COPY --from=frontend-build /app/frontend/dist/ src/main/resources/static/
RUN --mount=type=cache,target=/root/.gradle ./gradlew bootJar --no-daemon -x test

FROM eclipse-temurin:25-jre AS runtime
WORKDIR /app
COPY --from=backend-build /app/backend/build/libs/aojistudio-backend.jar app.jar
RUN mkdir -p /workspace /data && chown -R 1000:1000 /app /workspace /data
USER 1000:1000
EXPOSE 4180
ENTRYPOINT ["java", "-jar", "/app/app.jar"]

# Jay Studio

Claude Code 에이전트 워크플로우 관제 도구. `docs/`의 설계를 기준으로 한다.

## 요구 사항

- Docker Desktop (macOS, Apple Silicon), `docker compose` v2 이상
- Node 24 (프론트·헬퍼·도구), 로컬 JDK 21 이상 (Gradle toolchain이 JDK 25를 `~/.gradle/jdks/`에 자동 설치)
- 실행 대상 프로젝트 폴더(`JAYSTUDIO_HOST_PATH`)

## 운영 실행 (컨테이너)

```bash
cp .env.example .env
# .env에서 JAYSTUDIO_HOST_PATH=<맥북의 JayStudio 폴더 절대 경로> 로 채운다.
docker compose up -d --build
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4180/   # 200
docker compose down
```

포트(`JAYSTUDIO_PORT`, 기본 4180)와 마운트 경로(`JAYSTUDIO_HOST_PATH`)는 `.env`에만 둔다. 값이 없으면 `docker compose up`이 실패한다.

## 개발 실행 (컨테이너 없이)

Backend와 Frontend를 따로 띄운다. 실제 `JayStudio/.claude`·`.jaystudio`는 쓰지 않고 임시 폴더를 사용한다.

```bash
# Backend (127.0.0.1:8080)
mkdir -p /tmp/jaystudio-dev-mount /tmp/jaystudio-dev-data
cd backend
JAYSTUDIO_HOST_PATH=/tmp/jaystudio-dev-mount \
JAYSTUDIO_PUBLIC_PORT=8080 \
JAYSTUDIO_MOUNT_PATH=/tmp/jaystudio-dev-mount \
JAYSTUDIO_DATA_PATH=/tmp/jaystudio-dev-data \
./gradlew bootRun --args='--spring.profiles.active=dev'
```

```bash
# Frontend (127.0.0.1:5173, /api·/hooks는 8080으로 프록시)
cd frontend
npm install
npm run dev
```

## 빌드·테스트

```bash
# Backend
cd backend && ./gradlew build

# Frontend
cd frontend && npm install && npm run build && npm test && npm run lint && npm run typecheck

# Helper
cd helper && npm test
```

## E2E (실제 컨테이너, 목킹 없음)

```bash
cd tools/e2e
npm install
npx playwright install chromium   # ~/Library/Caches/ms-playwright 에 설치 (사전 1회)

./scripts/run-e2e.sh               # fixture 배치 전체
```

`globalSetup`이 fixture를 임시 폴더로 복사하고 `compose.e2e.yaml`을 띄운 뒤
dry-run 도우미(4191)와 다른 Origin 페이지 서버(4192)까지 준비하며,
`globalTeardown`이 컨테이너·프로세스·임시 폴더를 정리한다. 사전 준비 명령은 없다.
E2E 공개 포트는 `127.0.0.1:4185`다 — `4190`은 쓰지 않는다(WHATWG Fetch bad port, ADR-45).

배치 하나만 돌리려면:

```bash
cd tools/e2e
E2E_FIXTURE=project-configured npx playwright test tests/e2e-03.spec.ts
```

## 저장소 구조

```text
backend/    Spring Boot 4.1.x · Java 25 · Gradle Kotlin DSL
frontend/   React 19.3 · TS · Vite 8 · Tailwind 4.3 · React Router v7
helper/     맥북 호스트에서 도는 열기 도우미 (Node 24, 외부 의존 없음)
tools/      replay(이벤트 재생) · fixtures(테스트용 프로젝트 폴더) · e2e(Playwright)
```

자세한 설계는 `docs/architecture.md`, `docs/conventions.md`, `docs/api-spec.yaml`, `docs/realtime-spec.md`, `docs/ui-spec.md`를 따른다.

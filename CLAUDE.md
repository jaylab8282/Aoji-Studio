<!-- web-develop-depart/<프로젝트명>/CLAUDE.md로 복사한다. Project와 Automation은 사람이 채우고, Commands는 web-scaffolder가 작성한다. 이 폴더의 파일을 읽을 때 컨텍스트에 올라간다. 역할별 절차는 에이전트 파일에 있으므로 여기에 적지 않는다. 이 주석은 컨텍스트에 올라가지 않는다. -->
# Jay_Studio

## Project
- 한 줄 요약: 맥북 로컬에서 Claude Code 에이전트 워크플로우(정의·구성 파일)를 관리하고 hook 이벤트를 SSE로 실시간 관제하는 단일 컨테이너 웹 도구.
- 절대 제약: 실제 `JayStudio/.claude`·`.jaystudio`는 자동 구간에서 생성·수정·삭제하지 않는다(테스트는 `tools/fixtures/*`를 임시 폴더로 복사). `0.0.0.0` 바인딩·`docker.sock` 마운트·`JayStudio` 밖 호스트 경로 마운트 금지. 웹에서 셸·에이전트 실행 기능·로그인·외부 접속 기능을 추가하지 않는다. git push·데이터 삭제는 사용자 요청 없이 하지 않는다. 맥북에 소프트웨어를 설치하지 않는다(Gradle wrapper·npm·Playwright 브라우저 캐시 안은 허용).
- 기준 문서: `docs/final_requirements_function.md`, `docs/final_requirements_architecture.md`

## Commands
<!-- web-scaffolder가 작성한다. 모든 명령은 이 폴더 기준이며, 실제로 실행해 확인한 명령만 적는다. -->
- install:
  - Backend: 없음(`./gradlew`가 최초 빌드 시 Gradle·JDK 25 toolchain을 `~/.gradle/`에 자동 설치)
  - Frontend: `cd frontend && npm install`
  - Helper: 없음(외부 npm 의존 없음)
  - E2E: `cd tools/e2e && npm install && npx playwright install chromium`
- dev:
  - Backend(127.0.0.1:8080, 실제 `.claude`/`.jaystudio` 대신 임시 폴더 사용):
    `mkdir -p /tmp/jaystudio-dev-mount /tmp/jaystudio-dev-data && cd backend && JAYSTUDIO_HOST_PATH=/tmp/jaystudio-dev-mount JAYSTUDIO_PUBLIC_PORT=8080 JAYSTUDIO_MOUNT_PATH=/tmp/jaystudio-dev-mount JAYSTUDIO_DATA_PATH=/tmp/jaystudio-dev-data ./gradlew bootRun --args='--spring.profiles.active=dev'`
  - Frontend(127.0.0.1:5173, `/api`·`/hooks`를 8080으로 프록시): `cd frontend && npm run dev`
- build:
  - Backend: `cd backend && ./gradlew build` (컴파일·테스트·bootJar)
  - Frontend: `cd frontend && npm run build` (tsc -b && vite build)
- test:
  - Backend: `cd backend && ./gradlew test`
  - Frontend: `cd frontend && npm test`
  - Helper: `cd helper && npm test`
  - Tools(재생 도구·fixture 형식): `cd tools/replay && npm test`
- lint / typecheck:
  - Frontend: `cd frontend && npm run lint && npm run typecheck`
  - Backend: `./gradlew build`에 컴파일 타입 검사 포함(별도 린터 없음, 확정 스택)
- up (전체 기동):
  - `cp .env.example .env` 후 `.env`의 `JAYSTUDIO_HOST_PATH`를 채운다 → `docker compose up -d --build`
  - 확인: `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4180/` → `200`
- down:
  - `docker compose down -v`
- e2e (공개 포트 `127.0.0.1:4185` — `4190`은 쓰지 않는다: WHATWG Fetch bad port, ADR-45):
  - (사전 1회) `cd tools/e2e && npm install && npx playwright install chromium`
  - 전체: `cd tools/e2e && ./scripts/run-e2e.sh`
    - `globalSetup`이 fixture 임시 복사 → `compose.e2e.yaml up -d --build` → dry-run 도우미(4191) → 다른 Origin 페이지 서버(4192)까지 준비하고, `globalTeardown`이 컨테이너·프로세스·임시 폴더를 정리한다. 사전 준비 명령 없음
    - 기동 전에 4185·4191·4192 선점 검사를 한다 — 낡은 스택이 남아 있으면 소유 pid와 정리 명령을 출력하고 즉시 실패한다
  - 배치 단독 실행(fixture가 다른 시나리오는 실행을 나눈다):
    - `cd tools/e2e && E2E_FIXTURE=project-configured npx playwright test tests/e2e-03.spec.ts tests/e2e-07.spec.ts tests/e2e-10.spec.ts`
    - `cd tools/e2e && E2E_FIXTURE=project-no-agents-dir npx playwright test tests/e2e-06.spec.ts --grep "project-no-agents-dir"`
  - 실패 조사: 위 명령 앞에 `E2E_KEEP_UP=1`을 붙이면 정리를 건너뛴다. 조사 후 출력된 정리 명령을 그대로 실행하고 `lsof -nP -iTCP:4185 -iTCP:4191 -iTCP:4192`로 확인한다

## Automation
- design_checkpoint: on
- max_fix_rounds: 3

## Rules
- `docs/requirements_*.md`(원본)와 `docs/ui/`(확정 UI 기준)는 수정하지 않는다. `docs/final_requirements_*.md`는 `/web-planner`만 수정한다.
- `docs/api-spec*`, `docs/realtime-spec.md`, `docs/ui-spec.md`는 web-architect만 수정한다.
- 커밋은 web-develop-tech-lead만 한다. `.env`는 커밋하지 않고 `.env.example`만 커밋한다.
- 검증은 위 Commands로 한다. 적혀 있지 않은 명령으로 통과를 주장하지 않는다.

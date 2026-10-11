<!-- web-develop-depart/<프로젝트명>/CLAUDE.md로 복사한다. Project와 Automation은 사람이 채우고, Commands는 web-scaffolder가 작성한다. 이 폴더의 파일을 읽을 때 컨텍스트에 올라간다. 역할별 절차는 에이전트 파일에 있으므로 여기에 적지 않는다. 이 주석은 컨텍스트에 올라가지 않는다. -->
# Aoji-Studio

## Project
- 한 줄 요약: 맥북 로컬에서 Claude Code 에이전트 워크플로우(정의·구성 파일)를 관리하고 hook 이벤트를 SSE로 실시간 관제하는 단일 컨테이너 웹 도구.
- 절대 제약: 실제 `AojiStudio/.claude`·`.aojistudio`는 자동 구간에서 생성·수정·삭제하지 않는다(테스트는 `tools/fixtures/*`를 임시 폴더로 복사). `0.0.0.0` 바인딩·`docker.sock` 마운트·`AojiStudio` 밖 호스트 경로 마운트 금지. 웹에서 셸·에이전트 실행 기능·로그인·외부 접속 기능을 추가하지 않는다. git push는 사람만 한다. 데이터 삭제는 사용자 요청 없이 하지 않는다. 맥북에 소프트웨어를 설치하지 않는다(Gradle wrapper·npm·Playwright 브라우저 캐시 안은 허용).
- 기준 문서: `docs/final_requirements_function.md`, `docs/final_requirements_architecture.md`

## Commands
<!-- web-scaffolder가 작성한다. 모든 명령은 이 폴더 기준이며, 실제로 실행해 확인한 명령만 적는다. -->
- install:
  - Backend: 없음(`./gradlew`가 최초 빌드 시 Gradle·JDK 25 toolchain을 `~/.gradle/`에 자동 설치)
  - Frontend: `cd frontend && npm install`
  - Helper: 없음(외부 npm 의존 없음)
  - E2E: `cd tools/e2e && npm install && npx playwright install chromium`
- dev:
  - Backend(127.0.0.1:8080, 실제 `.claude`/`.aojistudio` 대신 임시 폴더 사용):
    `mkdir -p /tmp/aojistudio-dev-mount /tmp/aojistudio-dev-data && cd backend && AOJISTUDIO_HOST_PATH=/tmp/aojistudio-dev-mount AOJISTUDIO_PUBLIC_PORT=8080 AOJISTUDIO_MOUNT_PATH=/tmp/aojistudio-dev-mount AOJISTUDIO_DATA_PATH=/tmp/aojistudio-dev-data ./gradlew bootRun --args='--spring.profiles.active=dev'`
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
  - `cp .env.example .env` 후 `.env`의 `AOJISTUDIO_HOST_PATH`를 채운다(x86_64 머신은 `AOJISTUDIO_PLATFORM=linux/amd64` 주석도 푼다) → `docker compose up -d --build --remove-orphans`
  - 확인: `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4180/` → `200`
- down:
  - `docker compose down --remove-orphans` (볼륨 유지)
  - 주의: `docker compose down -v`는 이벤트 볼륨 `aojistudio-data`를 지운다. 볼륨 이름이 고정이라 **`-p`만으로는 볼륨이 격리되지 않는다 — 운영 `compose.yaml`의 빌드·기동 확인은 `tools/e2e/scripts/check-compose-build.sh`로 한다**(운영 compose를 `-p`만 바꿔 `up`/`down -v` 하지 않는다).
- compose 확인 스크립트(운영 볼륨을 건드리지 않는다. x86_64 머신은 `AOJISTUDIO_PLATFORM=linux/amd64`를 앞에 붙인다):
  - 옛 앱 이름 검색 0건(컨테이너 기동 없음, NFR-13 ⑤): `tools/e2e/scripts/check-old-names.sh [루트]`
  - 옛 이름 환경 변수 거부(컨테이너 기동 없음, NFR-13 ②): `tools/e2e/scripts/check-old-env.sh`
  - 운영 `compose.yaml` 빌드·기동(포트 4186, 임시 볼륨 `aojistudio-r2check-data`): `tools/e2e/scripts/check-compose-build.sh`
- e2e (공개 포트 `127.0.0.1:4185` — `4190`은 쓰지 않는다: WHATWG Fetch bad port, ADR-45):
  - (사전 1회) `cd tools/e2e && npm install && npx playwright install chromium`
  - 전체: `cd tools/e2e && ./scripts/run-e2e.sh`
    - 사전 2단계(`check-old-names.sh`·`check-old-env.sh`) 뒤 **11배치**(63·16·5·4·9·12·2·25·7·3·6 = 152)를 순서대로 돈다.
    - `globalSetup`이 fixture 임시 복사 → `compose.e2e.yaml up -d --build` → dry-run 도우미(4191) → 다른 Origin 페이지 서버(4192)까지 준비하고, `globalTeardown`이 컨테이너·프로세스·임시 폴더를 정리한다. 사전 준비 명령 없음
    - 기동 전에 4185·4191·4192 선점 검사를 한다 — 낡은 스택이 남아 있으면 소유 pid와 정리 명령을 출력하고 즉시 실패한다
  - 배치 단독 실행(fixture가 다른 시나리오는 실행을 나눈다. `cd tools/e2e && ` 뒤에 쓴다):
    - 배치 1 `E2E_FIXTURE=project-basic npx playwright test tests/e2e-01.spec.ts tests/e2e-02.spec.ts tests/e2e-08.spec.ts tests/e2e-14.spec.ts tests/health.spec.ts tests/compose-volume.spec.ts tests/isolation.spec.ts`
    - 배치 2 `E2E_FIXTURE=project-configured npx playwright test tests/e2e-03.spec.ts tests/e2e-07.spec.ts tests/e2e-10.spec.ts`
    - 배치 3 `E2E_FIXTURE=project-no-agents-dir npx playwright test tests/e2e-06.spec.ts tests/e2e-13.spec.ts --grep "project-no-agents-dir"`
    - 배치 4 `E2E_FIXTURE=project-format-errors npx playwright test tests/e2e-06.spec.ts tests/e2e-13.spec.ts --grep "project-format-errors"`
    - 배치 5 `E2E_FIXTURE=project-configured npx playwright test tests/e2e-04.spec.ts tests/e2e-15.spec.ts`
    - 배치 6 `E2E_FIXTURE=project-configured npx playwright test tests/e2e-09.spec.ts tests/e2e-11.spec.ts`
    - 배치 7(pause 단독, 약 3분) `E2E_FIXTURE=project-configured npx playwright test tests/e2e-05.spec.ts tests/e2e-13.spec.ts --grep "E2E-05|project-configured 04-3"`
    - 배치 8 `E2E_FIXTURE=project-showcase npx playwright test tests/e2e-13.spec.ts tests/e2e-16.spec.ts tests/e2e-16z-e2e13-state-changes.spec.ts --grep "project-showcase"` (파일 이름순 실행에 기대는 순서: 13 → 16 → 16z)
    - 배치 9 `E2E_FIXTURE=project-large npx playwright test tests/e2e-12.spec.ts`
    - 배치 10 `E2E_FIXTURE=project-old-name npx playwright test tests/e2e-17-old-name.spec.ts`
    - 배치 11 `E2E_FIXTURE=project-basic npx playwright test tests/e2e-13.spec.ts --grep "project-basic"`
  - E2E-13 화면 대조 캡처 60장은 `tools/e2e/screenshots/<원본 이름>@<W>x<H>.png`에 남는다(`docs/ui/screens/`의 원본 PNG와 같은 이름, `.gitignore` 대상). 배치 3·4·7·8·11이 나눠 만든다.
  - x86_64 머신(WSL 등)은 위 e2e 명령 앞에 `E2E_PLATFORM=linux/amd64`를 붙인다.
  - 실패 조사: 위 명령 앞에 `E2E_KEEP_UP=1`을 붙이면 정리를 건너뛴다. 조사 후 출력된 정리 명령을 그대로 실행하고 `lsof -nP -iTCP:4185 -iTCP:4191 -iTCP:4192`로 확인한다

## Automation
- design_checkpoint: on
- max_fix_rounds: 3

## Rules
- `docs/requirements_*.md`(원본)와 `docs/ui/`(확정 UI 기준)는 수정하지 않는다. `docs/final_requirements_*.md`는 `/web-planner`만 수정한다.
- `docs/api-spec*`, `docs/realtime-spec.md`, `docs/ui-spec.md`는 web-architect만 수정한다.
- 커밋은 web-develop-tech-lead만 한다. `.env`는 커밋하지 않고 `.env.example`만 커밋한다.
- 검증은 위 Commands로 한다. 적혀 있지 않은 명령으로 통과를 주장하지 않는다.

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
  - Backend: `cd backend && ./gradlew test` (`@Tag("perf")` 제외)
  - Backend 성능 측정(Integration 전용, 1회만 — 태스크·수정 라운드에서는 돌리지 않는다. `check`/`build`에 묶여 있지 않다): `cd backend && ./gradlew perfTest`
  - Frontend: `cd frontend && npm test`
  - Helper(Node `node --test`, 외부 의존 없음, 98개; Windows 분기·`.ps1` 정적 검사 포함): `cd helper && npm test` (또는 `npm test --prefix helper`)
  - Tools(재생 도구·fixture 형식, 60개): `cd tools/replay && npm test`
- lint / typecheck:
  - Frontend: `cd frontend && npm run lint && npm run typecheck`
  - Backend: `./gradlew build`에 컴파일 타입 검사 포함(별도 린터 없음, 확정 스택)
  - E2E: `cd tools/e2e && npm run typecheck` (`tsc --noEmit`, 오류 0)
- up (전체 기동):
  - `cp .env.example .env` 후 `.env`의 `AOJISTUDIO_HOST_PATH`를 채운다(x86_64 머신은 `AOJISTUDIO_PLATFORM=linux/amd64` 주석도 푼다) → `docker compose up -d --build --remove-orphans`
  - 확인: `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4180/` → `200`
- down:
  - `docker compose down --remove-orphans` (볼륨 유지)
  - 주의: `docker compose down -v`는 이벤트 볼륨 `aojistudio-data`를 지운다. 볼륨 이름이 고정이라 **`-p`만으로는 볼륨이 격리되지 않는다 — 운영 `compose.yaml`의 빌드·기동 확인은 `tools/e2e/scripts/check-compose-build.sh`로 한다**(운영 compose를 `-p`만 바꿔 `up`/`down -v` 하지 않는다).
- compose 확인 스크립트(운영 볼륨을 건드리지 않는다. x86_64 머신은 `AOJISTUDIO_PLATFORM=linux/amd64`를 앞에 붙인다):
  - 옛 앱 이름 검색 0건(컨테이너 기동 없음, NFR-13 ⑤): `tools/e2e/scripts/check-old-names.sh [루트]`
  - 옛 이름 환경 변수 거부(컨테이너 기동 없음, NFR-13 ②): `tools/e2e/scripts/check-old-env.sh`
  - 전역 Claude 설정 연결 구성 3경우(홈 없음 → 대역 / 홈 있음 / 항목 `_SRC` 덮어쓰기, 이미지 빌드·기동 없음, ADR-79): `tools/e2e/scripts/check-compose-config.sh`; 운영 `.env`가 없어도 임시 env 파일로 돈다(`docker compose config`만 쓴다)
  - 운영 `compose.yaml` 빌드·기동(포트 4186, 임시 볼륨 `aojistudio-r2check-data`): `tools/e2e/scripts/check-compose-build.sh`; 포트 `127.0.0.1:` 접두·운영 볼륨 불변·전역 연결 4개 읽기 전용(컨테이너 안에서 쓰기 시도 거부)·`.credentials.json` 없음(NFR-04·06·15)을 확인하고, 빌드 뒤 Docker 빌드 캐시 크기를 출력한다(D-143 — 정리 명령은 제안만 출력, 스크립트가 prune하지 않는다)
- e2e (공개 포트 `127.0.0.1:4185` — `4190`은 쓰지 않는다: WHATWG Fetch bad port, ADR-45):
  - (사전 1회) `cd tools/e2e && npm install && npx playwright install chromium`
  - 전체: `cd tools/e2e && ./scripts/run-e2e.sh`
    - 재개·선택: `./scripts/run-e2e.sh --from 4`(배치 4부터 끝까지, 환경 변수 `E2E_FROM_BATCH=4`), `./scripts/run-e2e.sh --only 3,8`(지정 배치만, `E2E_ONLY_BATCHES=3,8`). 사전 2단계는 항상 돌고 실패하면 즉시 중단한다. **배치가 실패해도 멈추지 않고 나머지 배치를 계속 돈 뒤**, 마지막 `배치별 결과`(PASS/FAIL/SKIP)와 종료 코드(실패가 있으면 1)로 알린다. x86_64 머신은 `E2E_PLATFORM=linux/amd64 ./scripts/run-e2e.sh --from 4`
    - 사전 2단계(`check-old-names.sh`·`check-old-env.sh`) 뒤 **14배치**를 배치 1~14 순서로 돈다. 배치별 수(`npx playwright test --list`로 센 값, 2026-10-17 T-R4-22 구현 뒤): 74·17·5·4·9·17·2·22·7·3·7·19·58·9 (배치 1~14 순) — **합계 253** — 2026-10-17 T-R4-22 전체 실행 253 passed로 일치.
    - `globalSetup`이 fixture 임시 복사 → `compose.e2e.yaml up -d --build` → dry-run 도우미(4191) → 다른 Origin 페이지 서버(4192)까지 준비하고, `globalTeardown`이 컨테이너·프로세스·임시 폴더를 정리한다. 사전 준비 명령 없음
    - 기동 전에 4185·4191·4192 선점 검사를 한다 — 낡은 스택이 남아 있으면 소유 pid와 정리 명령을 출력하고 즉시 실패한다
  - 배치 단독 실행(fixture가 다른 시나리오는 실행을 나눈다. `cd tools/e2e && ` 뒤에 쓴다):
    - 배치 1 `E2E_FIXTURE=project-basic npx playwright test tests/e2e-01.spec.ts tests/e2e-02.spec.ts tests/e2e-08.spec.ts tests/e2e-14.spec.ts tests/health.spec.ts tests/compose-volume.spec.ts tests/isolation.spec.ts` (`--list` 74개, 2026-10-17 배치 단독 실행 74 passed. e2e-08에 T-R4-20 3개: 스킬 변경 API·zip 미리보기·가져오기 다른 Origin 차단, `/hooks/statusline` 토큰 없음·틀림 401)
    - 배치 2 `E2E_FIXTURE=project-configured npx playwright test tests/e2e-03.spec.ts tests/e2e-07.spec.ts tests/e2e-10.spec.ts` (`--list` 17개)
    - 배치 3 `E2E_FIXTURE=project-no-agents-dir npx playwright test tests/e2e-06.spec.ts tests/e2e-13.spec.ts --grep "project-no-agents-dir"` (`--list` 5개)
    - 배치 4 `E2E_FIXTURE=project-format-errors npx playwright test tests/e2e-06.spec.ts tests/e2e-13.spec.ts --grep "project-format-errors"` (`--list` 4개)
    - 배치 5 `E2E_FIXTURE=project-configured npx playwright test tests/e2e-04.spec.ts tests/e2e-15.spec.ts` (`--list` 9개)
    - 배치 6 `E2E_FIXTURE=project-configured npx playwright test tests/e2e-09.spec.ts tests/e2e-11.spec.ts tests/e2e-21b-disconnected.spec.ts` (`--list` 17개. e2e-11은 T-R4-19로 7개: 07 상태줄 연동 카드 `[FR-014-AC6]`·`[FR-027-E1]`과 입력 요소 0 `[FR-014-AC7]` 추가, 수집·상태줄 카드에 `설정 예시 복사`가 둘이라 복사 버튼은 카드(region)로 좁혀 찾는다. 새 단언은 스택 담당이 처음 돌려 확인. e2e-21b 09 MCP `연결 안 됨` 1개 T-R4-17 + 10 비용 `연결 안 됨` 2개 T-R4-18(`[FR-025-E1]`·`[FR-027-E1]`). 새 spec은 스택 담당이 처음 돌려 확인)
    - 배치 7(pause 단독, 약 3분) `E2E_FIXTURE=project-configured npx playwright test tests/e2e-05.spec.ts tests/e2e-13.spec.ts --grep "E2E-05|project-configured 04-3"` (`--list` 2개)
    - 배치 8 `E2E_FIXTURE=project-showcase npx playwright test tests/e2e-13.spec.ts tests/e2e-16.spec.ts tests/e2e-16z-e2e13-state-changes.spec.ts --grep "project-showcase"` (`--list` 22개: e2e-13 순서 1~8 + 5a(`05-4`, T-R4-22), e2e-16 01·02·03 × 3크기 9경우(07은 배치 13으로 이동), e2e-16z. 파일 이름순 실행에 기대는 순서: 13 → 16 → 16z)
    - 배치 9 `E2E_FIXTURE=project-large npx playwright test tests/e2e-12.spec.ts` (`--list` 7개)
    - 배치 10 `E2E_FIXTURE=project-old-name npx playwright test tests/e2e-17-old-name.spec.ts` (`--list` 3개)
    - 배치 11 `E2E_FIXTURE=project-basic npx playwright test tests/e2e-13.spec.ts --grep "project-basic"` (`--list` 7개: 04-2·04-7·05-L 3종·04-1 + T-R4-22 순서 7 `10-cost-disconnected`)
    - 배치 12 `E2E_FIXTURE=project-skills E2E_CLAUDE_HOME_FIXTURE=claude-home-empty npx playwright test tests/e2e-18a-skills-list.spec.ts tests/e2e-18b-skills-write.spec.ts` (`--list` 19개: e2e-18a 5개 T-R4-15 + e2e-18b 14개 = T-R4-16 12개 + T-R4-22 상태 화면 캡처 2개 `09-mcp-empty`·`08-skills-empty`, 파일 이름순. `08-skills-empty`는 스킬 폴더를 모두 `<fixture>/.e2e18b-skills-parked`로 옮겼다 되돌린다(finally). 2026-10-16 배치 단독 실행 17 passed는 T-R4-22 이전 값)
    - 배치 13 `E2E_FIXTURE=project-usage E2E_CLAUDE_HOME_FIXTURE=claude-home-basic npx playwright test tests/e2e-19a-skill-usage.spec.ts tests/e2e-19b-mcp-usage.spec.ts tests/e2e-20-mcp.spec.ts tests/e2e-21-cost.spec.ts tests/e2e-22-statusline.spec.ts tests/e2e-22z-screens-v120.spec.ts tests/e2e-24-no-external.spec.ts tests/e2e-25-markers.spec.ts tests/e2e-26-claude-home-isolation.spec.ts` (`--list` 58개, T-R4-22 전 2026-10-17 배치 단독 실행 44 passed. e2e-19a 4개(T-R4-15 3개 + T-R4-22 `08-skills` 3크기 캡처 1개) + e2e-19b 2개·e2e-20 7개 T-R4-17 + e2e-21-cost 11개·e2e-22-statusline 9개 T-R4-18 + T-R4-22 `e2e-22z-screens-v120` 13개(순서 6 `07-settings` 3크기 캡처 1개 + 순서 7 E2E-16 07·08·09·10 × 사이 크기 3 = 12경우, 읽기만 한다), 파일 이름순. 이벤트 0건인 새 컨테이너 전제 — `usage.jsonl`은 e2e-19a가 재생하고 e2e-19b가 31번 줄을 3번 더 재생한다. e2e-21-cost는 에이전트 나눔에 `기본 세션`이 생긴 뒤·상태줄을 받기 전에 돌고, 맨 마지막 테스트가 fixture 대화 기록에 줄을 덧붙여(입력 +100·출력 +50) 비용 합계를 바꾼다 — 그 뒤 spec은 `claude-home-basic/expected.json` 합계에 기대지 않는다. e2e-22-statusline은 컨테이너가 배치한 `<fixture>/.aojistudio/statusline.mjs`를 fixture 입력(`tools/fixtures/statusline/*.json`)으로 실행하고 한도 캐시(`.claude.json` 사본)를 잠시 바꿨다 원복하며, 마지막 테스트가 컨테이너를 `docker compose pause`했다 `unpause`(finally, running 단언)한다. e2e-24(외부 요청 0 3개 T-R4-20: 01·02·03·07·08·09·10과 팝업 05R·05-3·06·08-1·08-2·08-3·10-1을 열며 브라우저 요청 호스트가 `127.0.0.1`(4185·4191)뿐)·e2e-25(표지 문자열 0 6개: 양성 대조 + API 응답·화면이 받은 응답·SSE·컨테이너 로그·`docker cp /data/.`로 꺼낸 `events.db`·`-wal` 바이트)·e2e-26(전역 연결 격리 4개, `docker exec`/`docker inspect`)은 이름순으로 e2e-22·e2e-22z **뒤**에 돈다(일부러: e2e-25는 재생·상태줄 수신이 끝난 뒤의 DB·로그를 봐야 하고, 셋 다 beforeAll에서 컨테이너 running을 단언한다. 읽기 전용이라 e2e-21의 대화 기록 덧붙임(표지 없는 줄)에 영향받지 않는다). 파일 이름을 바꾸거나 명시 순서를 쓰지 않는다(Playwright는 인자 순서가 아니라 이름순으로 실행한다).)
    - 배치 14 `E2E_FIXTURE=project-configured E2E_HOST_OS=wsl E2E_WSL_DISTRO=Ubuntu-24.04 E2E_HELPER_PLATFORM=windows npx playwright test tests/e2e-23-wsl.spec.ts` (E2E-23 9개 T-R4-19, 단독 배치: 서버는 WSL 실행 환경, dry-run 도우미는 Windows 분기 — `DRY-RUN wt.exe -w 0 new-tab --title Aoji Studio wsl.exe -d Ubuntu-24.04 --cd <fixture 경로> -- bash -lic 'exec claude "$@"' claude (--agent <lead>)`. 도우미 정지(SIGSTOP→SIGCONT)는 spec 안에서 원복한다. `--list` 9개)
  - E2E-13 화면 대조 캡처 96장(v1.2.0 32화면 × 3크기)은 `tools/e2e/screenshots/<원본 이름>@<W>x<H>.png`에 남는다(`docs/ui/screens/`의 원본 PNG와 같은 이름, `.gitignore` 대상). 크기별 32장씩이다(1920×1080·1440×810·1080×1920). 배치별: 3(04-5)·4(04-6)·7(04-3)·8(01·02·03·05R·05-3·05-4·06·04-4·06-6·06-5·05R-empty)·11(04-2·04-7·05L 3종·04-1·10-cost-disconnected)·12(08-3 e2e-18a, 08-1·08-4·08-2·09-mcp-empty·08-skills-empty e2e-18b)·13(08-skills e2e-19a, 09-mcp e2e-20, 10-cost·10-1-price-panel e2e-21-cost, 07-settings e2e-22z). 같은 이름을 나중 배치가 덮어쓰며 마지막 실행 결과가 남는다(배치 6의 e2e-11이 `07-settings@1920x1080` 1장을 연결 안 됨 상태로 만들지만 배치 13 e2e-22z가 3크기를 다시 찍는다). 영역(`data-wf`)과 크기별 배치 수치는 같은 순간에 자동 판정한다(`screen-helpers.ts`의 `expectSettingsLayout`·`expectSkillsLayout`·`expectMcpLayout`·`expectCostLayout`).
  - 전역 Claude 설정 연결(선택): 기본은 대역(`tools/claude-home-off`, 연결 안 됨). `E2E_CLAUDE_HOME_FIXTURE=claude-home-basic`을 앞에 붙이면 그 fixture를 임시 폴더로 복사(자리표시 문자열 치환)해 읽기 전용으로 연결하고 teardown이 지운다. `E2E_HOST_OS`·`E2E_WSL_DISTRO`는 서버 실행 환경 값. `E2E_HELPER_PLATFORM=windows`면 dry-run 도우미를 Windows 분기(`--platform windows --wsl-distro`)로 띄우고 서버도 `wsl`(기본 배포판 `Ubuntu-24.04`)로 띄운다. 실제 홈(`~/.claude`)은 연결하지 않는다.
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

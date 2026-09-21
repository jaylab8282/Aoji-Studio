# Jay Studio — Tasks

- 기준: `architecture.md`, `conventions.md`, `api-spec.yaml`, `realtime-spec.md`, `ui-spec.md`
- 테스트 이름 규칙: `[FR-xxx-ACn]`을 테스트 이름에 포함(conventions §8). 아래 `Done when`의 테스트 이름은 그 규칙으로 실제 이름을 정한다.
- 확인 방법 표기: `단위` = JUnit/Vitest/node:test, `통합` = Spring Boot Test(임시 fixture + 실제 SQLite), `E2E` = Playwright(실제 컨테이너, architecture §8.2 번호), `사람` = architecture §8.3 H-n
- 모든 태스크는 실제 `JayStudio/.claude`·`.jaystudio`를 건드리지 않는다. 테스트는 `tools/fixtures/*`를 임시 폴더로 복사한다.

## T-001 프로젝트 스캐폴드 · 컨테이너 · 기동 보안 기본값
- Status: done
- Scope: Backend, Frontend, Tools
- FR: FR-014
- AC: -
- Errors: FR-014-E1
- Screens: -
- Backend: Gradle Kotlin DSL + toolchain(JDK 25 자동 설치), Spring Boot 4.1.x 앱 골격, `AppProperties`(필수 env 검증: `JAYSTUDIO_HOST_PATH`, `JAYSTUDIO_PUBLIC_PORT` 누락·빈값 → 기동 실패), `application.yaml`(디버그 꺼짐, `include-stacktrace=never`), `application-dev.yaml`(`server.address=127.0.0.1`, 8080), 정적 SPA 제공(`StaticSpaConfig`: 알 수 없는 경로 → `index.html`), `.gitignore`
- Frontend: Vite 8 + React 19.3 + TS(strict) + Tailwind 4.3 골격, `styles/theme.css` `@theme` 토큰(ui-spec 공통 매핑 전체), self-host 폰트, Vite `server.host='127.0.0.1'` + `/api`·`/hooks` 프록시, React Router v7 라우트 4개(빈 화면이 아니라 T-013 셸까지 연결), Vitest 설정
- Tools: `Dockerfile`(멀티스테이지, `linux/arm64`, `USER 1000`), `compose.yaml`(`127.0.0.1:${JAYSTUDIO_PORT:?}:4180`, `${JAYSTUDIO_HOST_PATH:?}:/workspace`, `jaystudio-data:/data`, env), `.env.example`, `README.md` 실행 방법, `CLAUDE.md` Commands(scaffolder)
- Done when:
  - FR-014-E1 — 통합 `AppStartupTest [FR-014-E1] JAYSTUDIO_HOST_PATH 없음 → 컨텍스트 기동 실패`, `[NFR-05] JAYSTUDIO_PUBLIC_PORT 빈값 → 기동 실패`
  - NFR-04·NFR-06 — 단위 `ComposeFileTest`(compose.yaml 파싱: `ports`가 `127.0.0.1:`로 시작, `docker.sock` 없음, `privileged` 없음, `user: "1000:1000"`), E2E-14 `check-port.sh`(T-024)
  - 빌드 확인 — `docker compose build` 성공, `docker compose up` 후 `GET /`가 200(README 명령 그대로). 마운트 쓰기 확인: fixture 임시 폴더를 마운트해 uid 1000으로 파일 생성 성공(실패 시 에스컬레이션)
- Depends on: -

## T-002 인증 · 토큰 · Origin 규칙
- Status: done
- Scope: Backend
- FR: FR-003, FR-013
- AC: FR-003-AC1, FR-003-AC2, FR-013-AC8
- Errors: -
- Screens: -
- Backend: `CollectTokenStore`(기동 시 `.jaystudio/collect-token` 읽기/생성 모드 600, 없고 못 만들면 기동 실패 — ADR-16), `OriginFilter`(architecture §5 Origin 규칙, `/api/**`), `BrowserTokenFilter`(변경 메서드 + `/api/stream` 쿼리), `AuthController`(`GET /api/auth/browser-token`), `HelperTokenController`(`GET /api/helper/token`, 파일 없으면 null), dev 프로필 CORS, `ApiExceptionHandler` + `ApiError`
- Frontend: 없음
- Done when:
  - FR-003-AC1 — E2E-14 `check-port.sh`(T-024) + 사람 H-4
  - FR-003-AC2 — 통합 `HookCollectAuthTest [FR-003-AC2] 토큰 없음 → 401 저장 0건`, `토큰 불일치 → 401`, `Content-Type text/plain → 415 저장 0건`, `유효 → 204`
  - FR-013-AC8 — 통합 `HelperTokenControllerTest [FR-013-AC8] Origin 없음·Sec-Fetch-Site 없음 → 403`, `허용 Origin + 브라우저 토큰 → 200 token`, `파일 없음 → token null`, `브라우저 토큰 없음 → 403 UNAUTHORIZED_TOKEN`
  - Origin 규칙 — 통합 `OriginFilterTest [DoD 다른 Origin 차단] http://127.0.0.1:9999 Origin → 403`, `Sec-Fetch-Site same-origin + Origin 없음 → 통과`, `dev 프로필 5173 허용`, `운영 프로필 5173 거부`
  - NFR-05 — 통합 `CollectTokenStoreTest [NFR-05] 토큰 파일 생성 불가(읽기 전용 fixture) → 기동 실패`, `기존 토큰 있으면 읽기 전용에서도 기동`, `0바이트 토큰 → 기동 실패`
- Depends on: T-001

## T-003 프로젝트 폴더 스캔 · 정의 파일 검증 · 구성 파일 해석 (Registry)
- Status: done
- Scope: Backend
- FR: FR-001, FR-002, FR-006, FR-014
- AC: FR-001-AC1, FR-001-AC2, FR-002-AC1, FR-002-AC2, FR-002-AC3, FR-002-AC4, FR-002-AC5, FR-002-AC6, FR-006-AC11, FR-014-AC3
- Errors: FR-001-E1, FR-001-E2, FR-001-E3
- Screens: -
- Backend: `PathGuard`, `ProjectFolderScanner`(agents/skills/settings.json/teams 스캔, 쓰기 가능 판정 = 마운트 루트에 임시 파일 생성 시도 후 삭제), `AgentDefinitionParser`(UTF-8 엄격, frontmatter 분리, SnakeYAML, name 규칙, 중복 검출, description 기본값, tools 정규화, model 원본, `hasLiteralInheritModel`), `WorkflowConfigStore`(읽기·스키마 검증 ADR-06, 깨진 참조, 중복 소속), `RegistrySnapshot`/`RegistryService`(AtomicReference), `hookConfigured` 판정
- Frontend: 없음
- Done when:
  - FR-001-AC1 — 단위 `ProjectFolderScannerTest [FR-001-AC1] 정상 .md 3 + 형식 오류 1 + 하위 폴더 .md 1 → agentCount 3` + 사람 H-1
  - FR-001-AC2 — 단위 `[FR-001-AC2] skills/ 아래 SKILL.md 있는 폴더 2 + 없는 폴더 1 + 파일 1 → skillCount 2` + 사람 H-1
  - FR-001-E1 — 단위 `[FR-001-E1] agents 폴더 없음 → agentsDirMissing true, agentCount null, agents 빈 목록`
  - FR-001-E2 — 통합 `[FR-001-E2] 읽기 전용 fixture → writable false`
  - FR-001-E3 — 단위 `[FR-001-E3] skills 폴더 없음 → skillCount 0, formatErrors 없음`
  - FR-002-AC1 — 단위 `AgentDefinitionParserTest` 5개: `[FR-002-AC1] name 누락`, `name 형식 위반(대문자·공백)`, `frontmatter 형식 오류(--- 없음 / YAML 실패)`, `name 중복 → 두 파일 모두`, `UTF-8 오류(잘못된 바이트)`
  - FR-002-AC2 — 단위 `[FR-002-AC2] 형식 오류 파일은 agents·agentCount에서 제외되고 formatErrors에 파일명+사유`, `name 중복 사유에 상대 파일명`
  - FR-002-AC3 — 통합 `AgentControllerTest [FR-002-AC3][FR-011-E3] 형식 오류 파일 GET → 409 UNEDITABLE`(T-010에서 구현, 이 태스크는 registry가 `formatErrors`로 노출)
  - FR-002-AC4 — 단위 `[FR-002-AC4] description 없음 → 정상, description ""`
  - FR-002-AC5 — 단위 `WorkflowConfigStoreTest [FR-002-AC5] members에 없는 name → brokenRefs, members에서 제외, formatErrors broken-ref '<name> · 구성 파일 참조 깨짐 (<wf>)'`, `lead 깨짐 → lead null`
  - FR-002-AC6 — 단위 `[FR-002-AC6] JSON 파싱 실패 → workflows 제외, formatErrors '<파일>.json · 구성 파일 형식 오류'`, `name ≠ stem → 형식 오류`, `schemaVersion 2 → 형식 오류`
  - FR-006-AC11 — 단위 `[FR-006-AC11] 두 구성 파일에 같은 name → duplicateWorkflows 2개(오름차순), workflow = 첫 이름, agentCount 1`
  - FR-014-AC3 — 단위 `HookConfigDetectorTest [FR-014-AC3] http hook url 일치 → true`, `url 포트 다름 → false`, `파일 없음 → false`, `JSON 깨짐 → false`, `type command만 → false`
  - NFR-07 — 단위 `PathGuardTest [NFR-07] 마운트 밖 심볼릭 링크 → 형식 오류 '마운트 밖 링크', 읽지 않음`, `쓰기 대상이 링크 → 거부`
- Depends on: T-001

## T-004 파일 변경 감지 (1초 폴링) · 다시 읽기
- Status: done
- Scope: Backend
- FR: FR-001
- AC: FR-001-AC3, FR-001-AC4
- Errors: -
- Screens: -
- Backend: `FolderPoller`(`@Scheduled(fixedDelay=1000)`, 경로·크기·mtime 스냅샷 비교, `.`·`.tmp` 무시, 변경 시 `RegistryService.rescan()` → `SseHub.broadcast(registry, live)`), `RegistryController`(`POST /api/registry/rescan` → 즉시 재스캔 + 응답), ADR-04 측정 결과 기록
- Frontend: 없음
- Done when:
  - FR-001-AC3 — 통합 `FolderPollerLatencyTest [FR-001-AC3][NFR-02] 정의 파일 추가·수정·삭제, 구성 파일 추가·수정·삭제 각 100회 → SSE registry 수신 p95 < 1.5s (수치 로그)` + E2E-07(T-024)
  - FR-001-AC4 — 통합 `RegistryControllerTest [FR-001-AC4] rescan 응답 < 1s, 응답 revision 증가, 파일 추가 직후 호출 시 즉시 반영`
  - ADR-04 — 측정 p95 수치를 `architecture.md` ADR-04에 추가(architect 또는 tech-lead가 기록)
- Depends on: T-003, T-007

## T-005 hook 수집 · 요약 · 마스킹 · 이벤트 저장 · 보존
- Status: done
- Scope: Backend
- FR: FR-003, FR-015
- AC: FR-003-AC3, FR-003-AC7, FR-003-AC9, FR-003-AC10, FR-015-AC1, FR-015-AC2, FR-015-AC3
- Errors: FR-003-E1, FR-003-E2
- Screens: -
- Backend: `SqliteConfig`(`/data/events.db`, WAL, `schema.sql`, `quick_check`), `EventRepository`(insert, 최신순 조회, agent별 조회, 30일 삭제, 최신 시각, agent별 마지막), `EventRetentionJob`(기동 직후 + 매시), `HookPayload`, `SummaryBuilder`(kind/title/summary 규칙 api-spec `EventRow`), `Masker`, `HookCollectController`(검증 → 마스킹 → INSERT → `LiveStateService.apply` → 비동기 방송 → 204)
- Frontend: 없음
- Done when:
  - FR-003-AC3 — 통합 `HookCollectPerfTest [FR-003-AC3] 1000회 POST p95 < 100ms, 응답 204 본문 길이 0`
  - FR-003-AC7 — 단위 `EventRetentionJobTest [FR-003-AC7] 31일 전 행 삭제, 29일 전 행 유지`
  - FR-003-AC9 — 통합 `HookCollectControllerTest [FR-003-AC9] 12개 이벤트 각각 저장됨`, `PreCompact 등 미사용 이벤트 → 204 저장 0건`
  - FR-003-AC10 — 단위 `SummaryBuilderTest [FR-003-AC10] PreToolUse Edit file_path → '도구 실행 · Edit' + 경로`, `Bash command`, `Grep pattern`, `PermissionRequest → '권한 요청 · <tool>'`, `SessionStart → cwd`, `SubagentStart/Stop → agent_type`, `Stop → '응답 종료'`, `201자 → 200자로 자름`, `prompt/notification summary '-'`
  - FR-003-E1 — 통합 `[FR-003-E1] JSON 깨짐 → 204 저장 0건 로그에 본문 없음`, `hook_event_name 누락 → 204 저장 0건`
  - FR-003-E2 — 통합 `[FR-003-E2] 정의 없는 agent_type(Explore) 이벤트 저장됨`, `워크플로우 밖 에이전트 이벤트 저장됨`
  - FR-015-AC1 — 단위 `MaskerTest [FR-015-AC1]` 키워드 10종(`token key secret password passwd pwd api_key api-key authorization bearer cookie` 각 `=`·`:` 조합) + 접두 4종(`sk-`, `ghp_`, `xoxb-`, `AKIA`) → `••••••••`, 대소문자 무시
  - FR-015-AC2 — 통합 `[FR-015-AC2] tool_input.command에 'export TOKEN=abc' → DB summary·GET /api/events·SSE event 모두 마스킹, 로그 파일에 'abc' 없음`
  - FR-015-AC3 — 통합 `[FR-015-AC3] events 테이블에 tool_input 컬럼 없음, summary 외 tool_input 값 미저장`
- Depends on: T-002, T-003

## T-006 세션 상태 기계 · 에이전트 집계 · 로비 · 서브에이전트
- Status: done
- Scope: Backend
- FR: FR-003, FR-004, FR-007
- AC: FR-003-AC4, FR-003-AC5, FR-003-AC6, FR-004-AC1, FR-004-AC2, FR-004-AC3, FR-004-AC4, FR-004-AC5, FR-004-AC7, FR-007-AC3, FR-007-AC5, FR-007-AC6
- Errors: FR-004-E1
- Screens: -
- Backend: `SessionKey`, `SessionRecord`, `SessionStateMachine.apply()`(순수 함수, FR-004-AC2 표 + ADR-10), `LiveState`, `LiveStateService`(집계 → `Live` DTO: agents/lobby/undefinedSubagents/lastReceivedAt/everReceived/lastEvent, 기동 시 DB 시드), `EventController`(`GET /api/events`, `GET /api/agents/{name}/events`)
- Frontend: 없음
- Done when:
  - FR-004-AC1 — 단위 `SessionStateMachineTest [FR-004-AC1] 이벤트 없는 정의 에이전트 → idle`
  - FR-004-AC2 — 단위 `[FR-004-AC2]` 표 13행 각각 1개 테스트(SessionStart 정리 포함, `Notification 기타 → 변경 없음`, `Stop → idle 세션 유지`, `SubagentStop → 제거`, `SessionEnd → 제거`), `[FR-004-AC2] 재시작 → 빈 상태` + E2E-04 + 사람 H-2
  - FR-004-AC3 — 단위 `[FR-004-AC3] 세션 A running + 세션 B waiting → waiting`, `running + idle → running`
  - FR-004-AC4 — 단위 `[FR-004-AC4] agent_id 다른 두 서브 레코드 독립 계산, agent_type이 정의 파일이면 그 에이전트로 합침`
  - FR-004-AC5 — 단위 `[FR-004-AC5] 시각 경과만으로 상태 변화 없음(시계 30분 전진 후 동일)`
  - FR-004-AC7 — 통합 `LiveStateServiceTest [FR-004-AC7] 워크플로우 밖 에이전트 이벤트 → lobby kind agent`, `구성 파일에 넣은 뒤 → lobby에서 빠지고 agents[name].status 유지`
  - FR-004-E1 — 단위 `[FR-004-E1] SessionStart 없이 PreToolUse → 새 세션 running`
  - FR-003-AC4 — 단위 `[FR-003-AC4] agent_type == name → agents[name]에 반영, 다른 name 영향 없음`
  - FR-003-AC5 — 단위 `[FR-003-AC5] agent_type 없는 세션 → lobby '[세션 1]', 두 번째 세션 '[세션 2]', SessionEnd → 제거`
  - FR-003-AC6 — 통합 `[FR-003-AC6] lastReceivedAt = 마지막 저장 시각, 재시작 후 DB에서 복원, 시간 경과로 변화 없음`
  - FR-007-AC3 — 단위 `[FR-007-AC3] 정의 없는 서브(Explore) → undefinedSubagents parentAgentName/parentLabel`, `정의 있는 서브 → agents[name].parentLabel '부모 name'`, `로비 부모 → '[세션 1]'`, `SubagentStop → 제거`
  - FR-007-AC5 — 단위 `[FR-007-AC5] currentTool = 마지막 PreToolUse, idle → null, sessionStartedAt = 최근 SessionStart/SubagentStart, childCount, cwd = 마지막 이벤트`
  - FR-007-AC6 — 통합 `EventControllerTest [FR-007-AC6] agent별 최신순 10개, 서브 실행 이벤트 포함`, `[FR-005-AC6] /api/events limit 50 상한`
- Depends on: T-005

## T-007 SSE 스트림 · 스냅샷 API
- Status: done
- Scope: Backend
- FR: FR-004, FR-005, FR-016
- AC: FR-004-AC6, FR-005-AC6
- Errors: -
- Screens: -
- Backend: `SseHub`(emitter 목록, `snapshot`→`registry`/`live`/`event`/`heartbeat` 15s, seq, 실패 emitter 제거), `SnapshotAssembler`(`Config`+`Registry`+`Live`+`recentEvents` 50, `workflow` 열 해석), `StateController`(`GET /api/state`, `GET /api/stream`)
- Frontend: 없음
- Done when:
  - FR-004-AC6 — 통합 `SseHubLatencyTest [FR-004-AC6][NFR-02] hook POST → 5개 연결 모두 live 수신 p95 < 500ms` + E2E-04
  - FR-005-AC6 — 통합 `SnapshotAssemblerTest [FR-005-AC6] 이벤트 80건 → recentEvents 50건 최신순`
  - realtime-spec — 통합 `SseStreamTest [realtime-spec] 접속 직후 snapshot 1건, event→live 순서, heartbeat 15s±1, seq 단조 증가, 토큰 없음 → 403, 다른 Origin → 403`
  - NFR-01 — 통합 `[NFR-01] 5개 연결 동시 방송 모두 수신`
  - NFR-02 — 통합 `[NFR-02] 에이전트 100·워크플로우 30 fixture GET /api/state < 1s`
- Depends on: T-006

## T-008 워크플로우 추가 · 삭제 API
- Status: done
- Scope: Backend
- FR: FR-001, FR-008, FR-017
- AC: FR-001-AC6, FR-008-AC1, FR-008-AC2, FR-017-AC1, FR-017-AC4, FR-017-AC5
- Errors: FR-008-E1, FR-008-E2, FR-008-E3, FR-017-E1, FR-017-E2
- Screens: -
- Backend: `WriteLock`, `AtomicFileWriter`, `WorkflowConfigStore.create/delete`, `WorkflowController`(`POST /api/workflows`, `DELETE /api/workflows/{workflow}`), `READ_ONLY` 공통 처리, 쓰기 후 `rescanNow()`
- Frontend: 없음
- Done when:
  - FR-001-AC6 — 통합 `WorkflowControllerTest [FR-001-AC6] .jaystudio/teams 없음 → POST 시 생성`, `[FR-001-AC6] 읽기 API만 호출하면 teams/·trash/ 생성 안 됨`
  - FR-008-AC1 — 통합 `[FR-008-AC1] '개발부서' 있을 때 '개발부서' → 400 fields.name`, `'Dev'와 'dev' 중복`, `31개째 추가 성공`
  - FR-008-AC2 — 단위 `WorkflowNameValidatorTest [FR-008-AC2] 허용/불허 문자, 41자 거부, 앞뒤 공백 제거, 파일명 = <이름>.json`
  - FR-008-E1 — 위 AC1 테스트
  - FR-008-E2 — 통합 `[FR-008-E2] '개발/부서' → 400 fields.name 사유`
  - FR-008-E3 — 통합 `[FR-008-E3] teams 폴더 쓰기 불가 → 500 IO_FAILED, 파일 없음`
  - FR-017-AC1 — 통합 `[FR-017-AC1] rawMemberCount 1(깨진 참조만) → 409 WORKFLOW_NOT_EMPTY`, `0 → 204`
  - FR-017-AC4 — 통합 `[FR-017-AC4] 삭제 후 파일 없음, trash에 없음, registry.workflows에서 빠짐`
  - FR-017-AC5 — 설계 확인: 이름 변경 엔드포인트 없음(api-spec) — 리뷰어 확인
  - FR-017-E1 — 통합 `[FR-017-E1] 팀원 있음 → 409 message '팀원이 있어 삭제할 수 없습니다'`
  - FR-017-E2 — 통합 `[FR-017-E2] 삭제 권한 없음 → 500 IO_FAILED, 파일 유지`
  - READ_ONLY — 통합 `[FR-001-E2] writable false → POST 403 READ_ONLY`
- Depends on: T-003, T-004

## T-009 기존 에이전트 가져오기 API
- Status: done
- Scope: Backend
- FR: FR-009
- AC: FR-009-AC3, FR-009-AC4
- Errors: FR-009-E1, FR-009-E2, FR-009-E3
- Screens: -
- Backend: `WorkflowController`(`POST /api/workflows/{workflow}/members`, 부분 성공 `added/rejected`, `LEAD_EXISTS`, `LEAD_MULTIPLE` 검증)
- Frontend: 없음
- Done when:
  - FR-009-AC3 — 통합 `ImportMembersTest [FR-009-AC3] 가져온 뒤 정의 파일 바이트 동일, 구성 파일에만 반영`
  - FR-009-AC4 — 통합 `[FR-009-AC4] 팀장 있는 워크플로우에 role lead → 409 LEAD_EXISTS, 파일 변경 없음`
  - FR-009-E1 — 통합 `[FR-009-E1] lead 2명 → 400 fields.members`
  - FR-009-E2 — 통합 `[FR-009-E2] 요청 중 한 명이 다른 워크플로우에 있음 → 200 added 1, rejected 1 ALREADY_ASSIGNED`
  - FR-009-E3 — 통합 `[FR-009-E3] 쓰기 실패 → 500, 구성 파일 원본 유지`
- Depends on: T-008

## T-010 에이전트 만들기 · 수정 API (정의 파일 + 구성 파일 원자성)
- Status: done
- Scope: Backend
- FR: FR-010, FR-011, FR-002
- AC: FR-010-AC1, FR-010-AC2, FR-010-AC3, FR-010-AC5, FR-010-AC7, FR-011-AC1, FR-011-AC2, FR-011-AC3, FR-011-AC4, FR-011-AC5, FR-011-AC6
- Errors: FR-010-E1, FR-010-E2, FR-010-E3, FR-011-E1, FR-011-E2, FR-011-E3, FR-011-E4
- Screens: -
- Backend: `AgentDefinitionWriter`(ADR-07 줄 단위 편집·신규 생성, tools 쉼표 문자열, model 규칙 ADR-13), `AgentController`(`GET/POST/PUT /api/agents[/{name}]`), 상태 검사(`LiveStateService`), revision 비교, ADR-08 롤백
- Frontend: 없음
- Done when:
  - FR-010-AC1 — 통합 `AgentCreateTest [FR-010-AC1] name 규칙 위반 → 400`, `정상 파일과 중복 → 400`, `형식 오류 파일명과 중복 → 400`
  - FR-010-AC2 — 통합 `[FR-010-AC2] toolsMode inherit → frontmatter에 tools 없음`, `explicit ['Read','Grep'] → 'tools: Read, Grep'`, `explicit 0개 → 400 fields.tools`
  - FR-010-AC3 — 단위 `ModelValidatorTest [FR-010-AC3] null·sonnet·opus·haiku·claude-opus-5 허용, 'GPT 4' 거부`
  - FR-010-AC5 — 통합 `[FR-010-AC5] 저장 파일 = '---\nname\ndescription\n[tools]\n[model]\n---\n본문'`, `model null → model 줄 없음`
  - FR-010-AC7 — 통합 `[FR-010-AC7] 구성 파일 쓰기 실패 주입 → 정의 파일 삭제됨, 500`
  - FR-010-E1 — 통합 `[FR-010-E1] description 빈값·workflow 없음 → 400 fields`
  - FR-010-E2 — 통합 `[FR-010-E2] writable false → 403 READ_ONLY`
  - FR-010-E3 — 위 AC7 테스트
  - FR-011-AC1 — 통합 `AgentUpdateTest [FR-011-AC1] permissionMode·skills·hooks·color 줄과 순서 보존, 본문 CRLF 바이트 보존, 'description: |' 블록 교체`
  - FR-011-AC2 — 통합 `[FR-011-AC2] name a→b: b.md 생성, a.md 없음, 구성 파일 lead/members 참조 b`
  - FR-011-AC3 — 통합 `[FR-011-AC3] 워크플로우 A→B: A에서 빠지고 B에 추가`, `워크플로우 밖 에이전트 workflow null 허용`, `소속 에이전트 workflow null → 400`
  - FR-011-AC4 — 통합 `[FR-011-AC4] expectedRevision 불일치 → 409 REVISION_CONFLICT details.modifiedAt`, `force true → 저장`
  - FR-011-AC5 — 통합 `[FR-011-AC5][FR-011-E4] running 상태 → 409 AGENT_BUSY, 파일 변경 없음`, `waiting → 409`, `idle → 200`
  - FR-011-AC6 — 통합 `[FR-011-AC6] 옛 파일 삭제 실패 주입 → 새 파일 삭제·구성 파일 원복`
  - FR-011-E1 — 통합 `[FR-011-E1] PUT 직전 파일 삭제 → 409 FILE_GONE`
  - FR-011-E2 — 통합 `[FR-011-E2] 새 name 이미 존재 → 400 fields.name`
  - FR-011-E3 — 통합 `[FR-011-E3][FR-002-AC3] 형식 오류 파일 GET/PUT → 409 UNEDITABLE`
  - FR-011-E4 — 위 AC5 테스트
- Depends on: T-006, T-008

## T-011 워크플로우에서 제거 API (휴지통)
- Status: done
- Scope: Backend
- FR: FR-012
- AC: FR-012-AC2, FR-012-AC4, FR-012-AC5, FR-012-AC6
- Errors: FR-012-E1, FR-012-E2
- Screens: -
- Backend: `TrashService`(시각 접미사, 충돌 시 `-n`), `AgentController.delete`, ADR-08 순서(이동 → 구성 파일 → 실패 시 되돌림)
- Frontend: 없음
- Done when:
  - FR-012-AC2 — 통합 `AgentRemoveTest [FR-012-AC2] trash/<name>.<yyyyMMdd-HHmmss>.md 생성, agents에 없음, 구성 파일에서 빠짐`
  - FR-012-AC4 — 통합 `[FR-012-AC4] 같은 이름 두 번 제거 → 두 파일 모두 남음, 덮어쓰기 없음`
  - FR-012-AC5 — 통합 `[FR-012-AC5] 워크플로우 밖 에이전트 제거 → 휴지통 이동만, removedFromWorkflow null`
  - FR-012-AC6 — 통합 `[FR-012-AC6][FR-012-E2] running/waiting → 409 AGENT_BUSY, 파일 그대로`
  - FR-012-E1 — 통합 `[FR-012-E1] 구성 파일 쓰기 실패 주입 → 정의 파일 원위치, 500`
  - FR-012-E2 — 위 AC6 테스트
- Depends on: T-010

## T-012 설정 API · hook 설정 예시 · 명령 문자열
- Status: done
- Scope: Backend
- FR: FR-014, FR-003, FR-013
- AC: FR-014-AC1, FR-014-AC2, FR-014-AC4, FR-003-AC8, FR-013-AC1, FR-013-AC2, FR-013-AC5
- Errors: -
- Screens: -
- Backend: `SettingsController`(`GET /api/settings`), `HookSettingsExampleBuilder`(architecture §7.1), `Config` DTO(`defaultSessionCommand`, `leadSessionCommandTemplate`)
- Frontend: 없음
- Done when:
  - FR-014-AC1 — 정적 검사: `settings.json`을 쓰는 코드 경로 없음(`grep -r "settings.json"` 결과가 읽기 전용 클래스뿐) — 리뷰어 확인 + 통합 `[FR-014-AC1] GET /api/settings 호출 후 fixture settings.json mtime 불변`
  - FR-014-AC2 — 단위 `HookSettingsExampleBuilderTest [FR-014-AC2][FR-003-AC8][FR-003-AC9] JSON 파싱 가능, 키 12개 정확히, 각 type http · url = collectUrl · headers.X-JayStudio-Collect-Token = 토큰 · timeout 3` + 통합 `[FR-014-AC2] 예시를 fixture settings.json으로 쓰면 hookConfigured true` + 사람 H-2
  - FR-014-AC4 — 통합 `SettingsControllerTest [FR-014-AC4] hostPath = env 값(JAYSTUDIO_HOST_PATH 그대로), UI에 표시되는 값(hostPath·defaultSessionCommand·leadSessionCommandTemplate·teamsPath·trashPath)에 컨테이너 경로(mountPath 값) 미포함. mountPath 자체는 api-spec대로 컨테이너 경로(JAYSTUDIO_MOUNT_PATH)이며 ui-spec SCR-07에서 표시하지 않음(ADR-20)`
  - FR-003-AC8 — 위 단위 테스트(`timeout: 3`, `type: http`) + 사람 H-5
  - FR-013-AC1 — 단위 `CommandStringsTest [FR-013-AC1] defaultSessionCommand == 'cd "<hostPath>" && claude'` + 사람 H-3
  - FR-013-AC2 — 단위 `[FR-013-AC2] leadSessionCommandTemplate == 'cd "<hostPath>" && claude --agent <팀장 name>'` + 사람 H-3
  - FR-013-AC5 — 통합 `[FR-013-AC5] GET /api/settings에 두 명령 포함` + E2E-11
- Depends on: T-002, T-003

## T-013 프론트 공통 셸 · 스토어 · SSE 클라이언트 · 04-3 배너 · 스켈레톤
- Status: todo
- Scope: Frontend
- FR: FR-016, FR-003, FR-005
- AC: FR-016-AC1, FR-016-AC2, FR-016-AC3, FR-016-AC4, FR-003-AC6, FR-005-AC9
- Errors: -
- Screens: 공통, SCR-04-2, SCR-04-3
- Backend: 없음
- Frontend: `api/client.ts`(토큰 부트스트랩·재발급 1회·ApiError 변환), `api/stream.ts`(realtime-spec §4 상태 기계), `state/snapshotStore.ts`, `state/connectionStore.ts`, `components/ui/*`(Button variant+disabledReason, Chip, StatusDot/StatusLabel, Skeleton, Banner, Dialog, Field, Select, SearchInput, Tooltip, MonoText, CopyButton), `AppShell`/`Sidebar`/`TopBar`/`CollectorStatus`/`DisconnectBanner`, `lib/text.ts`, `lib/format/time.ts`, `lib/derive/workflowChip.ts`, `lib/derive/counts.ts`
- Done when:
  - FR-016-AC1 — 단위 `DisconnectBanner.test [FR-016-AC1] disconnected → 배너 문구·지금 재연결 렌더` + E2E-05
  - FR-016-AC2 — 단위 `stream.test [FR-016-AC2] 끊김 후 스토어 스냅샷 유지, lastUpdatedAt 표시` + E2E-05
  - FR-016-AC3 — 단위 `stream.test [FR-016-AC3] 백오프 5→10→20→30→30, 지금 재연결 즉시, 성공 시 5로 리셋`
  - FR-016-AC4 — 단위 `stream.test [FR-016-AC4] snapshot 수신 → replace + connected` + E2E-05
  - FR-003-AC6 — 단위 `CollectorStatus.test [FR-003-AC6] hookConfigured true/false 문구, lastReceivedAt 표시·null → '마지막 수신 없음'` + E2E-01
  - FR-005-AC9 — 단위 `Skeleton 원칙: snapshotStore.ready false → AppShell 본문 스켈레톤, '0' 텍스트 없음` + E2E-01
  - 토큰 규칙 — 단위 `client.test 403 UNAUTHORIZED_TOKEN → 재발급 후 1회 재시도, 두 번째 403은 전파`, `localStorage 미사용`
  - 칩 규칙 — 단위 `workflowChip.test [ui-rules 1][FR-007-AC9] waiting>0 → 권한 대기 N명, running>0 → 실행 중 N명, 둘 다 0 → 모두 대기`
  - 집계 — 단위 `counts.test [FR-005-AC1][FR-005-AC2][FR-006-AC5] 3상태 수 합 = agentCount, 워크플로우별 집계`
- Depends on: T-001, T-007

## T-014 01 홈 화면
- Status: todo
- Scope: Frontend
- FR: FR-005, FR-001, FR-015
- AC: FR-005-AC1, FR-005-AC2, FR-005-AC3, FR-005-AC4, FR-005-AC5, FR-005-AC7, FR-005-AC8, FR-005-AC10
- Errors: FR-005-E1, FR-001-E1
- Screens: SCR-01, SCR-04-1, SCR-04-5, SCR-04-7
- Backend: 없음
- Frontend: `screens/home/*`(KPI 4, 상태 막대, 대표 카드, 이벤트 표), `lib/derive/featuredWorkflows.ts`, `NoEventsYet`, `AgentsDirMissing`, `EmptyWorkflowCard`
- Done when:
  - FR-005-AC1 — 단위 `HomeScreen.test [FR-005-AC1] fixture 스냅샷 → '3 / 10', 권한 대기 1` + E2E-04
  - FR-005-AC2 — 단위 `[FR-005-AC2] 막대 범례 수 합 = agentCount` + E2E-04
  - FR-005-AC3 — 단위 `featuredWorkflows.test [FR-005-AC3] 활성 워크플로우 우선 → 최근 이벤트 내림차순 → 이벤트 없음 이름 오름차순, 최대 3`
  - FR-005-AC4 — 단위 `[FR-005-AC4] 카드 스킬 수 = registry.skillCount`
  - FR-005-AC5 — 단위 `[FR-005-AC5] workflows 0 → EmptyWorkflowCard 1장, 클릭 → ?dialog=workflow-add` + E2E-01
  - FR-005-AC7 — 단위 `[FR-005-AC7] 로비·워크플로우 밖 행 워크플로우 열 '-'` + E2E-04
  - FR-005-AC8 — E2E-04 `실시간 이벤트 표에 '••••••••' 있고 원문 없음`
  - FR-005-AC10 — 단위 `[FR-005-AC10] 두 버튼 → /workflows` + E2E-01
  - FR-005-E1 — 단위 `[FR-005-E1] everReceived false → NoEventsYet, KPI 2·3 숫자 정상` + E2E-01
  - FR-001-E1 — 단위 `[FR-001-E1] agentsDirMissing → KPI 1·2 자리 AgentsDirMissing, 숫자 없음` + E2E-06
  - 화면 대조 — E2E-13 `01-home.png` 캡처 → 리뷰어 대조
- Depends on: T-013

## T-015 02 에이전트 워크플로우 층 뷰
- Status: todo
- Scope: Frontend
- FR: FR-006, FR-004, FR-003, FR-001, FR-002, FR-013, FR-017
- AC: FR-006-AC1, FR-006-AC2, FR-006-AC3, FR-006-AC4, FR-006-AC5, FR-006-AC6, FR-006-AC7, FR-006-AC8, FR-006-AC9, FR-006-AC10, FR-006-AC11, FR-006-AC12, FR-004-AC7, FR-003-AC5, FR-013-AC3, FR-002-AC2
- Errors: FR-006-E1, FR-006-E2, FR-006-E3, FR-001-E2
- Screens: SCR-02, SCR-04-5, SCR-04-6, SCR-04-7
- Backend: 없음
- Frontend: `screens/workflows/*`(헤더, 요약 바, 검색+드롭다운, 로비, 층 카드, 줌·미니맵), `components/pixel/DeskSprite.tsx`+`palette.ts`, `lib/derive/agentOrder.ts`, `search.ts`, `workflowLayout.ts`, `FormatErrorList`, `lib/format/ellipsis.ts`
- Done when:
  - FR-006-AC1 — 단위 `agentOrder.test [FR-006-AC1] lead 첫 자리, 나머지 단순 문자열 오름차순('Z'<'a' 아님, 소문자 name이므로 'a-2'<'a10')`, `Floor.test 팀장 배지` + E2E-02
  - FR-006-AC2 — 단위 `workflowLayout.test [FR-006-AC2] 인원 7 이상 → span 3, 6 이하 → 1`
  - FR-006-AC3 — 단위 `Floor.test [FR-006-AC3] lead null → 경고 줄 문구` + E2E-02
  - FR-006-AC4 — 단위 `ellipsis.test [FR-006-AC4] 13자 → 12자+…, title 전체`
  - FR-006-AC5 — 단위 `Floor.test [FR-006-AC5] 요약 '실행 중 1명 · 권한 대기 1명' / '모두 대기', 워크플로우 단위 상태 표시 없음`
  - FR-006-AC6 — E2E-12 `+ 3회 → 130%, − → 50% 하한, 200% 상한, 맞춤, 미니맵 표시`
  - FR-006-AC7 — 단위 `FloorSelect.test [FR-006-AC7] '전체 층 (N개)' + 이름 목록, 선택 시 해당 층만` + E2E-12 `워크플로우 30개 fixture 상단 바 높이 1줄`
  - FR-006-AC8 — 단위 `search.test [FR-006-AC8] 워크플로우 이름 일치 → 층 전체, 에이전트 일치 → 그 층에 일치 에이전트만, 대소문자 무시`
  - FR-006-AC9 — 단위 `Lobby.test [FR-006-AC9][FR-003-AC5] '[세션 1] · 작업 중', 빈 → '실행 중인 메인 세션 없음'` + E2E-04
  - FR-006-AC10 — 단위 `DeskSprite.test [FR-006-AC10] SVG viewBox 22×22, 46px, pixel-sprites A 좌표 8개 rect, name·상태 글자 렌더`
  - FR-006-AC11 — 단위 `Floor.test [FR-006-AC11] duplicateWorkflows → 관련 층 모두 경고, 책상은 workflow(첫 층)에만`
  - FR-006-AC12 — 단위 `Floor.test [FR-006-AC12][FR-017-AC1] rawMemberCount>0 → 삭제 비활성 '팀원을 먼저 제거하세요', 0 → 활성` + E2E-10
  - FR-004-AC7 — 단위 `Lobby.test [FR-004-AC7] kind agent → 'name · 상태'` + E2E-04
  - FR-003-AC5 — 위 Lobby 테스트
  - FR-013-AC3 — 단위 `WorkflowsHeader.test [FR-013-AC3] 팀장 선택 목록·메뉴 없음, 버튼 하나`
  - FR-002-AC2 — 단위 `FormatErrorList.test [FR-002-AC2] 파일명+사유 행, 중복은 상대 파일명` + E2E-06
  - FR-006-E1 — 단위 `[FR-006-E1] agentsDirMissing → 층 그리드 자리 AgentsDirMissing` + E2E-06
  - FR-006-E2 — 단위 `[FR-006-E2] formatErrors>0 → 층 위 목록` + E2E-06
  - FR-006-E3 — 단위 `[FR-006-E3] workflows 0 → EmptyWorkflowCard` + E2E-01
  - FR-001-E2 — 단위 `[FR-001-E2] writable false → 추가·가져오기·만들기·삭제 버튼 비활성 + '쓰기 권한 없음'`
  - 화면 대조 — E2E-13 `02-workflows.png` → 리뷰어 대조
- Depends on: T-013

## T-016 03 워크플로우 상세 · 픽셀 오피스
- Status: todo
- Scope: Frontend
- FR: FR-007, FR-011, FR-012, FR-013, FR-017
- AC: FR-007-AC1, FR-007-AC2, FR-007-AC3, FR-007-AC4, FR-007-AC5, FR-007-AC6, FR-007-AC7, FR-007-AC8, FR-007-AC9, FR-011-AC5, FR-012-AC6, FR-013-AC4, FR-017-AC4
- Errors: FR-007-E1, FR-007-E2
- Screens: SCR-03, SCR-04-4
- Backend: 없음
- Frontend: `screens/workflow-detail/*`(헤더, 오피스 그리드, 선택 패널, 범례, 04-4 배너, 찾을 수 없음), `components/pixel/OfficeSprite.tsx`(+small), `lib/derive/actionLabel.ts`, `state/agentEventsStore.ts`
- Done when:
  - FR-007-AC1 — 단위 `Office.test [FR-007-AC1] 캐릭터 수 = 인원, 팀장 첫 자리, 빈 자리 칸 수 = (3 - n%3)%3` + E2E-13
  - FR-007-AC2 — 단위 `actionLabel.test [FR-007-AC2] Edit/Write/NotebookEdit → '타이핑 · X', Read/Grep/Glob → '읽기 · X', waiting → '권한 요청' 주황, idle → '대기' 회색, Bash → 'Bash' + running 색` + E2E-04
  - FR-007-AC3 — 단위 `Office.test [FR-007-AC3] undefinedSubagents(부모 소속) → 부모 다음 칸 small, '작업 중 · 부모 <name>'`, `parentLabel → 상태 글자 뒤 '· 부모 [세션 1]'`, `부모가 다른 워크플로우면 표시 안 함` + E2E-04
  - FR-007-AC4 — 단위 `[FR-007-AC4] 기본 선택 lead, lead 없으면 첫 자리, ?agent= 우선`
  - FR-007-AC5 — 단위 `Panel.test [FR-007-AC5] 현재 도구 'Edit · <target>', idle → '-', 세션 시작·서브에이전트·작업 폴더 표시`
  - FR-007-AC6 — 단위 `Panel.test [FR-007-AC6] GET /api/agents/{name}/events 호출, SSE event prepend 10개 상한`
  - FR-007-AC7 — 단위 `[FR-007-AC7] 정의 수정 → ?dialog=agent-edit, 제거 → ?dialog=agent-remove, 원문 로그 요소 없음` + E2E-03
  - FR-007-AC8 — 단위 `[FR-007-AC8][FR-013-AC4] lead null → 팀장 호출 비활성 + '팀장 없음'` + E2E-09
  - FR-007-AC9 — 위 T-013 workflowChip 테스트 + `Header.test [FR-007-AC9] 칩 렌더`
  - FR-011-AC5 — 단위 `Panel.test [FR-011-AC5] status running → 정의 수정 비활성 '작업 중에는 수정할 수 없습니다'`
  - FR-012-AC6 — 단위 `Panel.test [FR-012-AC6] status waiting → 제거 비활성 '작업 중에는 제거할 수 없습니다'`
  - FR-013-AC4 — 위 AC8 테스트
  - FR-017-AC4 — E2E-10 `03 열린 탭에서 삭제 후 registry 수신 → '워크플로우를 찾을 수 없습니다'`
  - FR-007-E1 — 단위 `Office.test [FR-007-E1] everReceived false → 04-4 배너 '마지막 수신 없음', 모든 캐릭터 대기색·'대기' 글자`, `[FR-007-E1] hookConfigured false + live에 running/waiting 에이전트 → 배너 + 시각, 캐릭터·상태 글자·말풍선 모두 '대기', 패널 상태 '대기'·현재 도구 '-'`, `[FR-007-E1][FR-004-AC1] 같은 스냅샷으로 02 렌더 시 실제 상태(running) 유지 — 03 표시만 고정됨을 확인` + E2E-01(03 진입, 이벤트 0건) + E2E-04(재생으로 running 상태를 만든 뒤 fixture `settings.json`에서 hook 항목 제거 → 03 배너 + 캐릭터 모두 `대기`, 02 책상은 `작업 중` 유지 → hook 항목 복구 → 03 실제 상태로 복귀)
  - FR-007-E2 — 단위 `[FR-007-E2] 없는 이름 → 안내 + '에이전트 워크플로우로' 버튼 → /workflows` + E2E-10
  - 화면 대조 — E2E-13 `03-workflow-detail.png` → 리뷰어 대조
- Depends on: T-013

## T-017 05 워크플로우 추가 · 05-3 삭제 확인 UI
- Status: todo
- Scope: Frontend
- FR: FR-008, FR-017, FR-005
- AC: FR-008-AC3, FR-008-AC4, FR-017-AC2, FR-017-AC3, FR-017-AC5
- Errors: FR-008-E1, FR-008-E2, FR-008-E3, FR-017-E1, FR-017-E2
- Screens: SCR-05-L, SCR-05-3
- Backend: 없음
- Frontend: `dialogs/workflow-add/*`, `dialogs/workflow-delete/*`, `lib/validators.ts`(워크플로우 이름), `?dialog=` 라우팅(`app/router.tsx` `useDialog()`)
- Done when:
  - FR-008-AC3 — 단위 `WorkflowAddDialog.test [FR-008-AC3] 안내 문구 렌더`
  - FR-008-AC4 — E2E-02 `만들기 → 팝업 닫힘 → 층 + 팀장 없음 경고 2초 내`
  - FR-008-E1 — 단위 `[FR-008-E1] 400 fields.name → 필드 아래 사유` + E2E-02(같은 이름 재시도)
  - FR-008-E2 — 단위 `[FR-008-E2] 사전 검증 문구, 서버 400 표시` + E2E-02
  - FR-008-E3 — 단위 `[FR-008-E3] 500 IO_FAILED → 팝업 하단 message`
  - FR-017-AC2 — 단위 `WorkflowDeleteDialog.test [FR-017-AC2] 제목·안내·입력·취소·삭제 구성(06-6과 같은 컴포넌트 ConfirmByNameDialog)`
  - FR-017-AC3 — 단위 `[FR-017-AC3] 이름 불일치 비활성, 일치 활성` + E2E-10
  - FR-017-AC5 — 단위 `이름 변경 입력·버튼 없음`(05·06 어디에도 워크플로우 이름 편집 요소 없음)
  - FR-017-E1 — 단위 `[FR-017-E1] 409 WORKFLOW_NOT_EMPTY → 문구 표시 후 닫힘` + E2E-10
  - FR-017-E2 — 단위 `[FR-017-E2] 500 → message, 팝업 유지`
  - FR-005-AC5 — E2E-01 `01 04-7 카드 → 05 왼쪽 열림 → 만들기 후 /workflows`
- Depends on: T-014, T-015

## T-018 05 기존 에이전트 가져오기 UI
- Status: todo
- Scope: Frontend
- FR: FR-009
- AC: FR-009-AC1, FR-009-AC2, FR-009-AC4, FR-009-AC5, FR-009-AC6, FR-009-AC7
- Errors: FR-009-E1, FR-009-E2, FR-009-E3
- Screens: SCR-05-R
- Backend: 없음
- Frontend: `dialogs/import-agents/*`, `lib/derive/search.ts` 확장(name·description)
- Done when:
  - FR-009-AC1 — 단위 `ImportDialog.test [FR-009-AC1] workflow null인 에이전트만 name 오름차순` + E2E-02
  - FR-009-AC2 — 단위 `search.test [FR-009-AC2] description 부분 일치 대소문자 무시`
  - FR-009-AC4 — 단위 `[FR-009-AC4] 대상 lead 있음 → 팀장 옵션 disabled`, `한 행 팀장 선택 → 다른 행 팀장 disabled` + E2E-02
  - FR-009-AC5 — 단위 `[FR-009-AC5] '선택한 2명 가져오기', 0명 비활성` + E2E-02
  - FR-009-AC6 — 단위 `[FR-009-AC6] 밖 에이전트 0 → 안내 + '+ 새로 만들기'만`
  - FR-009-AC7 — 단위 `[FR-009-AC7] ?workflow 없음 → 드롭다운, 있음 → 고정 텍스트` + E2E-02
  - FR-009-E1 — 단위 `[FR-009-E1] 400 fields.members → 표시`
  - FR-009-E2 — 단위 `[FR-009-E2] rejected ALREADY_ASSIGNED → 행별 사유, 팝업 유지, 목록 갱신`
  - FR-009-E3 — 단위 `[FR-009-E3] 500 → message`
- Depends on: T-017

## T-019 06 에이전트 만들기 · 수정 · 06-5 충돌 · 06-6 제거 UI
- Status: todo
- Scope: Frontend
- FR: FR-010, FR-011, FR-012, FR-002
- AC: FR-010-AC2, FR-010-AC3, FR-010-AC4, FR-010-AC6, FR-011-AC3, FR-011-AC4, FR-012-AC1, FR-012-AC3, FR-012-AC5, FR-002-AC3
- Errors: FR-010-E1, FR-010-E2, FR-010-E3, FR-011-E1, FR-011-E2, FR-011-E3, FR-011-E4, FR-012-E1, FR-012-E2
- Screens: SCR-06, SCR-06-5, SCR-06-6
- Backend: 없음
- Frontend: `dialogs/agent-form/*`(만들기·수정 공용, model 드롭다운 ADR-13, tools 라디오+체크+기타, 역할 비활성 이유), `dialogs/save-conflict/*`, `dialogs/remove-agent/*`(`ConfirmByNameDialog` 재사용), 저장 후 02 안내 줄
- Done when:
  - FR-010-AC2 — 단위 `AgentForm.test [FR-010-AC2] 전체 상속/직접 선택 명시 선택 전 저장 비활성, 직접 선택 0개 → 사유, 기타 쉼표 분리` + E2E-02
  - FR-010-AC3 — 단위 `[FR-010-AC3] 드롭다운 옵션 = 상속·sonnet·opus·haiku·직접 입력, 원본 'claude-opus-5' → 직접 입력에 채움, 'inherit' 원본 → 상속`
  - FR-010-AC4 — 단위 `[FR-010-AC4] 대상 lead 있음 → 팀장 라디오 비활성 + '이미 팀장이 있습니다 (<lead>)'`
  - FR-010-AC6 — 단위 `[FR-010-AC6] 만들기 성공 → 02에 재시작 안내 줄` + E2E-02
  - FR-011-AC3 — 단위 `[FR-011-AC3] 워크플로우 밖 에이전트 → '(없음)' 옵션, 소속 에이전트 → 없음`
  - FR-011-AC4 — 단위 `SaveConflictDialog.test [FR-011-AC4] 409 REVISION_CONFLICT → 06-5, 다시 불러오기 → GET 재호출 폼 재채움, 덮어쓰기 → force true` + E2E-03
  - FR-012-AC1 — 단위 `RemoveAgentDialog.test [FR-012-AC1] name 일치 시만 활성` + E2E-03
  - FR-012-AC3 — 단위 `[FR-012-AC3] 팀장이면 '팀장 없음이 표시됩니다' 안내` + E2E-03(제거 후 층 경고)
  - FR-012-AC5 — 단위 `[FR-012-AC5] 워크플로우 밖 에이전트 06에서 제거 버튼 활성, 제목 '<name>를 제거할까요?'`
  - FR-002-AC3 — 단위 `[FR-002-AC3][FR-011-E3] GET 409 UNEDITABLE → 팝업 열지 않고 04-6로 스크롤` + E2E-06
  - FR-010-E1 — 단위 `[FR-010-E1] 400 fields → 필드별 사유`
  - FR-010-E2 — 단위 `[FR-010-E2] writable false → 저장 비활성 '쓰기 권한 없음'`
  - FR-010-E3 — 단위 `[FR-010-E3] 500 → message`
  - FR-011-E1 — 단위 `[FR-011-E1] 409 FILE_GONE → 문구`
  - FR-011-E2 — 단위 `[FR-011-E2] 400 fields.name → 사유`
  - FR-011-E3 — 위 FR-002-AC3 테스트
  - FR-011-E4 — 단위 `[FR-011-E4] 409 AGENT_BUSY → 상단 문구, 폼 값 유지`
  - FR-012-E1 — 단위 `[FR-012-E1] 500 → message, 팝업 유지`
  - FR-012-E2 — 단위 `[FR-012-E2] 409 AGENT_BUSY → 문구`
- Depends on: T-016, T-017

## T-020 열기 도우미 (Node) · 설치 스크립트 · plist
- Status: todo
- Scope: Helper
- FR: FR-013
- AC: FR-013-AC7, FR-013-AC11
- Errors: FR-013-E2, FR-013-E3
- Screens: -
- Backend: 없음
- Frontend: 없음
- Helper: `jaystudio-helper.mjs`(인자 파싱, `127.0.0.1` 바인딩, 토큰 파일 생성 600, `GET /health`, `OPTIONS/POST /open`, CORS 허용 Origin, 검증, `openTerminal` 주입, `--dry-run`), `lib/validate.mjs`, `lib/plist.mjs`, `lib/cors.mjs`, `install.sh`/`uninstall.sh`(plist 생성 + `launchctl bootstrap/bootout`), plist 템플릿, `test/*.test.mjs`
- Done when:
  - FR-013-AC7 — 단위 `helper.test [FR-013-AC7] Origin 불일치 → 403 실행 안 함`, `토큰 불일치 → 403`, `Origin 허용 목록 인자 반영(기본 4180, 추가 5173)`, `name 'Bad Name' → 400 실행 안 함`
  - FR-013-AC11 — 단위 `[FR-013-AC11] spawn 인자 배열 검증: 실행 파일 '/usr/bin/osascript', shell 옵션 없음, 마지막 인자 == 'cd "<dir>" && claude --agent dev-lead'`, `[FR-013-AC1] target default → 'cd "<dir>" && claude'`, `[FR-013-AC2] target lead`, `projectDir에 '"' 포함 → 기동 실패` + 사람 H-3
  - FR-013-E2 — 위 AC7 403 테스트
  - FR-013-E3 — 위 AC7 400 테스트 + `응답 본문 { code: 'INVALID_NAME', message }`
  - NFR-04 — 단위 `[NFR-04] listen host '127.0.0.1'`(소스 검사 + 실제 listen 주소 확인)
  - 토큰 — 단위 `첫 실행 시 helper-token 생성 mode 600 hex 64, 기존 파일 있으면 재사용`
  - plist — 단위 `plist.test 생성 plist에 ProgramArguments(node, 스크립트, --project-dir, --allowed-origins, --port 4181, --token-file), RunAtLoad true, KeepAlive true, '--dry-run' 없음`
  - dry-run — 단위 `--dry-run → stdout 'DRY-RUN <command>' 1줄, 204, openTerminal 미호출`
- Depends on: -

## T-021 터미널 열기 프론트 연동 (02 · 03 · 07)
- Status: todo
- Scope: Frontend
- FR: FR-013, FR-014
- AC: FR-013-AC6, FR-013-AC9, FR-013-AC10, FR-014-AC5
- Errors: FR-013-E1, FR-013-E2, FR-013-E3, FR-013-E4
- Screens: SCR-02, SCR-03, SCR-07
- Backend: 없음
- Frontend: `api/helper.ts`(`GET /api/helper/token` → `POST <helperUrl>/open` 2초 타임아웃, `GET /health`), `dialogs/helper-missing/*`, 02·03·07 버튼 연결, `CopyButton`
- Done when:
  - FR-013-AC6 — 단위 `helper.test [FR-013-AC6] 요청 URL = config.helperUrl + '/open', 본문 키는 target(+leadName)뿐, 헤더 X-JayStudio-Helper-Token` + E2E-09(dry-run stdout 확인)
  - FR-013-AC9 — 단위 `[FR-013-AC9][FR-013-E1] 2초 타임아웃·연결 실패 → HelperMissingDialog + 선택 명령 + 명령 복사` + E2E-09
  - FR-013-AC10 — 단위 `SettingsScreen.test [FR-013-AC10] 진입 시 /health 호출, 무응답 → '테스트로 열기' 비활성 '도우미 미설치', 버튼 누를 때 재확인` + E2E-11
  - FR-014-AC5 — 단위 `[FR-014-AC5] 07 명령 복사 = defaultSessionCommand, 03 HelperMissingDialog 복사 = 팀장 명령` + E2E-11
  - FR-013-E1 — 위 AC9 테스트
  - FR-013-E2 — 단위 `[FR-013-E2] 403 → '도우미 인증 실패 · 도우미를 다시 설치하세요'` + E2E-09
  - FR-013-E3 — 단위 `[FR-013-E3] 400 → 도우미 message 표시`
  - FR-013-E4 — 단위 `[FR-013-E4] 누른 시점 registry에 lead 없음 → 호출 안 함, '팀장이 없습니다'` + E2E-09
- Depends on: T-015, T-016, T-020, T-022

## T-022 07 설정 화면
- Status: todo
- Scope: Frontend
- FR: FR-014, FR-001
- AC: FR-014-AC1, FR-014-AC2, FR-014-AC3, FR-014-AC4, FR-001-AC4, FR-001-AC5
- Errors: FR-001-E1, FR-001-E2
- Screens: SCR-07, SCR-04-5
- Backend: 없음
- Frontend: `screens/settings/*`(카드 3개, `GET /api/settings` + SSE registry 갱신, 다시 읽기, 설정 예시 복사, 명령 복사, 도우미 상태)
- Done when:
  - FR-014-AC1 — 단위 `SettingsScreen.test [FR-014-AC1] settings.json 편집 요소 없음, 복사 버튼만`
  - FR-014-AC2 — 단위 `[FR-014-AC2] 설정 예시 복사 → clipboard = settings.hookSettingsExample` + E2E-11(복사 JSON을 fixture에 써서 `설정됨`)
  - FR-014-AC3 — 단위 `[FR-014-AC3] hookConfigured true → '설정됨', false → '없음'` + E2E-11
  - FR-014-AC4 — 단위 `[FR-014-AC4] 마운트 폴더 = settings.hostPath(맥북 경로)`
  - FR-001-AC4 — 단위 `[FR-001-AC4] 다시 읽기 → POST /api/registry/rescan, 응답으로 수치 갱신` + E2E-06
  - FR-001-AC5 — 단위 `[FR-001-AC5] 경로 읽기 전용 텍스트, input 요소 없음`
  - FR-001-E1 — 단위 `[FR-001-E1] agentsDirMissing → 프로젝트 폴더 카드에 AgentsDirMissing` + E2E-06
  - FR-001-E2 — 단위 `[FR-001-E2] writable false → '쓰기 권한 없음'(danger)`
- Depends on: T-013, T-012

## T-023 이벤트 재생 도구 · fixture 세트
- Status: todo
- Scope: Tools
- FR: FR-003, FR-004
- AC: FR-003-AC9
- Errors: -
- Screens: -
- Tools: `tools/replay/replay.mjs`(`--url`, `--token-file`, `--delay-ms`, JSONL 순서 POST, 실제 hook 입력 필드), `scenarios/`: `states.jsonl`(FR-004-AC2 13행 + AC3 + AskUserQuestion + 로비 2세션 + 정의 없는 서브 + 정의 있는 서브 + 워크플로우 밖 + 마스킹 대상 + 순서 어긋남), `showcase.jsonl`(E2E-13 스크린샷용, 01·02·03 PNG와 유사한 상태 구성), `fixtures/`: `project-basic`(에이전트 5, 스킬 2, 워크플로우 0, settings.json 없음), `project-configured`(워크플로우 2, hook 설정 있음), `project-empty`, `project-no-agents-dir`, `project-format-errors`(5종 오류 + 깨진 참조 + 구성 파일 JSON 오류 + 중복 소속), `project-large`(에이전트 100·워크플로우 30·인원 7 이상 층), `project-showcase`
- Done when:
  - FR-003-AC9 — 단위 `replay.test [FR-003-AC9] 시나리오의 hook_event_name이 12종 안에만 있음`, `각 이벤트에 공통 필드 session_id·cwd·hook_event_name·permission_mode 존재`
  - 재생 도구 — 단위 `replay.test 순서대로 POST, 헤더 Content-Type·토큰, 비 2xx 시 exit 1`
  - fixture — 단위 `fixtures.test 각 fixture가 architecture §6 형식을 만족(정상 파일 파싱 가능, 형식 오류 fixture는 의도한 오류만)`
- Depends on: -

## T-024 E2E 통합 검증 (실제 컨테이너 + fixture + 재생 + dry-run 도우미)
- Status: todo
- Scope: Tools
- FR: 전체
- AC: FR-001-AC3, FR-004-AC2, FR-004-AC6, FR-016-AC1, FR-016-AC4, FR-003-AC1, FR-003-AC2
- Errors: -
- Screens: SCR-01 ~ SCR-07 전체
- Tools: `tools/e2e/playwright.config.ts`(webServer 없음, globalSetup이 fixture 복사 → compose e2e up → dry-run 도우미 기동 → 대기), `compose.e2e.yaml`, `tests/e2e-01…e2e-13.spec.ts`(architecture §8.2), `scripts/check-port.sh`(E2E-14), 1440 폭 스크린샷 저장, 다른 Origin용 정적 페이지 서버(4192)
- Done when:
  - E2E-01 ~ E2E-13 — 각 spec 통과(테스트 제목에 §8.2의 검증 ID 나열)
  - E2E-14 — `check-port.sh` 출력 `127.0.0.1:4190/tcp` 확인
  - FR-001-AC3 — E2E-07 `파일 변경 → 02 반영 2초 이내(6가지 변경)`
  - FR-004-AC2·AC6 — E2E-04 `states.jsonl 재생 → 02·03 상태가 표대로, 각 단계 2초 이내`
  - FR-007-E1 — E2E-01 `이벤트 0건으로 03 진입 → 04-4 배너 + 캐릭터 모두 대기색` / E2E-04 후반 `running 상태에서 fixture settings.json의 hook 제거 → 03 배너 + 캐릭터·패널 모두 '대기', 02 책상은 '작업 중' 유지 → hook 복구 → 03 실제 상태 복귀`
  - FR-016-AC1·AC4 — E2E-05
  - FR-003-AC1·AC2 — E2E-08 + E2E-14
  - DoD "다른 Origin 차단" — E2E-08 `4192 페이지에서 POST → 실패(403), EventSource → error, curl Origin 없음 → 403`
  - DoD "화면 대조" — E2E-13 산출물 3장이 `tools/e2e/screenshots/`에 있고 리뷰어가 `docs/ui/screens/*.png`와 대조해 요소 누락·배치 차이 없음
  - 격리 — `globalSetup`이 실제 `JayStudio/.claude`·`.jaystudio` 경로를 참조하지 않음(경로 문자열 검사 테스트)
- Depends on: T-014, T-015, T-016, T-017, T-018, T-019, T-021, T-022, T-023

---

## 사람 확인 항목 (Definition of Done, architecture §8.3)

| # | 항목 | 연결 ID | 선행 태스크 |
|---|---|---|---|
| H-1 | 실제 `JayStudio` 마운트 컨테이너에서 에이전트 수·스킬 수가 실제 파일과 일치 | FR-001-AC1, FR-001-AC2 | T-024 |
| H-2 | 07 예시를 실제 `settings.json`에 넣고 `claude --agent develop-tech-lead` 실행 → 02·03 상태 전이 | FR-003-AC8, FR-003-AC9, FR-004-AC2, FR-014-AC2 | T-024 |
| H-3 | 도우미 설치 후 02·03 버튼으로 실제 Terminal.app에서 `claude` / `claude --agent develop-tech-lead` | FR-013-AC1, FR-013-AC2, FR-013-AC11 | T-021 |
| H-4 | 같은 공유기의 다른 기기에서 4180·4181 접속 불가 | FR-003-AC1, NFR-04 | T-001, T-020 |
| H-5 | 컨테이너를 끈 상태에서 Claude Code 작업이 멈추지 않음 | FR-003-AC8, NFR-03 | T-012 |

## 추적 매트릭스 (ID → 태스크)

| FR | AC/E → 태스크 |
|---|---|
| FR-001 | AC1 T-003(+H-1) · AC2 T-003(+H-1) · AC3 T-004, T-024 · AC4 T-004, T-022 · AC5 T-022 · AC6 T-008 · E1 T-003, T-014, T-015, T-022 · E2 T-003, T-008, T-015, T-022 · E3 T-003 |
| FR-002 | AC1 T-003 · AC2 T-003, T-015 · AC3 T-010, T-019 · AC4 T-003 · AC5 T-003 · AC6 T-003 |
| FR-003 | AC1 T-002, T-024(+H-4) · AC2 T-002, T-024 · AC3 T-005 · AC4 T-006 · AC5 T-006, T-015 · AC6 T-006, T-013 · AC7 T-005 · AC8 T-012(+H-2, H-5) · AC9 T-005, T-012, T-023 · AC10 T-005 · E1 T-005 · E2 T-005 |
| FR-004 | AC1 T-006 · AC2 T-006, T-024(+H-2) · AC3 T-006 · AC4 T-006 · AC5 T-006 · AC6 T-007, T-024 · AC7 T-006, T-015 · E1 T-006 |
| FR-005 | AC1 T-013, T-014 · AC2 T-013, T-014 · AC3 T-014 · AC4 T-014 · AC5 T-014, T-017 · AC6 T-006, T-007 · AC7 T-014 · AC8 T-014 · AC9 T-013 · AC10 T-014 · E1 T-014 |
| FR-006 | AC1~AC12 T-015 (AC5 T-013, AC11 T-003, AC12 T-015) · E1 T-015 · E2 T-015 · E3 T-015 |
| FR-007 | AC1·AC2·AC4·AC7·AC8·AC9 T-016 · AC3 T-006, T-016 · AC5 T-006, T-016 · AC6 T-006, T-016 · E1 T-016 · E2 T-016 |
| FR-008 | AC1·AC2 T-008 · AC3·AC4 T-017 · E1·E2·E3 T-008, T-017 |
| FR-009 | AC1·AC2·AC5·AC6·AC7 T-018 · AC3 T-009 · AC4 T-009, T-018 · E1·E2·E3 T-009, T-018 |
| FR-010 | AC1·AC5·AC7 T-010 · AC2·AC3 T-010, T-019 · AC4·AC6 T-019 · E1·E2·E3 T-010, T-019 |
| FR-011 | AC1·AC2·AC6 T-010 · AC3·AC4 T-010, T-019 · AC5 T-010, T-016 · E1·E2·E4 T-010, T-019 · E3 T-010, T-019 |
| FR-012 | AC1·AC3 T-019 · AC2·AC4 T-011 · AC5 T-011, T-019 · AC6 T-011, T-016 · E1·E2 T-011, T-019 |
| FR-013 | AC1·AC2 T-012, T-020(+H-3) · AC3 T-015 · AC4 T-016 · AC5 T-012 · AC6 T-021 · AC7 T-020 · AC8 T-002 · AC9 T-021 · AC10 T-021 · AC11 T-020(+H-3) · E1 T-021 · E2 T-020, T-021 · E3 T-020, T-021 · E4 T-021 |
| FR-014 | AC1 T-012, T-022 · AC2 T-012, T-022(+H-2) · AC3 T-003, T-022 · AC4 T-012, T-022 · AC5 T-021 · E1 T-001 |
| FR-015 | AC1·AC2·AC3 T-005 |
| FR-016 | AC1~AC4 T-013, T-024 |
| FR-017 | AC1 T-008, T-015 · AC2·AC3·AC5 T-017 · AC4 T-008, T-016 · E1·E2 T-008, T-017 |

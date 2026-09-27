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
  - FR-014-AC4 — 통합 `SettingsControllerTest [FR-014-AC4] hostPath = env 값(JAYSTUDIO_HOST_PATH 그대로), 응답에 컨테이너 마운트 경로(JAYSTUDIO_MOUNT_PATH 값) 미포함(ADR-20 D-021: Settings에 mountPath 필드 없음)`
  - FR-003-AC8 — 위 단위 테스트(`timeout: 3`, `type: http`) + 사람 H-5
  - FR-013-AC1 — 단위 `CommandStringsTest [FR-013-AC1] defaultSessionCommand == 'cd "<hostPath>" && claude'` + 사람 H-3
  - FR-013-AC2 — 단위 `[FR-013-AC2] leadSessionCommandTemplate == 'cd "<hostPath>" && claude --agent <팀장 name>'` + 사람 H-3
  - FR-013-AC5 — 통합 `[FR-013-AC5] GET /api/settings에 두 명령 포함` + E2E-11
- Depends on: T-002, T-003

## T-013 프론트 공통 셸 · 스토어 · SSE 클라이언트 · 04-3 배너 · 스켈레톤
- Status: done
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
- Status: done
- Scope: Frontend
- FR: FR-005, FR-001, FR-015
- AC: FR-005-AC1, FR-005-AC2, FR-005-AC3, FR-005-AC4, FR-005-AC5, FR-005-AC7, FR-005-AC8, FR-005-AC10
- Errors: FR-005-E1, FR-001-E1
- Screens: SCR-01, SCR-04-1, SCR-04-5, SCR-04-7
- Backend: 없음
- Frontend: `screens/home/*`(KPI 4, 상태 막대, 대표 카드, 이벤트 표), `lib/derive/featuredWorkflows.ts`, `NoEventsYet`, `AgentsDirMissing`, `EmptyWorkflowCard`. 추가(D-022, ADR-21): `styles/theme.css`에 `--radius-dot: 3px` 추가, `components/ui/StatusDot`의 `radius-badge` 임시 사용을 `rounded-dot`으로 교체(T-013 리뷰 Minor 해소)
- Done when:
  - 토큰 규칙(D-022) — 리뷰어 코드 확인: `theme.css` `@theme`에 `--radius-dot: 3px` 존재, `StatusDot`이 `rounded-dot` 사용, `radius-badge` 참조·임시 주석 제거
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
  - 후속(ADR-24, T-015에서 수행): 대표 카드 테두리를 `lib/derive/workflowCardBorder.ts`로 교체(`running>0 && waiting>0`일 때만 결과가 바뀐다). T-014 판정은 유지하고 회귀 확인만 T-015 리뷰에서 한다
- Depends on: T-013

## T-015 02 에이전트 워크플로우 층 뷰
- Status: done
- Scope: Frontend
- FR: FR-006, FR-004, FR-003, FR-001, FR-002, FR-013, FR-017
- AC: FR-006-AC1, FR-006-AC2, FR-006-AC3, FR-006-AC4, FR-006-AC5, FR-006-AC6, FR-006-AC7, FR-006-AC8, FR-006-AC9, FR-006-AC10, FR-006-AC11, FR-006-AC12, FR-004-AC7, FR-003-AC5, FR-013-AC3, FR-002-AC2
- Errors: FR-006-E1, FR-006-E2, FR-006-E3, FR-001-E2
- Screens: SCR-02, SCR-04-5, SCR-04-6, SCR-04-7
- Backend: 없음
- Frontend: `screens/workflows/*`(헤더, 요약 바, 검색+드롭다운, 로비, 층 카드, 줌·미니맵), `components/pixel/DeskSprite.tsx`+`palette.ts`, `lib/derive/agentOrder.ts`, `search.ts`, `workflowLayout.ts`, `FormatErrorList`, `lib/format/ellipsis.ts`. 추가(ADR-23·ADR-24, 2026-09-23 문서 확정): ① `WorkflowsScreen`을 "요약·검색 바 + 층 스크롤 영역 + 하단 컨트롤 영역(176px)" 세로 flex로 분리하고 줌·미니맵의 `fixed` 오버레이 제거, `Minimap`·`맞춤` 계산 기준을 층 스크롤 영역으로 교체, `ZoomControls`의 감싸는 카드 패널 제거 ② `lib/derive/workflowCardBorder.ts` 신설 후 `Floor.tsx`와 `screens/home/FeaturedWorkflows.tsx`(T-014 구현, 칩 variant → 공용 함수) 교체
- Done when:
  - 층 뷰 레이아웃(ADR-23) — 단위 `WorkflowsScreen.test [FR-006-AC10] 줌·미니맵은 층 스크롤 영역 밖 하단 컨트롤 영역에 있고 층 그리드 위에 겹치는 fixed/sticky 요소가 없다` + 리뷰어 화면 대조(층이 뷰포트보다 길 때 책상 이름·상태 글자가 가려지지 않음)
  - 카드 테두리 규칙(ADR-24) — 단위 `workflowCardBorder.test [FR-006-AC5] 팀장 없음 → danger-border, running>0(waiting>0 포함) → running-border, running=0·waiting>0 → waiting, 모두 대기 → border` + `Floor.test`·`FeaturedWorkflows` 렌더 단언(01·02가 같은 함수를 쓴다)
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
- Status: done
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

## T-FIX-01 ADR-29·ADR-30 공통 컴포넌트 정합 (비활성 버튼 표현 · 프로젝트 칩 범위)
- Status: done
- Scope: Frontend
- FR: 없음(문서 정합 수정 — ADR-29, ADR-30)
- AC: 없음
- Errors: 없음
- Screens: SCR-01, SCR-02, SCR-03, SCR-07(칩 제거만)
- Backend: 없음
- Frontend: `components/ui/Button.tsx`(T-014 산출물), `components/common/TopBar.tsx`(T-013 산출물), 칩 설정을 넘기는 라우트/화면 결선
- 배경: T-016 리뷰 Minor → architect ADR-29·ADR-30 확정. 이미 done인 T-013·T-014 산출물이라 별도 수정 태스크로 분리(D-031). 계약 변경 없음
- Done when:
  - ADR-29 — 비활성 버튼은 variant 채움 배경·강조 테두리를 지우고 점선(`border/dashed`) + `text/faint` + 이유 한 줄만 남는다. 단위 `Button.test [ADR-29] primary·danger·terminal·secondary 비활성이 모두 같은 모양(배경 없음·점선·faint)` + 활성 variant 모양은 불변
  - ADR-30 — 프로젝트 칩은 01·02에만. 03·07에는 없다. `TopBar`가 라우트를 직접 읽지 않고 화면이 넘긴 설정으로 정한다. 단위 `TopBar.test [ADR-30] 칩 표시 설정 on/off` + `router.test`로 01·02 표시·03·07 미표시
  - 회귀 — 기존 테스트 166개가 줄거나 skip되지 않는다(기대값 교정은 허용, 삭제·skip 금지)
  - 캐처 재대조 — 01·02·03을 재캐처해 `docs/reviews/screens/T-FIX-01/`에 두고 기준 PNG와 대조. 비활성 버튼이 보이는 화면(02 층 헤더 `삭제`, 03 패널 버튼)을 포함할 것
- Depends on: T-016

## T-017 05 워크플로우 추가 · 05-3 삭제 확인 UI
- Status: done
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

## T-FIX-02 ADR-33·ADR-34 05 팝업 정합 (대괄호 표기 · FR-017-E1 안내 3초)
- Status: done
- Scope: Frontend
- FR: FR-008, FR-017(문서 정합 수정 — ADR-33, ADR-34)
- AC: 없음(기존 AC 유지)
- Errors: FR-017-E1
- Screens: SCR-05-L, SCR-05-3
- Backend: 없음
- Frontend: `lib/text.ts`(`WORKFLOW_ADD_DESCRIPTION`), `dialogs/workflow-delete/WorkflowDeleteDialog.tsx`(상수·주석·안내 중 버튼 상태), 두 파일의 단위 테스트 기대값
- 배경: T-017 리뷰 Minor 1·2(+ Minor 3과 같은 결론) → architect ADR-33·ADR-34 확정. 이미 done인 T-017 산출물이라 별도 수정 태스크로 분리(T-FIX-01 선례). 계약 변경 없음
- Done when:
  - ADR-33 — `WORKFLOW_ADD_DESCRIPTION`이 `구성 파일 .jaystudio/teams/이름.json(팀장·팀원 목록)이 만들어집니다.`다(대괄호 없음). 단위 `WorkflowAddDialog.test [ADR-33] 설명줄 문구` + 정적 검사: `frontend/src`의 화면 문구 상수에 `[`로 시작하는 한글 자리표시 0건. 설명 입력 placeholder는 `한 줄 설명` 그대로(회귀 확인)
  - ADR-34 / FR-017-E1 — `NOT_EMPTY_NOTICE_MS = 3000`이고 ui-spec SCR-05-3의 3000ms와 같다. 단위 `[FR-017-E1] 409 WORKFLOW_NOT_EMPTY → 3초 후 닫힘`(2.9초 시점 미닫힘 / 3.0초 후 `onClose` 1회), `[FR-017-E1] 안내 표시 중 삭제 버튼 비활성`(중복 DELETE 0건), `[FR-017-E1] 안내 중 취소 → 즉시 닫힘`
  - 회귀 — `[FR-017-E2] 500 → message, 팝업 유지`의 타이머 단언을 3초 기준으로 교정한다(삭제·skip 금지). `cd frontend && npm test` 통과 수가 줄지 않는다
  - 캡처 재대조 — 05-L을 재캡처해 `docs/reviews/screens/T-FIX-02/`에 두고 설명줄 문구를 확인한다
  - (팀장 추가, T-017 리뷰 Minor 4) 비-ApiError 예외 노출 제거 — `String(error)`를 화면에 그대로 쓰지 않는다. `api/client.ts`에서 모든 예외를 `ApiError`로 정규화하고, 알 수 없는 오류 문구는 conventions §4 MUST의 `서버에 연결할 수 없습니다 · 다시 시도하세요`를 쓴다. 대상은 `WorkflowAddDialog.tsx:84`·`WorkflowDeleteDialog.tsx:52`와 같은 패턴인 T-013 산출물 `AgentsDirMissing.tsx:35`까지 셋 다. 단위 `client.test [conventions §4] JSON 파싱 실패·네트워크 예외 → ApiError 정규화` + 각 팝업의 `알 수 없는 오류 → 공통 문구` 단언
- Depends on: T-017

## T-018 05 기존 에이전트 가져오기 UI
- Status: done
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
  - (팀장 추가, T-FIX-02 리뷰 Minor 2) ADR-33 정적 검사 확장 — `text.test.ts`의 검사가 **JSX 텍스트 노드**와 **`[N]`·`<N>`(한글 없는 자리표시)**를 잡지 못한다(리뷰어가 probe 파일로 실측). T-018이 `선택한 [N]명 가져오기`를 구현하므로 여기서 메운다: `PLACEHOLDER_PATTERN`을 conventions §3 금지 목록(`[N]` 포함)까지 덮도록 넓히고 JSX 텍스트 노드도 검사 범위에 넣는다. 단위 `text.test [ADR-33] JSX 텍스트 노드·[N] 자리표시도 잡는다`
  - ADR-33·ADR-35 정합 — 05-R 문구에 대괄호 자리표시를 남기지 않는다(`선택한 N명 가져오기`는 (a) 치환). `가져오기`·`선택한 0명 가져오기` 비활성에는 이유 줄을 붙이지 않고, `writable=false`·`+ 새로 만들기`만 `쓰기 권한 없음`을 붙인다. 단위 `[FR-009-AC5][ADR-35] 0명 비활성에 이유 줄 없음, writable=false는 '쓰기 권한 없음'`
- Depends on: T-017

## T-FIX-03 ADR-36~ADR-39 05-R 가져오기 팝업 정합 + ADR-39 위반 제거 (거부 사유 문구 · 가려진 선택 안내 · 제목 대상 · 조사 표기)
- Status: done
- Scope: Frontend
- FR: FR-009(문서 정합 수정 — ADR-36, ADR-37, ADR-38, ADR-39)
- AC: 없음(기존 AC 유지. FR-009-AC5의 버튼 라벨·활성 조건은 바뀌지 않는다)
- Errors: FR-009-E2
- Screens: SCR-05-R
- Backend: 없음
- Frontend: `frontend/src/lib/text.ts`(`IMPORT_REJECTED_REASON_TEXT`, `importTitleFor`, 새 안내 줄 문구), `frontend/src/dialogs/import-agents/ImportDialog.tsx`(제목 입력, 안내 줄), `frontend/src/lib/derive/importCandidates.ts`(가려진 선택 수 순수 함수), 각 단위 테스트
- 배경: T-018 리뷰 Minor m2~m5(VERDICT PASS, 구현은 이미 커밋 `054c3ac`) → architect ADR-36~ADR-39 확정. 이미 done인 T-018 산출물이라 별도 수정 태스크로 분리(T-FIX-01·T-FIX-02 선례). 계약 변경 없음
- Done when:
  - ADR-36 / FR-009-E2 — `IMPORT_REJECTED_REASON_TEXT`가 세 값 모두 문구를 갖는다: `ALREADY_ASSIGNED` = `가져오는 사이 다른 워크플로우에 소속되었습니다`, `NOT_FOUND` = `정의 파일이 없습니다 · 목록을 확인하세요`, `FORMAT_ERROR` = `읽지 못한 정의 파일입니다 · 목록을 확인하세요`. 단위 `ImportDialog.test [FR-009-E2][ADR-36] rejected 세 사유가 각각 '<name>: <사유>'로 표시된다`, `[ADR-36] enum 밖 reason → 이름만 표시`. 기존 `[FR-009-E2] rejected ALREADY_ASSIGNED …` 테스트는 삭제·약화하지 않는다
  - ADR-37 — 검색으로 가려진 선택이 1명 이상이면 검색 입력 아래에 `검색으로 가려진 선택 [N]명`을 그리고, 0명이면 그리지 않는다. 검색어 변경이 체크 상태·행별 `역할` 값을 바꾸지 않는다. 계산은 `lib/derive/*` 순수 함수. 단위 `importCandidates.test [ADR-37] 선택 - 검색결과 = 가려진 수`, `ImportDialog.test [ADR-37] 2명 선택 후 결과 0 검색 → '검색으로 가려진 선택 2명' 표시, 체크 유지, '선택한 2명 가져오기' 활성`, `[ADR-37] 검색어 없음 → 안내 줄 없음`
  - ADR-38 — 제목이 `?workflow`가 아니라 현재 대상(= `?workflow` ?? 드롭다운 선택값)을 따른다. 단위 `ImportDialog.test [FR-009-AC7][ADR-38] ?workflow 없음 + 드롭다운 기본 선택 → 제목에 첫 워크플로우 이름`, `[ADR-38] 드롭다운을 바꾸면 제목도 바뀐다`, `[ADR-38] 워크플로우 0개 → 제목 '기존 에이전트 가져오기'`
  - ADR-39 — `importTitleFor`가 `<워크플로우>(으)로 기존 에이전트 가져오기`를 만든다(`로` 단독 금지). 단위 `text.test [ADR-39] 받침 있는 이름·없는 이름 모두 '(으)로'`. 정적 검사: `frontend/src`에 조사 보정(받침 판정) 함수가 없다
  - 회귀 — `cd frontend && npm test` 통과 수가 줄지 않는다. `npm run lint`·`npm run typecheck` 통과. `Dialog` `size` 기본값은 `md`(`max-w-md`) 그대로여서 05-L·05-3에 회귀가 없다(ADR-40, 코드 변경 없음)
  - **(팀장 추가, T-019 리뷰 Major) ADR-39 위반 제거 — `koreanSubjectParticle()`** : `lib/text.ts:193-199`의 조사 보정 함수가 conventions §2 MUST("받침을 판정해 조사를 고르는 보정 함수·분기를 `lib/format/*`·컴포넌트 어디에도 두지 않는다")를 어기고, **실제 화면 문구가 확정 문구와 다르다**. 리뷰어 실측: 마지막 글자가 `a/e/i/o/u`면 `가`, 아니면 `이` → `architect이 여러 워크플로우에…`로 렌더되어 FR-006-AC11 확정 문구 `<name>이(가) 여러 워크플로우에 있습니다 · 구성 파일을 확인하세요`와 글자가 다르다. 조치: 함수를 지우고 `floorDuplicateWarning`을 확정 문구 병기 표기로 되돌린 뒤 **잘못된 기대값을 고정하고 있는 `screens/workflows/Floor.test.tsx:162,167`을 확정 문구로 교정**한다(이 교정은 허용된 기대값 수정이다). 단위 `text.test [ADR-39] 층 경고는 확정 문구 병기 표기`, 정적 단언 `[ADR-39] frontend/src에 조사 보정 함수·받침 판정 분기가 없다`
  - (팀장 추가, T-019 리뷰 Minor 1) 06 수정 모드 파일 읽는 중에 `취소`·`저장`·각주가 **사라지지 않는다** — 스켈레톤은 필드 영역에만 적용하고 버튼·각주는 그린 채 `disabled`로 둔다(이유 줄 없음). 근거: ui-spec SCR-06 제목 행 `로딩` 열 "폼 전체 비활성 + 필드 스켈레톤", ADR-35 표가 "06 수정 모드 파일 읽는 중"을 비활성 지점으로 이미 상정. 단위 `AgentForm.test [SCR-06] 수정 모드 로딩 중 취소·저장이 비활성으로 보인다`
  - (팀장 추가, T-019 리뷰 Minor 2) 06 `소속 워크플로우` 빈 상태(`워크플로우 0`)의 안내를 `<span id=…>`에 `htmlFor`로 연결하지 않는다(`<span>`은 labelable 요소가 아니라 무효). 안내를 `Field` 자식 텍스트로 두거나 전용 요소로 분리하고, 이 분기를 덮는 단언 1개를 추가한다. 단위 `AgentForm.test [SCR-06] 워크플로우 0개 → '먼저 워크플로우를 추가하세요' 안내`
  - 캡처 재대조 — 05-R을 `?workflow` 없이(드롭다운) · 검색 결과 0 + 2명 선택 상태로 재캡처해 `docs/reviews/screens/T-FIX-03/`에 두고 제목·안내 줄을 확인한다
  - **[리뷰 Round 1 NEEDS_FIX — B-1] 이 태스크가 새로 만든 flaky를 고친다**: `dialogs/remove-agent/RemoveAgentDialog.test.tsx:135`가 `findByRole(...)` 직후 `expect(openRemove).toBeEnabled()`를 단언한다. Minor-1 수정으로 `워크플로우에서 제거` 버튼이 로딩 중에도 **비활성 상태로 존재**하게 됐고, `findBy*`는 **존재**만 기다리므로 비활성 버튼을 즉시 잡는다. pristine 트리에서는 재현 불가능한 **신규 결함**(리뷰어가 부하 42회 중 2회 재현). 조치: 상태 단언을 `waitFor`로 감싼다. 같은 패턴(`findBy*` 직후 상태 단언)이 다른 곳에 있는지 함께 확인한다
  - **[리뷰 Round 1 — B-2, 팀장 몫] flaky 검증 조건을 실효성 있게 바꾼다**: 14코어 머신에서 `yes ×4`는 부하가 되지 않아 **수정 전 코드도 통과시킨다**(pristine 0/10 통과). 검증은 `yes ×16` 이상 + 전체 suite 반복으로 하고, 검증 조건 자체가 결함을 잡는지(수정 전 코드가 실패하는지) 먼저 확인한다
  - (리뷰 Minor m1) 조사 보정 정적 검사 우회 경로: `/[ᆨ-ᇂ]$/.test(name.normalize("NFD"))` + 분기별 완성 문장 반환은 **검출되지 않는다**(리뷰어 probe C 실측). 검사 패턴을 넓히거나 한계를 주석으로 명시한다
  - (리뷰 Minor m3) `docs/reviews/screens/T-FIX-03/` 캡처는 `transition-colors duration-200` 도중에 찍혀 primary 녹색 픽셀이 0이다(T-018은 3912). 회귀는 아니지만 **버튼 활성 상태의 시각 기준으로 쓸 수 없다** — 재캡처 시 전환 완료를 기다린다
- Depends on: T-018, T-019

## T-019 06 에이전트 만들기 · 수정 · 06-5 충돌 · 06-6 제거 UI
- Status: done
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
  - FR-012-AC5 — 단위 `[FR-012-AC5] 워크플로우 밖 에이전트 06에서 제거 버튼 활성, 제목 '<name>을(를) 제거할까요?'`(조사 병기 — ADR-39)
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
  - FR-017-AC5(T-017 리뷰 Minor 5) — 단위 `[FR-017-AC5] 06 폼·06-6 어디에도 워크플로우 이름 편집 입력·버튼 없음`. T-017은 05 범위만 단언했으므로 06 범위를 여기서 메운다
  - `ConfirmByNameDialog`(T-017 산출물) 재사용 — 06-6 전용 확인 팝업을 새로 만들지 않는다. `notes[]`에 휴지통 안내 + 팀장 안내 2줄을 넘긴다
  - ADR-33 정합 — 06 `설명 (description)` placeholder는 대괄호 없이 `언제 이 에이전트에게 일을 맡기는지`, 도구 기타 입력 라벨은 `기타`다. 단위 `[ADR-33] 06 폼 placeholder·라벨에 대괄호 없음`
  - ADR-35 정합 — 이유 줄을 붙이는 곳은 `이미 팀장이 있습니다 (<lead>)`(FR-010-AC4), `도구 방식을 고르세요`(FR-010-AC2), `작업 중에는 제거할 수 없습니다`(FR-012-AC6), `쓰기 권한 없음`(FR-010-E2)뿐이다. 필수값 미입력 `저장`, 이름 불일치 `제거 (이름 일치 시 활성)`, 소속 `(없음)` 역할 라디오, 06-5 진행 중 버튼에는 이유 줄을 만들지 않는다. 단위 `[ADR-35] 지정 지점만 이유 줄, 나머지 비활성은 이유 줄 없음`
  - ADR-39 정합 — 06-6 제목은 `<name>을(를) <워크플로우>에서 제거할까요?` / `<name>을(를) 제거할까요?` 병기 표기다. 06-5 본문 `<name>.md이 이 창을 연 뒤 [hh:mm:ss]에 변경되었습니다.`는 ui-spec 문구 그대로 두고 조사를 고치지 않는다(치환값 뒤가 아니라 고정 접미 `.md` 뒤이므로 대상이 아니다). 조사 보정 함수를 만들지 않는다. 단위 `[ADR-39] 06-6 제목 조사 병기`
  - ADR-40 정합 — `Dialog` `size`는 06 폼 `lg`, 06-5·06-6 `md`(기본값이라 생략 가능)다. 팝업 컴포넌트에서 `max-w-*`를 직접 지정하지 않는다. 단위 `[ADR-40] 06 폼은 size lg, 06-5·06-6은 md`
- Depends on: T-016, T-017

## T-020 열기 도우미 (Node) · 설치 스크립트 · plist
- Status: done
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

## A-15 (architect 확정 완료 2026-09-25 → ADR-41) 허용 Origin 목록에 `http://localhost:<port>` 포함 여부
- Status: done
- Scope: architect 판단 → 확정되면 Backend 수정 태스크로 분리
- FR: FR-008(증상 발생 지점), NFR-04(127.0.0.1 바인딩), architecture §5 Origin 규칙
- 배경(사용자 보고 + 팀장 읽기 전용 재현, 2026-09-24):
  - 증상: 워크플로우 생성 시 403 `FORBIDDEN_ORIGIN` / `허용되지 않은 출처입니다`
  - 원인: `http://localhost:4180`으로 접속. `OriginFilter`는 허용 목록과 **문자열 정확 비교**를 하고 기본 허용 목록은 `http://127.0.0.1:<public-port>` 하나뿐이다(`OriginFilter.resolveAllowedOrigins`, `application.yaml:36`)
  - 재현(GET만, 생성 요청 미발송): `Origin: http://127.0.0.1:4180` → 200 / `Origin: http://localhost:4180` → 403 / Origin 없음 + `Sec-Fetch-Site: same-origin` → 200
  - **함정 구조**: 같은 출처 GET은 Origin 헤더를 보내지 않아 `Sec-Fetch-Site`로 통과하지만, POST는 Origin을 보내 거부된다 → `localhost`로 접속하면 **조회는 정상인데 쓰기만 실패**해 원인을 알아채기 어렵다
  - 부작용 없음 확인: 필터가 `chain.doFilter` 전에 반환하므로 서비스 계층에 도달하지 않는다. `.jaystudio/teams/` 폴더 자체가 없어 잔여 파일 0
- 확정 결과(ADR-41, 세 검토 항목 대응):
  1. **허용 목록에 `localhost`를 넣지 않는다(기각).** 도우미 허용 Origin 기본값은 FR-013-AC7이 값까지 확정한 AC라 함께 고치면 확정 요구사항 수정이 되고, 고치지 않으면 `Claude 열기`만 403으로 남아 함정이 절반만 사라진다. 허용 목록은 틀리면 그대로 구멍이 되는 지점이라 확정 진입 주소 하나만 둔다. `http://[::1]:<port>`도 넣지 않는다(compose가 IPv4만 공개해 연결 자체가 불가능하고, `Origin`에는 사용자가 입력한 호스트명이 그대로 실린다)
  2. **진입 주소 정규화를 채택한다(채택, 형태 변경).** `publicOrigin` 비교·안내 줄이 아니라, 첫 렌더 전에 `location.hostname`이 `localhost`·`[::1]`이면 호스트명만 `127.0.0.1`로 바꿔 `location.replace`한다. 확정 진입 주소가 이미 `127.0.0.1:<포트>` 하나이므로(final 문서 User Scenarios 1, `docs/ui/screen-flow.md`) 요구사항을 바꾸지 않고 강제만 한다 → **T-FIX-06**
  3. **403 안내 문구를 확정한다(채택, 서버 `message`).** `허용되지 않은 출처입니다 · <publicOrigin> 주소로 다시 접속하세요`. 확정 문서에 같은 뜻의 문장이 없어 **신설 문구**이므로 사용자 승인 후에만 구현한다 → **T-FIX-05**
- 요구사항 의미 변경 여부: **없음.** NFR-04(바인딩)·architecture §5 허용 목록·DoD "다른 Origin 차단"·FR-013-AC7을 하나도 바꾸지 않는다. `ApiError.code` enum·엔드포인트·필드도 그대로이고 403 `FORBIDDEN_ORIGIN`의 `message` 문구만 바뀐다
- Depends on: -

## T-FIX-05 403 `FORBIDDEN_ORIGIN` 안내 문구 (ADR-41 (d))
- Status: done — 신설 문구 사용자 승인(2026-09-25, E-006) · 리뷰 PASS(`docs/reviews/T-FIX-05_T-FIX-06.md`)
- Scope: Backend
- FR: FR-008(오류 매핑에 403이 없어 생긴 공백 보완 — 새 AC 없음), architecture §5
- AC: 없음(기존 AC 유지)
- Errors: 403 `FORBIDDEN_ORIGIN`(새 code 아님, `message` 문구만)
- Screens: - (표시는 ui-spec §공통 상태 표 `허용되지 않은 출처` 행 = 기존 에러 표현 재사용)
- Backend: `OriginFilter`(403 본문 생성 지점에 `config.publicOrigin` 주입), `OriginFilterTest`
- Frontend: 없음(403 전용 분기를 만들지 않는다 — conventions §4 MUST)
- 배경: A-15 / ADR-41. 사용자가 `localhost`로 접속해 받은 403 팝업에 `허용되지 않은 출처입니다`만 떠 해결 방법을 알 수 없었다. T-FIX-06 정규화가 덮지 못하는 접속 경로의 마지막 안내다
- Done when:
  - 403 본문이 `{ code: "FORBIDDEN_ORIGIN", message: "허용되지 않은 출처입니다 · <publicOrigin> 주소로 다시 접속하세요" }`이고 `<publicOrigin>`이 실제 값으로 치환된 완성 문장이다(`<`·`>` 기호가 남으면 실패, ADR-33 (a)). 통합 `OriginFilterTest [ADR-41] 허용되지 않은 Origin → 403 message가 publicOrigin이 치환된 완성 문장`
  - 허용 목록은 바뀌지 않는다 — 정적 단언 `OriginFilterTest [ADR-41] 허용 목록 기본값·application.yaml에 'localhost'·'::1' 문자열이 없다`. 기존 `[DoD 다른 Origin 차단] http://127.0.0.1:9999 Origin → 403`, `Sec-Fetch-Site same-origin + Origin 없음 → 통과`, `dev 프로필 5173 허용`, `운영 프로필 5173 거부`(T-002) 테스트는 삭제·약화하지 않는다
  - 도우미 403 문구(`도우미 인증 실패 · 도우미를 다시 설치하세요`, FR-013-E2 확정 문구)와 `ApiError.code` enum은 바꾸지 않는다
- Depends on: T-002 (문구 승인 완료)

## T-FIX-06 진입 주소 정규화 — `localhost`·`[::1]` → `127.0.0.1` (ADR-41 (b))
- Status: done — 리뷰 PASS(`docs/reviews/T-FIX-05_T-FIX-06.md`)
- Scope: Frontend
- FR: FR-008(증상 발생 지점), FR-013(같은 원인의 도우미 403 함정 제거) — 새 AC 없음
- AC: 없음(기존 AC 유지)
- Errors: 없음
- Screens: 전 화면 공통(요소·문구 변화 없음 — ui-spec §공통 "진입 주소 정규화")
- Backend: 없음
- Frontend: `src/lib/origin.ts`(`canonicalHref`), `src/app/main.tsx`(첫 렌더 전 가드), 단위 테스트
- 배경: A-15 / ADR-41. `http://localhost:4180`으로 접속하면 정적 파일·같은 출처 GET은 통과하고 POST·도우미 호출만 403이 되어, 조회는 되는데 쓰기만 실패한다
- Done when:
  - 단위 `origin.test [ADR-41] localhost·[::1] → 호스트명만 127.0.0.1로 바뀐 href, 포트·경로·쿼리·해시 유지`, `[ADR-41] 127.0.0.1·그 밖의 호스트명 → null(이동 없음)`, `[ADR-41] https·다른 스킴 → null`
  - 단위 `origin.test [ADR-41] redirectToCanonical(가짜 location) — localhost면 replace 1회 호출 후 true 반환, 127.0.0.1이면 호출 없이 false 반환`(부작용 함수도 `lib/origin.ts`에 두고 `location`을 인자로 받아 테스트 가능하게 만든다)
  - 정적 단언 `[ADR-41] main.tsx가 createRoot·render보다 먼저 redirectToCanonical을 호출하고, true면 렌더하지 않는다`
  - 정적 단언 `[ADR-41] frontend/src에서 location.replace·location.href 대입으로 출처를 바꾸는 코드는 main.tsx 한 곳뿐이고, publicOrigin으로 리다이렉트하는 코드가 없다`(conventions §3 Frontend MUST)
  - 정적 단언 `[conventions §6] frontend/src에 '0.0.0.0' 문자열이 없다`(정규화 대상에 넣지 않는다)
  - 회귀 — `cd frontend && npm test` 통과 수가 줄지 않고 `npm run lint`·`npm run typecheck` 통과. 화면 요소·문구가 바뀌지 않으므로 `docs/ui/screens/*.png` 대조 결과가 T-FIX-03과 같다
  - E2E-15는 T-024에서 검증한다(여기서는 단위까지)
- Depends on: T-013
- 관련: T-021·T-022(도우미 호출 화면 — 정규화 후 `Origin`이 `http://127.0.0.1:<포트>`로 통일되어 FR-013-E2 오인 표시가 사라진다. 코드 의존은 없다), T-024(E2E-15), T-FIX-04와 무관(도우미 코드·인자 변경 없음)

## A-19 (architect 확정 완료 2026-09-26 → ADR-44) 02 상단바 `Claude 열기`가 첫 스냅샷 전 활성인데 눌러도 아무 일이 없다
- Status: done (확정 완료) — 구현은 **T-FIX-09**, 착수 전 팀장이 사용자 승인 여부를 판단한다
- Scope: architect 판단 → Frontend 수정 태스크로 분리
- FR: FR-013-AC1, SCR-02
- 출처: T-021 리뷰(`docs/reviews/T-021.md`) [Major]
- 증상(리뷰어 코드 추적, 팀장 확인):
  - `TopBar`는 `ready` 게이트 **밖**에서 렌더된다(`AppShell.tsx:28`) — `WorkflowsHeader`가 `rightExtra`로 꽂힌다(`router.tsx:26`)
  - 그래서 첫 스냅샷 전(`config === null`)에도 `Claude 열기`가 **활성**으로 보이는데, `useHelperOpen.open`은 `helperUrl === null`이면 `pendingRef`도 세우지 않고 **조용히 return**한다(`useHelperOpen.ts:58`)
  - 클릭이 다이얼로그·에러·상태 변경 **어떤 눈에 보이는 변화도 없이** 사라진다
- 충돌(확정 전 상태): `conventions.md` §3 Frontend MUST("누르면 아무 일도 없는 활성 버튼 금지", 같은 문구가 §7에서 3회 반복) vs `ui-spec.md:187`(SCR-02 로딩 열 `활성`) → **ADR-44가 ui-spec을 `비활성`으로 정정해 해소**
- 선례: `architecture.md:683` **ADR-42(A-17)**가 같은 범주(눌러도 아무 일 없는 활성 버튼)를 다루며 **"현행 유지"를 기각**했다. 같은 기준을 적용해야 한다
- 검토한 선택지: (1) 로딩 중 비활성 + 이유 줄 / (2) 활성 유지 + 클릭 시 최소 피드백 / (3) 현행 유지를 공식 예외로 기록
- 확정 결과(ADR-44): **(1)을 채택하되 이유 줄은 붙이지 않는다 — 즉 "로딩 중 비활성, 이유 줄 없음". 신설 문구 0건이라 문구 승인이 필요하지 않다.**
  - 근거: ADR-35의 이유 줄 지정 기준(`ui-spec.md` §공통)은 "원인이 그 버튼 **밖**에 있어 화면만 보고는 알 수 없을 때" 지정하라는 것이다. 첫 스냅샷 전에는 같은 상단바의 프로젝트 칩·사이드바 `CollectorStatus`·본문 04-2가 모두 스켈레톤이므로 원인이 화면에 이미 보인다 → **이유 줄을 지정하지 않는 쪽**이다. 따라서 "비활성 = 문구 신설"이라는 전제가 성립하지 않는다
  - 같은 규칙이 이미 코드에 있다: `components/ui/CopyButton.tsx:50`이 `value === null`이면 비활성 + 이유 줄 없음으로 동작하고, 주석이 같은 근거(ADR-35 + 같은 카드 안 스켈레톤)를 든다. ADR-44는 그 선례를 전 화면 규칙으로 승격한 것이다
  - (2) 기각: 재사용할 수 있는 확정 문구가 없다. `HelperMissingDialog`(`열기 도우미가 응답하지 않습니다`)는 **사실과 다르다** — 아직 `config.helperUrl`을 몰라 도우미를 호출조차 하지 않았으므로 미설치라고 단정하면 FR-013-AC9·E1의 뜻을 왜곡하고 사용자를 불필요한 재설치로 유도한다. 새 문구는 (1)+이유 줄과 같은 신설 문제로 돌아간다
  - (3) 기각: "찰나"가 **정상 경로에만** 성립한다. 실측 `GET /api/state` max 12.7ms·SSE 방송 p95 2.4ms(T-007 리뷰, `progress.md:46`)로 정상 경로는 수십 ms지만, 토큰 발급 실패·`EventSource.onerror`·heartbeat 45초 무수신이면 `GET /api/state` 폴백 후 **5→10→20→30초 백오프**로 재시도하며(`api/stream.ts:12-14, 65-73, 86-102`) 폴백까지 실패하면 `ready === false`가 상한 없이 유지된다. `ui-spec` SCR-04-2 자신이 "30초 넘게 미수신이면 04-3 배너"를 규정해 장시간 로딩을 전제한다
- ADR-42(A-17)와의 일관성: ADR-42는 같은 범주에서 ① 현행 유지를 "명문 MUST를 문서로 승인하는 셈"이라 기각 ② 비활성 + 신설 이유 줄도 기각 ③ **신설 문구 0건** 해법을 택했다. ADR-44도 같은 순서로 (3)·(2)를 기각하고 신설 문구 0건 해법을 택한다. ADR-42가 비활성을 기각한 세 근거 중 둘(문구 신설 / ADR-35 기준 불일치)은 여기서도 유효하고, 세 번째("07에서는 **영원히** 활성화되지 않는 컨트롤이 남는다")만 여기서는 성립하지 않는다 — 로딩은 스냅샷이 오면 반드시 끝나는 일시 상태다. 그래서 ADR-42는 "미표시", A-19는 "일시 비활성"이 되며, 두 결론은 **같은 기준을 각 상황에 적용한 결과**다
- 03·07 일관성 확인(코드 실독): **세 화면 모두 같은 규칙 하나로 정리되고, 코드 수정은 02 한 곳뿐이다**
  - 03 `팀장 호출 · 터미널 열기` — `AppShell` `ready` 게이트 **안**이고 `WorkflowDetailScreen.tsx:27`이 `config`·`registry`·`live` 중 하나라도 null이면 `return null` → 첫 스냅샷 전에는 렌더 자체가 없다. `ui-spec`의 `로딩` 열 `비활성`과 모순 없음(ADR-32). **코드 변경 없음**
  - 07 `테스트로 열기` — `ready` 게이트 **안** + `ClaudeOpenCard.tsx:58,93`이 `helperStatus.kind !== 'installed'`면 `disabled`. 진입 직후 `checking` 동안도 비활성이고 이유 줄이 없다(같은 카드 `열기 도우미` 행이 `확인 중…`). **코드 변경 없음**, `ui-spec` `로딩` 열 표기만 `-` → `비활성`으로 정정
  - 07 `명령 복사`(`CopyButton`) — 이미 규칙대로 동작. **코드 변경 없음**
- `ui-spec` `로딩` 열 전수 조사: `로딩` 열이 `활성`인 행은 **SCR-02 `Claude 열기` 한 행뿐**이었다(확정 전 `ui-spec.md:187` → 지금은 `비활성`). `로딩`이 `-`인 다른 버튼 행(01 `에이전트 워크플로우 열기 →`, 02 `+ 에이전트 만들기`·`+ 워크플로우 추가`·줌·미니맵, 04-7 `워크플로우 추가`, 07 두 버튼)은 모두 `ready` 게이트 안이라 첫 스냅샷 전 렌더되지 않아 같은 결함이 없다. 게이트 밖 컨트롤 중 스냅샷 값을 쓰지 않는 사이드바 탭·04-3 `지금 재연결`은 로딩 중에도 정상 동작한다 → **잠재 결함 0건**
- 사용자에게 보이는 변화: **있음** — 02 진입 직후 `Claude 열기 · 기본 세션`이 점선·faint 비활성 모양(ADR-29)으로 보이다가 첫 스냅샷이 오면 활성이 된다. 신설 문구 0건, 신설 요소 0건, 라벨·배치·클릭 동작 변화 0건, 기준 PNG 대조 영향 0(PNG는 스냅샷 수신 후 화면). 확정 문서가 지정한 상태 값을 바꾸는 결정이라 **팀장이 사용자 승인 대상인지 판단하고, 승인 전에는 구현하지 않는다**(E-004·E-005·E-006, ADR-42 선례)
- 요구사항 의미 변경 여부: **없음.** FR-013-AC1·AC3·AC6 그대로. 로딩 중에는 애초에 호출이 일어나지 않았으므로 호출 가능한 순간의 동작이 하나도 바뀌지 않는다. 계약 변경 없음
- Depends on: -

## A-16 (architect 확정 요청) dev 프로필 허용 Origin이 문서보다 좁다 — 문서·구현 중 무엇이 맞는가
- Status: todo
- Scope: architect 판단 → 확정되면 backend 반영(또는 문서 정정)
- FR: architecture §5 Origin 규칙, NFR-04
- 출처: T-FIX-05·T-FIX-06 리뷰(`docs/reviews/T-FIX-05_T-FIX-06.md`) [Major · 선행 결함]
- 증상(리뷰어 dev 실기동 실측, 팀장 코드 재확인):
  - `application-dev.yaml:10-11`이 `allowed-origins`를 `http://127.0.0.1:5173` **하나**로 두고, `OriginFilter.resolveAllowedOrigins`(47-57)는 값이 있으면 기본값을 **대체**한다 → dev 허용 목록 = {5173}
  - 그런데 `architecture.md:160`은 "dev 프로필에서 `http://127.0.0.1:5173`을 **더한 둘뿐이다**", `architecture.md:125`는 "**추가**", `conventions.md:97`도 동일 → 문서상 dev 허용 목록 = {8080, 5173}
  - 실측: dev 기동 후 `Origin: http://127.0.0.1:8080` → **403**(문서대로면 200이어야 함)
- 영향: dev에서 8080에 직접 접속하면 GET은 되고 POST만 403 — **ADR-41이 없애려던 바로 그 함정**이 dev에 남는다. 게다가 새 403 안내가 `publicOrigin`(= 8080)을 가리켜 "지금 있는 주소로 다시 접속하라"는 막다른 안내가 된다
- 성격: scaffold 커밋(9f156d2)부터 있던 선행 결함. fail-closed(더 좁음) 방향이라 **보안 위험 없음**. 운영 이미지는 dev 프로필을 쓰지 않아(compose·Dockerfile에 프로필 설정 0건) **사용자 영향 없음** → 이번 세션에서 고치지 않고 분리
- 검토할 것:
  1. dev 허용 목록을 문서대로 {publicOrigin, 5173} **둘**로 넓힐지 → `application-dev.yaml`을 `http://127.0.0.1:${JAYSTUDIO_PUBLIC_PORT},http://127.0.0.1:5173`으로
  2. 아니면 "dev는 5173으로 **대체**"가 원래 의도였는지 → `architecture.md` §4.2·§5와 `conventions.md` §6 문구를 구현에 맞게 정정
  3. 1을 택하면 403 안내가 dev에서도 실제 접속 가능한 주소를 가리키는지 확인
- 주의: 허용 목록을 넓히는 방향이므로 NFR-04·architecture §5 DoD("다른 Origin 차단")와 충돌하지 않는지 확인할 것. 요구사항 의미를 바꿔야 하면 `CONTRACT CHANGE`/에스컬레이션으로 보고
- Depends on: -

## A-17 (architect 확정 완료 2026-09-25 → ADR-42) 07 안의 04-5 `설정 열기`가 눌러도 아무 일이 없다
- Status: done (확정 완료) — 구현은 **T-FIX-08**, 착수 전 팀장이 사용자 승인 여부를 판단한다
- Scope: architect 판단 → Frontend 수정 태스크로 분리
- FR: FR-001-E1, `docs/ui/ui-rules.md` 2·5, `docs/ui/screen-flow.md` 이동표, ui-spec SCR-04-5·SCR-07
- 출처: `docs/reviews/T-022.md` [Major] (팀장 캡처 재확인 K4, 증거 `docs/reviews/screens/T-022/07-settings-agents-dir-missing.png`)
- 증상: `agentsDirMissing`이면 07 프로젝트 폴더 카드 본문이 04-5로 바뀌고, 그 안의 `설정 열기`(primary 활성)가 `/settings`로 이동한다. 07이 이미 `/settings`라 **화면 변화가 0**이다 (`components/ui/AgentsDirMissing.tsx:57`)
- 확정 결과(ADR-42): **(a) 07에서만 `설정 열기`를 그리지 않는다.** 표시 여부는 화면이 prop으로 넘기고(01·02 기본값, 07만 숨김) 공용 컴포넌트가 라우트를 읽지 않는다(ADR-30과 같은 방식). (b) 비활성 + 이유 줄은 **기각** — 이유 문구가 확정 문서에 없어 신설이 되고, ADR-35 지정 기준에도 맞지 않으며, 07에서는 영원히 활성화되지 않는 컨트롤이 남는다. (c) 현행 유지도 **기각** — 명문 MUST 위반을 문서로 승인하는 셈
- 요구사항 의미 변경 여부: **없음.** FR-001-E1의 세 요소(04-5 표시 / `다시 읽기` 복구 / 설정 화면 도달 경로)가 모두 유지된다 — `docs/ui/screen-flow.md` 표는 `04-5 설정 열기`를 **07로 들어오는 이동**으로 확정했고 07에서 나가는 자기 이동은 확정 문서에 없다. `docs/ui/ui-rules.md` 5의 복구 버튼 중 07에서 뜻이 있는 `다시 읽기`는 남는다. 계약 변경 없음
- 사용자에게 보이는 변화: **있음** — 07 + `agentsDirMissing` 상태에서만 primary 버튼 1개가 사라진다. 신설 문구 0건, 신설 요소 0건, 01·02 변화 0건. 확정 문서가 열거한 버튼을 한 화면에서 빼는 결정이라 **팀장이 사용자 승인 대상인지 판단하고, 승인 전에는 구현하지 않는다**(E-004·E-005·E-006 선례)
- Depends on: -

## A-18 (architect 확정 완료 2026-09-25 → ADR-43) 07 카드 열 폭 사후 확정
- Status: done (확정 완료) — **코드 변경 없음**
- Scope: architect 판단
- FR: ui-spec SCR-07, conventions §7 MUST(임의값 금지·와이어프레임 구성)
- 출처: `docs/reviews/T-022.md` [Minor] (와이어프레임 p.4 PDF 콘텐츠 스트림 복원 실측)
- 증상: 와이어프레임 07 카드 열 = 819px, 구현 `max-w-3xl` = 768px(−6.2%). 819px은 토큰도 Tailwind 스케일도 아니라 임의값을 쓸 수 없다. 구현 판단 자체는 합리적이나 §7 MUST가 "새 차이는 architect 확정"을 요구
- 확정 결과(ADR-43): **`max-w-3xl`(768px) 유지 확정.** 새 폭 토큰을 만들지 않는다(`docs/ui/design-tokens.md` 개정은 architect 권한 밖 — ADR-31과 같은 이유). 함께 검토한 미세 차이(카드 안 여백 18px vs ≈23px, 라벨 열 128px vs ≈140px, 페이지 좌여백 32px vs 40px)도 **현행 토큰 유지** — 앞의 둘은 design-tokens.md 확정 토큰이고 전 화면이 공유하므로 바꾸면 기준 PNG 01·02·03 대조가 깨진다
- 사용자에게 보이는 변화: **없음**(현행 구현 확정). 계약 변경 없음
- Depends on: -

## A-20 (architect 확정 완료 2026-09-27 → ADR-45) §8.1 재생 명령이 실행 불가 — E2E 포트 `4190`이 Node `fetch` bad port
- Status: done (확정 완료) — 설계 문서 정정 완료. 값 반영은 **T-024**(팀장이 `compose.e2e.yaml`·`CLAUDE.md`·`README.md`·하네스 상수를 고친다). **코드 로직 변경 0건**
- Scope: architect 판단 → Tools 설정값 반영
- FR: 없음(E2E 전용 포트는 확정 요구사항에 없는 설계 값). architecture §8.1·§8.2, conventions §8
- 출처: 팀장 직접 재현(2026-09-27, Node v24.9.0)
- 증상: §8.1 `hook 입력` 행의 `node tools/replay/replay.mjs --url http://127.0.0.1:4190/hooks/events …`가 **절대 성공할 수 없다**. `4190`은 WHATWG Fetch "bad port"(sieve)이고 Node 전역 `fetch`(undici)는 **연결 시도 없이** 즉시 거부한다(`fetch failed / cause: bad port`). 같은 시점에 `curl`은 204, Playwright Chromium은 `4190`을 정상 처리 → 원인은 Node 전송 계층 하나. **E2E-04·E2E-13 실행 불가**
- 확정 결과(ADR-45): **(a) E2E 공개 포트 `4190` → `4185`.** `replay.mjs`는 수정하지 않는다(T-023 리뷰 PASS 유지). (b) 재생 전용 전송 계층 추가는 **기각**(설계에 없는 하네스 구성요소가 늘고 다음 Node 도구에 같은 함정이 남는다). (c) `replay.mjs`를 `node:http`로 재작성도 **기각**(`fetchImpl` 주입 이음새와 단위 테스트를 다시 설계해야 하고, 원인과 무관한 코드를 고치게 된다). `4185`·`4191`·`4192`는 bad port 목록 밖이고 운영 `4180`·`4181`도 영향 없음
- 요구사항 의미 변경 여부: **없음.** `4190`은 `final_requirements_*.md`에 등장하지 않는 E2E 전용 설계 값이고, E2E-04·13·15가 검증하는 AC·E 목록은 그대로다. 계약 변경 없음(`api-spec.yaml`·`realtime-spec.md`는 `4180`·`4181`·`8080`만, ui-spec은 `<포트>` 자리값만 쓴다)
- 사용자에게 보이는 변화: **없음**(개발 머신에서만 뜨는 E2E 컨테이너의 호스트 공개 포트 하나)
- Depends on: -

## A-21 (architect 확정 요청) T-024 리뷰에서 나온 설계 판단 3건 — 미니맵 재측정 시점 · 캡처 뷰포트 문구 · 책상 pitch 토큰
- Status: todo — **T-024·T-FIX-10을 막지 않는다**(문서 기준 위반 0건으로 판정됨). 사용자가 정한 순서상 A-16 처리 시점에 함께 판단하면 좋다
- Scope: architect 판단 → 결정에 따라 Frontend·Tools 반영
- 출처: `docs/reviews/T-024.md` Minor 3·8 + 이연 Minor 실측 결과(T-015 m5·m1)
- 판단할 것
  1. **미니맵 뷰포트 재측정 시점을 명문화할지** (리뷰 Minor 3) — `ui-spec.md:215`는 계산식만 정하고 **언제 다시 재는지**를 정하지 않는다. 현재 `Minimap`의 effect 의존성은 `[scrollRef, registry.workflows, zoom]`이라 ① 검색·층 선택 필터로 `scrollHeight`가 바뀔 때 ② `live.lobby`가 늘어날 때는 테두리가 그대로다(리뷰어 확인). FR-006-AC6은 "미니맵이 동작한다"만, AC8은 필터 결과만 규정하므로 **현재 구현은 문서 위반이 아니다**. 명문화하면 `ResizeObserver(스크롤 영역 자식)` 하나가 세 경우를 모두 덮는다(의존성 나열보다 견고) — 단 `frontend/src`에 ResizeObserver 사용례가 0건이고 jsdom에 없어 **단위 테스트 고정 수단을 함께 정해야** 한다(T-FIX-10에서 그 이유로 채택하지 않았다)
     - 함께 판단: 미니맵 블록이 **필터 이전** `registry.workflows`를 그려 필터 중 화면의 층 수와 어긋나는 점(리뷰어 지적). 사용자에게 보이는 동작이므로 바꾸려면 팀장이 사용자 승인을 받는다
  2. **`conventions.md:137` 문구 정정** (리뷰 Minor 8) — "뷰포트 1440×(1140|1020|880)"은 실제와 어긋난다. `playwright.config.ts`는 뷰포트를 **1440×1024**로 고정하고(T-FIX-03 m4) 1140/1020/880은 **출력 PNG 크기**다. "뷰포트 1440×1024로 캡처해 1440×(1140|1020|880)로 저장한다"로 문구만 정정. 코드 변경 없음
  3. **책상 pitch가 기준 PNG와 다른 것을 받아들일지, 토큰을 바꿀지** (T-015 m5·m1 실측 완료) — 팀장·리뷰어 독립 실측치:
     | 항목 | 구현(캡처) | 기준 PNG | 차이 |
     |---|---|---|---|
     | 가로 pitch span-1(4열) | 74.84~75.0px | 86~87px | **−11px** |
     | 가로 pitch span-3(9열) | 118.0px | 123.0px | **−5px** |
     | 세로 pitch | 109px | 92px | **+17px** |
     - 원인 후보: `--spacing-card` 16px vs 기준 10px. 이 토큰은 **01·03과 공유**하므로 값 변경은 세 화면의 모양을 바꾼다 → **사용자에게 보이는 변화**라 architect가 (a) 현행 확정 (b) 토큰 변경 중 무엇이 맞는지 판단하고, (b)라면 팀장이 **사용자 승인**을 받은 뒤 반영한다(E-008 선례)
     - 참고: T-015는 이 차이를 알고도 PASS됐고(Minor 이연), 리뷰어는 "토큰 변경은 T-024 범위 밖이 맞다"고 동의했다
- 하지 말 것: `docs/requirements_*`·`final_requirements_*`·`docs/ui/` 수정. 코드 수정(결정만 한다)
- Depends on: -

## A-22 (architect 확정 완료 2026-09-28 → ADR-46) 사용자 요청 UI 개선 3건 — hover·focus 규칙 / 01 대표 카드 활동 줄 / 01 실시간 이벤트 표 높이
- Status: done (확정 완료) — 설계 문서 확정. **구현은 T-025**(Frontend + E2E 단언 갱신). 요구사항 변경 **0건**
- Scope: architect 판단 → Frontend·Tools 반영
- FR: FR-005-AC3·AC6·AC8(의미 변경 없음 — 새 AC 없음), FR-015-AC2, `docs/ui/ui-rules.md` 2·5·6·8, ui-spec §공통·SCR-01, conventions §7·§8
- 출처: 사용자 요청 4건 중 3건(팀장이 확정 문서와 대조해 분류. 4번 "워크플로우 삭제 조건을 모달로"는 FR-017-AC1과 충돌해 `/planner`로 보냈다 — A-22 대상 아님)
- 판단한 것과 확정 결과(ADR-46)
  1. **버튼·사이드 탭 hover** — 요청: "사이드 탭 포함 모든 버튼에 마우스 호버링할 때 색이 바뀌는 등의 이벤트". 확정 문서에 hover 규정이 0건이고 구현도 2곳뿐이었다(`FeaturedWorkflows.tsx:39`·`Floor.tsx:143`, 둘 다 `hover:bg-selected`). 핵심 제약은 `bg/selected`가 "선택된 사이드 탭" 색이라 hover에 같은 값을 쓰면 선택과 구분되지 않는 것.
     - **확정(ADR-46 A): 기존 토큰만으로 해결된다 — 새 토큰이 필요하지 않다.** hover 기본값 `bg/selected`, **선택 표시에 `bg/selected`를 쓰는 요소(사이드 탭·05-R 목록 행)만 hover `bg/soft`** → 밝기 순서가 기본(`chrome` 18,24,38) < hover(`soft` 23,31,46) < 선택(`selected` 29,39,56)으로 세 값 모두 구분된다(각 이동이 채널당 +5 이상). 상태 색 채움 variant(`primary`·`terminal`·`danger`)는 색 토큰을 교체하지 않고 `brightness-110` 한 단계. 텍스트 링크는 밑줄. 비활성·선택 항목·클릭 동작 없는 요소는 hover 없음. `:focus-visible`은 hover와 같은 표현 + 브라우저 기본 outline 유지(`outline-none` 금지). 색 전환만 `transition-colors duration-200`.
     - 기각: 전부 `bg/soft`로 통일(카드·`bg/soft` 표면에서 채널당 +1~2라 보이지 않는다) / hover 토큰 신설(ADR-31·ADR-43과 같은 이유로 권한 밖) / 채움 버튼 hover 없음(요청의 주 동작 버튼이 빠진다).
     - 기존 hover 2곳: **유지, 코드 변경 0건.** `design-tokens.md`의 `쓰는 곳` 열은 대표 용례이지 배타적 허용 목록이 아니라는 해석을 ui-spec §공통에 명문화했다.
  2. **01 대표 카드 `최근 활동 · <요약>`이 길다** — 요약 제거는 `final_requirements_function.md:242`·`ui-spec.md:177` 변경이라 `/planner` 대상. **확정(ADR-46 B): 요약 유지 + CSS 한 줄 clamp(`truncate` + `min-w-0`) + `title` 전체 표시.** 글자 수 상수 방식 기각 — 새 확정 값(N)이 필요하고, DOM 텍스트를 자르면 `e2e-04.spec.ts:534`·`featuredWorkflows.test.ts`의 기존 단언이 깨진다. **`title`에 넣는 값도 이미 마스킹된 문자열이어야 한다**(FR-015-AC2, `ui-rules.md:52`)를 ui-spec·conventions MUST로 명시했다.
  3. **01 실시간 이벤트 표 50줄** — 페이지네이션은 FR-005-AC6·범위 밖 목록과 어긋나 기각(팀장 반대 → 사용자 우회안 채택). **확정(ADR-46 C): 표를 `h-96`(384px, Tailwind 기본 스케일) 고정 높이 자체 스크롤 컨테이너에 넣고 `<thead>` sticky.** 50개 전부 DOM 유지 → AC6 유지, `최근 [N]개`의 N 불변. 새 높이 토큰·임의값 0건(ADR-43 선례). 접근성은 `tabIndex={0}` + `role="region"` + `aria-labelledby`(기존 제목) → 새 문구 0건.
     - 부수 효과 확정: 기준 PNG와의 차이는 **ui-spec SCR-01에 "기준 PNG와의 확정된 차이" 목록을 신설**해 처리(표 높이·보이는 행 수·문서 총 높이는 대조 대상 아님). **E2E-13 01 캡처는 `fullPage` + "문서 높이 ≥ 1140" 단언을 버리고 "캡처 직전 뷰포트를 1440×1140으로 바꿨다 되돌리는 뷰포트 clip"으로 바꾼다**(문서가 1140px보다 짧아질 수 있다). 이 변경은 **T-024 Minor 4(사이드바 하단 `수집 상태` 카드가 프레임 밖)를 해소하는 방향**이며, 표 클램프 후에도 01 콘텐츠 높이가 1140px를 넘으면 그대로 남으므로 T-025가 문서 높이를 실측해 보고한다. A-21 항목 2(캡처 뷰포트 문구 정정)도 같은 사실 정정이라 함께 반영했다.
- 사용자에게 보이는 변화: **있음**(항목별로 ADR-46에 적었다). 요약: hover·focus 피드백 신설, 대표 카드 활동 줄 한 줄 말줄임 + 툴팁, 01 이벤트 표가 약 10줄 고정 높이 + 내부 스크롤(01 화면이 400px 이상 짧아진다). **새 문구 0건 · 새 요소 0건 · 새 색·토큰 0건 · 계약 변경 없음**
- 요구사항 의미 변경 여부: **없음.** FR·AC·E 문장 어느 것도 hover·말줄임·표 높이를 규정하지 않고, 표시하는 데이터·개수·문구가 그대로다
- 하지 말 것: `docs/requirements_*`·`final_requirements_*`·`docs/ui/` 수정. `docs/ui/screens/*.png` 갱신(차이는 ui-spec 목록으로 처리)
- Depends on: -

## T-FIX-08 07의 04-5에서 `설정 열기` 미표시 (ADR-42)
- Status: done — **리뷰 PASS**(`docs/reviews/T-FIX-08.md`, Blocker 0·Major 0·Minor 2 → T-FIX-07)
- Scope: Frontend
- FR: FR-001-E1(의미 변경 없음 — 새 AC 없음), ui-rules 2
- AC: 없음(기존 AC 유지)
- Errors: FR-001-E1(표시 범위만 정정)
- Screens: SCR-04-5, SCR-07
- Backend: 없음
- Frontend: `components/ui/AgentsDirMissing.tsx`(표시 여부 prop 추가, 기본값 = 표시), `screens/settings/ProjectFolderCard.tsx`(07만 숨김 값 전달), `components/ui/AgentsDirMissing.test.tsx`, `screens/settings/SettingsScreen.test.tsx`
- 배경: A-17 / ADR-42. 07이 `설정 열기`의 도착지 자신이라 활성 버튼이 아무 일도 하지 않았다
- Done when:
  - 단위 `AgentsDirMissing.test [ADR-42] 기본값 → '설정 열기' 표시, 누르면 /settings로 이동`(01·02 동작 회귀 방지)
  - 단위 `AgentsDirMissing.test [ADR-42] 숨김 prop → '설정 열기'가 문서에 없고 '다시 읽기'는 남는다`
  - 단위 `SettingsScreen.test [FR-001-E1][ADR-42] agentsDirMissing → 04-5 표시, '설정 열기' 없음, '다시 읽기' 1개`
  - 단위 `HomeScreen.test`·`WorkflowsScreen.test`의 기존 `[FR-001-E1]`·`[FR-006-E1]` 테스트가 **그대로 통과**한다(01·02는 버튼 표시 변화 없음). 기존 테스트 삭제·skip·약화 0
  - 정적 단언 또는 리뷰 확인 — `components/ui/AgentsDirMissing.tsx`에 `useLocation`·`useMatch`·`window.location`·라우트 경로 비교가 없다(conventions §7 MUST)
  - `cd frontend && npm test` 통과 수가 줄지 않고 `npm run lint`·`npm run typecheck` 통과
- Depends on: T-022 (fix round 1 완료 후)

## T-FIX-09 02 `Claude 열기 · 기본 세션`을 첫 스냅샷 전 비활성으로 (ADR-44)
- Status: **done** — 리뷰 **PASS**(`docs/reviews/T-FIX-09.md`, Blocker·Major·Minor **0건**). 사용자 승인 E-008 반영 완료
- Scope: Frontend
- FR: FR-013-AC1·AC3·AC6(의미 변경 없음 — 새 AC 없음), `docs/ui/ui-rules.md` 2
- AC: 없음(기존 AC 유지)
- Errors: 없음(FR-013-E1~E4 동작 불변 — 호출이 일어나는 경로를 건드리지 않는다)
- Screens: SCR-02 (07은 표기 정정만이라 코드 변경 없음)
- Backend: 없음
- Frontend:
  - `screens/workflows/WorkflowsHeader.tsx` — `config === null`이면 `<Button disabled>`. `disabledReason`은 **넘기지 않는다**(ADR-44: 이유 줄 없음). `onClick`도 `config === null`일 때 넘기지 않아 `CopyButton`·`ClaudeOpenCard`와 같은 형태로 맞춘다. 라벨·variant(`secondary`)·`>_` 아이콘·배치·`HelperMissingDialog` 연결은 그대로. `command` 계산의 `config === null ? "" : …` 분기는 남겨도 되지만 도달하지 않는 값이므로 주석을 실제 동작(비활성)으로 고친다
  - `dialogs/helper-missing/useHelperOpen.ts` — 동작은 그대로 두고 파일 머리 주석의 "02 상단바 버튼만 그 전에도 보인다(ui-spec SCR-02 로딩 열 `활성`)"를 ADR-44 기준(로딩 중 비활성, 호출하는 쪽이 막는다)으로 고친다. `helperUrl === null` 조기 return은 **방어선으로 유지**한다(호출 경로가 하나 더 생겨도 잘못된 요청이 나가지 않게)
  - `screens/workflows/WorkflowsHeader.test.tsx` — 아래 Done when 테스트 추가
- 배경: A-19 / ADR-44. `TopBar`가 `AppShell`의 `ready` 게이트 밖이라(`components/common/AppShell.tsx:28`) 첫 스냅샷 전에도 이 버튼만 활성으로 보이는데, `useHelperOpen.open`이 `helperUrl === null`이면 조용히 return해 클릭이 어떤 눈에 보이는 변화도 없이 사라졌다(`useHelperOpen.ts:58`)
- Done when:
  - 단위 `WorkflowsHeader.test [ADR-44] 첫 스냅샷 전(snapshotStore 초기 상태) → 'Claude 열기 · 기본 세션' 버튼이 disabled이고 이유 줄 텍스트가 문서에 없다`
  - 단위 `WorkflowsHeader.test [ADR-44] 첫 스냅샷 전 클릭 시도 → 도우미 fetch 0회, HelperMissingDialog 없음, 에러 줄 없음`(비활성이라 호출이 시작되지 않음을 고정한다)
  - 단위 `WorkflowsHeader.test [ADR-44][FR-013-AC1] 스냅샷 수신 후 → 버튼 활성(secondary), 누르면 config.helperUrl + '/open'으로 {target:'default'} 1회`(기존 FR-013-AC6 테스트가 이 상태를 이미 덮으면 단언만 보강)
  - 단위 회귀 — T-021의 `[FR-013-AC6]`·`[FR-013-AC9]`·`[FR-013-E1]`·`[FR-013-E2]`·`[FR-013-E3]` 테스트가 **그대로 통과**한다(스냅샷 수신 후 동작 불변). 기존 테스트 삭제·skip·약화 0
  - 정적 단언 또는 리뷰 확인 — `screens/workflows/WorkflowsHeader.tsx`에 `disabledReason`이 없다(ADR-44: 이 지점은 ADR-35 이유 줄 목록에 넣지 않는다)
  - `cd frontend && npm test` 통과 수가 줄지 않고 `npm run lint`·`npm run typecheck` 통과
  - 화면 대조 — `docs/ui/screens/02-workflows.png`와의 대조 결과가 T-021과 같다(기준 PNG는 스냅샷 수신 후 화면이라 변화 없음)
- Depends on: T-021 (fix round 1 완료 후)
- 관련: 03(`screens/workflow-detail/Header.tsx`)·07(`screens/settings/ClaudeOpenCard.tsx`, `components/ui/CopyButton.tsx`)은 **이미 ADR-44 규칙을 충족해 코드 변경이 없다**(A-19 "03·07 일관성 확인" 참조). T-FIX-08과 파일이 겹치지 않는다

## T-FIX-10 02 미니맵 뷰포트 테두리가 줌 변경에 반응하지 않는다 (T-015 m2, T-024 E2E-12가 검출)
- Status: **done** — 리뷰 **PASS**(`docs/reviews/T-024.md` §6, Done when 5/5). `zoom` prop + effect 의존성 추가로 해소(계산식 무변경 — 줌이 스크롤 영역 **안쪽** 래퍼에 걸려 `scrollHeight`만 변하므로 ui-spec 식이 이미 옳았고 재측정 시점만 문제였다). 리뷰어 뮤테이션 M1·M2·M3으로 검출력 확인. 남은 사각은 Minor 2·3으로 후속
- Scope: Frontend
- FR: FR-006
- AC: FR-006-AC6
- Errors: -
- Screens: SCR-02
- 출처: T-024 ③c단계 `tests/e2e-12.spec.ts` `[FR-006-AC6][E2E-12][T-015 m2]` **FAIL**. T-015 리뷰 Round 2 Minor m2가 T-024로 이연된 항목이고, 이번에 실측으로 결함이 확정됐다
- 사실(팀장 확인):
  - `docs/ui-spec.md:215` MUST — 미니맵 "테두리 위치 = `scrollTop / scrollHeight`, 높이 = `clientHeight / scrollHeight`(**둘 다 zoom 배율이 적용된 값으로 통일**, 최소 4%)"
  - `frontend/src/screens/workflows/Minimap.tsx:34`는 props가 `{ workflows, scrollRef }`뿐이고 `useEffect` 의존성이 `[scrollRef, workflows]`다 → **`zoom`을 받지 않아** 줌 변경 시 `updateViewport()`가 돌지 않는다
  - E2E 실측: 층 스크롤 영역 `scrollHeight` 3351px → 5002px로 커졌는데 테두리 높이가 **18.7407% 그대로**(계산식대로면 **12.55%** = 628 / 5002)
  - 동작이 일관되지도 않다 — 스크롤을 내린 상태에서 줌 아웃하면 브라우저가 `scrollTop`을 clamp하며 scroll 이벤트가 발생해 **우연히** 갱신된다
- Done when:
  - 줌을 바꾸면 미니맵 테두리 위치·높이가 새 배율의 `scrollTop`·`clientHeight`·`scrollHeight`로 **다시 계산**된다(최소 4% 하한 유지)
  - `tests/e2e-12.spec.ts`의 `[FR-006-AC6][E2E-12][T-015 m2]`가 **통과**하고, 같은 파일의 스크롤 반응 테스트(현재 PASS)와 나머지 5개도 그대로 통과한다
  - **컴포넌트 단위 회귀 테스트 추가** — 줌 변경 시 재계산을 고정한다(E2E만으로 두지 않는다. 이 결함이 단위 테스트를 통과한 채 새어나온 것이 이번 사건이다)
  - `npm test`·`lint`·`typecheck`·`build` 통과, 기존 테스트 **삭제·skip·기대값 약화 0건**, 통과 수 감소 없음
  - 01·03은 이 변경과 무관해야 한다(`Minimap`은 02 전용). 02 나머지 요소 회귀 없음
- 하지 않을 것: `--spacing-card` 등 design token 값 변경(**책상 pitch 문제는 별건**이고 architect 판단 영역이다), ui-spec 수정(계산식은 이미 확정돼 있다)
- Depends on: -

## T-FIX-07 T-FIX-05·T-FIX-06 리뷰 Minor 묶음
- Status: todo
- Scope: Backend + Frontend
- 출처: `docs/reviews/T-FIX-05_T-FIX-06.md` [Minor] 3건
- Backend:
  - `api/ApiException.java:23-25` `forbiddenOrigin()` **팩터리 삭제**(호출처 0건인 죽은 코드인데 옛 문구 `허용되지 않은 출처입니다`를 들고 있어, 쓰이는 순간 conventions §4 MUST를 깨는 403이 나간다). 문구는 `OriginFilter` 상수 한 곳에만 둔다. `ApiError.code` enum은 그대로
- Frontend:
  - `api/client.test.ts:62` 픽스처 message를 확정 문구(`허용되지 않은 출처입니다 · http://127.0.0.1:4180 주소로 다시 접속하세요`)로 교체. 단언 변경 불필요
  - `test/staticRules.test.ts:88-95` 단언 #2의 테스트 파일 제외가 남기는 사각을 주석에 명시하거나 검사 범위를 좁힌다(실질 위험 없음 — 테스트 파일은 번들에 미포함)
  - (제안) 단언 #1은 **순서만** 보므로 가드 앞에 새 API 호출을 넣는 변경을 못 잡는다 → "가드 이전 텍스트에 호출 없음" 단언 추가 검토
- Done when:
  - `forbiddenOrigin()` 정의가 사라지고 `grep -rn "forbiddenOrigin" backend/src`에 `OriginFilter`의 필드·테스트만 남는다. `./gradlew test` 통과 수 감소 없음
  - 프론트 픽스처 교체 후 `npm test` 통과 수 감소 없음
  - 기존 테스트 삭제·skip·약화 0
- 추가(T-FIX-08 리뷰 Minor 2건, `docs/reviews/T-FIX-08.md`):
  - `HomeScreen.test.tsx`·`WorkflowsScreen.test.tsx`에 `expect(screen.getByRole("button", { name: "설정 열기" })).toBeInTheDocument();` 1줄씩 추가 — 리뷰어 probe M11로 **호출처에 `showOpenSettings={false}`를 주입해도 330개가 전부 통과**함이 확인됐다(두 테스트가 04-5 제목만 단언). 화면 층에서 ADR-42 호출처 회귀를 고정한다
  - `AgentsDirMissing.test.tsx:161-164` 정적 단언 패턴 보강 — probe M5(역순 비교 `"/settings" === x`)·M7(`useHref(".").includes("settings")`)이 안 걸린다. `useHref|useNavigationType` 추가 + 경로 비교 정규식을 **좌우 양방향**으로. `showOpenSettings && !useHref(...)`처럼 prop과 AND 결합하면 현재는 정적·동작 단언을 모두 통과한다
  - (제안) ADR-42 정적 단언을 `test/staticRules.test.ts`로 모으고, 대응 단언이 없는 **ADR-30**(`TopBar`가 라우트를 읽지 않는다)도 같은 패턴으로 커버
- 추가(T-FIX-09 리뷰 Suggestion 1건, `docs/reviews/T-FIX-09.md`):
  - `WorkflowsHeader.test.tsx`가 활성·비활성 판정에 `border-border-strong`/`border-dashed` **클래스명 문자열을 직접 단언**한다. 근거는 타당하나(`Button.tsx:29·37`) `Button` 내부 클래스명에 테스트가 결합돼 향후 리팩터링 시 깨진다. 상태는 `toBeEnabled()`/`toBeDisabled()`로 두고 시각 표현 단언은 분리할지 검토
- 추가(T-023 리뷰 Suggestion 2건, `docs/reviews/T-023.md`):
  - `tools/replay/test/replay.test.mjs`의 `runCli`(spawn 기반)에 **명시적 타임아웃** 추가 — 현재 로컬 스텁이 즉시 응답해 위험은 낮지만, 스텁이 멈추면 테스트가 무한 대기한다. 개발자가 최초 구현에서 `spawnSync` + 같은 프로세스 스텁 조합으로 **실제 교착을 겪고** 비동기 `spawn`으로 바꾼 이력이 있어 안전망이 필요하다
  - (architect 선택) `api-spec.yaml`의 `HookPayload.permission_mode` 설명에 "현재 backend는 이 필드를 저장·사용하지 않음" 한 줄 — `HookPayload.java`가 record에 포함하지 않아 무시하는데 스키마엔 있다. `required`가 아니고 소비하는 FR이 없어 결함은 아니다
- 추가(T-024 ②단계에서 발견, 팀장 확인 완료 — D-051):
  - `frontend/src/dialogs/import-agents/ImportDialog.tsx:149` — `대상 워크플로우` 필드가 `?workflow`가 있어 값이 `<span id={targetId}>`(고정 텍스트)일 때도 `Field`에 `htmlFor={targetId}`를 넘긴다. `<span>`은 labelable 요소가 아니라 `<label for>`가 무효가 되고 `getByLabel("대상 워크플로우")`로 잡히지 않는다. **같은 문제를 `AgentFormFields.tsx:111`이 이미 `htmlFor={workflowPickerMissing ? undefined : ids.workflow}`로 고쳐 두었고 주석에 `T-019 리뷰 Minor 2`라고 적혀 있다** — 그 선례와 같은 형태로 맞춘다(팀장이 두 파일 실물 대조 확인). ui-spec 위반은 아니고 화면 표시도 그대로라 T-024를 막지 않는다
- 추가(T-024 ③a에서 발견, 팀장이 데이터로 검증 — D-053):
  - `tools/replay/scenarios/README.md` 21·23줄의 기대 라벨 `[세션 1]`·`[세션 2]`는 **그 줄만 단독 재생할 때**만 맞다. 28줄을 순서대로 누적 재생하면 15~20줄 `SubagentStart`의 **부모 세션 4개(`sess-ac3-*`, `SessionStart` 없음 → FR-004-E1로 생성, `agent_type` 없음 → FR-003-AC5로 로비)**가 로비 1~4를 차지해 21·23줄은 `[세션 5]`·`[세션 6]`이고 25줄 정의 없는 서브의 `parentLabel`도 `[세션 5]`다. **제품 동작이 옳고 표가 부정확**하므로 README 표에 그 사실을 적는다(코드·테스트 변경 없음). 팀장 확인 근거: 11줄 `session_id=sess-dev-lead`(SessionStart 있음) vs 15줄 `session_id=sess-ac3-member-a`(없음), 양쪽 모두 `agent_type`은 서브에이전트 것
  - `tools/fixtures/project-configured`·`project-showcase`의 `.claude/settings.json`이 hook url `http://127.0.0.1:4180/hooks/events`와 placeholder 토큰을 하드코딩해 **E2E(실제 포트·실제 수집 토큰)에서는 `hookConfigured=false`가 된다** — fixture 설명(`hook 설정 있음`)과 어긋난다. 값 자체는 호스트 포트·토큰에 의존할 수 없어 어떤 값도 맞출 수 없으므로(D-052) **fixture 파일은 그대로 두고** 그 성질을 `tools/replay/scenarios/README.md`(또는 fixture 설명)에 적는다: "E2E는 마운트된 임시 사본의 `settings.json`을 실제 `collectUrl`·수집 토큰으로 다시 쓴 뒤 `hook 설정됨`을 검증한다"
- 추가(T-024 + T-FIX-10 리뷰 Minor, `docs/reviews/T-024.md` — 팀장 배정):
  - **[Minor 1] Tools** `tools/e2e/tests/isolation.spec.ts:14-23` `HARNESS_FILES`에 `scripts/run-e2e.sh`·`scripts/check-port.sh`·`tests/ui-helpers.ts` 추가(또는 `*.spec.ts`·`node_modules` 제외 글롭으로 전환). 특히 `ui-helpers.ts`는 **fixture 경로를 계산하고 파일을 쓰는** 파일인데 주석의 제외 사유("spec은 금지 패턴을 단언 데이터로 갖는다")가 적용되지 않는다. 리뷰어가 세 파일에 금지 패턴을 직접 돌려 **실제 위반 0건**은 확인했다(사각만 남은 상태)
  - **[Minor 2] Frontend** `WorkflowsScreen.test.tsx`에 미니맵 `zoom` **호출처 배선** 단언 1건 추가 — 리뷰어 뮤테이션 M4(`zoom={zoom}` → `zoom={100}`)가 단위 43/43을 **전부 통과**시켰다. T-FIX-10 Done when이 "E2E만으로 두지 않는다"였고 실제 결함이 **prop 배선 누락**이었으므로 같은 축을 고정해야 한다. 위 ADR-42 호출처 회귀(probe M11)와 **같은 계열이라 함께 처리**한다
  - **[Minor 4] Tools** `e2e-13.spec.ts` 01 캡처에 "fullPage라 사이드바 하단 `수집 상태` 카드가 프레임 밖"임을 주석·annotation으로 명시(다음 리뷰어가 요소 누락으로 오판하지 않게). 원인은 `AppShell`의 `min-h-screen` + `Sidebar`의 `justify-between`. 두 요소는 이미 같은 테스트가 단언하므로 **구현 누락이 아니다**
  - **[Minor 5] Tools** `e2e-13.spec.ts` 03 테스트에 `동작 매핑` 범례와 패널 각주 2줄 `toBeVisible()` 3줄 추가 — 880px 캡처 프레임 밖이라도 DOM 단언은 가능하다(현재 `grep` 0건, 프론트 단위 테스트만 덮는다)
  - **[Minor 6] Tools** `e2e-13.spec.ts:592-679` 번짐 실측에 **상태 줄**(`DeskSprite.tsx:66` `작업 중 · 부모 <라벨>`) rect를 추가 — 현재는 이름 칩만 재는데 같은 책상에서 **더 넓은 요소는 상태 줄**이고 span-1 4열(74.84px)에서 넘칠 개연성이 크다. 겹침이 실제로 나오면 그때 별건 태스크로 판단(`docs/ui/README.md` "요소 가림은 결함")
  - (Suggestion) `frontend/src/lib/origin.test.ts:12` 주석의 `E2E 4190` → "임의 포트"로 표현 정정(ADR-45로 E2E 포트는 4185. 테스트 데이터 자체는 임의 포트라 그대로도 옳다) / `e2e-08` 첫 테스트가 택한 차단 경로(403 vs 브라우저 CORS)를 배치 요약에 한 줄 고정 출력
- Depends on: T-FIX-05, T-FIX-06

## T-FIX-04 T-020 리뷰 Minor 묶음 (도우미 견고성 · 설치 스크립트 안전장치)
- Status: todo
- Scope: Helper
- FR: FR-013(견고성 보완 — 새 AC 없음)
- AC: 없음(기존 AC 유지)
- Errors: 없음
- Screens: -
- Backend: 없음
- Helper: `jaystudio-helper.mjs`, `uninstall.sh`, `install.sh`, `test/*.test.mjs`, `README.md`/`CLAUDE.md`(설치 절차)
- 배경: T-020 **PASS**(Critical·Major 0) 리뷰의 Minor 5건. 기능 결함이 아니라 견고성·운용 안전장치라 T-020을 막지 않았다. 리뷰: `docs/reviews/T-020.md`
- Done when:
  - 본문 4096B 초과 시 **소켓 리셋이 아니라 400**을 돌려준다(`jaystudio-helper.mjs:230-246`). 단위 `[FR-013-E3] 본문 초과 → 400`
  - 기존 토큰 파일을 재사용할 때 **mode가 600이 아니면 거부하거나 600으로 고친다**(`:157-164`). 단위 `기존 토큰 mode 644 → 기동 실패 또는 600 복구`
  - `uninstall.sh --label` 값을 **검증**한다(`uninstall.sh:26,33,47`) — 현재 미검증이라 `rm -f` 경로가 조작될 수 있다. 단위 `install.test [보안] 잘못된 label → 아무것도 지우지 않고 실패`
  - `install.sh`가 `launchctl bootstrap` 후 **기동 성공을 확인**한다(`install.sh:112-118`) — 현재는 잘못된 인자여도 조용히 재시작 루프에 빠진다
  - **도우미 설치 절차를 `README.md`(또는 `Jay_Studio/CLAUDE.md`)에 적는다** — 현재 어디에도 없어 사람이 H-3을 수행할 수 없다
- Depends on: T-020

## T-021 터미널 열기 프론트 연동 (02 · 03 · 07)
- Status: **done** — Round 1 리뷰(`docs/reviews/T-021.md`) Done when **8/8 충족**, Blocker 0. 유일한 Major(02 로딩 중 `Claude 열기` 무동작)는 A-19 → **ADR-44 확정 → T-FIX-09로 분리**. 리뷰어가 "이 항목만 분리하면 나머지 T-021 산출물은 그대로 진행 가능"이라고 명시했고, 팀장이 담당 배정 권한으로 분리 처리(T-022→A-17→T-FIX-08 선례와 동일)
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
- 관련: A-19/ADR-44(02 `Claude 열기`의 로딩 구간 비활성)는 **T-FIX-09로 분리**한다 — 사용자 승인 판단(A-19)이 T-021 완료를 막지 않게 하고, 03·07은 이미 규칙을 충족해 이 태스크의 코드가 바뀌지 않는다. 07 `테스트로 열기`·`명령 복사`는 ui-spec `로딩` 열 표기 정정만이라 코드 변경이 없다(A-18/ADR-43과 같은 형태)

## T-022 07 설정 화면
- Status: done — Round 2 PASS(`docs/reviews/T-022.md`)
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
  - ADR-33 예외 — `팀장으로 열기` 행은 `settings.leadSessionCommandTemplate` 값을 가공 없이 표시한다. 값에 들어 있는 `<팀장 name>`(FR-013-AC2 확정 문구)을 프론트가 지우거나 치환하지 않는다. 단위 `[FR-013-AC5][ADR-33] 템플릿 값 그대로 표시`
  - ADR-43(A-18) — 카드 열 폭 `max-w-3xl`(768px), 카드 안 여백 `--spacing-card-lg`, 페이지 좌여백 `--spacing-page-x`, 라벨 열 `w-32`는 **확정된 차이**다(ui-spec SCR-07 "와이어프레임 p.4와의 확정된 차이"). 현행 구현 그대로이며 **이 태스크에서 코드 변경 없음**
- Depends on: T-013, T-012
- 관련: A-17/ADR-42(07의 04-5 `설정 열기` 미표시)는 **T-FIX-08로 분리**한다 — fix round 1이 `screens/settings/CollectCard.tsx`·`SettingsScreen.test.tsx`를 동시에 고치는 중이라 같은 파일을 두 작업이 건드리지 않게 하고, 사용자 승인 판단(A-17)이 T-022 완료를 막지 않게 한다. A-18/ADR-43은 확정만이라 이 태스크 안에서 끝난다

## T-023 이벤트 재생 도구 · fixture 세트
- Status: **done** — 리뷰 **PASS**(`docs/reviews/T-023.md`, Blocker 0 · Major 0 · Minor 1). Minor(위 `project-basic` 서술)는 팀장이 이 줄에서 정정 완료
- Scope: Tools
- FR: FR-003, FR-004
- AC: FR-003-AC9
- Errors: -
- Screens: -
- Tools: `tools/replay/replay.mjs`(`--url`, `--token-file`, `--delay-ms`, JSONL 순서 POST, 실제 hook 입력 필드), `scenarios/`: `states.jsonl`(FR-004-AC2 13행 + AC3 + AskUserQuestion + 로비 2세션 + 정의 없는 서브 + 정의 있는 서브 + 워크플로우 밖 + 마스킹 대상 + 순서 어긋남), `showcase.jsonl`(E2E-13 스크린샷용, 01·02·03 PNG와 유사한 상태 구성), `fixtures/`: `project-basic`(**실물: 에이전트 2·스킬 1**, 워크플로우 0, settings.json 없음 — T-001 scaffolder 산출물. 개수는 예시였고 Done when·T-024 어느 쪽도 개수에 의존하지 않아 실물을 기준으로 정정했다, T-023 리뷰 Minor), `project-configured`(워크플로우 2, hook 설정 있음), `project-empty`, `project-no-agents-dir`, `project-format-errors`(5종 오류 + 깨진 참조 + 구성 파일 JSON 오류 + 중복 소속), `project-large`(에이전트 100·워크플로우 30·인원 7 이상 층), `project-showcase`
- Done when:
  - FR-003-AC9 — 단위 `replay.test [FR-003-AC9] 시나리오의 hook_event_name이 12종 안에만 있음`, `각 이벤트에 공통 필드 session_id·cwd·hook_event_name·permission_mode 존재`
  - 재생 도구 — 단위 `replay.test 순서대로 POST, 헤더 Content-Type·토큰, 비 2xx 시 exit 1`
  - fixture — 단위 `fixtures.test 각 fixture가 architecture §6 형식을 만족(정상 파일 파싱 가능, 형식 오류 fixture는 의도한 오류만)`
- Depends on: -

## T-024 E2E 통합 검증 (실제 컨테이너 + fixture + 재생 + dry-run 도우미)
- Status: **done** — 리뷰 **PASS**(`docs/reviews/T-024.md`, Blocker 0 · Major 0 · Minor 8 · Suggestion 2). `./scripts/run-e2e.sh` **9배치 99개 전부 통과**(E2E-01~15 + 격리), 캡처 4장 기준 이미지와 픽셀 크기 일치. 3단계로 나눠 진행했다 — ① 하네스(globalSetup·도우미 dry-run·4192 Origin 서버·E2E-08·E2E-14·격리) ② E2E-01·02·03·06·07·10 ③ E2E-04·05·09·11·12·13·15. 리뷰 Minor 8건은 아래 배정대로 후속 처리(T-024를 막지 않음)
- Scope: Tools
- FR: 전체
- AC: FR-001-AC3, FR-004-AC2, FR-004-AC6, FR-016-AC1, FR-016-AC4, FR-003-AC1, FR-003-AC2
- Errors: -
- Screens: SCR-01 ~ SCR-07 전체
- Tools: `tools/e2e/playwright.config.ts`(webServer 없음, globalSetup이 fixture 복사 → compose e2e up → dry-run 도우미 기동 → 대기), `compose.e2e.yaml`(공개 포트 `127.0.0.1:4185:4180`, `JAYSTUDIO_PUBLIC_PORT=4185`, `JAYSTUDIO_ALLOWED_ORIGINS=http://127.0.0.1:4185` — **`4190`은 쓰지 않는다**, ADR-45), `tests/e2e-01…e2e-13.spec.ts` + `e2e-15.spec.ts`(architecture §8.2), `scripts/check-port.sh`(E2E-14), 1440 폭 스크린샷 저장, 다른 Origin용 정적 페이지 서버(4192), dry-run 도우미(4191)
- Done when:
  - E2E-01 ~ E2E-13 — 각 spec 통과(테스트 제목에 §8.2의 검증 ID 나열)
  - E2E-14 — `check-port.sh` 출력 `127.0.0.1:4185/tcp` 확인 (ADR-45로 `4190` → `4185`)
  - E2E-15 (ADR-41) — `http://localhost:4185/workflows?x=1`로 진입 → 주소가 `http://127.0.0.1:4185/workflows?x=1`로 바뀌고, 이어지는 워크플로우 추가(POST)가 403 없이 성공한다. `page.on('request')`로 API 요청의 `Origin`이 `http://127.0.0.1:4185` 하나뿐임을 확인. **선행 T-FIX-06**
  - FR-001-AC3 — E2E-07 `파일 변경 → 02 반영 2초 이내(6가지 변경)`
  - FR-004-AC2·AC6 — E2E-04 `states.jsonl 재생 → 02·03 상태가 표대로, 각 단계 2초 이내`
  - FR-007-E1 — E2E-01 `이벤트 0건으로 03 진입 → 04-4 배너 + 캐릭터 모두 대기색` / E2E-04 후반 `running 상태에서 fixture settings.json의 hook 제거 → 03 배너 + 캐릭터·패널 모두 '대기', 02 책상은 '작업 중' 유지 → hook 복구 → 03 실제 상태 복귀`
  - FR-016-AC1·AC4 — E2E-05
  - FR-003-AC1·AC2 — E2E-08 + E2E-14
  - DoD "다른 Origin 차단" — E2E-08 `4192 페이지에서 4185로 POST → 실패(403), EventSource → error, curl Origin 없음 → 403`
  - DoD "화면 대조" — E2E-13 산출물 3장이 `tools/e2e/screenshots/`에 있고 리뷰어가 `docs/ui/screens/*.png`와 대조해 요소 누락·배치 차이 없음
  - 격리 — `globalSetup`이 실제 `JayStudio/.claude`·`.jaystudio` 경로를 참조하지 않음(경로 문자열 검사 테스트)
- 추가(앞선 태스크에서 T-024로 이연된 Minor — 팀장이 `progress.md`에서 옮겨 적음):
  - T-015 m5·m1 **책상 pitch 실측** — 02 캡처에서 가로 pitch가 기준 PNG 86px 대비 75px, 세로도 차이. 원인은 `--spacing-card` 16px vs 기준 10px로 **01·03이 공유하는 토큰**이다. E2E-13 캡처로 실측치를 기록하되 **토큰 값 변경은 하지 않는다**(architect 판단 영역). 실측 결과만 리뷰 보고에 남긴다
  - T-015 m6 **13자 이름 열 번짐** — E2E-13 `project-showcase` 캡처에서 긴 이름이 인접 열로 넘치는지 확인하고 실측 기록
  - T-015 m2 **미니맵 줌 반응** — E2E-12에서 줌 변경 시 미니맵 뷰포트 사각형이 따라 움직이는지 검증
  - D-032 **04-4 변형 캐처** — `03-workflow-detail-collector-down.png`(hook 미설정 상태의 03)을 E2E-13 공식 캡처에 포함해 갱신
  - T-FIX-03 m4 **캡처 뷰포트 통일** — `playwright.config.ts` viewport를 기준 캡처와 같은 **1440×1024**로 두고 E2E-13 산출물도 같은 뷰포트로 캡처한다(과거 1280×720 혼용 제거)
- 정정(A-20 / **ADR-45**, 2026-09-27): **E2E 공개 포트 `4190` → `4185`.** `4190`은 WHATWG Fetch bad port(sieve)라 Node 전역 `fetch`를 쓰는 `tools/replay/replay.mjs`가 연결 시도조차 못 해 **E2E-04·E2E-13(재생 시나리오)이 실행 불가**였다. `compose.e2e.yaml`(`ports`·`JAYSTUDIO_PUBLIC_PORT`·`JAYSTUDIO_ALLOWED_ORIGINS`)·하네스 상수(`playwright.config.ts`·`lib/e2e-state.ts`·`tests/e2e-14.spec.ts`)·`CLAUDE.md`·`README.md`의 포트를 `4185`로 맞춘 뒤 3단계를 이어간다. `4191`(dry-run 도우미)·`4192`(다른 Origin 서버)는 bad port가 아니므로 그대로. `replay.mjs`는 **수정하지 않는다**(T-023 리뷰 PASS 유지). 운영 포트 `4180`·`4181`, FR 의미, 계약은 변화 없음
- Depends on: T-014, T-015, T-016, T-017, T-018, T-019, T-021, T-022, T-023, T-FIX-06

## T-025 UI 개선 3건 — hover·focus 표현 / 01 대표 카드 활동 줄 clamp / 01 실시간 이벤트 표 고정 높이 (A-22, ADR-46)
- Status: todo
- Scope: Frontend, Tools(E2E-13 캡처 방식·단언 갱신만)
- FR: FR-005, FR-015 (**의미 변경 없음 — 새 AC·E 없음**), `docs/ui/ui-rules.md` 2·5·6·8
- AC: 없음(기존 AC 유지. 회귀로 지켜야 하는 것: FR-005-AC3, FR-005-AC6, FR-005-AC8, FR-006-AC4, FR-015-AC2)
- Errors: 없음
- Screens: 공통(hover·focus 규칙), SCR-01, SCR-02, SCR-03, SCR-04-7, SCR-05-R, SCR-06, SCR-07 (hover는 공용 컴포넌트를 쓰는 전 화면에 걸린다)
- Backend: 없음
- Frontend
  - **항목 1 (ADR-46 A, ui-spec §공통 "마우스 hover·키보드 `:focus-visible` 표현")** — 공용 컴포넌트에서만 구현한다: `components/ui/Button.tsx`(`secondary`·`add` → `hover:bg-selected focus-visible:bg-selected`, `primary`·`terminal`·`danger` → `hover:brightness-110 focus-visible:brightness-110`, **비활성일 때는 hover·focus 클래스를 붙이지 않는다**), `components/common/Sidebar.tsx`(비선택 탭 → `hover:bg-soft hover:text-text` + 같은 `focus-visible:`, 선택 탭은 변화 없음), `components/ui/Select.tsx`·`SearchInput.tsx`·`TextInput.tsx`·`TextArea.tsx`(`hover:bg-selected`). 화면 전용 클릭 영역만 그 화면에 둔다: `screens/home/FeaturedWorkflows.tsx:39`(현행 `hover:bg-selected` **유지**), `screens/workflows/Floor.tsx:143`(현행 유지), `screens/workflow-detail/Office.tsx` 비선택 칸, `dialogs/import-agents/ImportDialog.tsx` 비선택 목록 행. 텍스트 링크에는 `hover:underline`. 색 전환은 `transition-colors duration-200`만(이미 `Button`에 있다). `outline-none`을 쓰지 않는다
  - **항목 2 (ADR-46 B, ui-spec SCR-01 "대표 카드 활동 줄")** — `screens/home/FeaturedWorkflows.tsx` 활동 줄에 `truncate` + 부모 flex 항목 `min-w-0` + `title={활동 줄 문자열}`. `lib/text.ts`의 `recentActivityLabel`·`lastActivityLabel`·`NO_ACTIVITY_TEXT`는 **바꾸지 않는다**(같은 문자열을 화면과 `title`에 함께 쓴다 = 이미 마스킹된 값). 글자 수 상수·`ellipsis.ts` 사용 금지
  - **항목 3 (ADR-46 C, ui-spec SCR-01 "실시간 이벤트 표 영역")** — `screens/home/EventsTable.tsx`: `<table>`을 `h-96 overflow-y-auto` 컨테이너로 감싸고 `tabIndex={0}` + `role="region"` + `aria-labelledby`(카드 제목 `실시간 이벤트`에 `id` 부여), `<thead>`에 `sticky top-0 bg-card`. 문구·열·행 렌더 로직·`recentEventsSubtitle(N)`은 그대로
- Tools: `tools/e2e/tests/e2e-13.spec.ts` `captureFrame`을 **뷰포트 clip 한 가지 방식**으로 바꾼다 — `fullPage`·`needsFullPage`·"문서 높이 ≥ 프레임 높이" 단언 제거, 기준 프레임이 기본 뷰포트(1024)보다 높은 화면(01)만 캡처 직전 `page.setViewportSize({width:1440, height:frame.height})` 후 원래 뷰포트로 되돌린다. 02·03은 동작 변화 없음. 실측 annotation에 **문서 높이와 사이드바 하단 `수집 상태` 카드가 프레임 안인지**를 남긴다(A-22 / ADR-46 C, T-024 Minor 4 판정 근거)
- Done when
  - 항목 1 값 규칙 — 단위 `Button.test [ADR-46 A] secondary·add → hover:bg-selected, primary·terminal·danger → hover:brightness-110, 다섯 variant 모두 focus-visible에 같은 표현`, `[ADR-46 A] disabled·disabledReason → hover·focus 클래스 없음`
  - 항목 1 사이드 탭 구분 — 단위 `Sidebar.test [ADR-46 A] 비선택 탭 → hover:bg-soft + hover:text-text, 선택 탭 → hover 클래스 없고 bg-selected + border-running 유지`(선택과 hover가 다른 값임을 고정한다 — A-22 핵심 제약)
  - 항목 1 입력·드롭다운 — 단위 `Select.test`·`SearchInput.test`·`TextInput.test`·`TextArea.test` 중 해당 컴포넌트에 `[ADR-46 A] hover:bg-selected` 단언(테스트 파일이 없는 컴포넌트는 새로 만든다)
  - 항목 1 정적 단언 — 리뷰어 코드 확인 또는 정적 테스트: ① `frontend/src`에 `outline-none`·`focus:outline-none` 0건 ② 임의값 hover(`hover:bg-[`) 0건 ③ `hover:`·`focus-visible:` 클래스가 있는 파일이 **공용 컴포넌트 6개 + 화면 전용 4곳**뿐(conventions §7 MUST "공용 컴포넌트에서만")
  - 항목 2 — 단위 `FeaturedWorkflows.test [ADR-46 B] 활동 줄에 truncate + title, title 문자열 = 화면 텍스트와 동일`, `[ADR-46 B][FR-015-AC2] summary에 ••••••••가 있으면 title에도 ••••••••가 들어가고 마스킹 전 원문 문자열은 DOM·title 어디에도 없다`
  - 항목 3 — 단위 `EventsTable.test [ADR-46 C] 표 컨테이너에 h-96·overflow-y-auto·tabIndex=0·role=region·aria-labelledby(카드 제목 id), thead에 sticky`, `[ADR-46 C][FR-005-AC6] 이벤트 50개 fixture → 행 50개가 모두 렌더되고 최근 50개 · 전체 로그 화면 없음 문구 유지, 페이지네이션 요소 0개`
  - **회귀 — 항목 1(전 화면 공용 컴포넌트 변경, T-013~T-022)**: `cd frontend && npm test` 통과 수가 T-024 시점(59 files / 359 tests)보다 **줄지 않는다**. 기존 테스트 삭제·skip·약화 0. 특히 className을 단언하는 기존 테스트(`Button.test`의 variant·비활성 표현 = ADR-29, `Sidebar`·`AppShell.test`의 선택 탭 표현, `Floor.test`·`FeaturedWorkflows.test`의 카드 테두리 = ADR-24)가 **그대로** 통과해야 한다
  - **회귀 — 항목 2·3(01 화면 = T-014, E2E-04·E2E-13)**: `e2e-04.spec.ts:534`(`최근 활동 · 도구 실행 · Bash · <마스킹된 summary>` `toContainText`)와 `최근 [N]개 · 전체 로그 화면 없음` 단언 3곳(`e2e-01.spec.ts:113` N=0, `e2e-04.spec.ts:521`, `e2e-13.spec.ts:319`)은 **수정하지 않고 그대로 통과한다**(clamp는 DOM 텍스트를 보존하고 N도 변하지 않는다). `e2e-13.spec.ts:322`의 표 안 행 단언(`export TOKEN=••••••••`)도 `toBeVisible()` 기준이라 스크롤로 가려져도 통과한다 — 이 두 사실이 깨지면 구현이 규격과 다르다는 신호다
  - **갱신이 필요한 테스트(전수)**: `tools/e2e/tests/e2e-13.spec.ts`의 `captureFrame` 하나뿐이다(캡처 방식·단언). 그 밖의 E2E spec·백엔드 테스트는 수정 대상이 아니다
  - E2E-13 재실행 — `cd tools/e2e && ./scripts/run-e2e.sh`(또는 E2E-13 배치 단독)에서 캡처 4장이 기준과 같은 픽셀 크기(`01-home` 1440×1140 · `02-workflows` 1440×1020 · `03-workflow-detail` 1440×880 · `03-workflow-detail-collector-down` 1440×880)로 남고 9배치 전부 통과
  - 화면 대조 — 리뷰어가 `docs/ui/screens/01-home.png`와 새 `01-home.png`를 대조해 **ui-spec SCR-01 "기준 PNG와의 확정된 차이" 2항(표 높이·행 수·문서 높이 / 활동 줄 말줄임) 밖의 요소 누락·추가·순서 차이가 없음**을 확인한다. 02·03 대조 결과는 T-024와 같아야 한다(hover·focus는 정적 캡처에 나타나지 않는다)
  - T-024 Minor 4 판정 — E2E-13 annotation에 남은 01 문서 높이 실측값과 사이드바 하단 `수집 상태` 카드의 프레임 내부 여부를 리뷰 보고에 적는다(1140px 초과면 Minor 4가 남았다는 뜻이므로 그대로 보고한다)
  - hover·focus 사람 확인 — 리뷰어가 실제 브라우저에서 사이드 탭(비선택/선택), 다섯 variant 버튼, 비활성 버튼, 드롭다운·입력창, 01 대표 카드, 02 책상 칸, 03 오피스 칸에 마우스를 올리고 Tab으로 이동해 ① 비선택 탭 hover가 선택 탭과 구분되는지 ② 비활성 버튼에 변화가 없는지 ③ 새 문구·새 색이 없는지를 확인한다
  - `cd frontend && npm run lint && npm run typecheck` 통과
- Depends on: T-024

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
| FR-001 | AC1 T-003(+H-1) · AC2 T-003(+H-1) · AC3 T-004, T-024 · AC4 T-004, T-022 · AC5 T-022 · AC6 T-008 · E1 T-003, T-014, T-015, T-022, T-FIX-08 · E2 T-003, T-008, T-015, T-022 · E3 T-003 |
| FR-002 | AC1 T-003 · AC2 T-003, T-015 · AC3 T-010, T-019 · AC4 T-003 · AC5 T-003 · AC6 T-003 |
| FR-003 | AC1 T-002, T-024(+H-4) · AC2 T-002, T-024 · AC3 T-005 · AC4 T-006 · AC5 T-006, T-015 · AC6 T-006, T-013 · AC7 T-005 · AC8 T-012(+H-2, H-5) · AC9 T-005, T-012, T-023 · AC10 T-005 · E1 T-005 · E2 T-005 |
| FR-004 | AC1 T-006 · AC2 T-006, T-024(+H-2) · AC3 T-006 · AC4 T-006 · AC5 T-006 · AC6 T-007, T-024 · AC7 T-006, T-015 · E1 T-006 |
| FR-005 | AC1 T-013, T-014 · AC2 T-013, T-014 · AC3 T-014, T-025 · AC4 T-014 · AC5 T-014, T-017 · AC6 T-006, T-007, T-025 · AC7 T-014 · AC8 T-014, T-025 · AC9 T-013 · AC10 T-014 · E1 T-014 |
| FR-006 | AC1~AC12 T-015 (AC5 T-013, AC11 T-003, AC12 T-015) · E1 T-015 · E2 T-015 · E3 T-015 |
| FR-007 | AC1·AC2·AC4·AC7·AC8·AC9 T-016 · AC3 T-006, T-016 · AC5 T-006, T-016 · AC6 T-006, T-016 · E1 T-016 · E2 T-016 |
| FR-008 | AC1·AC2 T-008 · AC3·AC4 T-017 · E1·E2·E3 T-008, T-017 |
| FR-009 | AC1·AC2·AC5·AC6·AC7 T-018 · AC3 T-009 · AC4 T-009, T-018 · E1·E2·E3 T-009, T-018 |
| FR-010 | AC1·AC5·AC7 T-010 · AC2·AC3 T-010, T-019 · AC4·AC6 T-019 · E1·E2·E3 T-010, T-019 |
| FR-011 | AC1·AC2·AC6 T-010 · AC3·AC4 T-010, T-019 · AC5 T-010, T-016 · E1·E2·E4 T-010, T-019 · E3 T-010, T-019 |
| FR-012 | AC1·AC3 T-019 · AC2·AC4 T-011 · AC5 T-011, T-019 · AC6 T-011, T-016 · E1·E2 T-011, T-019 |
| FR-013 | AC1 T-012, T-020(+H-3), T-021, T-FIX-09 · AC2 T-012, T-020(+H-3) · AC3 T-015, T-FIX-09 · AC4 T-016 · AC5 T-012 · AC6 T-021, T-FIX-09 · AC7 T-020 · AC8 T-002 · AC9 T-021 · AC10 T-021 · AC11 T-020(+H-3) · E1 T-021 · E2 T-020, T-021 · E3 T-020, T-021 · E4 T-021 |
| FR-014 | AC1 T-012, T-022 · AC2 T-012, T-022(+H-2) · AC3 T-003, T-022 · AC4 T-012, T-022 · AC5 T-021 · E1 T-001 |
| FR-015 | AC1·AC3 T-005 · AC2 T-005, T-025(01 대표 카드 `title` 툴팁에도 마스킹된 값만 — ADR-46 B) |
| FR-016 | AC1~AC4 T-013, T-024 |
| FR-017 | AC1 T-008, T-015 · AC2·AC3·AC5 T-017 · AC4 T-008, T-016 · E1·E2 T-008, T-017 |

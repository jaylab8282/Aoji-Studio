# Jay Studio — Architecture

- 기준: `docs/final_requirements_function.md` v1, `docs/final_requirements_architecture.md` v1, `docs/ui/` (2026-09-18 확정)
- 작성: architect, 2026-09-20
- 이 문서는 기술 스택·네트워크 인프라를 바꾸지 않는다. final 문서가 "architect가 정한다"고 남긴 항목만 여기서 정한다(ADR 참조).

## 1. 시스템 개요

```text
┌─ 맥북 호스트 ──────────────────────────────────────────────────────────────────────┐
│                                                                                     │
│  브라우저 (127.0.0.1)                                                                │
│   │  HTTP /api/*  (Origin + X-JayStudio-Browser-Token)                              │
│   │  SSE  /api/stream?token=…                                                       │
│   │  HTTP http://127.0.0.1:4181 (Origin + X-JayStudio-Helper-Token) ──┐            │
│   ▼                                                                    ▼            │
│  Docker Desktop ── 컨테이너 jaystudio (127.0.0.1:4180 → 4180)      열기 도우미      │
│   ├─ Spring Boot 4.1 (REST + SseEmitter + 정적 파일)                Node 24 단일 파일 │
│   ├─ /workspace  ← bind mount  /Users/jaybee/Desktop/JayStudio     launchd          │
│   └─ /data       ← named volume jaystudio-data (SQLite events.db)     │ osascript   │
│                                                                        ▼            │
│  Claude Code (JayStudio 폴더에서 시작)                              Terminal.app     │
│   └─ http hook POST /hooks/events (X-JayStudio-Collect-Token) ──▶ 컨테이너           │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## 2. 컴포넌트 책임

| 컴포넌트 | 위치 | 책임 | 하지 않는 것 |
|---|---|---|---|
| **Frontend** (`frontend/`) | 브라우저. 컨테이너가 정적 파일 제공 | 01~07 렌더링, SSE 스냅샷 기반 갱신, 로딩·빈·에러·연결 끊김 상태 표시, 화면용 파생 계산(정렬·필터·집계·칩 문구)을 순수 함수로 수행, 도우미 직접 호출, 클립보드 복사 | 파일 접근, 상태 전이 계산, 권한·중복·형식 검증의 최종 판정(서버 응답을 그대로 표시), 명령 문자열을 도우미에 전송 |
| **Server** (`backend/`) | 컨테이너 | 프로젝트 폴더 스캔·검증(registry), 1초 폴링 변경 감지, hook 수집·토큰 검증·마스킹·SQLite 저장·30일 보존, 세션 상태 기계·에이전트 집계(live), SSE 방송, 정의·구성 파일 원자적 쓰기·롤백, 수집 토큰 생성, 도우미 토큰 읽기·전달, 설정·hook 예시 생성 | 에이전트 실행, `.claude/settings.json` 쓰기, 호스트 명령 실행, Docker 제어, 마운트 밖 접근, 원문 `tool_input` 저장 |
| **프로젝트 폴더** | 맥북 `JayStudio/` → 컨테이너 `/workspace` | `.claude/agents`, `.claude/skills`, `.claude/settings.json`, `.jaystudio/{teams,trash,collect-token,helper-token}` 보관. 파일이 원본 | - |
| **열기 도우미** (`helper/`) | 맥북 호스트 `127.0.0.1:4181`, launchd | `GET /health`, `POST /open` 하나. Origin·토큰·name 검증 후 `osascript`로 Terminal.app에서 `cd "<JayStudio>" && claude [--agent <name>]` 실행. 첫 실행 시 `helper-token` 생성 | 임의 명령·경로, 파일 접근, 컨테이너 통신, `--dry-run` 없이 명령을 기록·출력 |
| **이벤트 재생 도구** (`tools/replay/`) | 개발 도구 | JSONL 시나리오를 수집 주소로 순서대로 POST | 운영 기능 |
| **E2E** (`tools/e2e/`) | 개발 도구 | fixture 폴더를 마운트한 실제 컨테이너 + dry-run 도우미로 Playwright 검증, 1440 폭 스크린샷 | 실제 `JayStudio/.claude`·`.jaystudio` 접근 |
| **Claude Code** (기존) | 맥북 호스트 | 에이전트 실행, `http` hook 전송 | - |

## 3. 모듈 구조

### 3.1 저장소 레이아웃 (`Jay_Studio/`)

```text
Jay_Studio/
├─ backend/                        Spring Boot 4.1.x · Java 25 · Gradle Kotlin DSL
│  ├─ build.gradle.kts, settings.gradle.kts, gradle/ (wrapper, toolchain foojay)
│  └─ src/main/java/studio/jay/
│     ├─ JayStudioApplication.java
│     ├─ config/        AppProperties(필수 env 검증), OriginFilter, BrowserTokenFilter, SqliteConfig, SchedulingConfig, StaticSpaConfig
│     ├─ files/         PathGuard(심볼릭 링크·이탈 차단), AtomicFileWriter(tmp+rename), WriteLock(단일 쓰기 락), TrashService
│     ├─ registry/      ProjectFolderScanner, AgentDefinitionParser(frontmatter 라인 보존), WorkflowConfigStore, RegistrySnapshot, RegistryService, FolderPoller(1s)
│     ├─ live/          HookPayload, SessionKey, SessionStateMachine(FR-004-AC2), LiveState, LiveStateService, SummaryBuilder(FR-003-AC10), Masker(FR-015)
│     ├─ events/        EventRow, EventRepository(JdbcClient), EventRetentionJob(30일)
│     ├─ collect/       HookCollectController(POST /hooks/events), CollectTokenStore
│     ├─ stream/        SseHub(SseEmitter 목록·방송·heartbeat), SnapshotAssembler
│     ├─ api/           StateController, EventController, AgentController, WorkflowController, SettingsController, AuthController, HelperTokenController, RegistryController, ApiError, ApiExceptionHandler
│     └─ resources/     application.yaml, application-dev.yaml, schema.sql, static/ (프론트 빌드 결과, 컨테이너 빌드 시)
├─ frontend/                       React 19.3 · TS 5 · Vite 8 · Tailwind 4.3 · React Router v7
│  └─ src/
│     ├─ app/           main.tsx, App.tsx, router.tsx(라우트·다이얼로그 search param), providers.tsx
│     ├─ api/           client.ts(fetch + 토큰), types.ts(api-spec 타입), stream.ts(SSE·백오프), helper.ts(도우미 호출)
│     ├─ state/         snapshotStore.ts(useSyncExternalStore), connectionStore.ts
│     ├─ lib/derive/    agentOrder.ts, featuredWorkflows.ts, counts.ts, search.ts, actionLabel.ts, workflowChip.ts
│     ├─ lib/format/    time.ts, ellipsis.ts
│     ├─ styles/        theme.css(@theme 토큰), base.css
│     ├─ components/ui/ Button, Chip, StatusDot, Skeleton, Banner, Dialog, Field, Select, SearchInput, Tooltip, MonoText
│     ├─ components/pixel/ DeskSprite(A), OfficeSprite(B), SmallOfficeSprite(서브)
│     ├─ components/common/ Sidebar, TopBar, CollectorStatus, DisconnectBanner, FormatErrorList(04-6), AgentsDirMissing(04-5), EmptyWorkflowCard(04-7), NoEventsYet(04-1)
│     ├─ screens/       home/, workflows/, workflow-detail/, settings/
│     └─ dialogs/       workflow-add/, workflow-delete/, import-agents/, agent-form/, remove-agent/, save-conflict/, helper-missing/
├─ helper/                         Node 24, 외부 의존 없음
│  ├─ jaystudio-helper.mjs         서버(HTTP) + 검증 + osascript 실행(주입 가능)
│  ├─ lib/ (validate.mjs, plist.mjs, cors.mjs)
│  ├─ install.sh, uninstall.sh, launchd/com.jaystudio.helper.plist.template
│  └─ test/*.test.mjs (node:test)
├─ tools/
│  ├─ replay/           replay.mjs, scenarios/*.jsonl
│  ├─ fixtures/         project-basic/, project-empty/, project-no-agents-dir/, project-format-errors/ (임시 폴더로 복사해 사용)
│  └─ e2e/              playwright.config.ts, compose.e2e.yaml, tests/*.spec.ts, scripts/check-port.sh
├─ Dockerfile, compose.yaml, .env.example, .gitignore
├─ CLAUDE.md, README.md
└─ docs/
```

### 3.2 Server 내부 데이터 흐름

```text
[FolderPoller 1s] ─▶ ProjectFolderScanner ─▶ RegistrySnapshot(불변) ─┐
[POST /api/registry/rescan] ──────────────────────────────────────────┤
                                                                       ├─▶ SseHub.broadcast(registry|snapshot)
[POST /hooks/events] ─▶ Masker+SummaryBuilder ─▶ EventRepository.insert │
                     └▶ SessionStateMachine.apply ─▶ LiveState(불변) ────┴─▶ SseHub.broadcast(live, event)
[GET /api/state] ─▶ SnapshotAssembler(registry + live + recentEvents 50)
[변경 API] ─▶ WriteLock ─▶ 검증(registry·live) ─▶ AtomicFileWriter/TrashService ─▶ RegistryService.rescanNow() ─▶ SSE
```

- `RegistrySnapshot`과 `LiveState`는 불변 객체로 교체된다(단일 `AtomicReference`). 읽기 API는 락 없이 현재 참조를 읽는다.
- 모든 파일 변경 API는 `WriteLock`(전역 `ReentrantLock`) 안에서 실행된다. 탭 5개 동시 조작에서 파일 경합을 막는다(ADR-08).
- 변경 API는 파일 쓰기 직후 `rescanNow()`를 호출해 응답 전에 registry를 갱신한다. 폴링을 기다리지 않으므로 FR-008-AC4 "바로 나타난다"를 만족한다.

## 4. 배포·네트워크 구성

### 4.1 컨테이너

| 항목 | 값 |
|---|---|
| 이미지 | `jaystudio:local`, `linux/arm64`, 멀티스테이지(Node 24로 프론트 빌드 → Gradle로 bootJar → `eclipse-temurin:25-jre` 실행) |
| 실행 사용자 | uid/gid `1000:1000` (`USER 1000`), root 아님 |
| 포트 | compose `ports: ["127.0.0.1:${JAYSTUDIO_PORT}:4180"]`. 호스트 IP 생략·`0.0.0.0` 금지 |
| 마운트 | `${JAYSTUDIO_HOST_PATH}:/workspace` (rw) 하나. `docker.sock` 없음 |
| 볼륨 | `jaystudio-data:/data` — `events.db`, `events.db-wal`, `events.db-shm` |
| 재시작 | `restart: unless-stopped` |
| TZ | `Asia/Seoul` (휴지통 접미사·로그 시각) |

### 4.2 환경 변수 (Server)

| 변수 | 필수 | 값·기본 | 용도 |
|---|---|---|---|
| `JAYSTUDIO_HOST_PATH` | 필수 | `/Users/jaybee/Desktop/JayStudio` | 07 표시, 도우미 명령 표시(FR-014-AC4). 없으면 기동 실패(FR-014-E1) |
| `JAYSTUDIO_PUBLIC_PORT` | 필수 | `4180` | 수집 주소·허용 Origin 계산. 없으면 기동 실패(NFR-05) |
| `JAYSTUDIO_MOUNT_PATH` | 선택 | `/workspace` | 컨테이너 안 마운트 경로 |
| `JAYSTUDIO_DATA_PATH` | 선택 | `/data` | SQLite 위치 |
| `JAYSTUDIO_HELPER_URL` | 선택 | `http://127.0.0.1:4181` | 브라우저가 호출할 도우미 주소(E2E에서 dry-run 도우미 포트로 바꿈, ADR-12) |
| `JAYSTUDIO_ALLOWED_ORIGINS` | 선택 | `http://127.0.0.1:${JAYSTUDIO_PUBLIC_PORT}` | 허용 Origin. dev 프로필은 `http://127.0.0.1:5173`을 추가 |
| `SPRING_PROFILES_ACTIVE` | 선택 | 없음(운영) / `dev` | dev만 Vite Origin 허용. 디버그 로깅 기본 꺼짐 |

`.env.example`에는 `JAYSTUDIO_HOST_PATH=`, `JAYSTUDIO_PORT=4180`만 두고 값은 비운다. compose는 `${JAYSTUDIO_HOST_PATH:?...}` 문법으로 누락 시 실패한다.

### 4.3 포트·바인딩

| 프로세스 | 바인딩 | 근거 |
|---|---|---|
| 컨테이너 안 Spring Boot | 컨테이너 네임스페이스의 모든 인터페이스(4180) | Docker 포트 공개는 컨테이너 IP로 전달되므로 컨테이너 안 127.0.0.1 바인딩은 동작하지 않는다. 호스트 노출은 compose의 `127.0.0.1:` 접두로만 결정된다(ADR-05) |
| 호스트 노출 | `127.0.0.1:4180` | NFR-04. `docker compose port jaystudio 4180`이 `127.0.0.1:4180`이어야 한다(DoD 자동 검증) |
| 개발용 Spring Boot (호스트) | `server.address=127.0.0.1`, 8080 | dev 프로필 |
| Vite dev server | `server.host='127.0.0.1'`, 5173, `/api`·`/hooks` 프록시 → 8080 | 개발 중에도 외부 노출 없음 |
| 열기 도우미 | `127.0.0.1:4181` (`server.listen(port, '127.0.0.1')`) | NFR-04 |

### 4.4 개발 실행

- `backend`: `./gradlew bootRun --args='--spring.profiles.active=dev'` + env `JAYSTUDIO_HOST_PATH`, `JAYSTUDIO_PUBLIC_PORT=8080`, `JAYSTUDIO_MOUNT_PATH=<fixture 임시 폴더>`, `JAYSTUDIO_DATA_PATH=<임시 폴더>`. 실제 `JayStudio/.claude`·`.jaystudio`를 가리키지 않는다(Automation Policy 금지).
- `frontend`: `npm run dev` (Vite 5173, 프록시 8080).
- 실행 명령의 확정은 scaffolder가 `CLAUDE.md` Commands에 적는다.

## 5. 인증·접근 통제

| 대상 | 검사 | 실패 응답 |
|---|---|---|
| `/hooks/events` | `Content-Type: application/json` + `X-JayStudio-Collect-Token` == `.jaystudio/collect-token` 내용 | 401 (본문 없음). Content-Type 불일치는 415 |
| `/api/auth/browser-token` | Origin 규칙(아래) | 403 |
| `/api/**` 읽기(GET) | Origin 규칙 | 403 |
| `/api/**` 변경(POST/PUT/DELETE) | Origin 규칙 + `X-JayStudio-Browser-Token` | 403 |
| `/api/stream` (SSE) | Origin 규칙 + `?token=` | 403 |
| 정적 파일 `/`, `/assets/**`, SPA 경로 | 없음 | - |

**Origin 규칙** (`OriginFilter`): `Origin` 헤더가 있으면 허용 목록(`JAYSTUDIO_ALLOWED_ORIGINS`)에 있어야 한다. `Origin`이 없으면 `Sec-Fetch-Site`가 `same-origin`이어야 한다. 둘 다 없으면(curl 등) 403. 이 규칙으로 다른 로컬 웹페이지(다른 Origin)와 브라우저 밖 클라이언트가 API·SSE를 쓸 수 없다(DoD "다른 Origin 차단").

**브라우저 토큰** (ADR-01): 서버 기동 시 메모리에 32바이트 난수(hex 64자)를 만든다. 프론트는 첫 로딩에 `GET /api/auth/browser-token`으로 받아 메모리(모듈 변수)에만 둔다. localStorage·cookie에 저장하지 않는다. 서버가 재시작되면 토큰이 바뀌고 모든 변경 요청이 403 `UNAUTHORIZED_TOKEN`으로 실패하므로, 프론트는 403 `UNAUTHORIZED_TOKEN`을 받으면 토큰을 1회 재발급받아 재시도한다.

**수집 토큰**: `.jaystudio/collect-token` (32바이트 hex, 모드 600, 끝 개행 없음). 기동 시 없으면 생성(`.jaystudio/`도 함께 생성). 만들 수 없으면 기동 실패(NFR-05, ADR-16).

**도우미 토큰**: `.jaystudio/helper-token` (도우미가 생성, 같은 형식). 서버는 읽기만 하고 `GET /api/helper/token`으로 전달한다. 파일이 없으면 `token: null`.

**dev 프로필 차이**: 허용 Origin에 `http://127.0.0.1:5173` 추가, CORS 응답 헤더(`Access-Control-Allow-Origin`=요청 Origin, `Allow-Headers`=`Content-Type, X-JayStudio-Browser-Token`, `Allow-Methods`) 활성. 운영 프로필은 CORS 헤더를 내지 않는다.

## 6. 데이터 모델

### 6.1 정의 파일 `.claude/agents/<name>.md` (원본, Claude Code 형식)

- 파일 = `---\n` + frontmatter(YAML) + `\n---\n` + 본문.
- 서버 파싱: UTF-8 엄격 디코딩(실패 → 형식 오류 `UTF-8 인코딩 오류`) → 첫 줄이 `---`가 아니거나 닫는 `---`가 없으면 `frontmatter 형식 오류` → SnakeYAML로 파싱 실패 → `frontmatter 형식 오류` → `name` 없음 → `name 누락` → `name`이 `^[a-z0-9-]+$` 아님 → `name 형식 위반` → 다른 파일과 같은 `name` → 두 파일 모두 `name 중복 (<상대 파일명>)`.
- 정상 파일에서 쓰는 필드: `name`, `description`(없으면 빈 문자열, FR-002-AC4), `tools`(문자열 쉼표 구분 또는 YAML 목록 → 목록으로 정규화), `model`(문자열).
- 편집 시 보존(ADR-07): frontmatter를 줄 단위로 유지하고 `name`·`description`·`tools`·`model` 키 줄만 교체·삽입·삭제한다. 그 밖의 줄(`permissionMode`, `skills`, `hooks`, …, 주석, 빈 줄)과 본문 바이트는 그대로 둔다. 다중 줄 값(`description: |` 블록, `tools:` YAML 목록)은 해당 키의 연속 들여쓰기 줄 전체를 한 덩어리로 교체한다.
- 파일명과 `name`이 다르면(예: `foo.md`에 `name: bar`) 형식 오류가 아니다. 에이전트 식별은 `name`, 파일 경로는 `filePath`로 따로 전달한다. 수정 시 name을 바꾸면 파일명을 `<새 name>.md`로 바꾼다(FR-011-AC2).

### 6.2 구성 파일 `.jaystudio/teams/<이름>.json` (ADR-06)

```json
{
  "schemaVersion": 1,
  "name": "개발부서",
  "description": "요구사항 확정 후 자동 개발",
  "lead": "develop-tech-lead",
  "members": ["architect", "reviewer"],
  "createdAt": "2026-09-20T10:00:00+09:00",
  "updatedAt": "2026-09-20T10:05:00+09:00"
}
```

| 필드 | 형식 | 규칙 |
|---|---|---|
| `schemaVersion` | 정수 | 현재 `1`. 다른 값이면 형식 오류 |
| `name` | 문자열 | 파일명 stem과 같아야 한다. 다르면 형식 오류 |
| `description` | 문자열 | 빈 문자열 허용 |
| `lead` | 문자열 또는 `null` | 팀장 name. `members`에 중복 포함 금지 |
| `members` | 문자열 배열 | 팀원 name 목록. 서버는 저장 시 중복 제거·오름차순 정렬 |
| `createdAt`, `updatedAt` | ISO-8601 | 서버가 채움 |

- **워크플로우 이름 = 파일명 stem**. 이름 규칙 FR-008-AC2(1~40자, `^[가-힣A-Za-z0-9 _-]+$`, trim). 중복 판정은 stem을 소문자로 정규화해 비교(FR-008-AC1).
- 형식 오류 판정(04-6 `<파일명>.json · 구성 파일 형식 오류`): JSON 파싱 실패, 위 필드 형식 위반, `name` ≠ stem, `lead`가 `members`에도 있음.
- 깨진 참조(04-6 `<name> · 구성 파일 참조 깨짐 (<워크플로우>)`): `lead`/`members`의 name이 정상 정의 파일에 없음. 그 항목만 층에서 뺀다. 구성 파일은 고치지 않는다.
- 중복 소속(FR-006-AC11): 같은 name이 두 구성 파일 이상에 등장 → `AgentDef.duplicateWorkflows`에 모든 워크플로우 이름(오름차순). 소속 표시는 첫 이름.
- 인원 = (`lead` ≠ null ? 1 : 0) + `members.length` (깨진 참조 제외한 수는 `Workflow.memberCount`, 원본 수는 `rawMemberCount`. FR-017-AC1의 "0명" 판정은 **원본** 기준 — 깨진 참조가 남아 있으면 삭제할 수 없다).

### 6.3 토큰 파일

| 파일 | 생성 주체 | 형식 |
|---|---|---|
| `.jaystudio/collect-token` | Server 첫 기동 | hex 64자, 개행 없음, 모드 600 |
| `.jaystudio/helper-token` | 도우미 첫 실행 | hex 64자, 개행 없음, 모드 600 |

### 6.4 휴지통

- `.jaystudio/trash/<name>.<yyyyMMdd-HHmmss>.md` (서버 TZ). 같은 초에 충돌하면 `-1`, `-2` 접미를 추가로 붙인다. 덮어쓰지 않는다(`Files.move` without `REPLACE_EXISTING`).

### 6.5 SQLite `/data/events.db` (WAL) — `schema.sql`

```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
CREATE TABLE IF NOT EXISTS events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at     TEXT    NOT NULL,   -- ISO-8601 with offset, 서버 수신 시각
  hook_event_name TEXT    NOT NULL,   -- FR-003-AC9 12종 중 하나
  session_id      TEXT    NOT NULL,
  agent_id        TEXT,               -- 서브에이전트일 때만
  agent_type      TEXT,               -- 없으면 로비 세션
  tool_name       TEXT,
  notification_type TEXT,
  cwd             TEXT,
  kind            TEXT    NOT NULL,   -- realtime-spec EventRow.kind
  title           TEXT    NOT NULL,   -- 예: '도구 실행 · Edit'
  summary         TEXT    NOT NULL    -- 마스킹 후, 200자 이하. tool_input 원문 없음
);
CREATE INDEX IF NOT EXISTS idx_events_received_at ON events(received_at);
CREATE INDEX IF NOT EXISTS idx_events_agent_type_received ON events(agent_type, received_at);
```

- 워크플로우 열은 저장하지 않고 **읽는 시점**에 registry로 해석한다(ADR-09). 소속을 바꾸면 과거 이벤트의 워크플로우 열도 현재 소속을 따른다.
- 보존: `EventRetentionJob`이 기동 직후와 매 시간 `DELETE FROM events WHERE received_at < now-30d`.
- 마이그레이션 도구 없음. `schema.sql`은 `IF NOT EXISTS`만 쓰고, 스키마 변경 시 새 컬럼 추가는 코드에서 `PRAGMA table_info` 확인 후 `ALTER TABLE`(ADR-19).
- 접근: `sqlite-jdbc` + Spring `JdbcClient`, 단일 커넥션(쓰기 주체 하나). 쓰기는 `synchronized`.

### 6.6 메모리 상태 (LiveState)

```text
SessionRecord {
  key            : agent_id ?? session_id          // ADR-10
  sessionId, agentId?, agentType?
  status         : running | waiting | idle
  currentTool    : { name, target }?               // 마지막 PreToolUse
  startedAt      : 마지막 SessionStart/SubagentStart 수신 시각 (없으면 첫 이벤트 시각)
  cwd            : 마지막 이벤트 cwd
  lastEventAt
  lobbyNo        : agent_type 없는 메인 세션에만, 서버 수명 내 1부터 증가
}
LiveState {
  sessions: Map<key, SessionRecord>
  lastEventByAgent: Map<agent_type, EventRow>      // 기동 시 DB에서 시드, 01 카드 최근 활동용
  lastReceivedAt, everReceived                     // everReceived = DB에 이벤트 1건 이상
}
```

**상태 전이**는 FR-004-AC2 표를 그대로 구현한다. 추가 규칙(ADR-10):
- `SessionStart`에 `agent_type`이 있으면 같은 `agent_type`의 모든 `SessionRecord`(메인·서브)를 제거한 뒤 새 레코드 `idle`. `agent_type`이 없으면 같은 `session_id`의 메인 레코드만 교체.
- 서브에이전트 이벤트(`agent_id` 있음)의 부모 = 같은 `session_id`의 메인 레코드. 없으면 메인 레코드를 `idle`로 만들어 둔다(FR-004-E1 준용). 부모 라벨 = 메인 레코드의 `agent_type` 또는 `[세션 N]`.
- `SubagentStop`·`SessionEnd`는 레코드를 제거한다. `SessionEnd`는 그 `session_id`의 서브 레코드도 함께 제거한다.
- 에이전트 집계(`AgentLive`): `agent_type == name`인 모든 레코드에서 상태 우선순위 waiting > running > idle(FR-004-AC3). `currentTool`·`cwd`·`startedAt`은 그 상태를 만든 레코드(동률이면 `lastEventAt` 최신). `childCount` = 이 에이전트의 메인 레코드 `session_id`를 가진 서브 레코드 수. `parentLabel` = 이 에이전트의 레코드가 모두 서브 레코드일 때(또는 우선 레코드가 서브일 때) 부모 라벨.
- 로비(`LobbyEntry`): (a) `agent_type` 없는 메인 레코드 → `[세션 N]`; (b) 정상 정의 파일이지만 워크플로우 밖인 에이전트 중 레코드가 있는 것 → `name · 상태`. 워크플로우 소속 여부는 방송 시점 registry로 판정하므로 소속 변경 시 로비에서 자동으로 빠진다(FR-004-AC7).
- 정의 없는 서브에이전트(`UndefinedSubagent`): `agent_id` 있고 `agent_type`이 정상 정의 파일에 없음. `parentAgentName`(부모가 정의된 에이전트면)과 `parentLabel`. 03은 `parentAgentName`이 그 워크플로우 소속일 때만 부모 다음 칸에 표시한다. 부모가 로비 세션·워크플로우 밖 에이전트면 어느 03에도 없고 01 실시간 이벤트에만 나온다.

## 7. 외부 시스템 연동

| 시스템 | 방식 | 개발 중 대체(Fake) | 켜고 끄기 |
|---|---|---|---|
| Claude Code hooks | `POST /hooks/events` (07 예시 JSON을 사용자가 붙임) | `tools/replay/replay.mjs`가 시나리오 JSONL을 같은 형식·헤더로 POST | 대체가 아니라 같은 입력 경로. 실제 세션 연동은 사람 확인 |
| 정의·구성 파일 | `/workspace` 파일 I/O | `tools/fixtures/*`를 임시 폴더(`mktemp -d`)로 복사해 마운트·`JAYSTUDIO_MOUNT_PATH`로 지정 | 환경 변수·compose override. 실제 `JayStudio/.claude`는 자동 구간에서 절대 사용하지 않음 |
| macOS Terminal | 도우미 `osascript` (`spawn`, 인자 배열) | 도우미 `--dry-run`: 검증까지 수행하고 실행 대신 stdout에 `DRY-RUN <command>` 1줄 기록, 204 응답. 단위 테스트는 `openTerminal` 함수 주입 | CLI 플래그. 기본은 실행. launchd plist에는 `--dry-run`을 넣지 않는다 |
| launchd | `install.sh`가 plist 생성 + `launchctl bootstrap` | `plist.mjs`의 순수 함수로 plist 문자열 생성만 테스트 | 설치·제거는 사람이 실행 |
| Docker Desktop | compose | E2E는 `tools/e2e/compose.e2e.yaml`(fixture 마운트, 포트 `127.0.0.1:4190`, 볼륨 `jaystudio-e2e-data`) | 별도 compose 파일 |

### 7.1 hook 설정 예시 (07 `설정 예시 복사`가 생성, FR-014-AC2)

```json
{
  "hooks": {
    "SessionStart":       [{ "hooks": [{ "type": "http", "url": "http://127.0.0.1:4180/hooks/events", "headers": { "X-JayStudio-Collect-Token": "<collect-token>" }, "timeout": 3 }] }],
    "SessionEnd":         [{ "hooks": [ ...같은 항목... ] }],
    "UserPromptSubmit":   [{ "hooks": [ ... ] }],
    "Stop":               [{ "hooks": [ ... ] }],
    "PreToolUse":         [{ "hooks": [ ... ] }],
    "PostToolUse":        [{ "hooks": [ ... ] }],
    "PostToolUseFailure": [{ "hooks": [ ... ] }],
    "PermissionRequest":  [{ "hooks": [ ... ] }],
    "PermissionDenied":   [{ "hooks": [ ... ] }],
    "Notification":       [{ "hooks": [ ... ] }],
    "SubagentStart":      [{ "hooks": [ ... ] }],
    "SubagentStop":       [{ "hooks": [ ... ] }]
  }
}
```

- 12개 이벤트만 등록(FR-003-AC9). `matcher`는 두지 않는다(모든 도구).
- `hookConfigured` 판정(FR-014-AC3): `settings.json`의 `hooks.<이벤트>[].hooks[]` 중 `type == "http"`이고 `url == collectUrl`인 항목이 하나 이상. 파일 없음·JSON 실패 → `false`.
- 07 안내에 `allowedHttpHookUrls`가 사용자 설정에 있으면 수집 주소를 허용 목록에 넣어야 한다고 적는다.
- 자동 테스트: 생성한 JSON을 파싱해 12개 키, 각 항목의 `type`/`url`/`headers`/`timeout` 값을 검증하고, 그 JSON을 fixture `settings.json`으로 써서 `hookConfigured == true`가 되는지 확인한다.

### 7.2 도우미 실행 (ADR-11)

- 명령: `cd "<projectDir>" && claude` 또는 `cd "<projectDir>" && claude --agent <leadName>`.
- `projectDir`는 launchd 인자(설치 시 고정). 기동 시 `"`, `` ` ``, `$`, `\`, 개행이 들어 있으면 기동 실패. `leadName`은 요청마다 `^[a-z0-9-]+$`, 1~64자 검증.
- 실행: `child_process.spawn('/usr/bin/osascript', ['-e','on run argv','-e','tell application "Terminal"','-e','activate','-e','do script (item 1 of argv)','-e','end tell','-e','end run', command])`. `shell: false`. 명령은 argv 항목으로 전달되고 Node에서 셸을 거치지 않는다.

## 8. 통합 검증 전략

### 8.1 실제로 띄워 연결하는 구성요소 (목킹 없음)

| 구성요소 | 기동 방식 | 비고 |
|---|---|---|
| Server + Frontend | `docker compose -f tools/e2e/compose.e2e.yaml up -d --build` (같은 Dockerfile, fixture 임시 폴더 마운트, `127.0.0.1:4190`, `JAYSTUDIO_HELPER_URL=http://127.0.0.1:4191`) | Frontend는 컨테이너가 제공하는 빌드 결과를 실제 브라우저(Chromium)로 사용 |
| 열기 도우미 | `node helper/jaystudio-helper.mjs --dry-run --port 4191 --project-dir <fixture> --allowed-origins http://127.0.0.1:4190 --token-file <fixture>/.jaystudio/helper-token` | 검증·CORS·응답은 실제, 터미널만 dry-run |
| hook 입력 | `node tools/replay/replay.mjs --url http://127.0.0.1:4190/hooks/events --token-file <fixture>/.jaystudio/collect-token scenarios/<name>.jsonl` | 실제 수집 경로 |
| 파일 변경 | Playwright 테스트가 fixture 임시 폴더의 파일을 직접 쓰고 삭제 | FR-001-AC3 |

### 8.2 E2E 시나리오 (User Scenarios·Integration Verification 기준)

| # | 시나리오 | 검증 ID |
|---|---|---|
| E2E-01 | 처음 실행: `project-basic` fixture(이벤트 0건, 워크플로우 0개) → 01에 04-2 스켈레톤 후 KPI, 04-1, 04-7. 사이드 탭 `hook 설정 안 됨`. 워크플로우 추가 후 03 진입 → 04-4 배너 + 캐릭터 모두 대기색 | FR-005-AC1·AC5·AC9·E1, FR-006-E3, FR-003-AC6, FR-007-E1 |
| E2E-02 | 워크플로우 구성: 02 `+ 워크플로우 추가` → 05 → 만들기 → 층 + 팀장 없음 경고 → `가져오기`로 팀장·팀원 지정 → `+ 만들기`로 새 에이전트 → 파일 내용 확인 | FR-008-AC1~AC4·E1·E2, FR-009-AC1·AC4·AC5·AC7, FR-010-AC1·AC2·AC5·AC6·AC7, FR-006-AC1·AC3 |
| E2E-03 | 수정·충돌·제거: 03 `정의 수정` → 06 → 밖에서 파일 수정 → 저장 → 06-5 → `최신 파일 다시 불러오기` / `덮어쓰기` → 보존 필드 확인 → `제거` → 06-6 → 휴지통 파일·구성 파일 확인 → 팀장 없음 | FR-011-AC1~AC4·AC6·E2, FR-012-AC1~AC4·E1, FR-007-AC7 |
| E2E-04 | 이벤트 재생 `states.jsonl`: 3상태 전이·우선순위·AskUserQuestion·로비 `[세션 1]`·정의 없는 서브에이전트 작은 캐릭터·정의 있는 서브에이전트 `· 부모`·워크플로우 밖 에이전트 로비 → 02·03 표시, 01 KPI·막대·실시간 이벤트·마스킹. 후반: running 상태에서 fixture `settings.json`의 hook 항목 제거 → 03에 04-4 배너 + 캐릭터·패널 모두 `대기`(02 책상은 `작업 중` 유지) → 복구 → 03 실제 상태 복귀 | FR-004-AC1~AC7·E1, FR-003-AC4·AC5·AC10·E2, FR-005-AC1~AC3·AC6~AC8, FR-006-AC5·AC9, FR-007-AC2·AC3·AC5·AC6·AC9·E1, FR-015-AC1·AC2 |
| E2E-05 | 04-3 재연결: 컨테이너 `pause` → 배너·카운트다운(5→10) → `unpause` → 배너 사라지고 스냅샷 갱신. `지금 재연결` 즉시 시도 | FR-016-AC1~AC4 |
| E2E-06 | 04-5·04-6: `project-no-agents-dir` → 01·02·07 04-5, `다시 읽기`로 복구 / `project-format-errors` → 02 04-6 목록(5종 + 깨진 참조 + 구성 파일 오류), 형식 오류 파일 수정 시도 → 06 열리지 않음 | FR-001-AC4·E1, FR-002-AC1~AC6, FR-006-E1·E2, FR-011-E3 |
| E2E-07 | 외부 변경 감지: fixture에 정의 파일·구성 파일 추가·수정·삭제 → 2초 이내 02 반영 | FR-001-AC3, FR-004-AC6(파일 측) |
| E2E-08 | 다른 Origin 차단: Playwright가 `http://127.0.0.1:4192`에 띄운 정적 페이지에서 `fetch('http://127.0.0.1:4190/api/workflows', POST)`·`EventSource` → 실패. 토큰 없는 수집 → 401. `curl`(Origin 없음) → 403 | FR-003-AC1·AC2, 인증 규칙 |
| E2E-09 | 터미널 열기: dry-run 도우미로 02 `Claude 열기` → stdout `DRY-RUN cd "<fixture>" && claude`; 03 `팀장 호출` → `--agent <lead>`; 도우미 정지 → 미설치 안내·`명령 복사`; 잘못된 토큰 파일 → 403 표시; 팀장 없음 → 비활성 | FR-013-AC1·AC2·AC4·AC6·AC9·AC10·E1·E2·E4 |
| E2E-10 | 워크플로우 삭제: 인원 있는 층 `삭제` 비활성 → 인원 0 → 05-3 → 이름 입력 → 삭제 → 층 사라짐, 열려 있던 03 탭은 `찾을 수 없습니다` | FR-017-AC1~AC4·E1, FR-007-E2 |
| E2E-11 | 07 설정: 값 표시, `설정 예시 복사` JSON을 fixture `settings.json`에 쓰면 `hook 설정됨`, `명령 복사`, `테스트로 열기` | FR-014-AC1~AC5, FR-013-AC5 |
| E2E-12 | 02 줌·미니맵·검색·드롭다운·30개 워크플로우 상단 바 | FR-006-AC6~AC8 |
| E2E-13 | 스크린샷: `project-showcase` fixture + `showcase.jsonl` 재생 후 01·02·03을 1440 폭으로 캡처해 `tools/e2e/screenshots/`에 저장 | DoD 화면 대조(리뷰어) |
| E2E-14 | `scripts/check-port.sh`: `docker compose port`가 `127.0.0.1:` 접두 | NFR-04, DoD |

### 8.3 사람 확인 항목 (final 문서 Definition of Done과 동일)

| # | 항목 | 연결 ID |
|---|---|---|
| H-1 | 실제 `JayStudio` 마운트 컨테이너에서 에이전트 수·스킬 수가 실제 파일과 일치 | FR-001-AC1·AC2 |
| H-2 | 07 예시를 실제 `settings.json`에 넣고 `claude --agent develop-tech-lead`로 팀원 서브에이전트 실행 → 02·03이 `작업 중` → `권한·입력 대기` → `대기`로 바뀜 | FR-003-AC8·AC9, FR-004-AC2, FR-014-AC2 |
| H-3 | 도우미 설치 후 02 `Claude 열기`, 03 `팀장 호출`로 실제 Terminal.app이 `JayStudio` 기준 `claude` / `claude --agent develop-tech-lead`를 연다 | FR-013-AC1·AC2·AC11 |
| H-4 | 같은 공유기의 다른 기기에서 4180·4181에 접속되지 않음 | NFR-04, FR-003-AC1 |
| H-5 | 컨테이너를 끈 상태에서 Claude Code 작업이 멈추지 않음 | FR-003-AC8, NFR-03 |

## 9. 장애·보안 고려사항

- **컨테이너 재시작**: LiveState 초기화(모두 `대기`), `lastReceivedAt`·`everReceived`·`lastEventByAgent`는 DB에서 복원. 브라우저 토큰 재발급(§5).
- **읽기 전용 마운트**: `writable=false` → 변경 API는 403 `READ_ONLY`, 프론트는 버튼 비활성. 단, `collect-token`이 없고 만들 수 없으면 기동 실패(ADR-16).
- **`.claude/agents` 없음**: registry `agentsDirMissing=true`, `agentCount=null`, `agents=[]`. 폴링은 계속되어 폴더가 생기면 자동 복구.
- **심볼릭 링크**: `PathGuard`가 `toRealPath()`로 마운트 루트 밖을 가리키면 그 파일을 형식 오류 `마운트 밖 링크`로 처리하고 읽지 않는다. 쓰기 대상이 링크면 거부.
- **경로 이탈**: 파일명은 검증된 `name`/`워크플로우 이름`으로만 만든다. URL 경로 변수는 같은 정규식으로 검증 후 사용.
- **SQLite 손상**: 기동 시 `PRAGMA quick_check` 실패면 로그에 기록하고 `events.db`를 `events.db.corrupt-<시각>`으로 옮긴 뒤 새로 만든다(이벤트는 30일 보존 데이터일 뿐, 파일 기반 데이터는 영향 없음).
- **SSE 연결 누수**: `SseEmitter` timeout 0, `onCompletion`/`onTimeout`/`onError`에서 목록 제거, heartbeat 전송 실패 시 제거.
- **로그**: hook 본문 원문·토큰·`tool_input`을 로그에 남기지 않는다. FR-003-E1 거부 로그는 `hook_event_name`(있으면)과 사유 코드만.
- **디버그 모드**: `logging.level.root=INFO` 기본, Spring DevTools 미포함, actuator 미포함.

## 10. ADR

### ADR-01 브라우저 토큰 발급·전달
- 선택지: (a) 서버 기동 시 메모리 난수 → `GET /api/auth/browser-token`(Origin 검사) → 메모리 보관, 헤더·SSE 쿼리로 전송 / (b) SameSite=Strict 쿠키 + 더블 서브밋 / (c) index.html에 토큰 주입
- 결정: (a). 이유: 쿠키는 dev(5173→8080) 교차 출처에서 복잡하고, HTML 주입은 정적 파일 제공 방식을 바꾼다. (a)는 Origin 규칙만 통과하면 되고 저장소에 남지 않는다. 서버 재시작 시 1회 재발급 재시도로 사용자 체감 없음.

### ADR-02 수집 경로·헤더·토큰 파일
- 결정: 경로 `/hooks/events`(브라우저 API `/api/**`와 분리해 Origin 규칙을 적용하지 않음), 헤더 `X-JayStudio-Collect-Token`, 파일 `.jaystudio/collect-token`. 이유: hook 요청에는 Origin이 없으므로 토큰만으로 인증해야 하고, 경로를 분리하면 필터 규칙이 단순하다.

### ADR-03 SSE 메시지 구조와 재연결
- 선택지: (a) 세밀한 델타 메시지 / (b) 섹션 단위 전체 교체(`registry`, `live`) + 이벤트 행 추가(`event`) + 접속 시 `snapshot`
- 결정: (b). 이유: 데이터가 작다(에이전트 100·워크플로우 30·이벤트 50 → 수십 KB). 델타 병합 버그를 없애고 FR-016-AC4 "전체 상태를 다시 받아"를 접속 시 `snapshot` 하나로 만족한다. `Last-Event-ID` 재전송은 두지 않는다(재연결 시 `snapshot`으로 대체). 프론트는 `EventSource`의 자동 재연결을 쓰지 않고(간격 제어 불가) `onerror`·heartbeat 45초 무수신 시 `close()` 후 5→10→20→30초 백오프로 새로 연다.

### ADR-04 파일 변경 감지 — 1초 폴링 (원본 OQ-A1, NFR-02)
- 선택지: (a) Java `WatchService`(inotify) / (b) 1초 폴링(경로·크기·mtime 스냅샷 비교) / (c) 둘 병행
- 결정: (b). 이유: Docker Desktop(macOS) bind mount의 inotify 전달은 파일 공유 백엔드(VirtioFS·gRPC FUSE) 설정에 따라 다르고, 호스트에서 바꾼 파일의 이벤트가 누락되는 사례가 알려져 있어 결정적이지 않다. 감시 대상은 `.claude/agents/*.md`(≤100), `.claude/skills/*/SKILL.md`(존재 여부), `.claude/settings.json`, `.jaystudio/teams/*.json`(≤30), `.jaystudio/helper-token` — 폴링 1회가 디렉터리 목록 4개 + stat 수백 회로 수 ms다. 변경 감지(≤1s) + 변경 파일만 재파싱(≤50ms) + SSE 방송(≤50ms)으로 FR-001-AC3 2초를 만족한다.
- 측정 의무: T-004 완료 조건에 "fixture에서 파일 생성 → SSE `registry` 수신까지 100회 측정 p95 < 1.5s" 통합 테스트를 포함한다. 미달이면 간격을 500ms로 줄인다(그래도 CPU 영향 미미). 결과는 T-004 완료 시 이 ADR에 추가한다.
- 크기·mtime이 같은 1초 내 재수정은 놓칠 수 있다. `다시 읽기`(FR-001-AC4)와 변경 API 후 `rescanNow()`가 이를 보완한다.

### ADR-05 컨테이너 바인딩 해석
- 결정: 호스트 노출은 compose `127.0.0.1:${JAYSTUDIO_PORT}:4180`으로만 하고, 컨테이너 안 프로세스는 컨테이너 네임스페이스 인터페이스에 바인딩한다(`server.address` 미지정). 이유: Docker 포트 공개는 컨테이너 IP로 전달되므로 컨테이너 안 127.0.0.1 바인딩은 접속 불가. macOS Docker Desktop의 컨테이너 네트워크는 LAN에 노출되지 않는다. NFR-04 "0.0.0.0 결함" 판정 대상은 compose `ports`, 개발 서버, 도우미의 바인딩 주소다. `docker compose port` 검사(E2E-14)와 H-4로 확인한다.

### ADR-06 구성 파일 스키마와 검증 범위
- 결정: §6.2 스키마. `name` = 파일명 stem, `lead`와 `members` 분리, `schemaVersion`. JSON 파싱 실패 외에 필드 형식 위반도 `구성 파일 형식 오류`로 묶는다. 이유: 파일이 원본이므로 서버가 임의 보정하지 않고 보여주기만 한다(D-F6). 팀장을 별도 필드로 두면 "팀장 1명" 불변식이 스키마로 표현된다.

### ADR-07 정의 파일 편집 — frontmatter 줄 단위 보존
- 선택지: (a) YAML 파싱 후 재직렬화 / (b) 줄 단위로 폼 필드 키만 교체
- 결정: (b). 이유: (a)는 키 순서·따옴표·주석·다중 줄 형식을 바꿔 FR-011-AC1을 깨뜨릴 수 있다. (b)는 알 수 없는 필드와 본문 바이트를 그대로 둔다. 파싱(검증)은 SnakeYAML, 쓰기는 줄 편집. 새 키 삽입 위치: `description` 다음(없으면 `name` 다음).

### ADR-08 복합 파일 작업 순서·롤백·단일 쓰기 락
- 결정: 모든 변경 API는 전역 `WriteLock` 안에서 실행. 순서와 롤백:
  - 만들기: 정의 파일 쓰기 → 구성 파일 쓰기. 후자 실패 → 정의 파일 삭제.
  - 수정(이름 변경): 새 파일 쓰기 → 구성 파일 갱신 → 옛 파일 삭제. 2 실패 → 새 파일 삭제. 3 실패 → 구성 파일 원복 + 새 파일 삭제.
  - 수정(소속 변경): 이전 구성 파일 → 새 구성 파일 → 정의 파일. 실패 시 역순 원복(원본 바이트를 메모리에 보관).
  - 제거: 정의 파일 → 휴지통 이동 → 구성 파일 갱신. 후자 실패 → 휴지통에서 되돌림.
  - 모든 파일 쓰기는 같은 디렉터리에 `.<name>.<random>.tmp` 작성 후 `ATOMIC_MOVE`. 폴러는 `.`으로 시작하거나 `.tmp`로 끝나는 파일을 무시한다.
- 이유: FR-010-AC7·FR-011-AC6·FR-012-E1. 원복은 최선 노력이며, 원복도 실패하면 500 `IO_FAILED`에 원복 실패 사실을 메시지에 넣는다.

### ADR-09 이벤트 저장·조회
- 결정: 워크플로우 열은 저장하지 않고 읽을 때 registry로 해석. `lastEventByAgent`를 메모리에 유지해 01 카드의 최근 활동을 방송 시점에 계산(DB 조회 없음). 이유: 소속 변경 시 과거 행도 현재 소속으로 보이고(FR-004-AC7 "이어진다"와 일관), hook당 DB 조회를 1회 INSERT로 유지해 FR-003-AC3 100ms를 지킨다.

### ADR-10 세션 키와 부모 판정
- 결정: 레코드 키 = `agent_id ?? session_id`. 서브에이전트 부모 = 같은 `session_id`의 메인 레코드. 없으면 `idle` 메인 레코드를 만든다. 정의 없는 서브에이전트는 부모가 워크플로우 소속 정의 에이전트일 때만 03에 표시. 이유: FR-004-AC4(`agent_id` 단위), FR-007-AC3(부모 = 같은 `session_id`의 `--agent` 세션), FR-004-E1(거부하지 않음). 로비 부모의 정의 없는 서브에이전트는 표시할 층이 없으므로 01 이벤트에만 나온다(FR-003-E2 "이벤트는 저장하고 01에 표시").

### ADR-11 도우미 실행 방식
- 결정: `spawn('/usr/bin/osascript', [...argv], {shell:false})`, 명령은 argv 마지막 항목으로 전달(§7.2). `projectDir`는 기동 시 금지 문자 검사, `leadName`은 요청마다 정규식 검사. `GET /health`(Origin 검사만)로 설치 여부 확인, `OPTIONS /open` preflight 처리. `--dry-run`은 실행 대신 stdout 기록. 이유: Terminal.app `do script`는 명령 문자열이 필요하므로 완전한 argv 실행은 불가능하다. 대신 도우미 안에서는 셸을 쓰지 않고, 문자열에 들어가는 두 값이 모두 엄격 검증된 상수·정규식 값이라 주입 여지가 없다(FR-013-AC11 의도). `open -a Terminal <script>` 방식은 임시 파일 생성이 필요해 배제.

### ADR-12 도우미 주소를 서버 설정으로 전달
- 결정: `Snapshot.config.helperUrl`(기본 `http://127.0.0.1:4181`)을 프론트가 사용. 이유: E2E가 실제 설치된 도우미(4181)와 충돌하지 않도록 dry-run 도우미를 4191에 띄워야 한다. 운영 기본값은 FR-013-AC6 그대로.

### ADR-13 model 선택지 (FR-010-AC3, 공식 문서 2026-09-20 확인)
- 공식 문서: `model`은 별칭 `sonnet`·`opus`·`haiku`, 전체 모델 ID(예: `claude-opus-5`), `inherit`(메인 대화와 같은 모델)를 허용하고, 생략하면 Claude Code의 서브에이전트 기본 순서를 따른다.
- 결정: 드롭다운 = `상속 (지정 안 함)` / `sonnet` / `opus` / `haiku` / `직접 입력`(전체 모델 ID, `^[a-z0-9.-]+$` 1~64자). `상속 (지정 안 함)`은 frontmatter에 `model`을 쓰지 않는다(FR-010-AC5). 수정 시 원본에 `model: inherit`가 있고 사용자가 `상속`을 그대로 두면 그 줄을 보존한다(FR-011-AC1 정신). 원본 값이 목록에 없으면 `직접 입력`에 채운다.

### ADR-14 팝업 라우팅
- 결정: 05·06은 현재 라우트의 search param으로 연다. `?dialog=workflow-add` / `?dialog=workflow-delete&workflow=<이름>` / `?dialog=import&workflow=<이름>`(없으면 드롭다운) / `?dialog=agent-new&workflow=<이름>` / `?dialog=agent-edit&agent=<name>` / `?dialog=agent-remove&agent=<name>`. 06 저장 성공 → `navigate('/workflows')`. 이유: E2E가 URL로 상태를 재현할 수 있고, 뒤로 가기로 닫힌다. 06-5·06-6 같은 하위 확인 창은 컴포넌트 상태다.

### ADR-15 프론트 파생 계산 위치
- 결정: 정렬(FR-005-AC3, FR-006-AC1), 집계(FR-005-AC1·AC2, FR-006-AC5), 검색(FR-006-AC8, FR-009-AC2), 동작 라벨(FR-007-AC2), 칩 문구(ui-rules 1)는 `frontend/src/lib/derive/*.ts` 순수 함수로 두고 Vitest로 AC ID를 붙여 검증한다. 서버는 원천 데이터(상태·이벤트·소속)만 준다. 이유: "Frontend 비책임: 상태 계산·비즈니스 규칙"은 상태 전이·검증을 뜻하고, 표시 순서·집계는 화면 규칙이다. 서버가 화면마다 다른 정렬을 주면 계약이 화면에 종속된다.

### ADR-16 읽기 전용 마운트와 수집 토큰
- 결정: `collect-token`이 이미 있으면 읽기 전용 마운트에서도 기동한다(`writable=false`). 없고 만들 수 없으면 기동 실패. 이유: NFR-05(토큰 없이 동작 금지)가 FR-001-E2(읽기 전용 동작)보다 우선한다. 첫 기동 한 번만 쓰기 권한이 필요하다. FR-001-AC6 "읽기만 할 때는 만들지 않는다"는 `teams/`·`trash/`에 적용하고, `.jaystudio/` 자체는 토큰 생성 시 만든다.

### ADR-17 04-4 판정과 캐릭터 표시 (팀장 결정 2026-09-20, FR-007-E1 문구 그대로)
- 결정: 03의 04-4 배너 조건 = `!live.everReceived || !registry.hookConfigured`. **04-4 배너가 표시되는 동안 03의 캐릭터(셔츠·모니터 색, 말풍선)와 상태 글자, 선택 패널의 `상태`·`현재 도구`는 표시만 `대기`로 고정한다.** 이 고정은 03 프론트의 표시 규칙(`screens/workflow-detail`의 `displayStatus = isCollectorDown ? 'idle' : live.status`)이며, 내부 세션 상태(`LiveState`), 01·02의 표시, `GET /api/state`·SSE의 값은 바꾸지 않는다.
- 이유: FR-004-AC1은 **상태 계산** 규칙(상태는 hook 이벤트로만 정한다)이고, FR-007-E1 04-4는 **03의 오류 표시** 규칙(수집이 중단된 상세 화면에서 캐릭터를 모두 대기색으로 보인다)이다. 계산 값은 그대로 두고 03의 렌더링만 바꾸므로 두 규칙은 충돌하지 않는다. 배너가 사라지면(이벤트 수신 + hook 설정 확인) 같은 스냅샷에서 즉시 실제 상태로 돌아간다.
- 선택지로 검토한 "캐릭터 색은 항상 live 상태" 안은 FR-007-E1 문구("캐릭터 모두 대기색")와 어긋나 채택하지 않았다.

### ADR-18 E2E 위치와 fixture
- 결정: Playwright는 `tools/e2e/`, fixture는 `tools/fixtures/`. 테스트마다 fixture를 `mktemp -d`로 복사해 compose override로 마운트. 이유: final 문서 폴더 목록(`backend/frontend/helper/tools`)을 유지하면서 실제 `.claude`·`.jaystudio`에 절대 닿지 않는다.

### ADR-19 라이브러리 선택 (확정 스택 안)
| 용도 | 선택 | 이유 |
|---|---|---|
| YAML frontmatter 파싱 | SnakeYAML (Spring Boot 기본 포함) | 추가 의존 없음. 쓰기는 줄 편집(ADR-07)이라 직렬화 기능 불필요 |
| JSON | Jackson (Spring Boot 기본) | 〃 |
| SQLite | `org.xerial:sqlite-jdbc` + Spring `JdbcClient` + `schema.sql` | 마이그레이션 도구 없음(테이블 1개) |
| 스케줄링 | Spring `@Scheduled` | 폴링·보존 작업 |
| 프론트 상태 | `useSyncExternalStore` 기반 자체 스토어 | 외부 상태 라이브러리 불필요(스냅샷 1개) |
| 프론트 테스트 | Vitest + Testing Library + jsdom | 확정 |
| 도우미 | Node 내장 `http`, `crypto`, `child_process`, `node:test` | 외부 의존 없음 확정 |
| 이벤트 재생 | Node 내장 `fetch` | 〃 |

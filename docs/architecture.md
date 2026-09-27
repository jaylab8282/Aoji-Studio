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
│     ├─ lib/origin.ts  canonicalHref(href)·redirectToCanonical(loc) — 진입 주소 정규화(ADR-41). main.tsx가 첫 렌더 전에 호출
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
| `JAYSTUDIO_ALLOWED_ORIGINS` | 선택 | `http://127.0.0.1:${JAYSTUDIO_PUBLIC_PORT}` | 허용 Origin. dev 프로필은 `http://127.0.0.1:5173`을 추가. `localhost`·`[::1]` 표기는 넣지 않는다(ADR-41) |
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
| `/api/**` 읽기(GET) — 아래 예외 제외 | Origin 규칙 | 403 |
| `/api/helper/token` (GET, 예외) | Origin 규칙 + `X-JayStudio-Browser-Token` — 도우미 토큰은 브라우저 토큰을 통과한 요청에만 전달한다(FR-013-AC8, api-spec `security: browserToken`) | 403 (`FORBIDDEN_ORIGIN` / `UNAUTHORIZED_TOKEN`) |
| `/api/**` 변경(POST/PUT/DELETE) | Origin 규칙 + `X-JayStudio-Browser-Token` | 403 |
| `/api/stream` (SSE) | Origin 규칙 + `?token=` | 403 |
| 정적 파일 `/`, `/assets/**`, SPA 경로 | 없음 | - |

**Origin 규칙** (`OriginFilter`): `Origin` 헤더가 있으면 허용 목록(`JAYSTUDIO_ALLOWED_ORIGINS`)에 **문자열 정확 비교**로 있어야 한다. `Origin`이 없으면 `Sec-Fetch-Site`가 `same-origin`이어야 한다. 둘 다 없으면(curl 등) 403. 이 규칙으로 다른 로컬 웹페이지(다른 Origin)와 브라우저 밖 클라이언트가 API·SSE를 쓸 수 없다(DoD "다른 Origin 차단").

**허용 목록 범위 (ADR-41)**: 허용 목록은 운영 프로필에서 `http://127.0.0.1:${JAYSTUDIO_PUBLIC_PORT}` 하나, dev 프로필에서 `http://127.0.0.1:5173`을 더한 둘뿐이다. `http://localhost:<포트>`·`http://[::1]:<포트>`는 **넣지 않는다**. 같은 포트의 다른 루프백 호스트명 문제는 허용 목록을 넓히지 않고 진입 주소 정규화로 푼다.

**진입 주소 정규화 (ADR-41)**: 정적 파일(`/`, `/assets/**`)에는 Origin 검사가 없어 `http://localhost:<포트>`로도 앱이 열리고, 같은 출처 GET은 `Origin` 헤더가 없어 `Sec-Fetch-Site`로 통과해 조회까지 성공한다. 그러나 POST·PUT·DELETE는 `Origin: http://localhost:<포트>`를 보내 403 `FORBIDDEN_ORIGIN`이 되고, 도우미(`--allowed-origins http://127.0.0.1:4180`, FR-013-AC7)도 같은 이유로 403이 된다 — "조회는 되는데 쓰기만 안 되는" 함정이다. 이를 없애기 위해 프론트는 **첫 렌더·첫 API 호출 전에** `location.hostname`이 `localhost` 또는 `[::1]`이면 호스트명만 `127.0.0.1`로 바꿔 `location.replace`한다(스킴·포트·경로·쿼리·해시는 그대로). 확정 진입 주소가 `127.0.0.1:<포트>`이므로(final 문서 User Scenarios 1, `docs/ui/screen-flow.md` `앱 접속 127.0.0.1:<포트>`) 이 정규화는 확정 진입 주소를 강제하는 것이고, 허용 목록·바인딩·토큰 규칙은 그대로다.

**403 `FORBIDDEN_ORIGIN` 응답 문구**: `message` = `허용되지 않은 출처입니다 · <publicOrigin> 주소로 다시 접속하세요`. `<publicOrigin>`은 서버가 `config.publicOrigin` 값으로 치환해 완성 문장으로 보낸다(예: `허용되지 않은 출처입니다 · http://127.0.0.1:4180 주소로 다시 접속하세요`). 프론트는 conventions §4대로 `message`를 가공 없이 표시한다. 정규화(위)가 덮지 못하는 접속 경로(예: 호스트명을 직접 바꾼 접속)에서 사람이 복구 방법을 알 수 있게 하는 마지막 안내다. **이 문구는 확정 문서에 없는 신설 문구이며 사용자 승인 전에는 구현하지 않는다(T-FIX-05).**

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
| Docker Desktop | compose | E2E는 `tools/e2e/compose.e2e.yaml`(fixture 마운트, 포트 `127.0.0.1:4185`, 볼륨 `jaystudio-e2e-data`) | 별도 compose 파일 |

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
| Server + Frontend | `docker compose -f tools/e2e/compose.e2e.yaml up -d --build` (같은 Dockerfile, fixture 임시 폴더 마운트, 공개 `127.0.0.1:4185:4180`, `JAYSTUDIO_PUBLIC_PORT=4185`, `JAYSTUDIO_ALLOWED_ORIGINS=http://127.0.0.1:4185`, `JAYSTUDIO_HELPER_URL=http://127.0.0.1:4191`) | Frontend는 컨테이너가 제공하는 빌드 결과를 실제 브라우저(Chromium)로 사용. E2E 공개 포트는 `4185`다(**`4190`은 쓰지 않는다** — WHATWG Fetch bad port, ADR-45) |
| 열기 도우미 | `node helper/jaystudio-helper.mjs --dry-run --port 4191 --project-dir <fixture> --allowed-origins http://127.0.0.1:4185 --token-file <fixture>/.jaystudio/helper-token` | 검증·CORS·응답은 실제, 터미널만 dry-run |
| hook 입력 | `node tools/replay/replay.mjs --url http://127.0.0.1:4185/hooks/events --token-file <fixture>/.jaystudio/collect-token scenarios/<name>.jsonl` | 실제 수집 경로. `replay.mjs`는 Node 전역 `fetch`를 쓰므로 대상 포트가 bad port가 아니어야 한다(ADR-45) |
| 파일 변경 | Playwright 테스트가 fixture 임시 폴더의 파일을 직접 쓰고 삭제 | FR-001-AC3 |

### 8.2 E2E 시나리오 (User Scenarios·Integration Verification 기준)

| # | 시나리오 | 검증 ID |
|---|---|---|
| E2E-01 | 처음 실행: `project-basic` fixture(이벤트 0건, 워크플로우 0개) → 01에 04-2 스켈레톤 후 KPI, 04-1, 04-7. 사이드 탭 `hook 설정 안 됨`. 워크플로우 추가 후 03 진입 → 04-4 배너 + 캐릭터 모두 대기색 | FR-005-AC1·AC5·AC9·E1, FR-006-E3, FR-003-AC6, FR-007-E1 |
| E2E-02 | 워크플로우 구성: 02 `+ 워크플로우 추가` → 05 → 만들기 → 층 + 팀장 없음 경고 → `가져오기`로 팀장·팀원 지정 → `+ 만들기`로 새 에이전트 → 파일 내용 확인 | FR-008-AC1~AC4·E1·E2, FR-009-AC1·AC4·AC5·AC7, FR-010-AC1·AC2·AC5·AC6·AC7, FR-006-AC1·AC3 |
| E2E-03 | 수정·충돌·제거: 03 `정의 수정` → 06 → 밖에서 파일 수정 → 저장 → 06-5 → `최신 파일 다시 불러오기` / `덮어쓰기` → 보존 필드 확인 → `제거` → 06-6 → 휴지통 파일·구성 파일 확인 → 팀장 없음 | FR-011-AC1~AC4·AC6·E2, FR-012-AC1~AC4·E1, FR-007-AC7 |
| E2E-04 | 이벤트 재생 `states.jsonl`: 3상태 전이·우선순위·AskUserQuestion·로비 `[세션 1]`·정의 없는 서브에이전트 작은 캐릭터·정의 있는 서브에이전트 `· 부모`·워크플로우 밖 에이전트 로비 → 02·03 표시, 01 KPI·막대·실시간 이벤트·마스킹. 후반: running 상태에서 fixture `settings.json`의 hook 항목 제거 → 03에 04-4 배너 + 캐릭터·패널 모두 `대기`(02 책상은 `작업 중` 유지) → 복구 → 03 실제 상태 복귀 | FR-004-AC1~AC7·E1, FR-003-AC4·AC5·AC10·E2, FR-005-AC1~AC3·AC6~AC8, FR-006-AC5·AC9, FR-007-AC2·AC3·AC5·AC6·AC9·E1, FR-015-AC1·AC2 |
| E2E-05 | 04-3 재연결: 컨테이너 `pause` → 배너·카운트다운(5→10) → `unpause` → 배너 사라지고 스냅샷 갱신. `지금 재연결` 즉시 시도 | FR-016-AC1~AC4 |
| E2E-06 | 04-5·04-6: `project-no-agents-dir` → 01·02·07 04-5, `다시 읽기`로 복구(01·02의 04-5에는 `설정 열기`가 있고 07의 04-5에는 없다 — ADR-42) / `project-format-errors` → 02 04-6 목록(5종 + 깨진 참조 + 구성 파일 오류), 형식 오류 파일 수정 시도 → 06 열리지 않음 | FR-001-AC4·E1, FR-002-AC1~AC6, FR-006-E1·E2, FR-011-E3 |
| E2E-07 | 외부 변경 감지: fixture에 정의 파일·구성 파일 추가·수정·삭제 → 2초 이내 02 반영 | FR-001-AC3, FR-004-AC6(파일 측) |
| E2E-08 | 다른 Origin 차단: Playwright가 `http://127.0.0.1:4192`에 띄운 정적 페이지에서 `fetch('http://127.0.0.1:4185/api/workflows', POST)`·`EventSource` → 실패. 토큰 없는 수집 → 401. `curl`(Origin 없음) → 403 | FR-003-AC1·AC2, 인증 규칙 |
| E2E-09 | 터미널 열기: dry-run 도우미로 02 `Claude 열기` → stdout `DRY-RUN cd "<fixture>" && claude`; 03 `팀장 호출` → `--agent <lead>`; 도우미 정지 → 미설치 안내·`명령 복사`; 잘못된 토큰 파일 → 403 표시; 팀장 없음 → 비활성 | FR-013-AC1·AC2·AC4·AC6·AC9·AC10·E1·E2·E4 |
| E2E-10 | 워크플로우 삭제: 인원 있는 층 `삭제` 비활성 → 인원 0 → 05-3 → 이름 입력 → 삭제 → 층 사라짐, 열려 있던 03 탭은 `찾을 수 없습니다` | FR-017-AC1~AC4·E1, FR-007-E2 |
| E2E-11 | 07 설정: 값 표시, `설정 예시 복사` JSON을 fixture `settings.json`에 쓰면 `hook 설정됨`, `명령 복사`, `테스트로 열기` | FR-014-AC1~AC5, FR-013-AC5 |
| E2E-12 | 02 줌·미니맵·검색·드롭다운·30개 워크플로우 상단 바 | FR-006-AC6~AC8 |
| E2E-13 | 스크린샷: `project-showcase` fixture + `showcase.jsonl` 재생 후 01·02·03을 1440 폭으로 캡처해 `tools/e2e/screenshots/`에 저장. **캡처 방식은 세 화면 모두 "뷰포트 clip" 하나다(ADR-46 C)**: 기본 뷰포트 1440×1024로 02·03을 캡처하고, 기준 프레임이 뷰포트보다 높은 01만 캡처 직전 뷰포트 높이를 기준 프레임 높이(1140)로 바꾼 뒤 되돌린다. `fullPage` 캡처와 "문서 높이 ≥ 프레임 높이" 단언은 쓰지 않는다 — 01 실시간 이벤트 표가 고정 높이라 문서 높이가 콘텐츠에 따라 1140px 아래로 내려갈 수 있다 | DoD 화면 대조(리뷰어) |
| E2E-14 | `scripts/check-port.sh`: `docker compose port`가 `127.0.0.1:` 접두(E2E 배치에서는 `127.0.0.1:4185`) | NFR-04, DoD |
| E2E-15 | 진입 주소 정규화(ADR-41): `http://localhost:4185/workflows?x=1`로 열면 주소가 `http://127.0.0.1:4185/workflows?x=1`로 바뀌고, 이어서 워크플로우 추가(POST)가 403 없이 성공한다. 정규화 후 요청에 실리는 `Origin` 값은 `http://127.0.0.1:4185` 하나뿐이다. 접속 자체가 되지 않으면(브라우저가 `localhost`를 `::1`로만 해석) 테스트를 `skip`하지 말고 원인을 기록해 architect에 확인을 요청한다 | ADR-41, FR-008-AC4, 인증 규칙 |

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
- **루프백 호스트명 별칭(ADR-41)**: `127.0.0.1`과 `localhost`는 같은 포트에 닿지만 `Origin` 문자열이 달라, 허용 목록을 넓히지 않으면 조회만 되고 쓰기가 403이 된다. 허용 목록은 그대로 두고 프론트 진입 정규화(§5)로 막으며, 정규화가 덮지 못하는 경우는 403 `FORBIDDEN_ORIGIN` 안내 문구로 복구 방법을 알린다. 허용 목록을 넓히지 않는 이유: 허용 목록은 잘못되면 그대로 보안 구멍이 되는 지점이라 항목 수를 최소로 유지한다.

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
- 측정 결과(T-004, 2026-09-21, `FolderPollerRealPollIntervalLatencyTest`·`FolderPollerLatencyTest`, 각 100회, 파일 변경 → SSE `registry` 수신): 실제 1초 간격 — 정의 파일 추가 p95 1,016~1,025ms, max 1,028ms(< 1.5s, 간격 유지). 스캔·재파싱·방송 오버헤드(폴링 간격 50ms 주입, 동일 `poll()` 경로) — 정의 파일 추가 69~78ms / 수정 71~79ms / 삭제 73~82ms, 구성 파일 추가 65~70ms / 수정 65~70ms / 삭제 69~75ms. 따라서 실제 감지 지연 ≈ 폴링 간격(≤1s) + ≤85ms로 모든 종류가 1.5s 안. 간격 500ms 축소 불필요.
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
- 추가(D-016, T-006): `--agent <미정의 name>`으로 시작한 메인 세션(`agent_id` 없고 `agent_type`이 정상 정의 파일에 없음)은 로비(`agent_type` 없음, FR-003-AC5)도 워크플로우 밖 에이전트(정상 정의 파일, FR-004-AC7)도 정의 없는 서브에이전트(`agent_id` 있음)도 아니므로 `Live`(`agents`/`lobby`/`undefinedSubagents`)에 넣지 않고, 이벤트는 저장해 01 이벤트 목록(`EventRow.agentLabel = agent_type`, `workflow = null`)에만 나온다.

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
- 보완(2026-09-23): 위 열거에 없는 요소(헤더 칩, 버튼 비활성 판정 등)의 기준은 **ADR-27**에서 확정했다. 이 열거는 "고정하는 것"의 전체 목록이며, 열거에 없으면 실제 `live` 값을 쓴다.

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

### ADR-20 `Settings.mountPath`와 FR-014-AC4 해석 (팀장 결정 D-020 → D-021, 2026-09-21)
- 배경: api-spec `Settings`는 `mountPath`(컨테이너 경로, 예 `/workspace`)를 required로 정의하는데, tasks.md T-012 Done when과 conventions §5는 "응답에 `/workspace` 절대 경로 없음"이라 적혀 서로 모순이었다. FR-014-AC4 원문은 "맥북 경로를 **표시**한다"이므로 검증 대상은 UI에 표시되는 값(`hostPath`·`defaultSessionCommand`·`leadSessionCommandTemplate`·`teamsPath`·`trashPath`)이다.
- 선택지: (a) `mountPath` 제거(계약 변경, 프론트 타입·백엔드 DTO·테스트 수정 필요) / (b) 유지 + 문구 정리.
- 1차 결정(D-020): (b) 채택 — T-011·T-012 구현이 진행 중이라 계약을 흔들지 않고, tasks.md·conventions.md 문구만 "UI 표시 값에 컨테이너 경로 미포함"으로 정정. 제거는 별도 계약 변경 절차로 검토.
- 최종 결정(D-021, 사용자 승인): **(a) 제거 채택**. `Settings` 스키마에서 `mountPath`를 `required`·`properties` 모두 제거(계약 변경). 이유: ui-spec 어느 화면도 `mountPath`를 표시하지 않고, 모든 `filePath`는 마운트 루트 상대 경로이며 절대 경로는 `hostPath`로만 만들므로 Frontend가 컨테이너 경로를 알 이유가 없다. 이에 따라 conventions §5의 마운트 경로 MUST는 예외 없이 "API 응답에 컨테이너 마운트 절대 경로를 넣지 않는다"로 되돌린다. `JAYSTUDIO_MOUNT_PATH`는 서버 내부 설정(§4 환경 변수 표)으로 유지. 사용자에게 보이는 동작·FR 의미 변경 없음. 영향 태스크: T-012(백엔드 DTO·테스트), T-013 이후 프론트 타입은 처음부터 제거된 계약으로 작성. `Snapshot.config`(`Config` 스키마)에는 `mountPath`가 원래 없어 T-007 영향 없음.

### ADR-21 상태 점 모서리 토큰 `--radius-dot` (팀장 결정 D-022, 2026-09-22)
- 배경: `docs/ui/ui-rules.md` 1은 "상태 점·사각형은 9~10px, 모서리 3px"로 정하는데, `design-tokens.md` 모서리 행(9/12/10/6)과 ui-spec 토큰 매핑 표에는 3px 값이 없었다. T-013은 conventions §7(임의 값 금지)을 지켜 `StatusDot`에 `--radius-badge`(6px)를 임시로 썼다(리뷰 Minor).
- 선택지: (a) ui-rules 3px를 전용 토큰으로 매핑 표에 추가 / (b) 6px 배지 토큰을 그대로 두고 ui-rules 문구를 바꿈 — (b)는 `docs/ui/`(확정 UI 기준) 수정이라 architect 권한 밖이고 기준을 코드에 맞추는 역전이다.
- 결정: **(a)** `--radius-dot: 3px` → Tailwind `rounded-dot`. 상태 점·사각형(`StatusDot`) 전용이며 다른 요소에는 쓰지 않는다. 문서 표기 누락 정정이므로 api-spec·realtime-spec·FR 의미는 변경 없음(계약 변경 아님). `theme.css`·`StatusDot` 반영은 frontend-developer가 T-014에서 한다.

### ADR-22 ui-spec `Sidebar` 로고·워드마크 표기 보완 (팀장 결정 D-023, 2026-09-22)
- 배경: 확정 기준 `docs/ui/screens/01-home.png` 좌상단에 초록 로고 아이콘 + `Jay Studio` 워드마크가 있으나 ui-spec §공통 `AppShell` 행에 그 설명이 없었다(T-014 리뷰 Minor). 구현(커밋 `bacd00e`)은 이미 PNG대로 반영됨.
- 결정: ui-spec §공통 컴포넌트 표에 `Sidebar` 행을 분리해 로고 아이콘(`bg-running rounded-control`, 글리프 없음)·워드마크(`APP_WORDMARK`)·`--height-header` 정렬, 탭 inset·선택 탭 표현, `CollectorStatus` 카드 스타일을 구현과 PNG에 맞게 적는다. 기존 토큰·공통 컴포넌트만 사용하며 새 시각 요소 없음. api-spec·realtime-spec·FR 의미 변경 없음(계약 변경 아님), 코드 변경 없음.

### ADR-23 SCR-02 줌·미니맵 "고정"의 확정 해석 — 하단 컨트롤 영역 (T-015 Round 2 R1, 2026-09-23)
- 배경: ui-spec SCR-02는 줌 버튼을 "왼쪽 아래 고정", 미니맵을 "오른쪽 아래 고정"이라고만 적어 (a) 뷰포트 고정 오버레이 / (b) 콘텐츠 흐름의 아래 영역 두 가지로 읽혔다. 기준 PNG는 콘텐츠 높이가 뷰포트(1020px)에 거의 맞아 두 해석이 같은 그림이라 근거가 되지 못한다. 구현은 (a)를 택해 `fixed`로 띄웠고, 그 결과 워크플로우 B의 `video-05` 이름·상태 글자가 불투명 패널에 덮였다(FR-006-AC10 위반, `docs/ui/README.md` "요소 가림은 결함"). 본문 하단 여백 증액으로는 해결되지 않는다(세로가 아니라 좌하단 상시 겹침).
- 선택지:
  - (a) 오버레이 유지 + 겹침 허용 — FR-006-AC10이 깨지고 기준 PNG에는 가려진 요소가 없어 채택 불가.
  - (b) 오버레이 유지 + 본문 좌·우에 오버레이 폭만큼 여백 컬럼 확보 — 겹침은 사라지지만 층 그리드가 좌 56px·우 약 150px 좁아져 기준 PNG의 층 카드 좌우 위치·폭이 달라진다(배치 차이 = 결함).
  - (c) 줌·미니맵을 층 그리드 아래 흐름에 두기(스크롤과 함께 사라짐) — 층이 많을 때 줌·미니맵을 쓸 수 없어 FR-006-AC6·미니맵의 목적이 무너진다.
  - (d) **층 스크롤 영역과 하단 컨트롤 영역을 분리** — 02 본문을 뷰포트 높이에 맞춘 세로 flex로 두고, 층(04-6·로비·층 그리드)은 자체 스크롤 컨테이너, 줌·미니맵은 그 아래 높이 176px 전용 영역에 둔다.
- 결정: **(d) 채택**. 줌·미니맵은 스크롤 위치와 무관하게 항상 같은 자리에 보이고(= "고정"의 의도 충족), 스크롤 영역 밖이라 어떤 스크롤 위치에서도 책상·이름·상태 글자를 가리지 않는다(FR-006-AC10 충족). 층 그리드 폭·좌우 여백은 기준 PNG 그대로 유지되고, 콘텐츠가 짧은 기준 PNG 상황에서는 (b)·(c)와 같은 그림이 되어 화면 대조에도 어긋나지 않는다. 컨트롤 영역은 `bg/page` 배경에 테두리·그림자가 없어 새 시각 요소를 만들지 않는다(기존 토큰만 사용).
- 부수 확정: `맞춤`(zoom fit)과 미니맵의 뷰포트 테두리·클릭 스크롤 기준은 window가 아니라 층 스크롤 영역(`clientWidth`·`clientHeight`·`scrollTop`·`scrollHeight`)이다 → T-015 Round 2 R2(상단 크롬 미차감·변환 전후 값 혼용)도 같은 규칙으로 해소된다. 줌 버튼을 감싸는 카드 패널은 기준 PNG에 없으므로 두지 않는다(R4).
- 영향: ui-spec SCR-02 레이아웃 항·줌·미니맵 행, conventions §7 MUST 신설. **Frontend 코드 수정 필요**(T-015: `WorkflowsScreen` 레이아웃 분리, `Minimap` 기준 컨테이너 교체, `ZoomControls` 패널 제거). api-spec·realtime-spec·데이터 출처 변경 없음(계약 변경 아님).

### ADR-24 워크플로우 카드·층 카드 테두리 색 규칙 통일 (T-015 Round 2 R3, 2026-09-23)
- 배경: `docs/ui/design-tokens.md`는 `state/running-border`를 "실행 중 카드·층 테두리"로만 정하고 waiting 전용 테두리 토큰을 두지 않는다. ui-spec SCR-02 층 카드 행에 테두리 규칙이 없어 구현이 칩 규칙(waiting 우선)을 그대로 써 층 테두리를 `#FF9A4D`로 칠했으나, 같은 데이터의 기준 PNG 워크플로우 A(실행 중 5·권한 대기 1)는 `#2C4A3C`다(리뷰어 픽셀 확인). 워크플로우 D(팀장 없음)는 danger 계열이다.
- 선택지: (a) 02만 2분기(running / 그 외)로 적고 01은 기존 3분기 유지 — 같은 워크플로우가 01에서 주황, 02에서 초록으로 보이는 화면 간 불일치가 남는다. (b) **01·02 공용 파생 함수로 통일**하고 우선순위를 running > waiting으로 정한다.
- 결정: **(b) 채택**. `lib/derive/workflowCardBorder.ts` 하나로 `① leadMissing → danger-border ② running>0 → running-border ③ waiting>0 → waiting ④ 그 외 → border/default`. 칩은 "지금 사람 손이 필요한가"를 말하므로 waiting 우선, 테두리는 "이 층이 돌아가는가"를 말하므로 running 우선으로 역할을 나눈다. 두 기준 PNG와 모두 모순이 없다 — 02 A·C는 running-border, B는 중립, D는 danger-border, 01 카드 2(권한 대기)는 running=0 해석으로 waiting 그대로. `leadMissing` 분기는 02 층 카드에만 쓰고 01 대표 카드는 항상 `false`를 넘긴다(01 기준 PNG에 팀장 없음 표현이 없어 새 표현을 만들지 않는다).
- 영향: ui-spec §공통 표 `workflowCardBorder` 행 신설, SCR-01 대표 카드 행·SCR-02 층 카드 행 갱신, conventions §7 MUST 신설. **Frontend 코드 수정 필요** — T-015(`Floor.tsx` waiting 분기 제거·danger 분기 추가), T-014(`FeaturedWorkflows.tsx`가 칩 variant로 테두리를 정하는 부분을 공용 함수 호출로 교체. 결과가 달라지는 경우는 `running>0 && waiting>0` 한 가지뿐). 계약 변경 없음.

### ADR-25 기준 PNG 02에 없는 `삭제` 버튼 (팀장 결정 D-024, 2026-09-23)
- 배경: `docs/ui/screens/02-workflows.png` 층 헤더에는 `삭제` 버튼과 비활성 사유 `팀원을 먼저 제거하세요`가 없으나 ui-spec SCR-02·FR-006-AC12·FR-017-AC1은 이를 요구한다. 기준 PNG 확정일(2026-09-18)이 FR-017 확정보다 앞선다.
- 결정: 팀장 해석(D-024)을 확정한다 — 기준 PNG가 FR-017 확정 이전 산출물이라 빠진 것이며 구현 표시는 결함이 아니다. `docs/ui/`는 수정하지 않고(확정 기준, architect 권한 밖) ui-spec SCR-02에 "기준 PNG에 없는 요소(FR-017 확정 이후 추가)" 주석과 대조 예외 목록을 둔다. 이 한 건 외의 요소 누락·추가는 그대로 결함이다. 코드 변경 없음, 계약 변경 없음.

### ADR-26 로비 상태 짧은 표기 `입력 대기` (팀장 결정 D-025, 2026-09-23)
- 배경: 02 로비 항목의 waiting 표기는 ui-spec SCR-02 로비 행·기준 PNG 모두 `입력 대기`인데 conventions §7 상태 문구 MUST 목록에는 `작업 중`/`권한·입력 대기`/`권한 대기`/`대기`만 있어 문서 간 표기가 어긋났다(구현은 ui-spec 기준이라 정상).
- 결정: conventions §7 상태 문구 MUST에 "02 로비 항목의 짧은 표기는 `입력 대기`"를 추가하고, 목록 밖 상태 문구를 새로 만들지 않는다는 문장을 붙인다. 로비 항목은 에이전트 지정 없는 메인 세션이라 권한 승인뿐 아니라 사용자 입력 대기를 함께 가리키므로 `권한 대기`가 아니다(FR-006-AC9). 코드 변경 없음, 계약 변경 없음.

### ADR-27 04-4 표시 고정과 동작 가드의 분리 (T-016 리뷰 A-1, 2026-09-23)
- 배경: ADR-17은 04-4 배너 표시 중 고정 대상을 "캐릭터(셔츠·모니터 색, 말풍선), 상태 글자, 선택 패널의 `상태`·`현재 도구`"로 **열거**한다. 헤더 칩과 `정의 수정`·`제거` 버튼은 그 열거에 없어 판정 기준이 문서에 없었다. 구현(T-016)은 버튼 비활성 판정에 실제 `live.status`를, 칩에도 실제 값을 썼고, 그 결과 04-4 캡처에서 패널 `상태`는 `대기`인데 버튼 사유는 `작업 중에는 수정할 수 없습니다`로 보인다.
- 선택지:
  - (a) 04-4 중에는 표시 상태(`대기`)로 버튼을 활성화한다 — 열자마자 서버가 409 `AGENT_BUSY`로 거부하는 팝업이 열린다. FR-011-AC5("실행 중인 에이전트는 수정할 수 없다")·FR-012-AC6 위반이고, ui-rules 2 "눌러도 아무 일이 없는 활성 버튼을 만들지 않는다"에도 어긋난다. 채택 불가.
  - (b) 04-4 중에는 버튼을 항상 비활성으로 두고 새 사유 문구(`수집이 끊겨 확인할 수 없습니다` 등)를 만든다 — 요구사항에 없는 새 문구·새 상태를 만드는 일이고, 수집이 끊겨도 실제로 idle인 에이전트는 수정할 수 있어야 한다(FR-011은 수집 상태를 조건으로 두지 않는다). 채택 불가.
  - (c) **표시 고정과 동작 가드를 분리한다** — 고정은 "지금 상태를 알 수 없다"는 표시 규칙(FR-007-E1), 버튼 비활성은 "서버가 거부할 동작을 막는다"는 동작 가드(FR-011-AC5·FR-012-AC6)로 서로 다른 규칙이다.
- 결정: **(c) 채택.** ui-spec SCR-04-4에 "고정 대상 / 비대상" 목록을 명시한다. 비대상 = 헤더 칩, 패널 `세션 시작`·`서브에이전트`·`작업 폴더`·`최근 이벤트`, `정의 수정`·`제거` 비활성 판정과 사유, `팀장 호출`, 01·02·07 표시, API·SSE 값. 칩을 고정 대상에서 뺀 이유는 같은 `WorkflowChip`이 01·02에서도 같은 워크플로우를 그리기 때문이다 — 03에서만 고정하면 화면 간 표시가 어긋난다(ADR-24와 같은 이유).
- 사용자 혼란 완화: 04-4 배너 각주 `Claude Code 미실행 또는 컨테이너 재시작 · 캐릭터는 모두 회색 대기`가 "지금 보이는 `대기`는 수집 중단 때문"이라고 이미 설명하므로 추가 문구를 만들지 않는다. 문구 신설·변경(예: 사유에 수집 중단 안내를 덧붙이기)은 요구사항 문구(FR-011-AC5·FR-012-AC6의 확정 문구) 변경이므로 architect가 실행하지 않고 보고만 한다.
- 영향: ui-spec SCR-03 헤더·버튼 행, SCR-04-4, conventions §7 MUST 1건. **코드 변경 없음**(T-016 구현이 이미 이 결정과 같다). 계약 변경 없음.

### ADR-28 기준 PNG 03과의 확정된 차이 목록 (T-016 리뷰 A-2, 2026-09-23)
- 배경: `docs/ui/screens/03-workflow-detail.png`와 ui-spec·FR 문구가 실제로 충돌하는 항목이 있었고, 화면 대조 때마다 판정이 반복됐다. SCR-02가 ADR-25로 같은 목록을 둔 선례를 따른다.
- 핵심 쟁점(1) **서브에이전트 칸 위치**: 기준 PNG는 `[서브에이전트 1]`을 5번째 칸(정의된 에이전트 4명 뒤)에 두지만, FR-007-AC3 원문은 "부모 캐릭터 **다음 칸**"(Must)이고 ui-spec SCR-03 작은 캐릭터 행도 "부모 칸 바로 다음 칸"이다. 구현(`lib/derive/officeSeats.ts`)은 문구를 따라 부모 바로 다음 칸에 둔다.
  - 선택지: (a) 기준 PNG(5번째 = 정의된 에이전트 뒤에 덧붙이기)를 우선 — PNG의 부모는 첫 자리 `[dev-lead]`이므로 5번째 배치는 "다음 칸"으로도, `docs/ui/pixel-sprites.md` §배치 "부모 아래·옆"(부모가 1번 칸이면 2번 또는 4번)으로도 도출되지 않는다. 즉 PNG 배치를 규칙으로 옮겨 적을 수 없고, 서브에이전트가 여럿이거나 부모가 중간 자리일 때 정의되지 않는다. (b) **Must 문구 우선**.
  - 결정: **(b) 채택 — 리뷰어 판정이 맞다.** 기준 PNG는 이름·수치가 모두 `[N]`·`[dev-lead]`인 placeholder 목업이고, 그 배치는 규칙으로 일반화되지 않는다. `docs/ui/README.md`가 정한 "기준"의 효력은 규칙으로 읽을 수 있는 구성에 있으며, 문구와 충돌하는 단일 목업 배치가 Must AC를 이기지 못한다. `officeSeats.ts`·테스트 **재작업 없음**.
- 나머지 항목: ② 패널 `상태`의 `StatusDot`(§공통 `StatusDot` 행이 "03 04-4 배너·패널 `상태`" 명시 → 구현이 기준) ③ 패널 버튼 배치·모양(기준 PNG는 `작업 중`인 에이전트에 활성 버튼을 그려 FR-011-AC5와 어긋나는 목업. 비활성 사유가 있으면 세로 스택 + ADR-29 표현) ④ 패널 name 글꼴 크기(ADR-31) ⑤ 헤더 칩 문구(PNG `실행 중 [N]명`은 placeholder, 실제는 waiting 우선).
- 결정 범위: ui-spec SCR-03에 위 5개를 "기준 PNG와의 확정된 차이"로 적고, 목록 밖의 누락·추가·배치 차이는 그대로 결함으로 둔다(conventions §7 갱신). `docs/ui/`는 수정하지 않는다(확정 기준, architect 권한 밖).
- 영향: **코드 변경 없음**. 계약 변경 없음.

### ADR-29 비활성 버튼은 variant 배경을 지운다 (T-016 리뷰 A-3, 2026-09-23)
- 배경: ui-spec §공통 `Button` 행과 `docs/ui/ui-rules.md` 2는 비활성을 "점선 테두리 + `text/faint` 글자 + 옆에 이유 한 줄"로만 적고 variant 배경 처리를 말하지 않았다. 구현(`Button.tsx:53`)은 variant 클래스를 그대로 두고 `disabled:border-dashed disabled:text-text-faint`만 덧칠해, 비활성 `정의 수정`이 **초록 채움을 유지한 채** 흐린 글자만 남았다(T-016 캡처). 대비는 `text/faint` on `state/running` = 2.26:1이고 점선 테두리는 채움에 묻혀 보이지 않는다.
- 근거 조사: 기준 PNG 01·02·03 **어디에도 비활성 버튼이 그려져 있지 않다**(03의 `정의 수정`·`제거`는 `작업 중` 에이전트인데도 활성으로 그려진 목업, 02의 점선 버튼은 `add` variant). 따라서 기준 PNG는 이 문제의 판단 근거가 되지 못하고, 어느 쪽으로 정해도 기준 PNG와 충돌하지 않는다.
- 선택지:
  - (a) 현행 유지(variant 배경 유지) — ui-rules 2 문구를 글자 그대로는 충족한다. 그러나 `ui-rules.md` 2 표는 `주 동작 / 터미널 / 보조 / 추가 / 위험 / 비활성`을 같은 "종류" 축에 나열하며 각 행이 **그 버튼의 표현 전체**를 적는다. 비활성 행에 배경이 없다는 것은 "배경을 남긴다"가 아니라 "배경이 없다"로 읽는 것이 자연스럽다. 또 주 동작 배경을 유지하면 비활성 버튼이 활성 버튼과 사실상 같은 모양이 되어 같은 절의 "눌러도 아무 일이 없는 활성 버튼을 만들지 않는다"가 무력해진다.
  - (b) **비활성이 variant 표현을 대체한다** — 채움 배경·강조 테두리 색을 지우고 점선 + faint + 이유만 남긴다. 대비는 `text/faint` on `bg/card` = 3.98:1로 올라간다(4.5 미만이지만 이는 `text/faint`를 보조 정보에 쓰는 토큰 설계의 전제이며 `terminal` 2.87·`danger` 3.39보다 모두 낫다).
- 결정: **(b) 채택.** 비활성은 variant와 무관하게 한 가지 모양이다. 새 색·새 토큰을 만들지 않고 기존 `border/dashed`·`text/faint`만 쓴다.
- 영향: **Frontend 코드 수정 필요 — `frontend/src/components/ui/Button.tsx`(T-014 산출물) 1곳.** 비활성 모양이 01·02·03·05·06·07 전체에서 바뀌므로 **T-014·T-015·T-016의 확정 캡처를 재대조**해야 한다. 실제 표시가 바뀌는 곳: 03 패널 `정의 수정`(primary)·`제거`(danger)·`팀장 호출`(terminal, 팀장 없음일 때), 02 층 헤더 `삭제`(danger)·`가져오기`(secondary, `writable=false`), 01·02 04-7 `워크플로우 추가`(primary). `add` variant는 이미 배경이 투명해 변화가 없다. 계약 변경 없음(데이터 출처·엔드포인트 무변경).

### ADR-30 03 상단 바에 프로젝트 칩을 두지 않는다 (T-016 리뷰 A-4, 2026-09-23)
- 배경: ui-spec §공통 `TopBar` 행은 프로젝트 칩을 "01·02·03만"으로 적었으나, SCR-03 요소 표 첫 행에는 브레드크럼만 있고 칩이 없으며 기준 PNG 03에도 칩이 없다(ui-spec 내부 충돌). 구현(`TopBar.tsx`, T-013)은 라우트와 무관하게 항상 칩을 그려 03에도, 07에도 칩이 나온다.
- 선택지: (a) §공통을 기준으로 03에 칩을 유지하고 SCR-03 요소 표에 칩 행을 추가 — 기준 PNG 03과 어긋나는 요소를 새로 추가하는 셈이라 "ui-spec 요소 표에 없는 요소 추가 금지"(conventions §7)와 `docs/ui/` 우선 원칙에 반한다. (b) **기준 PNG + SCR-03 요소 표(근거 2개)를 따르고 §공통 한 줄을 정정한다.**
- 결정: **(b) 채택.** §공통 `TopBar`를 "01·02에만"으로 고친다. 07도 SCR-07 요소 표에 칩이 없으므로 대상이 아니다(기존 "01·02·03만" 표기에서도 07은 제외였고, 구현만 어긋나 있었다). `TopBar`는 라우트를 직접 읽지 않고 화면이 넘긴 설정으로 칩 표시 여부를 정한다(공통 셸이 화면 규칙을 알지 않게).
- 영향: **Frontend 코드 수정 필요 — `frontend/src/components/common/TopBar.tsx`(T-013 산출물)와 호출부(01·02는 칩 표시, 03·07은 미표시).** T-013 회귀 수정 + T-016(03) 캡처 재대조. T-014·T-015 표시는 바뀌지 않는다. 계약 변경 없음.

### ADR-31 패널 name 글꼴 — 새 크기 토큰을 만들지 않는다 (T-016 리뷰 A-5, 2026-09-23)
- 배경: 기준 PNG 03의 패널 name은 약 19px인데 `theme.css` `@theme`·ui-spec 토큰 매핑 표·`docs/ui/design-tokens.md` 어디에도 19px 계열이 없다(25 / 14.5 / 13 / 12 / 10.5 / 10 / 34). 구현은 conventions §7 MUST(임의값 금지)를 지켜 `--text-section`(14.5px)을 썼다.
- 선택지: (a) `--text-panel-name: 19px` 토큰 추가 — `docs/ui/design-tokens.md` 글꼴 크기 단계(제목 24~26 / 섹션 14~15 / 본문 12.5~13 / 보조 11.5~12 / 최소 10)에 없는 **새 크기 단계를 만드는 일**이다. `ui-rules.md` 첫 줄이 "`design-tokens.md`의 값만 쓴다"이고, 확정 UI 기준에 없는 시각 디자인을 architect가 만들지 않는다는 규칙에 걸린다. (b) **기존 토큰(`--text-section`)으로 표현하고 기준 PNG와의 확정 차이로 기록한다.**
- 결정: **(b) 채택.** ADR-21(`--radius-dot`)은 `ui-rules.md` 1이 "모서리 3px"를 **명시**했는데 매핑 표에만 빠진 표기 누락이라 토큰을 추가했지만, 이번은 확정 문서 어디에도 19px이 적혀 있지 않고 PNG 렌더 결과만 그렇다 — 표기 누락이 아니라 새 단계 신설이므로 성격이 다르다. 19px 단계가 꼭 필요하다면 `docs/ui/design-tokens.md` 개정이 선행돼야 하고 그것은 architect 권한 밖이다(planner·사용자 승인 필요).
- 영향: **코드 변경 없음**(`theme.css` 무변경). ui-spec SCR-03 패널 name 행·확정 차이 목록에 기록. 계약 변경 없음.

### ADR-32 로딩 표현은 `AppShell` 공통 스켈레톤 하나로 한다 (T-016 리뷰 A-6, 2026-09-23)
- 배경: ui-spec 요소 표의 `로딩` 열은 화면마다 "숫자 스켈레톤", "카드 3장 스켈레톤", "캐릭터 자리 스켈레톤 3개"처럼 세분해 적혀 있으나, 구현은 01·02·03 모두 `AppShell`이 `snapshotStore.ready === false` 동안 본문 전체를 대신 그리는 공통 스켈레톤을 쓴다(T-014·T-015에서 같은 패턴으로 PASS).
- 선택지: (a) 화면별 스켈레톤을 요구사항으로 유지하고 T-014·T-015·T-016에 회귀 태스크를 새로 만든다 — 첫 스냅샷은 SSE 연결 직후 한 번에 오므로 사용자가 보는 시간이 매우 짧고, 세 화면에 스켈레톤 레이아웃을 따로 유지하는 비용이 FR-005-AC9("`0`을 먼저 보여주지 않는다")가 요구하는 효과를 넘어선다. (b) **공통 스켈레톤으로 정리하고, 자체 API 호출로 채워지는 요소만 예외로 둔다.**
- 결정: **(b) 채택.** ui-spec §공통 상태 표현 `로딩` 행에 "요소 표의 `스켈레톤` 표기는 공통 스켈레톤으로 충족된다"와 예외 목록(`TopBar` 프로젝트 칩, `CollectorStatus`, SCR-03 패널 `최근 이벤트` 4줄, SCR-05-R 목록 5행, SCR-06 폼 필드, SCR-07 설정 값 행)을 명시한다. 예외 기준은 "첫 스냅샷이 아니라 별도 요청·부분 갱신으로 채워지는가"다. FR-005-AC9·ui-rules 5(로딩 중 `0`·빈 문구 금지)는 공통 스켈레톤으로 그대로 충족된다.
- 영향: **코드 변경 없음**. 별도 태스크를 만들지 않는다. SCR-03 로딩 열 표기를 `공통(AppShell)`으로 정정. 계약 변경 없음.

### ADR-33 화면 문구의 `[...]`·`<...>` 표기는 데이터 출처가 해석한다 (T-017 리뷰 Minor 1 / A-7, 2026-09-23)
- 배경: 와이어프레임 04~07은 값이 들어갈 자리와 설명을 모두 대괄호로 그리고, ui-spec 요소 표가 그 표기를 그대로 옮겨 적었다. SCR-05-L 한 행 안에 `구성 파일 .jaystudio/teams/[이름].json…`(정적 설명줄)과 설명 입력 placeholder `[한 줄 설명]`이 함께 있었고, 구현은 앞은 글자 그대로 남기고(`lib/text.ts:288`) 뒤는 괄호를 벗겼다(`:295`). 판별 규칙이 문서에 없어 conventions §2 MUST(문구 그대로) ↔ §3 MUST(대괄호 placeholder 금지)가 같은 문자열에서 충돌했다.
- 조사한 사실:
  - ui-spec 04~07의 다른 모든 문장 속 `[...]`는 예외 없이 치환 자리다(`[N]초 후 재연결`, `마지막 수신 [yyyy-mm-dd hh:mm]`, `읽지 못한 정의 파일 [N]개`, `선택한 [N]명 가져오기`, `http://127.0.0.1:[포트]/hooks/events`). 즉 "문장 안의 대괄호를 글자 그대로 출력"하는 사례는 05-L의 `[이름]` 하나뿐이고, 프론트 전체 문구 상수 중 대괄호가 남은 것도 `text.ts:288` 한 줄뿐이다.
  - `docs/ui/ui-rules.md`·`design-tokens.md`·FR 본문의 대괄호도 모두 치환 자리(`실행 중 [N]명`, `전체 층 ([N]개)`)다. 확정 문서 어디에도 "대괄호를 화면에 그대로 보여준다"고 적힌 곳이 없다.
  - 반대로 FR-013-AC2는 `cd "<hostPath>" && claude --agent <팀장 name>`를 **서버가 주는 템플릿 문자열 자체**로 확정했고, 07은 그 값을 그대로 표시한다. 즉 괄호가 화면에 보이는 유일한 정당한 경로는 "출처가 준 값에 괄호가 들어 있는 경우"다.
- 선택지:
  - (a) 요소 종류로 가른다(입력 placeholder면 괄호 제거, 본문 문장이면 글자 그대로) — 현행 구현과 같다. 그러나 위 조사대로 본문 문장의 대괄호는 다른 모든 곳에서 치환 자리이므로, 05-L만 "본문이니 글자 그대로"로 읽으면 같은 표기가 문서 안에서 두 뜻을 갖는다. 화면에 `[이름]`이 남는 것은 §3 MUST가 금지하는 placeholder 문구와 구분되지 않아 리뷰·E2E가 결함과 의도를 가릴 수 없다.
  - (b) **표기 해석을 데이터 출처 열에 위임하고, 화면에는 괄호를 남기지 않는다** — 판정 입력이 이미 요소 표에 있는 값(데이터 출처)이라 사람마다 갈리지 않고, 기존 모든 문구(01~07, 프론트 상수 전부)와 어긋나지 않는다.
  - (c) 05-L 설명줄을 입력값으로 실시간 치환한다(`teams/<입력한 이름>.json`) — 그 행의 출처는 `정적`이고, 입력 전 표시(빈 값 대체 문구)를 새로 정해야 한다. 요구사항에 없는 동작 신설이라 채택 불가.
- 결정: **(b) 채택.** 판별 기준 한 줄 — **화면 문구 안의 `[...]`·`<...>`는 언제나 문서 표기이고, 렌더 형태는 그 요소의 `데이터 출처` 열이 정한다: 출처가 값을 주면 (a) 치환, 입력 요소의 placeholder면 (b) 괄호 벗긴 설명 문구, `정적`이면 (c) 괄호만 벗긴 텍스트 — 어느 경우에도 화면에 괄호 기호를 남기지 않는다.** 판정 순서는 (a)→(b)→(c). 괄호 안 낱말을 바꾸거나 문장을 다시 쓰지 않으므로 §2 MUST(문구 그대로)와 충돌하지 않는다.
  - 05-L 두 문자열의 귀속: `구성 파일 .jaystudio/teams/[이름].json(팀장·팀원 목록)이 만들어집니다.` = **(c) 정적 텍스트** → `…teams/이름.json…`. 설명 입력 placeholder `[한 줄 설명]` = **(b) 입력 예시** → `한 줄 설명`(현행 구현과 같다).
  - 05-3의 같은 경로 문구가 실제 워크플로우 이름으로 치환되는 것은 그 행의 출처가 `?workflow`이기 때문이며(= (a)), 05-L과 다르게 보이는 이유가 이 기준으로 설명된다.
  - 예외는 "괄호를 포함한 문자열 자체가 확정 문구인 값"을 출처가 주는 경우뿐이고, 현재는 `settings.leadSessionCommandTemplate`의 `<팀장 name>`(FR-013-AC2) 하나다. 이는 (a)의 결과이지 프론트가 만드는 문구가 아니다.
- 영향: ui-spec 머리말·§공통 새 절·SCR-05-L(2행 + 주석)·SCR-06 폼(`설명` placeholder, `기타` 입력)·SCR-07 `팀장으로 열기` 행, conventions §2(새 MUST + 표 행)·§3(미완성 코드 예시 보강). **Frontend 코드 수정 필요 1곳 — `frontend/src/lib/text.ts` `WORKFLOW_ADD_DESCRIPTION`의 `[이름]` → `이름`(T-017 산출물, 이미 done).** `[한 줄 설명]`은 현행 유지. T-019는 06 `설명` placeholder를 괄호 없이 구현한다. 계약 변경 없음.

### ADR-34 FR-017-E1 안내 표시 지속 시간 3초 (T-017 리뷰 Minor 2 / A-8, 2026-09-23)
- 배경: ui-spec SCR-05-3은 409 `WORKFLOW_NOT_EMPTY`를 "문구 표시 후 팝업 닫고 02 갱신"으로만 적고 시간을 주지 않았다. 구현은 `NOT_EMPTY_NOTICE_MS = 1500`을 두고 근거로 `CopyButton`의 `복사됨` 1.5초를 들었으나, 그것은 사용자가 이미 아는 결과의 **성공 확인**이고 여기는 사용자가 **읽어야 하는 거부 사유**라 근거가 되지 못한다(리뷰어 판정).
- 확정 문서 안의 비교 기준: `CopyButton` 1.5초(읽을 필요 없는 성공 표시) ↔ 02 저장 후 안내 줄 8초(FR-010-AC6, 화면 전환 없이 남아 있는 안내). 자동으로 닫히는 모달 안 문구는 놓치면 되돌릴 수 없으므로 1.5초보다 길어야 하고, 사용자가 언제든 `취소`·ESC로 닫을 수 있으므로 8초처럼 붙잡을 이유도 없다.
- 선택지:
  - (1) **구체적 지속 시간을 명시한다** — FR-017-E1("표시 후 화면 갱신")과 ui-spec의 자동 닫힘 동작을 그대로 두고 값만 문서화한다.
  - (2) 사용자가 닫을 때까지 유지한다 — FR-017-E1이 전제한 자동 진행을 사람 조작으로 바꾸는 **사용자에게 보이는 동작 변경**이고, 확인 팝업이 "삭제 시도 → 닫기"로 닫기 동작을 두 번 요구하게 된다. FR 문구가 정한 흐름을 architect가 바꾸는 일이라 채택하지 않는다(필요하다면 planner 경로로 올릴 사안).
  - (3) 1500ms 현행 유지 + 근거 문서화 — 리뷰어가 약하다고 판정한 근거를 그대로 승인하는 셈이라 같은 논점이 T-019(06-6)에서 반복된다.
- 결정: **(1) 채택, 값은 3000ms.** 사유 문장(`팀원이 있어 삭제할 수 없습니다`)을 읽고 팝업이 닫히는 것을 인지할 최소 시간으로, 위 두 기준값(1.5초 / 8초) 사이에서 모달 자동 닫힘에 쓰는 값이다. 함께 확정: 표시 중 `삭제`는 비활성을 유지하고(같은 DELETE 중복 전송 방지 — 리뷰 Minor 3과 같은 결론), 사용자가 그 전에 `취소`·ESC로 닫으면 즉시 닫힌다. 02 갱신은 SSE `registry`가 하므로 닫히는 시점과 무관하다.
- 값의 자리: design token이 아니라 동작 지연이므로 `theme.css`에 넣지 않고 컴포넌트의 이름 있는 코드 상수(`NOT_EMPTY_NOTICE_MS`)로 둔다. 대신 ui-spec이 값을 명시하고 conventions §7 MUST가 "ui-spec에 없는 새 지연을 구현이 정하지 않는다"를 건다.
- 영향: ui-spec SCR-05-3 에러 열 + 확정 동작 3줄, conventions §7 MUST 1건. **Frontend 코드 수정 필요 — `frontend/src/dialogs/workflow-delete/WorkflowDeleteDialog.tsx`의 상수 1500 → 3000과 주석 근거 교체, 안내 표시 중 확인 버튼 비활성(같은 파일).** 단위 테스트의 타이머 기대값(`[FR-017-E1]`, `[FR-017-E2]`의 1.8초 미닫힘 단언)도 함께 교정한다. 사용자에게 보이는 **시간 값**은 바뀌지만 동작의 종류(표시 후 자동 닫힘)는 FR-017-E1 그대로다. 계약 변경 없음.

### ADR-35 비활성 버튼의 이유 줄은 ui-spec이 지정한 지점에만 (T-017 리뷰 Minor 4 / A-9, 2026-09-23)
- 배경: `docs/ui/ui-rules.md` 2 표는 비활성 표현을 "점선 테두리 + `text/faint` 글자 + 옆에 이유 한 줄"로 적고 같은 절에 "조건이 안 되면 비활성 + 이유다"를 둔다. 그런데 ui-spec SCR-05-L은 `이름 비었으면 만들기 비활성`만 적고 이유 문구를 주지 않으며, SCR-05-3·06-6은 버튼 라벨 자체가 `삭제 (이름 일치 시 활성)`(FR-017-AC2 확정 문구)·`제거 (이름 일치 시 활성)`(ui-spec SCR-06-6)로 조건을 말한다. 구현은 이 지점들에 이유 줄을 붙이지 않았다.
- 선택지:
  - (a) 모든 비활성 버튼에 이유 한 줄을 필수로 한다 — 05-L `만들기`, 05-3·06-6 확인 버튼, 05-R `선택한 0명 가져오기`, 06 `저장`(필수값 미입력), 진행 중 비활성까지 새 문구를 만들어야 한다. 확정 문서(FR·ui-rules·와이어프레임) 어디에도 없는 UI 문구를 architect가 신설하는 일이라 "UI 기준에 없는 것을 만들지 않는다"·conventions §2 MUST에 걸린다. 또 `삭제 (이름 일치 시 활성)` 옆에 "이름이 일치하지 않습니다"를 덧붙이는 식의 중복이 생긴다.
  - (b) **ui-spec 요소 표가 이유 문구를 지정한 비활성에만 이유 줄을 렌더한다.**
- 결정: **(b) 채택.** ui-rules 2 표의 "옆에 이유 한 줄"은 **비활성 표현의 구성 요소**를 적은 것이고, 어떤 지점에 어떤 문구가 붙는지는 ui-spec이 정한다. ui-rules 2가 든 예(`팀장 없음`, `도우미 미설치`)가 모두 **버튼 밖 상태**가 원인인 경우라는 점이 이 읽기를 뒷받침한다. 지정 기준: **비활성 원인이 버튼 밖에 있어 화면만 보고는 알 수 없을 때**(쓰기 권한, 에이전트 실행 상태, 팀장 존재, 팀원 존재, 도우미 설치 여부) 이유를 지정하고, 원인이 **버튼 라벨 자신**이나 **같은 팝업·카드 안의 입력 상태**로 바로 보이면 지정하지 않는다. 요청 진행 중 비활성은 라벨(`만드는 중…` 등)이 상태를 말하므로 이유를 붙이지 않는다.
- 정합: ADR-29(비활성은 variant 표현을 대체한다)와 층위가 다르다 — ADR-29는 비활성의 **모양**, ADR-35는 이유 줄의 **적용 범위**다. 이유 줄이 없어도 점선 + `text/faint` 모양만으로 활성과 구분되므로 ui-rules 2의 "눌러도 아무 일이 없는 활성 버튼 금지" 의도는 유지된다.
- 판정 가능성: ui-spec §공통에 전 화면 비활성 지점 목록(이유 있음 7종 / 이유 없음 6종)을 두어 T-018·T-019·T-021·T-022가 같은 논점을 다시 열지 않게 한다. 목록에 없는 새 비활성 지점이 필요하면 구현이 문구를 만들지 말고 architect에 확정을 요청한다(conventions §3 Frontend MUST).
- 영향: ui-spec §공통 새 절 + SCR-05-L·05-3 비활성 열 주석, conventions §3 Frontend MUST 1건. **코드 변경 없음**(T-017 구현이 이미 이 결정과 같다). 계약 변경 없음.

### ADR-36 `rejected[].reason` 세 값의 화면 문구 (T-018 리뷰 Minor m2 / A-10, 2026-09-24)
- 배경: `api-spec.yaml` `POST /api/workflows/{workflow}/members` 200 응답의 `rejected[].reason` enum은 `ALREADY_ASSIGNED | NOT_FOUND | FORMAT_ERROR` 3값인데, ui-spec SCR-05-R 에러 열은 `ALREADY_ASSIGNED`만 문구를 확정하고 나머지를 "등"으로 남겼다. T-018 구현은 문장을 지어내지 않고 두 값을 `null`로 두어 빨간 줄에 에이전트 이름만 표시했다(conventions §2 MUST 준수 — 리뷰어도 옳다고 판정). 결과적으로 그 두 사유가 오면 사용자가 거부 이유를 알 수 없다.
- 확정 문서 안의 재사용 후보:
  - `NOT_FOUND`(가져오려는 정의 파일이 없다) ↔ ui-spec SCR-06 제목 행의 `GET /api/agents/{name}` 404 문구 **`정의 파일이 없습니다 · 목록을 확인하세요`**. 원인(정의 파일 부재)과 사용자가 할 일(목록 확인)이 같다.
  - `FORMAT_ERROR`(정의 파일이 형식 오류라 읽을 수 없다) ↔ 완전히 같은 문장은 없다. 가장 가까운 확정 어구는 SCR-04-6 제목 `읽지 못한 정의 파일 [N]개`의 명사구 `읽지 못한 정의 파일`과, 그 카드 각주가 쓰는 낱말 `목록`(`오류 파일은 층에 표시하지 않고 목록만 표시`)이다.
- 선택지:
  - (a) 두 값을 계속 `null`로 두고 이름만 표시한다(현행) — FR-009-E2 원문이 기술하는 경우는 `ALREADY_ASSIGNED` 하나뿐이라 요구사항 위반은 아니지만, 계약이 보낼 수 있는 값이 화면에서 설명 없이 사라진다. 같은 논점이 T-019·T-024에서 다시 열린다.
  - (b) **두 값의 문구를 확정한다.** `NOT_FOUND`는 확정 문구를 글자 그대로 재사용하고, `FORMAT_ERROR`만 확정 어구를 이어 붙인 한 문장을 새로 둔다.
  - (c) `FORMAT_ERROR`에도 `정의 파일이 없습니다 …`를 돌려쓴다 — 파일은 있는데 읽지 못하는 상태라 사실과 다른 안내가 된다. 채택 불가.
- 결정: **(b) 채택.** SCR-05-R 에러 열의 행별 사유는 `<name>: <사유>` 한 줄로 세 값 모두 확정한다.
  | reason | 문구 | 출처 |
  |---|---|---|
  | `ALREADY_ASSIGNED` | `가져오는 사이 다른 워크플로우에 소속되었습니다` | 기존 확정(ui-spec SCR-05-R, FR-009-E2) |
  | `NOT_FOUND` | `정의 파일이 없습니다 · 목록을 확인하세요` | ui-spec SCR-06 제목 행(404) 확정 문구 **글자 그대로 재사용** |
  | `FORMAT_ERROR` | `읽지 못한 정의 파일입니다 · 목록을 확인하세요` | **신규 1문장.** 앞 절 = SCR-04-6 제목의 확정 명사구 `읽지 못한 정의 파일`, 뒤 절 = 위 404 문구의 뒷 절 그대로. 낱말을 새로 만들지 않고 두 확정 어구를 이었다 |
  - `FORMAT_ERROR` 문구가 새 문장인 이유를 밝힌다: 확정 문서(FR·ui-spec·와이어프레임) 어디에도 "가져오기 중 형식 오류" 사유를 서술한 완성 문장이 없다. 두 사유 줄의 뒷 절을 `목록을 확인하세요`로 통일한 이유는, 두 경우 모두 사용자가 볼 곳이 02의 목록(정상 파일은 층 목록, 형식 오류 파일은 04-6 목록)이기 때문이다.
  - enum 밖의 값이 오면(서버·계약 불일치) 사유 줄 없이 이름만 표시한다 — 현행 동작 유지이며 문구를 지어내지 않는다.
- 영향: ui-spec SCR-05-R 에러 열(“등” 제거). **Frontend 코드 수정 필요 — `frontend/src/lib/text.ts` `IMPORT_REJECTED_REASON_TEXT`의 `NOT_FOUND`·`FORMAT_ERROR` 값 채우기**(T-FIX-03). 계약 변경 없음(enum·스키마 그대로).

### ADR-37 05-R 검색은 선택을 지우지 않고, 가려진 선택을 알린다 (T-018 리뷰 Minor m3 / A-11, 2026-09-24)
- 배경: 검색어로 행이 숨어도 체크 상태와 `선택한 N명`이 유지된다. 캡처 `docs/reviews/screens/T-018/05-R-import-search-no-results.png`는 표시 행 0개인데 `선택한 2명 가져오기`가 활성이다 — 어떤 2명인지 화면에서 확인할 수 없는 상태로 쓰기 요청을 보낼 수 있다. ui-spec에 해제 규칙이 없어 선택을 지우지 않은 구현 판단 자체는 타당하다(요구사항 밖 동작 신설 금지).
- 위험의 크기: 잘못 가져와도 정의 파일은 바뀌지 않지만(FR-009-AC3), 되돌리려면 FR-012 `워크플로우에서 제거`(정의 파일이 휴지통으로 이동)를 거쳐야 해 원복 비용이 가볍지 않다.
- 선택지:
  - ① 검색어가 바뀌면 선택을 해제한다 — 이름 A를 찾아 체크하고 다시 B를 찾는 다중 선택 흐름이 깨진다. `선택한 N명`(FR-009-AC5)이 전제하는 복수 선택과 어긋나고, 행별 `역할` 선택값까지 함께 초기화해야 하는 추가 동작을 새로 정해야 한다. 사용자에게 보이는 동작 변경이 가장 크다.
  - ② **선택 행 중 현재 검색에 가려진 수를 목록 위 한 줄로 알린다.** 버튼 라벨·활성 조건(FR-009-AC5)은 그대로 두고 정보만 더한다.
  - ③ 현행 유지 — 위험을 문서로 승인하는 셈이고, "보이지 않는 대상에 쓰기"가 남는다.
  - ④ 선택 행은 검색과 무관하게 표에 남긴다 — FR-009-AC2("부분 일치하는 항목만 남는다")를 정면으로 어긴다. 채택 불가.
- 결정: **② 채택.** 검색은 표시 필터일 뿐 선택을 바꾸지 않는다는 것을 ui-spec에 명시하고, 가려진 선택이 1개 이상일 때만 안내 줄을 렌더한다.
  - 문구: **`검색으로 가려진 선택 [N]명`** ((a) 치환, ADR-33). N = 선택한 name 중 현재 검색 필터 결과에 없는 수. N = 0이면 줄 자체를 그리지 않는다.
  - 위치: 검색 입력 아래, 목록 표(또는 `일치하는 에이전트가 없습니다` 안내) 바로 위. 검색 결과 0이면 `일치하는 에이전트가 없습니다` 아래가 아니라 위에 온다(요소 표 순서 그대로).
  - 표현: 기존 토큰만 쓴다 — `text-aux` 크기 + `text-text-secondary` 색. 새 색·새 컴포넌트·새 배경 없음(상태색을 쓰지 않는 이유: 오류가 아니라 사실 안내다).
  - **FR-009-AC5의 동작(버튼 라벨 `선택한 N명 가져오기`, N=0 비활성)은 바뀌지 않는다.** 화면에 정보 한 줄이 늘어날 뿐이다. ADR-35 비활성 이유 줄 목록도 바뀌지 않는다(이 줄은 비활성 이유가 아니다).
- 새 요소를 architect가 더하는 근거: 와이어프레임 p.6에 없는 **화면 상태 표현**이며, 기준 문서의 토큰·활자 규칙 안에서만 표현한다(architect 규칙 "기준에 없는 화면 상태가 필요하면 기존 토큰과 공통 컴포넌트로 표현하고 ADR에 남긴다"). 화면 구성·흐름·색 체계는 바꾸지 않는다.
- 영향: ui-spec SCR-05-R 검색 행 + 새 요소 행 1개. **Frontend 코드 수정 필요 — `ImportDialog`에 가려진 선택 수 파생 계산(`lib/derive/*` 순수 함수)과 안내 줄**(T-FIX-03). 계약 변경 없음.

### ADR-38 05-R 제목은 `?workflow`가 아니라 "현재 대상 워크플로우"를 따른다 (T-018 리뷰 Minor m4 / A-12, 2026-09-24)
- 배경: 캡처 `05-R-import-dropdown.png`에서 드롭다운은 `개발부서`가 선택돼 대상이 정해졌는데 제목은 대상 미정 문구(`기존 에이전트 가져오기`)다. ui-spec 제목 행의 데이터 출처가 `?workflow`라는 구현 해석은 문서 그대로지만, 드롭다운 기본값도 제목 기준도 ui-spec이 정한 적이 없다.
- 선택지:
  - ① 드롭다운 기본 미선택 + 제목 미정 + `가져오기` 비활성 — 초기 상태는 일치하지만, 사용자가 드롭다운에서 고른 **뒤**에도 제목 출처가 `?workflow`면 같은 불일치가 다시 난다. 즉 ①만으로는 문제가 해소되지 않는다. 또 "미선택"을 표현할 빈 옵션 라벨 문구가 확정 문서에 없어 새 문구를 만들어야 한다(SCR-06 `빈 선택(필수)`도 라벨을 정한 적이 없다).
  - ② **제목의 출처를 "현재 대상 워크플로우"로 바꾼다** — `?workflow`가 있으면 그 값, 없으면 드롭다운의 현재 선택값. 드롭다운 기본값은 현행(목록 첫 워크플로우)을 유지한다.
  - ③ 현행 유지 — 화면에 서로 어긋나는 두 표시가 남는다.
- 결정: **② 채택.**
  - 제목 데이터 출처 = **대상 워크플로우** = `?workflow` ?? 드롭다운 현재 선택값. 대상이 정해져 있으면 언제나 `<워크플로우>(으)로 기존 에이전트 가져오기`(조사 표기는 ADR-39)이고, 드롭다운을 바꾸면 제목도 함께 바뀐다.
  - 대상 미정 문구 `기존 에이전트 가져오기`는 **대상이 하나도 없을 때만** 쓴다. 현재 그 경우는 `registry.workflows.length === 0`(FR-009-AC7의 `먼저 워크플로우를 추가하세요` 상태) 하나다.
  - 드롭다운 기본값 = `registry.workflows`의 첫 항목. `api-spec.yaml` `Registry.workflows`가 "정상 구성 파일만, name 오름차순"이라 기본값이 결정적이다. 기본값을 두어도 제목이 대상을 크게 말하므로 "모르는 곳으로 가져가는" 위험이 없다.
  - ADR-35 비활성 이유 줄 목록은 **바뀌지 않는다**: ②에서는 "대상 미선택" 상태가 생기지 않으므로 새 비활성 지점이 없고, 기존 행 `05-R 가져오기 — 워크플로우 0개 → 이유 줄 없음(같은 팝업의 안내가 원인을 말한다)`이 그대로 유효하다.
- 영향: ui-spec SCR-05-R 제목 행·드롭다운 행. **Frontend 코드 수정 필요 — 제목 계산의 입력을 `?workflow`에서 대상 워크플로우 상태로 교체**(T-FIX-03). 계약 변경 없음. 사용자에게 보이는 변화는 "제목이 드롭다운을 따라간다"이며 FR-009-AC7이 정한 두 진입 방식(고정/드롭다운)은 그대로다.

### ADR-39 값 뒤 조사는 `(으)로`·`을(를)` 병기 표기로 쓰고, 조사 보정 코드를 두지 않는다 (T-018 리뷰 Minor m5 / A-13, 2026-09-24)
- 배경: ui-spec SCR-05-R 제목이 `<워크플로우>로 …`라 받침 있는 이름(`개발팀`)이면 `개발팀로`가 된다. 구현이 문구를 고치지 않은 것은 conventions §2 MUST상 옳다.
- 전수 조사(ui-spec 01~07의 모든 `<...>`·`[...]` 치환 자리 뒤 글자):
  | 문구 | 위치 | 판정 |
  |---|---|---|
  | `<워크플로우>로 기존 에이전트 가져오기` | SCR-05-R 제목 | **보정 대상** → `(으)로` |
  | `<name>를 <워크플로우>에서 제거할까요?` / `<name>를 제거할까요?` | SCR-06-6 제목 | **보정 대상** → `을(를)`. `<워크플로우>에서`의 `에서`는 받침과 무관 |
  | `<name>이(가) 여러 워크플로우에 있습니다 · 구성 파일을 확인하세요` | SCR-02 층 경고 줄 | 이미 병기. FR-006-AC11 확정 문구라 **수정 금지** |
  | `<name>.md이 이 창을 연 뒤 [hh:mm:ss]에 변경되었습니다.` | SCR-06-5 본문 | **대상 아님** — 조사가 붙는 대상은 치환값이 아니라 고정 접미 `.md`라 값에 따라 변하지 않는다. 변동이 없는 문구를 architect가 다시 쓰지 않는다(§2 MUST). **현행 유지**(T-019가 이 판단을 다시 열지 않는다) |
  | `<이름> 워크플로우를 삭제할까요?`, `팀장을 제거하면 <워크플로우> 층에 …`, `이미 팀장이 있습니다 (<lead>)`, `<name> · 구성 파일 참조 깨짐 (<workflow>)`, `· 부모 <라벨>`, `마지막 수신 <hh:mm:ss>` 등 | 01~07 나머지 | **대상 아님** — 치환값 바로 뒤가 공백·조사 아닌 글자·괄호·문장 끝이다 |
- 선택지:
  - (a) 코드로 받침을 판정해 조사를 고른다(`lib/format/particle.ts` 순수 함수) — 받침 판정 규칙이 확정 문서 어디에도 없고, `name`은 `^[a-z0-9-]{1,64}$`라 한글이 아닌 값(`dev-02`, `qa-01`)이 정상 입력이며 워크플로우 이름도 영문·숫자를 허용한다(`^[가-힣A-Za-z0-9 _-]+$`). 영문·숫자·기호의 한국어 읽기 받침을 architect가 새로 정해야 한다. 더 결정적으로, FR-006-AC11이 **이미 `이(가)` 병기로 확정**되어 있고 final 문서는 수정 금지라, (a)를 택하면 한 화면군 안에서 두 방식이 공존한다.
  - (b) **병기 표기로 통일한다** — `X(으)로`, `X을(를)`, 기존 `X이(가)`. 코드는 단순 문자열 이어붙이기로 끝나고, 모든 입력값에서 문법적으로 틀리지 않는다.
  - (c) 조사를 피하도록 문장을 다시 쓴다(`대상: <워크플로우>` 등) — 확정 문구를 architect가 재작성하는 일이라 §2 MUST에 걸린다.
- 결정: **(b) 채택.** 화면 문구에서 치환값 바로 뒤에 붙는 조사는 `을(를)` / `이(가)` / `은(는)` / `와(과)` / `(으)로` 병기 형태로 쓴다. **조사 보정 함수를 만들지 않는다** — `lib/format/*`에 두지 않고, `lib/text.ts`의 문구 상수·함수가 병기 문자열을 그대로 갖는다.
  - 바뀌는 문구 2곳: SCR-05-R 제목 `<워크플로우>(으)로 기존 에이전트 가져오기`, SCR-06-6 제목 `<name>을(를) <워크플로우>에서 제거할까요?` / `<name>을(를) 제거할까요?`.
  - 앞으로 새 문구를 확정할 때도 같은 규칙을 쓴다(conventions §2 MUST).
- 영향: ui-spec SCR-05-R 제목 행·SCR-06-6 제목 행, conventions §2 MUST 1건, tasks.md T-019 Done when의 테스트 이름 1건. **Frontend 코드 수정 필요 — `lib/text.ts` `importTitleFor`의 `로` → `(으)로`**(T-FIX-03). 06-6은 아직 미구현이라 T-019가 처음부터 병기로 만든다. 계약 변경 없음.

### ADR-40 `Dialog` 폭은 `size` 두 단계(`md`/`lg`)로 하고 화면마다 지정한다 (T-018 리뷰 Minor m6 / A-14, 2026-09-24)
- 배경: T-018 구현이 `Dialog`에 optional `size`(`md` 기본 = 기존 `max-w-md` 그대로, `lg` = 05-R)를 추가했다. ui-spec §공통 `Dialog` 행에 폭 규정이 없고, 4열 표가 들어가는 05-R을 `md`로 두면 열이 뭉개진다. 기본값이 기존과 같아 05-L·05-3·`ConfirmByNameDialog`에 회귀가 없고(리뷰어 확인, 팝업 폭 실측 766px), 와이어프레임 p.6도 오른쪽 팝업을 넓게 그린다. 리뷰어는 구현 재량으로 인정했고 남은 일은 문서화다.
- 선택지: (a) 팝업마다 폭 유틸리티를 직접 쓴다 — 공유 컴포넌트가 화면마다 다른 클래스를 받게 되어 §7 MUST(토큰·공통 컴포넌트)와 어긋나고 리뷰가 대조할 기준이 없다. (b) **`size` 두 단계를 문서에 고정하고 어느 화면이 어느 폭인지 ui-spec이 지정한다.** (c) 폭 토큰(`--width-dialog-*`)을 새로 만든다 — `docs/ui/design-tokens.md`에 팝업 폭 항목이 없어 새 단계 신설이 된다. ADR-31(19px 글꼴 단계를 만들지 않는다)과 같은 이유로 채택하지 않는다.
- 결정: **(b) 채택.** 값은 Tailwind 기본 스케일을 그대로 쓴다(ui-spec 매핑 표 `요소 사이` 행이 이미 "Tailwind 기본 spacing 스케일 사용"을 쓴 선례). 임의값(`max-w-[766px]`)은 §7 MUST대로 금지.
  | `size` | 클래스 | 폭 | 쓰는 팝업 |
  |---|---|---|---|
  | `md`(기본) | `max-w-md` | 448px | SCR-05-L, SCR-05-3, SCR-06-5, SCR-06-6, `HelperMissingDialog`, `ConfirmByNameDialog` |
  | `lg` | `max-w-3xl` | 768px | SCR-05-R, SCR-06 폼 |
  - SCR-06 폼을 `lg`로 정하는 근거: 한 팝업에 `이름`·`모델`(드롭다운 + 직접 입력)·`소속 워크플로우`·`역할` 라디오·`설명`·도구 체크박스 9종 + `기타` 입력·지침 textarea·각주·버튼 3개가 들어간다. 448px에서는 체크박스 9개가 여러 줄로 접히고 지침 textarea가 mono 본문을 담지 못해 `docs/ui/README.md`(요소 가림·뭉개짐은 결함)에 걸린다. 또 ui-spec이 06-5를 "폼 **위 작은 창**"으로 적어 06 폼이 06-5보다 넓다는 전제가 이미 문서에 있다.
  - SCR-06-6을 `md`로 정하는 근거: ui-spec이 "05-3은 06-6과 같은 구성"이라고 적었고 05-3이 `md`다. 두 화면은 같은 `ConfirmByNameDialog`를 쓴다(T-019 Done when).
  - `size` 밖의 새 단계가 필요하면 구현이 정하지 말고 architect에 확정을 요청한다(conventions §7 MUST).
- 영향: ui-spec §공통 `Dialog` 행, conventions §7 MUST 1건, tasks.md T-019 Done when 1줄. **코드 변경 없음**(T-018 구현이 이미 이 결정과 같다. T-019는 06 폼에 `size="lg"`를 넘긴다). 계약 변경 없음.

### ADR-41 `localhost` 접속은 허용 목록이 아니라 진입 주소 정규화로 푼다 (A-15, 2026-09-25)

- 배경(팀장 재현, 2026-09-24): 사용자가 `http://localhost:4180`으로 접속해 워크플로우를 만들자 403 `FORBIDDEN_ORIGIN`. `OriginFilter`는 허용 목록(`http://127.0.0.1:<public-port>` 하나)과 문자열 정확 비교를 한다. 같은 출처 GET은 `Origin` 헤더가 없어 `Sec-Fetch-Site: same-origin`으로 통과하지만 POST는 `Origin: http://localhost:4180`을 보내 거부된다 → **조회는 되는데 쓰기만 실패**하는 함정. 필터가 `chain.doFilter` 전에 반환하므로 파일 부작용은 없다(fail-closed 정상).
- 같은 함정이 도우미에도 있다: 도우미 허용 Origin 기본값은 FR-013-AC7이 `http://127.0.0.1:4180`으로 확정했으므로, `localhost`로 접속한 화면의 `Claude 열기`는 403이 되고 화면에는 FR-013-E2 확정 문구(`도우미 인증 실패 · 도우미를 다시 설치하세요`)가 떠 원인을 더 감춘다.
- 선택지
  - (a) 허용 목록 기본값에 `http://localhost:<public-port>`를 함께 넣는다(사용자 제안).
  - (b) **진입 시 루프백 호스트명(`localhost`·`[::1]`)을 `127.0.0.1`로 정규화한다.**
  - (c) 진입 주소가 `config.publicOrigin`과 다르면 화면에 안내 줄을 띄운다.
  - (d) 403 `FORBIDDEN_ORIGIN`의 `message`에 복구 방법을 넣는다.
- 결정: **(b) + (d) 채택, (a)·(c) 기각.**
  - (b) 채택 이유: ① 확정 진입 주소가 이미 `127.0.0.1:<포트>` 하나다(final 문서 User Scenarios 1 "`127.0.0.1:<포트>`에 접속한다", `docs/ui/screen-flow.md` `앱 접속 127.0.0.1:<포트>`) — 정규화는 요구사항을 바꾸는 것이 아니라 확정 진입 주소를 강제한다. ② 서버·도우미·수집 주소·07 표시값이 모두 `127.0.0.1` 하나를 전제로 하므로, 화면이 어느 주소로 열려도 뒤따르는 모든 요청이 한 Origin으로 통일된다(도우미 403 함정까지 같이 사라진다). ③ 허용 목록·바인딩·토큰 규칙을 하나도 건드리지 않아 NFR-04·DoD "다른 Origin 차단"과 무관하다. ④ 루프가 없다: 정규화 후 `hostname === '127.0.0.1'`이면 조건이 거짓이다. 포트·스킴·경로를 바꾸지 않으므로, 이미 연결에 성공한 소켓과 같은 곳으로 간다(`localhost`가 IPv4로 해석됐기 때문에 접속이 됐다는 사실 자체가 `127.0.0.1:<포트>`의 도달 가능성을 보장한다).
  - (a) 기각 이유: ① 도우미를 고치지 않으면 함정의 절반만 사라지는데, 도우미 기본값은 FR-013-AC7이 값까지 확정한 AC라 바꾸면 **확정 요구사항 수정**이 된다. ② `http://localhost:<포트>`는 보안상 우리 앱 자신과 같은 주체이지만(그 포트를 점유한 프로세스는 우리뿐이다), 허용 목록은 틀리면 바로 구멍이 되는 지점이라 "확정 진입 주소 하나"라는 최소 상태를 유지하는 편이 낫다. ③ 확정 진입 주소가 둘이 되면 북마크·문서·07 표시값·사람 확인 절차(H-1·H-4)가 두 주소로 갈린다. ④ `http://[::1]:<포트>`는 어차피 넣을 이유가 없다: compose가 `127.0.0.1:`(IPv4)만 공개하므로 `[::1]`로는 연결 자체가 안 되고, 브라우저는 `localhost`를 `::1`로 해석해 접속하더라도 `Origin`에 사용자가 입력한 호스트명(`localhost`)을 그대로 쓴다. 넣으면 절대 오지 않을 값이 허용 목록에 남는다.
  - (c) 기각 이유: 안내 줄은 확정 문서에 없는 화면 요소·문구를 새로 만들어야 하고(ui-spec 공통 영역 신설), 사용자는 안내를 읽고 주소를 직접 고쳐야 한다. (b)가 같은 상황을 사람 개입 없이 끝낸다. `publicOrigin` 비교 기반 리다이렉트도 기각한다: 포트가 다른 배치(E2E `4185`, ADR-45)에서 잘못된 주소로 튕길 수 있어 (b)의 "호스트명만 바꾼다"보다 위험하다.
  - (d) 채택 이유: (b)가 덮는 것은 `localhost`·`[::1]` 두 별칭뿐이다. 그 밖의 경로(호스트명을 직접 바꾼 접속 등)에서 403이 뜨면 화면에는 서버 `message`만 남으므로(conventions §4 MUST "message를 가공 없이 표시"), 복구 방법은 `message` 안에 있어야 한다. FR-008 오류 매핑에 403이 없어 생긴 공백을 서버 문구 한 줄로 메운다. 프론트에 403 전용 분기를 만들지 않는다.
- 확정 문구(신설): `허용되지 않은 출처입니다 · <publicOrigin> 주소로 다시 접속하세요` — `<publicOrigin>`은 서버가 치환해 완성 문장으로 보낸다(ADR-33 (a) 치환). **확정 문서(`final_requirements_function.md`, `docs/ui/`)에 같은 뜻의 문장이 없어 신설이며, 사용자 승인 전에는 구현하지 않는다**(T-FIX-05, E-004·E-005 선례).
- 정규화 규칙(구현 기준): `lib/origin.ts`에 순수 함수 `canonicalHref(href: string): string | null`(스킴이 `http:`이고 `hostname`이 `localhost` 또는 `[::1]`이면 호스트명만 `127.0.0.1`로 바꾼 href, 그 밖이면 `null`)과 `redirectToCanonical(loc: Location): boolean`(`canonicalHref`가 값을 주면 `loc.replace(...)` 후 `true`)을 둔다. `main.tsx`는 `createRoot`·렌더·첫 API 호출보다 먼저 `redirectToCanonical(window.location)`을 호출하고 `true`면 렌더하지 않는다. `location`을 인자로 받으므로 단위 테스트가 가짜 객체로 검증한다. `0.0.0.0`은 정규화 대상에 넣지 않는다(conventions §6 MUST가 코드에 `0.0.0.0` 문자열을 금지한다 — 이 경우는 (d)의 안내 문구가 담당).
- 영향: architecture §4.2·§5·§8.2(E2E-15)·§9, conventions §3 Frontend·§4·§6, api-spec `ForbiddenOrigin` 응답 설명, ui-spec §공통(진입 주소 정규화·403 표시). **Backend 수정 T-FIX-05(문구 승인 후), Frontend 수정 T-FIX-06, E2E 추가 T-024.** 허용 목록·바인딩·토큰·엔드포인트·필드는 그대로이며 `ApiError.code` enum도 그대로다. 계약 변경 없음(응답 `message` 문구만 바뀐다).

### ADR-42 04-5의 `설정 열기` 버튼은 01·02에서만 그린다 (T-022 리뷰 A-17, 2026-09-25)

- 배경: `registry.agentsDirMissing === true`이면 07 프로젝트 폴더 카드 본문이 04-5 블록으로 바뀐다(ui-spec SCR-04-5·SCR-07 카드 1 에러 열). 그 안의 `설정 열기`(primary)는 `/settings`로 이동하는 버튼인데, 07이 이미 `/settings`라 **눌러도 화면 변화가 없다**(캡처 `docs/reviews/screens/T-022/07-settings-agents-dir-missing.png`). `docs/ui/ui-rules.md` 2 "눌러도 아무 일이 없는 활성 버튼을 만들지 않는다"와 conventions §3 Frontend MUST가 금지하는 상태다. 반면 ui-spec SCR-04-5는 04-5를 07에도 쓰라고 지정했고 FR-001-E1은 04-5의 버튼으로 `다시 읽기`·`설정 열기` 둘을 확정했다 — 확정 문서끼리 충돌한다.
- 선택지
  - (a) **07에서만 `설정 열기`를 그리지 않는다.**
  - (b) 07에서만 비활성 + 이유 줄 — 이유 문구를 새로 만들어야 하고 ADR-35 목록에도 추가해야 한다.
  - (c) 현행(활성 + 자기 화면으로 이동)을 "확정된 차이"로 명시한다.
- 결정: **(a) 채택.**
  - `docs/ui/screen-flow.md` 표 마지막 행은 `사이드 탭 설정, 04-5 설정 열기` → **도착 07**로 확정한다. 즉 이 버튼은 **07로 들어오는 이동**이며, 07에서 나가는 이동(자기 자신으로 가는 이동)은 확정 문서 어디에도 없다. 07에서 이 버튼을 그리는 순간 확정 흐름표에 없는 자기 이동이 생긴다.
  - FR-001-E1의 의미는 유지된다: `.claude/agents/`가 없을 때 ① 04-5 블록을 보여주고 ② `다시 읽기`로 복구하며 ③ 설정 화면에 도달할 경로를 준다. 07은 이미 ③의 도착지이므로 01·02에서 `설정 열기`가 유지되는 한 세 가지가 모두 충족된다. `docs/ui/ui-rules.md` 5의 복구 버튼 예시(`다시 읽기`, `설정 열기`) 중 07에서 뜻이 있는 `다시 읽기`는 그대로 남는다. **요구사항 의미 변경·계약 변경 없음.**
  - (b) 기각: 이유 문구가 확정 문서(`final_requirements_function.md`, `docs/ui/`)에 없어 신설이 되고(전수 확인 결과 "이미 설정 화면입니다" 계열 문장 0건), ADR-35의 지정 기준("비활성 원인이 버튼 밖에 있어 화면만 보고는 알 수 없을 때")에도 맞지 않는다 — 원인이 "지금 보고 있는 화면 자체"라 화면만 보면 알 수 있는 쪽이다. 게다가 07에서는 **영원히 활성화되지 않는** 컨트롤이 남아, 비활성이 "조건이 갖춰지면 눌린다"는 뜻인 ui-rules 2 표와도 어긋난다.
  - (c) 기각: conventions §3 Frontend MUST·ui-rules 2의 명문 금지를 문서로 승인하는 셈이라 규칙의 판정력을 잃는다. 04-5는 01·02·07 공용이라 같은 논점이 T-024 화면 대조에서 다시 열린다.
- 구현 기준: `AgentsDirMissing`에 optional prop(예: `showOpenSettings?: boolean`, 기본 `true`)을 두고 **화면이 값을 넘긴다**. 07(`ProjectFolderCard`)만 `false`를 넘기고 01(`KpiSection`)·02(`WorkflowsScreen`)는 기본값을 쓴다. 공용 컴포넌트가 `useLocation`·라우트·`window.location`을 읽어 스스로 판정하지 않는다 — ADR-30(`TopBar` 프로젝트 칩)과 같은 층위의 규칙이다. `설정 열기`의 라벨·variant·동작(01·02에서 `/settings`로 이동)은 바꾸지 않는다.
- 사용자에게 보이는 변화: **있음.** 07에서 `agentsDirMissing === true`일 때만 primary 버튼 1개가 사라진다. 새 문구 0건, 새 요소 0건, 새 색·레이아웃 0건, 01·02 동작 변화 0건. 확정 문서가 열거한 버튼을 한 화면에서 빼는 결정이므로 **사용자 승인 대상 여부는 팀장이 판단하고, 승인 전에는 구현하지 않는다**(E-004·E-005·E-006 선례, T-FIX-08).
- 영향: ui-spec §공통 `AgentsDirMissing` 행·SCR-04-5 버튼 행·SCR-07 카드 1 에러 열, conventions §7 MUST 1건, tasks.md A-17·T-FIX-08·추적 매트릭스. **ADR-35의 비활성 지점 목록은 바뀌지 않는다**(비활성이 아니라 미표시다). 계약 변경 없음(`api-spec.yaml`·`realtime-spec.md` 무관).

### ADR-43 07 카드 열 폭은 `max-w-3xl`(768px)로 확정하고 새 폭 토큰을 만들지 않는다 (T-022 리뷰 A-18, 2026-09-25)

- 배경: 와이어프레임 p.4의 07 카드 열은 x=288~1107 = **819px**로 화면을 채우지 않는다(리뷰어가 PDF 콘텐츠 스트림을 복원해 실측. 01·02·03은 1111~1127px로 꽉 채운다). `819px`은 `docs/ui/design-tokens.md`에도 Tailwind 기본 스케일에도 없고, 임의값(`max-w-[819px]`)은 conventions §7 MUST가 금지한다. T-022 구현은 가장 가까운 `max-w-3xl`(768px, **−51px / −6.2%**)을 썼고, 리뷰는 절충 자체는 합리적이나 §7 MUST("목록에 없는 새 차이는 구현이 정하지 말고 architect에 확정을 요청")상 **절차적 사후 확정**이 필요하다고 판정했다.
- 선택지: (a) **`max-w-3xl`(768px) 확정** (b) 새 폭 토큰(`--width-settings-column: 819px`)을 만든다 (c) `max-w-4xl`(896px, +77px / +9.4%)로 넓힌다.
- 결정: **(a) 채택.**
  - `docs/ui/design-tokens.md`의 폭 항목은 `사이드바 폭 248px`·`오른쪽 상세 패널 폭 360px` 둘뿐이고 본문 카드 열 폭은 없다. 819px은 확정 토큰이 아니라 와이어프레임 렌더 실측값이므로, 토큰으로 승격하려면 `docs/ui/design-tokens.md` 개정이 선행돼야 하고 그것은 architect 권한 밖이다 — ADR-31(19px 글꼴 단계를 만들지 않는다)과 같은 이유로 (b) 기각.
  - 값은 Tailwind 기본 스케일에서 고른다(ADR-40 `Dialog` 폭과 같은 방식). 768px은 `lg` 팝업(`max-w-3xl`)과 같은 값이라 "넓은 콘텐츠 열"의 폭이 화면·팝업에서 한 값으로 모인다. (c)는 기준보다 넓어져(+9.4%) 오차가 더 크고 근거가 없다.
  - 요소 누락·가림·뭉개짐은 없다(리뷰 캡처 대조에서 미보고). 07은 라벨 열 + 값 한 줄 구조라 −6.2%가 줄바꿈을 만들지 않는다.
- 함께 확정하는 미세 차이(리뷰 Minor, **전부 현행 유지·코드 변경 없음**): 카드 안쪽 여백 `p-card-lg`(18px, 와이어프레임 ≈23px), 라벨 열 `w-32`(128px, ≈140px), 페이지 좌여백 `px-page-x`(32px, 40px). 셋 다 `docs/ui/design-tokens.md`가 값까지 확정한 토큰(`카드 안 여백 16~18px`, `화면 좌우 여백 32px`)을 쓴 결과이고 01·02·03·04~06과 공유한다. 와이어프레임 실측에 맞추려면 토큰을 바꿔야 하는데, 그러면 **전 화면이 바뀌어 기준 PNG 01·02·03 대조가 깨진다**. `docs/ui/ui-rules.md` 머리말("`design-tokens.md`의 값만 쓴다")대로 토큰이 와이어프레임 렌더 실측보다 우선한다. 라벨 열 `w-32`는 토큰이 아닌 Tailwind 기본 스케일 값이지만, 07 안에서만 쓰이는 정렬 폭이고 128px에서 가장 긴 라벨(`워크플로우 구성`)이 한 줄에 들어가므로 그대로 둔다.
- 사용자에게 보이는 변화: **없음**(현행 구현을 그대로 확정한다). 새 문구·새 요소·새 토큰 0건. 코드 변경 0건.
- 영향: ui-spec SCR-07에 "와이어프레임 p.4와의 확정된 차이" 목록 신설, conventions §7 MUST 2건(차이 목록에 SCR-07 추가, 07 카드 열 폭 명시). tasks.md A-18 기록. 계약 변경 없음.

### ADR-44 스냅샷·자체 API 값을 기다리는 버튼은 값이 오기 전까지 비활성(이유 줄 없음) (T-021 리뷰 A-19, 2026-09-26)

- 배경: `TopBar`는 `AppShell`의 `ready` 게이트 **밖**에 있고(`components/common/AppShell.tsx:28`), 02는 `Claude 열기 · 기본 세션`을 `rightExtra`로 꽂는다(`app/router.tsx:26`). 그래서 첫 스냅샷 전(`snapshotStore.config === null`)에도 이 버튼만 활성으로 보이는데, `useHelperOpen.open`은 `helperUrl === null`이면 `pendingRef`도 세우지 않고 조용히 return한다(`dialogs/helper-missing/useHelperOpen.ts:58`) — 클릭이 팝업·에러·상태 변화 **어느 것도 없이** 사라진다. `docs/ui/ui-rules.md` 2와 conventions §3 Frontend MUST("누르면 아무 일도 없는 활성 버튼 금지")가 금지하는 상태인데, ui-spec SCR-02 요소 표의 `로딩` 열은 이 버튼을 `활성`으로 지정했다(확정 전 `ui-spec.md:187`) — 확정 문서끼리 충돌했다.
- 로딩 구간이 실제로 얼마나 지속되는가 (판단 근거)
  - **정상 경로는 수십 ms다.** `GET /api/browser-token` → `EventSource /api/stream` 연결 → 서버가 연결 직후 `snapshot`을 보낸다(realtime-spec §2). 실측: `GET /api/state`(같은 `SnapshotAssembler` 경로) 에이전트 100·워크플로우 30에서 **max 12.7ms**, SSE 방송 p95 **2.4ms**(T-007 리뷰, `docs/progress.md:46`). 루프백이라 왕복 지연이 없다.
  - **실패 경로는 상한이 없다.** 토큰 발급 실패·`EventSource.onerror`·heartbeat 45초 무수신이면 `attemptStateFallback()`(`GET /api/state`)을 한 번 시도한 뒤 **5 → 10 → 20 → 30초 백오프**로 재연결한다(`api/stream.ts:12-14, 65-73, 86-102, 150-180`). 폴백까지 실패하면 `snapshotStore.ready === false`가 백오프 주기 동안 계속 유지되고 종료 조건이 없다. ui-spec SCR-04-2 자신이 "30초 넘게 미수신이면 스켈레톤 위에 04-3 배너"를 규정해 **장시간 로딩을 이미 전제한다**.
  - 결론: "SSE 연결 후 즉시 닫히는 찰나"는 **정상 경로에만** 성립한다. 컨테이너 재시작 중·SSE 차단 상황에서 사용자가 이 버튼을 반복해 누르는 시간은 분 단위가 될 수 있다.
- 선택지
  - (a) **로딩 중 비활성, 이유 줄 없음.**
  - (b) 로딩 중 비활성 + 이유 줄 — 이유 문구를 새로 만들어야 하고 ADR-35 목록에도 추가해야 한다.
  - (c) 활성 유지 + 클릭 시 최소 피드백(팝업·인라인 한 줄).
  - (d) 현행 유지를 conventions MUST의 공식 예외로 기록한다.
- 결정: **(a) 채택.**
  - ADR-35의 이유 줄 지정 기준은 "비활성 원인이 그 버튼 밖에 있어 **화면만 보고는 알 수 없을 때** 지정한다. 원인이 버튼 라벨 자신 또는 같은 팝업·카드 안의 입력 상태로 바로 보이면 지정하지 않는다"다. 첫 스냅샷 전에는 **같은 상단바의 프로젝트 칩이 스켈레톤**이고(`TopBar` `ProjectChip`, ui-spec §공통 로딩 예외), 본문 전체가 04-2 공통 스켈레톤이며, 사이드바 `CollectorStatus`도 스켈레톤이다. 원인이 화면 전체에 이미 보이므로 **이유 줄을 지정하지 않는 쪽**이다. ADR-35 세 번째 항("요청 진행 중 비활성은 라벨이 상태를 말하므로 이유 줄을 붙이지 않는다")과 같은 갈래다.
  - 그래서 (a)는 **신설 문구 0건**이다. "비활성을 택하면 문구 신설이 따라온다"는 A-19의 전제는 "비활성이면 이유 줄이 붙는다"를 가정한 것인데, ADR-35가 이미 이유 줄을 **선택적**으로 만들어 두었다.
  - 이미 같은 규칙이 코드에 있다: `components/ui/CopyButton.tsx:50`은 `value === null`이면 비활성이고 이유 줄을 붙이지 않으며, 그 파일 주석이 근거로 ADR-35와 "같은 카드 안 스켈레톤"을 든다. ADR-44는 그 선례를 전 화면 규칙으로 승격할 뿐이며 새 판단을 들여오지 않는다.
  - **ADR-42(A-17)와 일관되는 이유**: ADR-42는 같은 범주(눌러도 아무 일 없는 활성 버튼)에서 ① 현행 유지를 "명문 MUST를 문서로 승인하는 셈"이라 기각하고 ② 비활성 + **신설** 이유 줄도 기각한 뒤 ③ **신설 문구 0건**인 해법을 택했다. ADR-44도 같은 순서로 (d)·(c)를 기각하고 신설 문구 0건 해법을 택한다. ADR-42가 (b)를 기각한 세 근거 중 둘(문구 신설 / ADR-35 기준 불일치)은 여기서도 그대로 유효하고, 세 번째("07에서는 **영원히** 활성화되지 않는 컨트롤이 남는다")는 **여기서는 성립하지 않는다** — 로딩은 스냅샷이 오면 반드시 끝나는 일시 상태이므로, 비활성이 "조건이 갖춰지면 눌린다"는 `docs/ui/ui-rules.md` 2 표의 뜻과 어긋나지 않는다. ADR-42는 그 세 번째 근거 때문에 "미표시"를 택했고, 그 근거가 없는 A-19는 "일시 비활성"을 택한다. 두 결론이 다른 것이 아니라 **같은 기준(신설 문구 0 + 무동작 활성 버튼 제거)을 각 상황에 적용한 결과**다.
  - (c) 기각: 재사용할 수 있는 확정 문구가 없다. `HelperMissingDialog`(`열기 도우미가 응답하지 않습니다` + `helper/install.sh로 설치한 뒤 다시 시도하세요`)는 **사실과 다르다** — 아직 `config.helperUrl`을 몰라 도우미를 호출조차 하지 않은 상태인데 미설치라고 단정하면 FR-013-AC9·E1의 뜻을 왜곡하고 사용자를 불필요한 재설치로 잘못 유도한다. `도우미 인증 실패 …`(E2)·`팀장이 없습니다`(E4)도 상황이 다르다. 새 문구(`잠시 후 다시 시도하세요` 등)는 신설이므로 (b)와 같은 문제로 돌아간다.
  - (d) 기각: ① 위 실측대로 "찰나"가 실패 경로에서 성립하지 않는다. ② ADR-42가 같은 범주의 현행 유지를 이미 기각했으므로, 여기서 예외를 만들면 `conventions.md`의 같은 MUST(§3 Frontend 1건 + §7 3건)가 한꺼번에 판정력을 잃는다. ③ 예외로 남겨도 T-024 화면 대조·재리뷰에서 같은 논점이 다시 열린다.
- 확정 규칙(세 화면 공통): **버튼이 눌렸을 때 쓸 값(스냅샷 `config`, 자체 API 응답, 사전 확인 결과)이 아직 없으면 그 버튼을 `disabled`로 두고 이유 줄은 붙이지 않는다. 값이 도착하면 자동으로 활성이 된다. 값이 없는 동안 클릭 핸들러 안에서 조용히 `return`하는 방식으로 대체하지 않는다.**

| 화면·버튼 | 현재 코드 | 조치 |
|---|---|---|
| 02 `Claude 열기 · 기본 세션` (`screens/workflows/WorkflowsHeader.tsx:30`) | `ready` 게이트 **밖**(`TopBar` `rightExtra`) → `config === null`에도 활성. 클릭 시 `useHelperOpen`이 조용히 return | **비활성으로 바꾼다** — T-FIX-09 |
| 03 `팀장 호출 · 터미널 열기` (`screens/workflow-detail/Header.tsx:78`) | `AppShell` `ready` 게이트 **안**이고 `WorkflowDetailScreen`이 `config`·`registry`·`live` 중 하나라도 null이면 `return null`(`WorkflowDetailScreen.tsx:27`) → 첫 스냅샷 전에는 **렌더 자체가 없다**. 이후 `lead === null`이면 `disabledReason='팀장 없음'`(ADR-35 지정 지점) | 규칙 충족. **코드 변경 없음** |
| 07 `테스트로 열기` (`screens/settings/ClaudeOpenCard.tsx:90-98`) | `ready` 게이트 **안** + `helperStatus.kind !== 'installed'`면 `disabled`. 진입 직후 `checking`(자체 `GET /health` 대기) 동안도 비활성이고 이유 줄은 없다 — 같은 카드 `열기 도우미` 행이 `확인 중…`을 보여주므로 ADR-35 기준을 충족한다 | 규칙 충족. **코드 변경 없음**. ui-spec `로딩` 열 표기만 `-` → `비활성`으로 정정 |
| 07 `명령 복사` (`components/ui/CopyButton.tsx:50`) | `value === null`(= `settings` 미수신)이면 비활성, 이유 줄 없음 | 규칙 충족. 이 ADR의 코드 선례 |

- ui-spec `로딩` 열 전수 조사(요소 표 전 행): `로딩` 열이 `활성`인 행은 **SCR-02 `Claude 열기 · 기본 세션` 한 행뿐**이었다(확정 전 `ui-spec.md:187`, 이 ADR로 `비활성`으로 정정). 나머지 버튼 행은 `스켈레톤`(공통 스켈레톤이 덮는다 — ADR-32), `비활성`(03 헤더 `팀장 호출`·패널 `정의 수정`·`제거`), 진행 중 라벨(`다시 읽는 중…` 등), 또는 `-`다. `-`인 버튼 행(01 `에이전트 워크플로우 열기 →`, 02 `+ 에이전트 만들기`·`+ 워크플로우 추가`·줌 버튼·미니맵, 04-7 `워크플로우 추가`, 07 `테스트로 열기`·`명령 복사`)은 모두 `ready` 게이트 안이라 첫 스냅샷 전에 렌더되지 않아 같은 결함이 없다. 게이트 **밖**에 있는 나머지 컨트롤은 사이드바 탭 3개(`NavLink` 라우팅)와 04-3 `지금 재연결`(`stream.reconnectNow()`)뿐이고 둘 다 스냅샷 값을 쓰지 않아 로딩 중에도 정상 동작한다. **잠재 결함은 02 한 곳으로 한정된다.**
- 사용자에게 보이는 변화: **있음** — 02 진입 직후(정상 경로 수십 ms, 실패 경로에서는 더 길게) `Claude 열기 · 기본 세션`이 점선·faint 비활성 모양(ADR-29)으로 보이고 첫 스냅샷이 오면 secondary 활성으로 바뀐다. 새 문구 0건, 새 요소 0건, 새 색·토큰 0건, 라벨·배치·클릭 동작 변화 0건. `docs/ui/screens/02-workflows.png`는 스냅샷을 받은 뒤의 화면이라 대조 결과가 달라지지 않는다. 확정 문서(ui-spec)가 지정한 상태 값을 바꾸는 결정이므로 **사용자 승인 대상 여부는 팀장이 판단한다**(E-004·E-005·E-006, ADR-42 선례).
- 요구사항 의미 변경 여부: **없음.** FR-013-AC1(기본 세션 명령 문자열)·AC3(02에 버튼 하나뿐)·AC6(도우미 요청 본문)은 그대로다. 로딩 중에는 애초에 `helperUrl`이 없어 호출이 일어나지 않았으므로 **호출이 가능한 순간의 동작은 하나도 바뀌지 않는다**.
- 영향: ui-spec §공통 "값이 오기 전 버튼 상태"(신설)·SCR-02 요소 표 `Claude 열기` 행 `로딩` 열·SCR-07 `테스트로 열기` 행 `로딩` 열, conventions §3 Frontend MUST 1건 추가·§7 MUST 1건 추가, tasks.md A-19·**T-FIX-09**·추적 매트릭스. **ADR-35의 이유 줄 지정 목록은 바뀌지 않는다**(이유 줄을 붙이지 않는 비활성이다). **계약 변경 없음** — `api-spec.yaml`·`realtime-spec.md`·ui-spec 데이터 출처 열은 건드리지 않는다.

### ADR-45 E2E 공개 포트를 `4190` → `4185`로 바꾼다 (Node `fetch` bad port, A-20, 2026-09-27)

- 배경(팀장 재현, 2026-09-27, Node v24.9.0): §8.1이 지정한 재생 명령 `node tools/replay/replay.mjs --url http://127.0.0.1:4190/hooks/events …`이 **구조적으로 성공할 수 없었다**. `replay.mjs`는 Node 전역 `fetch`(undici)를 쓰고, `4190`은 WHATWG Fetch 표준의 **"bad port"(blocked ports) 목록**(sieve / ManageSieve)에 있다. undici는 요청을 보내기 전에 포트를 검사해 **연결 시도조차 하지 않고** 즉시 거부한다.
  - 실측: `fetch('http://127.0.0.1:4190/x')` → `fetch failed | cause: bad port`(연결 시도 없음) / `fetch('http://127.0.0.1:4185/x')`·`fetch('http://127.0.0.1:4180/x')` → `connect ECONNREFUSED`(정상적으로 연결 시도).
  - 서버는 정상이었다: 컨테이너 기동 상태에서 `curl -X POST http://127.0.0.1:4190/hooks/events` → **204**. 브라우저 쪽 충실도 문제도 없다: Playwright Chromium은 `4190`을 정상 처리했고(`page.goto`·in-page `fetch`·`EventSource`·request 컨텍스트 모두 성공, 하네스 25개 통과) 우회 플래그(`--explicitly-allowed-ports`)도 쓰지 않았다. **문제는 Node 전송 계층 하나로 한정된다.**
  - 영향 범위: E2E-04(`states.jsonl` 재생)·E2E-13(`showcase.jsonl` 재생 후 스크린샷) 실행 불가. 브라우저 조작만 하는 시나리오와 이미 완성된 하네스(globalSetup·E2E-08·E2E-14·격리 테스트)는 영향 없다.
- 선택지
  - (a) **E2E 공개 포트를 bad port 목록에 없는 값(`4185`)으로 바꾼다.**
  - (b) 재생만 Node 전송 계층을 갈아끼워 실행한다(`replay.mjs` 무수정, 하네스에 전용 전송 구성요소 추가).
  - (c) `replay.mjs`를 `node:http`로 다시 쓴다.
- 결정: **(a) 채택. `tools/e2e/compose.e2e.yaml` 공개 포트를 `127.0.0.1:4185:4180`으로, `JAYSTUDIO_PUBLIC_PORT`·`JAYSTUDIO_ALLOWED_ORIGINS`를 `4185` 기준으로 바꾼다.**
  - (a) 채택 이유
    1. **요구사항 밖의 값이다.** `4190`은 `final_requirements_*.md`에 한 번도 나오지 않고 설계가 정한 E2E 전용 공개 포트다(운영 `4180`·`4181`, dev `8080`·`5173`은 확정 값이며 **전부 bad port 목록 밖이라 영향 없다**). 따라서 요구사항 변경이 아니고 사용자에게 보이는 동작도 바뀌지 않는다.
    2. **원인을 고치는 유일한 선택지다.** bad port는 "우리 도구가 우회할 대상"이 아니라 표준이 정한 금지 목록이고, 목록은 **늘어나는 방향으로만 개정된다**. 포트를 옮기면 `replay.mjs`뿐 아니라 앞으로 붙일 모든 Node 기반 도구(전역 `fetch`를 쓰는 것이 기본값이다)가 한 번에 안전해진다. (b)·(c)는 `replay.mjs` 한 곳만 구제하고 같은 함정을 다음 도구에 남긴다.
    3. **리뷰 통과한 이음새를 건드리지 않는다.** `replay.mjs`는 T-023에서 리뷰 PASS됐고 단위 테스트가 `fetchImpl` 주입을 이음새로 쓴다. (c)는 그 이음새와 테스트를 다시 설계해야 하고, 통과한 코드를 원인과 무관한 이유로 고치는 변경이 된다. (b)는 설계 문서에 없는 구성요소를 하네스에 하나 늘려 §8.1의 "실제로 띄워 연결하는 구성요소" 목록과 실제 하네스가 어긋난다.
    4. 변경 표면이 값 하나다: compose 3줄 + 문서 + 하네스 상수. 코드 로직 변경 0건.
  - (b)·(c) 기각 이유: 위 2·3. 추가로 (b)는 "재생만 다른 전송 계층"이라 재생 경로가 나머지 하네스와 달라지고, 전송 계층 차이 때문에 생기는 실패를 앞으로 디버깅할 때 원인 후보가 하나 늘어난다.
- **포트 선택 근거 (bad port 전수 확인)**: WHATWG Fetch blocked ports 목록에서 4000번대는 `4045`(lockd)·`4190`(sieve) 둘뿐이다. 새 값 **`4185`는 목록에 없고**(팀장 실측: `connect ECONNREFUSED` = 정상 연결 시도), 함께 쓰는 **`4191`(dry-run 도우미)·`4192`(다른 Origin 정적 서버)도 목록에 없다** — 둘은 그대로 둔다. `4185`는 `418x` 대역을 유지해 운영 `4180`·`4181`과 같은 계열로 읽히면서 값이 겹치지 않는다. E2E 포트는 개발 머신에서 비어 있기만 하면 되고, 점유돼 있으면 `compose up`이 실패해 조용히 넘어가지 않는다.
- 기존 기록과의 정합성 (함께 정리한다)
  - "실제 브라우저로 `4190`을 검증했다"는 팀장 기록·`docs/progress.md`·`docs/reviews/*`의 `4190` 언급은 **지난 실행의 사실 기록이므로 고치지 않는다**. 그 기록의 결론(브라우저·서버는 `4190`에서 정상)은 이 ADR의 근거로 그대로 살아 있고, 포트를 옮기는 이유는 브라우저가 아니라 **Node 도구** 때문이다. 앞으로의 실행 기준 포트는 이 ADR 이후 `4185`다.
  - ADR-41의 "포트가 다른 배치(E2E `4190`)" 문구는 `4185`로 정정했다. 정규화 규칙 자체(`canonicalHref`는 **호스트명만** 바꾸고 포트·경로·쿼리·해시를 유지)는 포트 값과 무관하므로 바뀌지 않는다.
  - `frontend/src/lib/origin.test.ts`(`4190`을 'E2E 포트' 예시 데이터로 사용)와 `helper/test/cors.test.mjs`(`parseAllowedOrigins`의 `4190` 예시)는 **테스트가 여전히 옳고 그대로 통과한다** — 둘 다 "포트를 바꾸지 않는다"·"문자열을 그대로 다룬다"를 검증하는 예시 값일 뿐 실제 접속을 하지 않는다. 주석의 `E2E 포트` 표현만 사실과 어긋나므로 문구 정정은 **선택 사항**이며, 이 ADR은 코드 수정을 요구하지 않는다.
  - `tools/e2e/lib/harness-utils.ts`가 bad port를 피해 `node:http`를 쓰는 것은 포트를 옮긴 뒤에도 **그대로 두면 된다**(동작에 문제 없음). 주석의 이유 설명만 사실과 달라지므로 문구 정정은 선택 사항이다.
- 사용자에게 보이는 변화: **없음.** 운영 공개 포트(`4180`)·도우미 포트(`4181`)·수집 주소·`publicOrigin`·07 표시값·허용 Origin 규칙·바인딩 규칙(`127.0.0.1:` 접두, NFR-04)이 전부 그대로다. 바뀌는 것은 개발 머신에서만 뜨는 E2E 컨테이너의 호스트 공개 포트 하나다.
- 요구사항 의미 변경 여부: **없음.** `4190`은 확정 문서에 없는 값이고, FR·AC·E·NFR 문장 어디도 E2E 포트를 지정하지 않는다. E2E-04·E2E-13·E2E-15가 검증하는 AC·E 목록은 그대로다.
- 영향: architecture §7(Docker Desktop 행)·§8.1(Server+Frontend·열기 도우미·hook 입력 3행)·§8.2(E2E-08·E2E-14·E2E-15)·ADR-41 문구, conventions §8 MUST 1건 신설(자동 검증 포트는 bad port 목록 밖에서 고른다), tasks.md **T-024**(Tools·Done when의 포트 문구). **계약 변경 없음** — `api-spec.yaml`·`realtime-spec.md`는 운영 포트(`4180`·`4181`)와 dev(`8080`)만 참조하고 `4190`이 없으며, ui-spec은 포트를 `<포트>` 자리값으로만 쓴다(SCR-07 `수집 주소` 행은 `settings.collectUrl` 출처). 엔드포인트·메시지·필드 0건 변경.
- 팀장이 고칠 파일(architect 권한 밖): `tools/e2e/compose.e2e.yaml`(`ports`·`JAYSTUDIO_PUBLIC_PORT`·`JAYSTUDIO_ALLOWED_ORIGINS`), `CLAUDE.md` Commands e2e의 `E2E_BASE_URL`, `README.md` e2e 절, 하네스 상수(`tools/e2e/playwright.config.ts`·`lib/e2e-state.ts`·`tests/e2e-14.spec.ts`).

### ADR-46 사용자 요청 UI 개선 3건 — hover·focus 규칙 신설 / 01 대표 카드 활동 줄 한 줄 clamp / 01 실시간 이벤트 표 고정 높이 + 내부 스크롤 (A-22, 2026-09-28)

- 배경: 사용자가 프론트 디자인 개선 4건을 요청했고 팀장이 확정 문서와 대조해 분류했다. 4번(워크플로우 삭제 조건을 모달로)은 FR-017-AC1과 정면 충돌해 `/planner`로 갔다. 남은 3건은 **확정 요구사항 문구(`final_requirements_*.md`)를 바꾸지 않고** 설계 문서 안에서 규정할 수 있는지가 판단 대상이었다. 셋 다 가능하다고 판정했고, **세 항목 모두 새 FR·AC·E·새 화면 문구 0건**이다. 한 ADR로 묶는 이유: 세 항목이 모두 "확정 UI 기준(`docs/ui/`)을 고치지 않고 기존 토큰·기본 스케일 안에서 표현한다"는 같은 제약으로 판단되고, 항목 3의 부수 효과가 항목 2와 같은 화면(01)·같은 캡처(E2E-13)에 닿기 때문이다. 결론은 항목별로 나눠 적는다.
- 공통 제약(세 항목에 모두 적용): `docs/ui/`(design-tokens.md·ui-rules.md·screens/*.png)는 확정 UI 기준이라 수정하지 않는다. 새 색·크기·폭·높이 토큰 단계 신설은 architect 권한 밖이다(ADR-31 선례). Tailwind 임의값(`bg-[#…]`·`h-[380px]`)은 conventions §7 MUST가 금지한다(ADR-43 선례). 사용자에게 보이는 **새 문구를 만들지 않는다**(conventions §2 MUST).

#### A. 버튼·사이드 탭 hover(및 `:focus-visible`) 규칙을 §공통에 신설한다

- 배경: 사용자 요청은 "사이드 탭 포함 모든 버튼에 마우스 호버링할 때 색이 바뀌는 등의 이벤트를 줄 것"이다. 확정 문서에 hover 규정이 **없다** — `docs/ui/ui-rules.md`에는 37행(이름 12자 말줄임 + 마우스 올리면 전체)과 52행(마스킹 원문은 마우스 오버로도 보여주지 않는다) 두 줄뿐이고 `ui-spec.md`에도 hover 항목이 없다. 구현에도 hover가 **2곳뿐**이다(`screens/home/FeaturedWorkflows.tsx:39`, `screens/workflows/Floor.tsx:143`, 둘 다 `hover:bg-selected`). 나머지 버튼·사이드 탭·드롭다운·입력창에는 피드백이 전혀 없다.
- 핵심 난점: `bg/selected #1D2738`은 `docs/ui/design-tokens.md:14`가 "선택된 사이드 탭" 용도로 정의한 토큰이고 `Sidebar`가 현재 탭에 실제로 쓴다. 비선택 탭 hover에 같은 토큰을 쓰면 **hover와 선택 상태가 배경으로 구분되지 않는다**(왼쪽 초록 바만 차이). 그리고 `design-tokens.md`에는 hover 단계용 토큰이 없고 신설은 권한 밖이다.
- 배경 토큰 밝기 순서(값에서 계산): `bg/page (14,19,32)` ≈ `bg/inset (16,22,31)` < `bg/chrome (18,24,38)` < `bg/card-alt (20,27,41)` < `bg/card (22,29,44)` ≈ `bg/soft (23,31,46)` < `bg/selected (29,39,56)`. 인접 단계 중 **채널당 +5 이상 벌어져 눈에 보이는 이동은 `chrome→soft`, `card→selected`, `soft→selected`, `inset→selected`**다. `card→soft`(+1~2)는 사실상 보이지 않는다.
- 선택지
  - (a) **hover 기본값은 `bg/selected`로 하고, "선택됨" 표시에 `bg/selected`를 쓰는 요소(사이드 탭·05-R 목록 행)만 hover를 `bg/soft`로 한다. 선택된 항목에는 hover 표현을 주지 않는다. 상태 색 채움을 가진 `Button` variant(`primary`·`terminal`·`danger`)는 색 토큰을 교체하지 않고 `brightness-110` 한 단계만 준다.**
  - (b) 모든 hover를 `bg/soft`로 통일한다.
  - (c) hover 단계 토큰(`bg/hover`)을 신설한다 → `docs/ui/design-tokens.md` 개정 필요.
  - (d) 채움 버튼은 hover 없이 두고 어두운 표면만 hover를 준다.
- 결정: **(a) 채택. 요구사항 변경 없이 구현 가능하다 — 새 토큰이 필요하지 않다.**
  - 밝기 순서가 **기본 < hover < 선택**으로 정리된다. 사이드 탭은 표면 `bg/chrome`(18,24,38) → hover `bg/soft`(23,31,46) → 선택 `bg/selected`(29,39,56)로 세 값이 모두 다르고, 각 이동이 채널당 +5 이상이라 보인다. 여기에 선택 탭만 갖는 왼쪽 초록 바(`border-l-4 border-running`)와 글자색(hover는 `text/secondary`→`text/primary`, 선택은 `text/primary`)이 보조 신호로 남는다. 즉 **"선택 상태와 구분되는 hover"가 기존 토큰만으로 성립한다** — 팀장이 지적한 핵심 제약이 해소된다.
  - (b) 기각: `bg/card` 표면(01 대표 카드)·`bg/soft` 표면(드롭다운·입력창·`secondary` 버튼)에서 `bg/soft`로의 이동이 채널당 +1~2라 보이지 않는다. 사용자가 본 문제(피드백이 없다)를 그대로 남긴다.
  - (c) 기각: ADR-31(19px 글꼴 단계 신설 거부)·ADR-43(819px 폭 토큰 신설 거부)과 같은 이유로 architect 권한 밖이다. (a)가 성립하므로 요구사항으로 되돌릴 필요가 없다.
  - (d) 기각: 사용자가 말한 "모든 버튼"에서 가장 눈에 띄는 주 동작 버튼(`정의 수정`·`만들기`·`저장`·`에이전트 워크플로우 열기 →`)이 빠진다.
  - `brightness-110`을 쓰는 이유(`primary`·`terminal`·`danger`): `state/running`보다 밝은 초록, `state/danger`보다 밝은 빨강, `running-soft`/`danger-soft`보다 진한 옅은 채움이 `design-tokens.md`에 **없다**. 다른 토큰으로 배경을 바꾸면 `primary`가 `terminal` 모양이 되거나(정체성 상실) `running-border`처럼 어두워져 비활성으로 보인다. `brightness`는 **색 값을 새로 정의하지 않고 토큰 색의 밝기만 한 단계 올리므로 색조·상태 의미가 유지**되고, `running-soft`·`danger-soft`가 이미 알파 합성으로 정의된 이 디자인 언어 안에 있다. 대비는 오히려 올라간다(`text/on-accent #0B1119` 위 초록이 밝아진다 → ui-rules 8의 4.5:1 유지).
  - 기존 hover 2곳은 **그대로 유지하고 규칙으로 승격한다(코드 변경 0건)**: 01 대표 카드 표면은 `bg/card`, 02 책상 칸 표면은 `bg/inset`이고 둘 다 "선택됨" 표시에 `bg/selected`를 쓰지 않으므로 (a)의 기본값에 정확히 부합한다. `design-tokens.md`의 `쓰는 곳` 열은 **대표 용례이지 배타적 허용 목록이 아니다** — `ui-rules.md` 머리말이 정한 하드 제약은 "`design-tokens.md`의 값만 쓴다"이고, `bg/selected`를 hover에 쓰는 것은 새 값을 만드는 행위가 아니다. 이 해석을 ui-spec §공통에 명문화해 두 곳이 규정 밖 사용으로 오판되지 않게 한다.
  - 함께 확정한 범위 판단
    - **비활성 버튼(`disabled`·`disabledReason`)은 hover 표현이 없다.** 이유: 눌리지 않는 컨트롤에 피드백을 주면 거짓 정보가 된다(`ui-rules.md` 2 "눌러도 아무 일이 없는 활성 버튼을 만들지 않는다"의 같은 취지).
    - **클릭 동작이 없는 요소에는 hover를 주지 않는다**: 01 실시간 이벤트 표 행(ui-spec SCR-01 "행 클릭 없음"), KPI 카드, 칩·배지, 배너, 02 로비 항목, 03 정의 없는 서브에이전트 작은 캐릭터(선택 불가), 03 `빈 자리` 칸. 이유: hover 피드백이 "클릭할 수 있다"는 신호가 되어 Out of Scope(전체 로그 화면 등)를 기대하게 만든다.
    - **선택된 항목에는 hover 표현이 없다**(사이드 탭 선택 항목, 05-R 선택 행, 03 선택된 오피스 칸). 이유: 선택 표시가 최종 상태이고, `bg/selected`보다 밝은 배경 토큰이 없어 "선택 위의 hover"를 표현할 값이 없다.
    - **드롭다운(`<select>`)·입력창(텍스트·검색·textarea)은 대상에 포함**한다(표면 `bg/soft` → hover `bg/selected`). 클릭으로 포커스·목록이 열리는 클릭 표면이고, 사용자 요청의 "사이드 탭 포함 모든 버튼"이 가리키는 조작 가능 요소다.
    - **텍스트 링크(`text/link`)는 hover에 밑줄을 더한다**(이미 밑줄이면 변화 없음). `text/link`보다 밝은 링크 색 토큰이 없어 색 교체가 불가능하고, 밑줄은 색·토큰과 무관한 텍스트 장식이다.
    - **`:focus-visible`을 함께 규정한다**: hover와 **같은** 표현을 적용하고, 브라우저 기본 outline을 **지우지 않는다**(`outline-none`·`focus:outline-none` 금지). 이유: 키보드 사용자가 같은 피드백을 받아야 하고(NFR-12, ui-rules 8), focus ring 색·굵기는 `design-tokens.md`에 없어 새로 정의하면 (c)와 같은 문제가 된다. 현재 코드에 `outline-none` 사용이 0건이라 금지 규칙이 기존 구현을 깨지 않는다.
    - **전환(transition)**: 배경·글자·테두리 **색** 변화에만 `transition-colors duration-200`을 쓴다(conventions §7 기존 MUST "애니메이션 금지, 상태 색 전환 200ms 이하만"의 한도 그대로. `Button`은 이미 이 클래스를 갖고 있다). `brightness`·밑줄에는 전환을 두지 않는다 — filter·text-decoration 전환은 위 MUST가 허용한 "색 전환"이 아니다.
  - 구현 위치: **공용 컴포넌트에서 처리하고 화면별로 흩뿌리지 않는다**(`Button`, `Sidebar`, `Select`/`SearchInput`/`TextInput`/`TextArea`, `CopyButton`은 `Button` 경유). 화면 전용 클릭 영역(01 대표 카드, 02 책상 칸, 03 오피스 칸, 05-R 목록 행)만 그 화면 컴포넌트에 두고, 값은 ui-spec §공통 표에 있는 것만 쓴다. 이유: 같은 규칙이 20개 화면 파일에 복제되면 회귀·리뷰 기준이 사라진다(ADR-24·ADR-29와 같은 이유).
- 사용자에게 보이는 변화: **있음** — 사이드 탭(비선택), 모든 `Button` variant, 드롭다운·입력창, 01 대표 카드, 02 책상 칸, 03 오피스 칸, 05-R 목록 행에 마우스를 올리면 배경이 한 단계 밝아지거나(어두운 표면) 전체가 10% 밝아진다(채움 버튼). 텍스트 링크는 밑줄이 생긴다. 키보드 이동 시 같은 표현이 보인다. **새 문구 0건, 새 요소 0건, 새 색 값·새 토큰 0건, 레이아웃·배치·클릭 동작 변화 0건.** `docs/ui/screens/*.png` 기준 이미지는 hover·focus가 없는 정적 상태이므로 **대조 결과가 달라지지 않는다**(기준 PNG와의 확정된 차이 목록에 추가할 항목 없음).
- 요구사항 의미 변경 여부: **없음.** FR·AC·E 어느 문장도 hover를 규정하지 않고, 이 결정은 표시 피드백만 더한다. 상태 표시 규칙(ui-rules 1 "색만으로 구분하지 않는다")과 충돌하지 않는다 — hover는 상태가 아니라 포인터 위치 피드백이고 상태 글자를 건드리지 않는다.

#### B. 01 대표 워크플로우 카드의 `최근 활동 · <요약>`은 CSS 한 줄 clamp + `title`(마스킹된 값)로 줄인다

- 배경: 카드 하단 활동 줄이 길어 카드가 지저분해진다는 요청이다. 요약 자체를 없애면 `final_requirements_function.md:242`("최근 활동 요약")·`ui-spec.md:177`(`최근 활동 · <요약>`) 변경이라 `/planner` 대상이므로, **요약을 유지하고 한 줄로 잘라 보여주는** 방향으로 확정한다.
- 선택지: (a) **CSS 한 줄 clamp(`truncate` = `overflow-hidden` + `text-ellipsis` + `whitespace-nowrap`) + 부모 flex 항목 `min-w-0` + `title` 전체 문자열** (b) 글자 수 기준 말줄임(`lib/format/ellipsis.ts`를 N자로 재사용) (c) 요약을 `title`만 남기고 `summary`를 빼기.
- 결정: **(a) 채택.**
  - **새 값이 없다.** `truncate`·`min-w-0`은 Tailwind 기본 유틸리티이고 숫자 값을 갖지 않는다. (b)는 N(글자 수)이라는 **새 확정 값**을 만들어야 한다 — 카드가 3열 그리드라 폭이 화면 폭에 따라 변하고, `FR-006-AC4`의 12자는 고정폭(mono) `name` 전용 확정값이라 한글·영문이 섞인 요약에 재사용할 근거가 없다.
  - **기존 단언이 그대로 유효하다.** CSS clamp는 DOM 텍스트를 보존하므로 `tools/e2e/tests/e2e-04.spec.ts:534`(`최근 활동 · 도구 실행 · Bash · <마스킹된 summary>`를 `toContainText`)와 `lib/derive/featuredWorkflows.test.ts`의 `title`·`summary` 검증이 수정 없이 통과한다. (b)는 DOM 텍스트를 잘라 두 단언을 모두 깨뜨리고 FR-005-AC3·AC8 추적을 다시 손대야 한다.
  - (c) 기각: `ui-spec.md:177`이 확정한 "소속 에이전트 `lastEvent` 중 최신 `title · summary`"를 바꾸는 것이라 확정 데이터 출처 변경(= 요구사항 경로)이다.
  - 형태는 `docs/ui/ui-rules.md:37` 선례(말줄임 + 마우스를 올리면 전체)와 **같다**. 다른 점은 기준이 글자 수가 아니라 요소 폭이라는 것뿐이고, 37행은 `name` 한 요소에만 걸린 규칙이라 충돌하지 않는다.
- **마스킹 규정(반드시 지킨다)**: `title` 속성에 넣는 값은 화면에 보이는 것과 **같은 문자열**, 즉 서버가 이미 마스킹해 보낸 `lastEvent.title`·`summary`로 만든 활동 줄 그대로다. 마스킹 전 원문을 얻는 경로를 새로 만들지 않는다(서버는 `Masker.mask()` 이후만 저장·전송한다 — FR-015-AC2, FR-005-AC8, conventions §6 MUST). 따라서 `docs/ui/ui-rules.md:52`("가리기 전 원문은 마우스 오버로도 보여주지 않는다")를 위반하지 않는다 — 툴팁에 나오는 값에도 `••••••••`가 그대로 들어 있다. 이 문장을 ui-spec·conventions에 MUST로 명시한 이유: 적어 두지 않으면 구현이 "툴팁에는 전체를 보여준다"를 원문 복원으로 오해할 위험이 있다.
- 적용 범위: 01 대표 카드 하단 활동 줄 한 곳(`최근 활동 · <요약>` / `마지막 활동 · <yyyy-mm-dd hh:mm>` / `활동 없음` 모두 같은 요소이므로 같은 처리. 뒤 두 값은 짧아 실제로 잘리지 않는다). **01 실시간 이벤트 표의 `요약` 열은 대상이 아니다**(요청 밖 — 요구사항에 없는 변경을 하지 않는다).
- 사용자에게 보이는 변화: **있음** — 대표 카드 활동 줄이 카드 폭을 넘으면 한 줄로 잘리고 `…`가 붙는다. 마우스를 올리면 (마스킹된) 전체 문자열이 브라우저 기본 툴팁으로 보인다. 카드 높이가 요약 길이에 따라 들쭉날쭉해지지 않는다. 새 문구 0건, 새 토큰 0건. 기준 PNG `01-home.png`의 대표 카드는 요약이 한 줄이라 대조 결과가 달라지지 않는다.
- 요구사항 의미 변경 여부: **없음.** FR-005-AC3·AC4가 요구하는 카드 구성·정렬·수치는 그대로고, 표시하는 데이터도 그대로다.

#### C. 01 실시간 이벤트 표는 고정 높이(`h-96`) + 내부 스크롤로 두고, 01 캡처 방식을 뷰포트 clip으로 바꾼다

- 배경: 이벤트 50개가 한 표에 다 늘어서 01 화면이 매우 길어진다. 사용자 원래 요청(10줄 페이지네이션)은 `FR-005-AC6`("실시간 이벤트는 최신순 최근 50개만 보인다. 전체 로그 화면은 없다")과 범위 밖 목록(`final_requirements_function.md:468` "원문·전체 로그 화면, 이벤트 검색, 알림")에 어긋나고 관제 목적(50개를 한눈에)에도 역행해 팀장이 반대했고, 사용자가 우회안을 택했다.
- 선택지: (a) **표를 감싸는 자체 스크롤 컨테이너에 고정 높이 `h-96`(384px) + `overflow-y-auto`, `thead` sticky** (b) 페이지네이션 (c) 50개 → N개로 줄이기 (d) 새 높이 토큰(`--height-events-table`) 신설.
- 결정: **(a) 채택.**
  - 50개 전부가 DOM에 남아 스크롤로 모두 접근되므로 **FR-005-AC6이 그대로 유지된다**. 카드 제목 옆 `최근 [N]개 · 전체 로그 화면 없음`의 N(= `recentEvents.length`)도 변하지 않는다. 가상 스크롤·페이지네이션·행 접기 없음.
  - 높이 값 근거: 행 높이 = `py-2`(8+8) + 본문 13px 줄 ≈ 36~37px → `h-96`(384px)은 **sticky 헤더 1줄 + 본문 9~10줄**에 해당해 요청("대략 10줄")에 맞는다. `h-96`은 Tailwind 기본 스케일 값이고 임의값(`h-[380px]`)이 아니다. **(d) 기각** — `design-tokens.md`에 표·목록 높이 항목이 없어 토큰 신설이 되고 그것은 architect 권한 밖이다(ADR-31·ADR-43과 같은 이유). 값을 기본 스케일에서 고르는 방식은 ADR-40(`Dialog` 폭)·ADR-43(07 카드 열 폭) 선례와 같다. 02 하단 컨트롤 영역 `h-44`(176px, ADR-23)도 같은 방식으로 정해졌다.
  - (b) 기각: 위 배경(FR-005-AC6·범위 밖 목록·관제 목적). (c) 기각: FR-005-AC6의 "50개"를 바꾸는 요구사항 변경이다.
  - `thead`는 **sticky(`sticky top-0`) + 배경 `bg/card`**(카드 배경과 같은 토큰이라 새 색이 없다). 이유: 스크롤 중에도 `시각·워크플로우·에이전트·이벤트·요약` 열 머리가 보여야 표를 읽을 수 있다. 이 sticky는 **자체 스크롤 컨테이너 안의 표 머리**이고, conventions §7 MUST가 금지한 "스크롤되는 콘텐츠 위에 `fixed`·`sticky`로 덮는 보조 컨트롤 배치"(02 줌·미니맵, ADR-23)와는 대상이 다르다 — 가리는 것이 아니라 같은 표의 머리 행이며 요소를 덮지 않는다. 그 MUST 문구에 예외를 명시한다.
  - 접근성: 스크롤 컨테이너에 `tabIndex={0}`(키보드 화살표·PageUp/Down 스크롤) + `role="region"` + `aria-labelledby`로 **기존** 카드 제목 `실시간 이벤트`를 가리킨다 → **새 문구 0건**(`aria-label`에 새 문장을 쓰지 않는다). 포커스 표시는 A의 규칙대로 브라우저 기본 outline을 지우지 않는다. 표 행은 클릭 동작이 없으므로 hover 표현을 주지 않는다(A).
  - 02 층 스크롤 영역(ADR-23)과의 표기 일관성: 같은 용어("자체 스크롤 컨테이너", `overflow-y-auto`)를 쓴다. 다른 점은 02가 뷰포트 높이에 맞춘 `flex:1; min-height:0`이고 01은 **고정 높이**라는 것이다 — 01 본문은 일반 흐름(페이지 스크롤)이라 뷰포트 기준 계산이 없고, 고정 높이가 "화면이 길어지는 문제"를 직접 푼다. `position: fixed` 오버레이 금지는 01에도 그대로 적용된다.
- 부수 효과 판단 (기준 이미지·E2E 캡처)
  - **기준 PNG 대조**: 표 영역 높이·동시에 보이는 행 수·01 문서 총 높이가 `docs/ui/screens/01-home.png`(1440×1140, 목업은 5행이 그대로 늘어난 모습)과 달라진다. 기준 이미지는 수정 금지이므로 **ui-spec SCR-01에 "기준 PNG와의 확정된 차이" 목록을 신설**해 적는다(SCR-02·SCR-03·SCR-05-R·SCR-07의 같은 목록과 형식·효력이 같다 — ADR-25·ADR-28·ADR-37·ADR-43). 요소 구성·순서·열 구성은 기준 그대로이므로 그 밖의 누락·추가는 여전히 결함이다.
  - **E2E-13 캡처**: 현재 `tools/e2e/tests/e2e-13.spec.ts`의 `captureFrame`은 01만 `fullPage: true`로 찍고 **`documentHeight >= 1140`을 단언**한다(`:143-151`). 표가 384px로 고정되면 01 문서 높이가 콘텐츠와 무관해지고 1140px 아래로 내려갈 수 있어 **이 단언이 깨질 수 있다**(정확한 값은 구현 시 실측한다 — 표 클램프로 줄어드는 양이 400px 이상이라 경계 근처다). 그래서 **01 캡처를 콘텐츠 높이에 의존하지 않게 바꾼다: 캡처 직전 뷰포트 높이를 기준 프레임 높이(1440×1140)로 바꾼 뒤 되돌리고, `fullPage` 없이 뷰포트 clip으로 저장한다.** `AppShell`이 `min-h-screen`이므로 문서 높이가 최소 1140px로 보장되어 산출물은 항상 1440×1140이고, `needsFullPage` 특례가 사라져 **02·03과 같은 한 가지 캡처 방식**으로 통일된다. 02·03의 뷰포트(1440×1024)와 캡처 방식은 건드리지 않는다(02는 `100dvh` 레이아웃이라 뷰포트 높이를 바꾸면 레이아웃이 바뀐다).
  - **T-024 Minor 4(01 캡처에서 사이드바 하단 `수집 상태` 카드가 프레임 밖)**: 이 변경은 **해소 방향**이다. Minor 4의 원인은 `fullPage` 캡처에서 `AppShell`(`min-h-screen`)·`Sidebar`(`justify-between`)가 문서 전체 높이(≫1140px)로 늘어나 하단 카드가 1140px 프레임 아래로 밀리는 것이다. 뷰포트 1140으로 찍으면 표가 384px로 고정되어 문서 높이가 프레임 높이에 가까워지고, 사이드바가 프레임 높이로 늘어나 **하단 카드가 프레임 안에 들어온다**. 마스킹 각주(`token·key·password 등 기본 패턴은 ••••••••로 가림`)도 표 아래로 400px 이상 올라와 프레임 안에 들어올 가능성이 높다. **단 조건부다** — 표 클램프 후에도 01 콘텐츠 높이가 1140px를 넘으면 사이드바가 다시 프레임 밖으로 밀린다. 그래서 T-025는 캡처 시 문서 높이 실측값을 annotation에 남기고, 1140px을 넘으면 리뷰에 보고한다(악화 여부를 실측으로 판정한다). 어느 쪽이든 두 요소는 같은 테스트가 DOM으로 단언하므로 구현 누락 판정에는 영향이 없다.
  - **E2E 행 단언**: `toBeVisible()`은 요소가 뷰포트·스크롤 영역 안에 있을 것을 요구하지 않으므로(레이아웃 상자가 있고 `display:none`·`visibility:hidden`이 아니면 통과) 스크롤로 가려진 행에 대한 기존 단언(`export TOKEN=••••••••` 등)은 그대로 유효하다. `최근 [N]개` 단언(`e2e-01.spec.ts:113`, `e2e-04.spec.ts:521`, `e2e-13.spec.ts:319`)도 N이 변하지 않아 유효하다. 앞으로 이 표에 `toBeInViewport` 기반 단언을 쓰지 않는다(conventions §8 MUST에 적는다).
  - **conventions §8 캡처 문구 정정**: 기존 "뷰포트 1440×(1140|1020|880)"은 실제 설정과 어긋나 있었고(A-21 항목 2 / T-024 Minor 8), 이 결정으로 01만 뷰포트가 달라지므로 함께 정정한다: "02·03은 뷰포트 1440×1024, 01은 캡처 직전 1440×1140으로 바꿔 찍고 1440×(1140|1020|880)으로 저장한다." A-21 항목 2는 같은 사실 정정이므로 이 ADR로 해소된다(새 판단이 아니다).
- 사용자에게 보이는 변화: **있음** — 01 실시간 이벤트 표가 약 10줄 높이의 고정 영역이 되고 그 안에서 스크롤한다(헤더 행은 스크롤 중에도 보인다). 01 화면 전체 길이가 400px 이상 짧아져 페이지 스크롤이 거의 사라진다. 표에 보이는 데이터·열·문구·개수는 그대로다. 새 문구 0건, 새 토큰 0건.
- 요구사항 의미 변경 여부: **없음.** FR-005-AC6(최신순 50개, 전체 로그 화면 없음)·AC7·AC8이 그대로다. 페이지네이션·검색·원문 보기를 만들지 않으므로 범위 밖 목록도 건드리지 않는다.

#### 세 항목 공통 — 계약·영향

- **계약 변경 없음**: `api-spec.yaml`·`realtime-spec.md`는 손대지 않는다. 세 항목 모두 **이미 오는 데이터를 표시하는 방법**만 정한다 — hover·focus는 표시 상태, 항목 B는 같은 문자열의 잘림·툴팁, 항목 C는 같은 `snapshot.recentEvents`(50개)의 배치다. 새 엔드포인트·필드·메시지·쿼리 파라미터가 없고 ui-spec 요소 표의 **데이터 출처 열도 한 줄도 바뀌지 않는다**.
- 영향: ui-spec §공통 "hover·focus 표현"(신설)·§공통 `Button`·`Sidebar` 행·SCR-01 대표 카드 행·실시간 이벤트 표 행·SCR-01 "기준 PNG와의 확정된 차이"(신설), conventions §7 MUST 4건 신설·1건 보강·§8 MUST 2건(캡처 문구 정정·표 단언), architecture §8.2 E2E-13 행, tasks.md **A-22**·**T-025**·추적 매트릭스(새 ID 없음 — 기존 FR-005-AC3·AC6·AC8, FR-006-AC4 형태 선례만 참조).

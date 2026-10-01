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
| `JAYSTUDIO_ALLOWED_ORIGINS` | 선택 | `http://127.0.0.1:${JAYSTUDIO_PUBLIC_PORT}` | 허용 Origin. **dev 프로필은 이 목록을 `http://127.0.0.1:5173` 하나로 대체한다(추가가 아니다 — ADR-47)**. `localhost`·`[::1]` 표기는 넣지 않는다(ADR-41) |
| `SPRING_PROFILES_ACTIVE` | 선택 | 없음(운영) / `dev` | dev는 허용 Origin을 Vite 하나로 대체하고 CORS 응답 헤더를 켠다. 디버그 로깅 기본 꺼짐. **컨테이너 이미지에서는 쓰지 않는다**(compose·Dockerfile에 설정 0건. 켜면 4180 Origin이 막혀 앱 전체가 403이 된다 — fail-closed, ADR-47) |

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
- **dev에서 화면을 제공하는 주소는 `http://127.0.0.1:5173` 하나다.** 호스트 dev 서버(8080)는 API·hook 수집 전용이고 SPA를 제공하지 않는다 — 정적 파일은 이미지 빌드 단계에서만 `backend/src/main/resources/static/`에 복사되고(`Dockerfile`) 저장소에는 그 폴더가 없다. 그래서 dev에서 8080을 브라우저로 열어도 앱이 뜨지 않고, `Origin: http://127.0.0.1:8080`을 보내는 페이지가 존재하지 않는다(ADR-47의 근거).
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

**허용 목록 범위 (ADR-41, ADR-47)**: 허용 목록은 **어느 프로필에서도 항상 한 개**다 — 운영 프로필은 `http://127.0.0.1:${JAYSTUDIO_PUBLIC_PORT}`, dev 프로필은 `http://127.0.0.1:5173`(기본값을 **더하지 않고 대체한다**). 즉 dev에서 `Origin: http://127.0.0.1:8080`은 **403이 맞다**(ADR-47: dev의 8080은 SPA를 제공하지 않아 그 Origin을 만드는 페이지가 없다). `http://localhost:<포트>`·`http://[::1]:<포트>`는 **넣지 않는다**. 같은 포트의 다른 루프백 호스트명 문제는 허용 목록을 넓히지 않고 진입 주소 정규화로 푼다.

**진입 주소 정규화 (ADR-41)**: 정적 파일(`/`, `/assets/**`)에는 Origin 검사가 없어 `http://localhost:<포트>`로도 앱이 열리고, 같은 출처 GET은 `Origin` 헤더가 없어 `Sec-Fetch-Site`로 통과해 조회까지 성공한다. 그러나 POST·PUT·DELETE는 `Origin: http://localhost:<포트>`를 보내 403 `FORBIDDEN_ORIGIN`이 되고, 도우미(`--allowed-origins http://127.0.0.1:4180`, FR-013-AC7)도 같은 이유로 403이 된다 — "조회는 되는데 쓰기만 안 되는" 함정이다. 이를 없애기 위해 프론트는 **첫 렌더·첫 API 호출 전에** `location.hostname`이 `localhost` 또는 `[::1]`이면 호스트명만 `127.0.0.1`로 바꿔 `location.replace`한다(스킴·포트·경로·쿼리·해시는 그대로). 확정 진입 주소가 `127.0.0.1:<포트>`이므로(final 문서 User Scenarios 1, `docs/ui/screen-flow.md` `앱 접속 127.0.0.1:<포트>`) 이 정규화는 확정 진입 주소를 강제하는 것이고, 허용 목록·바인딩·토큰 규칙은 그대로다.

**403 `FORBIDDEN_ORIGIN` 응답 문구**: `message` = `허용되지 않은 출처입니다 · <publicOrigin> 주소로 다시 접속하세요`. `<publicOrigin>`은 서버가 `config.publicOrigin` 값으로 치환해 완성 문장으로 보낸다(예: `허용되지 않은 출처입니다 · http://127.0.0.1:4180 주소로 다시 접속하세요`). 프론트는 conventions §4대로 `message`를 가공 없이 표시한다. 정규화(위)가 덮지 못하는 접속 경로(예: 호스트명을 직접 바꾼 접속)에서 사람이 복구 방법을 알 수 있게 하는 마지막 안내다. **이 문구는 확정 문서에 없는 신설 문구이며 사용자 승인 전에는 구현하지 않는다(T-FIX-05).**
- dev 프로필에서는 `publicOrigin`이 `http://127.0.0.1:8080`(= `JAYSTUDIO_PUBLIC_PORT=8080`, hook 수집 주소 표시에 쓰는 값)이라 이 안내가 화면을 제공하지 않는 주소를 가리킨다. 그러나 **사람이 이 문구를 보는 경로가 dev에 없다** — dev의 앱은 5173에서만 열리고 5173은 허용 목록에 있으므로 403이 나지 않으며, 403이 나는 쪽(curl 등 브라우저 밖 클라이언트)은 화면이 없다. 그래서 dev용 별도 문구를 만들지 않는다(신설 문구 금지, ADR-47).

**브라우저 토큰** (ADR-01): 서버 기동 시 메모리에 32바이트 난수(hex 64자)를 만든다. 프론트는 첫 로딩에 `GET /api/auth/browser-token`으로 받아 메모리(모듈 변수)에만 둔다. localStorage·cookie에 저장하지 않는다. 서버가 재시작되면 토큰이 바뀌고 모든 변경 요청이 403 `UNAUTHORIZED_TOKEN`으로 실패하므로, 프론트는 403 `UNAUTHORIZED_TOKEN`을 받으면 토큰을 1회 재발급받아 재시도한다.

**수집 토큰**: `.jaystudio/collect-token` (32바이트 hex, 모드 600, 끝 개행 없음). 기동 시 없으면 생성(`.jaystudio/`도 함께 생성). 만들 수 없으면 기동 실패(NFR-05, ADR-16).

**도우미 토큰**: `.jaystudio/helper-token` (도우미가 생성, 같은 형식). 서버는 읽기만 하고 `GET /api/helper/token`으로 전달한다. 파일이 없으면 `token: null`.

**dev 프로필 차이**: 허용 Origin을 `http://127.0.0.1:5173` **하나로 대체**(ADR-47), CORS 응답 헤더(`Access-Control-Allow-Origin`=요청 Origin, `Allow-Headers`=`Content-Type, X-JayStudio-Browser-Token`, `Allow-Methods`) 활성. 운영 프로필은 CORS 헤더를 내지 않는다.

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

> **후속 정정 (ADR-49, 2026-09-28)**: 아래 전수 목록 중 네 항목이 정정됐다 — 05-R 목록 행은 hover 대상에서 **빠지고**(클릭 동작 없음 + 팝업 표면에서 비가시), 04-6 `정상 파일은 수정 팝업에서 편집 →`도 **빠지고**(클릭 동작 없는 안내 문구), 04-7 점선 카드의 버튼은 ① → **③**으로 옮겨지고, 03 상단바 브레드크럼 링크가 ④에 **추가**됐다. 전환 클래스는 `Button` 한 곳으로 한정됐다. 현재 규정은 `ui-spec.md` §공통과 ADR-49를 함께 본다.

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

### ADR-47 dev 프로필 허용 Origin은 기본값을 **대체**한다(항상 한 개) — 문서를 구현에 맞게 정정한다 (A-16, 2026-09-28)

- 배경: `application-dev.yaml:9`가 `allowed-origins`를 `http://127.0.0.1:5173` 하나로 두고 `OriginFilter.resolveAllowedOrigins`(:47-57)는 값이 있으면 기본값을 **대체**한다 → dev 허용 목록 = {5173}. 그런데 문서 세 곳(`architecture.md` §4.2 표·§5 "허용 목록 범위"·`conventions.md` §6)은 dev를 "추가 → {8080, 5173}"로 적었다. 리뷰어 실측(dev 기동 + `Origin: http://127.0.0.1:8080`)은 **403**이었다(T-FIX-05·T-FIX-06 리뷰 [Major · 선행 결함], scaffold 커밋 9f156d2부터 존재).
- 선택지
  - (a) **문서를 구현에 맞게 정정한다** — dev는 허용 목록을 `http://127.0.0.1:5173` **하나로 대체**. 코드 변경 0건.
  - (b) 구현을 문서에 맞게 넓힌다 — `application-dev.yaml`을 `http://127.0.0.1:${JAYSTUDIO_PUBLIC_PORT},http://127.0.0.1:5173`으로.
- 결정: **(a) 채택. 코드 변경 없음. 구현이 옳고 문서가 틀렸다.**
  - **결정적 사실: dev의 8080은 SPA를 제공하지 않는다.** 프론트 정적 파일은 이미지 빌드 단계에서만 `backend/src/main/resources/static/`에 복사되고(`Dockerfile:16`) 저장소에는 그 폴더가 없다(`backend/src/main/resources/`에는 `application*.yaml`·`schema.sql`뿐). 따라서 dev에서 브라우저로 8080을 열어도 앱이 뜨지 않고, **`Origin: http://127.0.0.1:8080`을 보내는 페이지가 존재할 수 없다**. ADR-41이 없애려던 함정("정적 파일로 앱이 열려 조회는 되는데 POST만 403")은 **앱이 열리는 주소에서만** 성립하므로 dev의 8080에는 성립하지 않는다. A-16이 재현한 403은 `curl`이 Origin 헤더를 손으로 붙인 경우이고, 그것이 403인 것은 규칙대로다(§5 "브라우저 밖 클라이언트 차단").
  - **NFR-04·§5 DoD("다른 Origin 차단")와의 정합**: (a)는 허용 목록을 **더 좁게** 유지하므로 DoD 방향과 같다. (b)는 dev 허용 목록을 둘로 늘리는데, 그 둘째 항목은 어떤 페이지도 제공하지 않는 주소이므로 **이득 0 · 노출 면적만 +1**이다(8080에 다른 프로세스가 앉는 경우에만 의미가 생기고, 그 경우는 dev 서버 자신이 8080을 못 잡아 기동 실패한다).
  - 403 안내(ADR-41)의 dev 막다른 주소 문제: dev `publicOrigin`은 8080(hook 수집 주소 표시용 값)이라 안내가 화면 없는 주소를 가리키지만 **사람이 그 문구를 보는 경로가 dev에 없다**(앱은 5173에서만 열리고 5173은 허용된다 → 403이 나지 않는다. 403을 받는 쪽은 화면이 없는 클라이언트다). 그래서 dev 전용 안내 문구를 만들지 않는다(신설 문구 금지, conventions §2). (b)를 택해도 8080은 여전히 화면이 없어 이 문제가 해결되지 않는다 — 즉 이 항목은 선택지 판단에 영향을 주지 않는다.
  - 운영 영향: 운영 이미지는 dev 프로필을 쓰지 않는다(compose·Dockerfile에 `SPRING_PROFILES_ACTIVE` 설정 0건). 만약 컨테이너에 `dev`를 켜면 허용 목록이 5173 하나가 되어 4180 앱의 모든 API가 403이 된다 — **fail-closed(기능 정지, 보안 구멍 없음)**. 이 성질을 §4.2 표에 적어 둔다.
  - 코드 주석은 이미 (a)와 같다(`OriginFilter.java:44-45` "dev 프로필은 ... 이 값 자체를 `http://127.0.0.1:5173`으로 대체한다") → 정정 후 코드·주석·문서가 한 방향으로 정렬된다.
- 사용자에게 보이는 변화: **없음**(문서 정정. 실행 동작·화면·문구 변화 0). 요구사항 의미 변경 없음 — NFR-04·§5 DoD는 "확정 진입 주소 외 Origin 차단"이고 (a)는 그것을 더 엄격히 지킨다. 계약 변경 없음.
- 영향 문서: `architecture.md` §4.2 표 2행·§4.4(dev 8080이 SPA를 제공하지 않는다는 사실 추가)·§5 "허용 목록 범위"·§5 403 문구 항·§5 "dev 프로필 차이", `conventions.md` §6 Origin MUST. **코드·테스트 변경 0건**(`OriginFilterTest`의 기존 기대값이 그대로 옳다).

### ADR-48 02 미니맵 재측정 시점은 현행 5개 트리거로 확정하고, 책상 pitch는 현행 구현을 확정한다 (A-21, 2026-09-28)

**A. 미니맵 뷰포트 테두리 재측정 시점 (리뷰 Minor 3)**

- 배경: `ui-spec` SCR-02 미니맵 행은 계산식(`scrollTop/scrollHeight`, `clientHeight/scrollHeight`, 최소 4%)만 정하고 **언제 다시 재는지**를 정하지 않았다. 현행 `Minimap.tsx`의 재측정 방아쇠는 ① 마운트 ② 층 스크롤 영역 `scroll` ③ `window` `resize` ④ `registry.workflows` 변경 ⑤ `zoom` 변경(T-FIX-10)이다. 리뷰어는 ⓐ 검색·층 선택 필터로 `scrollHeight`가 바뀔 때 ⓑ `live.lobby`가 늘어날 때 테두리가 그대로임을 확인했다. FR-006-AC6은 "미니맵이 동작한다", AC8은 필터 결과만 규정하므로 **현행은 문서 위반이 아니다**.
- 선택지: (a) `ResizeObserver(층 스크롤 영역 자식)`를 도입해 세 경우를 한 번에 덮는다 (b) **현행 5개 트리거를 ui-spec에 전수로 명문화하고 그대로 확정한다** (c) 의존성 배열에 필터 상태·`live.lobby`를 더한다.
- 결정: **(b) 채택. 코드 변경 0건.** ui-spec SCR-02에 "재측정 시점(전수)"을 신설해 위 다섯 가지를 적고, 필터·로비 변화는 **재측정하지 않음이 확정 동작**임을 함께 적는다.
  - (a) 기각 — **검증 수단을 정할 수 없다.** jsdom에 `ResizeObserver`가 없어(프로젝트 `frontend/src` 사용례 0건, T-FIX-10이 같은 이유로 채택하지 않았다) 단위로 고정하려면 가짜 전역을 주입해 콜백을 손으로 부르는 방법뿐인데, 그것은 "우리 콜백이 재계산한다"만 고정하고 "브라우저가 그 상황에서 콜백을 쏜다"는 핵심을 고정하지 못한다. T-FIX-10이 남긴 교훈은 **결함이 단위 통과 상태로 새어나온 축을 반드시 단위로 막는다**였으므로, 단위로 못 막는 기제를 새로 들이는 것은 방향이 반대다.
  - (a)·(c) 공통 기각 사유(더 중요) — **테두리만 고치면 미니맵의 두 절반이 서로 다른 기준을 쓴다.** 미니맵 블록은 `WorkflowsScreen.tsx:129`가 **필터 이전** `registry.workflows`를 넘겨 그린다. 필터 중에 테두리만 필터된 `scrollHeight`로 다시 재면, 예컨대 9개 블록이 그려진 미니맵에서 테두리가 100%가 되어 "9개 층이 모두 보인다"는 **틀린 그림**이 된다. 지금은 마지막 측정값(필터 이전 기준)이 남아 블록과 같은 기준을 가리킨다 — 완전하지는 않지만(필터 상태에서 스크롤하면 두 기준이 섞인다) 더 나쁘지 않다.
  - 그 완전한 해법은 **미니맵을 필터 결과에 맞추는 것**(블록 + 테두리 동시)인데, 이는 사용자에게 보이는 동작 변경이고 요청·FR 근거가 없다. **확정: 하지 않는다**(요구사항에 없는 기능·표시를 추가하지 않는다). 나중에 요청이 오면 `/planner`가 아니라 A-항목으로 다시 판단하면 되고, 그때는 블록·테두리·`맞춤` 줌 계산을 한 묶음으로 본다.
  - 명문화로 얻는 것: 다음 리뷰어가 "필터 중 테두리가 안 변한다"를 결함으로 재지적하지 않고, 구현자가 의존성 배열을 임의로 늘리지 않는다. 검증 수단은 **이미 있다** — 트리거 ⑤는 `e2e-12` `[FR-006-AC6][E2E-12][T-015 m2]`와 T-FIX-10 단위 테스트가, ②는 같은 파일의 스크롤 반응 테스트가 고정한다. 새 테스트는 만들지 않는다.
- 사용자에게 보이는 변화: **없음**(현행 확정). 계약 변경 없음.

**B. conventions §8 캡처 뷰포트 문구 (리뷰 Minor 8)** — **ADR-46 C가 이미 해소했다**(`conventions.md` §8 MUST가 "02·03은 1440×1024, 01은 캡처 직전 1440×1140으로 바꿔 찍고 되돌린다"로 정정됨). 새 판단 없음.

**C. 책상 pitch가 기준 PNG와 다른 것 (T-015 m5·m1 실측)**

- 실측(팀장·리뷰어 독립): 가로 pitch span-1(4열) 구현 74.84~75.0px vs 기준 86~87px(**−11px**), 가로 pitch span-3(9열) 118.0px vs 123.0px(**−5px**), 세로 pitch 109px vs 92px(**+17px**).
- 선택지: (a) **현행 확정 + ui-spec SCR-02 "확정된 차이" 목록에 기재** (b) `--spacing-card`를 16px → 10px로 바꿔 기준에 맞춘다.
- 결정: **(a) 채택. 코드·토큰 변경 0건.**
  - **(b)는 산술적으로 목표를 이루지 못한다.** pitch = 칸 폭(높이) + 간격이므로 간격을 줄이면 pitch는 **줄어든다**. 가로는 이미 기준보다 11px **작으므로** `--spacing-card`를 줄이면 **차이가 더 벌어진다**. 세로는 +17px에서 ~6px 줄어 여전히 +11px 남는다. 즉 **두 축이 반대 방향이라 어떤 단일 간격 값도 기준을 동시에 만족시키지 못한다** — 기준 PNG에 맞추려면 책상 스프라이트 크기·격자 규칙(`docs/ui/pixel-sprites.md`·`design-tokens.md`) 자체를 바꿔야 하고 그것은 확정 UI 기준 개정 = architect 권한 밖(`/planner` 경로, ADR-31·ADR-43 선례)이다.
  - `--spacing-card`는 **01·03과 공유**하므로 값을 바꾸면 세 화면이 모두 바뀌고 기준 PNG 01·02·03 대조가 동시에 깨진다. ADR-43이 같은 이유로 공유 간격 토큰 변경을 이미 기각했다(카드 안 여백 18px vs ≈23px).
  - 사용자가 2026-09-28 현재 화면(T-025 결과)을 직접 보고 승인했다 — 현행 확정은 그 상태를 유지하는 결론이라 **추가 승인이 필요하지 않다**. (b)를 택했다면 세 화면이 바뀌어 재승인이 필요했다(E-008 선례).
  - 남는 조건: pitch가 좁은 쪽(가로 span-1 74.84px)에서 **책상 상태 줄(`작업 중 · 부모 <라벨>`)이 이웃 칸으로 번지는지**는 별개 문제이고 그 실측은 T-FIX-07 [Minor 6]에 남아 있다. 겹침이 실제로 나오면 **결함**이며 이 ADR이 면제하지 않는다(`docs/ui/README.md` 원문 "요소 누락 … 은 결함이다. **1~2px 간격 차이는 결함이 아니다**" — 면제는 간격 차이에만 걸리고, 읽을 수 없게 가려진 글자는 "요소 누락"으로 본다. 1차 근거는 FR-006-AC10 "name과 상태 글자를 함께 표시". ADR-50 D1 인용 정정) — 그때는 pitch가 아니라 글자 처리(말줄임 등)로 별건 판단한다. **→ ADR-50 B가 그 판단을 내렸다(열 폭 clamp + 툴팁).**
- 사용자에게 보이는 변화: **없음**(현행 확정). 계약 변경 없음. 영향 문서: `ui-spec.md` SCR-02(재측정 시점 신설 · 확정된 차이 3항 추가), `conventions.md` §7 MUST 2건 신설.

### ADR-49 hover 전수 목록과 "클릭 동작 없는 요소엔 hover 금지" MUST의 충돌을 전수 목록 쪽을 좁혀 해소한다 (A-23, T-025 리뷰 Minor 2·3·5·6·7 + Suggestion 1~3, 2026-09-28)

- 배경: ADR-46 A는 hover 대상을 부류 ①~④의 **전수 목록**으로 못 박고, 동시에 "비활성·선택 항목·**클릭 동작이 없는 요소**에는 hover를 주지 않는다"를 MUST로 세웠다. T-025가 전수 목록을 그대로 구현하자 두 규정이 문자 그대로 충돌하는 지점이 드러났다(리뷰 Minor 2·3·5·6). 원인은 목록을 만들 때 각 요소의 **실제 클릭 동작·실제 variant·실제 파일 위치**를 코드로 확인하지 않고 화면 표기로 열거한 것이다. 해소 원칙: **"클릭 동작이 있는가"가 상위 기준이고, 전수 목록이 그것에 맞게 좁혀진다**(반대로 목록을 지키려고 클릭 동작을 신설하지 않는다).
- 항목별 결정
  1. **05-R 비선택 목록 행 → 부류 ②에서 빼고 코드에서도 hover를 제거한다**(선택지 ⓑ). 근거 셋: ① `<tr>`에 `onClick`·`tabIndex`가 없고 클릭 대상은 체크박스와 역할 드롭다운뿐이다(리뷰어 확인) → MUST의 문자와 목적 모두 hover 금지 쪽이다. ② 그 hover(`bg/soft`)는 팝업 표면(`bg/card`) 위에서 채널당 **+1~2**로, ADR-46 A가 선택지 (b)를 기각하며 스스로 "보이지 않는다"고 적은 폭이다(항목 7) → 규격을 지켜도 사용자가 얻는 것이 **0**이다. ③ ⓐ(행 전체를 체크박스 토글 클릭 영역으로 만든다)는 **새 클릭 동작 신설**이다 — `ui-spec` SCR-05-R 요소 표의 클릭 동작 열 변경, `<select>` 클릭이 토글을 일으키지 않게 하는 이벤트 예외, `<tr>`은 포커스를 못 받으므로 키보드 동등성(NFR-12)을 위한 `tabIndex`·`role` 신설까지 필요하고, 요청도 FR 근거도 없다. 덤으로 얻는 hover는 여전히 보이지 않는다.
     - T-025가 `staticRules`에서 05-R 행을 `focusable: false`로 둔 판단(리뷰어 "타당")은 **뒤집히지 않는다** — 행을 목록에서 빼므로 그 항목 자체가 사라진다. ⓐ를 택했다면 그 판정이 뒤집히고 `<tr>`에 포커스·클릭을 신설하는 코드 변경이 생겼을 것이다.
     - 부류 ②는 이제 **사이드 탭(비선택)** 하나만 남는다. "선택과 구분되는 hover"라는 A-22 핵심 제약은 사이드 탭에서 그대로 유효하다(`chrome`→`soft`→`selected`).
  2. **04-6 `정상 파일은 수정 팝업에서 편집 →` → 부류 ④에서 뺀다**(코드 변경 0건). `ui-spec` SCR-04-6 요소 표 자신이 이 요소의 클릭 동작을 **`없음(안내)`**으로 확정했고 구현도 클릭 동작 없는 `<span>`이다(`FormatErrorList.tsx:26`) — 요소 이름의 "링크"는 표기이고 이동 동작이 아니다. 실제 링크로 만드는 쪽은 새 동작 추가(사용자 승인 + 요소 표 변경)이고, 이동할 목적지도 확정 문서에 없다(같은 카드 안 안내 문구다). T-025가 손대지 않은 판단이 옳다. 글자색은 기준(와이어프레임) 그대로 두어 시각 변화를 만들지 않는다.
  3. **01 표 높이 `h-96` 유지 — T-024 Minor 4의 1.75px 잔존을 그대로 둔다**(코드 변경 0건). 01 문서 높이 1158px, `수집 상태` 카드 `bottom 1141.75px`(프레임 1140px). `h-80`(320px)으로 낮추면 본문이 8줄이 되어 ADR-46 C의 근거("대략 10줄" 요청)에서 벗어나고, 사용자가 승인한 화면을 다시 바꿔 재승인이 필요하다. `ui-spec` SCR-01 확정된 차이 1항이 "01 문서 총 높이는 대조 대상이 아니다"로 이미 확정했고 두 요소(사이드바 `수집 상태` 카드·마스킹 각주)는 같은 테스트가 DOM으로 단언한다 → **결함이 아니다**. 캡처 주석은 `fullPage`가 아니라 "뷰포트 clip + 1.75px 프레임 밖"이라는 현행 사실로 적는다(T-FIX-07 [Minor 4] 문구 정정).
  4. **04-7 점선 카드의 버튼 → 부류 ①에서 빼고, "한 요소가 ①과 ③에 동시에 해당하면 ③(variant)이 우선한다"를 명시한다**(코드 변경 0건). `EmptyWorkflowCard.tsx:24`가 `variant="primary"`이므로 `Button`이 주는 ③(`brightness-110`)을 받는 것이 맞다. ① 표현을 주려면 화면 파일에 hover 클래스를 넣어야 하는데 그것은 conventions §7 "공용 컴포넌트에서만" MUST 위반이다 → 구현이 옳고 목록이 틀렸다.
  5. **conventions §7 :125의 "화면 전용 예외"에 ④ 텍스트 링크 자리를 만든다**. `FeaturedWorkflows.tsx:73`의 `전체 보기 →`는 부류 ④이지 "화면 전용 클릭 영역 4곳"이 아니다(우연히 같은 파일이라 정적 검사를 통과했다). "④ 텍스트·브레드크럼 링크는 그 링크가 있는 화면 파일에 둘 수 있다" 한 줄을 더한다 — ④의 표현은 밑줄뿐이라 값 흩어짐 위험이 없다(공용 컴포넌트로 모을 대상이 아니다).
  6. **상단바 브레드크럼 링크 → 부류 ④에 넣는다(코드 변경 있음)**. 03의 `홈`·`에이전트 워크플로우`는 실제 라우팅하는 `<Link>`(`screens/workflow-detail/Breadcrumb.tsx:11,15`)인데 hover·focus 표현이 없다. 항목 1·2와 방향이 반대인 이유: **여기는 클릭 동작이 실제로 있다** — 상위 기준("클릭·이동할 수 있는 요소는 피드백을 받는다", `ui-spec` §공통 한 줄 규칙 / ui-rules 2 / NFR-12)이 적용되고, 사용자 요청 A-22("사이드 탭 포함 모든 버튼")의 누락 지점이다. 표현은 ④의 **밑줄**(`hover:underline focus-visible:underline`)로 새 색·새 토큰 0건이고, 글자색(`text/secondary`)은 바꾸지 않는다 → 기준 PNG 03(정적 상태)과의 대조 결과가 달라지지 않는다. 01·02·07의 브레드크럼은 `<a>`가 아닌 단순 문자열이라 대상이 아니다(`router.tsx:20,25,39`).
     - 함께 명문화: **"한 줄 규칙은 요약이고 실제 적용 대상은 전수 목록이 정한다. 둘이 어긋나면 그것은 목록을 고칠 신호이며, 요약과 어긋나는 예외는 'hover 표현이 없는 것(전수)'에 이유와 함께 적는다."** 이번 항목 1·2·6이 그 절차를 처음 적용한 사례다.
  7. (항목 1에 흡수) 05-R 행 hover의 비가시성은 제거로 해소된다. 함께 확정: **부류 ② 표현(`bg/soft`)은 표면이 `bg/chrome`(사이드바)인 곳에서만 쓴다** — `bg/card`·`bg/soft` 표면에서는 보이지 않으므로, 그런 표면의 요소에 ②가 필요해 보이면 목록에 넣지 말고 architect에 확정을 요청한다.
  8. Suggestion 3건
     - **전환 일관성 → `transition-colors duration-200`은 `components/ui/Button.tsx` 한 곳에만 둔다**(코드 변경 0건). 다른 hover·focus 대상은 즉시 전환이다. 근거: ① 현행이 그 상태이고 사용자가 승인했다 ② 전환 클래스를 7개 파일(사이드바·입력 4종·01 카드·02 칸·03 칸)에 퍼뜨리면 conventions §7 :125가 막으려는 "같은 규칙의 복제"가 전환 축에서 다시 생긴다 ③ `Button`은 variant·비활성·hover·focus로 색 상태가 여럿이라 전환의 이득이 가장 크고, 나머지는 hover 한 축뿐이라 즉시 전환이 포인터 추적에 불리하지 않다. 이 결론을 `conventions.md` §7 MUST로 못 박아 반복 질문을 닫는다. 뒤집으려면 사용자 승인(상호작용 느낌 변화)이 필요하다.
     - **ADR-46 A 보강 2줄**(판정에 영향 없음, 표현 정확성): ① `brightness-110`의 "새 색 0건"이라는 주장의 범위는 **토큰·소스 수준**이다 — 렌더된 픽셀은 새 색이 맞다(`primary` `#3DD68C` → 사용자는 ≈`#43EB9B`를 본다). 토큰을 단일 출처로 유지하고 `design-tokens.md` 개정을 피한다는 목적은 그대로 성립한다. ② `filter`는 **자식 전체**에 걸리므로 채움 버튼의 글자도 함께 밝아진다 — 배경이 더 크게 밝아져 대비는 오히려 오르고(ui-rules 8의 4.5:1 유지, 리뷰어 실측 확인) `filter`가 만드는 containing block의 영향은 현재 0건이다.
     - **`워크플로우 보기 →`를 SCR-01 "기준 PNG와의 확정된 차이"에 추가**. 기준 PNG 목업에는 없는데 `ui-spec` SCR-01 요소 표는 요구한다(T-014·T-024 통과 상태). 요소 표가 우선이지만 conventions §7 :109가 "어긋나도 되는 항목은 목록에 적힌 것뿐"이라고 못 박았으므로 목록에 적어야 규정이 닫힌다(ADR-25와 같은 형식).
- 사용자에게 보이는 변화: **있음(두 곳, 모두 미세)** — ① 05-R 목록 행의 보이지 않던 hover가 사라진다(채널당 +1~2였으므로 실질 시각 변화 ≈0, 고정 fixture에는 목록 자체가 비어 있다) ② 03 브레드크럼 `홈`·`에이전트 워크플로우`에 마우스를 올리거나 Tab으로 이동하면 밑줄이 생긴다. **새 문구 0건 · 새 요소 0건 · 새 색·토큰 0건 · 레이아웃·클릭 동작 변화 0건.** 둘 다 사용자가 이미 승인한 A-22 요청("클릭할 수 있는 것에 hover 피드백")의 범위 안 정정이라 별도 승인 대상으로 보지 않는다(최종 판단은 팀장).
- 요구사항 의미 변경 여부: **없음.** FR·AC·E 어느 문장도 hover를 규정하지 않고, 클릭 동작·이동·문구·데이터가 하나도 바뀌지 않는다. 계약 변경 없음(`api-spec.yaml`·`realtime-spec.md` 무수정, ui-spec 데이터 출처 열 무변경).
- 갱신이 필요한 테스트(전수): `frontend/src/test/staticRules.test.ts` — `HOVER_FOCUS_FILES`에서 `ImportAgentTable.tsx` 제거·`screens/workflow-detail/Breadcrumb.tsx` 추가(개수 10 유지), `SCREEN_HOVER_VALUES` 4 → 3(05-R 행 제거). T-025 리뷰 뮤테이션 M6·M7a(05-R 행 hover)는 대상이 사라져 무효가 되고, 그 자리를 "05-R 행에 hover가 **없다**"는 단언이 대신한다. `Minimap.test.tsx`·`e2e-13`·E2E 전체는 **갱신 대상이 아니다**(ADR-48 A·C가 현행 확정이므로). 영향 문서: `ui-spec.md` §공통 hover 표 ①·②·④·전수 예외·전환·구현 위치, SCR-01 확정된 차이 3항, SCR-05-R 목록 행 주석, `conventions.md` §7 MUST 4건 정정·1건 신설.

### ADR-50 FR-001-AC3의 2초는 화면 기준으로 유지하고 E2E는 "관측 격자"를 고정해 flaky를 없앤다 / 02 책상 상태 줄은 열 폭 clamp로 가림을 없앤다 (A-24, T-FIX-07 리뷰 Major 1 · Minor 2·3 + Suggestion, 2026-09-29)

- 공통 전제: 부하 재현은 하지 않는다. 팀장이 사용자에게 물어 2026-09-29 **"코드 판정만으로 진행"**으로 결정했다(E-009 해결, D-082의 "부하 유발은 사용자 허락 필요"를 닫는 결정). 따라서 아래 A는 실측 ms 없이 **코드 근거 + 이미 존재하는 백엔드 실측치(ADR-04 측정 결과)**로 확정한다.

**A. E2E flaky — `e2e-04.spec.ts:714`의 2000ms 창 (리뷰 Major, 담당 architect)**

- **먼저 AC의 뜻을 판정한다.** `final_requirements_function.md:162` FR-001-AC3 원문은 "웹 밖에서 정의 파일·구성 파일을 추가·수정·삭제하면 `다시 읽기` 없이 **2초 이내에 화면에 반영된다**"다. 예산이 걸린 지점은 **"화면에 반영"** = 사용자가 보는 DOM 상태이며, "제품 경로(파일 변경 → `/api/state`·SSE)"가 아니다.
  - → 리뷰어 권고 ①(**측정 분리** — 2초 예산을 제품 경로에만 걸고 브라우저 렌더 대기를 예산에서 뗀다)은 **채택하지 않는다.** 그것은 AC 문장의 측정 지점을 바꾸는 것이고 = 요구사항 변경이므로 architect 권한 밖이다(`/planner` 경로). 채택하고 싶다면 팀장이 에스컬레이션해야 한다. **React 렌더 대기는 2000ms 예산 안에 그대로 남는다.**
  - 예산에서 빼는 것은 **Playwright의 관측 지연(재시도 격자)뿐**이다. 그것은 제품 경로도 아니고 "화면에 반영된 시점"도 아니다 — 화면은 이미 바뀌었고 테스트가 늦게 본 것이다. 이 구분이 이 ADR의 핵심이며, 렌더를 빼는 것과는 다른 일이다.
- **원인 판정 — 이 항의 정량 근거는 틀렸다. 2026-10-01 정정됨(A-25 → ADR-51).** 처방 (d)와 T-FIX-11은 그대로 유효하고 되돌리지 않는다. 바뀐 것은 근거와 **결론의 범위**다.
  - **폐기한 서술(2026-09-29 원문, 지우지 않고 남긴다 — D2 정정과 같은 방식)**: "**원인 판정(코드 + 기존 실측).** `ui-helpers.ts:18 FILE_CHANGE_DEADLINE_MS = 2000` 하나가 ① fixture 파일 쓰기 ② ADR-04 1초 폴링 위상 ③ 재스캔·재파싱·SSE 방송 ④ React 렌더 ⑤ **Playwright 재시도 격자**를 모두 덮는다. ①~③은 이미 실측돼 있다 — ADR-04 측정 결과: 실제 1초 간격에서 파일 변경 → SSE `registry` 수신 **p95 1,016~1,025ms / max 1,028ms**. ④는 수십 ms다. 즉 **제품 경로만으로는 2000ms를 넘을 수 없다.** 남는 항은 ⑤뿐인데, 이 값은 우리 코드에 없는 Playwright 내부 상수(`expect.poll` 기본 `intervals`가 `[100, 250, 500, 1000]`인 것과 같은 계열이며 버전에 따라 달라질 수 있다)다. 반영이 ~1.03s에 오고 다음 관측이 1.85s 근처라면 **실여유는 ~150ms**이고, 전체 스위트 부하로 어느 항이든 150ms 늦어지면 다음 관측이 예산 밖으로 나가 FAIL한다. **통과·실패를 가르는 값이 우리가 통제하지 않는 상수라는 것 자체가 결함**이다(부하는 방아쇠일 뿐이다)."
  - **틀린 곳 두 가지**: ① 변경 전 코드는 `expect.poll`을 쓰지 않았다 — web-first 단언(`toBeVisible`/`toHaveCount`에 `{ timeout: deadlineMs }`)이었으므로 `[100, 250, 500, 1000]` 계열은 변경 **전** 격자가 아니다 ② 그래서 "실여유 ~150ms"도 성립하지 않는다. 변경 전 실효 격자는 **최대 100ms**이고 실여유는 **≈850ms**였다. 산술과 출처는 ADR-51 §1에 있다.
  - **그래도 유지되는 곳**: "하나의 기한이 ①~⑤를 모두 덮는다"는 구조 서술, "통과·실패를 가르는 값이 우리 코드에 없는 상수인 것은 결함"이라는 판정, 그리고 처방 (d). 25ms < 100ms는 단조 개선이고 비용이 0이며, **실패 문구 2종 분리 + 통과 시에도 실측 ms 기록**이 이 처방의 본체다.
  - **결론의 범위를 좁힌다**: 격자 고정은 **측정 잡음 제거**이고, **flaky의 원인 규명은 열려 있다**(ADR-51). 이 ADR이 "(이 처방으로) 문제를 닫는다"고 읽히는 부분은 그만큼 약하게 읽어야 한다.
- 선택지: (a) `2000`을 늘린다 (b) `retries`를 준다 (c) E2E의 `jaystudio.poll-interval-ms`를 낮춘다 (d) **관측 격자를 우리 코드에서 고정하고, 기한 초과와 "반영 자체가 없음"을 구분해 실패 메시지에 실측 ms를 남긴다**.
- 결정: **(d) 채택.** `FILE_CHANGE_DEADLINE_MS = 2000`과 `retries: 0`을 **그대로 둔다**.
  - `measureFileChangeReflection`을 `expectation(deadlineMs)`(임의의 web-first 단언에 기한을 넘기는 형태)에서 **불리언 술어 폴링**으로 바꾼다: 새 상수 `REFLECTION_POLL_INTERVAL_MS = 25`(관측 격자)와 `REFLECTION_DIAGNOSTIC_TIMEOUT_MS = 10_000`(진단 상한)을 두고, `expect.poll(reflected, { intervals: [25], timeout: 10_000 })`으로 반영 시점을 잡은 뒤 **`elapsedMs <= FILE_CHANGE_DEADLINE_MS`(2000)를 단언**한다. 관측 오차(≤ 격자 25ms + 1회 왕복)는 **예산 안에 남겨** 보수적으로 단언한다 → AC가 약해지는 방향이 아니다.
  - 얻는 것: ① 관측 격자가 **≤100ms → 25ms**로 줄어 실여유가 ≈850ms → ≈950ms가 된다(**약 75ms 회복**. 2026-10-01 정정 — 원문은 "격자가 ~1s에서 25ms로, 실여유 ~0.95s로 회복"이라 적었으나 변경 전 격자는 ~1s가 아니라 ≤100ms였다. ADR-51 §1) ② 실패가 **두 종류로 나뉜다** — 10초 안에 아예 반영되지 않으면 "기능 결함", 반영은 됐으나 2000ms를 넘으면 "기한 초과 + 실측 ms". 지금은 둘 다 같은 timeout 문구로 나와 트레이스가 없으면 원인을 못 가린다(D-082의 유실이 바로 이 형태다) ③ 통과 실행에서도 annotation에 실측 ms가 남아 추세가 쌓인다.
  - (a) 기각 — FR-001-AC3 단언을 조용히 완화한다(리뷰어 ③과 같은 판단). (b) 기각 — `retries`는 flaky를 은폐한다. (c) 기각 — **운영 기본값이 1000ms**(`compose.e2e.yaml`에 `jaystudio.poll-interval-ms` 주입이 없다)이고 E2E만 낮추면 "운영 설정에서 AC3가 지켜지는가"를 더 이상 검증하지 못한다. 이 셋이 모두 "예산을 늘리거나 조건을 무르게 하는" 방향인 반면 (d)는 **측정 잡음을 없애는** 방향이라 AC를 그대로 둔다. (2026-10-01: 원문은 여기서 "문제를 닫는다"고 적었다 — **닫히는 것은 측정 잡음뿐이고 flaky 원인은 열려 있다.** ADR-51 §2)
- 리뷰어 권고 ②(**시작점 결정화** — 서버가 알리는 tick 기준으로 재거나 예산을 "폴링 주기 + X"로 명문화)는 **채택하지 않는다.**
  - tick 기준: 서버에 폴링 tick을 알리는 신호가 **없다**(`FolderPoller.poll()`은 변경이 있을 때만 `rescanNow`→SSE `registry`를 쏘고, `Registry.revision`·`scannedAt`도 변경 시에만 바뀐다. `heartbeat`는 15초로 폴링과 무관하다). 신호를 만들려면 SSE 메시지 종류나 엔드포인트를 새로 두어야 하는데 그것은 **제품 코드 + 계약 변경**이고 FR 근거가 없다.
  - 예산 재정의: "폴링 주기 + X"는 AC 문장이 정한 **2초**를 다른 수식으로 바꾸는 것이라 A 첫 항의 판정과 같은 이유로 architect 권한 밖이다.
  - 폴링 위상(0~1s 균일)은 **AC가 감수하기로 한 제품 특성**이다(ADR-04이 1초 폴링을 선택했고 2초 예산은 그 위에서 정해졌다). 위상을 최악으로 고정해 재는 방식(마커 변경으로 tick 경계를 추정한 뒤 본 변경을 쓰는 방식)은 더 강한 검증이지만, 추가 재생·파일 쓰기로 같은 배치 뒤 테스트의 live·registry 상태를 흔들고 위상 추정 자체에 관측 오차가 섞인다 → **하지 않는다.** 대신 위 annotation 실측 ms가 위상을 포함한 실제 분포를 남기므로, 2000ms에 근접하는 값이 반복되면 그때 다시 판단한다(그때의 선택지는 폴링 간격 500ms 축소 = ADR-04이 이미 남겨 둔 여지다). **"근접"의 수치 기준은 2026-10-01에 ADR-51 §4 발동 조건표로 확정했다.**
- 리뷰어 권고 ④ 채택: `e2e-04.spec.ts:656`(`toHaveCount(0)`)·`:685`(`toHaveCount(2)`)의 기한 없는 단언에 **기한을 명시**한다(`SETUP_REFLECT_TIMEOUT_MS`). 이 둘은 **측정 대상이 아니라 준비·사후 상태 확인**이므로 기본값 5000에 숨어 있을 이유가 없다.
- 사용자에게 보이는 변화: **없음**(테스트 도구만 변경). 제품 코드·계약·화면 변경 0건. 요구사항 의미 변경 **없음**(예산 2000ms·측정 지점 "화면 반영" 유지).

**B. 02 책상 상태 줄 가림 — 열 폭 clamp + 툴팁으로 확정 (리뷰 Minor, 담당 architect)**

- 배경 — **2026-10-01 정정됨(A-25 4, T-FIX-12 리뷰 Minor 1). 처방 (a)와 결론은 유지한다.**
  - **폐기한 서술(2026-09-29 원문, 지우지 않고 남긴다)**: "배경: `statusOverlaps()` 실측은 겹침 0건이지만 그것은 fixture가 도달한 상태에 한한다(D-083). `작업 중 · 부모 <라벨>`(span-3 실측 96.67px)은 서브에이전트로 도는 아무 책상에나 붙고, span-1 열 폭은 74.84px이므로 그런 책상이 나란히 둘이면 **21.83px 글자-위-글자 가림**이다. 96.67px은 짧은 라벨 `dev-lead` 기준이고 **부모 접미는 잘리지 않으므로**(이름 칩만 `ellipsis.ts` 12자) 라벨이 길면 더 나빠진다."
  - **틀린 곳**: "21.83px 글자-위-글자 가림"은 **발현된 적 없는 투영값**이다. span-3 실측 96.67px(리뷰어 판정, 출처 `docs/reviews/T-FIX-07.md` Minor 2 — architect가 직접 재지는 않았다)을 span-1 열 폭에 그대로 옮겨 놓고 **줄바꿈이 없다고 가정**해 계산한 값이다. 변경 전 `DeskSprite` 루트는 `w-fit`이고 상태 줄에 `nowrap`이 없었으며, 상태 문구 `작업 중 · 부모 <라벨>`에는 **공백이 있어** min-content = 가장 긴 낱말이었다 → `fit-content`가 칸 안쪽 폭(≈66.8px = 열 폭 74.84px − 칸 `p-1` 좌우 4px씩)으로 줄고 **글자가 두 줄로 접혔다.** 가로로 번져 이웃 칸 글자를 덮는 일은 일어나지 않았다.
  - **실제로 일어난 일 두 가지**(T-FIX-12 리뷰가 CSS 의미로 독립 검증, Minor 1 · §9): ① **상태 줄 = 두 줄 접힘** — 행 리듬이 깨지는 **배치 차이**다 ② **이름 칩 = 실제 번짐** — 이름에는 공백이 없어 min-content가 줄지 않고(13자 이름 실측 81.91px > 열 폭 74.84px) 칸 밖으로 나갔다. T-024 m6이 잰 현상이 이것이다. 즉 **"번짐"은 이름 칩에서, "접힘"은 상태 줄에서** 일어났다.
  - **그래도 처방 (a)를 유지하는 이유 세 가지**: ① 두 줄 접힘은 `docs/ui/README.md` 원문의 "배치 차이"에 그대로 걸린다(1~2px 면제는 간격 차이에만 적용된다. ADR-50 D1) ② 이름 칩 번짐은 **실재했다** ③ 부모 라벨의 **낱말 하나**가 칸 안쪽 폭을 넘으면(공백 없는 13자 이상 라벨) min-content가 칸을 넘어 **가로 가림도 실제로 발생한다**. clamp + `title`은 셋을 한 번에 닫는다. **되돌릴 이유가 없다**(T-FIX-12 리뷰 §9 결론과 같다).
  - `statusOverlaps()` 실측이 겹침 0건이었던 것은 fixture가 도달한 상태에 한한다(D-083)는 판단과, **부모 접미는 잘리지 않는다**(이름 칩만 `ellipsis.ts` 12자)는 사실은 그대로 유효하다. ADR-48 C가 pitch 수치만 면제하며 "겹침이 나오면 pitch가 아니라 **글자 처리(말줄임 등)로 별건 판단**한다"고 이미 남겼다.
- 선택지: (a) **상태 줄을 열 폭에서 CSS 한 줄 clamp + 전체 문구는 툴팁** (b) span-1 층에서는 부모 접미를 생략 (c) `--spacing-card` 재검토로 열을 넓힌다.
- 결정: **(a) 채택.** 사용자 승인이 필요한 (c)를 고르지 않고 닫는다.
  - 구현 형태: `DeskSprite` 루트를 `w-fit` → **`w-full min-w-0`**(그리드 칸 폭을 받는다), 상태 줄과 이름 칩은 **칸 폭을 받는 그 요소 자신**에 한 줄 clamp(`min-w-0 w-full truncate text-center`)를 걸고, 부모 접미가 있는 상태 줄은 **같은 요소에 네이티브 `title`**로 전체 문구를 준다(ADR-46 B 선례 `FeaturedWorkflows.tsx:54`와 같은 형태. 공용 `Tooltip`은 폭 제약이 없는 래퍼 `<span>`을 하나 더 만들어 clamp 기준 폭을 없애므로 이 자리에는 쓰지 않는다 — 이름 칩의 `Tooltip`은 문자열 말줄임 방식이라 그대로 둔다). 책상 칸 `<button>`도 칸 폭을 받아야 clamp 기준이 생긴다. `justify-items-center` + `items-center`가 그대로라 **스프라이트의 좌우 위치는 변하지 않는다**(칸 안에서 이미 가운데였다).
  - **DOM 텍스트는 자르지 않는다**(CSS clamp만) — ADR-46 B와 같은 이유이고, 이 결정이 곧 `e2e-04:699`·`:729`·`e2e-13:509`·`:555`의 `getByText(… , { exact: true })`와 `STATUS_LINE_PATTERN` 단언을 **그대로 통과시킨다**.
  - 근거가 확정 문서 안에 있다: ① FR-006-AC10이 "각 책상은 name과 상태 글자를 **함께 표시**한다"고 요구하므로 이웃 칸 글자가 겹쳐 읽을 수 없는 상태는 AC 미충족이다 ② FR-006-AC4가 **긴 글자 처리 방식을 이미 확정**했다 — "name이 12자를 넘으면 말줄임하고, 마우스를 올리면 전체 name을 보여준다". 같은 컴포넌트·같은 문제(칸을 넘는 글자)에 같은 방식을 쓰는 것이므로 **새 시각 언어를 만드는 것이 아니다**(새 색·새 토큰·새 문구·새 요소 0건, 레이아웃 변화 0건).
  - (b) 기각 — 층 크기(span)에 따라 같은 데이터가 보이거나 안 보이게 되고(ui-spec SCR-02 책상 행의 표시 규칙 변경), 툴팁도 없어 **정보가 사라진다**. clamp는 정보를 지우지 않는다.
  - (c) 기각(권고도 하지 않는다) — ADR-48 C가 산술로 이미 닫았다(가로는 기준보다 11px **작아서** 간격을 줄이면 차이가 더 벌어지고, 세로는 반대 방향, 토큰은 01·03과 공유). 게다가 사용자에게 보이는 변화라 ADR-48 C 선례대로 승인이 필요하다. **(a)가 승인 없이 기준을 충족하므로 (c)는 선택지에서 내린다.**
- 검증은 투영이 아니라 실측으로 바꾼다: **span-1 층에 부모 접미가 붙은 책상을 나란히 두 개 실제로 놓는 재생(fixture) 층**을 추가하고 그 상태에서 `statusOverlaps()`가 `[]`임을 단언한다(→ T-FIX-12). 긴 부모 라벨(13자 에이전트 이름)까지 포함한다. `showcase.jsonl`은 22줄 대응표와 기준 캡처가 걸려 있어 **고치지 않고 새 시나리오 파일을 추가**한다.
- 사용자에게 보이는 변화 — **2026-10-01 실측으로 갱신(A-25 5, T-FIX-12 리뷰 Minor 2·3). 되돌리지 않는다.**
  - **폐기한 서술(2026-09-29 원문, 지우지 않고 남긴다)**: "사용자에게 보이는 변화: **있음(한 곳, 좁다)** — span-1 층에서 부모 접미가 붙은 책상의 상태 줄이 칸 폭에서 잘리고(`작업 중 · 부모 <라벨…`) 마우스를 올리면 전체가 보인다. 그 외 상태(접미 없음)는 칸 폭 안이라 **표시가 그대로다.** 새 문구·새 색·새 토큰·새 요소·**레이아웃 이동 0건**이고 …"
  - **틀린 곳**: "레이아웃 이동 0건"과 "변화는 한 곳"이다. 루트가 `w-fit` → `w-full`이 되면서 **팀장 배지의 기준 상자가 책상 상판 → 그리드 칸으로 바뀌어 배지가 왼쪽으로 이동했다.**
  - **갱신한 가시 변화 전수(3건)**
    1. span-1 층에서 **부모 접미가 붙은** 책상의 상태 줄이 칸 폭에서 CSS 말줄임되고(`작업 중 · 부모 <라벨…`) 마우스를 올리면 전체 문구가 보인다. 접미가 없는 상태는 칸 폭 안이라 표시가 그대로다. 변경 전 두 줄로 접혔던 줄이 **한 줄로 고정**되는 것도 같은 변화의 일부다(위 배경 정정).
    2. **팀장 배지 앵커 변경 — 왼쪽으로 이동.** T-FIX-12 리뷰가 1440×1020 캡처를 픽셀 측정해 독립 확인했다(`docs/reviews/T-FIX-12.md` §2 표, architect가 그 표를 읽어 인용 — 직접 재지는 않았다): 배지 왼쪽 − 책상 상판 왼쪽이 카드1(span-3) **−6 → −36px**(기준 PNG **−36px과 완전 일치**), 카드2(span-1) −6 → −14px(기준 −17px, 차 11 → 3px), 카드3(span-1) −12 → −14px(기준 −17px, 차 5 → 3px). 절대 이동량은 카드마다 달랐다(카드1 30px · 카드2 8px · 카드3 2px) — 변경 전 기준 상자가 `w-fit` 루트, 즉 **그 책상 글자 중 넓은 쪽**에 종속됐기 때문이다. 변경 후에는 세 카드 모두 **배지 왼쪽 = 그리드 칸 왼쪽 끝 0px**로 고정돼(`-left-1` −4px + 칸 `p-1` +4px의 산술과 실측 일치) **글자 폭에 더 이상 흔들리지 않는다.** 기준 PNG도 배지를 칸 왼쪽 기준으로 두므로 **기준의 배치 모델과 같아진 개선**이다 → 되돌리지 않는다.
    3. **책상 칸 hover·focus 배경 면적이 그리드 칸 전체로 넓어진다.** `Floor.tsx`의 `<button>`에 `w-full min-w-0`만 붙었고 `hover:bg-selected`·`focus-visible:bg-selected`·`rounded-control`·`p-1`·`justify-items-center`는 **문자 그대로 불변**이다(클래스·색·토큰 0건 변경, ADR-46 A·ADR-49 위반 없음). 칸보다 좁던 배경이 칸 크기가 된 것이다.
  - 그 밖은 실측으로 **불변 확인**: 02 공식 캡처의 변경 전/후 전체 픽셀 diff가 **4개 영역 2,366px**(상단·하단 시각 표기 + 배지 이동 2곳)뿐이고 **책상·이름 칩·상태 글자·격자·줌·미니맵은 픽셀 동일**이다 → "스프라이트 좌우 위치 불변"은 참이다. 03 `OfficeSprite` 배지는 이동하지 않았다. **새 문구 0 · 새 요소 0 · 새 색·토큰 0 · 클릭 동작·이동 0 · DOM 텍스트 0.**
  - 승인 판단은 그대로: FR-006-AC4가 확정한 방식을 같은 컴포넌트에 적용하는 **결함 수정**이고 셋 모두 기준 PNG에 가까워지거나 중립이므로 별도 사용자 승인 대상으로 보지 않는다(최종 판단은 팀장 — ADR-49와 같은 형식).

**C. `api-spec.yaml` `HookPayload.permission_mode` 설명 한 줄 (리뷰 Minor, T-023 Suggestion)**

- 결정: **설명을 추가한다** — "현재 backend는 이 필드를 저장·사용하지 않는다(`HookPayload.java` record에 없어 무시된다). 스키마에 남겨 두는 이유는 Claude Code `http` hook이 실제로 보내는 공통 필드이기 때문이다(`final_requirements_function.md:186`, FR-003-AC9)."
- **계약 변경이 아니다**: `description` 문자열만 늘었고 필드·타입·`required`·enum·상태 코드가 그대로이며, 서버 동작(무시)도 그대로다. 프론트는 이 스키마를 소비하지 않고(생산자는 Claude Code·`tools/replay`), `ui-spec.md` 데이터 출처 열에 등장하지 않는다. 필드를 **지우지 않는다** — FR-003-AC9·`final_requirements_architecture.md:140`이 공통 입력 필드로 명시하고 `tools/replay/scenarios/*.jsonl`·`e2e-08`·`e2e-11`이 실제로 보낸다.

**D. Suggestion 3건**

1. **`docs/ui/README.md` 인용 문구 정정 (채택, 문서만)** — 원문은 "기준 이미지와 구현 화면을 대조할 때 **요소 누락, 배치 차이, 흐름 불일치는 결함이다. 1~2px 간격 차이는 결함이 아니다**"이고 "요소 가림"이라는 낱말은 없다. `ui-spec.md:235,274,305`·`conventions.md:111`·이 문서 ADR-48 C의 인용을 **원문 낱말 + 해석 근거**로 고친다: 가림은 원문의 "요소 누락"에 해당한다는 **해석이며 그 해석의 1차 근거는 FR-006-AC10**(책상마다 name과 상태 글자를 함께 표시)이다. 1~2px 면제는 **간격 차이에만** 적용되고 글자-위-글자 겹침에는 적용되지 않는다는 판정도 함께 적는다. `docs/ui/`는 수정하지 않는다.
2. **`helper/jaystudio-helper.mjs` `readBody()` 주석 (채택 — 단 2026-10-01 전제 정정. T-FIX-13 리뷰 Major)**
   - **폐기한 서술(2026-09-29 원문, 틀렸다 — 지우지 않고 남긴다)**: "`helper/jaystudio-helper.mjs:284` 주석 (채택, 주석 한 줄) — `destroy()` 후 `readBody` promise가 resolve·reject 어느 쪽도 되지 않는다(`'end'`·`'error'` 모두 `!tooLarge` 가드)는 것이 **의도**임을 주석에 명시한다. 동작 변경 0건(>1MiB에서 소켓을 끊는 경로이고 응답은 api-spec에 없다 — 리뷰 §5)."
   - **코드로 확인한 사실** (팀장 독립 확인 + architect 재확인, `readBody()` 273~311줄 / `/open` 핸들러 397~403줄 / `MAX_BODY_BYTES = 4096`·`MAX_DISCARDED_BODY_BYTES = 1MiB`):
     1. `size > MAX_BODY_BYTES` 최초 초과 블록에서 `tooLarge = true`와 `reject(new Error('BODY_TOO_LARGE'))`가 **같은 블록에서 동기적으로 함께** 실행된다 → promise는 그 시점에 **reject로 정착(settled)**한다.
     2. `request.destroy()`는 `if (tooLarge) { … if (size > MAX_DISCARDED_BODY_BYTES) { … } }` 안에 있어 **`tooLarge`가 이미 true가 된 뒤의 `data` 이벤트에서만** 도달한다 → `destroy()` 시점에 promise는 **이미 정착돼 있다**. promise가 버려지는 경로는 **존재하지 않는다**.
     3. `'end'`·`'error'`의 `!tooLarge` 가드는 "promise를 버리는 장치"가 아니라 **이미 정착된 promise를 다시 정착시키려는 무효 호출을 막는 방어**다.
     4. 호출부 `/open`은 그 reject를 `catch`해 **400 `INVALID_BODY`를 보낸다.** >1MiB 경로도 같다 — 기존 테스트 `helper/test/helper.test.mjs` `[FR-013-E3][T-FIX-07] 2차 상한(1MiB)을 넘는 본문 → 소켓을 끊는다`가 `assert.match(received, /^HTTP\/1\.1 400 /)`·`/"code":"INVALID_BODY"/`로 **클라이언트가 그 400을 실제로 받는다**고 단언하며 통과 중이다.
     5. 따라서 "응답은 api-spec에 없다"도 틀렸다. 이 경로는 **api-spec `/open`에 이미 정의된 400**을 그대로 쓰는 정상 경로이고, `destroy()`는 응답 경로와 무관한 **별개의 자원 보호 조치**(버리는 본문이 소켓을 오래 붙잡지 못하게 한다)다.
     6. 함수 상단 **기존 JSDoc은 원래부터 옳았다**("상한을 넘으면 즉시 거부하지만 소켓을 끊지 않는다 … 흘려보내는 양이 `MAX_DISCARDED_BODY_BYTES`를 넘으면 그때 소켓을 끊는다"). 폐기한 서술이 그 JSDoc과 모순이었고, 모순을 알아채지 못한 쪽이 ADR이다.
   - **오류의 출처와 책임**: T-FIX-07 리뷰 Suggestion(`docs/reviews/T-FIX-07.md:48`)과 같은 리뷰 §5(`:34` "api-spec에 어느 쪽 응답도 없다")의 전제를 이 ADR이 **코드로 검증하지 않고 그대로 옮겼다**. 리뷰 문서는 당시 판단의 기록이므로 고치지 않고, 정정은 이 항과 `tasks.md` T-FIX-13에만 둔다. 개발자는 지시를 충실히 옮긴 것이므로 **코드가 아니라 문서가 원인**이며, 들어간 주석 4줄은 폐기하고 아래 내용으로 다시 쓴다(backend-developer 담당). **ADR-50에서 두 번째 사실관계 오류다**(첫 번째 = A의 정량 근거, → A-25. B는 T-FIX-12 리뷰 픽셀 실측으로 검증됐고 C·D1·D3은 2026-10-01 코드·원문 대조로 참임을 확인했다).
   - **재판정: (a) 주석은 여전히 쓴다 — 내용만 바뀐다.** 근거: 틀린 전제가 사라져도 설명할 것이 남는다. `tooLarge` 플래그 하나가 **"promise 정착 시점"과 "소켓 종료 시점"을 분리하는 순서 불변식**을 들고 있는데, 기존 JSDoc은 **외부 동작**(즉시 거부 / 나중에 소켓 종료)만 적고 `destroy()` 분기·`!tooLarge` 가드가 **promise 상태와 어떤 관계인지**는 적지 않는다. 그 공백에서 숙련된 독자 두 명(T-FIX-07 리뷰어 → 이 ADR)이 연달아 불변식을 거꾸로 읽었다 = 오독 위험이 **실증됐다**. 그러므로 (b)(기존 JSDoc으로 충분하니 코드 변경 0건 종결)는 기각한다 — 다만 (b)를 고르더라도 외부 동작·계약·테스트는 동일하므로 이 판정은 **위험이 아니라 가독성 근거**로 내린 것임을 밝혀 둔다.
   - **주석이 담아야 할 내용(확정 문장. 두 자리에 나눠 적고 이 밖의 내용은 넣지 않는다)**
     - `destroy()` 분기: "여기 도달하는 것은 `tooLarge`가 이미 true가 된 뒤의 `data`뿐이다. 최초 상한 초과 시점에 promise는 `reject`로 정착했고 `/open`은 이미 400 `INVALID_BODY`를 보냈다(api-spec `/open`에 정의된 응답이다). 그래서 `destroy()`는 응답 경로가 아니라, 버리는 본문이 소켓을 오래 붙잡지 못하게 하는 자원 보호 조치다."
     - `'error'`·`'end'`의 `!tooLarge` 가드: "`tooLarge`면 promise는 이미 정착돼 있다 — 이 가드는 재정착(무효 호출) 방어이며, promise를 버리는 장치가 아니다."
   - **쓰지 말 것**: "promise를 버린다", "의도적 pending", "resolve·reject 어느 쪽도 되지 않는다", "응답을 보내지 않는다", "api-spec에 이 경로의 응답이 없다" — 전부 사실과 반대다.
   - 동작 변경 0건 · 계약 변경 0건 · 테스트 변경 0건(helper 통과 수 40 유지) · 사용자에게 보이는 변화 0건은 그대로 유효하다.
3. **`WorkflowsHeader.test.tsx`의 className 완전일치(`toBe`) → 유지(기각, 코드 변경 0건)** — 이 테스트는 클래스 문자열을 들고 있지 않고 **`Button` 자신이 렌더한 기준값**과 비교한다(`referenceButtonClassName`). 따라서 `Button` 안에 정당한 클래스가 늘어도 기준값에 같이 나타나 깨지지 않는다. 깨지는 경우는 `WorkflowsHeader`가 **자기 버튼에만** 클래스를 덧붙일 때이고, 그때의 올바른 처방은 단언을 무르게 하는 것이 아니라 기준 렌더에 같은 조건을 주는 것이다. 판정 축(테두리·배경)만 비교하도록 좁히면 클래스 문자열을 테스트가 다시 들고 있어야 해서 T-FIX-09 리뷰 Suggestion(그 결합을 없애라)과 정면으로 어긋난다. 또 `enabled !== disabled`를 먼저 단언해 공허해질 수 없다.
- 영향 문서: `architecture.md`(이 ADR + ADR-48 C 인용 정정), `conventions.md` §7 MUST 1건 신설·1건 인용 정정 / §8 MUST 1건 신설, `ui-spec.md` §공통 `DeskSprite` 행·SCR-02 책상 행·확정된 차이 3항·인용 3곳, `api-spec.yaml` `HookPayload.permission_mode` 설명. `realtime-spec.md` **무수정**. 신설 태스크: T-FIX-11(A) · T-FIX-12(B) · T-FIX-13(D2).
- **사후 정정 이력**
  - **A(정량 근거) → 2026-10-01 정정 완료**(A-25 1, 출처 `docs/reviews/T-FIX-11.md` 범위 밖 A). "실여유 ~150ms"와 "`expect.poll` 기본 격자 `[100, 250, 500, 1000]`"이 **변경 전 코드에 해당하지 않았다** — 변경 전은 web-first 단언이고 실효 격자는 ≤100ms, 실여유 ≈850ms였다. 위 A "원인 판정"·"얻는 것 ①"을 제자리에서 정정하고(폐기한 서술은 인용으로 보존) 결론 범위를 "격자 고정 = 잡음 제거, **원인 규명은 열려 있다**"로 좁혔다. **flaky 원인 재판정과 발동 조건은 → ADR-51.** T-FIX-11은 되돌리지 않는다. **ADR-50에서 세 번째로 확인된 사실관계 오류이고, 세 번 모두 ADR이 리뷰 문서의 전제를 코드 검증 없이 옮긴 것이 원인이었다**(A·D2는 리뷰어가 코드를 읽어, B는 리뷰어가 픽셀·CSS로 잡았다).
  - **B(배경 "21.83px 가림" 투영 · 가시 변화 서술) → 2026-10-01 정정 완료**(A-25 4·5, 출처 `docs/reviews/T-FIX-12.md` Minor 1·2·3). 위 B 배경·가시 변화 항 참조. **처방(clamp + `title`)과 결론은 유지**했고 폐기한 서술은 인용으로 보존했다.
  - **D2 → 2026-10-01 정정 완료**(T-FIX-13 리뷰 Major, 위 D2 참조. `tasks.md` T-FIX-13도 함께 정정).
  - **C·D1·D3** → 2026-10-01 코드·원문 대조로 **참 확인**(C: `HookPayload.java` record에 `permission_mode` 없음·`frontend/`에 해당 문자열 0건·`e2e-08.spec.ts:161`·`e2e-11.spec.ts:330`이 실제 전송 / D1: `docs/ui/README.md:18` 원문 일치 / D3: `WorkflowsHeader.test.tsx:78-88`이 `Button` 자신의 렌더를 기준값으로 쓰고 `:141`이 활성≠비활성을 선단언). 계약 변경 없음.

### ADR-51 FR-001-AC3 E2E flaky는 관측 격자로 설명되지 않는다 — 원인 미규명으로 열어 두고("덫에 걸리게 둔다") 재발 시 조치를 수치 조건으로 확정한다 (A-25, T-FIX-11 리뷰 범위 밖 A, 2026-10-01)

- 다루는 범위: ADR-50 A의 정량 근거 정정과 flaky 원인 **재판정**, 그리고 "어떤 실측값이 나오면 무엇을 하는가"의 발동 조건이다. **ADR-50 A의 처방 (d)와 T-FIX-11은 유효하고 되돌리지 않는다.**
- 바꾸지 않는 것(요구사항·권한 밖): **FR-001-AC3의 예산 2000ms와 측정 지점 "화면에 반영"**(`final_requirements_function.md:162`). 렌더 대기를 예산에서 떼는 측정 분리는 ADR-50 A가 같은 이유로 이미 기각했다.
- **서술 규칙**: 아래 모든 수치에 출처를 달았다. architect가 파일을 직접 읽어 확인한 값과 **리뷰어·팀장의 실측을 인용한 값**을 구분했고, 확인할 수 없는 값은 §6에 **미확인**으로 모았다. ADR-50은 리뷰 문서의 전제를 코드 검증 없이 옮겨 세 번 틀렸다(A·B·D2) — 그 재발을 막는 장치다.

**§1 정량 근거 정정 — 변경 전 실여유는 ~150ms가 아니라 ≈850ms였다**

| 항 | 값 | 출처 |
|---|---|---|
| 예산 | `FILE_CHANGE_DEADLINE_MS = 2000` | `tools/e2e/tests/ui-helpers.ts:23` (architect 직접 확인) |
| 제품 경로(파일 변경 → SSE `registry` 수신) | p95 1,016~1,025ms · **max 1,028ms** | ADR-04 측정 결과, 이 문서 `:395` (architect 직접 확인. 측정 자체는 T-004, 2026-09-21) |
| 백엔드 폴링 간격 기본값 | **1000ms**, `fixedDelay` 방식 | `backend/src/main/java/studio/jay/registry/FolderPoller.java:72` `@Scheduled(fixedDelayString = "${jaystudio.poll-interval-ms:1000}")` (architect 직접 확인) |
| 변경 **전** 관측 격자(web-first 단언, `timeout: 2000`) | 실효 `[0, 20, 50, 100, 100, …]` → **최대 관측 지연 100ms** | `playwright-core/lib/coreBundle.js:23989` `retryWithProgressAndBackoff` — `backoffScale = [20, 50, 100, 100, 500]`, `while (last > timeout/5) pop()`으로 `2000/5 = 400` < 500이라 500 pop, `retryWithProgressAndTimeouts`가 `[0, ...timeouts]`. **팀장이 직접 읽어 독립 확인**(2026-09-29). architect는 재조사하지 않았다(A-25 "확정된 사실") |
| 변경 **후** 관측 격자 | `REFLECTION_POLL_INTERVAL_MS = 25` | `ui-helpers.ts:32` (architect 직접 확인) |
| DOM 반영 실측 기준선(격자 25ms 환경, 전체 실행 9건) | 809·552·589·922·582·591·**1029**·940·998ms → 최대 **1029ms**, 실여유 **971ms** | 팀장 기록 D-088(`docs/progress.md:150`), T-FIX-11 개발자 보고. architect는 재실행하지 않았다 |

- **정정된 산술**: 변경 전 최악값 ≈ 제품 경로 max 1,028ms + React 렌더(**미확인**, 수십 ms로 추정) + 관측 지연 ≤100ms ≈ **1.15s** → 실여유 ≈ **850ms**. 독립 교차 확인: T-FIX-11의 **DOM 지점** 실측 최대 1029ms(격자 25ms 포함)에 옛 격자 차이 ≤75ms를 더해도 ≤1,104ms로 같은 자리에 떨어진다.
- **T-FIX-11이 회복한 여유는 100 → 25ms = 약 75ms**다. ADR-50 A가 적은 "~1s → 25ms"도 틀렸다.
- **ADR-50 A가 왜 틀렸는가**: 변경 **후** 코드가 쓰는 `expect.poll`의 기본 격자(`[100, 250, 500, 1000]` 계열)를 변경 **전** 코드의 격자로 오인했다. 변경 전은 `expect(...).toBeVisible({ timeout: deadlineMs })` 형태의 web-first 단언이고 격자 계열이 다르다. → `ui-helpers.ts:26-31`의 주석은 **새 코드(=`expect.poll`)를 서술하므로 문자 그대로 정확**하다(architect가 직접 읽어 확인). **Tools 수정 지시 없음.**

**§2 flaky 원인 재판정 — 관측 격자로는 설명되지 않는다. 원인은 미규명이다**

- 관측된 사건은 **1회뿐**이다: 팀장의 전체 실행에서 배치 5(`e2e-04` + `e2e-15`)가 1 failed / 8 passed, 이후 두 번 연속 통과, **트레이스 유실**(D-082). 그 1회의 실측 ms는 **영구 미확인**이다(§6).
- **기각 — 관측 격자 단독 원인**: ≤100ms는 실여유 ≈850ms 앞에서 방아쇠가 될 수 없다. ADR-50 A의 "반영 ~1.03s, 다음 관측 ~1.85s" 그림은 성립하지 않는다.
- **기각 — T-FIX-07의 변경이 원인**: 배치 5의 두 spec·`ui-helpers.ts`·`lib/*`·`playwright.config.ts`·fixture 전부 diff 0건(T-FIX-07 리뷰 판정 인용).
- **기각 가능성 낮음 — 테스트 간 상태 오염**: T-FIX-11·T-FIX-12 리뷰가 배치 격리를 확인했다(인용).
- **남는 가설(유력, 그러나 미확인)**: **전체 스위트 부하에서 제품 경로 + 렌더가 실제로 ~1.9s를 넘었다.** 하위 후보 셋 — ① **폴링 위상**이 구조적으로 예산의 절반을 먹는다(간격 1000ms, 0~1000ms 균일. `fixedDelay`이므로 스캔이 길어지면 주기 자체가 1000ms보다 **커진다** — `FolderPoller.java:72`, architect 직접 확인) ② 전체 스위트 부하에서 컨테이너·Chromium·Playwright가 CPU를 경쟁 ③ macOS Docker bind mount의 `stat` 지연(폴링 1회가 디렉터리 목록 4개 + stat 수백 회 — ADR-04 `:393`)으로 tick이 늘어진다.
- **판정(이 ADR의 결론)**: **원인 미규명.** 그리고 이 가설이 참이면 그것은 **테스트 결함이 아니라 FR-001-AC3 자체의 여유 부족**이다 — 예산 2000ms 중 폴링 위상 상한 1000ms가 절반을 선점하는 설계(ADR-04 + AC3)가 구조적 원인 후보다. 평상시 기준선 최대 1029ms가 "예산의 절반을 쓴다"는 것이 바로 그 그림이다(D-088의 관찰과 같다).
- **설계 상한(산술, 출처 표시)**: 폴링 위상 ≤1000ms(`FolderPoller.java:72`) + 스캔·재파싱·방송 ≤85ms(ADR-04 `:395` 실측 상한 82ms를 올려 잡음) + 렌더(미확인, 수십 ms) + 격자 25ms ≈ **≤1,150ms**. 기준선 최대 1029ms는 이 안에 있다. **이 1,150ms가 아래 발동 조건의 기준선이다.**
- **보고 문구 규칙(A-25 3)**: 이 사안을 보고할 때는 "**1회 실패 관측 · 원인 미규명 · 재발 시 자동 진단**"으로 적는다. "flaky 해결됨"·"원인은 관측 격자"로 적지 않는다.

**§3 대응 결정 — "덫에 걸리게 둔다"(사용자 결정 E-010, 2026-09-29. 다시 논의하지 않는다)**

- 팀장이 §1·§2의 정정된 그림을 사용자에게 설명하고 선택지 3개(① 덫에 걸리게 둔다 ② 폴링 1초 → 0.5초로 여유 확보 ③ 지금 부하 추적)를 제시했고 사용자가 **①**을 택했다(`docs/progress.md:139` D-090, `:265` E-010).
- 따라서: **부하 재현 금지**(사용자 재허락 사항), **E2E 폴링 간격 축소 금지**(conventions §8 MUST ③ 불변), **폴링 운영 기본값 500ms 축소도 지금은 하지 않는다** — ADR-04 `:394`가 남긴 여지로 **보류**하고, 쓸 조건만 §4에서 수치로 못 박는다.
- **덫 = T-FIX-11이 깔아 둔 자동 진단.** 추가 도구가 필요 없다(architect가 `ui-helpers.ts:212-256`을 직접 읽어 확인):
  - 통과 실행에서도 호출 9곳마다 `[FR-001-AC3 반영 시간] <label>: <n>ms (기한 2000ms · 관측 격자 25ms)`가 **stdout**(`--reporter=list` 출력)과 `testInfo.annotations`에 남는다.
  - 실패가 두 문구로 갈린다 — **F1** "…이 10000ms 안에 화면에 반영되지 않았습니다(기능 결함)"(진단 상한 `REFLECTION_DIAGNOSTIC_TIMEOUT_MS = 10_000`, `:38`) / **F2** "`<label>` 반영이 2000ms를 넘었습니다(실측 `<n>`ms)". F1 경로도 실측 대기 ms를 annotation·메시지·stdout에 남긴다 → **트레이스 유실로 다시 아무것도 모르게 되는 일은 없다.**

**§4 발동 조건 (수치)**

판정 입력은 셋뿐이고 모두 위 산출물이다 — **M** = 한 번의 전체 `./scripts/run-e2e.sh` 실행에서 나온 `[FR-001-AC3 반영 시간]` 실측 ms의 **최대값**, **F2**(예산 초과 실패), **F1**(미반영 실패).

| 구간 | 조건 | 해석 | 조치 |
|---|---|---|---|
| **정상** | `M ≤ 1200ms` | 설계 상한 ≈1,150ms 안(기준선 1029ms 포함). 폴링 위상이 예산 절반을 쓰는 평상시 분포 | 없음. M만 기록 |
| **관찰** | `1200 < M ≤ 1600ms` | 설계 상한을 넘었다 = 폴링 위상만으로 설명되지 않는 지연이 섞였다. 아직 예산 안(실여유 ≥400ms) | M·실행 조건(동시 실행 여부, 머신 상태)을 `progress.md`에 기록. **최근 전체 실행 5회 안에서 2회** 이 구간이면 **발동**으로 올린다 |
| **발동** | 아래 중 **하나라도** 참 — ① `M > 1600ms`(실여유 < 400ms = 폴링 위상 상한 1000ms의 40%도 남지 않는다) ② 한 번의 전체 실행에서 1200ms 초과 값이 **2개 이상**(단발 잡음이 아니다) ③ **F2 실패 1회**(실측값과 무관 — 예산을 실제로 넘겼다) ④ 관찰 구간 2회 누적 | 예산 2000ms가 폴링 위상 상한을 흡수하지 못한다 = **구조적 여유 부족**. 테스트가 아니라 제품 여유를 고쳐야 한다 | **§5 (a)** — ADR-04가 남긴 폴링 500ms 카드를 쓴다 |
| **조사** | **F1 실패**, 또는 `M > 3000ms` | 폴링 간격을 반으로 줄여도 설명·해결되지 않는다(두 배 위상 2000ms도 넘는 값이다) → 제품 결함 또는 환경 결함 | **§5 (b)** — 폴링 카드를 쓰지 않고 먼저 가른다 |

- 경계값의 근거: **1200** = 설계 상한 1,150ms + 관측 오차 여유 50ms. **1600** = 실여유 400ms 선 — 기준선 최대 1029ms에서 한 번 관측된 흔들림(배치 5 3회 안에서 1000~1027ms, 폭 ≈27ms)의 10배를 흡수할 수 있는 최소선으로 잡았다. **3000** = 폴링 간격을 500ms로 줄였을 때의 최악값(≈650ms)에 두 배 위상(2000ms)을 더해도 닿지 않는 값 = "폴링으로 설명 불가" 선.
- **판정 입력 M은 기록되지 않으면 쓸 수 없다** → 전체 E2E 실행을 보고할 때 M을 함께 적는 의무를 `conventions.md` §8 MUST ⑤로 못 박는다.

**§5 발동 시 조치**

- **(a) 운영 폴링 간격 1000 → 500ms** — ADR-04 `:394`의 "미달이면 간격을 500ms로 줄인다(그래도 CPU 영향 미미)"가 이미 열어 둔 카드다.
  - 손대는 곳(발동 시 **새 T-FIX 태스크로 분리**한다. 지금은 만들지 않는다): `FolderPoller.java:72`의 `@Scheduled(fixedDelayString = "${jaystudio.poll-interval-ms:1000}")` 기본값 → `500`, 같은 파일 `:34` javadoc, 기본값을 일부러 주입하지 않는 `FolderPollerRealPollIntervalLatencyTest`의 기대·주석, ADR-04 `:395`의 "간격 500ms 축소 불필요" 문장 정정.
  - 기대 효과(산술): 최악 ≈ 500(위상) + 85(스캔·방송) + 렌더 + 25(격자) ≈ **≤650ms** → 실여유 ≈ **1,350ms**. D-090에서 사용자에게 "여유 0.85 → 1.4초"로 설명된 바로 그 카드다.
  - **E2E만 낮추는 것은 여전히 금지**다(conventions §8 MUST ③). 운영 기본값을 바꾸고 E2E는 그 기본값을 그대로 쓴다 — `compose.e2e.yaml`에 `jaystudio.poll-interval-ms`를 넣지 않는다는 규칙은 불변이고, 그래야 "운영 설정에서 AC3가 지켜지는가"를 계속 검증한다.
  - 요구사항·계약 변경 **아님**: FR-001-AC3 예산·측정 지점 불변, `api-spec.yaml`·`realtime-spec.md` 불변, 화면 변화 0건. ADR-04의 측정 의무가 이 축소를 미리 열어 두었으므로 **새 요구사항 승인은 필요하지 않다.** 다만 **폴링 횟수가 2배가 되고** D-090에서 사용자가 지금은 고르지 않은 선택지 ②이므로, **발동 시 팀장이 사용자에게 알린다.**
  - 금지(발동해도 하지 않는다): 예산 증액, `retries` 도입, 렌더를 예산에서 떼기, `REFLECTION_POLL_INTERVAL_MS` 추가 축소(25ms는 이미 실여유의 3% 미만이라 얻을 것이 없다), 부하 재현.
- **(b) 조사 구간** — 실패 실행의 `--reporter=list` 출력·`test-results/`·annotation을 **먼저 보존**하고(F1도 실측 대기 ms를 남긴다) 제품 경로 어느 항이 늦었는지부터 가른다. 백엔드 쪽 수단은 ADR-04 측정 테스트(`FolderPollerRealPollIntervalLatencyTest`·`FolderPollerLatencyTest`)의 재실행이고 **부하 유발이 아니다.** 부하 재현은 E-010이 "하지 않는다"로 닫아 둔 사항이라 사용자 재허락이 필요하다.

**§6 미확인으로 남긴 값(단정하지 않는다)**

1. **T-FIX-07에서 실패한 1회의 실측 ms** — 트레이스 유실(D-082). **영구 미확인.** 이것이 §2를 "미규명"으로 닫는 1차 이유다.
2. **React 렌더 단독 소요** — 독립 측정이 없다. "수십 ms"는 ADR-50 A에서 온 **추정**이고 architect가 확인하지 못했다. DOM 지점 실측(최대 1029ms)이 ADR-04의 SSE 지점 실측(max 1,028ms)과 거의 같다는 **간접 증거**만 있다.
3. **전체 스위트 부하에서의 제품 경로 분포** — 측정하지 않았다(부하 재현 금지, E-010).
4. **Playwright 버전 의존성** — §1의 web-first 격자는 현재 `playwright-core`(T-FIX-11 리뷰 기준 1.63.0) 한 버전의 상수다. 다른 버전에서 같은지는 미확인. 우리 코드가 격자를 명시하므로 **이 미확인이 판정에 영향을 주지 않는다**(그것이 T-FIX-11의 이득이다).
5. **ADR-50 B 관련 인용 수치** — span-3 상태 줄 96.67px, span-1 열 폭 74.84px, 칸 안쪽 폭 ≈66.8px, 13자 이름 칩 81.91px, 팀장 배지 좌표, 상태 글자 64px·열 pitch 75px·겹침 0은 모두 **리뷰어·T-024 실측 인용**이며 architect가 다시 재지 않았다. 산술 정합성만 확인했다(66.8 ≈ 74.84 − `p-1` 4px×2).

**§7 코드 변경·계약 변경**

- **코드 변경 0건.** `ui-helpers.ts`의 주석은 새 코드 기준으로 정확하고(§1), T-FIX-11·T-FIX-12의 구현은 그대로 유효하다. 틀린 것은 ADR 본문의 정량 서술뿐이었다.
- **계약 변경 0건** — `api-spec.yaml`·`realtime-spec.md` 무수정, `ui-spec.md`는 SCR-02 "확정된 차이" 3항의 서술 정정만(데이터 출처·화면 동작·문구 변경 0건).
- 영향 문서: 이 ADR 신설 · ADR-50 A "원인 판정"·"얻는 것 ①"·B 배경·B 가시 변화·사후 정정 이력 정정 · `conventions.md` §7 MUST 1건(이유 정정 + "칸 폭을 받는" 한정)·§8 MUST 1건(이유 정정 + ⑤ 신설) · `ui-spec.md:274` · `tasks.md` A-25·T-FIX-12 배경·T-FIX-14 수치 2종.
- 조건부 후속 태스크: §4 발동 구간에 들어가면 **그때 신설**한다(§5 (a) 범위). 발동 전에 만들지 않는다 — 조건이 충족되지 않은 todo 태스크는 우선순위를 흐린다.

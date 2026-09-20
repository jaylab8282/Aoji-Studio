# Jay Studio — Final Architecture Requirements

- Status: Approved
- Version: 1
- 최종 수정일: 2026-09-20
- 원본: `docs/requirements_architecture.md` (2026-09-17)

## Change Log

| 버전 | 날짜 | ID | 요약 | 재시작 단계 |
|---|---|---|---|---|
| v1 | 2026-09-20 | NFR-01 ~ NFR-12 | 최초 작성 | - |

## System Components

| 컴포넌트 | 위치 | 책임 | 비책임 |
|---|---|---|---|
| Frontend | 브라우저 (컨테이너가 정적 파일 제공) | 01~07 화면, 실시간 갱신 표시, 로딩·빈·에러·연결 끊김 상태, 열기 도우미 직접 호출 | 파일 접근, 상태 계산, 비즈니스 규칙 판단 |
| Jay Studio Server | Docker 컨테이너 (맥북 Docker Desktop) | REST API, SSE 실시간 전송, hook 이벤트 수집·토큰 검증, 에이전트 상태 계산, 정의·구성 파일 읽기·쓰기, 파일 변경 감지, 이벤트 보존·마스킹, 수집 토큰 발급, 도우미 토큰 읽기·전달 | 에이전트 실행, Claude Code 설정 수정, 호스트 명령 실행, Docker 제어 |
| 프로젝트 폴더 | 맥북 `JayStudio/` → 컨테이너 bind mount | `.claude/agents/`, `.claude/skills/`, `.claude/settings.json`, `.jaystudio/` 보관. 파일이 원본 | - |
| Claude Code (기존) | 맥북 호스트, `JayStudio` 폴더에서 시작 | 에이전트 실행, 사용자가 넣은 `http` hook으로 이벤트 전송 | Jay Studio 상태 관리 |
| 열기 도우미 | 맥북 호스트 (컨테이너 밖), Node.js 단일 파일, launchd LaunchAgent | `127.0.0.1:4181`에서 Origin + 토큰 검사 후 macOS 기본 터미널을 열고 `JayStudio` 폴더에서 `claude`(기본 세션) 또는 `claude --agent <팀장 name>`(03 팀장 호출) 실행 — 이 동작 하나만. 첫 실행 시 도우미 토큰 생성 | 임의 명령 실행, 다른 폴더 열기, 파일 접근 |
| 이벤트 재생 도구 | `Jay_Studio/` 안의 개발 도구 | 실제 hook 입력 형식의 JSON을 수집 주소로 순서대로 POST해 자동 테스트·E2E에서 상태 전이를 검증 | 운영 기능 아님 |

### Communication Rules
- 브라우저는 Jay Studio Server와 열기 도우미 두 곳과만 통신한다. 도우미 호출은 `기본 세션` 여부와 팀장 name만 보낸다.
- 이벤트는 Claude Code `http` hook → Server 수집 주소(`http://127.0.0.1:4180/<경로>`, 경로는 architect)로만 들어온다.
- Server는 마운트된 프로젝트 폴더 밖의 호스트 파일에 접근하지 않는다.
- Server는 `docker.sock`에 접근하지 않는다.
- 컨테이너는 호스트 앱을 실행할 수 없으므로 터미널 열기는 호스트의 열기 도우미만 한다.
- 웹은 `.claude/settings.json`을 쓰지 않는다. hook 설정은 사용자가 07의 예시를 복사해 넣는다.

## Tech Stack

| 항목 | 선택 | 버전 | 이유 |
|---|---|---|---|
| Backend | Spring Boot (Java) | 4.1.x · Java 25 LTS | 사용자가 다뤄 본 유일한 백엔드. 4.0 라인은 2026-12 지원 종료 |
| 빌드 도구 | Gradle (Kotlin DSL) | 8.x | 사용자 확정 |
| Frontend | React + TypeScript | React 19.3 · TypeScript 5.x | 사용자 주력. 타입체크로 계약 불일치를 리뷰에서 잡음 |
| 번들러·개발 서버 | Vite | 8.x | React 표준 조합 |
| UI 스타일링 | Tailwind CSS | 4.3.x | `docs/ui/design-tokens.md`의 토큰을 `@theme`로 옮긴다. 별도 컴포넌트 라이브러리 없음(픽셀 캐릭터는 인라인 SVG) |
| 라우팅 | React Router | v7 | 화면 7개와 브레드크럼에 URL이 필요 |
| 실시간 전송 | SSE (Spring MVC `SseEmitter`) | - | 서버→브라우저 단방향이면 충분. WebSocket은 쓰지 않음 |
| 이벤트 저장 | SQLite (sqlite-jdbc, WAL 모드) | 3.x | 저장 대상이 이벤트뿐이고 쓰기 주체가 서버 하나 |
| 설정·구성 저장 | 프로젝트 폴더의 파일 | - | `.claude/agents/*.md`, `.jaystudio/teams/*.json`이 원본 |
| 열기 도우미 | Node.js 단일 파일 (외부 의존 없음) | Node 24 (맥북 설치본) | 브라우저가 직접 호출. launchd로 로그인 시 자동 실행 |
| 단위 테스트 | JUnit 5 + Spring Boot Test / Vitest + Testing Library / Node `node:test`(도우미) | - | 각 스택 표준 |
| E2E 테스트 | Playwright | 1.x | 실제 컨테이너를 띄워 Frontend–Backend 연결과 화면 상태를 검증. 1440 폭 스크린샷 대조 |
| 컨테이너 구성 | 단일 컨테이너 · 단일 포트 | - | 프론트 빌드 결과를 Spring Boot가 정적 파일로 제공 |
| 실행 환경 | Docker Desktop (macOS, Apple Silicon) | 사용자 설치본 (Docker 29.x) | 맥북 M4 Pro · 24GB. 이미지는 `linux/arm64` |
| 저장소 구성 | 프로젝트별 git 저장소 1개, `backend/`·`frontend/`·`helper/`·`tools/` 폴더 | - | 모노레포 도구 없음 |

- 개발 중에는 Vite 개발 서버와 Spring Boot를 따로 띄우고, 컨테이너 빌드 시에만 프론트 빌드 결과를 백엔드가 제공한다.
- 맥북 로컬 JDK는 21이다. Gradle toolchain(foojay resolver)이 JDK 25를 `~/.gradle/jdks/`에 자동으로 내려받아 쓴다. 맥북 시스템에는 설치하지 않는다.

## Network & Infrastructure

### 실행 구성

| 대상 | 위치 | 비고 |
|---|---|---|
| Jay Studio 컨테이너 | 맥북 Docker Desktop | 포트 `4180`을 `127.0.0.1`에만 공개(`127.0.0.1:4180:4180`). Docker 기본값은 모든 인터페이스라 반드시 명시 |
| 프로젝트 폴더 | 맥북 `/Users/jaybee/Desktop/JayStudio` | 컨테이너 생성 시 bind mount로 고정. compose `.env`의 값 |
| Claude Code | 맥북 호스트 | 항상 `JayStudio` 폴더에서 시작 |
| 열기 도우미 | 맥북 호스트, `127.0.0.1:4181` | launchd LaunchAgent. Origin + 토큰 |
| 개발 서버 | 맥북 호스트 | Vite `127.0.0.1:5173`, Spring Boot `127.0.0.1:8080`. 컨테이너 없이 개발·단위 테스트 |
| 특수 자원 | 없음 | GPU 불필요 |

### 요청 흐름

```text
브라우저(127.0.0.1) ─HTTP·SSE(Origin+토큰)─▶ Jay Studio 컨테이너(127.0.0.1:4180) ─read/write─▶ [mount] JayStudio/.claude, JayStudio/.jaystudio
Claude Code(맥북, JayStudio에서 시작) ─http hook POST(수집 토큰)─▶ Jay Studio 컨테이너 /<수집 경로>
브라우저 ─HTTP(Origin+도우미 토큰)─▶ 열기 도우미(맥북 127.0.0.1:4181) ─▶ macOS 기본 터미널: cd "<JayStudio 경로>" && claude [--agent <팀장 name>]
```

### 폴더 구조와 Claude Code 시작 위치

```text
JayStudio/                     ← Claude Code 시작 위치, 컨테이너 마운트 대상, git 저장소 아님
├─ .claude/
│  ├─ settings.json            ← Jay Studio 수집 hook (사용자가 07 예시를 복사해 넣음)
│  ├─ agents/                  ← 재사용 에이전트 정의
│  └─ skills/                  ← 재사용 스킬
├─ .jaystudio/
│  ├─ teams/<워크플로우>.json
│  ├─ trash/
│  ├─ <수집 토큰 파일>          ← 서버가 첫 기동 시 생성 (파일명은 architect)
│  └─ <도우미 토큰 파일>        ← 도우미가 첫 실행 시 생성
└─ Jay_Studio/                 ← 이 프로젝트. git 저장소 1개
   ├─ backend/  frontend/  helper/  tools/(이벤트 재생)  docs/
   ├─ Dockerfile, compose.yaml, .env.example
   └─ CLAUDE.md
```

- `.claude/settings.json`은 Claude Code를 시작한 폴더에서만 읽히고, 프로젝트 서브에이전트·스킬은 시작 폴더에서 저장소 루트까지 올라가며 찾는다. 그래서 Claude Code는 항상 `JayStudio`에서 시작한다.

### 마운트
- `JayStudio` 폴더 하나만 읽기·쓰기로 마운트한다. 홈 폴더나 상위 폴더를 마운트하지 않는다.
- bind mount는 컨테이너 생성 시 고정되므로 웹에 경로 변경 기능을 두지 않는다.
- 쓰기 권한이 없으면 Server는 읽기 전용으로 동작한다(FR-001-E2).
- 컨테이너는 root가 아닌 사용자로 실행한다. Docker Desktop(macOS)에서 그 사용자로 마운트 폴더에 쓸 수 있는지 scaffold 단계에서 fixture 폴더로 확인하고, 실패하면 에스컬레이션한다.

### 배포
- 대상은 사용자 맥북 하나다. CI/CD와 이미지 레지스트리 push는 범위 밖이다.
- 실행 방법은 `compose.yaml` 하나로 한다(`docker compose up -d`). 마운트 경로·포트·맥북 경로 표시값은 `.env`에서 읽고, `.env.example`을 커밋한다.
- README·`CLAUDE.md`의 실행 명령은 실제 동작과 일치해야 한다.

## Authentication & Access Control

- 로그인·사용자 계정 없음(단일 사용자).
- 접근 통제는 네트워크 노출 범위와 요청 출처 검사로 한다.
  - 모든 포트(Jay Studio, 도우미)는 `127.0.0.1`에만 바인딩한다.
  - 상태를 바꾸는 API와 SSE 연결은 `Origin`(또는 `Sec-Fetch-Site`) 검사와 브라우저 토큰을 요구한다. 토큰 발급·전달 방식은 architect가 정한다.
  - 수집 주소는 `Content-Type: application/json`과 수집 토큰 헤더를 요구한다. 서버가 첫 기동 시 생성해 `.jaystudio/`에 보관하고, 07 설정 예시에 헤더로 박아 준다. 토큰이 다르면 401.
  - 열기 도우미는 `127.0.0.1:4181` 바인딩 + `Origin` = `http://127.0.0.1:4180`(개발 중 `http://127.0.0.1:5173` 추가 허용) + 도우미 토큰으로만 요청을 받는다. 요청 값은 `기본 세션` 여부와 팀장 name 하나뿐이다. `JayStudio` 경로와 허용 Origin은 설치 시 launchd plist의 실행 인자로 고정한다.
  - Server의 Origin 검사도 `http://127.0.0.1:4180`이 기본이고, 개발 프로필에서만 `http://127.0.0.1:5173`을 추가한다.
  - 팀장 name은 `^[a-z0-9-]+$` 형식만 허용하고, 인자 배열로 실행해 셸 문자열 조합으로 명령 주입이 생기지 않게 한다.
- 토큰이 비어 있으면 인증 없이 동작하지 않는다(NFR-05).

## External Systems

| 시스템 | 연동 방식 | 개발 중 사용 가능 여부 | 자동 테스트 방법 |
|---|---|---|---|
| Claude Code hooks | Claude Code `http` hook → Server HTTP POST | 맥북에 있음. 자동 개발 중 실제 세션으로 검증하지 않는다 | `tools/` 이벤트 재생 도구로 실제 hook 입력 형식의 JSON을 재생. 실제 세션 연동은 사람이 1회 확인 |
| Claude Code 정의 파일 | `.claude/agents/*.md` 읽기·쓰기 | 있음 | 테스트용 임시 fixture 폴더에서 검증. 실제 `JayStudio/.claude/`는 사용하지 않음 |
| macOS 기본 터미널 | 열기 도우미가 `open -a Terminal` 또는 AppleScript로 실행 | 컨테이너 안에서는 불가. 호스트에서는 가능하나 자동 구간에서 실제로 열지 않는다 | 도우미의 Origin·토큰·name 검증과 실행 인자 구성은 `node:test`로 검증(실행 함수는 가짜). 실제 터미널 열림은 사람이 1회 확인 |
| launchd | 설치 스크립트가 `~/Library/LaunchAgents/`에 plist 등록 | 호스트에서 가능하나 자동 구간에서는 설치하지 않는다 | plist 생성 내용을 테스트로 검증. 설치·제거는 사람이 실행 |

### Claude Code hooks (공식 문서 2026-09-20 확인)

| 용도 | 이벤트 |
|---|---|
| 세션 시작·종료 | `SessionStart`, `SessionEnd` |
| --agent 세션 작업 시작·종료 | `UserPromptSubmit`, `Stop` |
| 도구 실행 | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionDenied` |
| 권한·입력 대기 | `PermissionRequest`(즉시), `Notification`(`permission_prompt`, 약 6초 미입력 후) |
| 서브에이전트 | `SubagentStart`, `SubagentStop` |

- 공통 입력 필드 `session_id`, `cwd`, `hook_event_name`, `permission_mode`. `agent_type`은 `--agent` 세션 또는 서브에이전트 안에서, `agent_id`는 서브에이전트 안에서만 온다. 서브에이전트 안에서는 서브에이전트의 `agent_type`이 세션의 `--agent` 값보다 우선한다.
- `http` hook 설정 필드: `type`, `url`, `headers`, `timeout`(기본 600초). 연결 실패·비 2xx 응답은 non-blocking으로 계속 진행, timeout 도달 시 hook 취소. 설정 예시는 `timeout: 3`.
- 사용자 설정에 `allowedHttpHookUrls`가 있으면 수집 주소가 허용 목록에 있어야 한다. 07 안내에 적는다.
- hook 설정 파일 변경은 Claude Code가 자동 반영한다(재시작 불필요).
- `Notification(agent_needs_input)`은 백그라운드 세션·agent view 전용이므로 상태 계산에 쓰지 않는다.

### Claude Code 정의 파일 (공식 문서 기준)
- YAML frontmatter: `name`(소문자·숫자·하이픈), `description` 필수. `tools`를 생략하면 전체 상속. 그 밖에 `disallowedTools`, `model`, `permissionMode`, `skills`, `hooks`, `memory`, `isolation`, `color` 등.
- 본문은 시스템 프롬프트다.
- Server가 모르는 필드와 본문은 수정 시 그대로 보존한다(FR-011-AC1). `model` 허용 값 목록은 architect가 공식 문서로 확인한다.

## Integration Verification

- 목킹 없는 실제 연결 검증: Playwright E2E가 fixture 폴더를 마운트한 실제 컨테이너를 띄우고, 브라우저 → Server API·SSE → 파일 반영 → 화면 갱신을 검증한다. 이벤트 재생 도구가 수집 주소로 JSON을 POST해 상태 전이를 만든다.
- E2E 시나리오 최소 목록: 첫 실행(04-1, 04-7) / 워크플로우 추가 → 가져오기 → 만들기 → 수정(06-5 충돌 포함) → 제거 / 이벤트 재생으로 3상태 전이와 로비·서브에이전트 표시 / 04-3 재연결 / 04-5·04-6 / 다른 Origin 차단 / 토큰 없는 수집 401.
- 화면 대조: E2E가 01·02·03을 1440 폭으로 캡처하고, reviewer가 `docs/ui/screens/*.png`와 대조한다.
- 사람이 확인할 항목: `final_requirements_function.md` Definition of Done의 "사람 확인" 5개.

## Data Storage

| 데이터 | 위치 | 보관 |
|---|---|---|
| 에이전트 정의 | `JayStudio/.claude/agents/<name>.md` | 원본. Server는 메모리 캐시만 둔다 |
| 워크플로우 구성 | `JayStudio/.jaystudio/teams/<이름>.json` | 워크플로우 이름, 설명, 팀장, 팀원. 스키마는 architect가 정한다 |
| 휴지통 | `JayStudio/.jaystudio/trash/` | 제거한 정의 파일. 덮어쓰지 않음(시각 접미사). 자동 비우기 없음 |
| 수집 토큰 | `JayStudio/.jaystudio/` 안의 파일 (모드 600) | 서버 첫 기동 시 생성. 삭제하면 다음 기동 시 재생성 |
| 도우미 토큰 | `JayStudio/.jaystudio/` 안의 파일 (모드 600) | 도우미 첫 실행 시 생성 |
| 이벤트 | SQLite 파일, Docker named volume (예: `jaystudio-data`, 이름은 architect) | 30일 보존 후 삭제 · WAL 모드 · 저장 전 마스킹된 요약만 저장. 볼륨을 지우면 이벤트만 사라진다 |
| 에이전트 실행 상태 | Server 메모리 | 컨테이너 재시작 시 모두 `대기`로 초기화 |

- 파일 쓰기 안전성:
  - 정의·구성 파일은 임시 파일에 쓴 뒤 rename으로 바꿔 중간 실패 시 원본이 깨지지 않게 한다.
  - 저장 전 수정 시각으로 외부 변경과의 충돌을 감지한다(FR-011-AC4).
  - 이름 변경·소속 변경·제거처럼 정의 파일과 구성 파일을 함께 바꾸는 작업은 한쪽만 반영된 채 끝나지 않는다. 실패 시 되돌린다.
  - 마운트 밖을 가리키는 심볼릭 링크는 따라가지 않는다.
- 백업은 범위 밖이다.

## Repository & Commit Policy

- git 저장소: `JayStudio/Jay_Studio/` 1개 (이미 `git init` 됨, 커밋 0). `JayStudio` 루트는 저장소가 아니다. `.claude/agents/` 버전 관리는 범위 밖이다.
- 커밋은 develop-tech-lead만 한다. 태스크 단위로 커밋하고, 리뷰 PASS 후 커밋한다.
- `.env`는 커밋하지 않고 `.env.example`만 커밋한다. 토큰·SQLite 파일·`node_modules`·빌드 산출물은 `.gitignore`.
- git push는 사용자 요청 없이 하지 않는다.

## Non-functional Requirements

| ID | 항목 | 기준 |
|---|---|---|
| NFR-01 | 규모 | 사용자 1명, 맥북 1대, 프로젝트 폴더 1개. 브라우저 탭 5개 동시 접속 시 모두 같은 상태를 2초 이내에 본다 |
| NFR-02 | 반응 시간 | 파일 변경·hook 이벤트가 화면에 반영되는 시간 2초 이내. 수집 요청 응답 100ms 이내. 목록 API(에이전트 100개, 워크플로우 30개) 응답 1초 이내 |
| NFR-03 | Claude Code 비차단 | 서버가 꺼져 있거나 느려도 Claude Code 작업이 멈추지 않는다. hook 설정 예시가 `http` + `timeout: 3`으로 이를 보장한다 |
| NFR-04 | 네트워크 노출 | Jay Studio 포트와 도우미 포트는 `127.0.0.1`에만 바인딩. `0.0.0.0` 바인딩은 결함 |
| NFR-05 | 보안 기본값 | 필수 설정(맥북 경로 환경 변수, 포트) 누락 시 기동 실패. 토큰 파일을 만들 수 없으면 기동 실패. 인증 없이 동작하는 기본값 없음 |
| NFR-06 | 컨테이너 격리 | `docker.sock` 미마운트, `JayStudio` 밖 호스트 경로 미마운트, root 아닌 사용자 |
| NFR-07 | 경로 안전 | 파일 경로는 사용자 입력으로 정하지 않는다. name·워크플로우 이름 규칙으로 경로 이탈을 막고 심볼릭 링크는 따라가지 않는다 |
| NFR-08 | 민감 정보 | 이벤트 요약은 저장 전 마스킹. 서버 로그에 hook 본문 원문·토큰을 남기지 않는다 |
| NFR-09 | 가용성 | 컨테이너 재시작 후 파일 기반 데이터와 이벤트 DB는 유지되고 실행 상태만 초기화 |
| NFR-10 | 테스트 가능성 | 실제 Claude Code·실제 `JayStudio` 폴더 없이 이벤트 재생 도구와 fixture 폴더로 모든 AC·E를 자동 검증. Frontend–Server는 실제 컨테이너 E2E |
| NFR-11 | UI 구현 기준 | 화면 요소마다 데이터 출처(API 필드), 빈·로딩·에러·연결 끊김 상태, 클릭 시 이동이 ui-spec에 명시. 리뷰는 `docs/ui/`와 대조 |
| NFR-12 | 접근성 | 본문 대비 4.5:1 이상, 상태는 색+글자, 아이콘 버튼 `aria-label`, 클릭 영역 최소 34px |

## Automation Policy

기획은 `JayStudio` 폴더의 기본 세션에서 `/planner Jay_Studio`로 하고, 승인 후 **새 세션**에서 `claude --agent develop-tech-lead`로 자동 개발을 시작한다. 모든 산출물은 `JayStudio/Jay_Studio/` 아래에 둔다.

### 팀장 자율 결정
- 확정 스택 안의 세부 설계·구현, 스택 생태계 안의 라이브러리 추가(예: YAML 파서, 파일 감시 라이브러리, sqlite 마이그레이션 도구)
- 파일 변경 감지 방식(감시 라이브러리 vs 1~2초 폴링) — architect가 NFR-02를 만족하는지 측정해 ADR로 남긴다 (원본 OQ-A1)
- 디렉터리 구조, 내부 모듈, API 경로, SSE 메시지 형식, 구성 파일 스키마, 토큰 파일 이름·형식, 화면 컴포넌트 구조
- Dockerfile·compose 파일·hook 설정 예시·열기 도우미 소스·launchd plist·설치 스크립트·이벤트 재생 도구 작성(파일 작성까지)
- `Jay_Studio/` 안에서의 커밋
- Gradle toolchain 설정으로 JDK 25를 `~/.gradle/jdks/`에 자동 내려받기, Playwright 브라우저를 사용자 캐시(`~/Library/Caches/ms-playwright`)에 내려받기

### 사람에게 에스컬레이션
- 확정 스택(Decision Log)을 벗어나는 변경
- API·SSE 메시지 계약을 사용자에게 보이는 동작이 바뀌게 변경
- 확정 UI 기준(`docs/ui/`)과 다른 화면·흐름이 필요한 경우
- 실제 `JayStudio` 폴더를 마운트한 컨테이너 실행, 실제 포트 충돌
- 열기 도우미를 맥북에 설치·등록(launchd)
- `JayStudio/.claude/settings.json` 수정
- 요구사항 문서와 구현이 충돌하거나 해석이 둘로 갈리는 경우
- 맥북에 소프트웨어 설치(`Jay_Studio/`·Gradle·npm·Playwright 캐시 밖에 설치되는 것, 예: brew, 시스템 JDK)

### 금지
- `JayStudio/.claude/`(에이전트·스킬·설정)와 `JayStudio/.jaystudio/`의 실제 파일 생성·수정·삭제 — 테스트는 임시 fixture 폴더로
- `Jay_Studio/` 밖 파일 수정
- `0.0.0.0` 바인딩, `docker.sock` 마운트, `JayStudio` 밖 호스트 경로 마운트
- git push, 데이터 삭제
- 웹에서 에이전트·셸 명령을 실행하는 기능, 로그인·외부 접속 기능 추가
- 자동 구간에서 실제 터미널 열기·launchd 등록 실행

## Decision Log

원본 Decision Log(사용자 확정)는 그대로 유지한다. 아래는 planner 세션에서 추가로 확정한 것이다.

| # | 질문 | 결정 | 이유 |
|---|---|---|---|
| D-A1 | OQ-A2 hook 전송 방식 | `type: "http"`, `timeout: 3`, 수집 토큰을 `headers`에 리터럴로 포함 | 공식 문서: 연결 실패·비 2xx non-blocking. 환경 변수 방식은 모든 셸·도우미에 변수를 전달해야 해 설정 부담이 큼 |
| D-A2 | OQ-A5 도우미 경로·구현·설치 | 브라우저 → 도우미 직접(Origin + 토큰), Node.js 단일 파일, launchd LaunchAgent + 설치·제거 스크립트 | 컨테이너→호스트 도달 검증 불가(Docker Desktop 미기동)로 불확실성 회피. Node 24 설치됨 |
| D-A3 | OQ-A1 파일 변경 감지 | architect가 정한다 (자율 결정 범위) | 확정 스택 안의 판단 |
| D-A4 | OQ-A3 git 저장소 단위 | `Jay_Studio/`만 저장소, 루트는 저장소 아님 | 이미 그 상태. 프로젝트 이력 분리, 자동 커밋에 에이전트 정의 변경이 섞이지 않음 |
| D-A5 | OQ-A4 이벤트 저장 위치·마스킹 | Docker named volume, 저장 시점 마스킹 | 프로젝트 폴더에 DB·WAL 파일이 생기지 않음. 원문이 어디에도 남지 않음 |
| D-A6 | OQ-A6 경로·포트·실행 | `/Users/jaybee/Desktop/JayStudio`, 프로젝트 `Jay_Studio`, Jay Studio 4180 / 도우미 4181 / 개발 Vite 5173·Spring 8080, `docker compose up -d` + `.env`, `linux/arm64`, root 아닌 사용자, JDK 25는 Gradle toolchain 자동 설치 | 환경 확인 결과(arm64, Docker 29.x, JDK 21, Node 24) 반영 |

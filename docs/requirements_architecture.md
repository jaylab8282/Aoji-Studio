# Jay Studio — Architecture Requirements (Draft)

> **Planner 입력용 초안**
> - 사용자와 대화로 정리하고 사용자가 검토한 초안이다. `/planner`는 이 문서를 수정하지 않고, 이를 바탕으로 `JayStudio/<프로젝트명>/docs/final_requirements_architecture.md`를 작성한다.
> - **Decision Log 항목은 사용자가 확정한 것이다. 다시 묻지 않는다.**
> - 본문은 명백한 충돌이나 Automation Readiness Checklist 누락이 없으면 그대로 final 문서로 옮긴다.
> - 사용자에게 물어볼 것은 맨 아래 **Open Questions**와 `requirements_function.md`의 Open Questions다. 영향도 순으로 정리해 두었다.
> - 화면 기준은 `docs/JayStudio_Front_Wireframe.pdf`다. 이전에 검토한 라즈베리파이·K3s·Jenkins·외부 도메인 구성은 이 프로젝트와 무관하다.
> - **(제안)** 표시는 사용자 확정이 아니다.
> - 최종 수정일: 2026-09-17

## System Components

| 컴포넌트 | 위치 | 책임 | 비책임 |
|---|---|---|---|
| Frontend | 브라우저 (컨테이너가 정적 파일 제공) | 01~07 화면, 실시간 갱신 표시, 로딩·빈·에러·연결 끊김 상태 | 파일 접근, 상태 계산, 비즈니스 규칙 판단 |
| Jay Studio Server | Docker 컨테이너 (맥북 Docker Desktop) | REST API, 실시간 전송, hook 이벤트 수집, 에이전트 상태 계산, 정의·구성 파일 읽기·쓰기, 파일 변경 감지, 이벤트 보존·마스킹 | 에이전트 실행, Claude Code 설정 수정, 호스트 명령 실행, Docker 제어 |
| 프로젝트 폴더 | 맥북 `JayStudio/` → 컨테이너 bind mount | `.claude/agents/`, `.claude/skills/`, `.claude/settings.json`, `.jaystudio/` 보관. 파일이 원본 | - |
| Claude Code (기존) | 맥북 호스트, `JayStudio` 폴더에서 시작 | 에이전트 실행, 사용자가 넣은 hook으로 이벤트 전송 | Jay Studio 상태 관리 |
| 맥북 열기 도우미 | 맥북 호스트 (컨테이너 밖) | macOS 기본 터미널을 열고 `JayStudio` 폴더에서 `claude`(기본 세션) 또는 `claude --agent <팀장 name>`(03 팀장 호출) 실행 — 이 동작 하나만 | 임의 명령 실행, 다른 폴더 열기, 파일 접근 |

- Frontend와 Server를 한 컨테이너·한 포트로 둘지: OQ-A1 (제안: 단일 컨테이너, 단일 포트).

### Communication Rules
- 브라우저는 Jay Studio Server와만 통신한다. `Claude 열기` 요청 경로만 예외이며 OQ-A5에서 정한다.
- 이벤트는 Claude Code hook → Server 수집 주소(`http://127.0.0.1:<포트>/<경로>`)로만 들어온다.
- Server는 마운트된 프로젝트 폴더 밖의 호스트 파일에 접근하지 않는다.
- Server는 `docker.sock`에 접근하지 않는다. (`docker.sock` 접근은 호스트 전체 제어와 같다 — Docker 보안 문서)
- 컨테이너는 호스트 앱을 실행할 수 없으므로 터미널 열기는 호스트의 열기 도우미만 한다.
- 웹은 `.claude/settings.json`을 쓰지 않는다. hook 설정은 사용자가 예시를 복사해 넣는다.

## Tech Stack

| 항목 | 선택 | 버전 | 이유·요구 조건 |
|---|---|---|---|
| Backend | Spring Boot (Java) | 4.1.x · Java 25 LTS | 사용자가 다뤄 본 유일한 백엔드. 에스컬레이션과 리뷰 결과를 사용자가 판단할 수 있어야 함. 4.0 라인은 2026-12 지원 종료 |
| 빌드 도구 | Gradle | 8.x | 사용자 확정 |
| Frontend | React + TypeScript | React 19.3 | 사용자 주력. 타입체크로 계약 불일치를 리뷰에서 잡기 위해 TypeScript |
| 번들러·개발 서버 | Vite | 8.x | React 표준 조합 |
| UI 스타일링 | Tailwind CSS | 4.3.x | 사용자 주력. `docs/ui/design-tokens.md`의 토큰을 테마 설정으로 옮긴다 |
| 라우팅 | React Router | v7 | 화면 7개와 브레드크럼에 URL이 필요 |
| 실시간 전송 | SSE (Spring MVC `SseEmitter`) | - | 서버→브라우저 단방향이면 충분하고, WebSocket과 달리 CORS 보호를 받아 다른 로컬 페이지의 연결을 막기 쉬움 |
| 이벤트 저장 | SQLite (sqlite-jdbc, WAL 모드) | - | 저장 대상이 이벤트뿐이고 쓰기 주체가 서버 하나. DB 서버·계정 운영 불필요. 30일 경과 행 삭제와 공간 정리를 주기 작업으로 둔다 |
| 설정·구성 저장 | 프로젝트 폴더의 파일 | - | `.claude/agents/*.md`, `.jaystudio/teams/*.json`이 원본. DB 사본을 원본으로 두지 않음 |
| 단위 테스트 | JUnit 5 + Spring Boot Test / Vitest + Testing Library | - | 각 스택 표준 |
| E2E 테스트 | Playwright | - | 실제 컨테이너를 띄워 Frontend–Backend 연결과 화면 상태를 검증. 기준 스크린샷 대조도 여기서 |
| 컨테이너 구성 | 단일 컨테이너 · 단일 포트 | - | 프론트 빌드 결과를 Spring Boot가 정적 파일로 제공. `127.0.0.1`에 포트 하나만 공개 |
| 실행 환경 | Docker Desktop (macOS, Apple Silicon) | 사용자 설치본 | 맥북 M4 Pro · 메모리 24GB. 이미지는 arm64로 빌드 |
| 저장소 구성 | 프로젝트별 git 저장소 1개, `backend/`·`frontend/` 폴더 | - | 모노레포 도구(Turborepo·Nx 등)는 쓰지 않는다. 패키지가 둘뿐이고 언어가 달라 이득이 없음 |

개발 중에는 Vite 개발 서버와 Spring Boot를 따로 띄우고, 컨테이너 빌드 시에만 프론트 빌드 결과를 백엔드가 제공한다.

## Network & Infrastructure

### 실행 구성

| 대상 | 위치 | 비고 |
|---|---|---|
| Jay Studio 컨테이너 | 맥북 Docker Desktop | 포트는 `127.0.0.1`에만 공개(`-p 127.0.0.1:<포트>:<포트>`). Docker `-p` 기본값은 모든 인터페이스라 반드시 명시 |
| 프로젝트 폴더 | 맥북 `<맥북 경로>/JayStudio` | 컨테이너 생성 시 bind mount로 고정. 실제 경로: OQ-A6 |
| Claude Code | 맥북 호스트 | 항상 `JayStudio` 폴더에서 시작 (사용자 확정) |
| 열기 도우미 | 맥북 호스트 | `127.0.0.1` + 토큰 |
| 특수 자원 | 없음 | GPU 불필요 |

### 요청 흐름

```text
브라우저(127.0.0.1) ─HTTP·실시간─▶ Jay Studio 컨테이너 ─read/write─▶ [mount] JayStudio/.claude, JayStudio/.jaystudio
Claude Code(맥북, JayStudio에서 시작) ─hook POST─▶ Jay Studio 컨테이너 /<수집 경로>
02 기본 세션 / 03 팀장 호출 ─(경로: OQ-A5)─▶ 열기 도우미(맥북) ─▶ macOS 기본 터미널: cd "<JayStudio 경로>" && claude [--agent <팀장 name>]
```

### 폴더 구조와 Claude Code 시작 위치 (사용자 확정)

```text
JayStudio/                     ← Claude Code 시작 위치, 컨테이너 마운트 대상
├─ .claude/
│  ├─ settings.json            ← Jay Studio 수집 hook (사용자가 직접 넣음)
│  ├─ agents/                  ← 재사용 에이전트 정의 (develop-tech-lead, architect, ...)
│  └─ skills/                  ← 재사용 스킬 (planner 등)
├─ .jaystudio/
│  ├─ teams/<워크플로우>.json
│  └─ trash/
└─ <프로젝트명>/                ← 실제 작업 폴더. 자동 개발 산출물(docs/, 코드, CLAUDE.md)은 여기
```

- 이 구조를 택한 근거(Claude Code 문서 확인):
  - 공유 프로젝트 설정 `.claude/settings.json`은 Claude Code를 시작한 폴더에서만 읽는다. 프로젝트 폴더에서 시작하면 `JayStudio/.claude/settings.json`의 수집 hook이 동작하지 않는다.
  - 프로젝트 서브에이전트와 스킬은 시작 폴더에서 저장소 루트까지 올라가며 찾는다. 프로젝트 폴더를 별도 git 저장소로 만들고 그 안에서 시작하면 `JayStudio/.claude/agents/`를 찾지 못한다.
- git 저장소 단위: OQ-A3.

### 마운트
- `JayStudio` 폴더 하나만 읽기·쓰기로 마운트한다. 홈 폴더나 상위 폴더를 마운트하지 않는다.
- bind mount는 컨테이너 생성 시 고정되므로 웹에 경로 변경 기능을 두지 않는다.
- 쓰기 권한이 없으면 Server는 읽기 전용으로 동작한다(FR-001).
- 컨테이너 사용자와 맥북 파일 소유권이 맞지 않아 쓰기가 실패하지 않는지 확인: OQ-A6.

### 배포
- 대상은 사용자 맥북 하나다. CI/CD와 이미지 레지스트리 push는 범위 밖이다.
- 실행 방법(`docker run` 또는 compose)과 README·`CLAUDE.md`의 실행 명령은 실제 동작과 일치해야 한다.

## Authentication & Access Control

- 로그인·사용자 계정 없음(단일 사용자, 사용자 확정).
- 접근 통제는 네트워크 노출 범위와 요청 출처 검사로 한다.
  - 모든 포트는 `127.0.0.1`에만 공개한다.
  - 상태를 바꾸는 API와 실시간 연결은 Origin 검사와 토큰을 요구한다. WebSocket은 CORS 보호를 받지 않아 다른 로컬 웹페이지가 연결할 수 있기 때문이다.
  - 수집 주소의 토큰 요구 여부: OQ-A2 (제안: 요구, hook `headers`로 전달).
  - 열기 도우미는 `127.0.0.1` + 토큰으로만 요청을 받는다. 요청 값은 `기본 세션` 여부와 팀장 name 하나뿐이며, 경로·명령·옵션은 받지 않는다.
  - 팀장 name은 `^[a-z0-9-]+$` 형식만 허용하고, 셸 문자열 조합으로 명령 주입이 생기지 않는 방식으로 실행한다.
- 토큰 발급·보관·전달 방식은 architect가 정하되, 토큰이 비어 있으면 인증 없이 동작하지 않는다.

## External Systems

| 시스템 | 연동 방식 | 개발 중 사용 가능 여부 | 자동 테스트 방법 |
|---|---|---|---|
| Claude Code hooks | Claude Code → Server HTTP POST (방식: OQ-A2) | 맥북에 있음. 단 자동 개발 중 실제 세션으로 검증하기 어렵다 | 실제 hook 입력 형식의 이벤트 JSON을 재생하는 도구로 검증. 실제 세션 연동은 사람이 1회 확인 |
| Claude Code 정의 파일 | `.claude/agents/*.md` 파일 읽기·쓰기 | 있음 | 테스트용 임시 폴더(fixture)에서 검증. 실제 `JayStudio/.claude/`는 사용하지 않음 |
| macOS 기본 터미널 | 열기 도우미가 실행 | 컨테이너 안에서는 불가 | 도우미 호출과 입력 검증(팀장 name 형식)은 자동 테스트. 실제 터미널 열림(기본 세션·팀장 세션)은 사람이 1회 확인 |

### Claude Code hooks (공식 문서 기준)

| 용도 | 이벤트 |
|---|---|
| 세션 시작·종료 | `SessionStart`, `SessionEnd` |
| --agent 세션 작업 시작·종료 | `UserPromptSubmit`, `Stop` |
| 도구 실행 | `PreToolUse`, `PostToolUse`, `PostToolUseFailure` |
| 권한·입력 대기 | `PermissionRequest`, `Notification`(`permission_prompt`, `agent_needs_input` 등) |
| 서브에이전트 | `SubagentStart`, `SubagentStop` |

- 공통 입력 필드 `session_id`, `cwd`, `hook_event_name`, `agent_id`(서브에이전트 안), `agent_type`(`--agent` 세션 또는 서브에이전트)을 사용한다.
- handler 방식 후보: `type: "http"`(`url`, `headers`, `allowedEnvVars`, `timeout`) 또는 `type: "command"`.
- hook 기본 timeout은 600초다. 설정 예시에는 짧은 timeout을 넣어 Server가 멈췄을 때 Claude Code가 기다리지 않게 한다.
- 사용자 설정에 `allowedHttpHookUrls`가 있으면 수집 주소가 허용 목록에 있어야 한다.
- hook 설정 파일 변경은 자동 반영된다.

### Claude Code 정의 파일 (공식 문서 기준)
- YAML frontmatter: `name`(소문자·하이픈), `description` 필수. `tools`를 생략하면 전체 상속. 그 밖에 `disallowedTools`, `model`(`sonnet`, `opus`, `haiku`, 전체 모델 ID, `inherit` 등), `permissionMode`, `skills`, `hooks`, `memory`, `isolation`, `color` 등.
- 본문은 시스템 프롬프트다.
- Server가 모르는 필드와 본문은 수정 시 그대로 보존한다.

## Data Storage

| 데이터 | 위치 | 보관 |
|---|---|---|
| 에이전트 정의 | `JayStudio/.claude/agents/<name>.md` | 원본. Server는 캐시만 둔다 |
| 워크플로우 구성 | `JayStudio/.jaystudio/teams/<이름>.json` | 워크플로우 이름, 설명, 팀장, 팀원. 스키마는 architect가 정한다 |
| 휴지통 | `JayStudio/.jaystudio/trash/` | 제거한 정의 파일. 덮어쓰지 않음. 자동 비우기 없음 |
| 이벤트 | SQLite 파일 (위치: OQ-A4) | 30일 보존 후 삭제 · WAL 모드 |
| 에이전트 실행 상태 | Server 메모리 | 컨테이너 재시작 시 모두 `대기`로 초기화 |

- 파일 쓰기 안전성:
  - 정의·구성 파일은 중간 실패 시 원본이 깨지지 않는 방식으로 쓴다.
  - 저장 전 수정 시각으로 외부 변경과의 충돌을 감지한다(FR-011).
  - 이름 변경·소속 변경·제거처럼 정의 파일과 구성 파일을 함께 바꾸는 작업은 한쪽만 반영된 채 끝나지 않는다.
- 백업은 범위 밖이다.

## Non-functional Requirements

- **규모**: 사용자 1명, 맥북 1대, 프로젝트 폴더 1개. 동시 접속 브라우저 탭 여러 개는 같은 상태를 본다.
- **반응 시간**: 파일 변경·hook 이벤트가 화면에 반영되는 시간은 `requirements_function.md` OQ-F6 수치를 따른다.
- **Claude Code 비차단**: Server가 꺼져 있거나 느려도 Claude Code 작업이 멈추지 않아야 한다. hook 설정 예시가 이를 보장해야 한다(OQ-A2).
- **보안**:
  - `127.0.0.1` 외 인터페이스 바인딩, 빈 토큰, 인증 없이 동작하는 기본값은 결함이다.
  - `docker.sock`을 마운트하지 않는다. 컨테이너는 root가 아닌 사용자로 실행한다 (제안, OQ-A6과 함께 확인).
  - 파일 경로는 사용자 입력으로 정하지 않는다. name·워크플로우 이름 규칙으로 경로 이탈을 막고, 마운트 밖을 가리키는 심볼릭 링크는 따라가지 않는다.
  - 이벤트의 민감 값은 마스킹하고, 서버 로그에 원문을 남기지 않는다.
- **가용성**: 컨테이너 재시작 후 파일 기반 데이터는 유지되고 실행 상태만 초기화된다.
- **테스트 가능성**:
  - 실제 Claude Code와 실제 `JayStudio` 폴더 없이, 이벤트 재생 도구와 임시 fixture 폴더로 모든 FR의 Acceptance Criteria와 Error Cases를 자동 검증할 수 있어야 한다.
  - Frontend–Server 연결은 목킹 없이 실제 컨테이너를 띄워 E2E로 검증한다.
- **UI 구현 기준**: 화면 요소마다 데이터 출처(API 필드), 빈·로딩·에러·연결 끊김 상태, 클릭 시 이동이 설계 문서에 명시되어야 하고, 리뷰는 확정 UI 기준(`requirements_function.md` UI Baseline, OQ-F1 결과)과 대조한다.

## Automation Policy

기획은 `JayStudio` 폴더의 기본 세션에서 `/planner <프로젝트명>`으로 하고, 승인 후 **새 세션**에서 `claude --agent develop-tech-lead`로 자동 개발을 시작한다. 모든 산출물은 `JayStudio/<프로젝트명>/` 아래에 둔다.

- **Lead 자율 결정**:
  - 확정 스택 안의 세부 설계·구현, 스택 생태계 안의 라이브러리 추가
  - Dockerfile·compose 파일·hook 설정 예시·열기 도우미 소스·이벤트 재생 도구 작성(파일 작성까지)
  - `<프로젝트명>/` 안에서의 커밋
- **사람에게 에스컬레이션**:
  - 확정 스택(Decision Log)을 벗어나는 변경
  - API·실시간 메시지 계약 변경
  - 확정 UI 기준과 다른 화면·흐름이 필요한 경우
  - 실제 마운트 경로·포트 결정, 실제 `JayStudio` 폴더를 마운트한 컨테이너 실행
  - 열기 도우미를 맥북에 설치·등록
  - `JayStudio/.claude/settings.json` 수정
  - 요구사항 문서와 구현이 충돌하거나 해석이 둘로 갈리는 경우
- **금지**:
  - `JayStudio/.claude/`(에이전트·스킬·설정)와 `JayStudio/.jaystudio/`의 실제 파일 생성·수정·삭제 — 테스트는 임시 fixture 폴더로
  - `<프로젝트명>/` 밖 파일 수정
  - `0.0.0.0` 바인딩, `docker.sock` 마운트, `JayStudio` 밖 호스트 경로 마운트
  - git push, 데이터 삭제
  - 웹에서 에이전트·셸 명령을 실행하는 기능, 로그인·외부 접속 기능 추가

## Decision Log (사용자 확정 — 재질문하지 않음)

- 실행 환경 → 맥북 로컬, Docker Desktop 컨테이너. 외부 접속·서버 배포·Jenkins·K3s 사용 안 함.
- 네트워크 → `127.0.0.1` 전용. 로그인 없음.
- 프로젝트 폴더 → `JayStudio` 1개를 bind mount로 고정. 웹에서 경로 변경 없음. 실제 경로는 개발 단계에서 사용자가 알려줌.
- Claude Code 시작 위치 → 항상 `JayStudio` 폴더. 실제 작업과 자동 개발 산출물은 `JayStudio/<프로젝트명>/`.
- 팀장 → 정의 파일로 두고 `claude --agent <name>`으로 실행. 개발부서 팀장은 `develop-tech-lead`.
- 수집 → Claude Code hook 이벤트. 웹은 에이전트를 실행하지 않음.
- 저장 → 정의 `.claude/agents/*.md`, 워크플로우 구성 `.jaystudio/teams/*.json`, 제거는 `.jaystudio/trash/`로 소프트 삭제. 이벤트 보존 30일.
- 상태 → 에이전트별 3상태만. 팀 단위 상태 파일·잠금·오케스트레이터 없음. 멈춤 의심 판정 없음. 컨테이너 재시작 시 대기로 초기화.
- 터미널 열기 → 02 헤더는 기본 세션, 03은 팀장 호출. macOS 기본 터미널, 맥북 열기 도우미가 한 동작만 수행(127.0.0.1 + 토큰, 입력은 팀장 name 하나). 없으면 명령 복사.
- 작업 순서 → 기획은 기본 세션의 `/planner` 스킬, 자동 개발은 새 세션의 팀장 에이전트. 오케스트레이터 없음.
- 보안 기본값 → `docker.sock` 미사용, 최소 마운트, 브라우저 요청은 Origin 검사 + 토큰.
- hook으로 작업을 강제 차단하는 기능 → 두지 않음.
- 기술 스택 → Backend Spring Boot 4.1 / Java 25 LTS / Gradle. Frontend React 19 + TypeScript + Vite 8 + Tailwind CSS 4.3 + React Router v7.
- 실시간 전송 → SSE. WebSocket은 쓰지 않음.
- 이벤트 저장 → SQLite(WAL 모드, 컨테이너 볼륨). 별도 DB 서버 없음.
- 테스트 → JUnit 5 + Spring Boot Test / Vitest + Testing Library / Playwright(E2E).
- 컨테이너 → 단일 컨테이너·단일 포트, 프론트 빌드 결과를 백엔드가 제공. 이미지는 arm64.
- 저장소 → 프로젝트별 git 저장소 1개, `backend/`·`frontend/` 두 폴더. 모노레포 도구 없음.

## Open Questions (Planner가 해소)

영향도 높은 순서다.

- **OQ-A1 [중간] 프로젝트 폴더 변경 감지 방식**
  - macOS에서 Java 기본 파일 감시(`WatchService`)는 폴링 기반이라 변경 반영이 수 초 늦을 수 있다. FR-001의 반영 시간(OQ-F6)을 만족하는지 architect가 실제로 측정한다.
  - 선택지: (A) 파일 감시 라이브러리 사용(예: `io.methvin:directory-watcher`) / (B) 1~2초 주기로 폴더 재읽기 — 파일 수가 수십 개라 비용이 작다.
  - 확정 스택 안의 판단이므로 architect가 정하고 ADR에 남긴다.
- **OQ-A2 [높음] hook 전송 방식과 실패 시 동작**
  - `http` hook과 `command` hook 중 선택.
  - Server가 꺼져 있거나 응답하지 않을 때 Claude Code가 막히지 않는지 실제 Claude Code에서 확인한다. 문서에 `http` hook의 오류 처리가 command hook과 다르다고 되어 있어 확인이 필요하다.
  - 설정 예시의 timeout 값, 수집 주소 토큰 사용 여부와 전달 방식.
- **OQ-A3 [중간] git 저장소 단위**
  - (A) `<프로젝트명>/`마다 별도 저장소, `JayStudio` 루트는 저장소 아님 — 추천. 프로젝트 이력이 분리되고 에이전트 정의 변경이 프로젝트 커밋에 섞이지 않음. 대신 에이전트 정의 버전 관리는 따로 필요.
  - (B) `JayStudio` 전체를 저장소 1개로 — 에이전트 정의까지 한 이력으로 관리. 대신 여러 프로젝트 이력이 섞이고 자동 커밋에 다른 프로젝트 변경이 섞일 위험.
  - (A)여도 Claude Code는 `JayStudio`에서 시작하므로 에이전트·스킬·설정 탐색에는 문제가 없다. 프로젝트 폴더 안에서 시작하면 탐색이 끊긴다.
- **OQ-A4 [중간] 이벤트 저장 위치와 마스킹 시점**
  - 컨테이너 볼륨 / 프로젝트 폴더 `.jaystudio/`. 프로젝트 폴더에 두면 컨테이너를 지워도 남지만, 폴더를 공유·커밋할 때 이벤트가 함께 나갈 수 있다.
  - 마스킹을 저장 시점에 할지 표시 시점에 할지. 제안: 저장 시점(원문을 남기지 않음).
- **OQ-A5 [중간] 열기 도우미 설치와 호출 경로**
  - 설치 방식(로그인 시 자동 실행 등)과 제거 방법.
  - 호출 경로: (A) 브라우저 → 도우미 직접 — 도우미에도 Origin 검사 필요 / (B) 브라우저 → 컨테이너 → 도우미 — 컨테이너에서 맥북 `127.0.0.1` 서비스에 닿는지 확인 필요.
  - 도우미 토큰 보관 위치와 전달 방식.
- **OQ-A6 [낮음] 실제 경로·포트·폴더 이름·파일 소유권**
  - `JayStudio` 실제 경로, 사용할 포트, Jay Studio 소스를 둘 `<프로젝트명>`.
  - 기본 실행 방법(`docker run` / compose).
  - 맥북 CPU 종류(Apple Silicon 여부)와 이미지 플랫폼.
  - root가 아닌 컨테이너 사용자로 마운트 폴더에 쓸 수 있는지 Docker Desktop(macOS)에서 확인.

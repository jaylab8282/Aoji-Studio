# Jay Studio

맥북에서 Docker 컨테이너로 돌리는 **개인용 Claude Code 에이전트 관제 웹**. `127.0.0.1`에서만 접근한다.

## 1. 이게 뭔가

Claude Code의 hook 이벤트를 받아 **에이전트마다 지금 무슨 상태인지**(`작업 중` / `권한·입력 대기` / `대기`)
실시간으로 보여준다. 에이전트를 워크플로우(부서)로 묶어 **층 뷰와 픽셀 오피스**로 그리고,
에이전트 정의 파일(`.claude/agents/*.md`)과 워크플로우 구성을 웹에서 만들고 고친다.

- **웹은 에이전트를 실행하지 않는다.** 작업 지시는 사용자가 터미널에서 팀장 에이전트에게 직접 한다.
  웹의 버튼은 맥북 기본 터미널을 **열어 주는 것**까지만 한다(`claude` 또는 `claude --agent <팀장>`).
- 로그인이 없다. 대신 맥북 밖이나 다른 로컬 웹페이지에서는 조작할 수 없게 막는다(Origin + 토큰).
- 파일이 원본이다. 웹은 `JayStudio/` 폴더를 읽고 쓰며, `.claude/settings.json`은 쓰지 않는다
  (hook 설정은 07 화면의 예시를 사용자가 복사해 넣는다).

화면은 **01** 홈 · **02** 워크플로우 층 뷰 · **03** 워크플로우 상세(픽셀 오피스) ·
**04** 상태 화면(이벤트 없음 / 첫 로딩 / 연결 끊김 / 수집 중단 / 폴더 읽기 실패 / 형식 오류 / 워크플로우 0개) ·
**05** 워크플로우 추가·가져오기 · **06** 에이전트 만들기·수정·제거 · **07** 설정(읽기 전용) 일곱 개다.

## 2. 설치

### 요구 사항
- Docker Desktop (macOS, Apple Silicon), `docker compose` v2 이상
- Node 24, 로컬 JDK 21 이상 (Gradle toolchain이 JDK 25를 `~/.gradle/jdks/`에 자동 설치)

### 웹 띄우기
```bash
cp .env.example .env
# .env의 JAYSTUDIO_HOST_PATH=<맥북의 JayStudio 폴더 절대 경로> 를 채운다.
docker compose up -d --build
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4180/   # 200
```
포트(`JAYSTUDIO_PORT`, 기본 4180)와 마운트 경로는 `.env`에만 둔다. 값이 없으면 기동이 실패한다.
내리려면 `docker compose down`.

### 열기 도우미 설치 (터미널 열기 버튼을 쓸 때만)
컨테이너는 맥북 앱을 실행할 수 없으므로, 터미널을 여는 일은 호스트에서 도는 작은 Node 프로세스가 한다.
```bash
cd helper
./install.sh --project-dir /Users/<사용자>/Desktop/JayStudio
```
첫 열기에서 macOS 자동화 권한 대화상자가 한 번 뜬다 — **허용**해야 동작한다.
제거는 `./uninstall.sh`.

> 되돌리는 방법, 예행 연습(`--dry-run`), 설치 확인 명령, 실패했을 때의 화면, 토큰 파일 취급은
> **[Detail_Readme.md](Detail_Readme.md)**에 있다. 처음 설치한다면 그쪽을 보고 하는 편이 안전하다.

## 3. 빌드 · 테스트

각 줄은 **저장소 루트에서** 시작한다. 주석의 숫자는 통과해야 하는 테스트 수다(줄면 뭔가 빠진 것이다).

```bash
# 유닛 — 합 742
(cd backend && ./gradlew test)                 # 279
(cd frontend && npm install && npm test)       # 389
(cd helper && npm test)                        # 40
(cd tools/replay && npm test)                  # 34

# 린트 · 타입체크 · 빌드
(cd frontend && npm run lint && npm run typecheck && npm run build)
(cd backend && ./gradlew build)

# E2E — 실제 컨테이너, 목킹 없음
(cd tools/e2e && npm install && npx playwright install chromium)   # 사전 1회
(cd tools/e2e && ./scripts/run-e2e.sh)         # 9배치 107
```

`run-e2e.sh`는 fixture 복사 → 컨테이너 기동 → dry-run 도우미(4191)·다른 Origin 서버(4192) 준비 →
실행 → 정리까지 스스로 한다. 사전 준비 명령은 없다. 공개 포트는 `127.0.0.1:4185`다.

## 4. 저장소 구조

```text
backend/    Spring Boot 4.1.x · Java 25 · Gradle Kotlin DSL
frontend/   React 19.3 · TS · Vite 8 · Tailwind 4.3 · React Router v7
helper/     맥북 호스트에서 도는 열기 도우미 (Node 24, 외부 의존 없음)
tools/      replay(이벤트 재생) · fixtures(테스트용 프로젝트 폴더) · e2e(Playwright)
docs/       요구사항 · 설계 · 태스크 · 진행 기록 · 리뷰
```

| 문서 | 내용 |
|---|---|
| [Detail_Readme.md](Detail_Readme.md) | 도우미 설치 상세 · 개발 실행(컨테이너 없이) · E2E 하네스 |
| `docs/architecture.md` | 시스템 구조 · 배포 · 통합 검증 전략 · ADR |
| `docs/conventions.md` | 코딩 · API · 보안 · UI 규칙(MUST) |
| `docs/api-spec.yaml`, `docs/realtime-spec.md` | FE–BE 계약, SSE 메시지 계약 |
| `docs/ui-spec.md` | 화면 명세 (`docs/ui/`가 확정 UI 기준) |
| `docs/tasks.md`, `docs/progress.md` | 태스크 · 결정 이력 · 추적 매트릭스 |

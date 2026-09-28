# Jay Studio

Claude Code 에이전트 워크플로우 관제 도구. `docs/`의 설계를 기준으로 한다.

## 요구 사항

- Docker Desktop (macOS, Apple Silicon), `docker compose` v2 이상
- Node 24 (프론트·헬퍼·도구), 로컬 JDK 21 이상 (Gradle toolchain이 JDK 25를 `~/.gradle/jdks/`에 자동 설치)
- 실행 대상 프로젝트 폴더(`JAYSTUDIO_HOST_PATH`)

## 운영 실행 (컨테이너)

```bash
cp .env.example .env
# .env에서 JAYSTUDIO_HOST_PATH=<맥북의 JayStudio 폴더 절대 경로> 로 채운다.
docker compose up -d --build
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4180/   # 200
docker compose down
```

포트(`JAYSTUDIO_PORT`, 기본 4180)와 마운트 경로(`JAYSTUDIO_HOST_PATH`)는 `.env`에만 둔다. 값이 없으면 `docker compose up`이 실패한다.

## 열기 도우미 설치 (맥북 호스트)

웹의 `Claude 열기 · 기본 세션`(02)·`팀장 호출 · 터미널 열기`(03)·`테스트로 열기 (도우미 설치 후)`(07)는
브라우저가 맥북에서 도는 **열기 도우미**(`helper/jaystudio-helper.mjs`)를 직접 호출해 Terminal.app을 띄운다(FR-013).
컨테이너는 이 일을 하지 않으므로 도우미를 맥북에 한 번 설치해야 한다.
launchd 등록·Terminal.app 실행·자동화 권한 허용은 **사람이 직접 하는 절차**다(자동 검증 대상이 아니다).

### 0. 전제 조건

- 맥북에 Node 24 이상(`node -v`). 도우미는 외부 npm 의존이 없어 `npm install`이 필요 없다.
- `--project-dir` = 도우미가 터미널에서 열 폴더의 **절대 경로**. `.env`의 `JAYSTUDIO_HOST_PATH`와 **같은 값**을 쓴다
  (예: `/Users/<사용자>/Desktop/JayStudio`). 다르면 웹이 읽는 토큰 파일과 도우미의 토큰 파일이 어긋난다.
- 경로에 `"`, 백틱, `$`, `\`, 개행이 있으면 도우미가 기동을 거부한다.
- 기본 포트: 웹 4180, 도우미 4181. 도우미는 `127.0.0.1`에만 바인딩하고 허용 Origin은 `http://127.0.0.1:4180` 하나다.
  웹 포트를 바꿨다면 `--allowed-origins http://127.0.0.1:<웹 포트>`를 함께 준다.
- 웹에서 확인하려면 컨테이너가 떠 있어야 한다(위 "운영 실행"). 도우미 자체는 컨테이너와 통신하지 않는다.

### 1. 되돌리는 방법을 먼저 확인한다 (아무것도 바꾸지 않는다)

```bash
cd helper
./uninstall.sh --dry-run
```

출력: `DRY-RUN 아무것도 바꾸지 않습니다` / 실행할 명령 `launchctl bootout gui/<uid>/com.jaystudio.helper` /
지울 파일 `~/Library/LaunchAgents/com.jaystudio.helper.plist`.

### 2. 예행 연습 (환경 변경 없음)

```bash
./install.sh --project-dir /Users/<사용자>/Desktop/JayStudio --dry-run
```

- stdout: 만들 plist XML 전문. `ProgramArguments`에 `--project-dir`·`--allowed-origins`·`--port`·`--token-file`이 있고
  **`--dry-run`은 없다**(있으면 결함이다 — 설치본이 터미널을 열지 않게 된다).
- stderr: `DRY-RUN …` 6줄 — plist 경로, 로그 파일, bootout·bootstrap 명령, 기동 확인 URL.
- `~/Library/LaunchAgents/`는 그대로다.

### 3. 설치

```bash
./install.sh --project-dir /Users/<사용자>/Desktop/JayStudio
```

성공하면 이렇게 보인다.

```text
기동 확인 중: http://127.0.0.1:4181/health (최대 10초)
설치 완료: /Users/<사용자>/Library/LaunchAgents/com.jaystudio.helper.plist
기동 확인 완료: http://127.0.0.1:4181/health
확인: curl -s -H 'Origin: http://127.0.0.1:4180' http://127.0.0.1:4181/health
```

`install.sh`는 `launchctl bootstrap` 뒤 `/health`가 응답할 때까지 폴링한다(기본 10초,
`JAYSTUDIO_HEALTH_TIMEOUT_SECONDS`로 1~120초 조절). 응답이 없으면 **설치 완료로 끝내지 않고** 등록을 해제하고 실패한다(§6).

옵션: `--port`, `--allowed-origins`, `--token-file`, `--log-file`, `--node`, `--label`.
`--label`은 영숫자로 시작하는 영숫자·`.`·`_`·`-` 1~64자만 받는다(경로 조작 방지). 바꿨다면 `./uninstall.sh --label <같은 값>`으로 지운다.

### 4. 설치 확인

```bash
plutil -lint ~/Library/LaunchAgents/com.jaystudio.helper.plist              # OK
launchctl print gui/$(id -u)/com.jaystudio.helper | head -30                # state = running
lsof -nP -iTCP:4181 -sTCP:LISTEN                                           # TCP 127.0.0.1:4181 (LISTEN)
ls -l /Users/<사용자>/Desktop/JayStudio/.jaystudio/helper-token             # -rw-------  64바이트
curl -s -H 'Origin: http://127.0.0.1:4180' http://127.0.0.1:4181/health    # {"ok":true,"version":"1"}
curl -s http://127.0.0.1:4181/health                                       # 403 FORBIDDEN_ORIGIN (Origin 없음)
```

`lsof` 결과가 `*:4181`처럼 모든 인터페이스로 열려 있으면 결함이다(루프백 전용이어야 한다).

### 5. 첫 열기 — macOS 자동화 권한 대화상자

웹에서 다음 세 가지를 모두 눌러 본다(H-3 확인 항목이다).

1. 02 `Claude 열기 · 기본 세션` → Terminal.app이 `JayStudio`에서 `claude`를 실행
2. 03 `팀장 호출 · 터미널 열기` → 같은 폴더에서 `claude --agent <팀장 name>`을 실행(팀장이 있는 워크플로우에서 누른다)
3. 07 `테스트로 열기 (도우미 설치 후)` → 02와 같은 기본 세션 명령

터미널로 확인하려면:

```bash
TOKEN=$(cat /Users/<사용자>/Desktop/JayStudio/.jaystudio/helper-token)
curl -si -X POST http://127.0.0.1:4181/open \
  -H 'Origin: http://127.0.0.1:4180' -H "X-JayStudio-Helper-Token: $TOKEN" \
  -H 'Content-Type: application/json' -d '{"target":"default"}'
```

- 사람이 보게 되는 것: **처음 한 번은** macOS가 "Terminal을 제어하려 합니다"류의 **자동화 권한 대화상자**를 띄운다.
  대화상자는 설치 시점이 아니라 **첫 열기 요청 시점**에 뜬다. launchd가 띄운 프로세스라 요청 주체가 앱 이름이 아니라
  도우미를 실행하는 `node`(또는 `osascript`)로 보일 수 있다.
  **허용**을 눌러야 창이 열린다.
- 기대 결과: `HTTP/1.1 204`와 함께 Terminal.app 새 창에서 `cd "<JayStudio 경로>" && claude`가 실행된다.
  팀장 세션은 본문 `{"target":"lead","leadName":"develop-tech-lead"}` → `… && claude --agent develop-tech-lead`.
- **204는 "실행을 시작했다"는 뜻이고 창이 떴다는 보장은 아니다.** 도우미는 권한 대화상자의 응답을 기다리지 않는다
  (프론트가 2초 안에 답을 받아야 "도우미 미설치"로 오인하지 않기 때문이다). 권한을 **거부하면 204만 오고 창은 뜨지 않는다** —
  창이 실제로 떴는지는 눈으로 확인한다.
- 거부했거나 대화상자를 놓쳤으면: 시스템 설정 → 개인 정보 보호 및 보안 → **자동화**에서 해당 항목의 `Terminal` 허용을 켠다.
  목록에 없으면 `tccutil reset AppleEvents`로 초기화하고 다시 요청해 대화상자를 띄운다
  (이 명령은 **모든 앱**의 자동화 권한을 초기화하므로 다른 앱도 다시 허용해야 한다).
- 거부 경로에서는 **터미널 창이 하나도 뜨지 않아야 한다**: 잘못된 name → 400 `INVALID_NAME`,
  잘못된 토큰 → 403 `UNAUTHORIZED_TOKEN`, 허용 안 된 Origin → 403 `FORBIDDEN_ORIGIN`, 4096바이트를 넘는 본문 → 400 `INVALID_BODY`.

### 6. 실패했을 때 어떻게 보이나

설치 단계에서 기동에 실패하면(예: `--allowed-origins`에 형식 위반 값) `install.sh`가 이렇게 끝난다.

```text
기동 확인 중: http://127.0.0.1:4181/health (최대 10초)
install.sh: 도우미가 기동하지 않았습니다 — 10초 동안 http://127.0.0.1:4181/health 무응답
install.sh: 재시작 루프를 멈추려고 등록을 해제했습니다: launchctl bootout gui/501/com.jaystudio.helper
install.sh: 기동 실패 원인은 로그에 있습니다: /Users/<사용자>/Library/Logs/com.jaystudio.helper.log
install.sh: --- 로그 마지막 5줄 ---
jaystudio-helper 기동 실패: --allowed-origins 값이 Origin 형식이 아닙니다: *
install.sh: plist는 진단용으로 남겼습니다. 인자를 고쳐 다시 설치하거나 ./uninstall.sh로 제거하세요: …
```

종료 코드는 1이다. 인자를 고쳐 `./install.sh …`를 다시 실행하거나, 쓰지 않을 거면 `./uninstall.sh`로 plist를 지운다
(plist를 그대로 두면 다음 로그인에 같은 기동 실패가 반복된다).

- 로그: `tail -20 ~/Library/Logs/com.jaystudio.helper.log`. 정상이면
  `jaystudio-helper listening on http://127.0.0.1:4181` 한 줄만 보인다. 토큰 값이 보이면 결함이다.
- 웹 쪽 증상: 02·03에서 `열기 도우미가 응답하지 않습니다` 대화상자가 뜨고, 07 `열기 도우미` 행이
  `● 미설치 · helper/install.sh로 설치`로 보인다.
- 07이 `미설치 · 토큰 파일 없음`이면 `--project-dir`가 `.env`의 `JAYSTUDIO_HOST_PATH`와 다르다 — 같은 경로로 다시 설치한다.
- 07이 `도우미 인증 실패 · 도우미를 다시 설치하세요`(403)면 웹이 읽는 토큰과 도우미가 기동 때 읽은 토큰이 다르다 — §7을 본다.

### 7. 토큰 파일

- 위치 `<JayStudio 경로>/.jaystudio/helper-token`, 권한 **600**(`-rw-------`), hex 64자. 없으면 도우미가 기동할 때 만든다.
- 도우미는 이 파일을 **기동 시 1회만** 읽는다. 파일을 바꿨으면 재기동해야 한다:
  `./uninstall.sh && ./install.sh --project-dir <같은 경로>`.
- 권한이 600보다 넓으면 도우미가 기동할 때 600으로 되돌리고 로그에 한 줄 남긴다. 되돌릴 수 없으면 기동하지 않는다.
- 비었거나 hex 64자가 아니면 기동하지 않는다(인증 없이 뜨지 않는다). 토큰 값은 응답·로그에 남지 않고 `.gitignore`(`*-token`)로 커밋에서 제외된다.

### 8. 제거

```bash
cd helper
./uninstall.sh                                       # bootout + plist 삭제
launchctl print gui/$(id -u)/com.jaystudio.helper    # "Could not find service" 기대
lsof -nP -iTCP:4181 -sTCP:LISTEN                     # 결과 없음
```

토큰 파일은 의도적으로 남긴다(`uninstall.sh`가 안내한다). 지우려면 직접 `rm <JayStudio 경로>/.jaystudio/helper-token`.

## 개발 실행 (컨테이너 없이)

Backend와 Frontend를 따로 띄운다. 실제 `JayStudio/.claude`·`.jaystudio`는 쓰지 않고 임시 폴더를 사용한다.

```bash
# Backend (127.0.0.1:8080)
mkdir -p /tmp/jaystudio-dev-mount /tmp/jaystudio-dev-data
cd backend
JAYSTUDIO_HOST_PATH=/tmp/jaystudio-dev-mount \
JAYSTUDIO_PUBLIC_PORT=8080 \
JAYSTUDIO_MOUNT_PATH=/tmp/jaystudio-dev-mount \
JAYSTUDIO_DATA_PATH=/tmp/jaystudio-dev-data \
./gradlew bootRun --args='--spring.profiles.active=dev'
```

```bash
# Frontend (127.0.0.1:5173, /api·/hooks는 8080으로 프록시)
cd frontend
npm install
npm run dev
```

## 빌드·테스트

```bash
# Backend
cd backend && ./gradlew build

# Frontend
cd frontend && npm install && npm run build && npm test && npm run lint && npm run typecheck

# Helper
cd helper && npm test
```

## E2E (실제 컨테이너, 목킹 없음)

```bash
cd tools/e2e
npm install
npx playwright install chromium   # ~/Library/Caches/ms-playwright 에 설치 (사전 1회)

./scripts/run-e2e.sh               # fixture 배치 전체
```

`globalSetup`이 fixture를 임시 폴더로 복사하고 `compose.e2e.yaml`을 띄운 뒤
dry-run 도우미(4191)와 다른 Origin 페이지 서버(4192)까지 준비하며,
`globalTeardown`이 컨테이너·프로세스·임시 폴더를 정리한다. 사전 준비 명령은 없다.
E2E 공개 포트는 `127.0.0.1:4185`다 — `4190`은 쓰지 않는다(WHATWG Fetch bad port, ADR-45).

배치 하나만 돌리려면:

```bash
cd tools/e2e
E2E_FIXTURE=project-configured npx playwright test tests/e2e-03.spec.ts
```

## 저장소 구조

```text
backend/    Spring Boot 4.1.x · Java 25 · Gradle Kotlin DSL
frontend/   React 19.3 · TS · Vite 8 · Tailwind 4.3 · React Router v7
helper/     맥북 호스트에서 도는 열기 도우미 (Node 24, 외부 의존 없음)
tools/      replay(이벤트 재생) · fixtures(테스트용 프로젝트 폴더) · e2e(Playwright)
```

자세한 설계는 `docs/architecture.md`, `docs/conventions.md`, `docs/api-spec.yaml`, `docs/realtime-spec.md`, `docs/ui-spec.md`를 따른다.


## 설치 전 준비사항(installed based)
1. Claude-Code를 설치합니다.
2. Docker-Desktop을 설치합니다.
3. .claude/agents 폴더가 준비되어 있어야합니다.

v1.2.0부터 Windows + WSL 실행을 지원합니다(아래 WSL 실행). 맥북 절차는 그대로입니다.

### 지원 환경
|✅| **macOS** (Apple Silicon) <br> 
|✅| **Windows + WSL** (x86_64, v1.2.0) | ✅ `.env`에 `AOJISTUDIO_PLATFORM=linux/amd64` 주석해제(윈도우일 경우)<br>
웹 본체는 전부 컨테이너 안에 있어 OS를 타지 않는다. 이미지 아키텍처만 `.env`에서 맞추면 된다.


# Aoji Studio (v1.2.0)
Docker 컨테이너로 돌리는 **개인용 Claude Code 에이전트 관제 웹**. `127.0.0.1`에서만 접근한다.<br>
확정 환경은 macOS(Apple Silicon)와 Windows + WSL이다(아래 [지원 환경](#지원-환경)).

## 1. 사용 용도
1. 에이전트 정의 파일(`.claude/agents/*.md`)과 워크플로우 구성을 웹에서 만들고 고친다.
2. 에이전트를 워크플로우(부서)로 묶어서 관리한다.
3. Claude Code의 hook 이벤트를 받아 **에이전트마다 지금 무슨 상태인지**(`작업 중` / `권한·입력 대기` / `대기`)
   실시간으로 보여준다. 
4. **웹은 에이전트를 실행하지 않는다.** 작업 지시는 사용자가 클로드 코드 터미널에서 팀장 에이전트에게 직접 한다.
   웹의 버튼은 맥북 기본 터미널(WSL이면 Windows Terminal 새 탭)을 **열어 주는 것**까지만 한다(`claude` 또는 `claude --agent <팀장>`).
5. 로그인이 없다. 대신 이 기기 밖에서 조작할 수 없게 막는다.(Origin + 토큰).
6. 웹은 `AojiStudio/` 폴더를 읽고 쓰며, `.claude/settings.json`은 쓰지 않는다.
  (hook 설정은 07 화면의 예시를 사용자가 복사해 넣는다).

화면은 **01** 홈 · **02** 워크플로우 층 뷰 · **03** 워크플로우 상세(픽셀 오피스) ·
**04** 상태 화면(이벤트 없음 / 첫 로딩 / 연결 끊김 / 수집 중단 / 폴더 읽기 실패 / 형식 오류 / 워크플로우 0개) ·
**05** 워크플로우 추가·가져오기 · **06** 에이전트 만들기·수정·제거 · **07** 설정(읽기 전용) 일곱 개다.


## 2. 설치 가이드
필수 1) 관제폴더 지정 및 .env 셋업
현재 .claude가 있는 작업폴더에 깃 클론 합니다.
.env.example에 아래 내용을 수정하여 .env로 파일 이름을 변경한다.
> .env의 AOJISTUDIO_HOST_PATH=<AojiStudio 폴더 절대 경로> 를 채운다. <br>
>  윈도우(x86_64) 머신이면 .env에서 AOJISTUDIO_PLATFORM=linux/amd64 주석도 푼다. (맥북이면 패스)

```bash
cp .env.example .env
nano .env
```

필수 2) 도커 컨테이너 실행
```bash
docker compose up -d --build --remove-orphans
```
> 내리려면 `docker compose down --remove-orphans`.
> `docker compose down -v`는 이벤트 볼륨(`aojistudio-data`)까지 지우므로 쓰지 않는다.
> v1.0.0 사용자는 `v1.0.1` 태그로 먼저 올린다(그 태그의 `UPGRADE-v1.0.1.md`).


필수 3) Hook 설정 
http://127.0.0.1:4180 접속 <br>
실시간 에이전트 관제에 필요한 것으로, <br>
hook 설정은 브라우저의 설정 탭 예시를 사용자가 복사해 파일을 만든다.


*선택) 열기 도우미 설치 — **macOS 전용**, 터미널 열기 버튼을 쓸 때만
-----------------------------------------------------------------
컨테이너는 호스트 앱을 실행할 수 없으므로, 터미널을 여는 일은 맥북에서 도는 작은 Node 프로세스가 한다.
```bash
cd helper
./install.sh --project-dir /Users/<사용자>/Desktop/AojiStudio
```
첫 열기에서 macOS 자동화 권한 대화상자가 한 번 뜬다 — **허용**해야 동작한다. <br>
제거는 `./uninstall.sh`.
도우미를 다시 시작하려면 `launchctl kickstart -k gui/$UID/com.aojistudio.helper` 를 실행하거나 다시 로그인한다.

> 되돌리는 방법, 예행 연습(`--dry-run`), 설치 확인 명령, 실패했을 때의 화면, 토큰 파일 취급은 <br>
> **[Detail_Readme.md](Detail_Readme.md)**에 있다. 처음 설치한다면 그쪽을 보고 하는 편이 안전하다.



### WSL 실행 (Windows PC)
Windows PC에서는 WSL 안에서 저장소를 받고 컨테이너를 띄운다. `.env`에 아래를 적는다(`.env.example`에 주석으로 있다).
```text
AOJISTUDIO_HOST_PATH=/home/<사용자>/AojiStudio     # WSL 경로
AOJISTUDIO_PLATFORM=linux/amd64                    # 주석 해제
AOJISTUDIO_HOST_OS=wsl                             # 비우면 macos
AOJISTUDIO_WSL_DISTRO=Ubuntu-26.04                 # wsl이면 필수. wsl -l -q 로 이름 확인
```
`AOJISTUDIO_HOST_OS=wsl`이면 `AOJISTUDIO_WSL_DISTRO`가 반드시 있어야 하고(없으면 서버가 기동을 거부한다), 07 설정의 `열기 도우미` 행이 Windows 도우미 기준으로 바뀐다.

*선택) Windows 열기 도우미 — 터미널 열기 버튼을 쓸 때만*
1. Windows에 **Node 24 이상**을 설치한다(`node -v`). 외부 npm 의존은 없다.
2. **Windows PowerShell**에서, WSL에 받은 저장소의 `helper\windows` 폴더(`\\wsl.localhost\<배포판>\<저장소 WSL 경로>\helper\windows`)로 가서 실행한다.
```powershell
cd \\wsl.localhost\Ubuntu-26.04\home\<사용자>\Aoji-Studio\helper\windows
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Distro Ubuntu-26.04 -ProjectDir /home/<사용자>/AojiStudio
```
`-ProjectDir`은 **WSL 경로**이고 `.env`의 `AOJISTUDIO_HOST_PATH`와 같은 값이다. `-DryRun`을 붙이면 아무것도 바꾸지 않고 복사 대상과 작업 XML만 보여 준다.
설치하면 도우미가 `%LOCALAPPDATA%\AojiStudio\helper\`에 복사되고, 작업 스케줄러 작업 `\AojiStudio\aojistudio-helper`가 등록되어 **로그온할 때마다 자동으로 시작**한다. `http://127.0.0.1:4181/health`가 응답해야 설치가 끝난다.

토큰 파일은 WSL 쪽 `<AojiStudio 폴더>/.aojistudio/helper-token`이다(Windows에서는 `\\wsl.localhost\<배포판>\…\.aojistudio\helper-token`). 제거해도 남는다.

제거: **설치할 때와 같은 폴더**(저장소의 `helper\windows`)에서 **Windows PowerShell**로 실행한다(WSL 셸이 아니다). 작업 해제 · 도우미 프로세스 종료 · 설치 폴더 삭제를 한다.
```powershell
cd \\wsl.localhost\Ubuntu-26.04\home\<사용자>\Aoji-Studio\helper\windows
powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall.ps1        # -DryRun 을 붙이면 할 일만 보여 준다
```
> 설치 폴더에는 `uninstall.ps1`이 복사되지 않으므로 저장소의 것을 쓴다. 자세한 절차는 **[Detail_Readme.md](Detail_Readme.md)**.

### 전역 Claude 설정 연결 (선택)
사용량·MCP·스킬 사용 화면(08~10)은 전역 Claude 설정을 **읽기 전용**으로 읽는다. `.env`에 홈을 적으면 4개만 연결된다.
```text
AOJISTUDIO_CLAUDE_HOME=/home/<사용자>      # macOS는 /Users/<사용자>
```
연결: `<홈>/.claude.json`, `<홈>/.claude/settings.json`, `<홈>/.claude/plugins`, `<홈>/.claude/projects`. `~/.claude` 전체와 `.credentials.json`은 연결하지 않는다.
홈에 없는 항목이 있으면 Docker가 그 경로를 대며 기동을 거부한다. 그 항목만 끄려면 `.env`에 대역을 지정한다.
```text
AOJISTUDIO_CLAUDE_JSON_SRC=./tools/claude-home-off/.claude.json
AOJISTUDIO_CLAUDE_SETTINGS_SRC=./tools/claude-home-off/.claude/settings.json
AOJISTUDIO_CLAUDE_PLUGINS_SRC=./tools/claude-home-off/.claude/plugins
AOJISTUDIO_CLAUDE_PROJECTS_SRC=./tools/claude-home-off/.claude/projects
```
`AOJISTUDIO_CLAUDE_HOME`을 비우면 모두 대역이 연결되어 화면에 `연결 안 됨`으로 보인다.

### 상태줄 연동 (선택)
5시간·주간 한도와 구독 플랜을 07 화면의 `상태줄 연동` 카드로 받는다. 카드의 **설정 예시**를 `설정 예시 복사`로 복사해 Claude Code 설정 파일(`settings.json`)에 직접 넣는다(웹은 설정 파일을 쓰지 않는다).
```json
"statusLine": {
  "type": "command",
  "command": "node \"<AojiStudio 폴더>/.aojistudio/statusline.mjs\" --url http://127.0.0.1:4180/hooks/statusline -- <쓰던 상태줄 명령>"
}
```
- `statusline.mjs`는 서버가 기동 때 `.aojistudio/`에 놓는다. 수집 토큰은 같은 폴더의 `collect-token`을 스크립트가 읽으므로 예시에 토큰이 없다.
- `<쓰던 상태줄 명령>`은 **원래 쓰던 상태줄 명령으로 바꿔 이어 붙인다.** 쓰던 게 없으면 `-- <쓰던 상태줄 명령>`을 지운다(상태줄 출력은 비어 있다). 이어 붙인 명령은 셸 없이 실행되고 같은 입력을 받아 출력이 그대로 나간다.
- 파이프(`|`)·`&&`·변수처럼 **셸 기능이 필요한 명령**은 `sh -c '…'`로 감싼다. 예: `-- sh -c 'jq -r .model.display_name | tr a-z A-Z'`
- 스크립트는 **루프백(`127.0.0.1`·`localhost`·`[::1]`)의 `http` 주소로만** 전송한다. 다른 주소를 `--url`에 주면 보내지 않는다. 보내는 값은 구독 플랜과 5시간·주간 한도(사용률·초기화 시각)뿐이다.
- 상태줄은 **Claude Code CLI 세션이 돌 때만** 갱신된다. 데스크톱 앱 세션에서는 상태줄이 돌지 않을 수 있다(그때는 `.claude.json`의 한도 캐시 값을 쓴다).

## 3. 빌드 · 테스트
각 줄은 **저장소 루트에서** 시작한다. 주석의 숫자는 통과해야 하는 테스트 수다(줄면 뭔가 빠진 것이다). 숫자가 없는 줄은 전부 통과하면 된다.

```bash
# 유닛
(cd backend && ./gradlew test)                 # 603
(cd frontend && npm install && npm test)       # 982
(cd helper && npm test)                        # 98
(cd tools/replay && npm test)                  # 60

# 린트 · 타입체크 · 빌드
(cd frontend && npm run lint && npm run typecheck && npm run build)
(cd backend && ./gradlew build)

# E2E — 실제 컨테이너, 목킹 없음
(cd tools/e2e && npm install && npx playwright install chromium)   # 사전 1회
(cd tools/e2e && ./scripts/run-e2e.sh)         # 14배치 253
```

`run-e2e.sh`는 fixture 복사 → 컨테이너 기동 → dry-run 도우미(4191)·다른 Origin 서버(4192) 준비 →
실행 → 정리까지 스스로 한다. 사전 준비 명령은 없다. 공개 포트는 `127.0.0.1:4185`다.
x86_64 머신은 `E2E_PLATFORM=linux/amd64`를 앞에 붙인다. 운영 `compose.yaml`의 빌드·기동 확인은 `tools/e2e/scripts/check-compose-build.sh`다(`-p`만 바꿔 `down -v` 하지 않는다).


## 4. 저장소 구조

```text
backend/    Spring Boot 4.1.x · Java 25 · Gradle Kotlin DSL
frontend/   React 19.3 · TS · Vite 8 · Tailwind 4.3 · React Router v7
helper/     호스트에서 도는 열기 도우미(맥북 launchd · Windows 작업 스케줄러) (Node 24, 외부 의존 없음)
tools/      replay(이벤트 재생) · fixtures(테스트용 프로젝트 폴더) · e2e(Playwright)
docs/       요구사항 · 설계 · 태스크 · 진행 기록 · 리뷰
```

| 문서 | 내용 |
|---|---|
| [Detail_Readme.md](Detail_Readme.md) | 도우미 설치 상세 · 개발 실행(컨테이너 없이) · E2E 하네스 |

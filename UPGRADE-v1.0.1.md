# v1.0.0 → v1.0.1 업그레이드 (Jay Studio → Aoji Studio)

v1.0.1은 이름만 바뀐다. 앱 이름 `Jay Studio` → `Aoji Studio`, 작업 공간 폴더 `JayStudio` → `AojiStudio`, 데이터 폴더 `.jaystudio/` → `.aojistudio/`, 환경 변수 `JAYSTUDIO_*` → `AOJISTUDIO_*`, 수집 헤더 `X-JayStudio-Collect-Token` → `X-AojiStudio-Collect-Token`, 도우미 `jaystudio-helper`(`com.jaystudio.helper`) → `aojistudio-helper`(`com.aojistudio.helper`), compose 서비스·이미지·볼륨 `jaystudio…` → `aojistudio…`. 기능 동작은 바뀌지 않는다.

v1.0.x 동안은 옛 이름을 받아 주고 로그에 `[legacy]` 경고를 남긴다. 옛 이름 지원은 v1.1.0에서 제거된다. 옛 이름이 나오는 업그레이드 절차는 이 파일에만 적는다.

모든 명령은 저장소 최상위(이 파일이 있는 폴더)에서 실행한다. x86_64 머신(윈도우·리눅스)은 `.env`에 `AOJISTUDIO_PLATFORM=linux/amd64`가 있어야 한다.

## ① 업그레이드 순서

1. `git pull`
2. `docker compose down --remove-orphans` — 옛 서비스 컨테이너(`…-jaystudio-1`)가 4180을 잡고 있으면 새 컨테이너가 뜨지 못한다. `-v`는 붙이지 않는다(⑦).
3. (선택) 이벤트 이관 — 아래 "이벤트 이관". 이관하지 않아도 파일 기반 데이터(정의·구성·휴지통)는 그대로이고, 01의 실시간 이벤트는 다음 hook 이벤트부터 다시 쌓인다.
4. `docker compose up -d --build --remove-orphans`
5. 로그에서 `[legacy]` 줄을 확인한다: `docker compose logs aojistudio | grep '\[legacy\]'`. 줄마다 `종류 · 받아들인 것 · 조치 · v1.1.0에서 제거됩니다` 형식이고 조치가 적혀 있다. 아래 ②~⑤를 끝내면 `[legacy]` 줄이 사라진다.
6. 확인: `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4180/` → `200`

### 이벤트 이관 (선택, 사람이 1회)

이벤트 볼륨 이름이 `aojistudio-data`로 고정됐다. 옛 볼륨(`<프로젝트>_jaystudio-data`)은 그대로 남아 있고 새 볼륨은 비어 있다. 이관하려면 **새 컨테이너를 처음 띄우기 전에**(위 2번 뒤, 4번 앞에) 한다. 새 컨테이너가 이미 이벤트를 쓴 뒤에는 이관하지 않는다(덮어쓰기가 된다).

```bash
# 옛 볼륨 이름 확인 — jaystudio-data로 끝나는 것
docker volume ls --format '{{.Name}}'

docker compose build
docker run --rm --user 1000:1000 -v <옛 볼륨 이름>:/from:ro -v aojistudio-data:/data --entrypoint cp aojistudio:local -a /from/. /data/
```

옛 볼륨은 읽기 전용(`:ro`)으로 붙이고 복사만 한다. 새 볼륨은 이미지의 `/data`(소유 1000)에 처음 붙어 소유권을 물려받는다. 끝나면 위 4번 `up`을 한다. 이관 명령이 compose 밖에서 `aojistudio-data` 볼륨을 만들므로, 이후 `docker compose up` 때 `volume "aojistudio-data" already exists but was not created by Docker Compose` 경고가 나올 수 있다. 동작에는 영향이 없다. 이관 명령 형식은 `tools/e2e/scripts/check-volume-migration.sh`가 임시 볼륨으로 확인한다.

## ② 첫 기동의 `.jaystudio/` → `.aojistudio/` 이동

첫 기동에서 서버가 프로젝트 폴더의 `.jaystudio/`를 `.aojistudio/`로 이름만 바꿔 옮긴다(폴더째 rename 한 번 — 복사·병합·삭제 없음). 토큰 파일의 값·권한은 그대로다. 로그: `[legacy] data-dir · .jaystudio/ → .aojistudio/ 옮김(teams N, trash N, …)`.

| 상태 | 동작 |
|---|---|
| `.jaystudio/`만 있고 마운트 쓰기 가능 | 옮긴다 |
| `.jaystudio/`만 있고 마운트가 **읽기 전용** | 옮기지 않고 `.jaystudio/`를 읽기 전용 데이터 폴더로 쓴다. 쓰기 가능한 마운트로 다시 기동하면 그때 옮긴다 |
| `.aojistudio/`만 있음 | 할 일 없음 |
| 둘 다 있음 | 아무것도 옮기지 않고 `.aojistudio/`를 쓴다. 옛 hook 설정의 토큰이 `.aojistudio/collect-token`과 다르면 수집이 401일 수 있다 → 07의 새 설정 예시로 `.claude/settings.json`을 바꾼다(④). `.jaystudio/`는 확인한 뒤 직접 정리한다 |
| `.aojistudio` 또는 `.jaystudio`가 심볼릭 링크 | 기동 실패 — 링크를 실제 폴더로 바꾸거나 치운 뒤 다시 기동한다 |
| 쓰기 가능한데 옮기기 실패 | 기동 실패(`데이터 폴더를 옮기지 못했습니다(.jaystudio/ → .aojistudio/) · <사유> · …`). 원본은 그대로다. 마운트 쓰기 권한을 확인하거나 폴더 이름을 직접 바꾼 뒤(`mv .jaystudio .aojistudio`) 다시 기동한다 |

읽기 전용 마운트(`.jaystudio/`를 그대로 쓰는 상태)에서는 03 패널 각주(와 05·06 안내)의 정적 경로 `.aojistudio/`가 실제 경로 `.jaystudio/`와 다르다. 실제 경로는 07의 경로 행이 보여 주는 값이다. 이 상태에서는 변경 API가 모두 403이라 그 경로에 쓰는 동작이 없다.

## ③ 옛 `.env` 그대로 동작, 새 이름으로 바꾸기

옛 `.env`(`JAYSTUDIO_HOST_PATH`·`JAYSTUDIO_PORT`·`JAYSTUDIO_PLATFORM`·`JAYSTUDIO_HELPER_URL`)는 고치지 않아도 동작하고 로그에 `[legacy] env · JAYSTUDIO_… 사용 중 · AOJISTUDIO_…로 바꾸세요` 경고가 남는다. 값은 로그에 쓰지 않고 이름만 쓴다.

새 이름으로 바꾸려면 `.env`의 변수 이름 앞부분만 `JAYSTUDIO_` → `AOJISTUDIO_`로 고친다(값은 그대로). 새 이름과 옛 이름이 함께 있으면 새 이름이 쓰이고 옛 이름은 무시된다(경고). 빈 값은 설정 안 됨으로 본다. 바꾼 뒤 `docker compose up -d --build --remove-orphans`로 다시 올리면 `[legacy] env` 경고가 사라진다. 새 `.env` 예시는 `.env.example`이다.

## ④ 옛 hook 헤더 그대로 동작, 07 예시로 교체

`.claude/settings.json`의 옛 헤더 `X-JayStudio-Collect-Token`은 같은 토큰 값으로 계속 수집된다(로그 `[legacy] collect-header`, 토큰 값은 `••••••••`로 가려진다). 교체하려면 웹 07 설정의 `설정 예시 복사`로 새 예시(`X-AojiStudio-Collect-Token`)를 받아 `.claude/settings.json`에 직접 붙여 넣는다 — 웹은 이 파일을 쓰지 않는다. 새 헤더와 옛 헤더가 함께 오면 새 헤더만 검사한다.

## ⑤ 옛 도우미와 새 도우미 (macOS, 도우미를 쓰는 경우만)

- 옛 도우미(`com.jaystudio.helper`)는 다음 로그인·재시작까지 그대로 돈다. 재시작되면 옛 스크립트 이름이 새 도우미를 대신 실행하고 `[legacy] helper-script` 경고를 남긴다. 옛 `--token-file` 경로(`.jaystudio/helper-token`)는 프로젝트에 `.aojistudio/`가 있으면 새 경로(`.aojistudio/helper-token`)로 바꿔 쓰이고, `.aojistudio/`가 없으면 옛 경로를 그대로 쓰며, 두 경우 모두 `[legacy] helper-token-path` 경고를 남긴다.
- 서버가 첫 기동에서 `.jaystudio/`를 옮기기 전에는 도우미를 설치하지 않는다 — `.jaystudio/`만 있고 `.aojistudio/`가 없으면 `install.sh`가 설치를 거부한다(① 4번 `up` 뒤에 한다).
- 옛 도우미가 등록돼 있으면 `install.sh`는 설치하지 않고 제거 명령을 안내한다. 자동으로 내리지 않는다. 제거하고 새 도우미를 설치한다:

  ```bash
  cd helper
  ./uninstall.sh --label com.jaystudio.helper
  ./install.sh --project-dir /Users/<사용자>/Desktop/AojiStudio
  ```

  `./uninstall.sh --dry-run`으로 먼저 확인할 수 있다. 새 도우미의 Label은 `com.aojistudio.helper`, 로그는 `~/Library/Logs/com.aojistudio.helper.log`다. 토큰 파일은 지워지지 않는다. 자세한 확인 절차는 `Detail_Readme.md`.
- 서버는 `.aojistudio/helper-token`이 없을 때만 옛 `.jaystudio/helper-token`을 읽고(실제 디렉터리·일반 파일일 때만) `[legacy] helper-token` 경고를 남긴다. 새 도우미를 설치하면 사라진다.

## ⑥ 열어 둔 브라우저 탭은 새로고침

**업그레이드 전에 열어 둔 브라우저 탭은 새로고침한다.** 변경 요청(저장·제거 등)의 브라우저 토큰 헤더 이름이 `X-JayStudio-Browser-Token` → `X-AojiStudio-Browser-Token`으로 바뀌었고 옛 이름은 받지 않는다. 새로고침하지 않은 옛 탭의 변경 요청은 403이 된다(읽기는 영향 없음).

## ⑦ 옛 볼륨·`.jaystudio/` 잔여물은 지우지 않는다

옛 이벤트 볼륨(`<프로젝트>_jaystudio-data`)과 `.jaystudio/` 잔여물(둘 다 있음 상태의 옛 폴더, 옛 쓰기 확인 임시 파일 `.jaystudio-write-probe-*` 등)은 자동으로 지우지 않는다. v1.1.0 이후에 사람이 확인하고 판단한다.

**주의: 업그레이드 중에 `docker compose down -v`·`docker volume rm`·`docker volume prune`을 쓰지 말라 — 볼륨 이름이 고정이라 `-p`를 바꿔도 운영 이벤트 볼륨이 지워진다.**

## ⑧ 프로젝트 밖에서 사람이 바꿀 것

이 저장소 밖 파일이라 자동으로 바뀌지 않는다.

- `AojiStudio/.claude/settings.json`의 hook 헤더 — ④
- 루트 `CLAUDE.md`의 `.jaystudio/` 언급 → `.aojistudio/`
- `web-develop-depart/CLAUDE.md` 메모의 컨테이너 이름 `aoji-studio-jaystudio-1` → `aoji-studio-aojistudio-1`

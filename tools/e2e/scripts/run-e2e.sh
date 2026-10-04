#!/usr/bin/env bash
# T-024 E2E 배치 실행 (architecture.md §8.2, ADR-18).
#
# globalSetup은 fixture 하나를 임시 폴더로 복사해 컨테이너에 마운트하므로(compose.e2e.yaml)
# 한 번의 playwright 실행에는 fixture 하나만 쓸 수 있다. fixture가 다른 시나리오는 실행을 나눠
# 순서대로 돌린다. 각 배치는 fixture를 새로 복사하고 컨테이너를 다시 띄우므로 배치 사이에
# 파일 상태가 섞이지 않는다.
#
# 사용법: cd tools/e2e && ./scripts/run-e2e.sh
# 배치 하나만 돌리려면 그 배치의 명령을 직접 쓴다(각 run_batch 줄 참고).
# 실패 조사: E2E_KEEP_UP=1을 붙이면 컨테이너·도우미를 남긴다(조사 후 직접 정리해야 한다).
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

RESULTS=()

print_summary() {
  echo ""
  echo "===== 배치별 결과 ====="
  if [ ${#RESULTS[@]} -eq 0 ]; then
    echo "(실행한 배치가 없습니다)"
  else
    for line in "${RESULTS[@]}"; do
      echo "$line"
    done
  fi
}
trap print_summary EXIT

run_batch() {
  local label="$1"
  local fixture="$2"
  shift 2

  echo ""
  echo "===== $label (E2E_FIXTURE=$fixture) ====="
  if E2E_FIXTURE="$fixture" npx playwright test "$@"; then
    RESULTS+=("PASS  $label  [fixture $fixture]")
  else
    RESULTS+=("FAIL  $label  [fixture $fixture]")
    echo "배치 실패: $label" >&2
    exit 1
  fi
}

# 사전 1회 — compose.yaml의 옛 환경 변수 계층·중첩 기본값(E2E-R2-03 보조, ADR-56). 컨테이너를 띄우지 않으므로
# globalSetup 전에 한 번만 돈다. 실패하면 set -e로 바로 멈추고 요약에 FAIL로 남는다.
echo ""
echo "===== 사전 — check-compose-env.sh (컨테이너 기동 없음) ====="
if ./scripts/check-compose-env.sh; then
  RESULTS+=("PASS  사전 — check-compose-env.sh (옛 env 4경우)")
else
  RESULTS+=("FAIL  사전 — check-compose-env.sh (옛 env 4경우)")
  echo "check-compose-env.sh 실패" >&2
  exit 1
fi

# 배치 1 — project-basic. E2E-01이 "처음 실행"(워크플로우 0개·이벤트 0건)을 단언하므로
# 파일 이름 순서상 맨 앞에서 돌아 fixture 사본이 아직 깨끗한 상태를 본다.
run_batch "배치 1 — project-basic (E2E-01·E2E-02·E2E-08·E2E-14 + health·compose-volume·격리)" project-basic \
  tests/e2e-01.spec.ts \
  tests/e2e-02.spec.ts \
  tests/e2e-08.spec.ts \
  tests/e2e-14.spec.ts \
  tests/health.spec.ts \
  tests/compose-volume.spec.ts \
  tests/isolation.spec.ts

# 배치 2 — project-configured. 세 spec 모두 자기가 쓸 정의 파일·구성 파일을 직접 만들어
# 실행 순서에 의존하지 않는다.
run_batch "배치 2 — project-configured (E2E-03·E2E-07·E2E-10)" project-configured \
  tests/e2e-03.spec.ts \
  tests/e2e-07.spec.ts \
  tests/e2e-10.spec.ts

# 배치 3·4 — E2E-06은 fixture 두 개를 쓰는 시나리오라 describe를 나누고 실행도 나눈다.
run_batch "배치 3 — project-no-agents-dir (E2E-06 04-5)" project-no-agents-dir \
  tests/e2e-06.spec.ts --grep "project-no-agents-dir"

run_batch "배치 4 — project-format-errors (E2E-06 04-6)" project-format-errors \
  tests/e2e-06.spec.ts --grep "project-format-errors"

# 배치 5 — project-configured. E2E-04는 **이벤트 0건인 새 컨테이너**에서 시작해야 한다
# (`[세션 N]` 번호가 1부터 붙고 01 실시간 이벤트 수가 재생 줄 수와 같아야 한다). 그래서 배치 2와
# 합치지 않고 따로 띄운다. E2E-15는 쓰기 가능한 fixture만 필요하고 파일 이름 순서상 E2E-04 뒤에
# 돌아 E2E-04의 단언에 끼어들지 않으므로 같은 배치에 둔다(컨테이너를 한 번만 띄운다).
run_batch "배치 5 — project-configured (E2E-04 재생·E2E-15 진입 주소 정규화)" project-configured \
  tests/e2e-04.spec.ts \
  tests/e2e-15.spec.ts

# 배치 6 — project-configured. E2E-09는 하네스가 띄운 dry-run 도우미를 잠시 정지(SIGSTOP→SIGCONT)시키고
# 도우미 토큰 파일을 잠시 바꾸지만 두 케이스 모두 테스트 안에서 원복하고 원복을 단언한다. E2E-11은
# `.claude/settings.json`을 07이 준 예시로 덮어쓰므로 **같은 파일을 쓰는 E2E-04(배치 5)와 같은 배치에 두지
# 않는다**. 09와 11은 서로의 전제를 건드리지 않아(09는 settings.json을 읽지도 쓰지도 않고, 11은 도우미가
# 살아 있는 상태만 요구한다) 컨테이너를 한 번만 띄우도록 한 배치에 둔다. 실행 순서는 아래 나열 순서다.
run_batch "배치 6 — project-configured (E2E-09 터미널 열기·E2E-11 07 설정)" project-configured \
  tests/e2e-09.spec.ts \
  tests/e2e-11.spec.ts

# 배치 7 — project-configured. **반드시 단독 배치**: E2E-05는 컨테이너를 `docker compose pause`로 얼려
# SSE를 끊는다(realtime-spec.md §4). 같은 배치에 다른 spec이 있으면 그 spec이 멈춘 컨테이너를 만나
# 전부 깨진다. spec은 `finally`와 `afterAll`에서 `unpause`로 되돌리고 컨테이너 상태를 단언한다.
# 끊김 판정 45초 × 2회를 기다리므로 이 배치만 2분 가까이 걸린다(테스트 자체 타임아웃은 spec 안에서 늘린다).
run_batch "배치 7 — project-configured (E2E-05 04-3 재연결 · pause/unpause 단독)" project-configured \
  tests/e2e-05.spec.ts

# 배치 8 — project-showcase. E2E-13은 `showcase.jsonl` 22줄을 재생한 상태를 단언하고 01·02·03(+04-4 변형)을
# `screenshots/`에 캡처한다. 이벤트 0건인 새 컨테이너에서 시작해야 재생 결과 수치(실시간 이벤트 22개,
# 상태 집계)가 맞으므로 다른 spec과 합치지 않는다. fixture의 `settings.json`·구성 파일을 쓰지만 모두
# 자기 배치 안에서 되돌린다.
run_batch "배치 8 — project-showcase (E2E-13 스크린샷 · pitch·이름 실측)" project-showcase \
  tests/e2e-13.spec.ts

# 배치 9 — project-large(에이전트 100·워크플로우 30). E2E-12는 30개 층이 모두 있는 상태에서 줌·미니맵·
# 검색·드롭다운을 재므로 이 fixture만 쓰는 단독 배치다. 화면만 읽고 파일·설정을 바꾸지 않는다.
#
# **맨 뒤에 두는 이유(이력)**: T-024 ③c 검증에서 `줌을 바꾸면 미니맵 뷰포트 사각형도 새 배율의
# clientHeight/scrollHeight로 바뀐다`(이연 Minor T-015 m2)가 실패했다 — `Minimap.tsx`가 줌 변경 시
# 값을 다시 계산하지 않는 구현 결함이었고 ui-spec.md SCR-02 미니맵 행("둘 다 zoom 배율이 적용된 값으로
# 통일")과 어긋났다. `run_batch`는 실패하면 즉시 멈추므로, 이 배치를 마지막에 두어 나머지 8개 배치가
# 한 번의 실행으로 모두 검증되게 했다. **그 결함은 T-FIX-10으로 해소됐고 현재 7개 전부 통과한다.**
# 배치 순서는 같은 이유(실패 시 뒤 배치가 통째로 건너뛰어지는 것을 줄인다)로 그대로 둔다.
run_batch "배치 9 — project-large (E2E-12 줌·미니맵·검색·드롭다운)" project-large \
  tests/e2e-12.spec.ts

# ── 호환 배치 4개 (architecture.md §8.4.3, tasks.md T-R2-10). 표준 배치와 fixture·compose가 달라 따로 돈다.
# 이 배치들은 옛 이름을 일부러 쓰므로 globalTeardown의 `[legacy]` 0건 검사(E2E-R2-06)를 하지 않는다(E2E 하네스가
# 배치 종류를 fixture 이름·E2E_COMPOSE로 판정). 각 spec이 `[legacy]` 줄을 직접 단언한다.

# 배치 10 — project-legacy-only(쓰기 가능). 파일 이름 순서가 곧 실행 순서다: R2-02(옛 헤더) → R2-04(이동) → R2-07(shim 도우미).
run_batch "배치 10 — project-legacy-only (E2E-R2-02 옛 헤더·R2-04 이동·R2-07 옛 도우미 shim)" project-legacy-only \
  tests/e2e-r2-02-legacy-header.spec.ts \
  tests/e2e-r2-04-migrate-legacy-only.spec.ts \
  tests/e2e-r2-07-legacy-helper-shim.spec.ts

# 배치 11 — project-legacy-only를 `:ro`로 마운트(E2E_MOUNT_MODE=ro). 같은 spec 안에서 rw로 다시 띄운다.
E2E_MOUNT_MODE=ro run_batch "배치 11 — project-legacy-only :ro (E2E-R2-04b 읽기 전용 → rw 재기동)" project-legacy-only \
  tests/e2e-r2-04b-legacy-read-only.spec.ts

# 배치 12 — project-legacy-both. 옛 폴더·새 폴더가 모두 있어 아무것도 옮기지 않는다.
run_batch "배치 12 — project-legacy-both (E2E-R2-05 둘 다 있음)" project-legacy-both \
  tests/e2e-r2-05-migrate-both.spec.ts

# 배치 13 — project-configured + compose.e2e-legacy-env.yaml(환경 변수가 옛 이름뿐인 compose).
E2E_COMPOSE=legacy-env run_batch "배치 13 — project-configured + 옛 환경 변수 (E2E-R2-03)" project-configured \
  tests/e2e-r2-03-legacy-env.spec.ts

# E2E-01~15 전부가 위 9개 배치로 끝난다(architecture.md §8.2). 새 시나리오를 넣을 때는 fixture가 같고
# 서로의 전제를 건드리지 않는 배치에 덧붙이고, 컨테이너 상태를 바꾸는 spec(예: pause)은 단독 배치로 둔다.

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
  # 전역 연결 fixture는 호출 줄에서 `E2E_CLAUDE_HOME_FIXTURE=...`를 앞에 붙여 넘긴다(없으면 대역 `연결 안 됨`).
  if E2E_FIXTURE="$fixture" npx playwright test "$@"; then
    RESULTS+=("PASS  $label  [fixture $fixture]")
  else
    RESULTS+=("FAIL  $label  [fixture $fixture]")
    echo "배치 실패: $label" >&2
    exit 1
  fi
}

# 사전 0 — 옛 앱 이름 검색 0건(NFR-13 ⑤, ADR-62). 컨테이너를 띄우지 않는다.
echo ""
echo "===== 사전 — check-old-names.sh (컨테이너 기동 없음) ====="
if ./scripts/check-old-names.sh; then
  RESULTS+=("PASS  사전 — check-old-names.sh (옛 이름 검색 0건)")
else
  RESULTS+=("FAIL  사전 — check-old-names.sh (옛 이름 검색 0건)")
  echo "check-old-names.sh 실패" >&2
  exit 1
fi

# 사전 1회 — compose.yaml에서 옛 이름 환경 변수가 해석되지 않는지(NFR-13 ②, ADR-62). 컨테이너를 띄우지 않으므로
# globalSetup 전에 한 번만 돈다. 실패하면 set -e로 바로 멈추고 요약에 FAIL로 남는다.
echo ""
echo "===== 사전 — check-old-env.sh (컨테이너 기동 없음) ====="
if ./scripts/check-old-env.sh; then
  RESULTS+=("PASS  사전 — check-old-env.sh (옛 env 미해석)")
else
  RESULTS+=("FAIL  사전 — check-old-env.sh (옛 env 미해석)")
  echo "check-old-env.sh 실패" >&2
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

# 배치 3·4 — E2E-06은 fixture 두 개를 쓰는 시나리오라 describe를 나누고 실행도 나눈다. E2E-13의 04-5·04-6 캡처
# (`[E2E-13] project-no-agents-dir …`·`[E2E-13] project-format-errors …`)도 같은 fixture라 `--grep`으로 함께 돈다(ADR-75).
run_batch "배치 3 — project-no-agents-dir (E2E-06 04-5 · E2E-13 04-5 캡처)" project-no-agents-dir \
  tests/e2e-06.spec.ts tests/e2e-13.spec.ts --grep "project-no-agents-dir"

run_batch "배치 4 — project-format-errors (E2E-06 04-6 · E2E-13 04-6 캡처)" project-format-errors \
  tests/e2e-06.spec.ts tests/e2e-13.spec.ts --grep "project-format-errors"

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
# e2e-21b(T-R4-17: 09 MCP `연결 안 됨` FR-023-E2 · T-R4-18: 10 비용 `연결 안 됨` FR-025-E1 + 한도 `받은 적 없음` FR-027-E1)는 전역 연결 fixture 없이(대역 `연결 안 됨`) 화면만 읽어 서로의 전제를 건드리지 않는다.
run_batch "배치 6 — project-configured (E2E-09 터미널 열기·E2E-11 07 설정·E2E-21b 09 MCP·10 비용 연결 안 됨)" project-configured \
  tests/e2e-09.spec.ts \
  tests/e2e-11.spec.ts \
  tests/e2e-21b-disconnected.spec.ts

# 배치 7 — project-configured. **반드시 단독 배치**: E2E-05는 컨테이너를 `docker compose pause`로 얼려
# SSE를 끊는다(realtime-spec.md §4). 같은 배치에 다른 spec이 있으면 그 spec이 멈춘 컨테이너를 만나
# 전부 깨진다. spec은 `finally`와 `afterAll`에서 `unpause`로 되돌리고 컨테이너 상태를 단언한다.
# 끊김 판정 45초 × 2회를 기다리므로 이 배치만 2분 가까이 걸린다(테스트 자체 타임아웃은 spec 안에서 늘린다).
# E2E-13의 04-3 캡처(`[E2E-13] project-configured 04-3 …`)도 pause를 쓰므로 같은 단독 배치에 둔다: 파일 이름순으로 E2E-05 뒤에 돌고
# 컨테이너를 `afterAll`에서 `unpause`한다. `--grep`은 E2E-05 전체와 이 캡처 하나만 고른다(ADR-76 결정 3).
run_batch "배치 7 — project-configured (E2E-05 04-3 재연결 · E2E-13 04-3 캡처 · pause/unpause 단독)" project-configured \
  tests/e2e-05.spec.ts tests/e2e-13.spec.ts --grep "E2E-05|project-configured 04-3"

# 배치 8 — project-showcase. `showcase.jsonl` 30줄을 재생한 상태에서 E2E-13(화면 대조 20화면 중 01·02·03·04-4·05-R·05-3·06·06-6·06-5·07)과
# E2E-16(사이 크기 넘침 12경우)이 돈다. 이벤트 0건인 새 컨테이너에서 시작해야 재생 결과 수치(실시간 이벤트 30, 상태 집계 7·1·13)가
# 맞으므로 다른 spec과 합치지 않는다. 순서는 ui-spec "배치별 캡처 순서" 표 그대로이고 **파일 이름순 실행**에 기댄다:
#   e2e-13.spec.ts(순서 1~8) → e2e-16.spec.ts(순서 9, E2E-16) → e2e-16z-e2e13-state-changes.spec.ts(순서 10~14, 상태를 바꾼다).
# 마지막 파일은 이름이 `e2e-16.spec.ts`보다 뒤가 되게 `e2e-16z-`로 시작한다(코드 단위·ICU 정렬 모두에서 뒤).
run_batch "배치 8 — project-showcase (E2E-13 순서 1~14 · E2E-16 넘침 판정)" project-showcase \
  tests/e2e-13.spec.ts \
  tests/e2e-16.spec.ts \
  tests/e2e-16z-e2e13-state-changes.spec.ts --grep "project-showcase"

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

# 배치 10 — project-old-name(옛 이름 데이터 폴더만 있는 fixture). E2E-17: 옛 폴더는 읽지도 옮기지도 않고, 옛 수집 헤더는 401이다
# (NFR-13 ①③, ADR-62). 옛 토큰 파일은 spec이 임시 복사본에 직접 써 넣는다. 이벤트 0건인 새 컨테이너에서 시작해야
# 01 실시간 이벤트 행 수(1)가 맞으므로 다른 spec과 합치지 않는다.
run_batch "배치 10 — project-old-name (E2E-17 옛 이름 미지원)" project-old-name \
  tests/e2e-17-old-name.spec.ts

# 배치 11 — project-basic(이벤트 0건·워크플로우 0개인 새 컨테이너). E2E-13의 04-2·04-7·05-L(성공·E1·E3)·04-1 캡처를 이 순서대로 만든다
# (`[E2E-13] project-basic …`). 04-2는 `/api/state`·`/api/stream`의 `route.continue()`만 늦추고(ADR-75 6) E3는 호스트의
# `.aojistudio/teams/`를 0555로 만들었다 0755로 되돌린다. 다른 spec과 합치지 않는다(워크플로우 0개가 전제).
run_batch "배치 11 — project-basic (E2E-13 04-2·04-7·05-L·04-1 캡처)" project-basic \
  tests/e2e-13.spec.ts --grep "project-basic"

# 배치 12 — project-skills + 전역 연결 `claude-home-empty`(연결됨·내용 없음, `E2E_CLAUDE_HOME_FIXTURE`). 스킬 파일을 쓰는 배치(E2E-18).
# e2e-18a(T-R4-15: 08-3 삭제·밖에서 바뀐 스킬 2초 반영·형식 오류·가져온 스킬 행)가 파일 이름순으로 먼저 돌고, e2e-18b(T-R4-16: 08-1 만들기·수정·08-4 충돌·
# 08-2 가져오기·위험 zip 4종)가 이어서 돈다. 각 spec은 자기가 만든 스킬만 치우므로 서로의 전제를 건드리지 않는다. zip은 e2e-18b가 임시 폴더에 직접 만든다.
E2E_CLAUDE_HOME_FIXTURE=claude-home-empty run_batch "배치 12 — project-skills + claude-home-empty (E2E-18a 스킬 삭제·밖에서 바뀐 스킬 + E2E-18b 스킬 만들기·수정·충돌·가져오기·위험 zip)" project-skills \
  tests/e2e-18a-skills-list.spec.ts \
  tests/e2e-18b-skills-write.spec.ts

# 배치 13 — project-usage + 전역 연결 `claude-home-basic`. **이벤트 0건인 새 컨테이너가 전제**다: e2e-19a가 첫 테스트에서 `기록 없음`을 단언한 뒤
# `usage.jsonl`을 스스로 재생하고, 이후 spec(e2e-19b·e2e-20~22·24~26 — 이후 태스크가 더한다)은 그 데이터를 이어 쓴다. 파일 이름순 실행에 기댄다.
# e2e-19b(T-R4-17)는 마지막 테스트에서 31번 줄(기본 세션의 github 호출)을 3번 더 재생하므로 e2e-20의 `github` 기본 세션 횟수는 expected 값 또는 +3을 허용한다. e2e-20은 `.mcp.json`을 바꿨다 원복한다.
# e2e-21-cost(T-R4-18)는 e2e-19a 재생 뒤(에이전트 나눔에 `기본 세션`) 상태줄을 받기 전(한도 카드 = 한도 캐시 값)에 돈다. 맨 마지막 describe가 fixture 대화 기록에 줄을 덧붙여 집계를 바꾸므로(되돌릴 수 없다)
# 그 뒤에 도는 spec은 expected.json의 토큰 합계(`claude-home-basic`)에 기대면 안 된다(입력 +100·출력 +50, haiku). e2e-22-statusline(T-R4-18)은 비용 합계를 보지 않고, 상태줄 값(`statusline_last` 한 행)을 덮어쓰며
# 한도 캐시(`.claude.json` 사본)를 잠시 바꿨다 원복한다. 마지막 테스트가 컨테이너를 `docker compose pause`했다 `unpause`(finally)하므로 **배치 13의 마지막 파일로 둔다**
# — 새 spec(e2e-24~)을 더할 때는 e2e-22 앞에 끼우지 않고 pause 테스트를 e2e-22 안에서 맨 끝에 유지한다.
E2E_CLAUDE_HOME_FIXTURE=claude-home-basic run_batch "배치 13 — project-usage + claude-home-basic (E2E-19a 08 스킬 사용 집계·E2E-19b 09 MCP 사용·E2E-20 09 MCP·E2E-21 10 비용·E2E-22 상태줄)" project-usage \
  tests/e2e-19a-skill-usage.spec.ts \
  tests/e2e-19b-mcp-usage.spec.ts \
  tests/e2e-20-mcp.spec.ts \
  tests/e2e-21-cost.spec.ts \
  tests/e2e-22-statusline.spec.ts

# E2E-01~17이 위 11개 배치로 끝난다(architecture.md §8.2·§8.4). 배치 12·13은 v1.2.0 스킬·사용 집계 배치다. 새 시나리오를 넣을 때는 fixture가 같고
# 서로의 전제를 건드리지 않는 배치에 덧붙이고, 컨테이너 상태를 바꾸는 spec(예: pause)은 단독 배치로 둔다.
# 모든 배치가 끝날 때마다 globalTeardown이 컨테이너 로그의 옛 호환 경고 0줄을 단언한다(NFR-13 ⑥).
# E2E-13 캡처 60장은 `tools/e2e/screenshots/<원본 이름>@<W>x<H>.png`에 남는다(.gitignore 대상).

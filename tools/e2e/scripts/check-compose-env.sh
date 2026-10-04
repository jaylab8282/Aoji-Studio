#!/usr/bin/env bash
# NFR-05·ADR-56 확인: compose.yaml의 옛 환경 변수 계층·중첩 기본값이 동작하는지 `docker compose config`로 검사한다.
# 컨테이너를 기동하지 않는다. 임시 .env 파일은 종료 시 지운다.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/compose.yaml"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# 호스트 셸의 변수가 .env 값보다 우선하므로 검사 동안 비운다.
unset AOJISTUDIO_HOST_PATH AOJISTUDIO_PORT AOJISTUDIO_PLATFORM AOJISTUDIO_HELPER_URL \
      JAYSTUDIO_HOST_PATH JAYSTUDIO_PORT JAYSTUDIO_PLATFORM JAYSTUDIO_HELPER_URL

fail() { echo "FAIL: $*" >&2; exit 1; }

# run_config <이름> <.env 내용> → 표준 출력(config), 종료 코드는 RC, stderr는 ERR
run_config() {
  local name="$1" content="$2"
  printf '%s\n' "$content" > "$TMP_DIR/$name.env"
  set +e
  OUT="$(docker compose --env-file "$TMP_DIR/$name.env" -f "$COMPOSE_FILE" config 2> "$TMP_DIR/$name.err")"
  RC=$?
  set -e
  ERR="$(cat "$TMP_DIR/$name.err")"
}

expect_ok() {
  local label="$1" source="$2" port="$3"
  [[ "$RC" -eq 0 ]] || fail "$label: config 실패(종료 $RC): $ERR"
  grep -q "source: $source\$" <<<"$OUT" || fail "$label: 마운트 source가 $source 가 아님"
  grep -q "published: \"$port\"" <<<"$OUT" || fail "$label: published 포트가 $port 가 아님"
  grep -q "host_ip: 127.0.0.1" <<<"$OUT" || fail "$label: host_ip가 127.0.0.1이 아님"
  echo "PASS: $label (source=$source, published=$port)"
}

# ① 새 이름만
run_config new "AOJISTUDIO_HOST_PATH=/tmp/new-folder
AOJISTUDIO_PORT=4191"
expect_ok "① 새 이름만" /tmp/new-folder 4191

# ② 옛 이름만
run_config old "JAYSTUDIO_HOST_PATH=/tmp/old-folder
JAYSTUDIO_PORT=4192"
expect_ok "② 옛 이름만" /tmp/old-folder 4192

# ③ 둘 다 있고 값이 다름 → 새 값
run_config both "AOJISTUDIO_HOST_PATH=/tmp/new-folder
AOJISTUDIO_PORT=4191
JAYSTUDIO_HOST_PATH=/tmp/old-folder
JAYSTUDIO_PORT=4192"
expect_ok "③ 둘 다 다름(새 값)" /tmp/new-folder 4191

# ④ 둘 다 없음 → 비 0 종료 + 문구에 AOJISTUDIO_HOST_PATH
run_config none "# 값 없음"
[[ "$RC" -ne 0 ]] || fail "④ 둘 다 없는데 config가 성공함"
grep -q "AOJISTUDIO_HOST_PATH" <<<"$ERR" || fail "④ 오류 문구에 AOJISTUDIO_HOST_PATH가 없음: $ERR"
echo "PASS: ④ 둘 다 없음 (종료 $RC, 문구: $ERR)"

echo "PASS: check-compose-env 4경우 통과"

#!/usr/bin/env bash
# NFR-13 ②·FR-014-E1 확인(ADR-62 예외 경로): 옛 이름 환경 변수는 해석되지 않는다.
# `docker compose config`만 쓰고 컨테이너를 기동하지 않는다. 임시 .env는 종료 시 지운다.
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

# run_config <이름> <.env 내용> → OUT(config 출력), RC(종료 코드), ERR(stderr)
run_config() {
  local name="$1" content="$2"
  printf '%s\n' "$content" > "$TMP_DIR/$name.env"
  set +e
  OUT="$(docker compose --env-file "$TMP_DIR/$name.env" -f "$COMPOSE_FILE" config 2> "$TMP_DIR/$name.err")"
  RC=$?
  set -e
  ERR="$(cat "$TMP_DIR/$name.err")"
}

# ① 옛 이름만 → 비 0 종료, 오류에 새 이름 안내
run_config old "JAYSTUDIO_HOST_PATH=$TMP_DIR/mount
JAYSTUDIO_PORT=4180"
[[ "$RC" -ne 0 ]] || fail "① 옛 이름만 있는데 config가 성공함"
grep -q "AOJISTUDIO_" <<<"$ERR" || fail "① 오류 문구에 AOJISTUDIO_ 가 없음: $ERR"
echo "PASS: ① 옛 이름만 → 거부 (종료 $RC)"

# ② 새 이름 → 성공, 127.0.0.1:4180
run_config new "AOJISTUDIO_HOST_PATH=$TMP_DIR/mount
AOJISTUDIO_PORT=4180"
[[ "$RC" -eq 0 ]] || fail "② 새 이름인데 config 실패(종료 $RC): $ERR"
grep -q "host_ip: 127.0.0.1" <<<"$OUT" || fail "② host_ip가 127.0.0.1이 아님"
grep -q "published: \"4180\"" <<<"$OUT" || fail "② published 포트가 4180이 아님"
echo "PASS: ② 새 이름 → 통과 (127.0.0.1:4180)"

# ③ 새 이름 빈 값 → 비 0 종료
run_config empty "AOJISTUDIO_HOST_PATH=
AOJISTUDIO_PORT="
[[ "$RC" -ne 0 ]] || fail "③ 빈 값인데 config가 성공함"
echo "PASS: ③ 빈 값 → 거부 (종료 $RC)"

echo "PASS check-old-env"

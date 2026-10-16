#!/usr/bin/env bash
# 전역 Claude 설정 연결 구성 확인 (ADR-79 결정 1·2, NFR-06·NFR-15). 컨테이너·이미지 빌드 없이 `docker compose config`만 쓴다.
# 세 경우: ① 홈 없음 → 대역 ② 홈 있음 → 홈 경로 ③ 항목 _SRC 덮어쓰기 → 그 항목만 덮어쓴 경로.
# 어느 경우든 bind 4개는 read_only=true·create_host_path=false이고 ~/.claude 전체·.credentials.json 연결이 없다.
# 호스트에 아무것도 만들지 않는다(임시 .env는 종료 시 지운다).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/compose.yaml"
STAND_IN="$REPO_ROOT/tools/claude-home-off"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# 호스트 셸의 변수가 .env 값보다 우선하므로 검사 동안 비운다.
unset AOJISTUDIO_HOST_PATH AOJISTUDIO_PORT AOJISTUDIO_PLATFORM AOJISTUDIO_HELPER_URL \
      AOJISTUDIO_HOST_OS AOJISTUDIO_WSL_DISTRO AOJISTUDIO_CLAUDE_HOME \
      AOJISTUDIO_CLAUDE_JSON_SRC AOJISTUDIO_CLAUDE_SETTINGS_SRC \
      AOJISTUDIO_CLAUDE_PLUGINS_SRC AOJISTUDIO_CLAUDE_PROJECTS_SRC

fail() { echo "FAIL: $*" >&2; exit 1; }

# run_case <이름> <기대 JSON/.claude.json 원본> <settings> <plugins> <projects> <기대 HOME_HOST> <.env 추가 줄>
run_case() {
  local name="$1" json="$2" settings="$3" plugins="$4" projects="$5" home_host="$6" extra="$7"
  printf 'AOJISTUDIO_HOST_PATH=%s\nAOJISTUDIO_PORT=4180\n%s\n' "$TMP_DIR/mount" "$extra" > "$TMP_DIR/$name.env"
  docker compose --env-file "$TMP_DIR/$name.env" -f "$COMPOSE_FILE" config --format json > "$TMP_DIR/$name.json" \
    || fail "$name: docker compose config 실패"
  python3 - "$TMP_DIR/$name.json" "$name" "$json" "$settings" "$plugins" "$projects" "$home_host" <<'PY'
import json, sys
path, name, j, s, pl, pr, home_host = sys.argv[1:]
svc = json.load(open(path))["services"]["aojistudio"]
want = {
    "/claude-home/.claude.json": j,
    "/claude-home/.claude/settings.json": s,
    "/claude-home/.claude/plugins": pl,
    "/claude-home/.claude/projects": pr,
}
claude = [v for v in svc["volumes"] if v["target"].startswith("/claude-home")]
if sorted(v["target"] for v in claude) != sorted(want):
    sys.exit(f"FAIL: {name}: 대상 경로가 4개 정확히가 아님: {[v['target'] for v in claude]}")
for v in claude:
    t = v["target"]
    if v.get("type") != "bind":
        sys.exit(f"FAIL: {name}: {t} bind가 아님")
    if v.get("read_only") is not True:
        sys.exit(f"FAIL: {name}: {t} read_only가 true가 아님")
    if v.get("bind", {}).get("create_host_path") is not False:
        sys.exit(f"FAIL: {name}: {t} create_host_path가 false가 아님")
    if v["source"] != want[t]:
        sys.exit(f"FAIL: {name}: {t} 원본 {v['source']} != 기대 {want[t]}")
for v in svc["volumes"]:
    src = v.get("source", "")
    if "docker.sock" in src or v["target"] in ("/claude-home", "/claude-home/.claude") or ".credentials" in src:
        sys.exit(f"FAIL: {name}: 금지된 연결: {v}")
got = svc["environment"].get("AOJISTUDIO_CLAUDE_HOME_HOST")
if got != home_host:
    sys.exit(f"FAIL: {name}: AOJISTUDIO_CLAUDE_HOME_HOST={got!r} != {home_host!r}")
for k in ("AOJISTUDIO_HOST_OS", "AOJISTUDIO_WSL_DISTRO"):
    if svc["environment"].get(k) != "":
        sys.exit(f"FAIL: {name}: {k}가 빈 값 기본으로 넘어가지 않음: {svc['environment'].get(k)!r}")
print(f"PASS: {name}")
PY
}

# ① 홈 없음 → 대역 4개, 서버에는 빈 홈
run_case "case1-no-home" \
  "$STAND_IN/.claude.json" "$STAND_IN/.claude/settings.json" "$STAND_IN/.claude/plugins" "$STAND_IN/.claude/projects" \
  "" ""

# ② 홈 있음 → 홈 경로 4개(config는 존재 여부를 보지 않는다)
FIXTURE_HOME="/home/fixture-user"
run_case "case2-home" \
  "$FIXTURE_HOME/.claude.json" "$FIXTURE_HOME/.claude/settings.json" "$FIXTURE_HOME/.claude/plugins" "$FIXTURE_HOME/.claude/projects" \
  "$FIXTURE_HOME" "AOJISTUDIO_CLAUDE_HOME=$FIXTURE_HOME"

# ③ 홈 있음 + plugins·projects만 대역으로 덮어쓰기 → 그 두 항목만 대역
run_case "case3-src-override" \
  "$FIXTURE_HOME/.claude.json" "$FIXTURE_HOME/.claude/settings.json" "$STAND_IN/.claude/plugins" "$STAND_IN/.claude/projects" \
  "$FIXTURE_HOME" "AOJISTUDIO_CLAUDE_HOME=$FIXTURE_HOME
AOJISTUDIO_CLAUDE_PLUGINS_SRC=$STAND_IN/.claude/plugins
AOJISTUDIO_CLAUDE_PROJECTS_SRC=$STAND_IN/.claude/projects"

# 대역 표지 확인(서버가 표지로 연결 안 됨을 판정한다)
grep -q '"aojistudioStandIn": true' "$STAND_IN/.claude.json" || fail "대역 .claude.json 표지 없음"
grep -q '"aojistudioStandIn": true' "$STAND_IN/.claude/settings.json" || fail "대역 settings.json 표지 없음"
[[ -f "$STAND_IN/.claude/plugins/.aojistudio-stand-in" ]] || fail "대역 plugins 표지 없음"
[[ -f "$STAND_IN/.claude/projects/.aojistudio-stand-in" ]] || fail "대역 projects 표지 없음"
[[ ! -e "$STAND_IN/.claude/.credentials.json" ]] || fail "대역에 .credentials.json이 있음"
echo "PASS: 대역 표지 4개, 자격증명 없음"

echo "PASS check-compose-config"

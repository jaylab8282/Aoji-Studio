#!/bin/bash
# 열기 도우미 launchd LaunchAgent 설치 (FR-013, architecture.md External Systems launchd)
# plist를 만들고 launchctl bootstrap으로 등록한다. --dry-run이면 아무것도 바꾸지 않고
# 만들 plist를 stdout에, 실행할 명령을 stderr에 적는다.
set -euo pipefail

HELPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_PATH="$HELPER_DIR/jaystudio-helper.mjs"
PLIST_RENDERER="$HELPER_DIR/lib/plist.mjs"

LABEL="com.jaystudio.helper"
PORT="4181"
ALLOWED_ORIGINS="http://127.0.0.1:4180"
PROJECT_DIR=""
TOKEN_FILE=""
LOG_FILE=""
NODE_BIN=""
DRY_RUN="false"
LAUNCH_AGENTS_DIR="${JAYSTUDIO_LAUNCH_AGENTS_DIR:-$HOME/Library/LaunchAgents}"

usage() {
  cat <<'USAGE'
usage: ./install.sh --project-dir <JayStudio 맥북 경로>
                    [--port <number>] [--allowed-origins <origin[,origin]>]
                    [--token-file <path>] [--log-file <path>] [--node <path>]
                    [--label <launchd label>] [--dry-run]

  --dry-run  아무것도 바꾸지 않는다. 만들 plist를 stdout에, 실행할 명령을 stderr에 적는다.
  환경 변수 JAYSTUDIO_LAUNCH_AGENTS_DIR로 LaunchAgents 폴더를 바꿀 수 있다(기본 ~/Library/LaunchAgents).
USAGE
}

fail() {
  echo "install.sh: $1" >&2
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --project-dir) [ $# -ge 2 ] || fail "$1 값이 필요합니다"; PROJECT_DIR="$2"; shift 2 ;;
    --port) [ $# -ge 2 ] || fail "$1 값이 필요합니다"; PORT="$2"; shift 2 ;;
    --allowed-origins) [ $# -ge 2 ] || fail "$1 값이 필요합니다"; ALLOWED_ORIGINS="$2"; shift 2 ;;
    --token-file) [ $# -ge 2 ] || fail "$1 값이 필요합니다"; TOKEN_FILE="$2"; shift 2 ;;
    --log-file) [ $# -ge 2 ] || fail "$1 값이 필요합니다"; LOG_FILE="$2"; shift 2 ;;
    --node) [ $# -ge 2 ] || fail "$1 값이 필요합니다"; NODE_BIN="$2"; shift 2 ;;
    --label) [ $# -ge 2 ] || fail "$1 값이 필요합니다"; LABEL="$2"; shift 2 ;;
    --dry-run) DRY_RUN="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; fail "알 수 없는 인자입니다: $1" ;;
  esac
done

[ -n "$PROJECT_DIR" ] || { usage >&2; fail "--project-dir 값이 필요합니다"; }
case "$PROJECT_DIR" in
  /*) ;;
  *) fail "--project-dir 값은 절대 경로여야 합니다" ;;
esac
case "$PROJECT_DIR" in
  *'"'*|*'`'*|*'$'*|*'\'*|*$'\n'*)
    fail '--project-dir 값에 허용되지 않는 문자가 있습니다 (" ` $ \ 개행)' ;;
esac
[ -d "$PROJECT_DIR" ] || fail "--project-dir 경로를 찾을 수 없습니다: $PROJECT_DIR"
case "$PORT" in
  ''|*[!0-9]*) fail "--port 값이 포트 번호가 아닙니다: $PORT" ;;
esac
[ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] || fail "--port 값이 포트 번호가 아닙니다: $PORT"
[ -f "$SCRIPT_PATH" ] || fail "도우미 스크립트를 찾을 수 없습니다: $SCRIPT_PATH"
[ -f "$PLIST_RENDERER" ] || fail "plist 생성기를 찾을 수 없습니다: $PLIST_RENDERER"

if [ -z "$NODE_BIN" ]; then
  NODE_BIN="$(command -v node || true)"
  [ -n "$NODE_BIN" ] || fail "node를 찾을 수 없습니다 · --node <path>로 지정하세요"
fi
[ -x "$NODE_BIN" ] || fail "node 실행 파일이 아닙니다: $NODE_BIN"
if [ -z "$TOKEN_FILE" ]; then
  TOKEN_FILE="$PROJECT_DIR/.jaystudio/helper-token"
fi
if [ -z "$LOG_FILE" ]; then
  LOG_FILE="$HOME/Library/Logs/$LABEL.log"
fi

PLIST_PATH="$LAUNCH_AGENTS_DIR/$LABEL.plist"
SERVICE_TARGET="gui/$(id -u)/$LABEL"

PLIST_CONTENT="$("$NODE_BIN" "$PLIST_RENDERER" \
  --label "$LABEL" \
  --node "$NODE_BIN" \
  --script "$SCRIPT_PATH" \
  --project-dir "$PROJECT_DIR" \
  --allowed-origins "$ALLOWED_ORIGINS" \
  --port "$PORT" \
  --token-file "$TOKEN_FILE" \
  --log-file "$LOG_FILE")"

if [ "$DRY_RUN" = "true" ]; then
  {
    echo "DRY-RUN 아무것도 바꾸지 않습니다"
    echo "DRY-RUN plist 경로: $PLIST_PATH"
    echo "DRY-RUN 로그 파일: $LOG_FILE"
    echo "DRY-RUN 실행할 명령: launchctl bootout $SERVICE_TARGET (이미 등록된 경우)"
    echo "DRY-RUN 실행할 명령: launchctl bootstrap gui/$(id -u) $PLIST_PATH"
  } >&2
  printf '%s\n' "$PLIST_CONTENT"
  exit 0
fi

mkdir -p "$LAUNCH_AGENTS_DIR"
mkdir -p "$(dirname "$LOG_FILE")"
printf '%s\n' "$PLIST_CONTENT" > "$PLIST_PATH"
chmod 644 "$PLIST_PATH"

if launchctl print "$SERVICE_TARGET" >/dev/null 2>&1; then
  launchctl bootout "$SERVICE_TARGET"
fi
launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"

echo "설치 완료: $PLIST_PATH"
echo "확인: curl -s -H 'Origin: ${ALLOWED_ORIGINS%%,*}' http://127.0.0.1:$PORT/health"

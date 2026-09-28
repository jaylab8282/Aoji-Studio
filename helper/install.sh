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
  등록 후 /health가 응답하는지 확인하고, 응답이 없으면 등록을 해제하고 실패한다.
  환경 변수 JAYSTUDIO_LAUNCH_AGENTS_DIR로 LaunchAgents 폴더를 바꿀 수 있다(기본 ~/Library/LaunchAgents).
  환경 변수 JAYSTUDIO_HEALTH_TIMEOUT_SECONDS로 기동 확인 대기 시간을 바꿀 수 있다(기본 10초, 1~120).
USAGE
}

fail() {
  echo "install.sh: $1" >&2
  exit 1
}

# launchd Label 화이트리스트. 슬래시·상위 경로·공백·선두 하이픈을 막아
# plist 경로($LAUNCH_AGENTS_DIR/$LABEL.plist)가 인자로 조작되지 않게 한다(경로 처리 보안).
LABEL_PATTERN='^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'

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
# plist를 만들거나 launchctl을 부르기 전에 Label을 검증한다.
[[ "$LABEL" =~ $LABEL_PATTERN ]] || fail "--label 값이 올바르지 않습니다 (영숫자로 시작하고 영숫자·점·밑줄·하이픈 1~64자): $LABEL"
HEALTH_TIMEOUT="${JAYSTUDIO_HEALTH_TIMEOUT_SECONDS:-10}"
case "$HEALTH_TIMEOUT" in
  ''|*[!0-9]*) fail "JAYSTUDIO_HEALTH_TIMEOUT_SECONDS 값이 초 단위 숫자가 아닙니다: $HEALTH_TIMEOUT" ;;
esac
[ "$HEALTH_TIMEOUT" -ge 1 ] && [ "$HEALTH_TIMEOUT" -le 120 ] \
  || fail "JAYSTUDIO_HEALTH_TIMEOUT_SECONDS 값은 1~120이어야 합니다: $HEALTH_TIMEOUT"
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
    echo "DRY-RUN 기동 확인: curl -s -H 'Origin: ${ALLOWED_ORIGINS%%,*}' http://127.0.0.1:$PORT/health (최대 ${HEALTH_TIMEOUT}초)"
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

# 등록만으로는 기동 성공을 알 수 없다(KeepAlive true라 잘못된 인자면 조용히 재시작만 반복한다).
# /health가 응답할 때까지 짧게 폴링하고, 응답이 없으면 등록을 해제하고 실패한다(NFR-05).
HEALTH_ORIGIN="${ALLOWED_ORIGINS%%,*}"
HEALTH_URL="http://127.0.0.1:$PORT/health"
HEALTH_OK="false"
HEALTH_ATTEMPTS=$((HEALTH_TIMEOUT * 4))
echo "기동 확인 중: $HEALTH_URL (최대 ${HEALTH_TIMEOUT}초)"
for _ in $(seq 1 "$HEALTH_ATTEMPTS"); do
  if curl -fsS -m 2 -H "Origin: $HEALTH_ORIGIN" "$HEALTH_URL" 2>/dev/null | grep -q '"ok":true'; then
    HEALTH_OK="true"
    break
  fi
  sleep 0.25
done

if [ "$HEALTH_OK" != "true" ]; then
  {
    echo "install.sh: 도우미가 기동하지 않았습니다 — ${HEALTH_TIMEOUT}초 동안 $HEALTH_URL 무응답"
    echo "install.sh: 재시작 루프를 멈추려고 등록을 해제했습니다: launchctl bootout $SERVICE_TARGET"
    echo "install.sh: 기동 실패 원인은 로그에 있습니다: $LOG_FILE"
  } >&2
  launchctl bootout "$SERVICE_TARGET" >/dev/null 2>&1 || true
  if [ -s "$LOG_FILE" ]; then
    echo "install.sh: --- 로그 마지막 5줄 ---" >&2
    tail -5 "$LOG_FILE" >&2 || true
  fi
  echo "install.sh: plist는 진단용으로 남겼습니다. 인자를 고쳐 다시 설치하거나 ./uninstall.sh로 제거하세요: $PLIST_PATH" >&2
  exit 1
fi

echo "설치 완료: $PLIST_PATH"
echo "기동 확인 완료: $HEALTH_URL"
echo "확인: curl -s -H 'Origin: $HEALTH_ORIGIN' $HEALTH_URL"

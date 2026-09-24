#!/bin/bash
# 열기 도우미 launchd LaunchAgent 제거 (FR-013)
# --dry-run이면 아무것도 바꾸지 않고 실행할 명령만 stdout에 적는다.
set -euo pipefail

LABEL="com.jaystudio.helper"
DRY_RUN="false"
LAUNCH_AGENTS_DIR="${JAYSTUDIO_LAUNCH_AGENTS_DIR:-$HOME/Library/LaunchAgents}"

usage() {
  cat <<'USAGE'
usage: ./uninstall.sh [--label <launchd label>] [--dry-run]

  --dry-run  아무것도 바꾸지 않는다. 실행할 명령과 지울 파일 경로만 적는다.
  환경 변수 JAYSTUDIO_LAUNCH_AGENTS_DIR로 LaunchAgents 폴더를 바꿀 수 있다(기본 ~/Library/LaunchAgents).
USAGE
}

fail() {
  echo "uninstall.sh: $1" >&2
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --label) [ $# -ge 2 ] || fail "$1 값이 필요합니다"; LABEL="$2"; shift 2 ;;
    --dry-run) DRY_RUN="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; fail "알 수 없는 인자입니다: $1" ;;
  esac
done

PLIST_PATH="$LAUNCH_AGENTS_DIR/$LABEL.plist"
SERVICE_TARGET="gui/$(id -u)/$LABEL"

if [ "$DRY_RUN" = "true" ]; then
  echo "DRY-RUN 아무것도 바꾸지 않습니다"
  echo "DRY-RUN 실행할 명령: launchctl bootout $SERVICE_TARGET"
  echo "DRY-RUN 지울 파일: $PLIST_PATH"
  exit 0
fi

if launchctl print "$SERVICE_TARGET" >/dev/null 2>&1; then
  launchctl bootout "$SERVICE_TARGET"
fi
if [ -f "$PLIST_PATH" ]; then
  rm -f "$PLIST_PATH"
  echo "제거 완료: $PLIST_PATH"
else
  echo "등록된 plist가 없습니다: $PLIST_PATH"
fi
echo "도우미 토큰 파일(.jaystudio/helper-token)은 지우지 않습니다"

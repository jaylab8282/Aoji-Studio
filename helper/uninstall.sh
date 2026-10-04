#!/bin/bash
# 열기 도우미 launchd LaunchAgent 제거 (FR-013)
# --dry-run이면 아무것도 바꾸지 않고 실행할 명령만 stdout에 적는다.
set -euo pipefail

LABEL="com.aojistudio.helper"
LEGACY_LABEL="com.jaystudio.helper" # LEGACY v1.0.x
LEGACY_ENV_LAUNCH_AGENTS_DIR="JAYSTUDIO_LAUNCH_AGENTS_DIR" # LEGACY v1.0.x
DRY_RUN="false"

legacy_warn() {
  echo "uninstall.sh: [legacy] $1 · $2 · $3 · v1.1.0에서 제거됩니다" >&2
}

# 옛 환경 변수 폴백(ADR-57, v1.0.x). 새 이름이 우선이고 빈 문자열은 미설정이다. 경고에는 이름만 쓴다(NFR-08).
LEGACY_ENV_VALUE="${!LEGACY_ENV_LAUNCH_AGENTS_DIR:-}"
if [ -n "${AOJISTUDIO_LAUNCH_AGENTS_DIR:-}" ]; then
  LAUNCH_AGENTS_DIR="$AOJISTUDIO_LAUNCH_AGENTS_DIR"
  if [ -n "$LEGACY_ENV_VALUE" ]; then
    legacy_warn env "$LEGACY_ENV_LAUNCH_AGENTS_DIR 무시(AOJISTUDIO_LAUNCH_AGENTS_DIR 우선)" "${LEGACY_ENV_LAUNCH_AGENTS_DIR}을 지우세요"
  fi
elif [ -n "$LEGACY_ENV_VALUE" ]; then
  LAUNCH_AGENTS_DIR="$LEGACY_ENV_VALUE"
  legacy_warn env "$LEGACY_ENV_LAUNCH_AGENTS_DIR 사용 중" "AOJISTUDIO_LAUNCH_AGENTS_DIR로 바꾸세요"
else
  LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
fi

usage() {
  cat <<'USAGE'
usage: ./uninstall.sh [--label <launchd label>] [--dry-run]

  --dry-run  아무것도 바꾸지 않는다. 실행할 명령과 지울 파일 경로만 적는다.
  옛 도우미는 --label로 옛 Label을 지정해 제거한다(옛 Label은 install.sh가 안내한다).
  환경 변수 AOJISTUDIO_LAUNCH_AGENTS_DIR로 LaunchAgents 폴더를 바꿀 수 있다(기본 ~/Library/LaunchAgents).
USAGE
}

fail() {
  echo "uninstall.sh: $1" >&2
  exit 1
}

# launchd Label 화이트리스트. 슬래시·상위 경로·공백·선두 하이픈을 막아
# 아래 rm -f 경로가 인자로 조작되지 않게 한다(경로 처리 보안).
LABEL_PATTERN='^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'

while [ $# -gt 0 ]; do
  case "$1" in
    --label) [ $# -ge 2 ] || fail "$1 값이 필요합니다"; LABEL="$2"; shift 2 ;;
    --dry-run) DRY_RUN="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; fail "알 수 없는 인자입니다: $1" ;;
  esac
done

# 무엇도 지우거나 멈추기 전에 Label을 검증한다.
[[ "$LABEL" =~ $LABEL_PATTERN ]] || fail "--label 값이 올바르지 않습니다 (영숫자로 시작하고 영숫자·점·밑줄·하이픈 1~64자): $LABEL"

PLIST_PATH="$LAUNCH_AGENTS_DIR/$LABEL.plist"
SERVICE_TARGET="gui/$(id -u)/$LABEL"

# 새 Label을 지우는 동안 옛 plist가 남아 있으면 제거 명령을 안내한다(자동으로 지우지 않는다 — ADR-57 7).
LEGACY_PLIST_PATH="$LAUNCH_AGENTS_DIR/$LEGACY_LABEL.plist"
warn_legacy_plist_left() {
  if [ "$LABEL" != "$LEGACY_LABEL" ] && { [ -e "$LEGACY_PLIST_PATH" ] || [ -L "$LEGACY_PLIST_PATH" ]; }; then
    legacy_warn launchd-label "$LEGACY_LABEL plist 남아 있음" "./uninstall.sh --label $LEGACY_LABEL 로 제거하세요"
  fi
}

if [ "$DRY_RUN" = "true" ]; then
  echo "DRY-RUN 아무것도 바꾸지 않습니다"
  echo "DRY-RUN 실행할 명령: launchctl bootout $SERVICE_TARGET"
  echo "DRY-RUN 지울 파일: $PLIST_PATH"
  warn_legacy_plist_left
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
warn_legacy_plist_left
echo "도우미 토큰 파일(.aojistudio/helper-token)은 지우지 않습니다"

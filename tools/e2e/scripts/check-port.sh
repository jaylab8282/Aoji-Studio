#!/usr/bin/env bash
# NFR-04 확인: `docker compose port`가 127.0.0.1: 로 시작하는지 검사한다 (E2E-14, architecture.md ADR-05).
# 사용법: check-port.sh [compose 파일] [서비스명] [컨테이너 포트]
# 인자를 주지 않으면 운영 compose.yaml / jaystudio 서비스 / 4180 포트를 검사한다.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

COMPOSE_FILE="${1:-$REPO_ROOT/compose.yaml}"
SERVICE="${2:-jaystudio}"
CONTAINER_PORT="${3:-4180}"

RESULT="$(docker compose -f "$COMPOSE_FILE" port "$SERVICE" "$CONTAINER_PORT")"

echo "docker compose port 결과: $RESULT"

if [[ "$RESULT" != 127.0.0.1:* ]]; then
  echo "FAIL: 127.0.0.1: 로 시작하지 않습니다 (NFR-04 위반)" >&2
  exit 1
fi

echo "PASS: 127.0.0.1에만 바인딩됨"

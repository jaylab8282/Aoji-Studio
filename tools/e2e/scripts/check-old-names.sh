#!/usr/bin/env bash
# NFR-13 ⑤ 확인(ADR-62): 옛 앱 이름이 검사 대상 경로에 0건인지 본다.
# 사용법: check-old-names.sh [검사 루트]   (기본 = 저장소 루트)
# 패턴 글자는 문자 클래스로만 쓴다 — 이 스크립트 자신이 검색에 걸리지 않게 하기 위함이다.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${1:-$SCRIPT_DIR/../../..}" && pwd)"
cd "$ROOT"

# 검색 대상(ADR-62). 없는 항목은 건너뛴다.
CANDIDATES=(backend frontend helper tools compose.yaml Dockerfile .env.example)
TARGETS=()
for t in "${CANDIDATES[@]}"; do
  if [ -e "$t" ]; then TARGETS+=("$t"); fi
done
if [ ${#TARGETS[@]} -eq 0 ]; then
  echo "FAIL check-old-names: 검사 대상이 없습니다 ($ROOT)" >&2
  exit 2
fi

# 예외 경로(ADR-62 전수 5개)
EXC_PREFIX=(
  "backend/src/test/java/studio/aoji/oldname/"
  "helper/test/old-name.test.mjs"
  "tools/e2e/tests/e2e-17-old-name.spec.ts"
  "tools/e2e/scripts/check-old-env.sh"
  "tools/fixtures/project-old-name/"
)
# grep 출력 줄(경로:줄번호:내용)과 find 출력(경로) 양쪽에서 쓰는 제외 정규식
EXC_RE="^($(printf '%s|' "${EXC_PREFIX[@]}" | sed 's/|$//; s/\./\\./g'))"

EXCLUDE_DIRS=(node_modules build dist .gradle .git test-results playwright-report screenshots)
GREP_EX=()
FIND_PRUNE=()
for d in "${EXCLUDE_DIRS[@]}"; do
  GREP_EX+=("--exclude-dir=$d")
  FIND_PRUNE+=(-name "$d" -o)
done

FOUND=0

# 내용 검사
set +e
CONTENT="$(grep -rIinE "${GREP_EX[@]}" '(j[a]ystudio|studio[.]j[a]y|l[e]gacy)' "${TARGETS[@]}" | grep -vE "$EXC_RE")"
set -e
if [ -n "$CONTENT" ]; then
  echo "== 내용에 옛 이름 =="
  echo "$CONTENT"
  FOUND=1
fi

# 파일·폴더 이름 검사
NAMES="$(find "${TARGETS[@]}" \( "${FIND_PRUNE[@]}" -false \) -prune -o \
  \( -iname '*j[a]ystudio*' -o -iname '*l[e]gacy*' -o -path '*studio/j[a]y*' \) -print | grep -vE "$EXC_RE" || true)"
if [ -n "$NAMES" ]; then
  echo "== 이름에 옛 이름 =="
  echo "$NAMES"
  FOUND=1
fi

if [ "$FOUND" -ne 0 ]; then
  echo "FAIL check-old-names" >&2
  exit 1
fi
echo "PASS check-old-names"

#!/usr/bin/env bash
# 운영 compose.yaml의 실제 빌드·기동 확인 (ADR-59, D-109, conventions §6).
# `name:` 고정 볼륨은 `-p`로 격리되지 않으므로 확인 전용 override로 볼륨 이름을 덮어쓴다.
# 사용법: [AOJISTUDIO_PLATFORM=linux/amd64] check-compose-build.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$REPO_ROOT"

PROJECT=aojistudio-r2check
PORT=4186
VOL=aojistudio-r2check-data
VOL_PREFIX=aojistudio-r2check-

fail() { echo "FAIL: $*" >&2; exit 1; }

# 호스트 환경이 섞이지 않게 옛 이름·새 이름을 비운다(플랫폼은 그대로 넘긴다).
unset JAYSTUDIO_HOST_PATH JAYSTUDIO_PORT JAYSTUDIO_PLATFORM JAYSTUDIO_HELPER_URL AOJISTUDIO_HELPER_URL # LEGACY v1.0.x

# 삭제 가드: 테스트 접두 볼륨만 지운다. 운영 이름은 거부한다.
rm_test_volume() {
  local name="$1"
  [[ "$name" == "$VOL_PREFIX"* ]] || { echo "FAIL: 테스트 접두($VOL_PREFIX)가 아니라 삭제를 거부합니다: $name" >&2; return 1; }
  [[ "$name" != "aojistudio-data" && "$name" != *jaystudio-data ]] || { echo "FAIL: 운영 볼륨 삭제를 거부합니다: $name" >&2; return 1; } # LEGACY v1.0.x
  if docker volume inspect "$name" > /dev/null 2>&1; then
    docker volume rm "$name" > /dev/null
    echo "정리: 볼륨 $name 삭제"
  fi
}

# 운영 볼륨 스냅숏: "이름=CreatedAt" 줄 목록(없으면 빈 결과).
prod_snapshot() {
  local n
  while IFS= read -r n; do
    if [[ "$n" == "aojistudio-data" || "$n" == *jaystudio-data ]]; then # LEGACY v1.0.x
      echo "$n=$(docker volume inspect --format '{{.CreatedAt}}' "$n")"
    fi
  done < <(docker volume ls --format '{{.Name}}' | sort)
}

# 2. 사전 스냅숏과 잔여물 검사
BEFORE="$(prod_snapshot)"
echo "운영 볼륨 스냅숏(실행 전): ${BEFORE:-없음}"
if docker volume inspect "$VOL" > /dev/null 2>&1; then
  fail "잔여 볼륨이 있습니다. 확인 후 직접 정리하세요: docker volume rm $VOL"
fi
if [[ -n "$(docker ps -a --filter "label=com.docker.compose.project=$PROJECT" --format '{{.Names}}')" ]]; then
  fail "잔여 컨테이너가 있습니다. 확인 후 직접 정리하세요: docker compose -p $PROJECT down --remove-orphans"
fi

# 3. 임시 폴더·fixture 복사·override
TMP="$(mktemp -d)"
C=()
cleanup() {
  local rc=$?
  set +e
  if [[ ${#C[@]} -gt 0 ]]; then
    "${C[@]}" down --remove-orphans > /dev/null 2>&1
  fi
  rm_test_volume "$VOL" || rc=1
  rm -rf "$TMP"
  echo "정리: 컨테이너(프로젝트 $PROJECT)·임시 폴더 $TMP 삭제"
  [[ "$rc" -ne 0 ]] || echo "PASS check-compose-build"
  exit "$rc"
}
trap cleanup EXIT

cp -r "$REPO_ROOT/tools/fixtures/project-configured" "$TMP/mount"
chmod -R a+rwX "$TMP/mount"
cat > "$TMP/override.yaml" <<YAML
volumes:
  aojistudio-data:
    name: $VOL
YAML

# 4. 공통 인자·환경
export AOJISTUDIO_HOST_PATH="$TMP/mount"
export AOJISTUDIO_PORT="$PORT"
C=(docker compose -p "$PROJECT" -f "$REPO_ROOT/compose.yaml" -f "$TMP/override.yaml")

# 5. 기동 전 볼륨 이름 검사
CONFIG_NAME="$("${C[@]}" config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin)["volumes"]["aojistudio-data"]["name"])')"
[[ "$CONFIG_NAME" == "$VOL_PREFIX"* ]] || fail "config의 볼륨 이름이 $VOL_PREFIX 접두가 아닙니다: $CONFIG_NAME (기동하지 않음)"
echo "PASS: config 볼륨 이름 $CONFIG_NAME"

# 6. 기동·curl·port
"${C[@]}" up -d --build
CODE=000
for _ in $(seq 1 60); do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" || true)"
  [[ "$CODE" == "200" ]] && break
  sleep 1
done
[[ "$CODE" == "200" ]] || fail "GET / 응답 코드가 200이 아닙니다: $CODE"
echo "PASS: GET / 200"
PORT_OUT="$("${C[@]}" port aojistudio 4180)"
[[ "$PORT_OUT" == "127.0.0.1:$PORT" ]] || fail "port 출력이 127.0.0.1:$PORT 가 아닙니다: $PORT_OUT"
echo "PASS: port $PORT_OUT"

# 7·8. 정리(trap) 전에 내려서 정리 뒤 단언한다.
"${C[@]}" down --remove-orphans
rm_test_volume "$VOL"
AFTER="$(prod_snapshot)"
[[ "$BEFORE" == "$AFTER" ]] || fail "운영 볼륨 존재·CreatedAt이 달라졌습니다. 전: ${BEFORE:-없음} / 후: ${AFTER:-없음}"
echo "PASS: 운영 볼륨 불변(${AFTER:-없음})"
LEFT="$(docker volume ls --format '{{.Name}}' | grep -c "^$VOL_PREFIX" || true)"
[[ "$LEFT" == "0" ]] || fail "$VOL_PREFIX 볼륨이 $LEFT개 남아 있습니다"
echo "PASS: $VOL_PREFIX 볼륨 0개"

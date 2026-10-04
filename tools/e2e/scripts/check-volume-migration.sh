#!/usr/bin/env bash
# ADR-59 확인: 이벤트 볼륨 이관 명령 형식을 테스트 전용 임시 볼륨 두 개로 실행한다.
#   docker run --rm --user 1000:1000 -v <옛 볼륨>:/from:ro -v <새 볼륨>:/data --entrypoint cp <이미지> -a /from/. /data/
# 이름이 `aojistudio-r2test-` 로 시작하는 볼륨만 만들고 지운다. 운영 볼륨 이름은 거부한다.
# 사용법: IMAGE=aojistudio:local check-volume-migration.sh   (이미지가 먼저 빌드되어 있어야 한다)
set -euo pipefail

IMAGE="${IMAGE:-aojistudio:local}"
PREFIX="aojistudio-r2test-"
SUFFIX="$$-$(date +%s)"
OLD_VOL="${PREFIX}old-${SUFFIX}"
NEW_VOL="${PREFIX}new-${SUFFIX}"

fail() { echo "FAIL: $*" >&2; exit 1; }

# 운영 볼륨 보호: 접두가 맞지 않거나 운영 이름이면 어떤 docker 명령도 실행하지 않는다.
guard() {
  local name="$1"
  [[ "$name" == "$PREFIX"* ]] || fail "임시 볼륨 접두($PREFIX)가 아닙니다: $name"
  [[ "$name" != "aojistudio-data" && "$name" != *jaystudio-data ]] || fail "운영 볼륨 이름은 거부합니다: $name" # LEGACY v1.0.x
}
guard "$OLD_VOL"
guard "$NEW_VOL"

docker image inspect "$IMAGE" > /dev/null 2>&1 || fail "이미지가 없습니다: $IMAGE (먼저 docker compose build)"

cleanup() {
  for v in "$OLD_VOL" "$NEW_VOL"; do
    guard "$v"
    docker volume rm -f "$v" > /dev/null 2>&1 || true
  done
}
trap cleanup EXIT

# 옛 볼륨에 events.db 준비(옛 컨테이너가 쓴 것처럼 1000 소유 파일).
# 이미지의 /data(소유 1000)에 붙여 쓰기 가능하게 한다.
docker volume create "$OLD_VOL" > /dev/null
docker volume create "$NEW_VOL" > /dev/null
docker run --rm --user 1000:1000 -v "$OLD_VOL":/data --entrypoint sh "$IMAGE" \
  -c 'printf "r2test-events" > /data/events.db && printf "wal" > /data/events.db-wal'

# ADR-59 ③ 이관 명령 형식
docker run --rm --user 1000:1000 -v "$OLD_VOL":/from:ro -v "$NEW_VOL":/data \
  --entrypoint cp "$IMAGE" -a /from/. /data/

RESULT="$(docker run --rm --user 1000:1000 -v "$NEW_VOL":/data:ro --entrypoint sh "$IMAGE" \
  -c 'stat -c "%u:%g" /data/events.db; cat /data/events.db')"
OWNER="$(head -n1 <<<"$RESULT")"
CONTENT="$(tail -n +2 <<<"$RESULT")"

[[ "$CONTENT" == "r2test-events" ]] || fail "events.db 내용이 복사되지 않았습니다: $CONTENT"
[[ "$OWNER" == "1000:1000" ]] || fail "events.db 소유가 1000:1000이 아닙니다: $OWNER"
echo "PASS: events.db 복사됨, 소유 $OWNER"

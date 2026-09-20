# Jay Studio — Realtime Spec (SSE)

- 전송: Spring MVC `SseEmitter`, `GET /api/stream?token=<브라우저 토큰>` (`text/event-stream`)
- 인증: Origin 규칙 + 쿼리 토큰(architecture.md §5). 실패 시 HTTP 403 후 연결 종료.
- 스키마: `Snapshot`, `Registry`, `Live`, `EventRow`는 `api-spec.yaml` components와 동일하다. 여기서는 메시지 종류·순서·재연결만 정한다.
- 관련 FR: FR-001-AC3, FR-004-AC6, FR-016, NFR-01, NFR-02

## 1. 메시지 형식

```text
event: <type>
id: <seq>
data: <JSON 한 줄>

```

- `seq`: 서버 수명 내 단조 증가 정수(방송마다 +1). 재전송·`Last-Event-ID` 처리는 없다(ADR-03).
- `data`는 한 줄 JSON(개행 없음).

## 2. 메시지 종류

| type | data | 보내는 시점 |
|---|---|---|
| `snapshot` | `Snapshot` (`api-spec` 참조: `serverTime`, `config`, `registry`, `live`, `recentEvents[≤50]`) | 연결 직후 1회. 프론트는 이 메시지를 받으면 스토어 전체를 교체하고 04-2 스켈레톤을 끝낸다 |
| `registry` | `Registry` | 폴링·`다시 읽기`·변경 API로 registry `revision`이 바뀔 때. 전체 교체 |
| `live` | `Live` | hook 이벤트 1건 처리 후(상태·`lastReceivedAt`·`lastEvent` 변화). registry가 바뀌어 로비 구성이 달라질 때도 함께 방송. 전체 교체 |
| `event` | `EventRow` | 저장된 hook 이벤트 1건마다. 프론트는 `recentEvents` 맨 앞에 넣고 50개를 넘으면 뒤를 버린다. 03의 선택 패널은 `agentType == 선택 에이전트`인 행을 최근 이벤트 앞에 넣고 10개로 자른다 |
| `heartbeat` | `{"serverTime": "<ISO>"}` | 15초마다. 다른 메시지를 보냈어도 15초마다 보낸다 |

### 순서 보장
- 한 hook 요청에 대해 `event` → `live` 순서로 보낸다(행이 먼저, 상태가 나중). 프론트는 두 메시지를 독립적으로 반영하므로 순서에 의존하는 로직을 두지 않는다.
- registry 변경 시 `registry` → `live` 순서.
- 같은 연결 안에서 `seq`는 항상 증가한다. 프론트는 `seq`가 이전보다 작거나 같은 메시지를 무시한다(중복 방어).

### 크기 상한
- `snapshot`은 에이전트 100·워크플로우 30·이벤트 50 기준 수십 KB. 별도 압축 없음.

## 3. 연결 수명

```text
연결 → 200 text/event-stream → snapshot → (registry|live|event|heartbeat)* → 끊김
```

- 서버는 emitter timeout 0(무제한). 연결당 `SseEmitter` 1개, 탭 5개 = 5개 연결(NFR-01). 방송은 모든 emitter에 순서대로 `send`. 한 emitter가 실패하면 그 emitter만 제거한다.
- 서버 종료 시 모든 emitter를 `complete()`한다.

## 4. 프론트 재연결 (FR-016)

프론트는 `EventSource`의 자동 재연결을 쓰지 않는다. `stream.ts`가 아래 상태 기계를 구현한다.

```text
connecting ──open + snapshot──▶ connected ──error | heartbeat 45s 무수신──▶ disconnected(countdown=N)
     ▲                                                                            │
     └───────────── countdown 0 또는 `지금 재연결` ───────────────────────────────┘
```

| 항목 | 규칙 |
|---|---|
| 끊김 판정 | `EventSource.onerror` 또는 마지막 메시지(heartbeat 포함) 후 45초 무수신 |
| 끊김 처리 | 즉시 `es.close()`. `connectionStore` = `{ state: 'disconnected', retryInSec: N, lastUpdatedAt }`. 화면은 마지막 스냅샷 유지(FR-016-AC2) |
| 백오프 | N = 5 → 10 → 20 → 30 → 30 … (두 배, 최대 30). 재연결 성공(`snapshot` 수신)하면 5로 리셋(FR-016-AC3) |
| 카운트다운 | 1초마다 `retryInSec` 감소. 배너 문구 `실시간 연결이 끊겼습니다 · N초 후 재연결` |
| `지금 재연결` | 타이머 취소, 즉시 `connecting` |
| 재연결 성공 | `snapshot`으로 스토어 전체 교체 → 배너 제거(FR-016-AC4). 03이 열려 있으면 선택 에이전트의 `GET /api/agents/{name}/events`를 다시 호출 |
| 토큰 만료 | 연결 시도가 HTTP 403이면(`EventSource`는 상태 코드를 주지 않으므로 `onerror` 후 `GET /api/auth/browser-token`을 1회 호출해 토큰을 갱신하고 다음 시도에 사용) |
| 첫 연결 실패 | 스냅샷을 한 번도 못 받았으면 `GET /api/state`를 병행 시도해 첫 화면을 채우고, 그래도 실패면 04-2 스켈레톤 + 04-3 배너 |

## 5. 프론트 반영 규칙

| 메시지 | 스토어 반영 |
|---|---|
| `snapshot` | `snapshotStore.replace(data)` |
| `registry` | `snapshotStore.setRegistry(data)` |
| `live` | `snapshotStore.setLive(data)` |
| `event` | `snapshotStore.prependEvent(data)` (50개 상한). `agentEventsStore.prependIfMatches(data)` (선택 에이전트, 10개 상한) |
| `heartbeat` | `connectionStore.touch(serverTime)` |

- `lastUpdatedAt`(04-3 "마지막 갱신 시각")은 `snapshot`·`registry`·`live`·`event`를 받은 마지막 시각이다.
- 화면은 스토어만 구독한다. SSE 메시지를 컴포넌트에서 직접 처리하지 않는다.

## 6. 예시

```text
event: snapshot
id: 1
data: {"serverTime":"2026-09-20T13:45:12.345+09:00","config":{"hostPath":"/Users/jaybee/Desktop/JayStudio","publicOrigin":"http://127.0.0.1:4180","collectUrl":"http://127.0.0.1:4180/hooks/events","helperUrl":"http://127.0.0.1:4181","defaultSessionCommand":"cd \"/Users/jaybee/Desktop/JayStudio\" && claude"},"registry":{...},"live":{...},"recentEvents":[...]}

event: event
id: 2
data: {"id":1201,"at":"2026-09-20T13:45:20.001+09:00","hookEventName":"PreToolUse","kind":"tool","title":"도구 실행 · Edit","summary":"Jay_Studio/backend/src/main/java/studio/jay/api/AgentController.java","sessionId":"s-1","agentId":"a-9","agentType":"architect","agentLabel":"architect","toolName":"Edit","workflow":"개발부서"}

event: live
id: 3
data: {"lastReceivedAt":"2026-09-20T13:45:20.001+09:00","everReceived":true,"agents":{"architect":{"name":"architect","status":"running","currentTool":{"name":"Edit","target":"Jay_Studio/backend/.../AgentController.java"},"sessionStartedAt":"2026-09-20T13:44:00+09:00","childCount":0,"cwd":"/Users/jaybee/Desktop/JayStudio","parentLabel":"develop-tech-lead","lastEventAt":"2026-09-20T13:45:20.001+09:00","lastEvent":{...}}},"lobby":[],"undefinedSubagents":[]}

event: heartbeat
id: 4
data: {"serverTime":"2026-09-20T13:45:27.000+09:00"}
```

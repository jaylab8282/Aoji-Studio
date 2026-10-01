# T-FIX-13 리뷰 — 도우미 `readBody` promise 주석 (A-24 4②, ADR-50 D2)

- VERDICT: **PASS** (Round 2, fix 1회) — Round 1은 NEEDS_FIX
- SCOPE: task
- 날짜: 2026-10-01
- Round 1: Blocker 0 / **Major 1** / Minor 0 — 주석이 코드와 달랐다(원인 = ADR-50 D2 전제)
- Round 2: Blocker 0 / Major 0 / **Minor 1** / Suggestion 0 / NEEDS CONFIRMATION 0 — Minor는 팀장이 같은 라운드에서 닫았다(§6)

## 0. 결론 요약

**이 태스크의 유일한 산출물(주석 4줄)이 코드의 실제 동작과 다르다.** 개발자는 T-FIX-13 지시를
충실히 주석으로 옮겼을 뿐이고, **오류의 근원은 ADR-50 D2 자체의 코드 이해**다. 따라서
코드 수정이 아니라 **설계 문서 정정이 선행**해야 한다(팀장 → architect, 2026-10-01).

ADR-50에서 **두 번째** 사실관계 오류다. 첫 번째는 A의 정량 근거(실제 Playwright 상수와 어긋남,
D-087) → **A-25**로 이미 분리돼 있다.

## 1. Done when 판정

| 항목 | 판정 | 근거 |
|---|---|---|
| ① `git diff`가 주석 줄만 | **충족** | `helper/jaystudio-helper.mjs` +4/−0, 추가 4줄 전부 `//`. 실행 코드·문자열·상수·공백 정렬 변경 0건 (팀장이 `git diff -U0`에서 비주석 추가·삭제 줄 0건으로 독립 확인) |
| ② `cd helper && npm test` 40 유지 | **충족** | 40 pass / 0 fail / 0 skip. 삭제·skip·약화 0건. `node --check` OK (팀장·리뷰어 각각 실측) |
| ③ 주석이 "promise를 버린다"와 그 이유를 적는다 | **불충족 — Major** | 아래 §2 |

## 2. [Major] 주석이 코드와 다르다

위치: `helper/jaystudio-helper.mjs:284-287`(실행문 `request.destroy()`는 288줄).

추가된 주석의 두 주장:
1. "`destroy()` 이후 `'end'`·`'error'`가 `!tooLarge` 가드에 막혀 이 promise는 resolve·reject 어느 쪽도 되지 않고 **버려진다**(의도적 pending)"
2. "소켓을 이미 끊었으므로 **응답을 보내지 않으며**, api-spec `/open`에도 이 경로(>1MiB)의 응답이 정의돼 있지 않다"

**둘 다 사실이 아니다.** 리뷰어 판정을 팀장이 코드로 독립 재확인했다.

### 2.1 promise는 `destroy()` 시점에 이미 reject로 정착돼 있다

`readBody()`의 `data` 핸들러는 `tooLarge = true`와 `reject(new Error('BODY_TOO_LARGE'))`를
**같은 블록에서 동기적으로 함께** 실행한다(`size > MAX_BODY_BYTES`, `MAX_BODY_BYTES = 4096`).
`destroy()`가 있는 분기는 `if (tooLarge) { … if (size > MAX_DISCARDED_BODY_BYTES) { … } }`이므로
**`tooLarge`가 이미 true인 이후의 `data` 이벤트에서만** 도달한다 → `destroy()` 시점에 promise는
**반드시 이미 rejected**다.

따라서 `'end'`·`'error'`의 `!tooLarge` 가드는 "promise를 버리는" 장치가 아니라
**이미 정착된 promise를 다시 정착시키려는 호출을 막는 방어**다.

### 2.2 400 `INVALID_BODY`는 항상 나가고, 클라이언트가 실제로 받는다

호출부(`/open` 핸들러, 397~403줄 부근)가 그 reject를 `catch`해 `sendError(response, 400, 'INVALID_BODY', …)`를 보낸다.
기존 테스트 `helper/test/helper.test.mjs:372-415`
(`[FR-013-E3][T-FIX-07] 2차 상한(1MiB)을 넘는 본문 → 소켓을 끊는다`)가 >1MiB 시나리오에서
`assert.match(received, /^HTTP\/1\.1 400 /)`·`assert.match(received, /"code":"INVALID_BODY"/)`로
**클라이언트가 그 400을 실제로 받는다**고 단언하며 **현재 통과 중**이다.

→ 이 경로는 api-spec `/open`에 **이미 정의된 400**을 그대로 쓰는 **정상 경로**다.
`destroy()`는 promise 상태와 무관하게 소켓을 오래 붙잡지 않기 위한 **별개의 자원 보호 조치**다.

### 2.3 기존 JSDoc은 원래부터 옳았다

함수 상단 JSDoc("상한을 넘으면 **즉시 거부**하지만 소켓을 끊지 않는다 … 흘려보내는 양이
`MAX_DISCARDED_BODY_BYTES`를 넘으면 **그때** 소켓을 끊는다")은 정확하다.
**새 주석이 그것과 직접 모순된다** — 기존: 이미 즉시 reject됨 / 신규: 어느 쪽도 안 됨.

### 2.4 소급 — 문서가 원인이다

`docs/architecture.md` ADR-50 D 2번과 `docs/tasks.md` `## T-FIX-13`의 `Helper:`·`Done when` ③이
**같은 틀린 전제**를 담고 있다. 개발자는 지시를 그대로 옮겼다.

## 3. 계약·동작 불변 확인

- FR-013 동작 불변 — `[FR-013-E3] 본문 초과 → 400`, `[FR-013-E3][T-FIX-07] 2차 상한(1MiB)` 포함 40개 전부 통과.
- NFR-05 영향 없음. `INVALID_BODY`·`BODY_TOO_LARGE` 계약 불변.
- api-spec `/open` 응답은 `204`/`400`/`403`/`415`/`500` (팀장 직접 열람). 연결 종료 응답은 없다 —
  그 사실 자체는 맞지만 §2.2 때문에 **이 경로에 필요한 전제가 아니다**.
- 신설 AC·E 0건(태스크 정의대로).

## 4. 처분 (팀장)

1. 주석 4줄은 **커밋하지 않는다**(미커밋 상태로 둔다).
2. **architect에 ADR-50 D2 + `docs/tasks.md` T-FIX-13 정의 정정 요청** — 계약 변경 아님,
   요구사항 의미·사용자에게 보이는 동작 불변이므로 팀장 권한(D-091).
   정정된 전제로 (a) 주석을 다시 쓸지 (b) 코드 변경 0건으로 종결할지는 architect 판정.
3. architect 판정 후 (a)면 backend-developer가 주석 재작성 → 재리뷰, (b)면 주석을 되돌리고 종결.
4. ADR-50의 나머지 항목이 같은 종류의 오류를 더 들고 있는지 architect가 함께 점검한다(A는 A-25 소관).

## 5. 리뷰 실행 범위

Docker·Playwright·E2E·프론트엔드·백엔드 테스트는 **실행하지 않았다**(팀장 지시 — 이 태스크는
helper 주석 한 곳이고 다른 트리를 건드리지 않았다). 실행한 것: `git diff`/`git show`,
`cd helper && npm test`, `node --check`, 파일 읽기·grep. 백그라운드 프로세스 0개.

---

# Round 2 (fix 1회 적용분) — PASS

Round 1 Major의 원인이 문서였으므로 architect가 **ADR-50 D2를 전면 재작성**하고 `docs/tasks.md`
T-FIX-13 정의·Done when을 교체했다(`CONTRACT CHANGE: no`, 재판정 **(a)** = 주석은 유지하고 내용만
교체. 수용 근거는 progress.md **D-092**). 그 정정된 전제로 backend-developer가 주석을 다시 썼다.

## 6. Round 2 Done when 판정

| 항목 | 판정 | 근거 |
|---|---|---|
| ① diff가 주석 줄만 | **충족** | `helper/jaystudio-helper.mjs` **+6/−0**, 추가 6줄 전부 `//`. 실행 코드·문자열·상수·공백 정렬 변경 0건(팀장·리뷰어 각각 `git diff -U0`의 비주석 줄 0건으로 확인) |
| ② helper 40 유지 | **충족** | 40 pass / 0 fail / 0 skip·only·todo. `node --check` OK (팀장·리뷰어 각각 실측) |
| ③ 주석 3요건 + 폐기 문구 0건 | **충족** | ① 정착 시점 + 400 `INVALID_BODY` 기발신(`:284-287`) ② `!tooLarge` = 재정착 방어(`:297-298`) ③ `destroy()` = 별개 자원 보호(`:287`). 폐기 문구 5개 **grep 0건**(팀장·리뷰어 각각 확인) |

## 7. Round 1 Major가 실제로 닫혔는지 — 리뷰어 코드 재판정

리뷰어가 문서를 믿지 않고 코드로 다시 판정해 **새 주석이 코드와 일치함**을 확인했다.

- `tooLarge = true`와 `reject(new Error('BODY_TOO_LARGE'))`가 같은 `if (size > MAX_BODY_BYTES)` 블록에서 **동기 실행**(`:290-293`).
- `request.destroy()`(`:287`)는 `tooLarge`가 이미 true인 뒤의 `data`에서만 도달(`:279-287`).
- `/open`(`:398-403`)이 그 reject를 `catch`해 `sendError(response, 400, 'INVALID_BODY', headers)`를 **실제로 호출**하고,
  `helper/test/helper.test.mjs:369` `[FR-013-E3][T-FIX-07] 2차 상한(1MiB)…`이 **raw 소켓 레벨로** 끊기기 **전에**
  `HTTP/1.1 400`·`"code":"INVALID_BODY"`가 수신됨을 단언한다(가장 강한 근거).
- `docs/api-spec.yaml:466` `/open` `"400"`에 `{ code: "INVALID_NAME" | "INVALID_BODY", message }`가 **명시적으로 정의**돼 있다
  → 새 주석의 "api-spec `/open`에 정의된 응답이다"는 참.
- **기존 JSDoc과 모순 없음** — JSDoc의 "api-spec에 **연결 종료**라는 응답이 없다"는 *연결 종료*에 대한 별개 주장이고,
  새 주석은 *400 응답*이 정의돼 있다는 주장이다. 둘은 같은 층위가 아니다.
- 새 주석은 ADR-50 D2 확정 문장과 **사실상 축자 일치**(백틱 차이뿐)이며 그 밖의 내용을 덧붙이지 않았다.

## 8. [Minor] 가드 설명 주석의 적용 범위 — 팀장이 같은 라운드에서 닫았다

- 지적: `!tooLarge` 가드 설명이 `request.on('error')` 바로 위 한 곳에만 있어, 이어지는 `request.on('end')`의
  같은 가드가 설명 없이 남는 것으로 읽힐 소지가 있다. 리뷰어 판정은 "두 핸들러가 공백·중간 코드 없이 붙어 있고
  문구가 패턴 자체를 설명하므로 현재도 허용 가능하되, **같은 코드를 전문가 두 명이 오독한 이력**이 있어
  완전히 모호함이 없다고 단정하기 어렵다 → **Minor, PASS를 막지 않는다**".
- **팀장 처분: 보류하지 않고 닫는다.** 이 태스크의 존재 이유가 바로 그 오독이므로 모호함을 남기지 않는다.
  같은 개발자에게 이어서(맥락 유지) **줄 추가 없이 문구에 `'error'`·`'end'` 두 핸들러를 명시**하도록 지시했다.
  ADR-50 D2가 이 문장을 두라고 지정한 자리가 애초에 "`'error'`·`'end'`의 `!tooLarge` 가드"이므로
  **새 내용 추가가 아니라 지정된 범위를 문구에 드러내는 것**이다. 이 수정은 **3차 리뷰 없이 팀장 검증으로 마감**한다(D-080 선례).

## 9. Round 2 리뷰 실행 범위

Docker·Playwright·E2E·프론트엔드·백엔드 테스트 **미실행**(팀장 지시). 실행한 것:
`git diff`/`git show`, `cd helper && npm test`, `node --check`, 파일 읽기·grep. 백그라운드 프로세스 0개.

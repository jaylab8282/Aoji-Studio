# T-FIX-11 리뷰 — FR-001-AC3 E2E 관측 격자 고정 (A-24 1, ADR-50 A)

- VERDICT: **PASS** (Round 1, fix 0회)
- SCOPE: task
- 날짜: 2026-09-29
- 변경 파일: `tools/e2e/tests/ui-helpers.ts`, `tools/e2e/tests/e2e-04.spec.ts`, `tools/e2e/tests/e2e-07.spec.ts`, `tools/e2e/tests/e2e-11.spec.ts`
  (`tools/e2e/screenshots/*.png` 4장은 E2E-13이 매 실행마다 다시 찍는 산출물)
- 실행: 전체 E2E·배치 5 재실행 안 함(팀장 지시 — 개발자가 106 유지·exit 0 보고, 사용자 결정 E-009 "코드 판정만으로 진행"). 대신 판정에 필요한 **Playwright 1.63.0 동작 2건**만 격리 스크래치 프로젝트에서 실측(브라우저·컨테이너 없음, Node 전용, 부하 0)

## 실측한 2건 (판정 근거)

- `expect.poll(fn, { intervals: [25], timeout: 5000 })`로 137ms 뒤 true가 되는 술어 → **실측 138ms**(관측 오차 ≈1ms). 격자 25ms가 명세대로 동작한다.
- 실패 문구 2종 재현: ① 커스텀 문구가 실패 헤더로 그대로 출력 ② `expect.poll`의 `message`가 헤더가 되고, `error.message`에 덧붙인 줄(실측 ms)도 **list reporter 출력에 남는다**. 리뷰어가 처음 세운 가설("`ExpectError.stack`이 생성 시점에 고정돼 덧붙인 ms가 유실된다")은 실측으로 **기각**됐다.

## TRACEABILITY

- FR-001-AC3 → `measureFileChangeReflection` 호출 **9곳**(e2e-07 ×6, e2e-04 `:665`·`:713`, e2e-11 `:304`) 전부 술어 폴링 + 측정 뒤 동일 matcher 재단언. 측정 지점은 **DOM**(§1)
- FR-004-AC6(파일 측) → e2e-07 6개 테스트 제목의 `[FR-004-AC6]` 태그 불변(grep 바이트 동일)
- FR-004-AC6(hook 측) → `replayStep` 28단계. 이번 변경 대상 아님(범위 밖 B)
- conventions §8 신설 MUST ①~④ → 전부 충족(①②③ 정적 grep, ④ 위 실측)

## 1. 핵심 판정 — FR-001-AC3의 검증력은 약화되지 않았다

갈림길은 "술어가 DOM을 읽는가, 더 이른 지점을 읽는가"였다. **전부 DOM이다. 우회 없음.**

9개 술어 전수: `isVisible()`(e2e-07 t1·t2·t4·t5, e2e-04:668) / `count() === 0`(e2e-07 t3·t6, e2e-04:716) / `allTextContents().some(...)`(e2e-11:307).
`isVisible()`·`count()`·`allTextContents()`는 모두 브라우저의 **살아 있는 DOM**을 조회한다. 네트워크 응답·SSE 프레임·스토어 상태를 보는 술어 **0건**, `page.waitForResponse`·`waitForFunction` 류 **0건**.
→ React 렌더는 예산 2000ms **안에 그대로** 남아 있고, ADR-50 A가 기각한 "측정 분리"를 코드로 우회한 흔적이 없다.

방향성도 보수적이다: `elapsedMs = Date.now() - startedAt`는 술어가 true를 반환한 **뒤**에 찍히므로 항상 실제 반영 시각 ≤ elapsedMs다 → AC가 무르게 되는 방향이 아니다.
부수 확인: 진단 상한 10s는 테스트 timeout 30s 안이고, 한 테스트에서 상한을 태울 수 있는 호출은 첫 실패가 throw하므로 **최대 1회** → 문구가 테스트 타임아웃으로 대체될 위험 없음.

## 2. 단언 수 감소 0건 · 약화 0건

`expect(` 줄 수 old→new: `e2e-04` 171→171 · `e2e-07` 19→19 · `e2e-11` 55→55 · `ui-helpers.ts` **10→9**.
`ui-helpers.ts`의 −1은 단언이 아니다 — 사라진 줄은 doc 주석 한 줄이다. 단언 축으로는 `await expectation(FILE_CHANGE_DEADLINE_MS)` 1줄이 `expect.poll(...).toBe(true)` 1블록으로 **교체**됐고 `expect(elapsedMs).toBeLessThanOrEqual(2000)`은 그대로 → 순증감 0.

호출 9곳 matcher 재삽입 전수:

| 위치 | 기존 콜백 안 단언 | 측정 뒤 재삽입 | 판정 |
|---|---|---|---|
| e2e-07 t1 | `toBeVisible({timeout})` | `toBeVisible()` | 동일 단언 |
| e2e-07 t2 | `toBeVisible({timeout})` | `toBeVisible()` | 동일 단언 |
| e2e-07 t3 | `toHaveCount(0,{timeout})` | `toHaveCount(0)` | 동일 단언 |
| e2e-07 t4 | `toBeVisible({timeout})` | `toBeVisible()` | 동일 단언 |
| e2e-07 t5 | `toBeVisible({timeout})` | `toBeVisible()` | 동일 단언 |
| e2e-07 t6 | `toHaveCount(0,{timeout})` | `toHaveCount(0)` | 동일 단언 |
| e2e-04:665 | `toBeVisible({timeout})` | `toBeVisible()` | 동일 단언 |
| e2e-04:713 | `toHaveCount(0,{timeout})` | `toHaveCount(0)` | 동일 단언 |
| e2e-11:304 | `toContainText(s,{timeout})` | `toContainText(s)` | 동일 단언 |

**약화 아님**의 근거: 술어가 matcher보다 좁을 수 있는 곳(e2e-11의 손수 만든 근사)에서 바로 다음 줄이 **진짜 matcher**로 다시 본다 → 판정 기준은 예전과 동일하고 술어는 "언제"만 잰다. 줄 수 보존이 아니라 **판정력 보존**이 성립한다.

그 밖: 테스트 개수 `e2e-04` 8→8 · `e2e-07` 6→6 · `e2e-11` 5→5. `test.skip`·`test.only`·`.fixme` **0건**. `[FR-001-AC3]` 제목·ID 태그 **바이트 동일**.

## 3. 실패 문구 2종 분리 — 성립한다

- 미반영: `expect.poll(..., { message: "<label>: 10000ms 안에 화면에 반영되지 않았습니다(기능 결함)" })`. Playwright는 `customMessage + "\n\n" + message`로 커스텀 문구를 헤더에 앞세운다(실측 확인). 이어 `error.message`에 덧붙인 `실측 대기 <n>ms (예산 2000ms)`도 리포터 출력에 남는다.
- 초과: `<label> 반영이 2000ms를 넘었습니다(실측 <n>ms)`.
- tasks.md 검출력 ①·②의 판별 문구는 **둘 다 원문 그대로 보존**. 개발자가 보고한 `${label}:` 변경은 조사 어긋남을 피한 접두 차이뿐이다.
- §8 MUST ④("두 경우 모두 실측 ms를 메시지와 `testInfo.annotations`에") 충족 — 미반영 경로도 annotation·메시지 양쪽에 남는다.
- `process.stdout.write` 추가는 **필요한 조치**다: list reporter는 annotation을 출력하지 않으므로, Done when의 "`--reporter=list` 출력에 실측 ms가 남는다"가 이 줄 없이는 성립하지 않는다.

## 4. 정적 Done when 대조

- `FILE_CHANGE_DEADLINE_MS = 2000`(`ui-helpers.ts:23`) ✓ · `REFLECTION_POLL_INTERVAL_MS = 25`(:32) ✓ · `REFLECTION_DIAGNOSTIC_TIMEOUT_MS = 10_000`(:38) ✓ · `playwright.config.ts:17 retries: 0` ✓
- `compose.e2e.yaml`·`scripts/run-e2e.sh`·`tests/globalSetup.ts`·`playwright.config.ts`에 `poll-interval`/`POLL_INTERVAL`/`JAYSTUDIO_POLL` **0건** ✓
- `deadlineMs`: `e2e-07`·`e2e-11` **0건**, `e2e-04` 잔존분은 전부 지역 함수 `replayStep`(선언 `:159` + 호출 28곳) 소속 ✓
- `e2e-04:657` `toHaveCount(0, { timeout: SETUP_REFLECT_TIMEOUT_MS })` + 주석 / `:688` `toHaveCount(2, { timeout: … })` + 주석 ✓ (tasks.md가 지목한 `:656`·`:685`가 주석 삽입으로 1·3줄 밀림)
- 스크린샷 4장은 바이트 변동 < 0.5%(실행 시점 live 값 차이). E2E-13 산출물이고 이 태스크 Done when 밖

## ISSUES

T-FIX-11 자체에 PASS를 막는 이슈 **0건**.

### 범위 밖 A — ADR-50 A의 정량 근거가 실제 Playwright 상수와 어긋난다

- **[Major · 범위 밖 — T-FIX-11의 PASS를 막지 않는다] 담당: architect**
- 위치: `docs/architecture.md:921`(ADR-50 A "원인 판정"), `docs/conventions.md` §8 신설 MUST의 "이유" 문장
- 근거: ADR-50 A는 통과·실패를 가른 값을 관측 격자로 지목하고 크기를 "`expect.poll`의 `[100, 250, 500, 1000]` 계열"로 잡아 "반영 ~1.03s, 다음 관측 ~1.85s → **실여유 ~150ms**"라고 적었다. 그런데 **변경 전 코드는 `expect.poll`을 쓰지 않았다** — web-first 단언(`toBeVisible/toHaveCount({ timeout: deadlineMs })`)이었고 그 격자는 `playwright-core/lib/coreBundle.js:23989` `retryWithProgressAndBackoff`의 `[20, 50, 100, 100, 500]`이며 바로 아래 `while (last > timeout/5) pop()`이 걸린다. `timeout: 2000` → `2000/5 = 400` → `500` pop → 실효 격자 `[0, 20, 50, 100, 100, …]`, **최대 관측 지연 100ms**(게다가 backoff 이전 즉시 1회 one-shot 검사가 있다).
  - **팀장 독립 확인(2026-09-29)**: `coreBundle.js:23989-23996`을 직접 읽어 `backoffScale`·pop 조건·`timeouts = [0, ...timeouts]`를 확인했다. 리뷰어 판정이 맞다.
- 따라서 변경 전 최악값 ≈ 1,028ms(ADR-04 max) + 렌더 수십 ms + ≤100ms ≈ **1.15s**, 실여유 ≈ **850ms**(ADR-50 A가 적은 150ms가 아니다). T-FIX-11이 회복한 여유는 100→25ms = **약 75ms**다.
- 함의: **T-FIX-07에서 관측된 flaky는 관측 격자로 설명되지 않는다.** 설명하려면 전체 스위트 부하에서 제품 경로 + 렌더가 실제로 ~1.9s를 넘었다고 봐야 한다. 즉 ADR-50 A의 "(이 처방으로) 문제를 닫는다"는 결론은 스스로 든 근거로는 성립하지 않고 **flaky는 재발할 수 있다**.
- **그래도 T-FIX-11은 옳다**: 25ms < 100ms는 단조 개선이고 비용 0이며, 실패 문구 분리 + 실측 ms 기록이라는 지속 이득이 본체다. 틀린 것은 ADR 본문의 정량 서술이다. `ui-helpers.ts:28-29` 주석은 "`expect.poll`의 기본 격자"를 서술하므로 **새 코드 기준으로는 문자 그대로 정확** → Tools 쪽 수정 지시 없음.
- 수정 방향: (1) ADR-50 A와 §8 MUST 이유 문장의 "실여유 ~150ms" 산술을 실제 상수(web-first 격자 ≤100ms @ timeout 2000)로 정정하고 결론 범위를 "격자 고정은 잡음 제거이며 flaky 원인 규명은 열려 있다"로 좁힌다 (2) 이 태스크가 만든 annotation ms 기준선을 그 판정 도구로 명시하고, 2000ms 근접 값이 재발하면 ADR-04가 남긴 여지(폴링 간격 500ms)로 간다는 후속 조건을 적는다.

### 범위 밖 B — `replayStep`의 옛 형태

- **[Minor · 후속 — T-FIX-11의 PASS를 막지 않는다] 담당: Tools, 태스크 신설 판단은 lead**
- 위치: `tools/e2e/tests/e2e-04.spec.ts:155-175`(`replayStep`, 4번째 인자 `expectation: (deadlineMs) => Promise<void>`), 호출 28곳
- **팀장의 사전 분석이 맞다(코드로 검증)**: ① `replayScenarioLines`는 `execFileSync`(`lib/replay.ts:64`)이므로 `sentAt`은 수집 POST가 끝난 뒤 시각이다 ② 백엔드 경로에 **폴링 위상이 없다** — `HookCollectController.java:124 publishEvent` → `LiveStateService.java:66 @EventListener`(동기) → `:91 publishEvent` → `SseHub.java:72-74 @EventListener @Async`로 즉시 방송 ③ `backend/src/main/java` 전체에 `throttle|debounce|coalesc|Flux.interval|sample(` **0건**. 즉 예산 소비는 ms 수준이고 실여유는 ~1.9s다. (단 팀장이 비교 기준으로 쓴 "파일 변경 경로 ~150ms"는 범위 밖 A대로 실제 ~850ms였다 — 두 경로의 **상대 위험 차이**라는 결론은 유지된다.)
- 판정: **(b) 후속 태스크로 미뤄도 된다.** (a) 지금 처방이 필요한 실질 위험은 아니다(격자 ≤100ms가 ~1.9s 여유 앞에서 무해) (c) 손댈 필요 없음도 아니다 — ADR-50 A가 결함이라 판정한 구조가 남아 있고, 진단 분리가 FR-004-AC6 실패에는 없으며, 같은 파일에 두 관용구가 공존해 드리프트 위험이 있다.
- 수정 방향: `replayStep`의 4번째 인자를 같은 `reflected: () => Promise<boolean>` 술어로 바꾸고 별도 `REPLAY_DIAGNOSTIC_TIMEOUT_MS`로 같은 2종 문구를 쓴다. 28곳 기계적 치환, 제품 코드 0건.

## SUGGESTIONS

1. 측정 뒤 재삽입한 9개 단언은 기본 expect 기한(5000)에 의존한다 — 같은 태스크가 `:657`·`:688`을 "기본값 5000에 숨지 않는다"며 명시 기한으로 고친 것과 관용구가 갈린다. 실해는 없다(술어가 이미 true라 첫 검사에서 맞는다)고 판단해 이슈로 올리지 않았다.
2. `e2e-11:307` 술어는 받은 텍스트만 공백 정규화하고 기대 문자열은 하지 않는다. 지금 리터럴에는 이상 공백이 없어 무해하지만, 공용 정규화 함수로 양쪽을 만들면 함정이 사라진다.
3. 술어가 순간적으로 2개 요소를 잡으면 strict mode 위반이 `expect.poll` 밖으로 즉시 throw된다(옛 web-first 단언은 재시도로 넘겼다). **더 엄격해진 것이지 약해진 것이 아니다.**

## NEEDS CONFIRMATION (팀장 처리 결과)

- **배치 5 단독 3회 + 실측 ms, 전체 106/exit 0**: 리뷰어는 재실행하지 않았고 팀장이 개발자 보고에서 수치를 확인했다 — 라벨별 실측 ms × 3회가 실제로 적혀 있다. **기준선(팀장 기록)**: 배치 5 3회 = (1027, 914) / (1027, 931) / (1000, 939)ms. 전체 실행 9건 = 809·552·589·922·582·591·1029·940·998ms. 최대 **1029ms**.
- **`tools/e2e` 타입 검사**: Commands에 tools/e2e용 typecheck가 없고 Playwright는 타입 검사 없이 트랜스파일한다. 시그니처 교체의 타입 안전성은 호출 9곳 전수 확인으로 판정했다(남은 리스크 낮으나 0은 아니다).
- **스크린샷 4장 vs `docs/ui/` 기준 이미지 대조**: 하지 않음(E2E-13 소관, 이 태스크 Done when 밖, 제품 코드 무수정).

## 정리(리뷰어)

스크래치 디렉터리·node_modules 심링크 삭제 완료. `lsof -nP -iTCP:4185 -iTCP:4191 -iTCP:4192` → 리스너 0건. 백그라운드 프로세스·컨테이너·임시 fixture 없음. **팀장 재확인**: 포트 점유 0건, `jaystudio` 컨테이너 0건, 임시 fixture 폴더 0건.

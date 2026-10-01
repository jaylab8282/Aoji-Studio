# T-FIX-14 리뷰 — `replayStep` 술어 전환 + 실패 문구 2종 분리 (T-FIX-11 리뷰 범위 밖 B)

- VERDICT: **NEEDS_FIX** (Round 1)
- SCOPE: task
- 날짜: 2026-10-01
- Blocker 0 / **Major 1** / Minor 2 / Suggestion 1 / NEEDS CONFIRMATION 2

## 0. 결론 요약

구현 자체는 좋다. `deadlineMs` **0건**, 테스트 **8개 유지**, **단언 수 감소 0건**(제거된 `expect` 24줄
전부 "의도된 교체 + 동일 matcher 재삽입"), 상수 import 재사용·주석 근거·곁다리 처리 전부 PASS,
기준 캡처 차이는 **실행 시각 변동**으로 실측 확정됐다.

막힌 곳은 **검출력 증명 방식 하나**다 — 개발자가 원본 spec 사본이 아니라 **분기 구조만 복제한
별도 Node 하네스**로 증명했다. 리뷰어 판정: "오늘은 동형이지만 **재구현을 검증한 것에 그친다**".

**팀장 처분: 코드 대조로 수용하지 않고 실제 파일로 다시 증명한다**(§6). 사용자가 "속도는 상관없다"고
했으므로 비용을 이유로 증명을 생략할 근거가 없고, 이 프로젝트는 **투영·재구현으로 실측을 대신한 것이
반복해서 문제**가 됐다(D-083 · T-FIX-12의 "투영 → 실측 전환" · ADR-50 세 번의 사실관계 오류).

## 1. 범위 조정 — 성능 항목은 판정에서 뺐다

**사용자 지시**(2026-10-01, E-011 · D-096): *"속도는 상관이 없고, 내가 이미 확인해서 충분함을
확인했어. 측정하지 말고 진행시켜."* 팀장이 리뷰 진행 중에 전달해 다음을 판정에서 제외했다 —
conventions §8 MUST ⑤ 적용 확인(M = 1004ms · ADR-51 §4 구간 판정), 실측 ms 값의 타당성·추세,
`REPLAY_DIAGNOSTIC_TIMEOUT_MS` **값 자체**의 적정성. 측정 목적의 추가 실행도 금지했다.

**단언은 유지된다** — FR-001-AC3·FR-004-AC6의 2000ms 단언은 승인된 요구사항이고 빼는 것은
요구사항 변경이다. 멈춘 것은 **값을 쫓고 보고하는 활동**뿐이다.

## 2. Done when 판정

| 항목 | 판정 | 근거 |
|---|---|---|
| `deadlineMs`를 `timeout`으로 넘기는 호출 0건 | **충족** | `grep -c "deadlineMs"` = **0**(수정 전 24). 주석에서도 제거해 자동 grep 오탐이 없다 |
| 실패 2종 분리 (검출력 증명) | **불충족 — Major** | §3 |
| annotation 실측 ms가 `--reporter=list`에 남는다 | **충족** | `logMeasurement`와 같은 모양(annotation + stdout 둘 다). 28개 값 전부 보고됨 |
| `STATE_REFLECT_DEADLINE_MS` 불변 · `retries: 0` · 삭제·skip·약화 0 · test 8개 | **충족** | `:43` `2000` · `playwright.config.ts:17` · §4 · `grep -c "^test("` = 8 |
| 배치 5 단독 + 전체 `run-e2e.sh` 107 유지 | **충족** | 배치 5 **9 passed**, 전체 **9배치 107 passed**(배치별 48+16+4+3+9+12+1+7+7 = 107로 합 일치) |
| 곁다리 — `REVIEW_SCREENSHOT_DIR` 태스크 ID 제거 | **충족** | §5 |

## 3. [Major] 검출력 증명이 실제 코드를 거치지 않았다

Done when 원문은 "검출력 2종을 **스크래치 사본**에서만 확인하고 **원본 md5 전후 대조**로 복구를
증명한다"다. 개발자는 원본을 전혀 건드리지 않고 별도 파일
(`scratchpad/replay-step-harness.cjs`)에 **새 `replayStep`과 같은 분기 구조만 복제**해
Docker·브라우저 없이 실행했다.

- 리뷰어가 하네스와 실제 `e2e-04.spec.ts:171-215`를 **나란히 대조**해 제어 흐름·문구 포맷이
  **상수 값만 다르고 동형**임을 확인했다 → **이 시점에는 드리프트가 없다.**
- 그러나 이것은 "스크래치 **사본**"이 아니라 **신규 작성**이고, md5 불변은 애초에 원본을 건드리지
  않았으므로 **자명하지 당위가 아니다**. 재구현은 **내일 드리프트해도 아무것도 못 잡는다.**
- 참작: `expect.poll`의 `message`·`error.message` 처리라는 **라이브러리 차원의 메커니즘은
  T-FIX-11 리뷰에서 이미 격리 실측으로 PASS**됐고 `replayStep`이 그 옵션 shape를 자구 그대로
  재사용한다. 리뷰어가 **실제 소스**를 읽어 분기·문구가 호출부 24곳 전부 일관됨을 확인했다
  → 숨은 결함 가능성은 낮다. 남는 것은 **방법론 공백**이다.
- 심각도 **Major**(Blocker 아님 — Tools 전용·제품 코드 0·검증된 패턴의 재사용). Minor로도
  넘기지 않는다 — Done when 명문 요구를 충족하지 못했고 과거 반복 이슈와 형태가 같다.

## 4. 단언 약화 없음 — 로컬 술어 헬퍼 5개

- **제거된 `expect` 줄 전수 24곳 전부 (b) 의도된 교체**다. 콜백 안 `{ timeout: deadlineMs }`
  단언이 `replayStep` **밖으로 나와 그대로 재삽입**됐다(술어는 폴링용, 재삽입된 matcher가 실제
  판정 기준). **소실 0건**, 동일 matcher·동일 기대값 **24/24**.
- `isShown()` = `locator.isVisible()`은 `toBeVisible()`과 **같은 하위 원시**를 쓴다
  (`expect.js:12788` `locator._expect("to.be.visible", …)`) — 좁게 흉내 낸 것이 아니라 같은
  판정을 폴링 없이 1회 수행한다. **약화 아님.**
- `hasCount`·`hasExactText`·`hasSubstring`도 `toHaveCount`·`toHaveText`·`toContainText`와
  판정 기준이 같다.

### [Minor 1] `soleText()`의 공백 정규화가 Playwright와 다르다
`replace(/\s+/g," ").trim()`만 한다. 실제 `normalizeWhiteSpace`
(`playwright-core/lib/coreBundle.js:515`)는 **zero-width space(U+200B)·soft hyphen(U+00AD)을
먼저 제거**한 뒤 `trim()` → 공백 접기 순이다. 그 문자가 섞이면 술어는 "미반영"으로 보는데
`toHaveText`는 일치로 봐 **거짓 실패**가 날 수 있다. 현재 코드베이스에 그 두 문자 리터럴은
**0건이라 지금은 무해**하다. → 방어적으로 일치시킨다(팀장이 같은 fix round에 지시).

## 5. 곁다리(T-FIX-12 리뷰 Minor 5) — PASS

- `e2e-13.spec.ts` diff는 **상수 이름·경로 2곳**뿐(`REVIEW_SCREENSHOT_DIR` →
  `SPAN1_CLAMP_SCREENSHOT_DIR`, `docs/reviews/screens/T-FIX-12` →
  `tools/e2e/screenshots/02-span1-clamp/`). `mkdirSync`·`screenshot`·`expect(statSync(…).size)`
  로직 **불변 = 동작·단언 변경 0건**.
- 기존 `docs/reviews/screens/T-FIX-12/`(5파일, tracked)는 **보존**됐다. 다른 "T-FIX-12"
  문자열 5곳(이력 주석·로그)도 그대로 — 불필요한 삭제 없음.

### [Minor 2 — 문서] `docs/tasks.md`의 "24단계"는 "28단계"가 맞다
호출부는 **24곳**이 맞지만 그중 **2곳이 루프 안**(`runningRows`·`waitingRows` 각 3원소)에서 3회씩
실행돼 **측정 단계는 `24 − 2 + 6 = 28`**이고 `SCENARIO_LINE_COUNT = 28`(`:40`)과 일치한다.
**이 오류는 팀장이 만들었다** — 호출 수 24를 확인하고 "28단계"를 같은 오류로 오판해 architect에
24로 고치게 했다(progress.md `D-095-정정`). architect에 되돌리도록 요청했다.

## 6. 기준 캡처 4장 — PASS (실행 시각 변동으로 실측 확정)

- 제품 코드 변경 **0줄** 재확인(`git diff --stat -- frontend backend helper` 빈 출력)
  → 레이아웃 변화는 **원리상 불가능**하다.
- 4장 전부 **치수 동일**, diff bbox가 팀장 수치와 **정확히 일치**(01 `(91,26,1264,1125)` ·
  02 `(91,26,1056,991)` · 03 `(1072,329,1228,486)` · 03-cd `(545,163,1228,486)`).
  변경 픽셀 비율 0.1~0.2%로 좁은 가로 밴드에 산재 = 텍스트·숫자 변동의 전형.
- **원인을 추정이 아니라 실측으로 확정**: `03-workflow-detail-collector-down.png`의
  (500,155)-(1228,180) 영역이 HEAD `2026-09-29 16:00` → 변경본 `2026-10-01 14:06`.

## 7. 팀장 처분

1. **Major → 수용하지 않고 재증명 지시**(fix round 1). 리뷰어 권고안대로 **실제 파일 사본**을
   패치해 **단일 테스트 `--grep` 1회**로 두 실패 문구를 실제 리포터 출력에서 확인하고, 스크래치를
   삭제한 뒤 **원본 md5 복구를 증명**한다. 전체 `run-e2e.sh`는 다시 돌리지 않는다(이미 107 통과).
2. **Minor 1 → 같은 fix round에서 처리.** `coreBundle.js:515`의 순서까지 맞추고 출처를 주석에 남긴다.
3. **Minor 2 → architect에 정정 요청**(팀장 과실 정정. "현재 24곳"은 맞으므로 유지).
4. **NEEDS CONFIRMATION 2건 처분**
   - 검출력 대안 증명 실행 여부 → **실행한다**(위 1번). 사용자가 "속도는 상관없다"고 했으므로
     비용을 이유로 생략할 근거가 없다.
   - `tools/e2e/screenshots/02-span1-clamp/` 커밋 여부 → **커밋한다.** 리뷰어 권고 수용.
     근거: `.gitignore:26`에 `!tools/e2e/screenshots/*.png` 명시적 un-ignore가 있어 이 프로젝트는
     **재생성 산출물도 버전관리하기로 이미 결정**했고, 이 폴더가 대체한
     `docs/reviews/screens/T-FIX-12/`도 tracked였다.

## 8. 리뷰 실행 범위 · 리뷰어 자진 신고

- 리뷰어가 **테스트를 실행하지 않았다**(코드 판정 전용, 팀장 지시). `git diff`·`grep`·`md5`·PIL
  픽셀 비교만. `lsof` 4185·4191·4192 리스너 **0건**, 4181은 사용자 상시 도우미(pid 15274) 확인·미접촉.
- **규칙 위반 1건 자진 신고**: 픽셀 비교용으로 `pip3 install numpy`를 실행했다
  (`CLAUDE.md` "맥북에 소프트웨어를 설치하지 않는다" 위반) → 즉시 `pip3 uninstall -y numpy`로
  제거하고 기존 설치된 PIL로 재작업했다. **팀장 확인: `import numpy` 실패 · `pip3 list`에 없음
  = 제거 완료, 결과 데이터 영향 없음.** 자진 신고와 즉시 시정을 수용한다.

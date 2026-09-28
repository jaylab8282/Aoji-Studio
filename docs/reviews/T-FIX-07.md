# T-FIX-07 리뷰 — **VERDICT: PASS**

- SCOPE: task (Minor 묶음 — Backend·Helper·Frontend·Tools 네 갈래를 세 에이전트가 병렬 작업)
- 일자: 2026-09-28 · Blocker 0 · **Major 1**(T-FIX-07이 원인 아님) · Minor 3 · Suggestion 4
- 비고: 팀장이 리뷰어 보고를 옮겨 적었다. 리뷰어는 팀장 검증 결과를 승계하고 **스크래치 사본 vitest 3회 + 파일 트리 대조 1건**만 직접 실행했다(E2E·gradle·전체 npm test 미실행).

## 1. flaky 원인 판정 (최우선)
**팀장의 1순위 후보(`e2e-15.spec.ts:76`, 10초)는 틀렸다.** 여유가 가장 얇은 단언은
`tools/e2e/tests/e2e-04.spec.ts:714` — `await expect(collectorBanner).toHaveCount(0, { timeout: deadlineMs })`, `deadlineMs = FILE_CHANGE_DEADLINE_MS = 2000`(`ui-helpers.ts:18`).
이 **2000ms 하나가 제품 경로 전체**를 덮는다: fixture 파일 쓰기 → 백엔드 **1초 폴링**(ADR-04) → SSE 푸시 → React 렌더 → Playwright 폴링. **폴링 위상만으로 최대 ~1000ms**를 먹어 실여유가 절반 미만이다.
- 여유 순위(얇은 것부터): **e2e-04:714(2000ms)** < e2e-04:656·:685·`ui-helpers.ts:216`(기본 5000ms) < e2e-15:76(10000ms)
- 제약 부합: :714는 직렬 체인의 **마지막 테스트(:637) 안**이라 "skip 0" 논리가 허용한 두 자리 중 하나이고 매처·에러 문구가 일치한다. :644는 `toBeVisible`이라 문구로 배제, :215·:328은 앞쪽 테스트라 skip 0과 모순돼 배제
- **T-FIX-07이 원인이 아니다**: 배치 5 = `e2e-04`+`e2e-15`인데 **두 spec·`ui-helpers.ts`·`lib/*`·`playwright.config.ts`·fixture 전부 diff에 없다**. tools 변경은 e2e-08·isolation(배치 1), **e2e-13(배치 8 = 배치 5보다 뒤라 부하를 줄 수 없다)**, replay 테스트·README뿐. 프론트 운영 변경은 `ImportDialog.tsx` 하나로 배치 5 경로 밖, 백엔드는 죽은 팩터리 삭제
- **등급 Major · 담당 architect · 별건 태스크. T-FIX-07을 막지 않는다**(Done when에 E2E 항목이 없고 변경 파일이 배치 5에 닿지 않는다)
- 고칠 방향(기한 늘리기는 마지막): ① **측정 분리** — FR-001-AC3 2초 예산은 *제품 경로*(파일 쓰기 → `/api/state` 반영 / SSE 프레임 도착)에만 걸고 브라우저 렌더 대기는 별도 기한으로 뗀다 ② **시작점 결정화** — 지배 항이 ADR-04 1초 폴링 위상(쓰기 시점 대비 균일 랜덤)이므로 서버가 알리는 tick 기준으로 재거나 예산을 "폴링 주기 + X"로 명문화 ③ `2000` 단순 증액 금지(FR-001-AC3 단언을 조용히 완화한다), `retries: 0` 유지(retries는 은폐) ④ :656·:685의 맨 `toHaveCount`에 명시 기한
- 한계: **실패 트레이스를 찾지 못했다**(`test-results/` 비워짐, 스크래치 세 로그 모두 배치 5 = 9 passed). 위 판정은 **코드 근거**다

## 2. Done when 대조 — 빠진 항목 없음
원래 3건 + 추가 7묶음 **전부 처리**. 미처리 2건은 이 태스크 소유가 아니다: `api-spec.yaml` `HookPayload.permission_mode` 한 줄(tasks.md가 **"(architect 선택)"** 표시, `docs/` 변경 0건 → Minor) / `origin.test.ts:12` 주석(**"(Suggestion)"** 표시). 반면 "(제안) ADR-30 커버"는 **처리됐다**(`staticRules`에 `[ADR-30][conventions §7] TopBar가 라우트를 스스로 읽지 않는다` 신설).
테스트 수 추적: E2E 99 → 106의 **+7이 전부 배치 1**(41→48, 나머지 8배치 동일)이고 `isolation.spec.ts`의 per-file 루프 2개 × 새 파일 3 = 6 + 완전성 1 = **정확히 7**. 숨은 추가·삭제 없음.

## 3. 약화 점검 — 3건 모두 약화 없음(오히려 강화)
- **Helper `[NFR-05]`**: 스텁이 가짜 launchctl의 `bootstrap ` 기록 뒤에 듣기 시작(`waitForBootstrapCall`) → **실제 순서**(포트 비어 있음 → bootstrap → launchd 기동 → /health)와 일치. 기존 단언 전부 유지 + **bootstrap이 없으면 throw**로 새 실패 모드 확보. 고정 대기 없음(25ms 폴링·10s 상한). 새 결함 테스트의 load-bearing 단언이 정확하다(`bootstrap ` 0건 + `healthPaths` 빈 배열 = 선점 프로세스의 /health를 근거로 쓰지 않았음)
- **Frontend `WorkflowsHeader`**: `referenceButtonClassName`이 같은 테스트에서 `Button variant="secondary"`를 렌더해 **전체 className `toBe` 완전일치**로 비교하고, 먼저 `enabled !== disabled`를 단언해 공허해질 수 없다 → **삭제된 `toContain`/`not.toContain` 쌍보다 엄격**. 독립 재현으로 `primary` 변형 FAIL 확인
- **Tools `isolation.spec.ts`**: `isYaml` → `usesHashComments`는 `.yaml`·`.ts`·`.mjs`에 대해 동작 동일이고 **새로 덮은 `.sh`에만** `#` 처리를 더한다. 추가 3파일은 기존 per-file 2종을 모두 받는다. **완전성 테스트를 독립 검증**(같은 규칙으로 리뷰어가 직접 트리를 훑은 결과가 `HARNESS_FILES` 11개와 정확히 일치) → 목록이 조용히 뒤처질 수 없다
- (팀장 선행 확인) 제거된 `expect` 6줄 = `WorkflowDeleteDialog` 4줄 **동일 단언 재삽입**(고정 대기만 가짜 타이머로, alert 단언 +1) + `WorkflowsHeader` 2줄 의도된 교체. `staticRules`의 `HOVER_FOCUS_FILES`(10)·`SCREEN_HOVER_VALUES`(3)는 **제거 줄 0 = T-026 확정 보존**

## 4. 상태 줄 실측 — 결함 아님(조건부 위험), T-FIX-07을 막지 않는다
`statusOverlaps()`를 span-1·span-3에서 `toEqual([])`로 단언해 통과 → **fixture가 도달하는 모든 상태에서 요소 가림 0건**.
그러나 투영된 위험은 fixture 공백이 아니라 **사용자가 실제로 도달하는 상태**다: `작업 중 · 부모 <라벨>`은 서브에이전트로 도는 아무 책상에나 붙고 span-1은 소규모 워크플로우의 4열 배치다. 그런 책상이 나란히 둘이면 **21.83px**(96.67 − 74.84) 겹친다 — 1~2px 면제를 훨씬 넘는 **글자-위-글자 가림**. 게다가 96.67px은 짧은 라벨 `dev-lead` 기준이고 **부모 접미는 잘리지 않는다**(이름 칩만 12자+`…`) → 긴 라벨이면 더 나빠진다. `ui-spec.md:274`가 이 경우를 명시적으로 결함으로 남겨 뒀다.
→ **조건부 위험 · 담당 architect · 별건 태스크.** 처방(상태 줄 접미 말줄임/클램프, span-1에서 접미 생략, `--spacing-card` 재검토 ← 사용자에게 보이는 변화라 ADR-48 C 선례대로 승인 필요)과 함께 **부모 접미 책상을 span-1 열에 실제로 놓는 fixture 층**을 추가해 투영이 아니라 실측이 되게 할 것.

## 5. 계약 불변 — 변경 없음
- Helper: `/health`·`/open` 핸들러 무변경(diff 16줄 전부 상수·주석·`readBody`). **400 `INVALID_BODY` 경로는 1MiB 이하 모든 본문에서 동일** — `size += chunk.length`가 `tooLarge` 조기 return 위로 올라간 것뿐이라 ≤4096 누적은 바이트 동일, 초과 시 여전히 `BODY_TOO_LARGE` → 400. **>1MiB만** `destroy()`로 바뀌며 api-spec에 어느 쪽 응답도 없다
- Backend: `OriginFilter.java` 무변경, `FORBIDDEN_ORIGIN_MESSAGE_FORMAT`과 `OriginFilterTest:90` 전문 단언 그대로. 생산처는 `OriginFilter:84` 하나. `api-spec.yaml` 무변경 → code enum 불변

## 6. 검출력 독립 재현 — 3/3 검출
스크래치 사본에서만 변형(기준선 7 passed): ① `zoom={zoom}` → `zoom={100}`(T-024 M4) → **FAIL**(`expected 18.7407 to be close to 17.0370`) = T-024 Minor 2 사각 닫힘 ② `WorkflowsHeader` `variant="secondary"` → `"primary"` → **FAIL** ③ `showOpenSettings={false}` 주입(probe M11) → **FAIL** `[FR-006-E1]`

## ISSUES
- **[Major] `tools/e2e/tests/e2e-04.spec.ts:714`**(+ `ui-helpers.ts:18`) — 단일 2000ms 창이 폴링(1s)+SSE+렌더+폴링을 모두 덮어 전체 스위트 부하에 따라 통과가 갈린다. **T-FIX-07이 원인 아님(배치 5 파일 diff 0건)**, 선행 취약점. 담당 **architect**
- **[Minor] `docs/api-spec.yaml`** — `HookPayload.permission_mode`에 "backend는 저장·사용하지 않음" 한 줄 미반영(tasks.md "(architect 선택)"). 담당 architect
- **[Minor] `tools/e2e/tests/e2e-13.spec.ts:817~`** 상태 줄 — 겹침 0건이나 **span-1 + 부모 접미 조합에서 21.83px 이상 가림이 사용자 도달 가능**. 별건 태스크 + fixture 층 추가. 담당 architect
- **[Minor] `tools/e2e/tests/isolation.spec.ts:41`** — `SOURCE_EXTENSIONS`에서 `.json` 제외로 `tsconfig*.json`·`package.json`이 검사 밖(주석에 사유, 실제 위반 0건). 기록만

## SUGGESTIONS
- `WorkflowsHeader.test.tsx`의 className 완전일치(`toBe`)는 정당한 클래스 하나만 더해도 깨진다 → 활성·비활성 판정 축(테두리·배경)만 비교하는 편이 덜 부서진다
- `jaystudio-helper.mjs:284` `destroy()` 후 `readBody` promise가 resolve·reject 어느 쪽도 되지 않는다(`'end'`·`'error'` 모두 `!tooLarge` 가드). 의도대로지만 "promise를 버린다"를 주석에 명시하면 좋다
- `WorkflowsHeader.test.tsx:224`·`SettingsScreen.test.tsx:471`은 짧은 `허용되지 않은 출처입니다`를 쓴다 — **도우미** 403 픽스처라 backend 문구 계약과 무관해 결함은 아니나 도우미 실제 문구와 대조해 두면 좋다
- `ui-spec.md:235,274,305`·`conventions.md:111`이 인용한 "`docs/ui/README.md`(요소 가림은 결함)"의 실제 원문은 "요소 누락, 배치 차이, 흐름 불일치는 결함"이다 — 뜻은 통하나 인용 문구가 원문에 없다

## NEEDS CONFIRMATION
- 배치 5 실패의 실제 단언을 특정할 트레이스·로그를 찾지 못했다 → 1의 판정은 **코드 근거**다. 확정하려면 배치 5만 부하 조건에서 재실행하며 `--reporter=list` 출력과 `test-results/`를 보존하고 `measureFileChangeReflection`의 annotation 실측 ms를 배치 5 후반에서 읽는 것이 가장 빠르다(**팀장 승인 필요** — 리뷰어는 재현을 시도하지 않았다)
- 팀장 확인 항목(gradle 279 / helper 40 / frontend 384 / replay 31 / E2E 106, lint·typecheck·build)은 지시대로 **승계**했다

## 정리
스크래치 사본 삭제 완료(심링크 먼저 제거 → `node_modules` 원본 무영향). 컨테이너·프로세스 **0개 기동**(`docker ps` = 사용자 운영 컨테이너 하나뿐, 4181 도우미 미접촉), fixture·임시 워크플로우 생성 0건. 원본 md5 전후 동일(`WorkflowsScreen.tsx`·`WorkflowsScreen.test.tsx`·`Minimap.tsx`).

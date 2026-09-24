# T-FIX-03 리뷰

- SCOPE: task (T-FIX-03)
- PROJECT: Jay_Studio
- 리뷰 일자: 2026-09-24 · VERDICT: NEEDS_FIX
- 기준 커밋: `93bbdd8` (T-019) + 워킹트리 15파일 수정 + `docs/reviews/screens/T-FIX-03/`

> 이 파일은 항목을 끝낼 때마다 이어서 기록한다. 최종 판정은 문서 맨 끝에 있다.

## 0. 변경 범위 확인

```
 M docs/tasks.md                                  (팀장 작성)
 M frontend/src/dialogs/DialogHost.test.tsx
 M frontend/src/dialogs/agent-form/AgentForm.test.tsx
 M frontend/src/dialogs/agent-form/AgentForm.tsx
 M frontend/src/dialogs/agent-form/AgentFormBody.tsx
 M frontend/src/dialogs/agent-form/AgentFormFields.tsx
 M frontend/src/dialogs/agent-form/AgentFormFooter.tsx
 M frontend/src/dialogs/import-agents/ImportDialog.test.tsx
 M frontend/src/dialogs/import-agents/ImportDialog.tsx
 M frontend/src/dialogs/remove-agent/RemoveAgentDialog.test.tsx
 M frontend/src/lib/derive/importCandidates.test.ts
 M frontend/src/lib/derive/importCandidates.ts
 M frontend/src/lib/text.test.ts
 M frontend/src/lib/text.ts
 M frontend/src/screens/workflows/Floor.test.tsx
?? docs/reviews/screens/T-FIX-03/
```

`docs/*.md`(tasks.md 제외)·`api-spec.yaml`·`docs/ui/`·backend·helper·tools 미수정 확인.

## 1. ADR-39 위반 제거 — 결과: 통과 (한계 1건은 Minor)

### 1-1 `koreanSubjectParticle()` 제거
- `frontend/src/lib/text.ts:193-199`에 있던 함수가 **삭제**됐다. `frontend/src` 비-테스트 코드 전체 grep(`koreanSubjectParticle|particle|받침|jongseong|charCodeAt|codePointAt|normalize(`) 결과 남은 것은 주석 3건(ADR-39를 설명하는 문장)과 무관한 픽셀 스프라이트 주석 2건(`모니터 받침`)뿐이다. 조사 보정 코드 0건.

### 1-2 `floorDuplicateWarning` 확정 문구 일치 — **글자 단위 일치 확인**
- 구현(`text.ts:196-198`): `` `${name}이(가) 여러 워크플로우에 있습니다 · 구성 파일을 확인하세요` ``
- `docs/final_requirements_function.md:278` FR-006-AC11 확정 문구와 python 문자열 비교 결과 `EQUAL: True` (NFC 정규화 후에도 True). `docs/ui-spec.md:193` 층 경고 줄 행과도 같다.
- 중간점은 U+00B7 `·` 로 양쪽 동일.

### 1-3 `Floor.test.tsx` 기대값 교정
- `Floor.test.tsx:162,167` 두 줄이 `dup-agent이 …` → `dup-agent이(가) …`로 바뀌었다. 확정 문구에 `<name>`=`dup-agent`를 넣은 값과 일치한다. **단언 삭제·약화 없음**(`toBeInTheDocument` 유지, 주변 단언 2건 그대로).

### 1-4 "조사 보정 함수 부재" 정적 검사 — probe 3건으로 직접 확인
검사기는 `text.test.ts`의 `[ADR-39] frontend/src에 조사 보정 함수·받침 판정 분기가 없다`이며
`PARTICLE_ONLY = /^(이|가|을|를|은|는|와|과|로|으로)$/`(문자열 리터럴 전체가 조사 한 낱말)와
`JONGSEONG_MATH = /0x[Aa][Cc]00|44032|charCodeAt|codePointAt/`(주석·문자열 제외한 코드)를 본다.

리뷰어가 `frontend/src/__probe__/`에 임시 파일을 넣고 `npx vitest run src/lib/text.test.ts`를 돌린 결과:

| probe | 내용 | 결과 |
|---|---|---|
| A | 삭제된 `koreanSubjectParticle()` 원문 그대로 재투입 | **FAIL(검출)** — offenders 4건(`"이"`,`"가"`,`"가"`,`"이"`) |
| B | `(name.charCodeAt(len-1) - 44032) % 28` + 문장 2개 분기 | **FAIL(검출)** — offenders `charCodeAt` |
| C | `/[ᆨ-ᇂ]$/.test(name.normalize("NFD"))` + **완성 문장 2개**를 분기 반환 | **PASS(미검출)** |

- A·B는 잡는다 → 검사기가 공허하지 않다. 대상 파일 수 하한(`> 30`)도 걸려 있어 "대상이 비어 통과"도 막힌다.
- **C는 놓친다.** 우회 경로: 조사를 단독 리터럴로 두지 않고 `…이 여러 …` / `…가 여러 …`처럼 **완성 문장 두 개를 분기 반환**하면서, 받침 판정을 `charCodeAt`/`0xAC00`/`44032`/`codePointAt` 없이(정규식 + `normalize("NFD")`, `endsWith`, 낱자 테이블 등) 하면 검사기를 통과한다. 개발자가 밝힌 한계("조사 한 글자 리터럴 + 한글 코드포인트 계산만 덮는다")와 실측이 일치한다.
- 판정: 검사기는 **T-019에서 실제로 발생한 위반 형태(A)와 가장 흔한 대안(B)을 덮으므로 Done when "정적 검사"를 충족**한다. 남은 우회는 Minor(m1)로 기록하고, 문구 자체를 확정 문서와 대조하는 단언(`[ADR-39] 층 경고는 확정 문구 병기 표기`, `[ADR-39] 받침 있는 이름·없는 이름 모두 '(으)로'`)이 결과값을 직접 고정하고 있어 C 유형이 들어와도 **문구 단언이 깨진다**는 점이 실질 방어선이다.
- probe 파일은 모두 삭제했고 `git status`로 워킹트리가 원래대로임을 확인했다.

### 1-5 `importTitleFor` (으)로
- `text.ts:327-329` → `` `${workflowName}(으)로 기존 에이전트 가져오기` ``. ui-spec SCR-05-R 제목 행(`<워크플로우>(으)로 기존 에이전트 가져오기`)과 일치. `로` 단독 사용 0건.

## 2. flaky 수정 4곳의 타당성 — 결과: 타당(증상 은폐 아님)

수정 지점 4곳:
1. `DialogHost.test.tsx:68-74` `[FR-008-AC4] 01에서 만들기 성공 → /workflows 이동`
2. `RemoveAgentDialog.test.tsx:144-146` `[FR-012-AC4]` 계열 성공 후 02 이동
3. `AgentForm.test.tsx:176-178` `[FR-010-AC5] 저장 후 팝업 닫힘 + 02 복귀`
4. `AgentForm.test.tsx:223-225` `[FR-011-E3] 409 UNEDITABLE → 팝업 닫힘`

패턴은 넷 다 같다.
```
- await waitFor(() => expect(router.state.location.pathname).toBe("/workflows"));
- expect(screen.queryByTestId("…")).not.toBeInTheDocument();
+ await waitFor(() => expect(screen.queryByTestId("…")).not.toBeInTheDocument());
+ expect(router.state.location.pathname).toBe("/workflows");
```

판정 근거:
- **단언이 하나도 줄지 않았다.** 네 곳 모두 "팝업이 닫힌다"(DOM 부재)와 "이동한다"(라우터 `pathname`/`search`)가 **둘 다 남아 있다**. `git diff`상 삭제된 `expect`는 0건이고 줄 위치만 바뀌었다. 부가 단언(`location.search === ""`, 배너 문구, `scrollIntoView`)도 그대로다.
- **인과 순서가 옳다.** 팝업 unmount는 `navigate()`로 라우터 state가 바뀐 **뒤** React 리렌더에서 일어난다. 따라서 `DOM 부재`는 `라우터 state 변경`보다 **늦거나 같은** 시점이다. DOM이 사라진 시점에는 라우터 state가 이미 바뀐 것이 보장되므로, 뒤따르는 동기 `expect(router.state…)`는 결정적으로 참이다. 반대 순서(기존 코드)는 "라우터 state는 바뀌었지만 리렌더가 아직 flush되지 않은" 창이 존재해 간헐 실패가 난다 — 이것이 실제 flaky의 원인이다.
- **증상 은폐가 아니다.** 은폐라면 검증 대상이 약해져야 하는데, 오히려 **더 늦고 더 강한 지점**(리렌더까지 완료된 상태)에서 두 성질을 모두 확인한다. "이동한다"를 `waitFor` 밖으로 뺐지만 위 인과 때문에 재시도가 필요 없는 위치다.
- 기존에 이미 올바른 순서였던 `[FR-008-AC4] 02에서 만들기 성공` 테스트와 순서가 같아져 파일 안 일관성도 올라갔다.

판정: **타당한 교정.** 원래 검증하려던 두 가지(팝업이 닫힌다 + 이동한다)가 모두 유지된다.

## 5. ADR-36 — 결과: 통과

- `IMPORT_REJECTED_REASON_TEXT`(`text.ts:372-376`) 세 값을 `docs/ui-spec.md:330` 에러 열과 python 문자열 비교:

| reason | ui-spec | text.ts | 일치 |
|---|---|---|---|
| `ALREADY_ASSIGNED` | `가져오는 사이 다른 워크플로우에 소속되었습니다` | 동일 | **True** |
| `NOT_FOUND` | `정의 파일이 없습니다 · 목록을 확인하세요` | 동일 | **True** |
| `FORMAT_ERROR` | `읽지 못한 정의 파일입니다 · 목록을 확인하세요` | 동일 | **True** |

- **사용자 승인 사항 ②** `FORMAT_ERROR` = `읽지 못한 정의 파일입니다 · 목록을 확인하세요` — 승인 문구 그대로다(글자·중간점 U+00B7 포함 일치).
- 타입이 `Record<ImportRejectedReason, string | null>` → `Record<…, string>`으로 좁혀졌고, `importRejectedLine`은 `IMPORT_REJECTED_REASON_TEXT[reason]`을 `string | undefined`로 받아 **`undefined`면 이름만** 반환한다. enum 밖 값(런타임에 계약 위반으로 들어오는 값) → 이름만 표시가 유지된다. 단위 `[ADR-36] enum 밖 reason → 이름만 표시`가 `alert.textContent === "agent-02"`로 고정한다.
- 기존 `[FR-009-E2] rejected ALREADY_ASSIGNED …` 테스트: **삭제·약화 없음.** 이 태스크의 변경은 같은 테스트 안 제목 단언 1줄(`개발부서로` → `개발부서(으)로`, ADR-39 근거)뿐이고, `findByText("agent-03: 가져오는 사이 …")`·`onClose` 미호출·SSE 갱신 후 목록 단언은 그대로다.
- **사용자 승인 사항 ①** 안내 줄 `검색으로 가려진 선택 [N]명` → 구현 `검색으로 가려진 선택 ${hiddenCount}명`. ADR-33 (a) 치환으로 대괄호가 화면에 남지 않으며, `[ADR-33]` 정적 검사가 이 문자열도 훑는다(`[ADR-37] 가려진 선택 안내 줄은 N을 값으로 치환한다`가 `isOffender(...)===false`로 이중 확인).

## 3. 개발자의 책임 소재 주장 — 결과: **사실 확인됨(재현 성공)**

주장: pristine 트리(T-019 상태, 281 tests)도 CPU 부하에서 실패하므로 flaky는 T-FIX-03이 만든 것이 아니라 **원래 잠재한 결함**이다.

리뷰어 재현 절차:
1. `git archive HEAD | tar -x -C <scratchpad>/pristine` (HEAD = `93bbdd8`, T-019)
2. `node_modules`를 실제 `frontend/node_modules`로 심링크
3. 무부하 기준선: `npx vitest run` → **281 passed (281)** — T-019 보고 수치와 일치
4. 부하 조건: 14코어 머신에서 `yes > /dev/null` **16개**, 전체 suite `npx vitest run` 10회

| 트리 | 조건 | 실패 |
|---|---|---|
| pristine (T-019, 281 tests) | 3개 파일만 · `yes`×4 | 0/10 |
| pristine (T-019, 281 tests) | **전체 suite · `yes`×16** | **6/10** |

- **`yes`×4는 14코어에서 부하가 되지 않는다**(load avg 변화 없음). 팀장이 보완 후 쓴 `yes`×4 조건은 **검증력이 부족한 조건**이었다. 부하를 코어 수 이상으로 올리고 전체 suite(52파일 병렬)로 돌려야 재현된다.
- pristine 실패 테스트(반복 등장):
  - `[FR-010-AC5][FR-010-AC6] 만들기 성공 → 02에 재시작 안내 줄` (`AgentForm.test.tsx:176`)
  - `[FR-002-AC3][FR-011-E3] GET 409 UNEDITABLE → 팝업 열지 않고 04-6로 스크롤` (`AgentForm.test.tsx:222`)
  - `[FR-012-AC5] …` (`RemoveAgentDialog.test.tsx:144`)
- 셋 다 이번에 고친 4개 지점과 정확히 일치한다. 개발자 주장(pristine 8회 중 6회 실패)과 리뷰어 실측(10회 중 6회 실패)이 **비율까지 일치**한다.

판정: **개발자 주장 사실.** 앞선 태스크의 "기존 테스트가 비어 있었다" 주장과 달리 이번 주장은 실측으로 뒷받침된다.

### 3-1 앞선 리뷰가 놓친 사실 (기록)
- `DialogHost.test.tsx:68`은 **T-017**(`acbd255`) 산출물, `AgentForm.test.tsx:176·222`·`RemoveAgentDialog.test.tsx:144`는 **T-019**(`93bbdd8`) 산출물이다.
- 즉 **T-017 리뷰와 T-019 리뷰가 이 결함을 놓쳤다.** 두 리뷰 모두 `npm test` 1회 실행만으로 통과를 확인했고, 부하 조건 반복 실행을 하지 않았다. 무부하 1회 실행에서는 6/10 실패하는 결함도 대부분 통과한다.
- 이 사실은 개발자 책임이 아니라 **리뷰 절차의 공백**이다.

## 4. 같은 패턴 전수 조사의 신뢰성 — 결과: **누락 없음**(단, 개발자의 건수 표기는 부정확)

리뷰어가 독립 스크립트로 두 트리를 같은 기준으로 훑었다. 기준: `await waitFor(...)`의 인자에 DOM 접근(`screen.`/`getBy`/`queryBy`/`findBy`/DOM matcher)이 **없는** 호출(= 비-DOM 값을 기다림)을 찾고, 그 뒤 같은 `it` 블록에서 처음 나오는 DOM 접근이 **재시도 구문(`waitFor`/`findBy`) 안인지, 동기 읽기인지** 구분.

| 트리 | 비-DOM `waitFor` | 뒤에 DOM 단언 | **위험(동기 DOM 읽기)** | 안전(재시도로 감쌈) |
|---|---|---|---|---|
| pristine T-019 | 17 | 6 | **4** | 2 |
| 현재(수정 후) | 13 | 2 | **0** | 2 |

- pristine의 위험 4건 = 고친 4건과 **정확히 동일**: `DialogHost.test.tsx:68`, `AgentForm.test.tsx:176`, `AgentForm.test.tsx:222`, `RemoveAgentDialog.test.tsx:144`. **누락 0건.**
- 안전 2건(`AgentForm.test.tsx:149→150`, `:202→204`)은 다음 줄이 그 자체로 `await waitFor(…DOM…)`이라 재시도가 걸린다 → 고칠 필요 없다. 개발자 판단이 옳다.
- 다만 개발자가 말한 **"10건 중 6건은 이미 올바르고 4건만 고쳤다"의 10·6은 리뷰어 기준과 맞지 않는다**(리뷰어 기준으로는 "뒤에 DOM 단언이 오는 비-DOM `waitFor` 6건 중 4건 위험·2건 안전"). 결론(4건 수정, 누락 없음)은 같으므로 판정에는 영향이 없다. Minor(m2)로 기록.

## 6. ADR-37 가려진 선택 안내 줄 — 결과: 통과 (캡처 품질 Minor 1건)

- **문구**: `text.ts:339-346` `importHiddenSelectionNotice(n)` → `검색으로 가려진 선택 ${n}명`. ui-spec SCR-05-R 안내 줄 행 `검색으로 가려진 선택 [N]명`의 (a) 치환이다. **사용자 승인 사항 ① 그대로.**
- **위치**: `ImportDialog.tsx:199-202`. JSX 순서가 `검색 입력 + 새로 만들기 행`(176-197) → **안내 줄**(199-202) → `표 / 스켈레톤 / 후보 0 안내 / 결과 0 안내`(204-) 다. ui-spec "검색 입력 아래, 목록 표·결과 0 안내 위"와 일치. 단위 테스트가 `compareDocumentPosition`으로 `안내 줄 → 결과 0 안내` 순서를 직접 고정한다.
- **토큰**: `className="text-aux text-text-secondary"` — ADR-37이 지정한 두 토큰뿐이고 새 색·새 배경·상태색이 없다.
- **조건**: `candidates.length === 0 || hiddenSelected === 0 ? null : …` → N≥1일 때만 그린다.
  - `candidates.length === 0` 추가 가드는 **스펙 위반이 아니다.** 같은 파일 `:177`에서 후보 0명이면 **검색 입력 자체를 그리지 않으므로**, 안내 줄이 기준으로 삼는 "검색 입력 아래"가 존재하지 않는 화면이다. SSE로 후보가 0이 되는 찰나에 선택 잔여로 줄이 뜨는 것을 막는 방어이며 ui-spec의 N=0 규칙과 충돌하지 않는다.
- **검색이 체크·역할을 바꾸지 않음**: `ImportDialog.tsx`의 `query`는 `visibleAgents` 계산에만 쓰이고 `setSelectedNames`·`setRoles`를 건드리지 않는다. 단위 `[ADR-37] 2명 선택 후 결과 0 검색 …`이 검색어를 넣었다 지운 뒤 체크 2개·`agent-03 역할 = lead` 유지를 단언한다.
- **순수 함수**: `lib/derive/importCandidates.ts:56-62` `hiddenSelectedCount(selectedNames, visibleAgents)` — React·전역 상태 참조 없는 순수 함수. `importCandidates.test.ts`가 4가지 경우(0/1/전부/선택없음)를 덮는다. conventions "계산은 `lib/derive/*`" 충족.

### 6-1 캡처 대조 (`docs/reviews/screens/T-FIX-03/` ↔ `docs/reviews/screens/T-018/`)
4장 모두 확인했다.

| 캡처 | 확인 내용 | 판정 |
|---|---|---|
| `05-R-import-dropdown.png` | `?workflow` 없음 · 드롭다운 기본 `개발부서` · 제목 `개발부서(으)로 기존 에이전트 가져오기` · 안내 줄 없음 · `선택한 0명 가져오기` 점선+faint 비활성, 이유 줄 없음 | OK (ADR-38·ADR-37·ADR-35) |
| `05-R-import-dropdown-changed.png` | 드롭다운 `마케팅부서`로 변경 → 제목 `마케팅부서(으)로 …`로 함께 바뀜 | OK (ADR-38) |
| `05-R-import-selected-2.png` | 2명 체크 유지, 역할 `팀원`, 제목 `마케팅부서(으)로 …` | OK |
| `05-R-import-search-no-results.png` | 검색 `zzz` → **`검색으로 가려진 선택 2명`이 검색 입력 아래·`일치하는 에이전트가 없습니다` 위**에 있음. 폭은 `lg` 유지 | OK (ADR-37 위치·문구) |

- T-018 기준 캡처와의 구성·배치 차이는 **없다**(요소 누락·추가 0). 추가된 것은 ADR-37이 승인한 안내 줄 한 줄뿐이고, 나머지 요소 순서·각주 2줄·버튼 배치가 동일하다.
- **Minor(m3) — 캡처 타이밍 아티팩트**: T-FIX-03 캡처 4장 전부에서 `primary` 채움색 `rgb(61,214,140)` 픽셀이 **0개**다(T-018 캡처는 3912px). `선택한 2명 가져오기`가 `selected-2`에서 `rgb(39,113,87)`, `search-no-results`에서 `rgb(25,44,52)`로 찍혔다 — 비활성색 `rgb(23,31,46)`과 primary `rgb(61,214,140)` 사이의 **중간값**이다.
  - **코드 회귀가 아니다**: ① `Button.tsx`·`Dialog.tsx`는 이 태스크에서 미변경 ② 같은 캡처의 `취소`(secondary)는 T-018과 픽셀값이 `rgb(23,31,46)`로 **완전히 동일**해 전역 테마·dim 차이가 아니다 ③ `Button`에 `transition-colors duration-200`이 있어 상태 변경 후 200ms 안에 찍으면 중간색이 나온다 ④ 단위 `[ADR-37] … '선택한 2명 가져오기' 활성`이 `toBeEnabled()`로 활성을 고정한다.
  - 영향: 캡처가 **버튼 활성 상태의 시각 회귀 기준으로는 쓸 수 없다.** 제목·안내 줄 확인이라는 이 태스크의 캡처 목적은 달성했으므로 Minor.

## 7. ADR-38 제목 대상 — 결과: 통과

- `ImportDialog.tsx:75` `const target = workflowName ?? pickedTarget ?? workflows[0]?.name ?? null;`
  `:83` `const title = target === null ? IMPORT_TITLE : importTitleFor(target);`
  → 제목 출처가 `?workflow` ?? 드롭다운 현재 선택값이다(ADR-38 결정 그대로).
- 드롭다운 **기본값 현행 유지**: `workflows[0]?.name`(= `registry.workflows` 첫 항목, api-spec상 name 오름차순). 빈 선택 옵션을 두지 않는다(`:167-171`이 `workflows`만 `<option>`으로 그린다).
- **워크플로우 0개**: `workflows.length === 0`이면 드롭다운 대신 `먼저 워크플로우를 추가하세요` 고정 텍스트(`:156-159`)이고 `target === null` → 제목 `기존 에이전트 가져오기`. ADR-38의 "대상이 하나도 없을 때만 대상 미정 문구" 조건과 일치.
- 드롭다운 변경 시 `changeTarget`이 `setRoles({})`로 행별 역할을 `팀원`으로 되돌린다 — ui-spec SCR-05-R 드롭다운 행의 이동 열("선택 변경 시 제목·`팀장` 옵션 비활성이 갱신되고 행별 `역할`은 `팀원`으로 초기화") 그대로다.
- 단위 3건(`[FR-009-AC7][ADR-38] 기본 선택`, `[ADR-38] 드롭다운 변경 → 제목 변경`, `[ADR-38] 워크플로우 0개`)이 모두 존재하고 tasks.md Done when의 테스트 이름과 일치한다. 캡처 2장으로 육안 확인도 끝냈다.

## 8. T-019 Minor 2건 + `AgentFormFooter` 끌어올림 — 결과: 통과 (단, 8-3 회귀 1건)

### 8-1 Minor 1 — 06 수정 모드 로딩 중 `취소`·`저장`·각주가 비활성으로 **보인다**
- 구조(`AgentForm.tsx:91-138`): `loadError` 분기는 예전 그대로(각주·폼 없이 `닫기`만). 정상 분기는 Fragment 안에서
  `form.loading ? <AgentFormSkeleton/> : <AgentFormBody/>` **다음에 `<AgentFormFooter/>`를 항상** 그린다.
  → 파일을 읽는 동안 스켈레톤은 **필드 영역에만**, 각주·버튼 줄은 **사라지지 않는다**. tasks.md 지시 그대로다.
- 비활성 처리: `AgentFormFooter`에 `loading` prop 신설 → `제거` `disabled={loading}`, `취소` `disabled={pending || loading}`, `저장` `disabled={submitDisabled}`(`submitDisabled = form.loading || form.pending || !requiredFilled(...)`). 셋 다 `Button`의 `DISABLED_CLASSES`(점선 + faint, ADR-29)로 그려진다.
- **이유 줄 없음**(ADR-35): `removeDisabledReason`·`submitDisabledReason`이 `form.loading`일 때 명시적으로 `undefined`다. 단위 `[SCR-06] 수정 모드 로딩 중 취소·저장이 비활성으로 보인다`가 각주 문구 존재 + 버튼 3개 `toBeDisabled()` + 이유 줄 3종 부재를 단언하고, 로딩이 끝나면 `취소`가 다시 활성됨까지 확인한다.

### 8-2 Minor 2 — `소속 워크플로우` 빈 상태의 `htmlFor`
- `AgentFormFields.tsx:57-120`: `workflowPickerMissing = workflows.length === 0 && !allowNoWorkflow`일 때 `Field`의 `htmlFor`를 `undefined`로 주고, 안내 `<span>`에서 `id={ids.workflow}`를 **제거**했다. `<span>`은 labelable 요소가 아니므로 무효 연결이 사라졌다.
- `Field`(`components/ui/Field.tsx`)는 `htmlFor?: string` optional이라 `undefined`면 `for` 속성이 렌더되지 않는다(React 동작). 단위 `[SCR-06] 워크플로우 0개 → '먼저 워크플로우를 추가하세요' 안내`가 `label.tagName === "LABEL"`, `not.toHaveAttribute("for")`, `queryByLabelText("소속 워크플로우") === null`, `저장` 비활성까지 단언한다.
- 입력이 있는 정상 분기에서는 `htmlFor={ids.workflow}`가 그대로여서 접근성 연결에 회귀가 없다.

### 8-3 `AgentFormFooter` 끌어올림의 06 폼 회귀 — 구조는 무해, **테스트 1건에 회귀**
- 레이아웃 회귀 없음: 끌어올리기 전 footer는 `AgentFormBody` Fragment의 **마지막 자식**이었고, 지금은 `AgentForm`의 Fragment 마지막 자식이다. 둘 다 같은 부모 `div.flex.flex-col.gap-4`의 직계 자식이므로 **DOM 순서·간격이 동일**하다. `AgentFormBody`에서 `mode`·`removeDisabledReason`·`submitDisabledReason`·`onRemove`·`onCancel`·`onSubmit` prop 6개가 정리됐고 `requiredFilled` import도 호출부로 옮겨져 타입 검사가 통과한다.
- 판정 로직 동치: 예전 `submitDisabled = pending || !requiredFilled(values, mode)` → 지금 `form.loading || form.pending || !requiredFilled(form.values, mode)`. 로딩 중에는 `form.values`가 비어 `requiredFilled`가 이미 false라 **활성 조건이 넓어지지 않았다**(안전한 방향).
- **그러나 사용자에게 보이는 동작이 하나 바뀌었다**: 06 수정 모드 로딩 중 `워크플로우에서 제거` 버튼이 **예전에는 없었고 지금은 비활성으로 존재**한다. 이는 tasks.md가 지시한 의도된 변경이지만, 이 변경을 전제하지 않은 기존 테스트가 하나 남아 **새 flaky가 생겼다** → 아래 이슈 B-1.

## 9. 교정한 테스트 기대값 7건 — 결과: 전부 ADR 근거, 약화·삭제 없음

`git diff`에서 삭제된 `expect(` 10줄을 전수 대조했다.

| # | 위치 | 이전 → 이후 | 근거 |
|---|---|---|---|
| 1 | `Floor.test.tsx:162` | `dup-agent이 …` → `dup-agent이(가) …` | FR-006-AC11 확정 문구 / ADR-39 |
| 2 | `Floor.test.tsx:167` | 같음 | 같음 |
| 3 | `ImportDialog.test.tsx:247` | `기존 에이전트 가져오기` → `개발부서(으)로 …` | ADR-38(제목 = 드롭다운 선택값) + ADR-39 |
| 4 | `ImportDialog.test.tsx:254` | `개발부서로 …` → `개발부서(으)로 …` | ADR-39 |
| 5 | `ImportDialog.test.tsx:391` | `개발부서로 …` → `개발부서(으)로 …` | ADR-39 |
| 6 | `DialogHost.test.tsx:131` | `기존 에이전트 가져오기` → `개발부서(으)로 …` | ADR-38 + ADR-39 |
| 7 | `DialogHost.test.tsx:143` | `개발부서로 …` → `개발부서(으)로 …` | ADR-39 |

- 나머지 삭제 3줄 + 다중행 1건은 flaky 수정 4곳에서 **위치만 이동**한 단언이다(항목 2 참조).
- **삭제된 `it(`·`describe(` 0건**, `.skip(`·`.only(`·`xit(` 0건. 단언을 느슨한 matcher로 바꾼 곳 없음(`toBe`/`toBeInTheDocument` 유지).
- 테스트 수: 281 → **296** (+15). 줄어든 파일 없음.

## 10. 회귀 · 품질 게이트

| 항목 | 명령 | 결과 |
|---|---|---|
| 단위 테스트 | `cd frontend && npm test` | **52 files / 296 passed** |
| 린트 | `npm run lint` | 통과(출력 없음) |
| 타입 검사 | `npm run typecheck` | 통과 |
| 빌드 | `npm run build` | 통과(118 modules, 102ms) |
| 미완성 코드 | 변경 15파일 `TODO|FIXME|XXX|placeholder|lorem|not implemented|skip|only` | **0건**(검출된 `placeholder`는 전부 HTML 속성명·정적 검사기 어휘) |
| E2E 파일 | `tools/e2e/tests` | `health.spec.ts` 1개만 — 추가 없음 |
| 문서 | `docs/` | `tasks.md`(팀장 작성)만 변경. `api-spec.yaml`·`ui-spec.md`·`architecture.md`·`conventions.md`·`docs/ui/` 미변경 ✔ |
| 계약 | — | 변경 없음(ADR-36~40 모두 "계약 변경 없음") |
| 의존성 | `package.json` | 변경 없음 |
| ADR-40 회귀 | `Dialog` | `Button.tsx`·`Dialog.tsx` 미변경, 05-R·06 폼 `size="lg"` 유지 |

---

# 판정

## VERDICT: **NEEDS_FIX**

태스크 본 목적(ADR-36~39 정합 + ADR-39 위반 제거 + T-019 Minor 2건)은 **9개 항목 모두 충족**했고 문구는 전부 확정 문서와 글자 단위로 일치한다. 사용자 승인 2건도 그대로다.
다만 이번 변경이 **새 flaky 테스트 1건을 만들었고**(부하 조건에서 실측 재현), flaky 제거가 이 보완 라운드의 목적이었으므로 그대로 넘길 수 없다. 수정 범위는 테스트 파일 1줄이다.

## 이슈

### [Major] B-1 — 이번 변경이 `[FR-012-AC5]`에 새 flaky를 만들었다
- **위치**: `frontend/src/dialogs/remove-agent/RemoveAgentDialog.test.tsx:134-135`
- **근거**:
  - 이 태스크가 `AgentFormFooter`를 끌어올려 **06 수정 모드 로딩 중에도 `워크플로우에서 제거` 버튼이 비활성 상태로 DOM에 존재**하게 됐다(`AgentForm.tsx:110-136`, tasks.md "팀장 추가, T-019 리뷰 Minor 1"의 의도된 변경).
  - 그런데 테스트는 여전히
    ```ts
    const openRemove = await screen.findByRole("button", { name: "워크플로우에서 제거" });
    expect(openRemove).toBeEnabled();
    ```
    이다. `findBy*`는 **존재만** 기다리고 **상태는 기다리지 않는다.** 변경 전에는 로딩 중 footer 자체가 없어 `findBy`가 로딩 완료까지 기다렸으므로 항상 활성이었지만, 지금은 비활성 버튼이 즉시 잡혀 `GET` 응답 반영 전에 `toBeEnabled()`가 실행될 수 있다.
  - **실측 재현**(14코어, `yes` 16~20개 부하, 전체 suite):
    ```
    FAIL src/dialogs/remove-agent/RemoveAgentDialog.test.tsx > [FR-012-AC5] …
    Error: expect(element).toBeEnabled()
    Received element is not enabled:
      <button aria-disabled="true"
        class="… bg-transparent text-text-faint border border-border-dashed border-dashed …"
        disabled="" type="button" />
     ❯ src/dialogs/remove-agent/RemoveAgentDialog.test.tsx:135:24
    ```
    현재 트리 전체 suite 42회 중 **2회 실패**(≈5%). pristine 트리에서는 이 줄에서 실패할 수 없다(로딩 중 버튼 자체가 없음) — 즉 **이 태스크가 새로 만든 결함**이며 항목 3의 "원래 잠재한 결함"과는 별개다.
- **수정 방향**: 상태 단언을 재시도 구문 안에 넣는다(이 태스크가 다른 4곳에 적용한 원칙과 동일).
  ```ts
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "워크플로우에서 제거" })).toBeEnabled(),
  );
  const openRemove = screen.getByRole("button", { name: "워크플로우에서 제거" });
  fireEvent.click(openRemove);
  ```
  단언을 지우거나 `findBy`를 `getBy`로 바꾸는 방식은 안 된다(검증 약화).
- **담당**: Frontend

### [Major] B-2 — flaky 검증 조건(`yes` ×4)이 검증력이 없다
- **위치**: 팀장 검증 절차(태스크 프롬프트에 기록된 "CPU 부하(`yes` ×4) 조건에서 10회 연속 전부 통과")
- **근거**: 이 머신은 **14코어**다. `yes` 4개로는 load average가 움직이지 않는다(실측: 3.88 → 4.22). 리뷰어가 같은 조건(`yes`×4, 대상 3개 파일)으로 **pristine 트리**를 10회 돌렸더니 **0/10 실패** — 즉 그 조건은 **고치기 전 코드조차 통과시킨다.** 부하를 코어 수 이상(16~20)으로 올리고 **전체 suite**로 돌려야 pristine이 6/10 실패한다. `yes`×4 10회 통과는 flaky 부재의 근거가 되지 못하며, 실제로 그 조건이 B-1을 놓쳤다.
- **수정 방향**: flaky 검증 기준을 "부하 프로세스 ≥ 코어 수 + **전체 suite** + 20회"로 고정하고 `CLAUDE.md` Commands 또는 리뷰 절차에 적는다. T-017·T-019 리뷰가 같은 결함을 놓친 것도 이 기준 부재 때문이다(항목 3-1).
- **담당**: 팀장

### [Minor] m1 — ADR-39 정적 검사의 우회 경로
- **위치**: `frontend/src/lib/text.test.ts:113-114`(`PARTICLE_ONLY`, `JONGSEONG_MATH`)
- **근거**: probe C 실측 — 조사를 단독 리터럴로 두지 않고 **완성 문장 2개를 분기 반환**하면서 받침 판정을 `charCodeAt`/`codePointAt`/`0xAC00`/`44032` 없이(`normalize("NFD")` + 정규식, `endsWith` 등) 하면 검사기를 **통과한다**. 개발자가 스스로 밝힌 한계와 일치한다.
- **수정 방향**: 필수 아님. 보강한다면 `text.ts`의 문구 생성 함수에 **같은 입력군(받침 있는 이름·없는 이름·영문·숫자)을 넣어 반환값이 동일 문자열인지** 확인하는 성질 단언을 더하는 쪽이 정규식 확장보다 우회에 강하다. 현재도 `[ADR-39] 층 경고는 확정 문구 병기 표기`·`[ADR-39] 받침 있는 이름·없는 이름 모두 '(으)로'`가 결과값을 고정하므로 실질 방어선은 있다.
- **담당**: Frontend(차기 태스크에서 선택적)

### [Minor] m2 — 개발자 보고의 건수 표기가 리뷰어 실측과 다르다
- **근거**: "비-DOM 값을 기다린 뒤 3줄 안에 DOM 단언 **10건** 중 6건은 이미 올바르고 4건만 고쳤다"는 표기. 리뷰어 동일 기준 실측은 pristine에서 비-DOM `waitFor` **17건**, 그중 뒤에 DOM 단언이 오는 것 **6건**(위험 4 + 재시도로 감싼 안전 2)이다. **결론(4건 수정·누락 0)은 동일**하므로 판정에 반영하지 않는다.
- **담당**: Frontend(보고 표기만)

### [Minor] m3 — T-FIX-03 캡처가 버튼 활성 상태의 시각 기준으로 못 쓴다
- **위치**: `docs/reviews/screens/T-FIX-03/*.png` 4장
- **근거**: primary 채움색 `rgb(61,214,140)` 픽셀이 4장 모두 **0개**(T-018 캡처는 3912px). `선택한 2명 가져오기`가 `rgb(39,113,87)`·`rgb(25,44,52)`로 전이 중간색으로 찍혔다. `Button`의 `transition-colors duration-200` 때문이며 **코드 회귀가 아니다**(같은 캡처의 `취소`는 T-018과 픽셀값 완전 동일, `Button.tsx`·`Dialog.tsx` 미변경, 단위 테스트가 `toBeEnabled()` 고정).
- **수정 방향**: 다음 캡처 때 상태 변경 후 250ms 이상 대기하거나 애니메이션을 끄고 찍는다. 이번 태스크의 캡처 목적(제목·안내 줄 확인)은 달성했다.
- **담당**: Frontend

## 다음 태스크(T-020 이후)에 남길 주의사항

1. **`findBy*`는 "존재"만 기다린다. "상태"는 기다리지 않는다.**
   로딩 중에도 요소를 **비활성으로 그리는** 방식(ADR-35·ui-spec SCR-06 `로딩` 열)이 06 폼에 도입됐으므로, 앞으로 로딩을 다루는 화면에서 `await screen.findBy…` 뒤에 `toBeEnabled`/`toBeDisabled`/`toHaveValue`를 **동기로** 쓰면 racy하다. 상태 단언은 `await waitFor(() => expect(...).toBeEnabled())`로 감싼다. (이번에 B-1이 정확히 이 형태다.)
2. **라우터 state와 DOM을 함께 단언할 때는 DOM을 먼저 기다린다.** 팝업 unmount는 라우터 state 변경 뒤 리렌더에서 일어나므로 `await waitFor(() => expect(DOM 부재))` → `expect(router.state…)` 순서가 유일하게 결정적이다. 반대 순서는 금지.
3. **flaky 검증 조건**: 부하 프로세스 ≥ 코어 수, **전체 suite**, 20회. 단일 파일 반복이나 경부하 반복은 6/10 실패하는 결함도 통과시킨다(실측).
4. **조사는 언제나 병기 표기**(`을(를)`·`이(가)`·`(으)로`). 새 문구가 필요하면 구현이 만들지 말고 architect에 확정 요청(conventions §2 MUST, ADR-39). 정적 검사에 우회 경로가 있으므로(m1) 검사 통과를 근거로 삼지 말고 ui-spec 문구를 직접 대조한다.
5. 로딩 중 footer가 그려지는 06 폼 구조 변경(`AgentForm.tsx`가 `AgentFormFooter`를 직접 렌더)은 T-020 이후 06 관련 작업의 전제다. `AgentFormBody`는 더 이상 버튼·각주를 갖지 않는다.

## NEEDS CONFIRMATION
- 없음. 이 태스크 범위는 Frontend 단위 테스트·정적 검사·캡처로 전부 확인 가능했고, 백엔드 기동·E2E가 필요한 항목은 범위에 없다(계약 변경 없음).

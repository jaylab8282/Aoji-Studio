# Review — T-FIX-02 ADR-33·ADR-34 05 팝업 정합 (대괄호 표기 · FR-017-E1 안내 3초)

- scope: task
- Round: 1
- Verdict: **PASS** (Blocker 0 / Major 0 / Minor 3 기록 + 참고 2)
- Date: 2026-09-24
- 대상 변경: `frontend/src/lib/text.ts`, `frontend/src/lib/text.test.ts`(신규), `frontend/src/api/client.ts`, `frontend/src/api/client.test.ts`, `frontend/src/components/ui/ConfirmByNameDialog.tsx`, `frontend/src/components/ui/AgentsDirMissing.tsx(.test)`, `frontend/src/dialogs/workflow-add/WorkflowAddDialog.tsx(.test)`, `frontend/src/dialogs/workflow-delete/WorkflowDeleteDialog.tsx(.test)`, `docs/reviews/screens/T-FIX-02/05-L-workflow-add.png`, `docs/tasks.md`(Status)

## 0. 리뷰어가 직접 실행한 검증
| 명령 | 결과 |
|---|---|
| `cd frontend && npm test` | 46 files / **210 tests** 통과 (T-017 200 → 210, 감소 0) |
| `cd frontend && npm run lint` | 통과(무출력) |
| `cd frontend && npm run typecheck` | 통과(`tsc -b --noEmit`) |
| `cd frontend && npm run build` | 통과(`dist/assets/index-B5C0UKxG.js 376.27 kB`) |
| `grep -rnE "\.(skip\|only)\(\|xit\(\|it\.todo" frontend/src` | 0건 |
| `grep -rn "String(error)" frontend/src` | 0건(`client.ts:6` 주석 인용 1건뿐) |
| 문서 무단 수정 | `docs/` 변경은 `tasks.md` Status 1줄 + 신규 캡처뿐. `api-spec.yaml`·`ui-spec.md`·`architecture.md`·`conventions.md` 무변경. `tools/e2e/tests`는 `health.spec.ts` 1개 그대로 |

## 1. ADR-33 정합 — 충족
| 확인 | 결과 |
|---|---|
| `WORKFLOW_ADD_DESCRIPTION`이 괄호만 벗겨졌는가(글자 단위) | **충족.** ui-spec `SCR-05-L` 제목 행에서 문구를 기계 추출해 코드 상수와 대조 → 두 문자열이 **완전 일치**: `구성 파일 .jaystudio/teams/이름.json(팀장·팀원 목록)이 만들어집니다.` 괄호 안 낱말·소괄호·마침표 모두 보존, 문장 재작성 없음(ADR-33 (c), conventions §2 MUST) |
| 설명 placeholder 유지 | **충족.** `WORKFLOW_DESCRIPTION_PLACEHOLDER === "한 줄 설명"`(ADR-33 (b)). `WorkflowAddDialog.test [ADR-33]`이 `toHaveAttribute("placeholder", "한 줄 설명")`로 회귀 고정 |
| 코드베이스에 남은 자리표시 | **0건.** `frontend/src` 전수 grep — 남은 대괄호는 (1) 주석 속 문서 인용(`App.tsx:7`, `Breadcrumb.tsx:2`, `WorkflowsScreen.tsx:3`), (2) `useState`/deps/배열 문법, (3) 정규식 문자 클래스뿐. 렌더 문자열 0건 |
| `import.meta.glob(..., { query: "?raw" })` 타당성 | **타당.** Vite 6 권장 표기(`as: "raw"`는 deprecated). `eager: true`라 테스트 시점에 원본 텍스트가 상수로 인라인되고, 검사 대상은 `frontend/src` 소스 전부 → 새 파일이 생겨도 자동 포함된다(정적 검사가 목록을 손으로 유지하지 않아도 되는 점이 핵심 이점). `screenSources().length > 30` 가드로 "대상 0건이라 통과"를 막아 둔 것도 적절. 빌드 산출물에 영향 없음(테스트 파일 전용, `npm run build` 통과 확인) |
| 정적 검사가 **실제로** 잡는가 | **잡는다(실측).** 임시 파일 `frontend/src/__probe/a.ts`에 `export const PROBE_A = "구성 파일 .jaystudio/teams/[이름].json";`를 넣고 `text.test.ts` 실행 → **FAIL**, offender에 `../__probe/a.ts: 구성 파일 .jaystudio/teams/[이름].json` 정확히 보고. `src/lib` 밖 경로까지 스캔됨을 확인. 임시 파일은 즉시 삭제(`git status` 원상 확인) |

### 1-1. 정적 검사가 잡지 못하는 우회 경로 (Minor 2, 실측)
같은 방식으로 반례 2종을 넣어 확인했고 **둘 다 통과(= 못 잡음)**했다. 임시 파일은 모두 삭제했다.

| 우회 경로 | 예 | 결과 |
|---|---|---|
| **JSX 텍스트 자식** | `return <p>구성 파일 .jaystudio/teams/[이름].json 이 만들어집니다.</p>;` | 통과(미검출). `stringLiterals()`가 따옴표·백틱 리터럴만 모으므로 JSX 텍스트 노드는 스캔 대상 밖이다. 문구를 `text.ts` 상수로 빼지 않고 JSX에 직접 쓰면 검사를 통째로 비껴간다 |
| **한글 없는 / 꺾쇠 자리표시** | `"읽지 못한 정의 파일 [N]개"`, `"… · <N>초 후 재연결"` | 통과(미검출). `PLACEHOLDER_PATTERN = /\[[^\]\n]*[가-힣][^\]\n]*\]/`가 대괄호 **안에 한글**을 요구하고 `<...>`는 아예 보지 않는다 |

- 판정: **Minor.** tasks.md Done when이 요구한 범위는 "`frontend/src`의 **화면 문구 상수**에 `[`로 시작하는 **한글** 자리표시 0건"이고 구현은 그 범위를 정확히 충족한다. 위 두 경로는 AC 밖이라 NEEDS_FIX 사유가 아니다.
- 다만 conventions §3 MUST는 `[N]`을 금지 목록에 **명시**하고 ADR-33은 `<...>`도 같이 다룬다. T-018이 `선택한 [N]명 가져오기`·`읽지 못한 정의 파일 [N]개`를, T-021이 `[포트]`·`[yyyy-mm-dd hh:mm]`을 구현하므로 **검사 공백이 바로 다음 태스크의 실제 문구와 겹친다**. 후속에서 (1) 패턴을 `/\[[^\]\n]{1,20}\]/` 류로 넓히고 예외(정규식·주석은 이미 제외됨)를 유지, (2) JSX 텍스트도 훑도록 확장(예: `>` 다음 텍스트 노드 또는 최소한 `[가-힣N]` 대괄호 원시 grep 병행)을 권한다. 담당: frontend-developer(T-018에 끼워 넣기 가능).

## 2. ADR-34 / FR-017-E1 정합 — 충족
| 확인 | 결과 |
|---|---|
| `NOT_EMPTY_NOTICE_MS = 3000` = ui-spec 명시값 | **일치.** `WorkflowDeleteDialog.tsx:25` `= 3000` ↔ ui-spec.md:330 "**3초(3000ms)**" / :333 "지속 시간은 **3000ms**". design token 아님, 이름 있는 코드 상수(conventions §7 MUST) |
| 주석 근거 교체 | **충족.** 기존 "CopyButton 1.5초와 맞춘다"(리뷰어가 근거 부족으로 판정했던 문장) 삭제 → "ui-spec.md SCR-05-3이 명시한 3000ms(ADR-34, conventions §7 MUST)"로 교체 |
| 2.9초 미닫힘 / 3.0초 `onClose` 1회 | **충족.** `[FR-017-E1] 409 WORKFLOW_NOT_EMPTY → 3초 후 닫힘` — 가짜 타이머 + 2900ms 시점 `onClose` 미호출·사유 문구 유지 단언, +100ms에서 `toHaveBeenCalledTimes(1)`, 추가 3000ms 더 돌려도 여전히 1회(중복 호출 없음)까지 단언 |
| 안내 중 `삭제` 비활성 · 중복 DELETE 0건 | **충족.** `confirmDisabled={closingAfterNotice}` → `ConfirmByNameDialog.tsx:92` `disabled={!nameMatches \|\| pending \|\| confirmDisabled}`. 테스트가 이름 일치 상태 그대로 **한 번 더 클릭**한 뒤 `expect(calls).toHaveLength(1)` — 버튼 속성만이 아니라 **실제 DELETE 호출 수**를 센다 |
| `취소`·ESC 조기 닫기 | **충족.** 안내 구간에서 `pending === false`라 `취소`는 `disabled={pending}`에 걸리지 않고, `Dialog`의 ESC 핸들러도 그대로. 테스트가 `취소` → `onClose` 1회, 이어 `keyDown Escape` → 2회까지 확인 |
| 이유 줄 미부착 (ADR-35) | **충족.** `queryByText("쓰기 권한 없음")`·`queryByText("팀원을 먼저 제거하세요")` 부재 단언. `confirmDisabled`는 `Button`의 `disabledReason`이 아니라 `disabled`로만 전달돼 구조적으로 이유 줄이 생길 수 없다. `ConfirmByNameDialog` 헤더 주석에도 ADR-35 근거 1줄 추가 |
| 타이머 정리 | **충족.** `useEffect` cleanup `clearTimeout`. `onCloseRef`로 최신 `onClose`를 잡아 effect 재실행 없이 유지(deps `[closingAfterNotice]` 그대로) |

## 3. `confirmDisabled` prop 추가 — 타당
- **`pending` 하나로는 표현 불가한 것이 맞다.** `pending`은 `취소` 버튼(`disabled={pending}`)과 이름 입력(`disabled={pending}`)까지 함께 잠근다. ADR-34는 안내 구간에 "`삭제`만 비활성 + `취소`·ESC는 열려 있음"을 요구하므로 `pending=true` 유지로는 **ADR-34 위반**이 된다. 별도 축이 필요하다는 판단이 옳다.
- **T-019(06-6 `RemoveAgentDialog`) 부담 없음.** `confirmDisabled?: boolean`에 `= false` 기본값 → 기존 호출부(`WorkflowDeleteDialog` 외 현재 0곳)와 미래 호출부 모두 무변경으로 동작. 06-6은 이 prop을 몰라도 되고, 필요해지면 같은 축을 재사용하면 된다. 공통 컴포넌트에 **동작이 아니라 상태 축 하나만** 더한 최소 변경.
- 라벨 처리도 안전: `pending ? confirmPendingLabel : confirmLabel`이라 안내 구간에는 `삭제 중…`이 아니라 원래 라벨 `삭제 (이름 일치 시 활성)`이 남는다(요청은 이미 끝났으므로 맞다).

## 4. conventions §4 / T-017 Minor 4 — 충족
### 4-1. `client.ts`가 모든 예외를 `ApiError`로 정규화하는가 (코드 경로 전수 추적)
| 경로 | 이전 | 현재 | 판정 |
|---|---|---|---|
| `fetchBrowserToken` fetch throw (`:46-50`) | `ApiError` | 동일 | OK |
| `fetchBrowserToken` !ok (`:51-53`) | `toApiError` | 동일 | OK |
| **`fetchBrowserToken` `res.json()` 파싱 실패 (`:54-59`)** | **누수(SyntaxError)** | `try/catch` → `ApiError` | 신규 차단 |
| `getBrowserToken` 공개 출구 (`:74-82`) | 그대로 전파 | `catch → normalizeError` | OK. `:66` 캐시 반환·`:69-70` 진행 중 promise 공유 경로도 `fetchBrowserToken`이 `ApiError`만 던지므로 누수 없음 |
| `toApiError` (`:85-92`) | `ApiError` 보장 | 동일 | OK |
| `sendRequest` 토큰 획득 (`:105`) | — | `getBrowserToken`이 `ApiError`만 | OK |
| `sendRequest` fetch throw (`:109-113`) | `ApiError` | 동일 | OK |
| `sendRequest` 403 재시도 (`:115-122`) | — | 재귀 대상만 `request`→`sendRequest`로 개명 | OK(아래 5절) |
| **`sendRequest` `res.text()` throw (`:131`)** | **누수** | `request` 래퍼가 정규화 | 신규 차단 |
| **`sendRequest` `JSON.parse(text)` SyntaxError (`:135`)** | **누수** | `request` 래퍼가 정규화 | 신규 차단 |
| **`JSON.stringify(body)` 순환참조 throw (`:101`)** | **누수** | `request` 래퍼가 정규화 | 신규 차단 |
| 공개 API `apiGet/apiPost/apiPut/apiDelete` | — | 전부 `request()` 경유 = **단일 출구** | OK |
- **누수 경로 없음.** 모듈이 export하는 함수는 `apiGet/apiPost/apiPut/apiDelete/getBrowserToken/ApiError` 5+1개이고, 던지는 함수 5개 모두 `normalizeError` 또는 `ApiError` 생성으로 끝난다.
- `stream.ts`는 `getBrowserToken`을 두 군데(`:81` `.catch(() => {})`, `:158` `try/catch`) 쓰지만 모두 예외를 삼키고 재연결로 처리 → 오류 종류 변화가 화면에 영향 없음.
- 테스트: `client.test [conventions §4] JSON 파싱 실패·네트워크 예외 → ApiError 정규화`가 (1) 200 + 비-JSON 본문, (2) 토큰 응답 깨짐 + POST 경로, (3) `throw "boom"`(Error 아닌 값) 세 갈래를 각각 `toBeInstanceOf(ApiError)` + `code: NETWORK_ERROR` + 문구 일치로 확인하고, `message`에 `SyntaxError|JSON`이 섞이지 않음까지 단언 — 적절하다.

### 4-2. `String(error)` 제거 · 문구
- `frontend/src` 전체에서 `String(error)` **0건**(유일한 잔존은 `client.ts:6` 주석의 인용).
- 세 호출부 모두 `error instanceof ApiError ? … : UNKNOWN_ERROR_MESSAGE`로 통일: `WorkflowAddDialog.tsx:87`, `WorkflowDeleteDialog.tsx:57`, `AgentsDirMissing.tsx:38`.
- 문구는 **새로 짓지 않았다.** `text.ts:60` `UNKNOWN_ERROR_MESSAGE = "서버에 연결할 수 없습니다 · 다시 시도하세요"` ↔ conventions.md §4 MUST 문장과 글자 단위 동일(가운뎃점 `·` 포함).
- `AgentsDirMissing`의 합성 `다시 읽지 못했습니다 · <message>`도 ui-spec:281·388 표기와 일치(`<message>`는 ADR-33 (a) 치환).
- 각 지점에 단언 존재: `AgentsDirMissing.test [conventions §4] 알 수 없는 오류 → 공통 문구`, `WorkflowAddDialog.test [conventions §4] 형식이 깨진 응답 → 알 수 없는 오류 공통 문구`, `WorkflowDeleteDialog.test [FR-017-E1] 알 수 없는 오류 → 공통 문구` — 셋 다 `TypeError|Failed to fetch|SyntaxError|JSON`이 화면 텍스트에 없음까지 확인한다.

## 5. `client.ts` 회귀 (T-013 산출물, 전 화면 공용) — 이상 없음
- **`ApiError` 동일성 보존**: `normalizeError`는 `error instanceof ApiError`면 **같은 인스턴스를 그대로 반환**한다(새 객체로 감싸지 않음). 따라서 `code`·`fields`·`details`·`message`가 전부 보존되고, `fields.name`(FR-008-E1), `WORKFLOW_NOT_EMPTY`(FR-017-E1), `AGENT_BUSY`, `REVISION_CONFLICT` 등 **코드 분기 호출부는 모두 이전과 동일**하게 동작한다.
- **403 `UNAUTHORIZED_TOKEN` 1회 재시도 불변**: 로직은 한 글자도 안 바뀌었고 재귀 대상 이름만 `request` → `sendRequest`. 공개 API가 `isRetry`를 넘길 수 없게 된 것은 오히려 정합(외부에서 재시도 플래그를 조작할 여지 제거). 기존 `client.test`의 403 재시도·`ApiError` 매핑 테스트 전부 통과.
- **`NETWORK_ERROR_MESSAGE` → `text.ts`의 `UNKNOWN_ERROR_MESSAGE` 이동 영향 없음**: 옛 상수는 `client.ts` 모듈 **private**(export 안 됨)이었고 문자열 값도 동일. 새 상수는 `lib/text.ts`에 단일 정의되어 3개 화면이 같은 값을 참조한다. `client.ts → lib/text.ts` 방향 의존은 architecture 계층(api → lib)과 어긋나지 않고 순환도 없다(`text.ts`는 무의존).
- 회귀 실행: `client.test.ts`·`AgentsDirMissing.test.tsx`·`ConfirmByNameDialog` 사용처·`WorkflowAddDialog`·`WorkflowDeleteDialog` 개별 실행 36/36 통과, 전체 210/210 통과.
- `ConfirmByNameDialog`는 optional prop 1개 추가 외 렌더 구조 무변경 → T-016·T-017 화면 회귀 없음.

## 6. 교정한 테스트 기대값 3건 — 2건 타당, 1건은 **근거 주장이 사실과 다름**
| # | 교정 | 판정 |
|---|---|---|
| (1) `[FR-008-AC3]` 기대 문자열에서 괄호 제거 | ADR-33 확정에 따른 필연적 교정. 기대값을 느슨하게 만든 것이 아니라 **확정 문구로 바꾼 것**이며, 같은 파일에 `[ADR-33]` 전용 테스트가 추가돼 검증 강도는 올라갔다 | 타당 |
| (2) `[FR-017-E1]`을 가짜 타이머 2.9s/3.0s 단언으로 교체 | 교체 자체는 **타당하고 강화**(값 경계·`onClose` 호출 횟수·이후 중복 호출까지 고정). 다만 **"기존 `waitFor(timeout 3000)`가 1500·3000 어느 값에서도 통과해 값 변경을 잡지 못했다"는 주장은 사실이 아니다** — 아래 검증 참조 | 변경 타당 / **근거 주장 오류(Minor 1)** |
| (3) `[FR-017-E2]` 대기 1800ms → 3200ms | 타당. 1800ms는 새 자동 닫힘 창(3000ms) **안쪽**이라 "500은 닫지 않는다"가 검증되지 않는다. 3200ms여야 창을 넘겨 `onClose` 미호출·팝업 유지·버튼 재활성이 의미를 갖는다 | 타당 |

### 6-1. 주장 (2) 직접 검증 결과
`git show HEAD:…/WorkflowDeleteDialog.test.tsx`를 임시 파일로 되살려 **현재 코드(3000ms)** 에 대해 3회 실행:

```
× [FR-017-E1] 409 WORKFLOW_NOT_EMPTY → 문구 표시 후 닫힘  3065ms  (fail)
× …                                                        3065ms  (fail)
× …                                                        3062ms  (fail)
```

- **3/3 모두 FAIL.** `waitFor(..., { timeout: 3000 })`는 `findByRole("alert")` 이후에 시작되므로 컴포넌트 타이머(3000ms)보다 늦게 시작하지만, 폴링 간격(50ms)과 `handleTimeout` 경합 때문에 3000ms 지점에서 **안정적으로 타임아웃**한다.
- 즉 **기존 테스트는 비어 있지 않았다.** 상한을 약 3초로 묶고 있었고, 1500 → 3000 변경을 실제로 잡아냈다. 주장이 성립하는 범위는 "1500 → 2000처럼 3초 **미만**의 변경은 못 잡는다"까지다.
- 판정: 코드·테스트 결과물에는 문제가 없고 새 테스트가 옛 테스트를 모든 면에서 포함(strictly stronger)하므로 **NEEDS_FIX 사유 아님**. 다만 개발 Report의 사실 주장이 틀렸으므로 기록을 남긴다. 임시 파일은 삭제하고 `git status` 원상 확인함. 담당: frontend-developer(보고 정정, 코드 변경 없음).

## 7. 미완성 코드·죽은 분기·새 수치 — 없음
- 변경 파일 전체에 `TODO`/`FIXME`/`XXX`/`lorem`/`not implemented`/빈 함수 본문 **0건**.
- 새 design token·새 색·새 문구 **0건**. 새 수치는 `NOT_EMPTY_NOTICE_MS = 3000` 하나이고 ui-spec 명시값이다(conventions §7 MUST 충족).
- 죽은 분기 없음: `confirmDisabled`는 실사용 1곳 + 기본값 경로, `normalizeError`의 두 분기 모두 테스트가 지난다.
- 운영 코드 경로 Mock 없음(fetch stub은 테스트 파일 안에만).

## 8. 캡처 대조 (`docs/reviews/screens/T-FIX-02/05-L-workflow-add.png`) — 설명줄만 변경
| 요소 | T-017 | T-FIX-02 |
|---|---|---|
| 설명줄 | `구성 파일 .jaystudio/teams/**[이름]**.json(팀장·팀원 목록)이 만들어집니다.` | `구성 파일 .jaystudio/teams/**이름**.json(팀장·팀원 목록)이 만들어집니다.` ✅ |
| 제목 `워크플로우 추가` | 동일 | 동일 |
| `이름` 라벨 · placeholder `개발부서` · 힌트 `이름 중복 불가 · 개수 제한 없음` | 동일 | 동일 |
| `설명 (선택)` · placeholder `한 줄 설명` | 동일 | 동일(회귀 없음) |
| danger-soft 안내 박스 2줄 | 동일 | 동일 |
| `취소`(secondary 실선) + `만들기`(비활성 점선·faint, ADR-29) | 동일 | 동일 |
| 필드 순서·간격·정렬 | 동일 | 동일 |
- 팝업 밖 차이(프로젝트 칩 경로, KPI 카드 값, 배경 화면의 빈 상태)는 **fixture 임시 폴더·뷰포트 차이**에서 온 것이다. 다만 T-017 캡처는 1440×1024, 이번 캡처는 1280×720으로 **뷰포트가 달라 픽셀 diff가 아니라 요소 단위 대조만 가능**했다(Minor 3). 팝업 자체는 폭·내부 배치 모두 동일 비율로 보이며 요소 누락·추가·순서 변경 없음.

## 9. 회귀 — T-013~T-017 산출물 이상 없음
- `AgentsDirMissing`(T-013): 오류 문구 분기 1줄만 변경, 기존 `다시 읽지 못했습니다 · <message>` 경로 테스트 통과. 04-3 배너·스켈레톤 무관.
- `client.ts`(T-013): 5절 참조 — 계약 동작 불변.
- `stream.ts`(T-013): 무변경, `getBrowserToken` 오류 종류 변화가 재연결 로직에 영향 없음.
- `ConfirmByNameDialog`(T-017): optional prop 1개 추가, 기본값 false → 06-6(T-019) 재사용 무부담.
- 01·02·03 화면 테스트 포함 전체 210/210 통과, 감소·삭제 0.

## ISSUES
- **[Minor 1] 개발 Report의 "기존 `[FR-017-E1]` 단언은 1500·3000 어느 값에서도 통과한다"는 주장이 사실과 다름**
  - 위치: (코드 아님) T-FIX-02 개발 Report / `frontend/src/dialogs/workflow-delete/WorkflowDeleteDialog.test.tsx:114` 교정 근거
  - 근거: 리뷰어가 HEAD 버전 테스트를 현재 코드(3000ms)로 3회 실행 → 3/3 FAIL(약 3065ms 타임아웃). 기존 단언은 "약 3초 상한"을 실제로 걸고 있었다
  - 수정 방향: 코드·테스트 변경 불필요(새 테스트가 옛 테스트를 포함하며 더 강하다). 정정 근거는 "옛 단언은 상한만 묶고 **하한(2.9초 시점 미닫힘)과 호출 횟수**를 검증하지 못하며 실행에 3초를 쓴다"로 기록한다
  - 담당: frontend-developer
- **[Minor 2] `text.test.ts` 정적 검사에 우회 경로 2종(실측 확인)**
  - 위치: `frontend/src/lib/text.test.ts:38-66`(`stringLiterals`), `:69`(`PLACEHOLDER_PATTERN`)
  - 근거: conventions §3 MUST가 `[N]`을 명시 금지, ADR-33이 `<...>`도 포함. 리뷰어 반례 실행 결과 JSX 텍스트 자식과 `[N]`·`<N>`은 미검출(통과). tasks.md Done when 범위("화면 문구 상수의 한글 자리표시")는 충족하므로 판정 반영 안 함
  - 수정 방향: 패턴을 한글 조건 없는 대괄호 + `<...>`까지 넓히고(정규식 문자 클래스 오탐은 주석 제거 + `가-힣A-Za-z0-9` 화이트리스트로 흡수), JSX 텍스트 노드도 스캔 대상에 포함. T-018이 `선택한 [N]명 가져오기`를 구현하기 전이 적기
  - 담당: frontend-developer
- **[Minor 3] `[FR-017-E2]`만 실제 3200ms를 대기해 단일 테스트 3226ms(기본 timeout 5000ms 대비 여유 1.77초)**
  - 위치: `frontend/src/dialogs/workflow-delete/WorkflowDeleteDialog.test.tsx:235`
  - 근거: 같은 파일의 `[FR-017-E1]`은 가짜 타이머로 10ms에 같은 목적을 달성한다. 느린 러너에서 flake 여지
  - 수정 방향: `[FR-017-E1]`과 같은 `vi.useFakeTimers()` + `advanceTimersByTimeAsync(3200)` 패턴으로 통일
  - 담당: frontend-developer

## SUGGESTIONS (판정 무관)
- `[FR-017-AC5]`에서 `An update to WorkflowAddDialog inside a test was not wrapped in act(...)` 경고가 난다. 원인은 `WorkflowAddDialog`가 마운트된 상태에서 호출하는 `snapshotStore.reset()`이며 **T-017부터 있던 것**(이번 변경과 무관). `unmount()` 후 `reset()` 순서로 바꾸면 사라진다
- 안내 표시 구간(`closingAfterNotice`)에 확인 이름 `TextInput`은 여전히 편집 가능하다. 동작상 문제는 없지만(`confirmDisabled`가 우선) 입력을 함께 잠그면 상태가 더 또렷하다. ui-spec에 규정이 없어 제안에 그친다
- `stringLiterals()`의 수제 파서는 JSX 안 `don't` 같은 아포스트로피에서 오탐·미탐 여지가 있다. Minor 2를 손볼 때 정규식 병행(원시 `grep` 수준의 2차 방어)을 함께 두면 안전하다

## NEEDS CONFIRMATION
- `ApiErrorCode`의 `NETWORK_ERROR`는 `docs/api-spec.yaml`에 없는 **프론트 로컬 코드**다(`frontend/src/api/types.ts:230`, T-013 산출물). conventions §4 MUST "`code`는 api-spec enum만"은 서버 에러 본문에 대한 규칙으로 읽히고 이번 변경이 만든 상태가 아니라 판정에 넣지 않았다. 다만 이번에 "모든 비-서버 예외 → `NETWORK_ERROR`"로 사용량이 늘었으므로, 문서에 프론트 로컬 코드임을 한 줄 남길지 architect 확인을 권한다
- 캡처 뷰포트가 T-017(1440×1024)과 달라(1280×720) 픽셀 단위 diff는 수행하지 못했다. 요소 단위 대조로는 설명줄 외 차이 없음
- E2E는 실행하지 않았다(이 태스크 범위는 단위 테스트이며 `tools/e2e/tests`는 `health.spec.ts` 1개로 무변경). 05-L·05-3의 E2E-02/E2E-10 시나리오는 아직 미작성 상태 그대로다

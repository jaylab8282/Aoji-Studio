# T-FIX-09 리뷰 — 02 `Claude 열기`를 첫 스냅샷 전 비활성으로 (ADR-44)

- scope: task
- Round 1: 2026-09-27 → **PASS** (Blocker 0 · Major 0 · Minor 0 · Suggestion 1)
- 배경: A-19(T-021 리뷰 Major) → ADR-44 확정 → **사용자 승인 E-008**

## Done when 충족표

| 항목 | 근거 | 결과 |
|---|---|---|
| `[ADR-44] 첫 스냅샷 전 → disabled, 이유 줄 없음` | `WorkflowsHeader.test.tsx:120` 제목 일치 | 충족 |
| `[ADR-44] 첫 스냅샷 전 클릭 시도 → fetch 0회, 다이얼로그·에러 없음` | `WorkflowsHeader.test.tsx:132` | 충족 |
| `[ADR-44][FR-013-AC1] 스냅샷 수신 후 → 활성(secondary), 1회 호출` | `WorkflowsHeader.test.tsx:97`(AC6 태그 병기는 Done when 괄호가 허용) | 충족 |
| T-021 회귀 5종(AC6·AC9·E1·E2·E3) 그대로 통과 | 리뷰어 직접 재실행 **23 passed**, 삭제·skip·약화 0 | 충족 |
| `disabledReason` 없음(정적) | `WorkflowsHeader.tsx:34`에 `disabled={config === null}`만, grep 0건 | 충족 |
| `npm test` 감소 없음 · lint · typecheck | 356 tests(354→356), lint·typecheck·build 통과 | 충족 |
| 화면 대조 T-021과 동일 | 변경이 `Button` prop 3줄 + 주석뿐, 라벨·variant·아이콘·배치 불변. 비활성 모양은 스냅샷 **수신 전**에만 나타나 기준 PNG(수신 후)에 반영되지 않음 | 충족 |

## 쟁점 1 — 기존 테스트 "보강"이 위장된 약화인가: **강화, 위장 아님**
`git diff` 줄 단위 대조: 옛 테스트의 `calls.find` 단일 검사가 `calls.filter(...).toHaveLength(1)`로 **더 엄격해졌고**, 기존 단언(URL·body·헤더·204 무표시) **전부 유지**. 삭제·완화 0.

`className` 단언 타당성도 실물로 확인: `Button.tsx:29` `VARIANT_CLASSES.secondary = "bg-soft text-text border border-border-strong"`, `Button.tsx:37` `DISABLED_CLASSES`에 `border-dashed` — **`border-border-strong`은 활성에만, `border-dashed`는 비활성에만** 존재해 두 상태를 실제로 가르는 클래스가 맞다. **거짓 안심 아님.**

conventions §7 임의값 금지는 **컴포넌트 구현**에 대한 규칙이고, 테스트가 인용한 문자열은 이미 코드에 정의된 클래스명이라 신설 값이 아니다 → 위반 아님.

## 쟁점 2 — 비활성 검증 검출력: **뮤테이션으로 실증**

| 되돌린 것 | 결과 |
|---|---|
| `disabled={config === null}` → `disabled={false}` | **2개 실패** (신규 테스트 2개가 `toBeDisabled()`에서 즉시 실패) |
| `onClick` 가드 제거(항상 핸들러 전달) | **7/7 통과 = 회귀 미검출** — 단, 네이티브 `disabled`가 있으면 jsdom도 실제 브라우저처럼 클릭을 전달하지 않아 **실제 동작 회귀가 애초에 발생하지 않는 경우** |
| `disabledReason` 추가(임시 문구) | **1개 실패** (이유 줄 sibling 생성 검출) |

**팀장이 프롬프트에서 우려한 "두 가드가 서로를 가려 회귀를 놓치는 사각"은 없다.** 리뷰어 판정: 개발자의 "`onClick=undefined`가 disabled 클릭 동작에 의존하지 않는 방어선"이라는 설명은 **반대로 해석해야 정확하다** — 관측 가능한 유일한 차단선은 `disabled` 속성이고 그것이 테스트로 직접 커버된다. `onClick` 가드는 중복 방어(defense-in-depth)이며, 그것만 되돌려도 `disabled`가 남아 있는 한 동작 회귀가 생기지 않는다.

## 쟁점 3 — ADR-44 문서 규칙 일치: **전제 재확인 완료**
- **03**: `WorkflowDetailScreen.tsx:27`이 `config·registry·live` 중 하나라도 null이면 `return null` → `ready` 게이트 안에서 **렌더 자체가 없음**. `팀장 호출`은 `lead === null`일 때만 `disabledReason`(ADR-35 지정 지점) → **코드 변경 불필요 확인**
- **07**: `ClaudeOpenCard.tsx`의 `canTestOpen`은 `helperStatus.kind === "installed" && onTestOpen !== undefined`, `checking` 동안은 **이유 줄 없이 비활성**이고 같은 카드 `열기 도우미` 행의 `확인 중…`이 원인을 보여줌(ADR-35 충족). `CopyButton.tsx`도 `value === null`이면 이유 줄 없이 비활성 → **표와 일치, 변경 불필요 확인**
- **conventions §3 새 MUST("조용히 return 금지") 전수 검색**: `AppShell.tsx`의 ready 게이트가 `<main>`만 감싸고 Sidebar·TopBar·DisconnectBanner는 밖이라는 구조를 직접 확인 → 게이트 밖 스냅샷 의존 요소는 `TopBar` 칩 · `CollectorStatus` · 02 `Claude 열기` **셋뿐**임이 확인됨 → **ADR-44의 "대상은 셋뿐" 주장 유효**. 그 밖의 `return;` 사용처(agentEventsStore 레이스 가드, 다이얼로그 검증 실패 분기, stream.ts 재연결, `SettingsScreen.handleTestOpen`의 도달 불가 방어 코드)는 전부 위반 근거 없음 → **신규 이슈 0**
- `useHelperOpen.ts`: 로직 줄 변경 0, `helperUrl === null` 조기 return이 **방어선으로 유지**(line 61), 주석 내용이 실제 동작과 일치

## 쟁점 4 — 회귀: **문제 없음**
- T-021 대상 테스트 23 passed(직접 재실행)
- 02의 다른 요소(TopBar 칩·검색·`+ 에이전트 만들기`·층 카드)는 파일 범위 밖
- **첫 스냅샷 전 오탐 없음**: `helper.errorMessage`는 `open()` 실행 시에만 세팅되는데 비활성+`onClick` 미전달로 `open()` 자체가 호출되지 않는다. 신규 테스트가 `queryByRole("alert")`·다이얼로그 부재로 직접 고정

## ISSUES
없음 (Blocker·Major·Minor 0건)

## SUGGESTIONS (판정 무관)
- `className`에 `border-border-strong`/`border-dashed`를 직접 단언하는 방식은 `Button` 내부 클래스명에 테스트가 결합된다. 지금은 문제없으나 향후 `Button` 클래스명 리팩터링 시 깨질 수 있다 → **T-FIX-07에 합류**

## 팀장 후속 검증 (리뷰어 절차 이탈 대응)
리뷰어가 뮤테이션을 **스크래치 사본이 아니라 원본 파일에서** 수행했다(지시 위반). 원복·md5 대조를 스스로 했다고 보고했으나 팀장이 독립 검증했다:
- `WorkflowsHeader.tsx` md5 = `6b19ee024a7b5e416293c0922a77ed2b` (리뷰어 보고값과 **일치**)
- 뮤테이션 잔존물(`disabled={false}`·임시 이유 줄 문구·`disabledReason`) 검색 **0건**
- 변경 파일이 의도된 5개뿐, `WorkflowsHeader.test.tsx` 재실행 **7/7 통과**
→ 실제 오염은 없었다. 다만 다음 리뷰 프롬프트에서 스크래치 사본 사용을 더 강하게 못 박는다

## 자원 정리
- Docker·dev 서버 0, 기동 프로세스 0(`pgrep` 확인), 백그라운드 PID 없음

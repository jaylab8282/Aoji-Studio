# 리뷰 — T-FIX-08 07의 04-5에서 `설정 열기` 미표시 (ADR-42)

- 날짜: 2026-09-25
- Scope: task
- **판정: PASS** (Blocker 0 · Major 0 · Minor 2)
- 대상 커밋: `ec82333` (diff로 검증)

## 실행 결과
`npm test` **57 files / 330 tests 통과**(probe 원복 후 재실행 동일) · lint · typecheck 통과. `.skip`·`.only`·`.todo`·`xit(` **0건**. probe 11건 전부 원복, `shasum -c` 6파일 OK, `git stash@{0}`(T-021) 보존 확인.

> 저장소 확인: `Jay_Studio`는 git 저장소가 맞다. T-022 Round 1 리뷰어의 "저장소 아님" 판단은 **오류였음이 확인**됐다.

## 판정 결과

**1. 01·02 회귀 — 없음(전수 확인)**
`AgentsDirMissing` 사용처는 운영 코드 **3곳뿐**: `KpiSection.tsx:52`(기본 `true`), `WorkflowsScreen.tsx:108`(기본 `true`), `ProjectFolderCard.tsx:73`(`false`). 07에서 04-5를 그리는 다른 경로 없음. 03·05·06은 04-5를 쓰지 않음(ui-spec이 지정한 화면은 01·02·07뿐).

**2. 정적 단언 검출력 — probe 11건으로 직접 실증**

| probe | 주입 | 결과 |
|---|---|---|
| M1 `useLocation().pathname` | | 단언 실패 ✔ |
| M2 `useMatch("/settings")` | | 실패 ✔ |
| M3 `window.location.pathname` | | 실패 ✔ |
| M4 `x === "/settings"` | | 실패 ✔ |
| **M5 `"/settings" === x`(역순)** | | **미검출** |
| M6 `x.startsWith("/settings")` | | 실패 ✔ |
| **M7 `useHref(".").includes("settings")`** | | **미검출** |
| M8 조건부 제거(항상 렌더) | | 2 실패 ✔ |
| M9 기본값 `false`로 뒤집기 | | 2 실패 ✔ |
| M10 `useHref`로 렌더 결정 | | 2 실패 ✔ (동작 테스트가 잡음) |

오탐 제거 로직이 **아예 없어** 진짜 위반을 가리는 축소가 없다. `toMatch(/showOpenSettings\s*=\s*true/)` 양성 단언이 있어 `?raw`가 빈 문자열이어도 조용히 통과하지 않는다(M9에서 실제로 깨짐).

**3. `useNavigate` 잔존 — MUST 위반 아님**
conventions §7 MUST 원문은 "공용 컴포넌트가 `useLocation`·`window.location`·라우트 경로를 **읽어 스스로 판정**하지 않는다". 금지 대상은 **경로 판정**이고 `useNavigate`는 버튼의 이동 동작이다. ADR-42도 "라벨·variant·동작은 바꾸지 않는다"로 유지를 명시. **개발자 판단이 맞다.**

**4. 문서-코드 일치 — Round 2 지적 해소**
ui-spec 4곳, conventions §7 MUST, architecture ADR-42 "구현 기준"과 코드가 전부 일치. screen-flow.md:27의 도착지 07과도 모순 없음.

**5. 07 `다시 읽기`(FR-001-AC4) — 유지·동작**
04-5 블록 안의 1개(`toHaveLength(1)` 단언). rescan 성공/실패/로딩 기존 3테스트가 같은 컴포넌트를 검증하고 복구 경로 그대로.

**6. 테스트 품질 — 진짜 검증한다**
`[ADR-42] 기본값 → …` 테스트가 `MemoryRouter`+`Routes`로 **도착 화면 텍스트까지 단언**하고 출발 화면 언마운트도 본다. 기대 문구는 전부 확정 문서 문자열이고 테스트가 `lib/text.ts` 상수를 import해 **자기참조하지 않는다**(좋은 방향). 경쟁 패턴 0건 — 두 분기가 상호 배타라 중간에 둘 다 뜨는 창이 없다.

**7. 미완성 코드·임의값 0건**

## TRACEABILITY
tasks.md T-FIX-08 Done when **6/6 충족**. AC·E 전부 근거 확보.

## ISSUES (전부 Minor)

### [Minor] 01·02의 `설정 열기`를 **화면 수준에서** 지키는 단언이 없다
- 위치: `screens/home/HomeScreen.test.tsx:195`, `screens/workflows/WorkflowsScreen.test.tsx:36`
- 근거: **probe M11** — `KpiSection.tsx`·`WorkflowsScreen.tsx`에 `showOpenSettings={false}`를 주입해도 `npm test` **330 passed**(한 건도 실패하지 않음). 두 기존 테스트는 04-5 **제목만** 단언한다
- 단, tasks.md Done when은 회귀 방지 수단으로 **컴포넌트 단위 테스트**를 지정했고 그건 존재하므로 문서 기준은 충족 → 기록만
- 수정 방향: 두 테스트에 `expect(screen.getByRole("button", { name: "설정 열기" })).toBeInTheDocument();` 1줄씩
- 담당: frontend-developer → **T-FIX-07**

### [Minor] 정적 단언에 회피 경로 2개 (현재 코드 결함 아님, 방어 깊이)
- 위치: `components/ui/AgentsDirMissing.test.tsx:161-164`
- 근거: probe M5(역순 비교)·M7(선행 슬래시 없는 문자열)이 패턴에 안 걸린다. M5는 pathname 획득 수단이 전부 차단돼 실질 도달 불가, M7도 렌더를 좌우하면 동작 테스트가 잡지만(M10) `showOpenSettings && !useHref(...)`처럼 **prop과 AND 결합**하면 정적·동작 단언을 모두 통과한다
- 수정 방향: 패턴에 `useHref|useNavigationType` 추가 + 경로 비교 정규식을 **좌우 양방향**으로 보강
- 담당: frontend-developer → **T-FIX-07**

## SUGGESTIONS
- 이 프로젝트의 정적 단언은 `test/staticRules.test.ts`가 `import.meta.glob(?raw)`로 모아 검사하는 패턴인데, ADR-42 단언만 컴포넌트 테스트에 직접 들어가 있다 → T-FIX-07에서 한곳으로 모으면 규칙을 한 파일에서 대조할 수 있다
- ADR-30(`TopBar`가 라우트를 읽지 않는다)은 같은 층위 MUST인데 **대응 정적 단언이 없다** → 같은 패턴 재사용 권장

## NEEDS CONFIRMATION
- **E2E-06**(architecture.md:342 "01·02의 04-5에는 `설정 열기`가 있고 07에는 없다")은 **미구현** — `tools/e2e/tests/`에 `health.spec.ts`만 있다. T-024에서 ADR-42 문구대로 단언되는지 확인 필요
- 07 캡처의 `열기 도우미 · 확인 중…` 고정은 판정에서 제외(T-021 몫)

# Review — T-FIX-01 ADR-29·ADR-30 공통 컴포넌트 정합

- scope: task
- Round: 1
- Verdict: **PASS** (Blocker·Major 0 / Minor 2 기록)
- Date: 2026-09-23

## 1. ADR-29 (비활성 버튼) — 충족
| 확인 | 결과 |
|---|---|
| 비활성이 variant를 **대체**하는가 | 충족. `Button.tsx:62` `${isDisabled ? DISABLED_CLASSES : VARIANT_CLASSES[variant]}` — 삼항 **배타 선택**이라 비활성 시 `bg-running`·`border-danger-border`가 클래스 문자열에 남지 않음. 이전 `disabled:` 덧칠 방식 제거 |
| 점선 + faint + 배경 없음 | 충족. `Button.tsx:37-38` `bg-transparent text-text-faint border border-border-dashed border-dashed` — ui-spec §공통 `Button`(70·76행)과 1:1 |
| variant 무관 동일 모양 | 충족. `DISABLED_CLASSES` 상수 하나, variant 입력 없음. `Button.test.tsx:44-49`가 4개 variant 클래스 집합을 정렬·직렬화해 **`Set` 크기 1**로 단언(느슨한 `toContain` 아님) |
| `disabled`만 / `disabledReason`만 | 충족. `Button.tsx:54` `Boolean(disabled) || Boolean(disabledReason)`. 테스트가 `secondary`는 `disabled`, 나머지는 `disabledReason`으로 렌더해 같은 집합 확인 |
| 활성 variant 불변 | 충족. `VARIANT_CLASSES` 5행 무변경. 활성 className에서 빠진 건 `disabled:` 의사클래스 3개뿐이라 활성 렌더 결과 무영향 → "byte-identical"은 클래스 문자열 기준으론 부정확(3개 감소)하나 **렌더 결과 기준으론 사실**. 01·02 캡처에서 활성 버튼 영역 diff 0px |
| 새 색·토큰·임의값 | 없음. `--color-border-dashed`·`--color-text-faint` 모두 기존 토큰. diff에 임의값·hex 리터럴 없음 |

## 2. ADR-30 (프로젝트 칩) — 충족
- `TopBar.tsx`에 `useLocation`·`useMatches`·`pathname`·경로 비교 **없음**(grep 확인) → conventions §7 MUST 충족
- 결선: `router.tsx` handle(`/`·`/workflows`만 `true`) → `App.tsx:26` → `AppShell.tsx:28` → `TopBar`. `breadcrumb`·`rightExtra`와 동일 패턴, 새 메커니즘 없음
- 기본값 `false`가 안전한 선택: 누락 시 "칩 안 보임"(기준 PNG 일치)인 반면 기본 `true`면 새 화면마다 기준에 없는 요소를 추가하는 실패가 된다. `TopBar.test.tsx:36-41`이 미지정 시 미표시 단언
- ADR-32 예외 유지: 칩 스켈레톤이 로컬 `ProjectChip`(`TopBar.tsx:37-49`)에 살아 있고, off일 때 **스켈레톤도 안 나옴**까지 단언(`:32`·`:40`) — 칩 없는 화면에 스켈레톤만 남는 실수를 막음

## 3. 회귀 — 이상 없음
- `npm test` 41 files / **175 tests** 통과(리뷰어 직접 실행). `.skip`/`.only`/`xit` 0건. 166 → 175(+9 = Button 3 + TopBar 4 + router 2), 삭제·감소 없음
- **"기존 166개 기대값 미교정" 보고는 사실**: 수정된 테스트 파일은 `router.test.tsx` 하나이고 기존 4개 본문은 diff상 무변경(변경은 헬퍼·import·신규 2개뿐)
- **왜 그대로 통과하는가**: 비활성 버튼 기존 단언은 전부 **동작 수준**(`Floor.test:171-186`, `SummaryBar.test:29-54`, `FilterBar.test:22-25`, `Header.test:67-71`, `Panel.test:199-222`가 `toBeDisabled()` + 사유 문구만). 클래스·시각 표현 단언은 애초에 0건. 이는 느슨함이 아니라 **책임 분리가 맞는 구조**(화면 = 비활성 여부·사유, 공통 표현 = `Button` 단위 테스트). 다만 그 `Button` 단위 테스트가 T-014에서 누락돼 있었고 이번에 생겨 공백이 메워짐. 칩 단언 테스트는 존재하지 않았음
- **`router.test.tsx` 변경은 검증 강도 상승**: 기존 헬퍼는 손으로 복제한 표라 실제와 이미 어긋나 있었다 — 브레드크럼이 `SIDEBAR_TAB_*` 상수가 아닌 리터럴, `/workflows`의 `rightExtra` 누락, `*` catch-all 누락. 이제 실제 `routes`를 써서 handle 결선 회귀가 잡힌다. `routes` export도 타당(단일 소스 유지, 테스트만 `createMemoryRouter`로 재사용)
- 04-3 배너·공통 스켈레톤·브레드크럼·`rightExtra`: `AppShell`은 prop 통과 변경뿐, `DisconnectBanner`·`ready ? children : <AppShellSkeleton/>` 무변경. 02 상단바 `Claude 열기` 정상
- `TopBar`는 `AppShell`에서만 렌더(grep). 04~07 팝업 미구현이라 영향 없음
- **부수 영향 1건(결함 아님)**: `AgentsDirMissing.tsx:53` `재검사`가 `disabled={rescanning}`(사유 없음)이라 요청 중 잠깐 점선·faint로 바뀐다. ADR-29의 의도된 귀결이고 SCR-04-5에 반하는 표기 없음

## 4. 캡처 재대조 — 검증됨 (임계값 8, RGB 채널 최댓값)
| 대조 | diff | 판정 |
|---|---|---|
| T-015/02 ↔ T-FIX-01/02 | 0.472%, **밴드 4개**: y309-342 x1221-1269(A층 `삭제`), y723-756 x458-507·840-888·1221-1269(B·C·D층 `삭제`), y946-986(수신 시각) | 주장 그대로. ADR-29 영역 + 시계뿐. **상단바 diff 0 → 칩 유지** |
| T-016/03 ↔ T-FIX-01/03 | 0.976%: y19-44 x522-793(**칩 제거**), y788-829·838-879 x1065-1147(패널 버튼 2개), 나머지 데이터 | 주장 그대로 |
| T-015/01 ↔ T-FIX-01/01 | 3.246%이나 **전부 텍스트 내용 차이**(KPI 시각·카드 설명·이벤트 22행). 구조·테두리·칩·버튼 영역 diff 0 | 01은 ADR 영향 없음 — 일치 |

- **비활성 표현 육안**: 02 `삭제`가 danger-soft 붉은 채움 → **배경 없음 + 점선 + faint + 사유**. 03 패널 `정의 수정`(primary)·`제거`(danger) 둘 다 같은 모양. 같은 화면 활성 버튼은 모양 그대로
- **칩 유무**: 01 있음 / 02 있음 / 03 없음 / 07 없음. 03 상단바 구성이 기준 PNG와 일치
- **남은 차이는 전부 확정 예외 안**: 02 `삭제`는 ADR-25, 03 패널 세로 스택·비활성 모양은 ADR-28 ③, 서브에이전트 칸·StatusDot·name 글꼴·칩 문구는 ADR-28 ①②④⑤. **목록 밖 새 차이 0건이며, 03 칩 제거는 기준과의 차이를 하나 없앤 방향**
- fixture 조건이 화면별로 다른 KNOWN ISSUE는 타당(직전 확정 캡처와 1:1 diff로 변경 영역을 좁히는 목적, 실제로 02·03에서 픽셀 단위 특정 성공). 단 01은 fixture 텍스트가 달라 **구조 동일성까지만** 보증(그 범위에선 이상 없음)

## Issues (Minor 2 — 기록)
1. **`DISABLED_CLASSES`의 `opacity-100`은 무효 잔재** (`Button.tsx:38`) — 기존 `disabled:opacity-100`은 Tailwind 기본 비활성 투명도를 되돌리려던 것이나 `base.css`·`theme.css`에 해당 규칙이 없어 현재 무효. 제거하거나 주석 한 줄. 담당: Frontend
2. **활성 variant 단언이 비활성보다 약함** (`Button.test.tsx:82-106`) — 비활성은 클래스 집합 동일성(`Set` 1)인데 활성은 `toContain` 포함 관계라 **클래스 추가 회귀를 못 잡는다**. 활성도 `toEqual`로 집합 고정 권장. 이번 판정 미반영(캡처 픽셀 대조로 불변 실증). 담당: Frontend

## 회귀 영향 정리 (done 태스크)
- T-013(`TopBar`·`AppShell`) 칩 결선 변경 — 회귀 없음
- T-014(`Button`) 비활성 표현 변경 — 01 표시 무변화, 회귀 없음
- T-015(02) `삭제`·`가져오기` 비활성 표현만 변경 — 그 외 픽셀 동일, 회귀 없음
- T-016(03) 칩 제거 + 패널 버튼 표현 — 둘 다 ADR 의도대로, 회귀 없음

## Suggestions
- `router.test.tsx`가 실제 `routes`를 쓰므로 `*` → `/` 리다이렉트 테스트를 2줄로 추가 가능(T-013부터의 공백, 이번 범위 아님)
- 이후 캡처는 01·02·03을 같은 fixture 실행에서 한 번에 찍으면 화면 간 데이터 일관성까지 대조 가능(T-024 권장)

## Needs Confirmation
- `T-016/03-workflow-detail-collector-down.png`(04-4 변형)는 재캡처되지 않았다. 이 화면에도 비활성 패널 버튼이 나오지만 ADR-27 판정 경로(`live.status`)는 이번 변경과 무관하고 모양은 일반 03 캡처로 검증됨 → 결함 아님. **팀장 판단: T-024 공식 스크린샷에서 함께 갱신**
- E2E·전체 스택 기동은 scope(task) 밖 → T-024

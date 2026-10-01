# T-FIX-12 리뷰 — 02 책상 이름·상태 글자 칸 폭 clamp + span-1 부모 접미 실측 (A-24 2, ADR-50 B)

- VERDICT: **PASS** (Round 1, fix 0회)
- SCOPE: task
- 날짜: 2026-09-29
- Blocker 0 / Major 0 / Minor 5(전부 문서·기록 성격) / NEEDS CONFIRMATION 3

## 0. 결론 요약

- **최우선 항목(팀장 배지 −36px)은 픽셀 실측으로 독립 검증했고 개발자 주장이 맞다.** 배지는 기준에서 멀어진 것이 아니라 **기준 쪽으로 붙었다**. Major 아님.
- 이 태스크의 핵심인 **"투영 → 실측" 전환이 실제로 이뤄졌다.** 리뷰어가 테스트 코드가 아니라 **그 실행이 남긴 캡처 PNG를 직접 픽셀 측정**해 교차 확인했다(겹침 0, 글자 폭 64px ≤ 열 폭 75px, 13자 부모 라벨도 동일).
- **겹침 판정 방식 변경(요소 상자 → 그려진 글자 범위)은 약화가 아니라 강화다.**

## 1. 리뷰어가 실행한 것

재실행 금지 지시를 지켜 frontend 테스트·lint·typecheck·build, `tools/replay`, 전체 E2E는 다시 돌리지 않았다(팀장이 직접 실행해 확인한 분). 대신:

| 수단 | 내용 |
|---|---|
| `git diff`/`git status` | 변경 11파일 + 신규 2경로. 설계 문서·`docs/ui/`·Backend·`showcase.jsonl` 무수정 확인 |
| PIL 픽셀 측정 | 기준 PNG·변경 전 캡처(`git show HEAD:`)·변경 후 캡처·리뷰 캡처의 **팀장 배지·책상 상판·상태 글자 좌표 실측** |
| PIL 전체 픽셀 diff | 01·02·03 공식 캡처의 변경 전/후 차이 영역 전수 열거 |
| 코드 판정 | `paintExtent`·`statusOverlaps`의 CSS 의미, 검출력 두 경로, 선택자 회귀, 배치 격리 |

산출물: `docs/reviews/screens/T-FIX-12/badge-compare-baseline.png`·`badge-compare-impl.png`(확대 4배 nearest-neighbor, 원본 crop 120×60 → 480×240). 자홍색 = 책상 상판 왼쪽, 청록색 = 팀장 배지 왼쪽. **팀장이 육안 확인함 — 두 이미지의 선 간격이 동일하다.**

## 2. 최우선 판정 — 팀장 배지 이동 (개발자 KNOWN ISSUE 3)

### 실측값 (1440×1020 캡처, px)

| 층 카드 | 기준 PNG 배지왼쪽−상판왼쪽 | 변경 **전** | 변경 **후** |
|---|---|---|---|
| 카드1(span-3) | **−36** (293 vs 329) | −6 (343 vs 349) | **−36** (313 vs 349) |
| 카드2(span-1) | −17 (293 vs 310) | −6 (321 vs 327) | −14 (313 vs 327) |
| 카드3(span-1) | −17 (674 vs 691) | −12 (1078 vs 1090) | −14 (1076 vs 1090) |

1. **개발자의 −36px 주장은 참이다.** 카드1에서 기준 −36px, 변경 후 −36px로 정확히 일치(변경 전 −6px).
2. **모든 카드에서 기준에 가까워졌다.** 카드2: 차 11px → 3px. 카드3: 5px → 3px. 기준에서 멀어지는 변화가 아니다.
3. **배지가 더 이상 글자 폭에 흔들리지 않는다.** 변경 전 오프셋은 −6/−6/−12로 제각각이었다(루트 `w-fit` 폭 = 그 책상 글자 중 넓은 쪽에 종속). 변경 후는 세 카드 모두 **배지 왼쪽 = 그리드 칸 왼쪽 끝(정확히 0px)** — `-left-1`(−4px) + 칸 `p-1`(+4px)의 산술과 실측 일치(313 = 313). 기준 PNG도 배지를 **칸 왼쪽 기준**으로 둔다 → 구현이 기준의 배치 모델과 같아졌다.
4. 남는 차이는 칸 왼쪽 기준 2.5~3.2px뿐이고, ADR-48 C가 이미 면제한 pitch 차이에서 파생된 간격 차이다.

→ **Major로 올리지 않는다.** 다만 ADR-50 B의 "레이아웃 이동 0건" 서술은 사실과 다르므로 문서 정정 + Final Report 기록이 필요하다(Minor 2).

### 02 공식 캡처의 다른 변화 — 전수 확인

변경 전/후 전체 픽셀 diff = **4개 영역, 2,366px뿐**: 상단 시각 표기 / **카드1 배지 이동** / **카드2·3 배지 이동** / 하단 시각 표기.
즉 **책상·이름 칩·상태 글자·격자·줌·미니맵은 전부 픽셀 동일**하다. "스프라이트 좌우 위치 불변"(ADR-50 B)은 실측으로 참이다. 01·03의 변화도 시각 문자열 영역뿐이고 03 `OfficeSprite` 배지는 이동하지 않았다(범위 밖 유지).

## 3. 실측이 진짜 실측인지 — 성립한다

`docs/reviews/screens/T-FIX-12/02-span1-parent-video-lead.png`(4명): 층 카드 `video-team` **4열 한 줄**, 가운데 두 책상만 `작업 중 · 부모 …`(CSS 말줄임 확인) → **접미 책상이 인접 두 열에 실제로 있다**. 상태 글자 x 113–176(64px), x 188–251(64px), **사이 12px, 겹침 0**. 열 pitch 75px 대비 64px ≤ 75px.

`02-span1-parent-vid-parentxyz.png`(5명): 첫 줄 `video-lead · vid-pare…(13자, 칩도 잘림) · video-02 · video-03`, 둘째 줄 `video-04` → 측정 대상 두 책상은 여전히 첫 줄 인접 열(FR-006-AC1 정렬 성립). 상태 글자 x 188–251, x 263–326, **간격 12px, 겹침 0**, 각 64px ≤ 75px.

| Done when | 판정 |
|---|---|
| ① 접미 실재 (`toMatch(/^작업 중 · 부모 .+$/)`, 두 책상 각각) | ✓ 겹침 단언보다 **먼저** 고정해 공허하지 않다 |
| ② 인접 열 = pitch 1칸 | ✓ |
| ③ `statusOverlaps() === []` | ✓ 캡처 실측으로도 확인 |
| ④ 폭 ≤ 열 폭 + 1px | ✓ 실측 64 vs 75 |
| ⑤ 13자 라벨도 ③④ | ✓ |
| ⑥ 로그가 실측 | ✓ 판정 단언보다 먼저 기록. 기존 m6 로그의 "투영" 문구도 정정 |

**공허화 방지 장치**가 하나 더 있다: `statusScrollWidth > statusClientWidth`(clamp가 실제로 걸렸음). 이것이 없으면 ③④는 "원래 짧아서 안 겹쳤다"와 구분되지 않는다.

재생 시나리오(8줄)는 README 대응표와 줄 단위 일치, `e2e-13`이 줄 수를 단언. fixture 생성·복구(`finally` + 화면 재확인)도 닫혀 있다. `e2e-13`은 **배치 8 단독**(전용 컨테이너)이라 남는 live 상태가 다른 배치를 흔들 수 없다.

## 4. 겹침 판정 방식 변경 — 약화 아님, 강화다

`paintExtent()`: `Range.selectNodeContents(el).getBoundingClientRect()`로 **그려진 글자 상자**를 잡고 조상 중 `overflow-x: hidden`인 상자와 교차.

1. **"상자 기준이 공허해진다"는 논리는 맞다.** 변경 후 상태 줄 상자는 항상 `w-full` = 칸 폭이므로 칸끼리 겹칠 수 없다 → 상자 기준 `statusOverlaps()`는 **구조적으로 영원히 `[]`**. 그대로 뒀다면 그것이 공허한 통과였다.
2. **기존 m6 단언을 약화시키지 않았다.** 변경 전에는 shrink-to-fit이라 요소 상자 ≈ 글자 상자 → 새 방식은 그 지점에서 **동치**.
3. **새 방식은 clamp 회귀를 잡는다.** `truncate`가 사라지면 `overflow-x: hidden` 조상이 없어져 `paintExtent`가 잘리지 않은 실제 글자 범위를 돌려주고 즉시 겹침이 검출된다. **검출 지점을 유지하기 위한 필수 변경**이다.
4. 부수 강화: 이름 칩에 `labelWidth ≤ pitch + 1` 단언이 새로 붙어 m6는 순증.

## 5. 검출력 — 코드·CSS 의미로 독립 판정

- **① 루트 `w-fit` 복원** → 상태 줄이 `nowrap`이라 min-content = max-content = 96.67px가 되어 `fit-content`가 칸 폭(66.8px)으로 줄지 못한다 → 칸 밖으로 번지고 clamp가 자를 것이 없어진다 → `paintExtent`가 96.67px를 돌려주고 **③ FAIL**. 겹침 쌍을 산술로 세면 `video-02↔video-03`(≈21.7px) + `video-03↔video-04`(≈0.7px) = **2건**으로 개발자 보고와 **리뷰어 독립 예측이 일치**한다.
- **② `truncate` 제거** → 두 줄로 접힌다 → 글자 범위는 칸 안이므로 ③④는 통과하지만 **`statusScrollWidth > statusClientWidth`(clamp 실효 단언)가 FAIL**한다. **검출은 된다.** 다만 개발자가 보고한 "② 인접 열 단언 FAIL"은 분석과 맞지 않는다 — 같은 줄 책상의 `centerY`는 접힘과 무관하다 → **검출 여부가 아니라 보고 문구의 정확도 문제**(Minor 4).
- **원본 md5 복구**: 실험 아티팩트가 남지 않아 대조 자체는 확인 불가. 현재 트리 diff에 의도된 변경만 있고 `w-fit` 0건·`truncate` 세 자리 제자리 → 사실상 복구됨(NEEDS CONFIRMATION 1).

## 6. KNOWN ISSUE 2 — 이름 칩 clamp를 줄 블록에 건 해석: **부합한다**

- `Tooltip`이 만드는 `<span title>`은 **inline 박스**이고, CSS상 **non-replaced inline 박스에는 `overflow`가 적용되지 않는다** → "안쪽 span에 두면 `nowrap`만 먹어 13자 이름이 81.91px로 번졌다"는 실측은 **CSS 명세대로의 결과**다(수치도 T-024 m6 계열과 정합).
- `inline-block` 전환 시 **`overflow`가 `visible`이 아닌 inline-block은 기준선이 마진 박스 하단**이 되어 세로로 밀린다 — "2px 이동"도 명세대로다. 기준 캡처를 깨지 않으려 피한 판단이 타당하다.
- 실제로 **칸 폭을 받는 요소는 줄 블록**이고, 거기에 clamp를 건 것은 MUST가 금지한 "폭 제약 없는 래퍼"와 정반대다. 효과 확인: 2단계 캡처의 `vid-pare…`는 `ellipsis.ts`의 `vid-parentxy…`를 **CSS가 한 번 더 자른** 모습이다.
- `Tooltip`은 네이티브 `title`만 렌더하므로 조상 `overflow: hidden`이 툴팁을 가리는 부작용도 없다.

## 7. DOM 텍스트 불변 회귀

- `DeskSprite`는 `agentStatusWithParent()` 결과를 **그대로** 렌더하고 글자 수 상수 자르기 0건 → `e2e-04`의 `exact: true` 단언과 `STATUS_LINE_PATTERN`은 구조적으로 영향 없음. 02 캡처에서 **상태 글자 픽셀이 완전 동일**한 것이 뒷받침.
- 선택자 회귀: 이름 칩이 `div` 안으로 들어가 깨질 `xpath=../span[@title]`을 `spriteBox(...).locator("span[title]:has(span)")`으로 **정확히** 좁혔다(상태 줄 `title`은 자식 span이 없어 제외 → strict 위반 없음). 단언 내용 불변.
- 삭제·skip·약화 0: `DeskSprite.test` 3 → **7**, `Floor.test` 14 → **15**, `replay.test.mjs` +3. `.skip`/`.only`/`todo` 0건. 프런트 +5·replay +3이 팀장이 받은 389·34와 정확히 일치.
- 새 단위 테스트는 전부 관찰 가능한 동작 단언을 갖는다. 빈 본문·항상 참 단언·고정 대기 0건.

## 8. hover·focus 면적 확대

`Floor.tsx`의 `<button>`에 `w-full min-w-0`만 추가됐고 `hover:bg-selected focus-visible:bg-selected`·`rounded-control`·`p-1`·`justify-items-center`는 **문자 그대로 불변**(diff + `Floor.test` 새 단언이 고정). ADR-46 A·ADR-49에 걸리는 항목 없음(새 색·토큰·임의값·`transition` 0건). 다만 배경 **면적**이 칸 전체로 넓어지는 것은 가시 변화다(Minor 3).

## 9. KNOWN ISSUE 1 — "21.83px 가림"은 투영이었다 (별도 분류)

**개발자 실측이 맞다(CSS 의미로 독립 검증).**

변경 전: 루트 `w-fit`, 책상 칸 `<button>` 폭 지정 없음, 상태 줄에 `nowrap` 없음.
→ 루트 폭 = `fit-content` = `min(max-content, max(min-content, 가용폭 66.8px))`. 상태 줄은 **공백이 있어** min-content = 가장 긴 낱말(`dev-lead`·`vid-parentxyz` 모두 66.8px 이하)이므로 루트는 칸 폭으로 줄고 **글자가 두 줄로 접힌다.** 가로로 번져 이웃 글자를 덮는 일은 발현되지 않는다.

> 참고: 같은 산술에서 **이름 칩**은 공백이 없어 min-content = 81.91px이므로 13자 이름일 때 실제로 칸 밖으로 번졌다 — T-024 m6이 잰 그 현상이다. 즉 **"번짐"은 이름 칩에서, "접힘"은 상태 줄에서** 일어났다.

→ ADR-50 B 배경·`ui-spec.md` SCR-02 확정된 차이 3항·`conventions.md` §7 MUST 이유·`tasks.md` T-FIX-12 배경의 **"21.83px 글자-위-글자 가림"은 발현된 적 없는 투영**이다. 문서 정정 필요(architect, Minor 1).
**처방과 결과는 여전히 유효하다**: ① 두 줄 접힘은 행 리듬을 깨는 배치 차이 ② 이름 칩 번짐은 실재 ③ 부모 라벨의 낱말 하나가 66.8px를 넘으면 가림도 실제 발생 — clamp + `title`은 셋을 모두 닫는다. **결정을 되돌릴 이유는 없다.**

## 10. TRACEABILITY

| ID | 근거 |
|---|---|
| FR-006-AC10 | `DeskSprite.test` 2건 · `Floor.test` 1건 · `e2e-13` 실측 ①~⑥ · **리뷰어 픽셀 실측**(캡처 2장, 겹침 0 / 64px ≤ 75px) |
| FR-006-AC4 | 기존 12자 말줄임 + `title` 테스트(불변 통과) + 신규 "이름 칩 줄도 칸 폭 clamp" · `e2e-13` m6 `labelWidth ≤ pitch+1` · 캡처의 `vid-pare…` |
| FR-006-AC1 | `e2e-13` 책상 순서 단언 2회(4명/5명) 유지 |
| FR-006-AC3 | DOM 텍스트 무변경(02 캡처 상태 글자 픽셀 동일) · `exact: true`·`STATUS_LINE_PATTERN` 유지 |
| FR-003-AC9 | `replay.test.mjs` 신규 파일 검증(+3) |

## 11. ISSUES

- **[Minor 1] 확정 문서의 "21.83px 글자-위-글자 가림"이 발현되지 않는 투영값** — 위치 `architecture.md` ADR-50 B 배경 · `ui-spec.md:274` · `conventions.md` §7 MUST 이유 · `tasks.md` T-FIX-12 배경. 정정 방향: "span-1에서 상태 줄이 두 줄로 접혀 행 리듬이 깨지고, 이름 칩은 실제로 칸 밖으로 번졌다(T-024 m6). 낱말 하나가 칸 폭을 넘으면 가림도 발생한다". **처방·결론은 유지.** 담당 **architect**(문서만)
- **[Minor 2] 팀장 배지 앵커 변경이 ADR-50 B의 "레이아웃 이동 0건" 서술과 어긋난다** — 기준 대조 결과가 **개선**이므로 되돌리지 않는다. ADR-50 B 가시 변화 목록에 "배지 기준이 책상 상판 → 그리드 칸 왼쪽으로 바뀌어 기준 PNG 배치에 근접(−36px 일치), 글자 폭에 흔들리지 않게 됨"을 추가 기록. 담당 **architect**(문서) + **lead**(Final Report)
- **[Minor 3] hover·focus 배경 면적이 칸 전체로 넓어진다**(클래스·색 불변, 위반 아님) — 코드 변경 없음, 가시 변화로 기록. 담당 **lead**
- **[Minor 4] 검출력 보고 문구 부정확** — `truncate` 제거를 잡는 것은 ②(인접 열)가 아니라 clamp 실효 단언이다. 검출 자체는 성립하므로 코드 변경 없음, 기록만 정정. 담당 **lead**
- **[Minor 5] 태스크 ID 경로가 영구 E2E 테스트에 하드코딩** — `e2e-13.spec.ts:92` `REVIEW_SCREENSHOT_DIR = docs/reviews/screens/T-FIX-12`. 위반은 아니나 T-FIX-12 종료 후에도 매 실행이 이 폴더를 다시 쓴다. 상수 이름을 태스크 중립(`02-span1-clamp`)으로 바꾸거나 `tools/e2e/screenshots/`로 옮기기를 권함. 담당 **Tools**(Suggestion 수준)

## 12. SUGGESTIONS

1. `docs/reviews/screens/T-FIX-12/02-workflows.png`는 커밋된 `tools/e2e/screenshots/02-workflows.png`와 **다른 실행본**이다(md5 불일치, 좌표는 동일). 어느 쪽이 공식 산출물인지 헷갈릴 수 있으니 파일명에 출처를 적거나 생략해도 된다.
2. `conventions.md` §7 MUST의 "그 요소 자신"에 ADR-50 B의 한정("**칸 폭을 받는** 그 요소")을 그대로 옮기면 이번 같은 해석 논쟁이 사라진다(architect, 한 구절).
3. `paintExtent`는 글자가 clip 밖으로 완전히 나가면 `left > right`가 될 수 있다. 현 fixture에서는 발생하지 않지만 폭이 0이면 겹침 판정에서 제외하는 한 줄을 두면 더 안전하다.

## 13. NEEDS CONFIRMATION

1. **검출력 실험의 원본 md5 전후 대조** — 스크래치 사본·로그가 남지 않아 실험 재현은 못 했다. 코드 판정으로 두 경로 FAIL은 확인했고 현재 트리는 정상이다.
2. **전체 E2E 107 passed / `e2e-13` 7 passed** — 재실행하지 않았다. 캡처 3장과 공식 캡처 4장이 **같은 시각(16:00)에 생성**됐고 내용이 새 테스트가 도달시켜야 하는 상태와 정확히 일치하므로 배치 8이 끝까지 실행된 정황 증거는 강하다.
3. **`$TMPDIR/jaystudio-outside*` 3개(9월 28일)** — 이 태스크 이전의 잔여물. 리뷰어가 만들지 않았고 삭제하지 않았다. → **팀장이 정리함**(D-072 선례와 같은 우리 자동화의 임시 사본).

## 정리

`lsof -nP -iTCP:4185 -iTCP:4191 -iTCP:4192` → 리스너 0, `docker ps` → 없음. 리뷰어가 만든 프로세스·컨테이너·임시 fixture 0건(스크래치 스크립트만 세션 스크래치패드).

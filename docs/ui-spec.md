# Jay Studio — UI Spec

- 기준: `docs/ui/` (screens 01·02·03 PNG, design-tokens.md, ui-rules.md, pixel-sprites.md, screen-flow.md), 와이어프레임 `docs/JayStudio_Front_Wireframe.pdf` p.4~7 (04·05·06·07 구성)
- 데이터 출처 표기: `snapshot.<경로>` = `api-spec.yaml` `Snapshot`(SSE `snapshot`/`registry`/`live` 메시지로 갱신), `GET <경로>` = REST, `정적` = 고정 문구
- 네 가지 상태 열(빈 / 로딩 / 에러 / 연결 끊김)에서 `-`는 "그 상태가 없음(요소가 항상 값을 가짐)"을 뜻한다.
- 이 문서의 문구 안에 있는 `[...]`·`<...>`는 **문서 표기**이며 화면에 그대로 나오는 글자가 아니다. 렌더 형태는 아래 §공통 "화면 문구의 `[...]`·`<...>` 표기"(ADR-33)가 정한다.

## 공통

- UI 기준 문서: `Jay_Studio/docs/ui/README.md`, `design-tokens.md`, `ui-rules.md`, `pixel-sprites.md`, `screen-flow.md`, `screens/01-home.png`(1440×1140), `screens/02-workflows.png`(1440×1020), `screens/03-workflow-detail.png`(1440×880). 04·05·06·07은 와이어프레임 구성 + 토큰·규칙.
- 라우트: `/` = 01, `/workflows` = 02, `/workflows/:name` = 03, `/settings` = 07. 05·06은 `?dialog=` search param(ADR-14). 알 수 없는 경로 → `/`로 이동.

### 디자인 토큰 → 코드 매핑 (`frontend/src/styles/theme.css` `@theme`)

| 토큰 이름 (design-tokens.md) | 값 | 코드 이름 (CSS 변수 → Tailwind 유틸리티) |
|---|---|---|
| `bg/page` | `#0E1320` | `--color-page` → `bg-page` |
| `bg/chrome` | `#121826` | `--color-chrome` → `bg-chrome` |
| `bg/card` | `#161D2C` | `--color-card` → `bg-card` |
| `bg/card-alt` | `#141B29` | `--color-card-alt` → `bg-card-alt` |
| `bg/inset` | `#10161F` | `--color-inset` → `bg-inset` |
| `bg/selected` | `#1D2738` | `--color-selected` → `bg-selected` |
| `bg/soft` | `#171F2E` | `--color-soft` → `bg-soft` |
| `grid/line` | `#182030` | `--color-grid-line` → `bg-grid-line` (배경 격자 `background-image`는 `.office-grid` 유틸리티, 24px) |
| `border/default` | `#27313F` | `--color-border` → `border-border` |
| `border/strong` | `#2C3648` | `--color-border-strong` → `border-border-strong` |
| `border/dashed` | `#3B4759` | `--color-border-dashed` → `border-border-dashed border-dashed` |
| `text/primary` | `#E7ECF6` | `--color-text` → `text-text` |
| `text/secondary` | `#B7C2D4` | `--color-text-secondary` → `text-text-secondary` |
| `text/mono` | `#C7D1E0` | `--color-text-mono` → `text-text-mono` |
| `text/muted` | `#93A0B5` | `--color-text-muted` → `text-text-muted` |
| `text/faint` | `#6F7C91` | `--color-text-faint` → `text-text-faint` |
| `text/link` | `#7FB8FF` | `--color-link` → `text-link` |
| `text/on-accent` | `#0B1119` | `--color-on-accent` → `text-on-accent` |
| `state/running` | `#3DD68C` | `--color-running` → `bg-running`, `text-running`, `border-running` |
| `state/running-soft` | `rgba(61,214,140,0.16)` | `--color-running-soft` |
| `state/running-border` | `#2C4A3C` | `--color-running-border` |
| `state/waiting` | `#FF9A4D` | `--color-waiting` |
| `state/waiting-soft` | `rgba(255,154,77,0.18)` | `--color-waiting-soft` |
| `state/idle` | `#55627A` | `--color-idle` |
| `state/danger` | `#FF8A8A` | `--color-danger` |
| `state/danger-soft` | `rgba(255,107,107,0.12)` | `--color-danger-soft` |
| `state/danger-border` | `#5A3A3A` | `--color-danger-border` |
| 본문 글꼴 | IBM Plex Sans KR | `--font-sans` → `font-sans` |
| 고정폭 글꼴 | IBM Plex Mono | `--font-mono` → `font-mono` |
| 화면 제목 | 25px / 700 | `--text-title` → `text-title font-bold` |
| 섹션 제목 | 14.5px / 600 | `--text-section` → `text-section font-semibold` |
| 본문 | 13px / 400 | `--text-body` → `text-body` |
| 보조 | 12px | `--text-aux` → `text-aux` |
| 최소 | 10px (캐릭터 상태 글자), 10.5px (캐릭터 name) | `--text-min`, `--text-min-mono` |
| KPI 숫자 | 34px / 700 mono (01 PNG 기준) | `--text-kpi` |
| 모서리 | 버튼·입력 9 / 카드 12 / 칩 10 / 배지 6 | `--radius-control`, `--radius-card`, `--radius-chip`, `--radius-badge` |
| 상태 점 모서리 (ui-rules 1) | 3px (상태 점·사각형 전용, 다른 요소에 쓰지 않음) | `--radius-dot` → `rounded-dot` (ADR-21, D-022) |
| 화면 좌우 여백 | 32px | `--spacing-page-x` → `px-page-x` |
| 카드 안 여백 | 16~18px | `--spacing-card` (16) `--spacing-card-lg` (18) |
| 요소 사이 | 6/8/10/14/16/18 | Tailwind 기본 spacing 스케일 사용 (`gap-1.5`=6 … `gap-4.5`=18) |
| 사이드바 폭 | 248px | `--width-sidebar` |
| 헤더 높이 | 64px | `--height-header` |
| 버튼 높이 | 주 42px / 보조 34px | `--height-btn`, `--height-btn-sm` |
| 오른쪽 패널 폭 | 360px | `--width-panel` |
| 발광 | `0 0 9px rgba(61,214,140,0.8)` | `--shadow-glow` → `shadow-glow` (실행 중 표시등에만) |
| 픽셀 캐릭터 색 | pixel-sprites.md 공통 색 | `components/pixel/palette.ts` 상수 (`skin`, `hair`, `legs`, `desk`, `monitorBack`, `shirt[running|waiting|idle|sub]`, `screen[running|waiting|idle]`) |

### 공통 컴포넌트

| 이름 | 쓰는 화면 | 상태·규칙 |
|---|---|---|
| `AppShell` (사이드바 248px + 상단바 64px + 본문) | 01·02·03·07 | `Sidebar`(`bg-chrome`, 오른쪽 `border-border`) + `TopBar` + 본문. `Sidebar` 구성은 아래 행 |
| `Sidebar` (01 PNG 좌측 기준, 01·02·03·07 동일) | 01·02·03·07 | **로고 영역**(위): 높이 `--height-header`(64px, `TopBar`와 수평 정렬) 안에 초록 로고 아이콘(28×28, `bg-running rounded-control`, 글리프 없음, `aria-hidden`) + 워드마크 `Jay Studio`(정적, `lib/text.ts` `APP_WORDMARK`, `text-section font-bold text-text`), 왼쪽 여백 16px. **탭 메뉴**: `홈`/`에이전트 워크플로우`/`설정` 세로 3개, 사이드바 안쪽 여백(inset, 좌우 12px)을 둔 둥근(`rounded-control`) 항목. 선택 탭 `bg-selected` + `text-text` + 왼쪽 초록 바(`border-l-4 border-running`); 비선택 `text-text-secondary`, 왼쪽 바 투명. 클릭 → 해당 라우트. **하단**: `CollectorStatus` 카드(아래 행). 로고·탭은 정적이라 빈/로딩/에러/연결 끊김 상태 없음 |
| `CollectorStatus` (사이드 탭 하단 카드) | 전 화면 | `Sidebar` 하단에 붙는 카드(`rounded-card border border-border bg-card`, 사이드바 안쪽 여백 12px, 아래 16px). 제목 `수집 상태`(aux, muted), `snapshot.registry.hookConfigured` → `● hook 설정됨`(running 점) / `hook 설정 안 됨`(idle 점), `마지막 수신 <hh:mm:ss>` = `snapshot.live.lastReceivedAt`(null → `마지막 수신 없음`, aux faint). 로딩: 두 줄 스켈레톤 |
| `TopBar` | 01·02·03·07 | 왼쪽 브레드크럼/제목 + 프로젝트 칩 `● 프로젝트 · <hostPath>`(`snapshot.config.hostPath`, mono, **01·02에만 표시한다. 03·07에는 칩을 두지 않는다** — ADR-30), 오른쪽 `127.0.0.1 전용`(정적, faint). 02는 오른쪽에 `Claude 열기 · 기본 세션` 버튼 추가. 칩 표시 여부는 화면(라우트)별 설정으로 넘기고 `TopBar`가 라우트를 직접 읽지 않는다 |
| `DisconnectBanner` (04-3) | 전 화면 상단 | `connectionStore.state === 'disconnected'`일 때만. `실시간 연결이 끊겼습니다 · N초 후 재연결` + `지금 재연결`(secondary). 배경 `danger-soft`, 테두리 `danger-border`, 글자 `danger`. 아래 작은 줄 `마지막 갱신 <hh:mm:ss> 기준 화면 유지` |
| `Skeleton` | 전 화면 | `bg-soft` 블록, 애니메이션 없음 |
| `StatusDot` / `StatusLabel` | 전 화면 | 9~10px 사각, 모서리 `--radius-dot`(3px, `rounded-dot`), running은 `shadow-glow`. `StatusLabel` = 점 + 글자. 이 문서의 모든 `●` 상태 점(`CollectorStatus`, 01 KPI 4·`실시간 연결됨`, 02 범례, 03 04-4 배너·패널 `상태`, 07 `열기 도우미`·`hook 설정` 행)은 `StatusDot`으로 그린다. 03 오피스 캐릭터·02 책상은 상태 점이 없다(셔츠·모니터 색 + 상태 글자, pixel-sprites 기준). `TopBar` 프로젝트 칩의 `●`는 상태가 아닌 장식이라 이 규칙 대상이 아니다 |
| `WorkflowChip` | 01·02·03 | `lib/derive/workflowChip.ts`: waiting>0 → `권한 대기 N명`(waiting-soft 배경·waiting 글자) / running>0 → `실행 중 N명`(running-soft·running) / 둘 다 0 → `모두 대기`(bg-selected·text-secondary). **우선순위: 권한 대기가 있으면 권한 대기 칩**(01 PNG 카드 2) |
| `workflowCardBorder` (파생 규칙, 컴포넌트 아님) | 01 대표 카드·02 층 카드 | `lib/derive/workflowCardBorder.ts`: 입력 `{ running, waiting, leadMissing }` → 테두리 토큰. 우선순위 **① `leadMissing` → `danger-border` ② `running > 0` → `running-border` ③ `waiting > 0` → `waiting` ④ 그 외 → `border/default`**. `leadMissing`은 02 층 카드만 `true`가 될 수 있고 01은 항상 `false`를 넘긴다. 칩(`WorkflowChip`)은 waiting 우선, 테두리는 running 우선으로 서로 다르다(ADR-24). 상태를 색으로만 알리는 표시가 아니라 카드 안 요약·칩 글자가 상태를 말한다(conventions §3) |
| `Button` | 전 화면 | variant `primary`/`terminal`/`secondary`/`add`/`danger`. **비활성(`disabledReason` 또는 `disabled`)일 때는 variant의 채움 배경과 강조 테두리 색을 모두 지우고**(배경 투명, 테두리 `border/dashed` 점선) faint 글자만 남긴다. 이유 줄은 아래 "비활성 버튼의 이유 줄"(ADR-35)이 지정한 지점에서만 `disabledReason`으로 옆에 붙는다. 즉 비활성은 variant 표현 위에 덧칠하는 상태가 아니라 variant 표현을 대체하는 여섯 번째 표현이다(ui-rules 2 표의 `비활성` 행, ADR-29). 비활성 버튼은 variant와 무관하게 모두 같은 모양이다 |
| `Dialog` | 05·06 | 가운데 모달, 배경 dim, `bg-card` 12px, ESC·`취소`로 닫기. 04-3 배너는 모달 뒤 화면 상단에 그대로. **폭은 `size` 두 단계뿐이다(ADR-40): `md`(기본, `max-w-md` 448px) = 05-L·05-3·06-5·06-6·`HelperMissingDialog`·`ConfirmByNameDialog` / `lg`(`max-w-3xl` 768px) = 목록 표·다열 폼이 들어가는 05-R·06 폼.** Tailwind 기본 스케일 값이며 새 폭 토큰도 임의값(`max-w-[…]`)도 쓰지 않는다. 두 단계 밖의 폭이 필요하면 구현이 정하지 말고 architect에 확정을 요청한다 |
| `FormatErrorList` (04-6) | 02 | 아래 SCR-04-6 |
| `AgentsDirMissing` (04-5) | 01·02·07 | 아래 SCR-04-5. **`설정 열기` 버튼은 01·02에서만 그린다(07에서는 그리지 않는다 — ADR-42).** 표시 여부는 화면이 prop으로 넘기고 컴포넌트가 라우트를 직접 읽지 않는다(ADR-30과 같은 방식) |
| `EmptyWorkflowCard` (04-7) | 01·02 | 아래 SCR-04-7 |
| `NoEventsYet` (04-1) | 01 | 아래 SCR-04-1 |
| `DeskSprite` (A, 22×22 → 46px) | 02 | 상태 → 셔츠·모니터 색. 아래 name(mono 10.5px, 12자 말줄임 + title) + 상태 글자(10px, 상태색). 팀장 배지 왼쪽 위 |
| `OfficeSprite` (B, 16×20 → 66×82px) | 03 | 말풍선 + 캐릭터 + name 칩 + 상태 글자. 서브에이전트용 `small` 변형(같은 격자, 48×60px, 셔츠 `sub` 색) |
| `HelperMissingDialog` | 02·03·07 | 제목 `열기 도우미가 응답하지 않습니다`, 본문 `helper/install.sh로 설치한 뒤 다시 시도하세요`, 선택한 명령(mono 박스), `명령 복사`, `닫기` |
| `CopyButton` | 03·07 | `navigator.clipboard.writeText`. 성공 시 1.5초 `복사됨` 표시 |

### 공통 상태 표현

| 상태 | 표현 |
|---|---|
| 로딩 (04-2) | 첫 `snapshot`(또는 `GET /api/state`) 전: 숫자·이름·카드·층 자리 `Skeleton`. `0`이나 빈 문구를 먼저 보여주지 않는다. **구현 기준(ADR-32): 스냅샷을 기다리는 본문 요소의 로딩은 `AppShell`이 `snapshotStore.ready === false` 동안 본문 전체를 대신 그리는 공통 스켈레톤 하나로 충족한다.** 각 화면 요소 표의 `로딩` 열에 적힌 `스켈레톤`·`스켈레톤 N개`는 "그 요소가 로딩 중 값을 보이지 않는다"는 뜻이며 화면마다 별도 스켈레톤 컴포넌트를 만들라는 뜻이 아니다. **예외 — 자체 스켈레톤을 갖는 요소**: 본문 밖에 있어 공통 스켈레톤이 덮지 않는 요소(`TopBar` 프로젝트 칩, `CollectorStatus`)와, 스냅샷이 아닌 자체 API 호출·부분 갱신으로 채워지는 요소(SCR-03 패널 `최근 이벤트` 4줄, SCR-05-R 목록 5행, SCR-06 폼 필드, SCR-07 `GET /api/settings` 값 행) |
| 에러 | 카드 안에 `무엇을 못 했는지 + 원인 + 복구 버튼`. API 실패는 `ApiError.message` 그대로 |
| 연결 끊김 (04-3) | `DisconnectBanner`. 화면은 마지막 스냅샷 유지. 버튼은 그대로 활성(요청 실패 시 에러 표시) |
| 수집 중단·미수신 | `CollectorStatus`·01 KPI에 `hook 설정 안 됨` 또는 마지막 수신 시각. 03은 04-4 배너 |
| 허용되지 않은 출처 (403 `FORBIDDEN_ORIGIN`) | 다른 API 실패와 같은 표현 — 그 팝업·카드의 에러 영역에 `ApiError.message` 그대로. 서버가 복구 방법까지 담은 완성 문장을 보내므로(architecture §5, ADR-41) 403 전용 배너·문구·재시도를 만들지 않는다 |
| 쓰기 권한 없음 (FR-001-E2) | `snapshot.registry.writable === false` → `+ 워크플로우 추가`, `가져오기`, `+ 만들기`, `+ 에이전트 만들기`, `정의 수정`, `제거`, `삭제`, 05·06 `만들기`/`저장`/`가져오기` 비활성 + 이유 `쓰기 권한 없음` |

### 진입 주소 정규화 (ADR-41)

- 확정 진입 주소는 `127.0.0.1:<포트>` 하나다(`docs/ui/screen-flow.md` `앱 접속 127.0.0.1:<포트>`). `http://localhost:<포트>`·`http://[::1]:<포트>`로 열면 **첫 화면을 그리기 전에** 호스트명만 `127.0.0.1`로 바꿔 같은 경로로 다시 연다(`location.replace`, 포트·경로·쿼리·해시 유지).
- 화면에 보이는 변화는 주소창뿐이다. 새 화면·배너·문구·버튼을 만들지 않으므로 `docs/ui/` 기준 이미지와의 차이가 없다.
- 이 정규화가 없으면 조회는 되는데 쓰기(POST·PUT·DELETE)와 `Claude 열기`만 403이 된다(architecture §5).

### 화면 문구의 `[...]`·`<...>` 표기 (ADR-33)

**판별 기준(한 줄): 화면 문구 안의 `[...]`·`<...>`는 언제나 문서 표기이고, 렌더 형태는 그 요소의 `데이터 출처` 열이 정한다 — 출처가 값을 주면 (a) 그 값으로 치환, 입력 요소의 placeholder면 (b) 괄호를 벗긴 설명 문구, 출처가 `정적`이면 (c) 괄호를 벗긴 정적 텍스트이며, 세 경우 모두 화면에 `[`·`]`·`<`·`>` 기호를 남기지 않는다.**

| 갈래 | 판별 | 렌더 | 예 |
|---|---|---|---|
| (a) 치환 자리 | 요소의 데이터 출처(`snapshot.*`, `settings.*`, `GET …`, 라우트 파라미터, 파생 계산)가 그 자리에 넣을 값을 준다 | 출처가 준 값으로 바꾼다. 값이 없을 때 표시는 그 행의 `빈` 열이 정한다 | `실시간 연결이 끊겼습니다 · [N]초 후 재연결` → `실시간 연결이 끊겼습니다 · 12초 후 재연결` |
| (b) 입력 예시 | 입력·textarea의 `placeholder`로 적힌 문구다 | 괄호를 벗긴 문구를 `placeholder` 속성으로 쓴다 | 설명 입력 `[한 줄 설명]` → placeholder `한 줄 설명` |
| (c) 정적 텍스트 | 데이터 출처가 `정적`이고 입력 placeholder도 아니다 | 괄호만 벗기고 나머지 글자는 그대로 쓴다 | 05-L 설명 `.jaystudio/teams/[이름].json` → `.jaystudio/teams/이름.json` |

- MUST 판정 순서는 (a) → (b) → (c)다. 먼저 데이터 출처 열을 보고, 값을 주는 출처가 없을 때만 (b)·(c)로 내려간다. 이유: 같은 표기를 두 사람이 다르게 읽는 일을 없앤다(T-017 Minor 1).
- 괄호 기호가 화면에 그대로 필요한 경우는 **"괄호를 포함한 문자열 자체가 확정 문구인 값"을 출처가 줄 때뿐**이며, 그것은 (a)의 결과이지 프론트가 만드는 문구가 아니다. 현재 그 경우는 SCR-07 `팀장으로 열기` 행의 `settings.leadSessionCommandTemplate`(값에 `<팀장 name>` 포함, FR-013-AC2) 하나뿐이다.
- (c)에서 "괄호만 벗긴다"는 뜻은 괄호 안 글자를 그대로 두고 `[`·`]`만 지운다는 것이다. 문장을 다시 쓰거나 낱말을 바꾸지 않는다(conventions §2 MUST).

### 치환값 뒤에 붙는 조사 표기 (ADR-39)

- **화면 문구에서 치환값(`<name>`, `<워크플로우>` 등) 바로 뒤에 조사가 붙으면 병기 형태로 쓴다: `을(를)` / `이(가)` / `은(는)` / `와(과)` / `(으)로`.** 받침을 판정해 조사를 고르는 보정 함수를 만들지 않는다(`lib/format/*`에 두지 않는다). 문구 상수·함수가 병기 문자열을 그대로 갖고 값만 이어 붙인다.
- 이유: `name`은 `^[a-z0-9-]{1,64}$`라 한글이 아닌 값(`dev-02`, `qa-01`)이 정상 입력이고 워크플로우 이름도 영문·숫자를 허용해, 확정 문서에 없는 받침 판정 규칙을 새로 정해야 한다. 무엇보다 FR-006-AC11이 이미 `<name>이(가) 여러 워크플로우에 있습니다`로 병기 형태를 확정했고 final 문서는 수정 대상이 아니므로, 보정 코드를 두면 한 화면군 안에 두 방식이 공존한다.
- 적용 대상(전수): SCR-05-R 제목 `<워크플로우>(으)로 …`, SCR-06-6 제목 `<name>을(를) …`, SCR-02 층 경고 `<name>이(가) …`(기존 그대로).
- 대상이 아닌 것: 조사가 붙는 대상이 치환값이 아니라 **고정 글자**인 문구. 현재는 SCR-06-5 본문 `<name>.md이 이 창을 연 뒤 …` 하나이며, 조사가 붙는 `.md`가 값에 따라 변하지 않으므로 **현행 문구를 그대로 둔다**(문장을 다시 쓰지 않는다 — conventions §2 MUST). 치환값 뒤가 공백·괄호·문장 끝인 문구도 대상이 아니다.

### 비활성 버튼의 이유 줄 (ADR-35)

- **`docs/ui/ui-rules.md` 2 표의 "옆에 이유 한 줄"은 모든 비활성 버튼에 필수라는 뜻이 아니다 — 아래 표와 각 화면의 요소 표가 이유 문구를 지정한 비활성에만 이유 줄을 렌더한다.** 지정이 없으면 이유 줄 없이 비활성 모양(ADR-29)만 쓰고, 문구를 새로 지어내지 않는다(conventions §2 MUST: 문구는 확정 문서의 글자 그대로).
- 이유 문구를 지정하는 기준: **비활성 원인이 그 버튼 밖에 있어 화면만 보고는 알 수 없을 때**(쓰기 권한, 에이전트 실행 상태, 팀장 존재, 팀원 존재, 도우미 설치 여부) 지정한다. 원인이 **버튼 라벨 자신** 또는 **같은 팝업·카드 안의 입력 상태**로 바로 보이면 지정하지 않는다.
- 요청 진행 중 비활성(`만드는 중…`, `삭제 중…`, `저장 중…`, `가져오는 중…`, `다시 읽는 중…`)은 라벨이 상태를 말하므로 이유 줄을 붙이지 않는다.

| 비활성 지점 | 이유 줄 | 문구 |
|---|---|---|
| `writable === false`인 모든 쓰기 버튼(01·02 `+ 워크플로우 추가`·04-7, 02 층 헤더 `삭제`·`가져오기`, 03 `정의 수정`·`제거`, 05-L `만들기`, 05-R `+ 새로 만들기`·`선택한 N명 가져오기`, 06 `저장`·`워크플로우에서 제거`) | 있음 | `쓰기 권한 없음` |
| 02 층 헤더 `삭제` — 팀장·팀원 ≥ 1명 (FR-006-AC12·FR-017-AC1) | 있음 | `팀원을 먼저 제거하세요` |
| 03 패널 `정의 수정`·`제거`, 06 `워크플로우에서 제거` — status ≠ idle (FR-011-AC5·FR-012-AC6) | 있음 | `작업 중에는 수정할 수 없습니다` / `작업 중에는 제거할 수 없습니다` |
| 03 헤더 `팀장 호출 · 터미널 열기` — 팀장 없음 (ui-rules 3) | 있음 | `팀장 없음` |
| 07 `테스트로 열기` — 도우미 미응답 (FR-013-AC10) | 있음 | `도우미 미설치` |
| 06 `팀장` 라디오 — 대상 워크플로우에 이미 팀장 (FR-010-AC4) | 있음 | `이미 팀장이 있습니다 (<lead>)` |
| 06 `저장` — 도구 방식 라디오 미선택 (FR-010-AC2) | 있음 | `도구 방식을 고르세요` |
| 05-L `만들기` — 이름 빈 값 | 없음 | 바로 위 필수 입력이 비어 있는 것이 원인 |
| 05-3 `삭제 (이름 일치 시 활성)`, 06-6 `제거 (이름 일치 시 활성)` — 입력 ≠ 이름 (FR-017-AC3·FR-012-AC1) | 없음 | 라벨이 조건을 말한다(05-3 라벨은 FR-017-AC2 확정 문구) |
| 05-R `선택한 [N]명 가져오기` — N = 0 | 없음 | 라벨의 `0명`이 조건을 말한다 |
| 05-R `가져오기` — 워크플로우 0개 | 없음 | 같은 팝업의 드롭다운 자리에 `먼저 워크플로우를 추가하세요` 안내가 있다 |
| 06 `저장` — 필수값 비어 있음 / 06 역할 라디오 — 소속이 `(없음)` | 없음 | 같은 폼의 입력 상태가 원인 |
| 05·06 요청 진행 중, 06 수정 모드 파일 읽는 중, 06-5 두 버튼 진행 중, 05-3 FR-017-E1 안내 표시 중 | 없음 | 진행 중 상태(라벨로 표시) |

---

## SCR-01 홈 (`/`)
- FR: FR-005, FR-001, FR-003-AC6, FR-015, FR-016
- 기준 이미지: `docs/ui/screens/01-home.png`
- 구성 순서(ui-rules 7): 제목 → KPI 4개 → 상태 막대 → 대표 워크플로우 3개 → 실시간 이벤트 표

| 요소 | 데이터 출처 | 빈 | 로딩 | 에러 | 연결 끊김 | 클릭 시 동작·이동 |
|---|---|---|---|---|---|---|
| 상단바 브레드크럼 `홈`, 프로젝트 칩 | `snapshot.config.hostPath` | - | 칩 스켈레톤 | - | 유지 | - |
| 제목 `에이전트 관제` + 부제 `Claude Code 에이전트 활동을 실시간으로 봅니다. 웹에서 에이전트를 실행하지 않습니다.` | 정적 | - | - | - | - | - |
| 버튼 `에이전트 워크플로우 열기 →` (primary) | 정적 | - | - | - | 활성 | `/workflows` (FR-005-AC10) |
| KPI 1 `실행 중 에이전트` `[N] / [N]` + `hook 이벤트 기준 · 권한·입력 대기 [N]` (카드 테두리 running-border, 배경 살짝 초록) | `counts.ts`: running = `live.agents`에서 status running 수, 전체 = `registry.agentCount`, waiting = status waiting 수 (FR-005-AC1) | - | 숫자 스켈레톤 | `agentsDirMissing` → 카드 대신 04-5 (KPI 1·2 자리) | 유지 | - |
| KPI 2 `에이전트 수` `[N]` + `.claude/agents 정의 파일 수` | `registry.agentCount` | - | 스켈레톤 | 04-5 (숫자 표시 안 함, FR-001-E1) | 유지 | - |
| KPI 3 `스킬 수` `[N]` + `.claude/skills 스킬 수` | `registry.skillCount` (없으면 0, FR-001-E3) | `0` 표시 | 스켈레톤 | - | 유지 | - |
| KPI 4 `수집 상태` `● hook 설정됨`/`hook 설정 안 됨` + `마지막 수신 [hh:mm:ss]` | `registry.hookConfigured`, `live.lastReceivedAt` | `lastReceivedAt` null → `마지막 수신 없음` | 스켈레톤 | - | 유지 | - |
| 상태 막대 `에이전트 상태 hook 이벤트 기준` + 범례 `작업 중 [N]` `입력·권한 대기 [N]` `대기 [N]` + 3색 막대 | `counts.ts` 3상태 수 (합 = `agentCount`, FR-005-AC2). 막대 비율 = 각 수 / agentCount | `everReceived=false` → 막대 전체 idle색, 범례 `대기 N` (04-1은 이벤트 표 영역에) | 스켈레톤 | 04-5면 숨김 | 유지 | - |
| 섹션 제목 `에이전트 워크플로우` + `대표 3개 · 실행 중 에이전트가 있는 워크플로우 → 최근 활동순` + 오른쪽 `전체 보기 →` | 정적 | - | - | - | - | `전체 보기 →` → `/workflows` |
| 대표 워크플로우 카드 ×3: 이름, 칩, 설명, `에이전트 [N] · 스킬 [N]`, `최근 활동 · <요약>` 또는 `마지막 활동 · <yyyy-mm-dd hh:mm>`, `워크플로우 보기 →`(카드 전체 클릭) | `featuredWorkflows.ts`(FR-005-AC3): `registry.workflows` × `live.agents` 상태·`lastEvent.at`. 이름 `workflow.name`, 설명 `workflow.description`, 에이전트 = lead+members 수, 스킬 = `registry.skillCount`(FR-005-AC4), 최근 활동 = 소속 에이전트 `lastEvent` 중 최신 `title · summary`(running/waiting 있을 때) / `마지막 활동 · at`(모두 대기) / `활동 없음`. 카드 테두리: `workflowCardBorder.ts` 공통 규칙(ADR-24) — running>0 → `running-border` / running=0·waiting>0 → `waiting` / 그 외 → `border/default`. **01 대표 카드는 팀장 없음을 표시하지 않으므로 danger 분기를 쓰지 않는다**(`leadMissing: false` 고정, 01 PNG에 해당 표현 없음). 테두리는 칩과 달리 running이 waiting보다 우선한다 | `workflows.length === 0` → 04-7 카드 1장 (FR-005-AC5) | 카드 3장 스켈레톤 | - | 유지 | 카드·`워크플로우 보기 →` → `/workflows` |
| 실시간 이벤트 카드 제목 `실시간 이벤트` + `최근 [N]개 · 전체 로그 화면 없음` + 오른쪽 `● 실시간 연결됨` | N = `recentEvents.length`(≤50). 연결 표시 = `connectionStore.state` (`connected` → running 점 `실시간 연결됨`, 그 외 `연결 끊김` idle 점) | - | 스켈레톤 | - | `연결 끊김` 표시 | - |
| 실시간 이벤트 표: 열 `시각` `워크플로우` `에이전트` `이벤트` `요약` | `snapshot.recentEvents[]` (FR-005-AC6 최신순 50): `at`→hh:mm:ss(mono faint), `workflow ?? '-'`(FR-005-AC7), `agentLabel`(mono), `title`(kind `permission`/`permission-denied`는 waiting 색, `tool`·`tool-done`은 running 색 도구명, 그 외 secondary), `summary`(mono, 이미 마스킹됨 FR-005-AC8) | `everReceived=false` → 표 대신 04-1 (FR-005-E1) | 행 5개 스켈레톤 | - | 유지 | 행 클릭 없음 |
| 표 하단 각주 `token·key·password 등 기본 패턴은 ••••••••로 가림` | 정적 | - | - | - | - | - |

- 비활성 요소: 없음. 표 행 클릭·원문 보기 없음(Out of Scope: 전체 로그 화면).

---

## SCR-02 에이전트 워크플로우 층 뷰 (`/workflows`)
- FR: FR-006, FR-001, FR-002, FR-003-AC5, FR-004-AC7, FR-013-AC1·AC3·AC6·AC9, FR-017-AC1
- 기준 이미지: `docs/ui/screens/02-workflows.png`
- 구성(ui-rules 7): 상단 헤더 → 요약·범례·검색 바 → [층 스크롤 영역: 04-6 → 로비 → 층 그리드(3열)] → 하단 컨트롤 영역(줌 버튼 왼쪽 + 미니맵 오른쪽)
- **레이아웃 — 줌·미니맵 "고정"의 뜻 (ADR-23, T-015 R1 확정)**: 02 본문 루트는 뷰포트 높이에 맞춘 세로 flex다(`height: calc(100dvh - var(--height-header))`). 위에서부터 ① 요약·범례·검색 바(스크롤하지 않음, 높이 자동) ② **층 스크롤 영역** — 04-6 목록·로비·층 그리드를 담는 자체 스크롤 컨테이너(`flex:1; min-height:0; overflow:auto`, 좌우 여백 `--spacing-page-x`) ③ **하단 컨트롤 영역** — 높이 176px 고정(Tailwind 기본 스케일 `h-44`. 줌 버튼 3개(34px) + 사이 6px×2 + 위 24 / 아래 32 여백), 배경 `bg/page`, 테두리·그림자 없음, 좌우 여백 `--spacing-page-x`. 줌 버튼은 ③의 왼쪽 끝 아래, 미니맵은 ③의 오른쪽 끝 아래에 정렬한다(둘 다 `items-end`).
  - 줌·미니맵은 **스크롤과 무관하게 항상 같은 자리에 보이지만(=고정), 층 스크롤 영역 밖에 있으므로 어떤 스크롤 위치에서도 층·책상 위에 겹치지 않는다**. `position: fixed`로 층 콘텐츠 위에 띄우는 오버레이 배치는 금지한다. 이유: FR-006-AC10(책상마다 이름·상태 글자 표시), `docs/ui/README.md`(요소 가림은 결함).
  - 층 그리드는 사이드바 오른쪽 전체 폭을 그대로 쓴다(오버레이용 좌·우 여백 컬럼을 두지 않는다). 이유: 기준 PNG의 층 카드 좌우 위치를 그대로 유지한다.
  - 04-3 배너가 떠 있는 동안에는 배너 높이만큼 페이지(window)가 스크롤될 수 있다(허용). 그 밖에는 window 스크롤이 생기지 않는다.

| 요소 | 데이터 출처 | 빈 | 로딩 | 에러 | 연결 끊김 | 클릭 시 동작·이동 |
|---|---|---|---|---|---|---|
| 상단바 제목 `에이전트 워크플로우`, 프로젝트 칩, `127.0.0.1 전용` | `config.hostPath` | - | 칩 스켈레톤 | - | 유지 | - |
| 버튼 `>_ Claude 열기 · 기본 세션` (secondary, 터미널 아이콘) | `config.defaultSessionCommand`(표시·복사용), `GET /api/helper/token`, 도우미 `POST /open {target:'default'}` (FR-013-AC1·AC6) | - | 활성 | 도우미 무응답(2초) → `HelperMissingDialog`(FR-013-AC9·E1) / 403 → 인라인 `도우미 인증 실패 · 도우미를 다시 설치하세요`(FR-013-E2) | 활성 | 도우미 호출. 화면 이동 없음 |
| 요약 줄 `JayStudio` `.claude` `에이전트 [N] · 스킬 [N] · 워크플로우 [N]` | `registry.agentCount`, `skillCount`, `workflows.length` | - | 스켈레톤 | 04-5면 에이전트 수 `-` | 유지 | - |
| 링크 `워크플로우 밖 에이전트 [N] · 가져오기` (link 색, 밑줄) | N = `registry.agents.filter(a => a.workflow === null).length` | N=0이면 `워크플로우 밖 에이전트 0`으로 표시하고 비활성 | 스켈레톤 | - | 활성 | `?dialog=import` (워크플로우 드롭다운 있음, FR-009-AC7) |
| 버튼 `+ 에이전트 만들기` (add) | - | - | - | `writable=false` → 비활성 `쓰기 권한 없음` | 활성 | `?dialog=agent-new` (워크플로우 미선택) |
| 범례 `● 작업 중 [N]` `● 권한·입력 대기 [N]` `● 대기 [N]` | `counts.ts` (01과 같은 함수) | - | 스켈레톤 | - | 유지 | - |
| 검색 입력 `워크플로우·에이전트 이름 검색` (돋보기 아이콘) | 로컬 상태 → `search.ts`(FR-006-AC8: 워크플로우 이름 또는 에이전트 name 부분 일치, 대소문자 무시; 에이전트 일치 시 그 층에 일치 에이전트만) | 결과 0 → 층 그리드 자리에 `검색 결과가 없습니다` 한 줄 | - | - | 활성 | 입력마다 필터 |
| 층 선택 드롭다운 `전체 층 ([N]개)` + 워크플로우 이름 목록 | `registry.workflows` (FR-006-AC7). `<select>` 네이티브. 30개여도 상단 바 한 줄 유지(드롭다운이므로) | 워크플로우 0 → `전체 층 (0개)`만 | 스켈레톤 | - | 활성 | 선택한 층만 표시. 검색과 AND |
| 버튼 `+ 워크플로우 추가` (add) | - | - | - | `writable=false` → 비활성 `쓰기 권한 없음` | 활성 | `?dialog=workflow-add` |
| 04-6 목록 (층 위) | `registry.formatErrors.length > 0`일 때 (FR-006-E2) | 없으면 숨김 | - | 아래 SCR-04-6 | 유지 | - |
| 로비 카드 `로비 · 메인 세션` `에이전트 지정 없이 실행 중인 Claude Code 세션` + 항목 `🧍 [세션 N] · 상태` / `name · 상태` | `live.lobby[]`: `label`, `status`→상태 글자(`작업 중`/`입력 대기`(waiting 짧은 표기)/`대기`) (FR-006-AC9, FR-004-AC7). 작은 픽셀 아이콘은 `DeskSprite`가 아닌 12×16 정면 아이콘(pixel-sprites B 축소) | `lobby.length === 0` → `실행 중인 메인 세션 없음` 한 줄 (secondary) | 스켈레톤 한 줄 | - | 유지 | 없음 |
| 층 카드(워크플로우마다): 헤더 `[이름]` `[N]명` 칩 + 요약 `실행 중 [N]명 · 권한 대기 [N]명`/`모두 대기`/`팀장 없음`(danger) | `registry.workflows[i]`: N명 = lead+members 수, 요약 = `counts.ts`로 소속 에이전트 상태 집계 (FR-006-AC5). 팀장 없으면 요약 자리에 `팀장 없음`(danger 글자, 02 PNG 워크플로우 D). **테두리 색 = `workflowCardBorder.ts`(공통 규칙, ADR-24): 팀장 없음 → `danger-border` / running>0 → `running-border` / running=0·waiting>0 → `waiting` / 그 외 → `border/default`. 칩(권한 대기 우선)과 달리 테두리는 running이 waiting보다 우선한다** — 02 PNG 워크플로우 A(실행 중 5·권한 대기 1)가 `#2C4A3C`이고 `design-tokens.md`에 waiting 전용 테두리 토큰이 없다. 배경은 상태와 무관하게 `bg/card-alt` | `workflows.length === 0` → 04-7 카드 1장 (FR-006-E3) | 층 2개 스켈레톤 | `agentsDirMissing` → 04-5 (층 그리드 자리, FR-006-E1) | 유지 | - |
| 층 헤더 버튼 `가져오기`(secondary) `+ 만들기`(add) `상세 →`(running 테두리) `삭제`(danger, 작은 — **기준 PNG에 없는 요소. FR-017 확정 이후 추가된 버튼이라 `02-workflows.png`에는 없다. 화면 대조에서 누락·추가로 보지 않는다**, ADR-25) | `writable`, `workflow.rawMemberCount` | - | - | `writable=false` → `가져오기`·`+ 만들기`·`삭제` 비활성 `쓰기 권한 없음`. `rawMemberCount > 0` → `삭제` 비활성 `팀원을 먼저 제거하세요`(FR-006-AC12, FR-017-AC1) | 활성 | `가져오기` → `?dialog=import&workflow=<이름>`(고정) / `+ 만들기` → `?dialog=agent-new&workflow=<이름>` / `상세 →` → `/workflows/<이름>` / `삭제` → `?dialog=workflow-delete&workflow=<이름>` (05-3) |
| 층 경고 줄 `팀장이 없습니다 · 팀장을 만들거나 가져오세요` (danger-soft 배경, danger 글자) | `workflow.lead === null` (FR-006-AC3) | 팀장 있으면 숨김 | - | - | 유지 | - |
| 층 경고 줄 `<name>이(가) 여러 워크플로우에 있습니다 · 구성 파일을 확인하세요` | 이 층 소속 에이전트(또는 이 층을 `duplicateWorkflows`에 가진 에이전트) 중 `duplicateWorkflows.length > 0` (FR-006-AC11). 관련 모든 층에 표시 | 없으면 숨김 | - | - | 유지 | - |
| 층 안 책상(`DeskSprite`) ×N: 캐릭터 + name + 상태 글자, 팀장 `팀장` 배지 | `agentOrder.ts`(FR-006-AC1: lead 첫 자리, 나머지 name 오름차순 `localeCompare` 아닌 단순 `<` 비교), 상태 = `live.agents[name].status`, 상태 글자 `작업 중`/`권한 대기`/`대기` + `parentLabel` 있으면 `· 부모 <라벨>`. 중복 소속 에이전트는 `agent.workflow`(첫 층)에만 책상 (FR-006-AC11). 깨진 참조는 제외 | 인원 0 → 층 안에 `에이전트가 없습니다 · 만들거나 가져오세요` 한 줄 | 스켈레톤 | - | 유지 | 책상 클릭 → `/workflows/<이름>?agent=<name>` (03에서 그 에이전트 선택) |
| 층 그리드 배치 | `workflowLayout.ts`: 3열, 인원 ≥ 7 → `grid-column: span 3`(FR-006-AC2, 02 PNG 워크플로우 A). 인원 늘면 세로 확장 | - | - | - | - | - |
| 줌 버튼 `+` `−` `맞춤` (하단 컨트롤 영역 왼쪽 끝. 세로 스택, 버튼 사이 6px, 각 버튼 `aria-label`. 버튼 3개만 놓고 감싸는 카드·패널·테두리를 두지 않는다 — 기준 PNG) | 로컬 `zoom` 50~200% (FR-006-AC6), `맞춤` = **층 스크롤 영역의 `clientWidth`·`clientHeight`** 안에 층 그리드 전체가 들어가도록 계산(window 크기 아님) | - | - | - | 활성 | `transform: scale` 층 영역(로비 포함). 단계 10% |
| 미니맵 (하단 컨트롤 영역 오른쪽 끝) | 층 그리드 축소(1/10) 사각형들 + 현재 뷰포트 테두리(running). **기준 컨테이너는 층 스크롤 영역**(`scrollTop`·`clientHeight`·`scrollHeight`, window 아님). 테두리 위치 = `scrollTop / scrollHeight`, 높이 = `clientHeight / scrollHeight`(둘 다 zoom 배율이 적용된 값으로 통일, 최소 4%) | 워크플로우 0 → 숨김 | - | - | 활성 | 클릭 시 층 스크롤 영역을 해당 위치로 스크롤(window 스크롤 아님) |

- 비활성 요소: 02에는 팀장 선택 목록·`팀장으로 열기` 메뉴가 **없다**(FR-013-AC3, 와이어프레임 p.2 ▾ 메뉴는 확정 결정으로 제거). 책상 위 도구 말풍선 없음(03 전용).
- 기준 PNG(`docs/ui/screens/02-workflows.png`)와의 확정된 차이 — 화면 대조 시 결함으로 보지 않는다:
  1. 층 헤더 `삭제` 버튼과 비활성 사유 `팀원을 먼저 제거하세요`는 기준 PNG에 없다. PNG가 FR-017(워크플로우 삭제) 확정 이전 산출물이기 때문이며, 표시 근거는 FR-006-AC12·FR-017-AC1이다(ADR-25). 그 밖의 요소 누락·추가는 그대로 결함이다.
  2. 기준 PNG는 콘텐츠 높이가 뷰포트(1020px)에 거의 맞아 "층 그리드 아래 공백"과 "하단 컨트롤 영역"이 같은 그림이 된다. 층이 많아 스크롤이 생기는 경우의 기준은 위 레이아웃 항(ADR-23)이며, 기준 PNG는 이 문제의 판단 근거가 되지 못한다.

---

## SCR-03 워크플로우 상세 · 픽셀 오피스 (`/workflows/:name`)
- FR: FR-007, FR-011-AC5, FR-012-AC6, FR-013-AC2·AC4·AC6~AC10·E1~E4, FR-017-AC4
- 기준 이미지: `docs/ui/screens/03-workflow-detail.png`
- 구성(ui-rules 7): 브레드크럼 → 헤더(‹, 이름, 수치, 칩, 팀장, 팀장 호출 버튼) → 왼쪽 오피스(3열) + 오른쪽 360px 패널 → 오피스 하단 동작 매핑 범례

| 요소 | 데이터 출처 | 빈 | 로딩 | 에러 | 연결 끊김 | 클릭 시 동작·이동 |
|---|---|---|---|---|---|---|
| 브레드크럼 `홈 / 에이전트 워크플로우 / [이름]` | `:name` | - | - | - | - | `홈` → `/`, `에이전트 워크플로우` → `/workflows` |
| 버튼 `‹` (aria-label `에이전트 워크플로우로`) | - | - | - | - | - | `/workflows` |
| 헤더 `[이름]` `에이전트 [N] · 스킬 [N]` 칩 `실행 중 [N]명` `팀장 [name]` | `registry.workflows.find(name)`: 에이전트 = lead+members 수, 스킬 = `skillCount`, 칩 = `workflowChip.ts`(FR-007-AC9), 팀장 = `lead`(mono) / null → `팀장 없음`(danger). **04-4 표시 중에도 칩은 실제 `live.agents[*].status`로 계산한다**(표시 고정 대상이 아니다 — ADR-27) | - | 공통(AppShell) | 워크플로우 없음 → 화면 본문 전체를 `워크플로우를 찾을 수 없습니다` + 버튼 `에이전트 워크플로우로`(primary → `/workflows`)로 대체 (FR-007-E2, FR-017-AC4) | 유지 | - |
| 버튼 `>_ 팀장 호출 · 터미널 열기` (terminal) | `workflow.lead`, `GET /api/helper/token`, 도우미 `POST /open {target:'lead', leadName}` (FR-013-AC2·AC6). 명령 표시·복사 = `cd "<config.hostPath>" && claude --agent <lead>` | `lead === null` → 비활성 + `팀장 없음` (FR-007-AC8, FR-013-AC4) | 비활성 | 무응답 → `HelperMissingDialog`(팀장 명령 포함, FR-013-AC9) / 403 → `도우미 인증 실패 · 도우미를 다시 설치하세요` / 400 → 도우미 message / 누른 직후 `registry.agents`에 lead가 없으면 호출하지 않고 `팀장이 없습니다` 표시 (FR-013-E4) | 활성 | 도우미 호출. 이동 없음 |
| 04-4 배너 (오피스 카드 위) | `isCollectorDown = !live.everReceived || !registry.hookConfigured` (FR-007-E1, ADR-17): `● hook 이벤트 수신 없음 · 마지막 수신 <yyyy-mm-dd hh:mm 또는 없음>` (idle 점, bg-soft). **수집 중단 규칙: 배너가 표시되는 동안 03의 캐릭터·상태 글자·선택 패널 상태는 표시만 `대기`로 고정한다(`displayStatus = isCollectorDown ? 'idle' : live.status`). 01·02·API 값은 그대로** | 조건 아니면 숨김 | - | - | 유지 | - |
| 오피스 카드 제목 `오피스` `에이전트 1명 = 캐릭터 1개 · 팀장 첫 자리, 나머지 이름순` | 정적 | - | - | - | - | - |
| 오피스 그리드 캐릭터(`OfficeSprite`) ×N: 말풍선, 캐릭터, `팀장` 배지, name 칩, 상태 글자 | `agentOrder.ts`(FR-007-AC1), `live.agents[name]`: 말풍선 = `actionLabel.ts`(FR-007-AC2: waiting → 주황 채움 `권한 요청`; running + currentTool Edit/Write/NotebookEdit → `타이핑 · <도구>`; Read/Grep/Glob → `읽기 · <도구>`; 그 밖 도구 → `<도구>`; running인데 currentTool null → `작업 중`; idle → 회색 `대기`). 셔츠·모니터 = 상태색. 상태 글자 = `작업 중`/`권한 대기`/`대기` + `parentLabel` → `· 부모 <라벨>`(FR-007-AC3). **수집 중단(04-4 표시 중): 상태 입력을 `idle`로 바꿔 렌더링 → 셔츠·모니터 대기색, 말풍선 회색 `대기`, 상태 글자 `대기`(부모 접미 없음)** | 인원 0 → 3칸 모두 `빈 자리` | 공통(AppShell) | - | 유지 | 칸 클릭 → 선택(패널 갱신). 선택 칸 = running 테두리 + running-soft 배경 |
| 정의 없는 서브에이전트 작은 캐릭터(`OfficeSprite small`) | `live.undefinedSubagents.filter(s => s.parentAgentName이 이 워크플로우 소속)` → **부모 칸 바로 다음 칸**(부모 뒤 나머지 칸은 한 칸씩 밀린다. 기준 PNG와 다르며 FR-007-AC3 문구가 기준 — 아래 확정 차이 1, ADR-28). name 칩 `<agentType>`, 상태 글자 `작업 중 · 부모 <parentLabel>`, 말풍선 = `actionLabel.ts`(currentTool) (FR-007-AC3). `SubagentStop` 후 `live`에서 빠지면 사라짐. **수집 중단(04-4 표시 중): 셔츠 대기색, 말풍선·상태 글자 `대기`** | 없으면 없음 | - | - | 유지 | 클릭 → 선택 불가(패널 변화 없음, 커서 기본) |
| 빈 자리 칸 (점선, `빈 자리`) | 마지막 줄 3열 채우기 (FR-007-AC1) | 인원이 3의 배수면 없음 | - | - | - | 없음 |
| 오피스 하단 범례 `동작 매핑 타이핑 = Edit·Write 읽기 = Read·Grep·Glob 주황 말풍선 = 권한 요청 회색 = 대기 작은 캐릭터 = 서브에이전트` | 정적 | - | - | - | - | - |
| 패널 제목 `선택한 에이전트` `기본 선택 = 팀장` | 정적 | - | - | - | - | - |
| 패널 name `[name]` + `팀장` 배지, 경로 `.claude/agents/<파일명>.md` | 선택 = URL `?agent=` → 없으면 lead → 없으면 첫 자리 (FR-007-AC4). `agent.filePath`(faint mono). **글꼴은 `--text-section`(14.5px) mono bold** — `design-tokens.md` 글꼴 크기 단계에 19px 계열이 없어 기준 PNG와 크기가 다르다(아래 확정 차이 4, ADR-31) | 인원 0 → 패널 본문 `선택할 에이전트가 없습니다` | 공통(AppShell) | - | 유지 | - |
| 패널 표: `상태` / `현재 도구` / `세션 시작` / `서브에이전트` / `작업 폴더` | `live.agents[name]`: `StatusLabel(status)`, `currentTool ? name + ' · ' + target : '-'`(FR-007-AC5), `sessionStartedAt`→hh:mm:ss 또는 `-`, `childCount`, `cwd ?? '-'`(경로는 `hostPath` 접두를 잘라 요약, title로 전체). **수집 중단(04-4 표시 중): `상태` = `대기`(idle 점), `현재 도구` = `-`. 세션 시작·서브에이전트·작업 폴더는 값 그대로** | - | 공통(AppShell) | - | 유지 | - |
| 패널 `최근 이벤트` 목록 ×10: `[hh:mm] <title>` | `GET /api/agents/{name}/events?limit=10` (선택 변경·재연결 시 호출) + SSE `event` prepend (FR-007-AC6) | 0건 → `최근 이벤트 없음` | 4줄 스켈레톤 | API 실패 → `최근 이벤트를 불러오지 못했습니다` + `다시 시도` | 유지 | 없음 |
| 버튼 `정의 수정` (primary, 넓게) | `live.agents[name].status`, `writable` | - | 비활성 | status ≠ idle → 비활성 `작업 중에는 수정할 수 없습니다`(FR-011-AC5). `writable=false` → `쓰기 권한 없음` | 활성 | `?dialog=agent-edit&agent=<name>` (06 수정) |
| 버튼 `제거` (danger) | 같은 조건 | - | 비활성 | status ≠ idle → 비활성 `작업 중에는 제거할 수 없습니다`(FR-012-AC6). `writable=false` → `쓰기 권한 없음` | 활성 | `?dialog=agent-remove&agent=<name>` (06-6) |
| 패널 각주 `제거 = 휴지통(.jaystudio/trash/)으로 이동 · 원문 로그 보기 없음` / `작업 지시는 상단 팀장 호출로 연 터미널에서 직접 한다 · claude --agent <lead>` | 정적 + `workflow.lead` | lead 없으면 두 번째 줄 `팀장 없음` | - | - | - | - |

- `정의 수정`·`제거`의 판정·배치 규칙
  - **비활성 판정은 04-4 표시 중에도 실제 `live.agents[name].status`를 쓴다**(표시용 `displayStatus`가 아니다 — ADR-27). 표시 상태(`대기`)로 활성화하면 열자마자 서버가 409 `AGENT_BUSY`로 거부하는 팝업이 열려 FR-011-AC5·FR-012-AC6을 위반한다. 그래서 04-4 표시 중에는 패널 `상태`가 `대기`인데 버튼 이유가 `작업 중에는 …`일 수 있다. 이 조합은 04-4 배너 각주(`캐릭터는 모두 회색 대기`)가 "지금 보이는 대기는 수집 중단 때문"이라고 이미 설명하므로 그대로 둔다(새 문구를 만들지 않는다).
  - 배치: 비활성 사유가 없으면 기준 PNG대로 한 줄(`정의 수정` 넓게 + 오른쪽 `제거`). **비활성 사유가 하나라도 있으면 세로 스택**으로 바꾸고 `정의 수정`은 넓게 늘리지 않는다(버튼 + 사유 한 줄이 360px 패널에서 겹치지 않게. `docs/ui/README.md` 요소 가림 금지 — 아래 확정 차이 3, ADR-28).
  - 모양: 비활성일 때는 §공통 `Button`대로 variant 채움 배경 없이 점선 + faint + 이유 한 줄이다(ADR-29).

- 비활성 요소: 원문 로그 보기(Out of Scope), 작은 캐릭터 선택(정의 파일 없음), 정의 없는 서브에이전트의 부모가 로비·워크플로우 밖이면 03에 표시하지 않음(ADR-10).
- 기준 PNG(`docs/ui/screens/03-workflow-detail.png`)와의 확정된 차이 — 화면 대조 시 결함으로 보지 않는다(ADR-28. SCR-02의 같은 목록과 형식·효력이 같다). **이 목록에 없는 요소 누락·추가·순서 차이는 그대로 결함이다.**
  1. **서브에이전트 칸 위치**: 기준 PNG는 `[서브에이전트 1]`을 정의된 에이전트 4명 뒤 5번째 칸에 두지만, 구현은 **부모 칸 바로 다음 칸**(부모가 첫 자리면 2번째 칸)에 둔다. FR-007-AC3 "부모 캐릭터 **다음 칸**"(Must)과 위 요소 표가 일치하고, PNG의 5번째 배치는 어떤 규칙으로도 도출되지 않으며 `docs/ui/pixel-sprites.md` §배치 "부모 아래·옆"(부모가 1번 칸이면 2번 또는 4번)도 만족하지 않는다. 기준 PNG는 이름·수치가 모두 `[N]`·`[dev-lead]`인 placeholder 목업이므로 Must 문구가 우선한다.
  2. **패널 `상태`의 상태 점**: 기준 PNG는 색 글자만 보이나 구현은 `StatusDot` + 글자다. §공통 `StatusDot` 행이 "03 04-4 배너·패널 `상태`"를 명시하므로 구현이 기준이다.
  3. **패널 버튼 배치와 모양**: 기준 PNG는 `정의 수정`(초록 채움, 넓게) + `제거`가 활성 상태로 한 줄에 있다. 기준 PNG의 선택 에이전트는 `작업 중`이므로 위 요소 표(FR-011-AC5·FR-012-AC6)에 따르면 실제로는 두 버튼이 **비활성**이어야 한다 — PNG는 비활성 상태를 그리지 않은 목업이다. 구현 기준은 위 "판정·배치 규칙"(비활성이면 세로 스택 + 채움 배경 없는 점선 표현, ADR-29)이다.
  4. **패널 name 글꼴 크기**: 기준 PNG는 약 19px이나 `docs/ui/design-tokens.md` 글꼴 크기 단계(제목 24~26 / 섹션 14~15 / 본문 12.5~13 / 보조 11.5~12 / 최소 10)에 19px 계열이 없다. 토큰 밖 임의값을 쓰지 않고 `--text-section`(14.5px)을 쓴다.
  5. **헤더 칩 문구**: 기준 PNG의 `실행 중 [N]명`은 placeholder다. 실제 문구는 `workflowChip.ts`의 waiting 우선 규칙(ui-rules 1, §공통 `WorkflowChip`)을 따르므로 권한 대기가 있으면 `권한 대기 N명`이다.
- 상단 바에 프로젝트 칩을 두지 않는다(기준 PNG·위 요소 표 일치, §공통 `TopBar`, ADR-30). 이것은 확정 차이가 아니라 구현이 맞춰야 할 기준이다.

---

## SCR-04 상태 화면 (독립 화면 아님. 01·02·03·07 안에서 나타난다)
- FR: FR-005-E1, FR-005-AC9, FR-016, FR-007-E1, FR-001-E1, FR-002, FR-006-E3
- 기준: 와이어프레임 p.5 + 토큰·규칙

### SCR-04-1 hook 이벤트 없음 (01 실시간 이벤트·상태 막대 영역)
| 요소 | 데이터 출처 | 빈 | 로딩 | 에러 | 연결 끊김 | 클릭 시 동작·이동 |
|---|---|---|---|---|---|---|
| 점선 빈 아이콘 + 제목 `아직 수집된 활동이 없습니다` + 본문 `프로젝트 폴더에서 Claude Code를 실행하면 에이전트 활동이 여기에 나타납니다.` | `live.everReceived === false` | (이것이 빈 상태) | - | - | 유지 | - |
| 안내 박스(mono, bg-soft) `hook 설정: .claude/settings.json · 설정 화면에서 예시 복사` | 정적 | - | - | - | - | `설정 화면` 링크 → `/settings` |
| 각주 `에이전트 정의는 이벤트와 무관하게 워크플로우 탭에 표시` | 정적 | - | - | - | - | - |

### SCR-04-2 첫 로딩 (01, 다른 화면도 동일 원칙)
| 요소 | 데이터 출처 | 빈 | 로딩 | 에러 | 연결 끊김 | 클릭 시 동작·이동 |
|---|---|---|---|---|---|---|
| 제목 줄, KPI 4장, 막대, 카드 3장, 표 자리 `Skeleton` | 첫 `snapshot` 미수신 (`snapshotStore.ready === false`) | - | (이것이 로딩) | 30초 넘게 미수신이면 스켈레톤 위에 04-3 배너 | 배너 | - |

### SCR-04-3 실시간 연결 끊김 (전 화면 상단)
| 요소 | 데이터 출처 | 빈 | 로딩 | 에러 | 연결 끊김 | 클릭 시 동작·이동 |
|---|---|---|---|---|---|---|
| 배너 `실시간 연결이 끊겼습니다 · [N]초 후 재연결` + `지금 재연결` | `connectionStore.{state, retryInSec}` (FR-016-AC1·AC3) | - | - | - | (이것이 연결 끊김) | `지금 재연결` → `stream.reconnectNow()` |
| 아래 줄 `마지막 갱신 [hh:mm:ss] 기준 화면 유지` | `connectionStore.lastUpdatedAt` (FR-016-AC2) | 스냅샷을 한 번도 못 받았으면 `아직 받은 데이터가 없습니다` | - | - | - | - |

### SCR-04-4 수집 중단 (03 오피스 위)
| 요소 | 데이터 출처 | 빈 | 로딩 | 에러 | 연결 끊김 | 클릭 시 동작·이동 |
|---|---|---|---|---|---|---|
| 배너 `● hook 이벤트 수신 없음 · 마지막 수신 [yyyy-mm-dd hh:mm]`(없으면 `없음`) | `isCollectorDown = !live.everReceived || !registry.hookConfigured`, `live.lastReceivedAt` (FR-007-E1) | - | - | - | 유지 | - |
| 캐릭터·상태 글자·선택 패널 상태 (03 오피스·패널 요소) | **04-4 표시 중에는 `live` 값과 무관하게 대기색 + `대기` 글자로 표시**(말풍선 회색 `대기`, 현재 도구 `-`). 표시만 바꾸며 `live`·01·02는 그대로 (ADR-17) | - | - | - | 유지 | - |
| 헤더 칩(`WorkflowChip`)·패널 버튼 `정의 수정`·`제거` | **표시 고정 대상이 아니다.** 04-4 표시 중에도 실제 `live.agents[name].status`로 칩 문구와 버튼 비활성·사유를 정한다 (ADR-27) | - | - | - | 유지 | 버튼 동작은 SCR-03과 같다 |
| 각주 `Claude Code 미실행 또는 컨테이너 재시작 · 캐릭터는 모두 회색 대기` | 정적 | - | - | - | - | - |

- **표시 고정(`displayStatus`) 대상과 비대상 — 04-4의 확정 경계 (ADR-17 + ADR-27)**
  - 고정하는 것(표시만 `대기`): 03 오피스 캐릭터의 셔츠·모니터 색과 말풍선, 캐릭터 아래 상태 글자(부모 접미 없음), 작은 캐릭터(서브에이전트), 선택 패널의 `상태`·`현재 도구`.
  - 고정하지 않는 것(실제 `live` 값 그대로): 03 헤더 칩, 패널 `세션 시작`·`서브에이전트`·`작업 폴더`·`최근 이벤트`, 패널 `정의 수정`·`제거`의 비활성 판정과 사유, `팀장 호출 · 터미널 열기`, 01·02·07의 모든 표시, `GET /api/state`·SSE 값.
  - 이유: 고정은 "수집이 끊겨 지금 상태를 알 수 없다"는 **표시** 규칙(FR-007-E1)이고, 버튼 비활성은 "서버가 거부할 동작을 막는다"는 **동작 가드**(FR-011-AC5·FR-012-AC6)다. 칩을 고정하면 같은 워크플로우가 01·02와 03에서 다른 칩으로 보인다.
  - 그 결과 04-4 표시 중에는 패널 `상태 대기`와 버튼 사유 `작업 중에는 …`이 함께 보일 수 있다. 배너 각주가 이유를 이미 설명하므로 문구를 새로 만들지 않는다.

### SCR-04-5 에이전트 폴더 읽기 실패 (01 KPI 1·2 자리, 02 층 그리드 자리, 07 프로젝트 폴더 카드)
| 요소 | 데이터 출처 | 빈 | 로딩 | 에러 | 연결 끊김 | 클릭 시 동작·이동 |
|---|---|---|---|---|---|---|
| 점선 아이콘(danger 테두리) + 제목 `에이전트 폴더를 찾을 수 없습니다` + 경로 `<hostPath>/.claude/agents`(mono) | `registry.agentsDirMissing === true`, `config.hostPath` (FR-001-E1) | - | - | (이것이 에러) | 유지 | - |
| 본문 `컨테이너 실행 시 마운트한 폴더에 .claude가 있는지 확인하세요.` `쓰기 권한이 없으면 추가·수정·삭제 버튼은 비활성.` | 정적 | - | - | - | - | - |
| 버튼 `다시 읽기`(secondary) `설정 열기`(primary, **01·02에만**) | `POST /api/registry/rescan` (FR-001-AC4) | - | 요청 중 `다시 읽는 중…` 비활성 | 실패 → `다시 읽지 못했습니다 · <message>` | 활성 | `다시 읽기` → rescan / `설정 열기` → `/settings` |

- **`설정 열기`의 표시 범위 (ADR-42)**: 이 버튼은 `docs/ui/screen-flow.md` 표가 확정한 **07로 들어오는 이동**이다. 07 안에서는 도착지가 현재 화면이라 눌러도 변화가 없으므로(`docs/ui/ui-rules.md` 2 "눌러도 아무 일이 없는 활성 버튼을 만들지 않는다") **07에서는 그리지 않는다.** 07의 04-5에는 `다시 읽기` 하나만 남고, 나머지 요소(제목·경로·본문 2줄·에러 줄)는 01·02와 같다.
  - 비활성으로 두지 않는 이유: 이유 줄 문구가 확정 문서에 없고(신설 금지 — conventions §2 MUST), 07에서는 영원히 활성화되지 않는 컨트롤이 된다. 따라서 §공통 "비활성 버튼의 이유 줄"(ADR-35) 목록에도 **추가하지 않는다.**
  - 구현 기준: 표시 여부는 화면이 prop으로 넘긴다(01·02는 기본값, 07만 숨김). 공용 컴포넌트가 라우트를 읽어 스스로 판정하지 않는다.

### SCR-04-6 정의 파일 형식 오류 (02 층 위)
| 요소 | 데이터 출처 | 빈 | 로딩 | 에러 | 연결 끊김 | 클릭 시 동작·이동 |
|---|---|---|---|---|---|---|
| 제목 줄(danger-soft) `읽지 못한 정의 파일 [N]개` | `registry.formatErrors.length` (FR-002-AC2) | 0이면 카드 숨김 | - | - | 유지 | - |
| 목록 행: `<file>`(mono) + 사유 | `formatErrors[]`: agent → `<파일>.md` + message(`name 누락`/`name 형식 위반`/`frontmatter 형식 오류`/`name 중복 (<다른 파일>)`/`UTF-8 인코딩 오류`/`마운트 밖 링크`) / workflow → `<파일>.json · 구성 파일 형식 오류`(FR-002-AC6) / broken-ref → `<name> · 구성 파일 참조 깨짐 (<workflow>)`(FR-002-AC5) | - | - | - | 유지 | 없음 |
| 각주 `오류 파일은 층에 표시하지 않고 목록만 표시 · 수정은 에디터에서` (FR-002-AC3) | 정적 | - | - | - | - | - |
| 링크 `정상 파일은 수정 팝업에서 편집 →` | 정적 | - | - | - | - | 없음(안내). 형식 오류 파일 편집 시도(`GET /api/agents/{name}` 409 `UNEDITABLE`) → 이 카드로 스크롤 + 강조 (FR-011-E3) |

### SCR-04-7 워크플로우 0개 (01 대표 워크플로우 영역, 02 층 그리드 자리)
| 요소 | 데이터 출처 | 빈 | 로딩 | 에러 | 연결 끊김 | 클릭 시 동작·이동 |
|---|---|---|---|---|---|---|
| 점선 카드 `+` + `아직 워크플로우가 없습니다` + 버튼 `워크플로우 추가`(primary) | `registry.workflows.length === 0` (FR-005-AC5, FR-006-E3) | (이것이 빈 상태) | - | `writable=false` → 버튼 비활성 `쓰기 권한 없음` | 유지 | `?dialog=workflow-add` (05 왼쪽) |

---

## SCR-05 워크플로우 추가 · 기존 에이전트 가져오기 · 삭제 확인 (팝업)
- FR: FR-008, FR-009, FR-017, FR-005-AC5
- 기준: 와이어프레임 p.6 + 토큰·규칙. 05-3은 06-6과 같은 구성.

### SCR-05-L 워크플로우 추가 (`?dialog=workflow-add`)
| 요소 | 데이터 출처 | 빈 | 로딩 | 에러 | 연결 끊김 | 클릭 시 동작·이동 |
|---|---|---|---|---|---|---|
| 제목 `워크플로우 추가` + 설명 `구성 파일 .jaystudio/teams/이름.json(팀장·팀원 목록)이 만들어집니다.` | 정적 | - | - | - | 뒤 화면 배너 | - |
| 입력 `이름`(필수, placeholder `개발부서`) + 힌트 `이름 중복 불가 · 개수 제한 없음` | 로컬 상태. 프론트 사전 검증 `validators.ts`(FR-008-AC2 규칙: trim, 1~40자, `^[가-힣A-Za-z0-9 _-]+$`) | - | - | 필드 아래 `fields.name`(FR-008-E1·E2) 또는 사전 검증 문구 `1~40자, 한글·영문·숫자·공백·하이픈·언더스코어만` | 활성 | - |
| 입력 `설명 (선택)` placeholder `한 줄 설명` | 로컬 | - | - | - | 활성 | - |
| 안내 박스(danger-soft) `만든 뒤 팀장 1명을 만들거나 가져오세요. 팀장이 없으면 층에 팀장 없음이 표시됩니다.` | 정적 (FR-008-AC3) | - | - | - | - | - |
| 버튼 `취소`(secondary) `만들기`(primary) | `POST /api/workflows` | 이름 비었으면 `만들기` 비활성 (이유 줄 없음 — ADR-35) | 요청 중 `만드는 중…` | 500 `IO_FAILED` → 팝업 하단 `message` (FR-008-E3) / `writable=false` → 비활성 `쓰기 권한 없음` | 활성 | 성공 → 팝업 닫힘(`?dialog` 제거), 02에 새 층(SSE `registry`) (FR-008-AC4). 01에서 열었으면 `/workflows`로 이동 |

- 와이어프레임 p.6 표기와의 관계(ADR-33): 와이어프레임은 설명줄을 `.jaystudio/teams/[이름].json`, 설명 입력 placeholder를 `[한 줄 설명]`으로 그린다. 두 문자열 모두 값을 주는 데이터 출처가 없으므로 치환 자리가 아니다 — 설명줄은 **(c) 정적 텍스트**(괄호만 벗겨 `이름.json`), 설명 입력은 **(b) 입력 예시**(placeholder `한 줄 설명`)다. 05-3의 같은 경로 문구가 실제 이름으로 치환되는 것은 그 행의 출처가 `?workflow`이기 때문이다(= (a)).

### SCR-05-R 기존 에이전트 가져오기 (`?dialog=import[&workflow=<이름>]`)
| 요소 | 데이터 출처 | 빈 | 로딩 | 에러 | 연결 끊김 | 클릭 시 동작·이동 |
|---|---|---|---|---|---|---|
| 제목 `<워크플로우>(으)로 기존 에이전트 가져오기` (대상이 없으면 `기존 에이전트 가져오기`) + 부제 `어느 워크플로우에도 없는 정의 파일 [N]개 · 파일은 그대로 두고 소속만 지정` | **대상 워크플로우** = `?workflow` 있으면 그 값, 없으면 아래 드롭다운의 **현재 선택값**(ADR-38 — 드롭다운을 바꾸면 제목도 바뀐다). N = 워크플로우 밖 에이전트 수. 조사는 병기 표기(ADR-39) | 대상 없음(= `registry.workflows.length === 0`)일 때만 `기존 에이전트 가져오기` | - | - | 뒤 화면 배너 | - |
| 대상 워크플로우 드롭다운 (헤더 링크로 열었을 때만, FR-009-AC7) | `registry.workflows` 이름 목록(name 오름차순). **기본 선택 = 목록의 첫 워크플로우**(빈 선택 옵션을 두지 않는다, ADR-38). `?workflow` 있으면 드롭다운 대신 고정 텍스트 | 워크플로우 0 → `먼저 워크플로우를 추가하세요` + `가져오기` 비활성 (이유 줄 없음 — ADR-35) | - | - | 활성 | 선택 변경 시 제목·`팀장` 옵션 비활성(FR-009-AC4)이 함께 갱신되고, 행별 `역할` 선택은 `팀원`으로 초기화된다 |
| 검색 입력 `이름·설명 검색` | 로컬 → `search.ts` (FR-009-AC2 name·description 부분 일치, 대소문자 무시). **검색은 표시 필터일 뿐이며 체크 상태·행별 `역할` 선택을 바꾸지 않는다**(ADR-37) | 결과 0 → `일치하는 에이전트가 없습니다` | - | - | 활성 | - |
| 안내 줄 `검색으로 가려진 선택 [N]명` (검색 입력 아래, 목록 표·결과 0 안내 위. `text-aux` + `text-text-secondary`) | N = 선택한 name 중 현재 검색 결과에 없는 수 (ADR-37) | N = 0 → 줄을 그리지 않는다 (검색어가 없으면 항상 0) | - | - | 활성(마지막 값 유지) | 없음 |
| 버튼 `+ 새로 만들기`(add) | - | - | - | `writable=false` → 비활성 | 활성 | `?dialog=agent-new&workflow=<대상>` (06 만들기, 대상 미리 선택) |
| 목록 표: 체크박스 / `이름 (name)`(mono bold) / `설명 (description)`(첫 줄) / `역할` 드롭다운(`팀장`/`팀원`) | `registry.agents.filter(workflow === null)` name 오름차순 (FR-009-AC1). 역할 기본 `팀원`. 대상 워크플로우 `lead !== null`이면 `팀장` 옵션 `disabled` (FR-009-AC4); 이미 목록에서 다른 행이 `팀장`이면 다른 행의 `팀장`도 disabled(FR-009-E1 사전 방지). 선택 행 배경 `bg-selected` | 워크플로우 밖 0명 → 표 대신 `가져올 에이전트가 없습니다 · 새로 만들어 넣으세요` + `+ 새로 만들기`만 (FR-009-AC6) | 5행 스켈레톤 | - | 활성 | 체크 토글 |
| 안내 박스 `팀장은 워크플로우당 1명이고 층의 첫 자리에 배치됩니다. 이미 팀장이 있으면 팀장 선택은 비활성.` `가져온 뒤 워크플로우에서 제거하면 정의 파일이 휴지통(.jaystudio/trash/)으로 이동합니다. 다른 워크플로우 소속 에이전트는 목록에 없습니다.` | 정적 | - | - | - | - | - |
| 에러 영역 (표 아래) | `POST` 응답 `rejected[]` → 행마다 `<name>: <사유>` 한 줄(danger). 사유는 `reason` 세 값이 전부다(ADR-36): `ALREADY_ASSIGNED` → `가져오는 사이 다른 워크플로우에 소속되었습니다` / `NOT_FOUND` → `정의 파일이 없습니다 · 목록을 확인하세요` / `FORMAT_ERROR` → `읽지 못한 정의 파일입니다 · 목록을 확인하세요`. enum 밖 값이 오면 사유 없이 이름만 표시한다. 409 `LEAD_EXISTS`·400 `VALIDATION`·500 `IO_FAILED` → `message` (FR-009-E1~E3) | - | - | (이것이 에러) | - | rejected가 있으면 목록 갱신(SSE registry)하고 팝업 유지 |
| 버튼 `취소` `선택한 [N]명 가져오기`(primary) | `POST /api/workflows/{workflow}/members` (FR-009-AC5) | N=0 → 비활성 | `가져오는 중…` | `writable=false` → 비활성 `쓰기 권한 없음` | 활성 | 성공(rejected 없음) → 닫힘, 02 갱신 |

- 와이어프레임 p.6 오른쪽과의 확정된 차이 — 화면 대조 시 결함으로 보지 않는다:
  1. `대상 워크플로우` 행(드롭다운 또는 고정 텍스트)은 와이어프레임에 없다. FR-009-AC7이 요구하는 행이라 위 요소 표가 기준이다.
  2. 안내 줄 `검색으로 가려진 선택 [N]명`은 와이어프레임에 없다. 검색으로 선택 행이 가려진 **화면 상태**를 기존 토큰(`text-aux`·`text-text-secondary`)만으로 표현한 것이며 새 레이아웃·색 체계가 아니다(ADR-37). 가려진 선택이 0명이면 화면은 와이어프레임과 같다.
  3. 팝업 폭은 `lg`(768px)다. 와이어프레임 p.6이 오른쪽 팝업을 왼쪽보다 넓게 그린 것과 방향이 같다(ADR-40).
  - 이 목록에 없는 요소 누락·추가·순서 차이는 그대로 결함이다.

### SCR-05-3 워크플로우 삭제 확인 (`?dialog=workflow-delete&workflow=<이름>`)
| 요소 | 데이터 출처 | 빈 | 로딩 | 에러 | 연결 끊김 | 클릭 시 동작·이동 |
|---|---|---|---|---|---|---|
| 제목 `<이름> 워크플로우를 삭제할까요?` + 안내 `구성 파일 .jaystudio/teams/<이름>.json이 삭제됩니다` | `?workflow` (FR-017-AC2) | - | - | - | 뒤 화면 배너 | - |
| 입력 `확인을 위해 이름 입력` | 로컬 | - | - | - | 활성 | - |
| 버튼 `취소` `삭제 (이름 일치 시 활성)`(danger) | `DELETE /api/workflows/{workflow}` | 입력 ≠ 이름 → 비활성 (FR-017-AC3, 이유 줄 없음 — 라벨이 조건을 말한다, ADR-35) | `삭제 중…` | 409 `WORKFLOW_NOT_EMPTY` → `팀원이 있어 삭제할 수 없습니다`를 **3초(3000ms)** 표시한 뒤 팝업 닫고 02 갱신(FR-017-E1, ADR-34) / 500 → `message` 팝업 유지(FR-017-E2) | 활성 | 성공 → 닫힘, 층 사라짐(FR-017-AC4) |

- FR-017-E1 안내 표시 구간의 확정 동작(ADR-34):
  - 지속 시간은 **3000ms**다. design token이 아니라 동작 지연이므로 값은 코드 상수(`NOT_EMPTY_NOTICE_MS`)로 두고, 그 값이 이 문서의 3000ms와 같아야 한다.
  - 표시 중 `삭제`는 비활성을 유지한다(같은 DELETE를 두 번 보내지 않는다). 진행 중 상태이므로 이유 줄은 붙이지 않는다(ADR-35).
  - 사용자가 3초 전에 `취소`·ESC로 닫으면 즉시 닫힌다(§공통 `Dialog`). 02 갱신은 SSE `registry`가 하므로 닫히는 시점과 무관하다.

---

## SCR-06 에이전트 만들기 · 수정 · 제거 (팝업)
- FR: FR-010, FR-011, FR-012, FR-002-AC3
- 기준: 와이어프레임 p.7 + 토큰·규칙. 만들기와 수정은 같은 폼.
- 팝업 폭(§공통 `Dialog`, ADR-40): **06 폼 = `lg`**(도구 체크박스 9종 + `기타` 입력, 지침 textarea가 들어간다) / **06-5 = `md`**(폼 위 작은 창) / **06-6 = `md`**(05-3과 같은 구성, 같은 `ConfirmByNameDialog`).

### SCR-06 폼 (`?dialog=agent-new[&workflow=<이름>]` / `?dialog=agent-edit&agent=<name>`)
| 요소 | 데이터 출처 | 빈 | 로딩 | 에러 | 연결 끊김 | 클릭 시 동작·이동 |
|---|---|---|---|---|---|---|
| 제목 `에이전트 만들기` / `에이전트 수정` + 경로 `JayStudio/.claude/agents/<name>.md`(mono faint) | 모드, 수정 시 `GET /api/agents/{name}`.`filePath` | - | 수정: 파일 읽는 동안 폼 전체 비활성 + 필드 스켈레톤 | GET 404 → `정의 파일이 없습니다 · 목록을 확인하세요` + `닫기` / 409 `UNEDITABLE` → 팝업 열지 않고 02 04-6로 스크롤(FR-011-E3) | 뒤 화면 배너 | - |
| `이름 (name)` 필수 + 힌트 `소문자와 하이픈만 · 중복 불가` | `AgentDetail.name` / 빈 값. 사전 검증 `^[a-z0-9-]{1,64}$` | - | - | `fields.name` (`소문자·숫자·하이픈만, 1~64자` / `이미 있는 name입니다`) (FR-010-E1, FR-011-E2) | 활성 | - |
| `모델 (model)` 드롭다운: `상속 (지정 안 함)` / `sonnet` / `opus` / `haiku` / `직접 입력` (+ 입력창) (ADR-13) | `AgentDetail.model`: null → 상속, 목록 값 → 해당, 그 외 → 직접 입력에 채움. `hasLiteralInheritModel` → 상속 표시 | - | - | `fields.model` `허용하지 않는 값` | 활성 | 직접 입력 선택 시 입력창 표시 |
| `소속 워크플로우` 필수 드롭다운 + 힌트 `한 에이전트는 한 워크플로우에만 소속` | `registry.workflows` 이름. 만들기: `?workflow` 미리 선택, 없으면 빈 선택(필수). 수정: `AgentDetail.workflow`; 워크플로우 밖 에이전트면 `(없음)` 옵션 허용 (FR-011-AC3) | 워크플로우 0 → 만들기 불가 안내 `먼저 워크플로우를 추가하세요` | - | `fields.workflow` `필수` | 활성 | 바꾸면 역할 옵션 재계산 |
| `역할` 라디오 `팀장` `팀원` + 힌트 `팀장은 워크플로우당 1명 · 층 첫 자리 · 이미 있으면 비활성` | 선택 워크플로우 `lead`: 있고 그게 자기 자신이 아니면 `팀장` 비활성 + 이유 `이미 팀장이 있습니다 (<lead>)` (FR-010-AC4) | 워크플로우 `(없음)`이면 라디오 비활성 | - | 409 `LEAD_EXISTS` → 라디오 옆 `message` | 활성 | - |
| `설명 (description)` 필수 (placeholder `언제 이 에이전트에게 일을 맡기는지` — 와이어프레임 p.7 `[...]`의 (b) 입력 예시, ADR-33) | `AgentDetail.description` | - | - | `fields.description` `필수` | 활성 | - |
| `사용 도구 (tools)` 라디오 `전체 상속` / `직접 선택` + 체크박스 `Read Grep Glob Edit Write Bash WebFetch WebSearch Agent` + `기타` 입력(쉼표 구분. 와이어프레임 `[기타]`의 (c) 정적 텍스트 = 입력 라벨, ADR-33) | `AgentDetail.tools`: null → 전체 상속, 배열 → 직접 선택(목록에 없는 값은 기타에 쉼표로) (FR-010-AC2). 만들기 기본값: 선택 없음(명시 선택 필요) | - | - | 라디오 미선택 → `저장` 비활성 `도구 방식을 고르세요`; 직접 선택 0개 → `fields.tools` `직접 선택은 1개 이상` | 활성 | - |
| `지침 (본문 = 시스템 프롬프트)` textarea (mono) | `AgentDetail.body` 원문 | - | - | - | 활성 | - |
| 각주 `이름 변경 시 파일명도 변경 · 폼에 없는 필드(permissionMode 등)는 기존 값 보존` | 정적 (FR-011-AC1·AC2) | - | - | - | - | - |
| 저장 후 안내 (토스트가 아닌 02 상단 한 줄, 8초) `Claude Code가 새 정의를 바로 인식하지 못하면 재시작이 필요할 수 있습니다` | 만들기 성공 시 (FR-010-AC6) | - | - | - | - | - |
| 버튼 `워크플로우에서 제거`(danger, 수정 모드만) | `AgentDetail.status`, `writable` | 만들기 모드 → 없음 | - | status ≠ idle → 비활성 `작업 중에는 제거할 수 없습니다` (FR-012-AC6) | 활성 | 06-6 열기 |
| 버튼 `취소` `저장`(primary) | 만들기 `POST /api/agents` / 수정 `PUT /api/agents/{name}` (`expectedRevision` = GET의 `revision`) | 필수값 비면 비활성 | `저장 중…` | 400 → 필드별 / 409 `REVISION_CONFLICT` → 06-5 / 409 `AGENT_BUSY` → 폼 상단 `작업 중에는 수정할 수 없습니다 · 대기가 되면 다시 시도하세요` 폼 유지(FR-011-E4) / 409 `FILE_GONE` → `저장 중 파일이 사라졌습니다`(FR-011-E1) / 500 → `message` (FR-010-E3) / `writable=false` → 비활성 `쓰기 권한 없음`(FR-010-E2) | 활성 | 성공 → `/workflows`로 이동(팝업 닫힘), 새·바뀐 책상 표시 (FR-010-AC5) |

### SCR-06-5 저장 충돌 (폼 위 작은 창)
| 요소 | 데이터 출처 | 빈 | 로딩 | 에러 | 연결 끊김 | 클릭 시 동작·이동 |
|---|---|---|---|---|---|---|
| 제목 `파일이 다른 곳에서 수정되었습니다` + 본문 `<name>.md이 이 창을 연 뒤 [hh:mm:ss]에 변경되었습니다. 저장하면 그 변경이 사라집니다.` | 409 `REVISION_CONFLICT`.`details.modifiedAt` (FR-011-AC4) | - | - | - | 뒤 배너 | - |
| 버튼 `최신 파일 다시 불러오기`(secondary) `덮어쓰기`(danger 배경 진한) | `GET /api/agents/{name}` 재호출 / `PUT` `force: true` | - | 각각 진행 중 비활성 | 실패 → 폼 에러 | 활성 | 다시 불러오기 → 폼 재채움, 창 닫힘 / 덮어쓰기 → 저장 흐름 |

### SCR-06-6 워크플로우에서 제거 확인 (`?dialog=agent-remove&agent=<name>` 또는 06 안에서)
| 요소 | 데이터 출처 | 빈 | 로딩 | 에러 | 연결 끊김 | 클릭 시 동작·이동 |
|---|---|---|---|---|---|---|
| 제목 `<name>을(를) <워크플로우>에서 제거할까요?` (워크플로우 밖이면 `<name>을(를) 제거할까요?`. 조사 병기 표기 — ADR-39) + 목록 `정의 파일이 .jaystudio/trash/로 이동합니다 (소프트 삭제, 복구 가능).` `팀장을 제거하면 <워크플로우> 층에 팀장 없음이 표시됩니다.`(팀장일 때만) | `registry.agents[name]`.`workflow`, `role` (FR-012-AC3·AC5) | - | - | - | 뒤 배너 | - |
| 입력 `확인을 위해 이름 입력` (placeholder = name) | 로컬 | - | - | - | 활성 | - |
| 버튼 `취소` `제거 (이름 일치 시 활성)`(danger) | `DELETE /api/agents/{name}` (FR-012-AC1) | 입력 ≠ name → 비활성 | `제거 중…` | 409 `AGENT_BUSY` → `작업 중에는 제거할 수 없습니다` (FR-012-E2) / 500 `IO_FAILED` → `message`, 파일 변경 없음 (FR-012-E1) / 404 → `이미 없는 에이전트입니다` | 활성 | 성공 → 팝업 모두 닫힘, 03이었으면 `/workflows/<이름>` 유지(패널은 새 첫 자리 선택), 06이었으면 `/workflows` |

---

## SCR-07 설정 (`/settings`, 읽기 전용)
- FR: FR-014, FR-001-AC4·AC5·E1·E2, FR-013-AC5·AC9·AC10·E1~E3, FR-003-AC6
- 기준: 와이어프레임 p.4 + 토큰·규칙. "Claude 열기" 설명문은 확정 결정에 맞춰 `02의 Claude 열기 · 기본 세션과 03의 팀장 호출 · 터미널 열기를 누르면 맥북 터미널이 열리고 프로젝트 폴더에서 claude가 실행됩니다.`로 쓴다(D-F4).
- 레이아웃: `AppShell` 본문 안에서 제목 `설정` + 카드 3개를 세로로 쌓고, **카드 열 폭은 `max-w-3xl`(768px)**로 제한한다(화면 폭을 채우지 않는다 — ADR-43). 좌우 여백은 `--spacing-page-x`(32px), 카드 안 여백은 `--spacing-card-lg`(18px).

| 요소 | 데이터 출처 | 빈 | 로딩 | 에러 | 연결 끊김 | 클릭 시 동작·이동 |
|---|---|---|---|---|---|---|
| 상단바 `설정`, `127.0.0.1 전용` | 정적 | - | - | - | 유지 | - |
| 제목 `설정` | 정적 | - | - | - | - | - |
| 카드 1 `프로젝트 폴더` 배지 `읽기 전용` | `GET /api/settings` (진입 시) + SSE `registry`로 수치 갱신 | - | 값 스켈레톤 | `agentsDirMissing` → 카드 본문을 04-5로 대체 (FR-001-E1). **07의 04-5에는 `설정 열기`를 그리지 않는다**(`다시 읽기`만, ADR-42) | 유지 | - |
| 행 `마운트 폴더` `<hostPath>`(mono) | `settings.hostPath` (FR-001-AC5, FR-014-AC4). 입력 없음 | - | 스켈레톤 | - | 유지 | - |
| 행 `에이전트` `.claude/agents/ · 정의 [N]개` | `settings.agentCount` | - | 스켈레톤 | - | 유지 | - |
| 행 `스킬` `.claude/skills/ · [N]개` | `settings.skillCount` | - | 스켈레톤 | - | 유지 | - |
| 행 `쓰기 권한` `✓ agents 추가·수정·삭제 가능` / `✗ 쓰기 권한 없음`(danger) | `settings.writable` (FR-001-E2) | - | 스켈레톤 | - | 유지 | - |
| 행 `형식 오류` `! 읽지 못한 정의 파일 [N] 개`(N>0이면 danger) / `없음` | `settings.formatErrorCount` | - | 스켈레톤 | - | 유지 | - |
| 각주 `폴더는 컨테이너 실행 시 마운트로 고정 · 웹에서 변경 불가` + 버튼 `다시 읽기`(secondary) | `POST /api/registry/rescan` (FR-001-AC4) | - | `다시 읽는 중…` | 실패 → `다시 읽지 못했습니다 · <message>` | 활성 | rescan → 값 갱신 |
| 카드 2 `Claude 열기` 설명문(위 D-F4 문구) | 정적 | - | - | - | - | - |
| 행 `터미널 앱` `macOS 기본 터미널` | `settings.terminalApp` | - | - | - | - | - |
| 행 `기본 세션` `cd "<hostPath>" && claude`(mono) | `settings.defaultSessionCommand` (FR-013-AC1·AC5) | - | 스켈레톤 | - | 유지 | - |
| 행 `팀장으로 열기` = `settings.leadSessionCommandTemplate` 값 그대로(`cd "<hostPath>" && claude --agent <팀장 name>`. **이 값의 `<팀장 name>`은 서버가 주는 템플릿 문자열의 일부라 화면에 그대로 나온다** — FR-013-AC2 확정 문구, ADR-33 (a)의 유일한 괄호 노출 사례) + 힌트 `도우미가 받는 값은 팀장 name 하나 · 소문자·숫자·하이픈만 허용` | `settings.leadSessionCommandTemplate` (FR-013-AC2·AC5) | - | 스켈레톤 | - | 유지 | - |
| 행 `열기 도우미` `● 설치됨 · 응답 확인 [hh:mm:ss]` / `● 미설치 · helper/install.sh로 설치` | 진입 시와 버튼 누를 때 도우미 `GET /health`(2초 타임아웃) (FR-013-AC10). `GET /api/helper/token`이 null이면 `미설치 · 토큰 파일 없음` | - | `확인 중…` | 무응답 → 미설치 표시 | 유지 | - |
| 버튼 `테스트로 열기 (도우미 설치 후)` `명령 복사` | 도우미 `POST /open {target:'default'}` / 클립보드 = `defaultSessionCommand` (FR-014-AC5) | - | - | 도우미 미응답 → `테스트로 열기` 비활성 `도우미 미설치` (FR-013-AC10). 403 → `도우미 인증 실패 · 도우미를 다시 설치하세요`(FR-013-E2) | 활성 | 테스트로 열기 → 도우미 호출 / 명령 복사 → `복사됨` |
| 카드 3 `수집` 행 `수집 주소` `http://127.0.0.1:[포트]/hooks/events`(mono) | `settings.collectUrl` | - | 스켈레톤 | - | 유지 | - |
| 행 `hook 설정` `.claude/settings.json · 설정됨`(running) / `없음`(danger) + 버튼 `설정 예시 복사` | `settings.hookConfigured` (FR-014-AC3), 클립보드 = `settings.hookSettingsExample` (FR-014-AC2) | - | 스켈레톤 | - | 유지 | `설정 예시 복사` → `복사됨` |
| 각주 `allowedHttpHookUrls가 설정되어 있으면 수집 주소를 허용 목록에 추가하세요` | `settings.allowedHttpHookUrlsNote` | - | - | - | - | - |
| 행 `워크플로우 구성` `.jaystudio/teams/*.json · 팀장·팀원 목록` | `settings.teamsPath` | - | - | - | - | - |
| 행 `휴지통` `.jaystudio/trash/ · 제거한 에이전트 보관` | `settings.trashPath` | - | - | - | - | - |
| 행 `이벤트 보존` `30일` | `settings.retentionDays` | - | - | - | - | - |

- 비활성 요소: 마운트 경로 변경 입력(Out of Scope), 팀장 명령 복사(03에서만, FR-014-AC5), 휴지통 복구·비우기(Out of Scope), 설정 파일 자동 수정(FR-014-AC1).

- 와이어프레임 p.4와의 확정된 차이 — 화면 대조 시 결함으로 보지 않는다(ADR-42·ADR-43. SCR-02·SCR-03의 같은 목록과 형식·효력이 같다). **이 목록에 없는 요소 누락·추가·순서·배치 차이는 그대로 결함이다.**
  1. **카드 열 폭**: 와이어프레임 실측 819px, 구현 `max-w-3xl`(768px, −6.2%). 819px은 `docs/ui/design-tokens.md`에도 Tailwind 기본 스케일에도 없는 값이고 임의값은 conventions §7 MUST가 금지한다. 새 폭 토큰을 만들지 않고 Tailwind 기본 스케일에서 고른다(ADR-40·ADR-31과 같은 방식, ADR-43).
  2. **여백·라벨 열 폭**: 카드 안쪽 여백 18px(`--spacing-card-lg`, 와이어프레임 ≈23px), 페이지 좌여백 32px(`--spacing-page-x`, 40px), 라벨 열 128px(`w-32`, ≈140px). 앞의 둘은 `docs/ui/design-tokens.md`가 값까지 확정한 토큰이고 전 화면이 공유하므로 토큰이 와이어프레임 실측보다 우선한다(`docs/ui/ui-rules.md` 머리말). 라벨 열은 가장 긴 라벨 `워크플로우 구성`이 128px에서 한 줄에 들어간다(ADR-43).
  3. **`agentsDirMissing`일 때 04-5의 `설정 열기` 미표시**: 위 카드 1 에러 열·SCR-04-5 참조(ADR-42).

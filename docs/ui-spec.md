# Jay Studio — UI Spec

- 기준: `docs/ui/` (screens 01·02·03 PNG, design-tokens.md, ui-rules.md, pixel-sprites.md, screen-flow.md), 와이어프레임 `docs/JayStudio_Front_Wireframe.pdf` p.4~7 (04·05·06·07 구성)
- 데이터 출처 표기: `snapshot.<경로>` = `api-spec.yaml` `Snapshot`(SSE `snapshot`/`registry`/`live` 메시지로 갱신), `GET <경로>` = REST, `정적` = 고정 문구
- 네 가지 상태 열(빈 / 로딩 / 에러 / 연결 끊김)에서 `-`는 "그 상태가 없음(요소가 항상 값을 가짐)"을 뜻한다.

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
| `TopBar` | 01·02·03·07 | 왼쪽 브레드크럼/제목 + 프로젝트 칩 `● 프로젝트 · <hostPath>`(`snapshot.config.hostPath`, mono, 01·02·03만), 오른쪽 `127.0.0.1 전용`(정적, faint). 02는 오른쪽에 `Claude 열기 · 기본 세션` 버튼 추가 |
| `DisconnectBanner` (04-3) | 전 화면 상단 | `connectionStore.state === 'disconnected'`일 때만. `실시간 연결이 끊겼습니다 · N초 후 재연결` + `지금 재연결`(secondary). 배경 `danger-soft`, 테두리 `danger-border`, 글자 `danger`. 아래 작은 줄 `마지막 갱신 <hh:mm:ss> 기준 화면 유지` |
| `Skeleton` | 전 화면 | `bg-soft` 블록, 애니메이션 없음 |
| `StatusDot` / `StatusLabel` | 전 화면 | 9~10px 사각, 모서리 `--radius-dot`(3px, `rounded-dot`), running은 `shadow-glow`. `StatusLabel` = 점 + 글자. 이 문서의 모든 `●` 상태 점(`CollectorStatus`, 01 KPI 4·`실시간 연결됨`, 02 범례, 03 04-4 배너·패널 `상태`, 07 `열기 도우미`·`hook 설정` 행)은 `StatusDot`으로 그린다. 03 오피스 캐릭터·02 책상은 상태 점이 없다(셔츠·모니터 색 + 상태 글자, pixel-sprites 기준). `TopBar` 프로젝트 칩의 `●`는 상태가 아닌 장식이라 이 규칙 대상이 아니다 |
| `WorkflowChip` | 01·02·03 | `lib/derive/workflowChip.ts`: waiting>0 → `권한 대기 N명`(waiting-soft 배경·waiting 글자) / running>0 → `실행 중 N명`(running-soft·running) / 둘 다 0 → `모두 대기`(bg-selected·text-secondary). **우선순위: 권한 대기가 있으면 권한 대기 칩**(01 PNG 카드 2) |
| `workflowCardBorder` (파생 규칙, 컴포넌트 아님) | 01 대표 카드·02 층 카드 | `lib/derive/workflowCardBorder.ts`: 입력 `{ running, waiting, leadMissing }` → 테두리 토큰. 우선순위 **① `leadMissing` → `danger-border` ② `running > 0` → `running-border` ③ `waiting > 0` → `waiting` ④ 그 외 → `border/default`**. `leadMissing`은 02 층 카드만 `true`가 될 수 있고 01은 항상 `false`를 넘긴다. 칩(`WorkflowChip`)은 waiting 우선, 테두리는 running 우선으로 서로 다르다(ADR-24). 상태를 색으로만 알리는 표시가 아니라 카드 안 요약·칩 글자가 상태를 말한다(conventions §3) |
| `Button` | 전 화면 | variant `primary`/`terminal`/`secondary`/`add`/`danger`, `disabledReason` → 점선 테두리 + faint 글자 + 옆 이유 한 줄 |
| `Dialog` | 05·06 | 가운데 모달, 배경 dim, `bg-card` 12px, ESC·`취소`로 닫기. 04-3 배너는 모달 뒤 화면 상단에 그대로 |
| `FormatErrorList` (04-6) | 02 | 아래 SCR-04-6 |
| `AgentsDirMissing` (04-5) | 01·02·07 | 아래 SCR-04-5 |
| `EmptyWorkflowCard` (04-7) | 01·02 | 아래 SCR-04-7 |
| `NoEventsYet` (04-1) | 01 | 아래 SCR-04-1 |
| `DeskSprite` (A, 22×22 → 46px) | 02 | 상태 → 셔츠·모니터 색. 아래 name(mono 10.5px, 12자 말줄임 + title) + 상태 글자(10px, 상태색). 팀장 배지 왼쪽 위 |
| `OfficeSprite` (B, 16×20 → 66×82px) | 03 | 말풍선 + 캐릭터 + name 칩 + 상태 글자. 서브에이전트용 `small` 변형(같은 격자, 48×60px, 셔츠 `sub` 색) |
| `HelperMissingDialog` | 02·03·07 | 제목 `열기 도우미가 응답하지 않습니다`, 본문 `helper/install.sh로 설치한 뒤 다시 시도하세요`, 선택한 명령(mono 박스), `명령 복사`, `닫기` |
| `CopyButton` | 03·07 | `navigator.clipboard.writeText`. 성공 시 1.5초 `복사됨` 표시 |

### 공통 상태 표현

| 상태 | 표현 |
|---|---|
| 로딩 (04-2) | 첫 `snapshot`(또는 `GET /api/state`) 전: 숫자·이름·카드·층 자리 `Skeleton`. `0`이나 빈 문구를 먼저 보여주지 않는다 |
| 에러 | 카드 안에 `무엇을 못 했는지 + 원인 + 복구 버튼`. API 실패는 `ApiError.message` 그대로 |
| 연결 끊김 (04-3) | `DisconnectBanner`. 화면은 마지막 스냅샷 유지. 버튼은 그대로 활성(요청 실패 시 에러 표시) |
| 수집 중단·미수신 | `CollectorStatus`·01 KPI에 `hook 설정 안 됨` 또는 마지막 수신 시각. 03은 04-4 배너 |
| 쓰기 권한 없음 (FR-001-E2) | `snapshot.registry.writable === false` → `+ 워크플로우 추가`, `가져오기`, `+ 만들기`, `+ 에이전트 만들기`, `정의 수정`, `제거`, `삭제`, 05·06 `만들기`/`저장`/`가져오기` 비활성 + 이유 `쓰기 권한 없음` |

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
| 헤더 `[이름]` `에이전트 [N] · 스킬 [N]` 칩 `실행 중 [N]명` `팀장 [name]` | `registry.workflows.find(name)`: 에이전트 = lead+members 수, 스킬 = `skillCount`, 칩 = `workflowChip.ts`(FR-007-AC9), 팀장 = `lead`(mono) / null → `팀장 없음`(danger) | - | 스켈레톤 | 워크플로우 없음 → 화면 본문 전체를 `워크플로우를 찾을 수 없습니다` + 버튼 `에이전트 워크플로우로`(primary → `/workflows`)로 대체 (FR-007-E2, FR-017-AC4) | 유지 | - |
| 버튼 `>_ 팀장 호출 · 터미널 열기` (terminal) | `workflow.lead`, `GET /api/helper/token`, 도우미 `POST /open {target:'lead', leadName}` (FR-013-AC2·AC6). 명령 표시·복사 = `cd "<config.hostPath>" && claude --agent <lead>` | `lead === null` → 비활성 + `팀장 없음` (FR-007-AC8, FR-013-AC4) | 비활성 | 무응답 → `HelperMissingDialog`(팀장 명령 포함, FR-013-AC9) / 403 → `도우미 인증 실패 · 도우미를 다시 설치하세요` / 400 → 도우미 message / 누른 직후 `registry.agents`에 lead가 없으면 호출하지 않고 `팀장이 없습니다` 표시 (FR-013-E4) | 활성 | 도우미 호출. 이동 없음 |
| 04-4 배너 (오피스 카드 위) | `isCollectorDown = !live.everReceived || !registry.hookConfigured` (FR-007-E1, ADR-17): `● hook 이벤트 수신 없음 · 마지막 수신 <yyyy-mm-dd hh:mm 또는 없음>` (idle 점, bg-soft). **수집 중단 규칙: 배너가 표시되는 동안 03의 캐릭터·상태 글자·선택 패널 상태는 표시만 `대기`로 고정한다(`displayStatus = isCollectorDown ? 'idle' : live.status`). 01·02·API 값은 그대로** | 조건 아니면 숨김 | - | - | 유지 | - |
| 오피스 카드 제목 `오피스` `에이전트 1명 = 캐릭터 1개 · 팀장 첫 자리, 나머지 이름순` | 정적 | - | - | - | - | - |
| 오피스 그리드 캐릭터(`OfficeSprite`) ×N: 말풍선, 캐릭터, `팀장` 배지, name 칩, 상태 글자 | `agentOrder.ts`(FR-007-AC1), `live.agents[name]`: 말풍선 = `actionLabel.ts`(FR-007-AC2: waiting → 주황 채움 `권한 요청`; running + currentTool Edit/Write/NotebookEdit → `타이핑 · <도구>`; Read/Grep/Glob → `읽기 · <도구>`; 그 밖 도구 → `<도구>`; running인데 currentTool null → `작업 중`; idle → 회색 `대기`). 셔츠·모니터 = 상태색. 상태 글자 = `작업 중`/`권한 대기`/`대기` + `parentLabel` → `· 부모 <라벨>`(FR-007-AC3). **수집 중단(04-4 표시 중): 상태 입력을 `idle`로 바꿔 렌더링 → 셔츠·모니터 대기색, 말풍선 회색 `대기`, 상태 글자 `대기`(부모 접미 없음)** | 인원 0 → 3칸 모두 `빈 자리` | 캐릭터 자리 스켈레톤 3개 | - | 유지 | 칸 클릭 → 선택(패널 갱신). 선택 칸 = running 테두리 + running-soft 배경 |
| 정의 없는 서브에이전트 작은 캐릭터(`OfficeSprite small`) | `live.undefinedSubagents.filter(s => s.parentAgentName이 이 워크플로우 소속)` → 부모 칸 바로 다음 칸. name 칩 `<agentType>`, 상태 글자 `작업 중 · 부모 <parentLabel>`, 말풍선 = `actionLabel.ts`(currentTool) (FR-007-AC3). `SubagentStop` 후 `live`에서 빠지면 사라짐. **수집 중단(04-4 표시 중): 셔츠 대기색, 말풍선·상태 글자 `대기`** | 없으면 없음 | - | - | 유지 | 클릭 → 선택 불가(패널 변화 없음, 커서 기본) |
| 빈 자리 칸 (점선, `빈 자리`) | 마지막 줄 3열 채우기 (FR-007-AC1) | 인원이 3의 배수면 없음 | - | - | - | 없음 |
| 오피스 하단 범례 `동작 매핑 타이핑 = Edit·Write 읽기 = Read·Grep·Glob 주황 말풍선 = 권한 요청 회색 = 대기 작은 캐릭터 = 서브에이전트` | 정적 | - | - | - | - | - |
| 패널 제목 `선택한 에이전트` `기본 선택 = 팀장` | 정적 | - | - | - | - | - |
| 패널 name `[name]` + `팀장` 배지, 경로 `.claude/agents/<파일명>.md` | 선택 = URL `?agent=` → 없으면 lead → 없으면 첫 자리 (FR-007-AC4). `agent.filePath`(faint mono) | 인원 0 → 패널 본문 `선택할 에이전트가 없습니다` | 스켈레톤 | - | 유지 | - |
| 패널 표: `상태` / `현재 도구` / `세션 시작` / `서브에이전트` / `작업 폴더` | `live.agents[name]`: `StatusLabel(status)`, `currentTool ? name + ' · ' + target : '-'`(FR-007-AC5), `sessionStartedAt`→hh:mm:ss 또는 `-`, `childCount`, `cwd ?? '-'`(경로는 `hostPath` 접두를 잘라 요약, title로 전체). **수집 중단(04-4 표시 중): `상태` = `대기`(idle 점), `현재 도구` = `-`. 세션 시작·서브에이전트·작업 폴더는 값 그대로** | - | 스켈레톤 | - | 유지 | - |
| 패널 `최근 이벤트` 목록 ×10: `[hh:mm] <title>` | `GET /api/agents/{name}/events?limit=10` (선택 변경·재연결 시 호출) + SSE `event` prepend (FR-007-AC6) | 0건 → `최근 이벤트 없음` | 4줄 스켈레톤 | API 실패 → `최근 이벤트를 불러오지 못했습니다` + `다시 시도` | 유지 | 없음 |
| 버튼 `정의 수정` (primary, 넓게) | `live.agents[name].status`, `writable` | - | 비활성 | status ≠ idle → 비활성 `작업 중에는 수정할 수 없습니다`(FR-011-AC5). `writable=false` → `쓰기 권한 없음` | 활성 | `?dialog=agent-edit&agent=<name>` (06 수정) |
| 버튼 `제거` (danger) | 같은 조건 | - | 비활성 | status ≠ idle → 비활성 `작업 중에는 제거할 수 없습니다`(FR-012-AC6). `writable=false` → `쓰기 권한 없음` | 활성 | `?dialog=agent-remove&agent=<name>` (06-6) |
| 패널 각주 `제거 = 휴지통(.jaystudio/trash/)으로 이동 · 원문 로그 보기 없음` / `작업 지시는 상단 팀장 호출로 연 터미널에서 직접 한다 · claude --agent <lead>` | 정적 + `workflow.lead` | lead 없으면 두 번째 줄 `팀장 없음` | - | - | - | - |

- 비활성 요소: 원문 로그 보기(Out of Scope), 작은 캐릭터 선택(정의 파일 없음), 정의 없는 서브에이전트의 부모가 로비·워크플로우 밖이면 03에 표시하지 않음(ADR-10).

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
| 각주 `Claude Code 미실행 또는 컨테이너 재시작 · 캐릭터는 모두 회색 대기` | 정적 | - | - | - | - | - |

### SCR-04-5 에이전트 폴더 읽기 실패 (01 KPI 1·2 자리, 02 층 그리드 자리, 07 프로젝트 폴더 카드)
| 요소 | 데이터 출처 | 빈 | 로딩 | 에러 | 연결 끊김 | 클릭 시 동작·이동 |
|---|---|---|---|---|---|---|
| 점선 아이콘(danger 테두리) + 제목 `에이전트 폴더를 찾을 수 없습니다` + 경로 `<hostPath>/.claude/agents`(mono) | `registry.agentsDirMissing === true`, `config.hostPath` (FR-001-E1) | - | - | (이것이 에러) | 유지 | - |
| 본문 `컨테이너 실행 시 마운트한 폴더에 .claude가 있는지 확인하세요.` `쓰기 권한이 없으면 추가·수정·삭제 버튼은 비활성.` | 정적 | - | - | - | - | - |
| 버튼 `다시 읽기`(secondary) `설정 열기`(primary) | `POST /api/registry/rescan` (FR-001-AC4) | - | 요청 중 `다시 읽는 중…` 비활성 | 실패 → `다시 읽지 못했습니다 · <message>` | 활성 | `다시 읽기` → rescan / `설정 열기` → `/settings` |

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
| 제목 `워크플로우 추가` + 설명 `구성 파일 .jaystudio/teams/[이름].json(팀장·팀원 목록)이 만들어집니다.` | 정적 | - | - | - | 뒤 화면 배너 | - |
| 입력 `이름`(필수, placeholder `개발부서`) + 힌트 `이름 중복 불가 · 개수 제한 없음` | 로컬 상태. 프론트 사전 검증 `validators.ts`(FR-008-AC2 규칙: trim, 1~40자, `^[가-힣A-Za-z0-9 _-]+$`) | - | - | 필드 아래 `fields.name`(FR-008-E1·E2) 또는 사전 검증 문구 `1~40자, 한글·영문·숫자·공백·하이픈·언더스코어만` | 활성 | - |
| 입력 `설명 (선택)` placeholder `[한 줄 설명]` | 로컬 | - | - | - | 활성 | - |
| 안내 박스(danger-soft) `만든 뒤 팀장 1명을 만들거나 가져오세요. 팀장이 없으면 층에 팀장 없음이 표시됩니다.` | 정적 (FR-008-AC3) | - | - | - | - | - |
| 버튼 `취소`(secondary) `만들기`(primary) | `POST /api/workflows` | 이름 비었으면 `만들기` 비활성 | 요청 중 `만드는 중…` | 500 `IO_FAILED` → 팝업 하단 `message` (FR-008-E3) / `writable=false` → 비활성 `쓰기 권한 없음` | 활성 | 성공 → 팝업 닫힘(`?dialog` 제거), 02에 새 층(SSE `registry`) (FR-008-AC4). 01에서 열었으면 `/workflows`로 이동 |

### SCR-05-R 기존 에이전트 가져오기 (`?dialog=import[&workflow=<이름>]`)
| 요소 | 데이터 출처 | 빈 | 로딩 | 에러 | 연결 끊김 | 클릭 시 동작·이동 |
|---|---|---|---|---|---|---|
| 제목 `<워크플로우>로 기존 에이전트 가져오기` (워크플로우 미정이면 `기존 에이전트 가져오기`) + 부제 `어느 워크플로우에도 없는 정의 파일 [N]개 · 파일은 그대로 두고 소속만 지정` | `?workflow`, N = 워크플로우 밖 에이전트 수 | - | - | - | 뒤 화면 배너 | - |
| 대상 워크플로우 드롭다운 (헤더 링크로 열었을 때만, FR-009-AC7) | `registry.workflows` 이름 목록. `?workflow` 있으면 드롭다운 대신 고정 텍스트 | 워크플로우 0 → `먼저 워크플로우를 추가하세요` + `가져오기` 비활성 | - | - | 활성 | - |
| 검색 입력 `이름·설명 검색` | 로컬 → `search.ts` (FR-009-AC2 name·description 부분 일치, 대소문자 무시) | 결과 0 → `일치하는 에이전트가 없습니다` | - | - | 활성 | - |
| 버튼 `+ 새로 만들기`(add) | - | - | - | `writable=false` → 비활성 | 활성 | `?dialog=agent-new&workflow=<대상>` (06 만들기, 대상 미리 선택) |
| 목록 표: 체크박스 / `이름 (name)`(mono bold) / `설명 (description)`(첫 줄) / `역할` 드롭다운(`팀장`/`팀원`) | `registry.agents.filter(workflow === null)` name 오름차순 (FR-009-AC1). 역할 기본 `팀원`. 대상 워크플로우 `lead !== null`이면 `팀장` 옵션 `disabled` (FR-009-AC4); 이미 목록에서 다른 행이 `팀장`이면 다른 행의 `팀장`도 disabled(FR-009-E1 사전 방지). 선택 행 배경 `bg-selected` | 워크플로우 밖 0명 → 표 대신 `가져올 에이전트가 없습니다 · 새로 만들어 넣으세요` + `+ 새로 만들기`만 (FR-009-AC6) | 5행 스켈레톤 | - | 활성 | 체크 토글 |
| 안내 박스 `팀장은 워크플로우당 1명이고 층의 첫 자리에 배치됩니다. 이미 팀장이 있으면 팀장 선택은 비활성.` `가져온 뒤 워크플로우에서 제거하면 정의 파일이 휴지통(.jaystudio/trash/)으로 이동합니다. 다른 워크플로우 소속 에이전트는 목록에 없습니다.` | 정적 | - | - | - | - | - |
| 에러 영역 (표 아래) | `POST` 응답 `rejected[]` → `<name>: 가져오는 사이 다른 워크플로우에 소속되었습니다`(ALREADY_ASSIGNED) 등, 409 `LEAD_EXISTS`·400 `VALIDATION`·500 `IO_FAILED` → `message` (FR-009-E1~E3) | - | - | (이것이 에러) | - | rejected가 있으면 목록 갱신(SSE registry)하고 팝업 유지 |
| 버튼 `취소` `선택한 [N]명 가져오기`(primary) | `POST /api/workflows/{workflow}/members` (FR-009-AC5) | N=0 → 비활성 | `가져오는 중…` | `writable=false` → 비활성 `쓰기 권한 없음` | 활성 | 성공(rejected 없음) → 닫힘, 02 갱신 |

### SCR-05-3 워크플로우 삭제 확인 (`?dialog=workflow-delete&workflow=<이름>`)
| 요소 | 데이터 출처 | 빈 | 로딩 | 에러 | 연결 끊김 | 클릭 시 동작·이동 |
|---|---|---|---|---|---|---|
| 제목 `<이름> 워크플로우를 삭제할까요?` + 안내 `구성 파일 .jaystudio/teams/<이름>.json이 삭제됩니다` | `?workflow` (FR-017-AC2) | - | - | - | 뒤 화면 배너 | - |
| 입력 `확인을 위해 이름 입력` | 로컬 | - | - | - | 활성 | - |
| 버튼 `취소` `삭제 (이름 일치 시 활성)`(danger) | `DELETE /api/workflows/{workflow}` | 입력 ≠ 이름 → 비활성 (FR-017-AC3) | `삭제 중…` | 409 `WORKFLOW_NOT_EMPTY` → `팀원이 있어 삭제할 수 없습니다` 표시 후 팝업 닫고 02 갱신(FR-017-E1) / 500 → `message` 팝업 유지(FR-017-E2) | 활성 | 성공 → 닫힘, 층 사라짐(FR-017-AC4) |

---

## SCR-06 에이전트 만들기 · 수정 · 제거 (팝업)
- FR: FR-010, FR-011, FR-012, FR-002-AC3
- 기준: 와이어프레임 p.7 + 토큰·규칙. 만들기와 수정은 같은 폼.

### SCR-06 폼 (`?dialog=agent-new[&workflow=<이름>]` / `?dialog=agent-edit&agent=<name>`)
| 요소 | 데이터 출처 | 빈 | 로딩 | 에러 | 연결 끊김 | 클릭 시 동작·이동 |
|---|---|---|---|---|---|---|
| 제목 `에이전트 만들기` / `에이전트 수정` + 경로 `JayStudio/.claude/agents/<name>.md`(mono faint) | 모드, 수정 시 `GET /api/agents/{name}`.`filePath` | - | 수정: 파일 읽는 동안 폼 전체 비활성 + 필드 스켈레톤 | GET 404 → `정의 파일이 없습니다 · 목록을 확인하세요` + `닫기` / 409 `UNEDITABLE` → 팝업 열지 않고 02 04-6로 스크롤(FR-011-E3) | 뒤 화면 배너 | - |
| `이름 (name)` 필수 + 힌트 `소문자와 하이픈만 · 중복 불가` | `AgentDetail.name` / 빈 값. 사전 검증 `^[a-z0-9-]{1,64}$` | - | - | `fields.name` (`소문자·숫자·하이픈만, 1~64자` / `이미 있는 name입니다`) (FR-010-E1, FR-011-E2) | 활성 | - |
| `모델 (model)` 드롭다운: `상속 (지정 안 함)` / `sonnet` / `opus` / `haiku` / `직접 입력` (+ 입력창) (ADR-13) | `AgentDetail.model`: null → 상속, 목록 값 → 해당, 그 외 → 직접 입력에 채움. `hasLiteralInheritModel` → 상속 표시 | - | - | `fields.model` `허용하지 않는 값` | 활성 | 직접 입력 선택 시 입력창 표시 |
| `소속 워크플로우` 필수 드롭다운 + 힌트 `한 에이전트는 한 워크플로우에만 소속` | `registry.workflows` 이름. 만들기: `?workflow` 미리 선택, 없으면 빈 선택(필수). 수정: `AgentDetail.workflow`; 워크플로우 밖 에이전트면 `(없음)` 옵션 허용 (FR-011-AC3) | 워크플로우 0 → 만들기 불가 안내 `먼저 워크플로우를 추가하세요` | - | `fields.workflow` `필수` | 활성 | 바꾸면 역할 옵션 재계산 |
| `역할` 라디오 `팀장` `팀원` + 힌트 `팀장은 워크플로우당 1명 · 층 첫 자리 · 이미 있으면 비활성` | 선택 워크플로우 `lead`: 있고 그게 자기 자신이 아니면 `팀장` 비활성 + 이유 `이미 팀장이 있습니다 (<lead>)` (FR-010-AC4) | 워크플로우 `(없음)`이면 라디오 비활성 | - | 409 `LEAD_EXISTS` → 라디오 옆 `message` | 활성 | - |
| `설명 (description)` 필수 (placeholder `[언제 이 에이전트에게 일을 맡기는지]`) | `AgentDetail.description` | - | - | `fields.description` `필수` | 활성 | - |
| `사용 도구 (tools)` 라디오 `전체 상속` / `직접 선택` + 체크박스 `Read Grep Glob Edit Write Bash WebFetch WebSearch Agent` + `[기타]` 입력(쉼표 구분) | `AgentDetail.tools`: null → 전체 상속, 배열 → 직접 선택(목록에 없는 값은 기타에 쉼표로) (FR-010-AC2). 만들기 기본값: 선택 없음(명시 선택 필요) | - | - | 라디오 미선택 → `저장` 비활성 `도구 방식을 고르세요`; 직접 선택 0개 → `fields.tools` `직접 선택은 1개 이상` | 활성 | - |
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
| 제목 `<name>를 <워크플로우>에서 제거할까요?` (워크플로우 밖이면 `<name>를 제거할까요?`) + 목록 `정의 파일이 .jaystudio/trash/로 이동합니다 (소프트 삭제, 복구 가능).` `팀장을 제거하면 <워크플로우> 층에 팀장 없음이 표시됩니다.`(팀장일 때만) | `registry.agents[name]`.`workflow`, `role` (FR-012-AC3·AC5) | - | - | - | 뒤 배너 | - |
| 입력 `확인을 위해 이름 입력` (placeholder = name) | 로컬 | - | - | - | 활성 | - |
| 버튼 `취소` `제거 (이름 일치 시 활성)`(danger) | `DELETE /api/agents/{name}` (FR-012-AC1) | 입력 ≠ name → 비활성 | `제거 중…` | 409 `AGENT_BUSY` → `작업 중에는 제거할 수 없습니다` (FR-012-E2) / 500 `IO_FAILED` → `message`, 파일 변경 없음 (FR-012-E1) / 404 → `이미 없는 에이전트입니다` | 활성 | 성공 → 팝업 모두 닫힘, 03이었으면 `/workflows/<이름>` 유지(패널은 새 첫 자리 선택), 06이었으면 `/workflows` |

---

## SCR-07 설정 (`/settings`, 읽기 전용)
- FR: FR-014, FR-001-AC4·AC5·E1·E2, FR-013-AC5·AC9·AC10·E1~E3, FR-003-AC6
- 기준: 와이어프레임 p.4 + 토큰·규칙. "Claude 열기" 설명문은 확정 결정에 맞춰 `02의 Claude 열기 · 기본 세션과 03의 팀장 호출 · 터미널 열기를 누르면 맥북 터미널이 열리고 프로젝트 폴더에서 claude가 실행됩니다.`로 쓴다(D-F4).

| 요소 | 데이터 출처 | 빈 | 로딩 | 에러 | 연결 끊김 | 클릭 시 동작·이동 |
|---|---|---|---|---|---|---|
| 상단바 `설정`, `127.0.0.1 전용` | 정적 | - | - | - | 유지 | - |
| 제목 `설정` | 정적 | - | - | - | - | - |
| 카드 1 `프로젝트 폴더` 배지 `읽기 전용` | `GET /api/settings` (진입 시) + SSE `registry`로 수치 갱신 | - | 값 스켈레톤 | `agentsDirMissing` → 카드 본문을 04-5로 대체 (FR-001-E1) | 유지 | - |
| 행 `마운트 폴더` `<hostPath>`(mono) | `settings.hostPath` (FR-001-AC5, FR-014-AC4). 입력 없음 | - | 스켈레톤 | - | 유지 | - |
| 행 `에이전트` `.claude/agents/ · 정의 [N]개` | `settings.agentCount` | - | 스켈레톤 | - | 유지 | - |
| 행 `스킬` `.claude/skills/ · [N]개` | `settings.skillCount` | - | 스켈레톤 | - | 유지 | - |
| 행 `쓰기 권한` `✓ agents 추가·수정·삭제 가능` / `✗ 쓰기 권한 없음`(danger) | `settings.writable` (FR-001-E2) | - | 스켈레톤 | - | 유지 | - |
| 행 `형식 오류` `! 읽지 못한 정의 파일 [N] 개`(N>0이면 danger) / `없음` | `settings.formatErrorCount` | - | 스켈레톤 | - | 유지 | - |
| 각주 `폴더는 컨테이너 실행 시 마운트로 고정 · 웹에서 변경 불가` + 버튼 `다시 읽기`(secondary) | `POST /api/registry/rescan` (FR-001-AC4) | - | `다시 읽는 중…` | 실패 → `다시 읽지 못했습니다 · <message>` | 활성 | rescan → 값 갱신 |
| 카드 2 `Claude 열기` 설명문(위 D-F4 문구) | 정적 | - | - | - | - | - |
| 행 `터미널 앱` `macOS 기본 터미널` | `settings.terminalApp` | - | - | - | - | - |
| 행 `기본 세션` `cd "<hostPath>" && claude`(mono) | `settings.defaultSessionCommand` (FR-013-AC1·AC5) | - | 스켈레톤 | - | 유지 | - |
| 행 `팀장으로 열기` `cd "<hostPath>" && claude --agent [팀장 name]` + 힌트 `도우미가 받는 값은 팀장 name 하나 · 소문자·숫자·하이픈만 허용` | `settings.leadSessionCommandTemplate` (FR-013-AC2·AC5) | - | 스켈레톤 | - | 유지 | - |
| 행 `열기 도우미` `● 설치됨 · 응답 확인 [hh:mm:ss]` / `● 미설치 · helper/install.sh로 설치` | 진입 시와 버튼 누를 때 도우미 `GET /health`(2초 타임아웃) (FR-013-AC10). `GET /api/helper/token`이 null이면 `미설치 · 토큰 파일 없음` | - | `확인 중…` | 무응답 → 미설치 표시 | 유지 | - |
| 버튼 `테스트로 열기 (도우미 설치 후)` `명령 복사` | 도우미 `POST /open {target:'default'}` / 클립보드 = `defaultSessionCommand` (FR-014-AC5) | - | - | 도우미 미응답 → `테스트로 열기` 비활성 `도우미 미설치` (FR-013-AC10). 403 → `도우미 인증 실패 · 도우미를 다시 설치하세요`(FR-013-E2) | 활성 | 테스트로 열기 → 도우미 호출 / 명령 복사 → `복사됨` |
| 카드 3 `수집` 행 `수집 주소` `http://127.0.0.1:[포트]/hooks/events`(mono) | `settings.collectUrl` | - | 스켈레톤 | - | 유지 | - |
| 행 `hook 설정` `.claude/settings.json · 설정됨`(running) / `없음`(danger) + 버튼 `설정 예시 복사` | `settings.hookConfigured` (FR-014-AC3), 클립보드 = `settings.hookSettingsExample` (FR-014-AC2) | - | 스켈레톤 | - | 유지 | `설정 예시 복사` → `복사됨` |
| 각주 `allowedHttpHookUrls가 설정되어 있으면 수집 주소를 허용 목록에 추가하세요` | `settings.allowedHttpHookUrlsNote` | - | - | - | - | - |
| 행 `워크플로우 구성` `.jaystudio/teams/*.json · 팀장·팀원 목록` | `settings.teamsPath` | - | - | - | - | - |
| 행 `휴지통` `.jaystudio/trash/ · 제거한 에이전트 보관` | `settings.trashPath` | - | - | - | - | - |
| 행 `이벤트 보존` `30일` | `settings.retentionDays` | - | - | - | - | - |

- 비활성 요소: 마운트 경로 변경 입력(Out of Scope), 팀장 명령 복사(03에서만, FR-014-AC5), 휴지통 복구·비우기(Out of Scope), 설정 파일 자동 수정(FR-014-AC1).

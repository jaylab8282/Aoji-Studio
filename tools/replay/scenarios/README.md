# 시나리오 대응표

JSONL 파일은 JSON 표준상 줄 안에 주석을 넣을 수 없다. 이 문서가 각 줄이 어떤 요구 항목을
검증하려는 것인지 설명하는 대응표다. 줄 번호는 1부터 시작하고, 빈 줄은 없다.

## states.jsonl — FR-004-AC2 전이표 + 관련 케이스

| 줄 | 이벤트 | 대상 | 검증하려는 항목 |
|---|---|---|---|
| 1 | SessionStart | dev-lead | AC2 표 1행: SessionStart → 대기 |
| 2 | PreToolUse (tool≠AskUserQuestion) | dev-lead | AC2 표 4행: PreToolUse(그 외 도구) → 작업 중 |
| 3 | PostToolUse | dev-lead | AC2 표 9행(1/3): PostToolUse → 작업 중 |
| 4 | PostToolUseFailure | dev-lead | AC2 표 9행(2/3): PostToolUseFailure → 작업 중 |
| 5 | PermissionDenied | dev-lead | AC2 표 9행(3/3): PermissionDenied → 작업 중 |
| 6 | PreToolUse (tool=AskUserQuestion) | dev-lead | AC2 표 5행: PreToolUse(AskUserQuestion) → 권한·입력 대기 |
| 7 | PermissionRequest | dev-lead | AC2 표 6행: PermissionRequest → 권한·입력 대기 |
| 8 | Notification(permission_prompt) | dev-lead | AC2 표 7행: Notification(permission_prompt) → 권한·입력 대기 |
| 9 | Notification(그 외 종류) | dev-lead | AC2 표 8행: Notification(그 외) → 상태 변경 없음 |
| 10 | Stop | dev-lead | AC2 표 10행: Stop → 대기(세션 유지) |
| 11 | SubagentStart(agent_type=dev-member, 정의 있음) | dev-lead의 세션 | AC2 표 3행: SubagentStart → 서브에이전트 세션 작업 중 + "정의 있는 서브에이전트"(부모=dev-lead) |
| 12 | SubagentStart(agent_type=Explore, 정의 없음) | dev-lead의 세션 | "정의 없는 서브에이전트"(부모=dev-lead인 named agent) |
| 13 | SubagentStop | sub-defined-1 | AC2 표 11행: SubagentStop → 제거 |
| 14 | SessionEnd | dev-lead | AC2 표 12행: SessionEnd → 제거(같은 session_id의 서브 레코드도 함께 제거 — sub-undefined-1 포함) |
| 15 | SubagentStart | sub-ac3-a (agent_type=dev-member) | FR-004-AC3 준비: 세션 A = 작업 중 |
| 16 | SubagentStart | sub-ac3-b (agent_type=dev-member) | FR-004-AC3 준비: 세션 B = 작업 중 |
| 17 | PreToolUse(AskUserQuestion) | sub-ac3-b | FR-004-AC3: 세션 A 작업 중 + 세션 B 권한·입력 대기 → dev-member 집계 = 권한·입력 대기(최우선) |
| 18 | SubagentStart | sub-ac3-lead-a (agent_type=ops-lead) | FR-004-AC3 준비: 세션 A = 작업 중 |
| 19 | SubagentStart | sub-ac3-lead-b (agent_type=ops-lead) | FR-004-AC3 준비: 세션 B = 작업 중 |
| 20 | Stop | sub-ac3-lead-b | FR-004-AC3: 세션 A 작업 중 + 세션 B 대기 → ops-lead 집계 = 작업 중(대기보다 우선) |
| 21 | SessionStart(agent_type 없음) | sess-lobby-a | 로비 2세션(1/2): 로비 항목 생성, 대기 — 누적 재생 시 `[세션 5]`(아래 "로비 번호" 참고) |
| 22 | UserPromptSubmit | sess-lobby-a | 로비 2세션(1/2): `[세션 5] · 작업 중` |
| 23 | SessionStart(agent_type 없음) | sess-lobby-b | 로비 2세션(2/2): 로비 항목 생성, 대기 — 누적 재생 시 `[세션 6]` |
| 24 | PermissionRequest | sess-lobby-b | 로비 2세션(2/2): `[세션 6] · 권한·입력 대기`(02 로비 표기는 짧은 `입력 대기`) |
| 25 | SubagentStart(agent_type=UnknownAgent, 정의 없음) | sess-lobby-a | "정의 없는 서브에이전트"(부모가 로비 세션 → parentLabel `[세션 5]`) |
| 26 | SessionStart | ops-member | 마스킹 시연 준비 |
| 27 | PreToolUse Bash | ops-member | FR-015 마스킹 대상: `tool_input.command`에 `TOKEN=`·`Bearer sk-...` 포함 → 저장·요약 모두 `••••••••`로 가려야 한다 |
| 28 | PreToolUse (SessionStart 없이 바로) | freelancer(워크플로우 밖) | FR-004-E1 순서 어긋남: 세션을 그 이벤트로 새로 만들어 작업 중 처리 + FR-004-AC7 워크플로우 밖 에이전트 → 로비에 `freelancer · 상태` 표시 |

- **로비 번호(`[세션 N]`)는 재생 범위에 따라 달라진다 (D-053)** — 번호는 로비 세션이 만들어진
  순서대로 붙는다. 15~20줄의 `SubagentStart`는 `SessionStart` 없이 오므로 부모 세션 4개
  (`sess-ac3-member-a`·`sess-ac3-member-b`·`sess-ac3-lead-a`·`sess-ac3-lead-b`)가 FR-004-E1로 새로
  만들어지고, 그 부모 세션에는 `agent_type`이 없어(줄의 `agent_type`은 **서브에이전트** 것이다)
  FR-003-AC5에 따라 **로비 1~4**를 차지한다. 그래서 1~28줄을 순서대로 누적 재생하면 21줄은
  `[세션 5]`, 23줄은 `[세션 6]`이고 25줄 정의 없는 서브의 `parentLabel`도 `[세션 5]`다.
  21·23줄만 단독으로 재생하면 `[세션 1]`·`[세션 2]`다. **제품 동작이 옳고 이전 표 표기가 부정확했다**
  (2026-09-28 정정). 누적 재생 기준값은 `tools/e2e/tests/e2e-04.spec.ts`가 `[세션 1]`~`[세션 6]`으로
  단언하며 통과한다.
- 컨테이너 재시작(AC2 표 13행, "모든 세션 제거 → 모두 대기")은 hook 이벤트가 아니라 서버 재기동
  동작이라 재생 시나리오로 표현할 수 없다. `SessionStateMachineTest`(T-006, 단위 테스트)가
  "재시작 → 빈 상태"로 이미 검증한다.
- 이름은 `project-configured` fixture(`dev-lead`, `dev-member`, `ops-lead`, `ops-member`,
  `freelancer`)와 맞춰서 만들었다. `freelancer`는 어떤 구성 파일에도 속하지 않는 "워크플로우 밖
  에이전트"다.

## showcase.jsonl — E2E-13·E2E-16 화면 대조용 (`project-showcase`와 짝, ADR-75 7)

`docs/ui/screens/01-home.html`·`02-workflows.html`·`03-workflow-detail.html`(확정 시안)과 **같은 구성의 상태**를
만든다: 워크플로우 `개발부서` 8명·`디자인부서` 4명·`영상제작부서` 0명(팀장 없음)·`투자부서` 4명, 워크플로우 밖 5명
(`code-explainer`·`docs-writer`·`release-manager`·`test-runner`·`video-editor`), 에이전트 21·스킬 12.
재생 후 집계는 작업 중 7 · 권한·입력 대기 1 · 대기 13이다. 시안의 이벤트 시각·행 구성은 목업 값이라 맞추지 않는다.
**30줄**이며 줄 수는 `e2e-13.spec.ts`가 단언한다(01 이벤트 표 행 수 = min(30, 50) = 30).

| 줄 | 이벤트 | 대상 | 화면 대응 |
|---|---|---|---|
| 1~2 | SessionStart → UserPromptSubmit | sess-lobby-1 | 02 로비 `[세션 1] · 작업 중` |
| 3 | SessionStart | sess-lobby-2 | 02 로비 `[세션 2] · 대기` |
| 4~5 | SessionStart → PreToolUse Write | docs-writer(워크플로우 밖) | 02 로비 `docs-writer · 작업 중`, 01 실시간 이벤트 `-` 워크플로우 |
| 6~7 | SessionStart → Stop | invest-analyst | 투자부서 `모두 대기` + 마지막 활동(01 대표 3번째 카드) |
| 8~9 | SessionStart → Stop | design-motion | 디자인부서 대기 책상 |
| 10~13 | SessionStart → PreToolUse Agent → SubagentStart(design-ui) → PreToolUse Write(design-ui) | design-lead · design-ui | 디자인부서 `실행 중 2명`, design-ui `작업 중 · 부모 design-lead` |
| 14~15 | SessionStart → Stop | web-reviewer | 개발부서 대기 책상. **배치 8 순서 6·8·10·11이 `web-reviewer`의 실제 `idle`을 전제로 한다** |
| 16 | SessionStart | web-db-designer | 개발부서 대기 책상 (web-architect는 이벤트 없음 = 대기) |
| 17~18 | SessionStart → PreToolUse Bash(`export API_KEY=…`) | web-tester | 03 `Bash`·`작업 중`, 01 마스킹 시연 `export API_KEY=•••••••• && npm test -- --run` |
| 19~21 | SessionStart → PreToolUse Read → PreToolUse Agent | web-develop-tech-lead | 03 팀장 `작업 중`, 말풍선 `Agent` |
| 22~23 | SubagentStart(web-backend-dev) → PreToolUse Edit | 팀장 세션의 서브 | 03 `타이핑 · Edit` · `작업 중 · 부모 web-develop-tech-lead` |
| 24~25 | SubagentStart(web-frontend-dev) → PreToolUse Read | 〃 | 03 `읽기 · Read` · 부모 접미 |
| 26~27 | SubagentStart(web-security-reviewer) → PermissionRequest Bash(`Authorization:…`) | 〃 | 03 `권한 요청`(주황) · `권한 대기 · 부모 …`, 개발부서 칩 `권한 대기 1명` |
| 28~29 | SubagentStart(Explore, 정의 없음) → PreToolUse Grep | 〃 | 03 작은 캐릭터 `Explore`(`읽기 · Grep`) · 부모 접미 |
| 30 | PreToolUse Agent(description=Explore) | web-develop-tech-lead | 03 패널 `현재 도구` `Agent · Explore` |

- 팀장 `web-develop-tech-lead`의 서브에이전트(`childCount`)는 4(backend·frontend·security·Explore)다.
- 01 대표 워크플로우 3장은 FR-005-AC3 규칙(활성 우선 → 최근 이벤트 내림차순)으로 `개발부서`(마지막 이벤트가 가장 뒤)·
  `디자인부서`·`투자부서`다. `영상제작부서`는 이벤트가 없어 4번째라 01에 나오지 않는다.
- 로비 번호: 로비 세션은 1·2줄과 3줄뿐이라 `[세션 1]`·`[세션 2]`다(서브에이전트의 부모 세션은 모두 `SessionStart`가 있다).

## span1-status-clamp.jsonl — 02 보통 층 상태 줄 clamp 실측용 (`project-showcase`와 짝, ADR-50 B)

`showcase.jsonl`이 만드는 상태에는 `디자인부서`의 이웃한 두 책상(`design-motion`·`design-reviewer`)에 부모 접미
(`· 부모 <라벨>`)가 붙은 경우가 없다. 이 시나리오는 그 상태를 **실제로** 만들어 `e2e-13`(배치 8 순서 14)이 상태 줄
clamp 결과를 실측으로 단언하게 한다. `showcase.jsonl`의 `디자인부서` 팀장 세션(`sess-design-lead`)을 그대로 부모로 쓴다.

| 줄 | 이벤트 | 대상 | 화면 대응 |
|---|---|---|---|
| 1~2 | SubagentStart(design-motion · design-reviewer) | sess-design-lead (부모 = design-lead, 11자) | 두 책상 → `작업 중 · 부모 design-lead`. 팀장 다음 이웃한 두 열 |
| 3~4 | SubagentStop | 위 두 서브 레코드 | 두 책상 `대기` 복귀 — 13자 라벨 측정 전에 비운다 |
| 5 | SessionStart | sess-span1-long (agent_type=des-parentxyz) | 부모 = **13자 이름** 에이전트. `e2e-13`이 같은 이름의 정의 파일을 `디자인부서`에 임시로 만들고 측정 후 지운다 |
| 6~7 | SubagentStart(design-motion · design-reviewer) | sess-span1-long | 두 책상 → `작업 중 · 부모 des-parentxyz`(13자). 5명이 되어 열 순서는 `design-lead · des-parentxyz · design-motion · design-reviewer` + 다음 줄 `design-ui`이므로(보통 층 4열, 1920 폭) 두 책상은 여전히 첫 줄 이웃 칸이다 |

- 이 시나리오는 `e2e-13`이 다른 캡처·단언을 모두 끝낸 **맨 끝**(live 상태를 바꾼다)에 1~2줄 → 3~7줄 순서로 재생한다.
- `des-parentxyz`(13자)는 FR-006-AC4 경계(12자 초과)를 넘는 이름이고, 부모 접미는 잘리지 않으므로 상태 줄이 가장 길어지는 경우다.
  fixture 원본(`tools/fixtures/project-showcase`)은 수정하지 않는다.

## fixture의 `.claude/settings.json`은 E2E에서 그대로 쓰면 `hook 설정 안 됨`이다 (D-052)

`tools/fixtures/project-configured`·`project-showcase`의 `.claude/settings.json`은 hook url을
`http://127.0.0.1:4180/hooks/events`(운영 공개 포트)로, 수집 토큰을 placeholder
(`fixture0000…aa`)로 **하드코딩**한다. E2E 컨테이너는 다른 공개 포트(`127.0.0.1:4185`)와 매 실행
새로 만드는 수집 토큰을 쓰므로, 이 파일을 그대로 두면 `hookConfigured=false` → 사이드 탭
`hook 설정 안 됨` · 03에 04-4 배너가 뜬다. 값이 호스트 포트·토큰에 의존하는 성질이라 fixture 파일에
**어떤 값을 적어도 맞출 수 없다**(그래서 fixture는 이대로 둔다).

- **E2E는 마운트된 임시 사본의 `settings.json`을 실제 `collectUrl`·수집 토큰으로 다시 쓴 뒤
  `hook 설정됨`을 검증한다.** `tools/e2e/tests/e2e-13.spec.ts`의 `hookSettingsJson()`이
  `.e2e-state.json`의 `baseUrl`·`collectToken`으로 12종 hook 설정을 만들어 `beforeAll`에서 쓰고
  `afterAll`에서 원래 내용으로 되돌린다. E2E-11은 07 `설정 예시 복사`가 준 JSON을 같은 파일에 써서
  `hook 설정됨` 전환을 확인한다.
- 원본 `tools/fixtures/**`는 어느 spec도 수정하지 않는다(쓰기는 항상 `readE2eState().fixtureDir`
  아래 임시 사본에만 한다 — `tools/e2e/tests/ui-helpers.ts`).
- 재생(이 폴더의 시나리오)은 `settings.json`과 무관하다 — 재생 도구는 수집 주소·토큰을 인자로 받는다.
  `hookConfigured`는 **화면 표시**(사이드 탭·04-4 배너)에만 영향을 준다.

## usage.jsonl — 스킬·MCP 사용 집계용 (`project-usage` + `claude-home-basic`과 짝, T-R4-01, ADR-80·90)

38줄. 실제 hook 입력 형식(`session_id`·`cwd`·`hook_event_name`·`agent_type`·`tool_name`·`tool_input`·`prompt`)이다. 기대 횟수는
`tools/fixtures/project-usage/expected.json`(`skills`·`mcp`)에 있고 `tools/replay/test/fixtures-v120.test.mjs`가 이 파일에서 따로 센 값과 대조한다.
E2E-19가 스스로 재생한다(`UserPromptSubmit`의 `prompt`에는 표지 `AOJI-MARKER-PROMPT-c4d8`이 들어 있고 저장·표시되면 안 된다).

| 줄 | 이벤트 | 대상 | 검증하려는 항목 |
|---|---|---|---|
| 1~2 | SessionStart | `proj-lead` ×2 | 미리 넣음: `design-review` +2, `release-notes` +2 |
| 3~5 | SubagentStart | `proj-dev` ×3 | 미리 넣음: `design-review` +3 |
| 6 | SubagentStart | `proj-writer` | 미리 넣음: `release-notes` +1, `imported-lint` +1 |
| 7 | SessionStart | (agent_type 없음) | 기본 세션, `skills:` 없음 |
| 8 | SessionStart | session_id = 대화 기록 세션 S2 (agent_type 없음) | 비용 10의 S2 세션 에이전트 `기본 세션` 근거(ADR-81 5-②). 재생 전에는 `미확인` |
| 9 | SessionStart | `proj-qa` | `skills:` 없는 에이전트 |
| 10 | SubagentStart | `Explore` | 정의 없는 서브에이전트 — 어느 집계에도 영향 없음 |
| 11~14 | PreToolUse Skill `design-review` | 기본 세션 1 · `proj-dev` 2 · `proj-qa` 1 | 호출 4. `proj-qa`는 정의상 사용 에이전트가 아니다 |
| 15 | PostToolUse Skill `design-review` | `proj-dev` | 세지 않음(PreToolUse만) |
| 16 | PreToolUse Skill `release-notes` | 기본 세션 | 호출 1 |
| 17 | PreToolUse Skill `imported-lint` | `proj-writer` | 호출 1 |
| 18~19 | PreToolUse Skill `ghost-skill` ×2 | 기본 세션 | 지금 없는 스킬 → 행·분모 제외(FR-019-AC6) |
| 20 | UserPromptSubmit `/design-review <표지> …` | 기본 세션 | 직접 호출: `design-review` +1 (본문은 남지 않음) |
| 21 | UserPromptSubmit `/release-notes` | 기본 세션 | 직접 호출: 이름 뒤가 끝 |
| 22 | UserPromptSubmit `/manual-only …` | 기본 세션 | 사용자 전용 스킬 직접 호출 |
| 23 | UserPromptSubmit `/bad-yaml …` | 기본 세션 | 형식 오류 스킬도 폴더 이름으로 센다 |
| 24 | UserPromptSubmit `/design-review-extra foo` | 기본 세션 | 이름이 이어짐 → 세지 않음 |
| 25 | UserPromptSubmit `/x foo` | 기본 세션 | 없는 스킬 → 세지 않음 |
| 26 | UserPromptSubmit `/ghost-skill …` | 기본 세션 | 지금 없는 스킬 → 세지 않음 |
| 27 | UserPromptSubmit `<표지> …` (슬래시 없음) | 기본 세션 | 요약 `-`, 본문 저장 0 |
| 28~30 | PreToolUse `mcp__github__create_issue` ×3 | `proj-dev` | MCP 실제 사용 |
| 31 | PreToolUse `mcp__github__get_issue` | 기본 세션 | |
| 32~33 | PreToolUse `mcp__docs-server__search` ×2 | `proj-writer` | |
| 34 | PreToolUse `mcp__plugin_demo-tools_demo-helper__run` | 기본 세션 | 플러그인 서버 호출 이름 `plugin_<플러그인>_<서버>` 합치기(ADR-85 2) |
| 35 | PreToolUse `mcp__claude_ai_drive__list_files` | `proj-lead` | 정의 파일에 없는 서버 → `호출 기록만` |
| 36 | PreToolUse `mcp__qa-browser__open` | `proj-qa` | 에이전트 정의 서버 |
| 37 | PostToolUse `mcp__qa-browser__open` | `proj-qa` | 세지 않음 |
| 38 | PreToolUse Bash | 기본 세션 | MCP 아님 |

- 기대 결과(기간 전체, hook 설정됨): `design-review` 호출 4·직접 호출 1·미리 넣음 5 = 10, `release-notes` 1·1·3 = 5, `imported-lint` 1·0·1 = 2, `manual-only` 0·1·0 = 1(`proj-ops` `정의됨 · 사용 0`), `bad-yaml` 0·1·0 = 1. 합 19.
- 세션 id는 `sess-u-<에이전트>-<번호>`(S2 줄 제외)이다. 이벤트 `cwd`는 `/workspace`.
- hook 미설정(FR-019-E1·FR-024-E1)은 같은 파일을 재생하지 않고 서버 응답 규칙(`호출`·`직접 호출` 0, MCP `actualAgents` null)으로 확인한다.

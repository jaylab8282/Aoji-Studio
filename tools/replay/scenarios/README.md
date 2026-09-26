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
| 21 | SessionStart(agent_type 없음) | sess-lobby-a | 로비 2세션(1/2): "[세션 1]" 생성, 대기 |
| 22 | UserPromptSubmit | sess-lobby-a | 로비 2세션(1/2): "[세션 1] · 작업 중" |
| 23 | SessionStart(agent_type 없음) | sess-lobby-b | 로비 2세션(2/2): "[세션 2]" 생성, 대기 |
| 24 | PermissionRequest | sess-lobby-b | 로비 2세션(2/2): "[세션 2] · 권한·입력 대기" |
| 25 | SubagentStart(agent_type=UnknownAgent, 정의 없음) | sess-lobby-a | "정의 없는 서브에이전트"(부모가 로비 세션 → parentLabel "[세션 1]") |
| 26 | SessionStart | ops-member | 마스킹 시연 준비 |
| 27 | PreToolUse Bash | ops-member | FR-015 마스킹 대상: `tool_input.command`에 `TOKEN=`·`Bearer sk-...` 포함 → 저장·요약 모두 `••••••••`로 가려야 한다 |
| 28 | PreToolUse (SessionStart 없이 바로) | freelancer(워크플로우 밖) | FR-004-E1 순서 어긋남: 세션을 그 이벤트로 새로 만들어 작업 중 처리 + FR-004-AC7 워크플로우 밖 에이전트 → 로비에 `freelancer · 상태` 표시 |

- 컨테이너 재시작(AC2 표 13행, "모든 세션 제거 → 모두 대기")은 hook 이벤트가 아니라 서버 재기동
  동작이라 재생 시나리오로 표현할 수 없다. `SessionStateMachineTest`(T-006, 단위 테스트)가
  "재시작 → 빈 상태"로 이미 검증한다.
- 이름은 `project-configured` fixture(`dev-lead`, `dev-member`, `ops-lead`, `ops-member`,
  `freelancer`)와 맞춰서 만들었다. `freelancer`는 어떤 구성 파일에도 속하지 않는 "워크플로우 밖
  에이전트"다.

## showcase.jsonl — E2E-13 스크린샷용 (`project-showcase`와 짝)

`docs/ui/screens/01-home.png`·`02-workflows.png`·`03-workflow-detail.png`(확정 기준 이미지,
`[N]`·`[...]` 표기는 와이어프레임 자리표시일 뿐 실제 값이 아니다)와 **유사한 상태 구성**을
만든다. 정확히 같은 인원 수·이름을 재현하는 것이 아니라 각 화면 요소(팀장 있는 큰 팀·팀장 없는
팀·모두 대기인 팀·로비 2세션·마스킹된 이벤트·정의 있는/없는 서브에이전트)가 화면에 나타나게 하는
것이 목적이다.

| 줄 | 이벤트 | 대상 | 화면 대응 |
|---|---|---|---|
| 1~2 | SessionStart → UserPromptSubmit | sess-lobby-1 | 02 로비 `[세션 1] · 작업 중` |
| 3~4 | SessionStart → PermissionRequest | sess-lobby-2 | 02 로비 `[세션 2] · 권한·입력 대기` |
| 5~6 | SessionStart → PreToolUse Edit | dev-lead | 01 실시간 이벤트 `도구 실행 · Edit`, 03 `타이핑 · Edit`(팀장) |
| 7~8 | SessionStart → PreToolUse Read | dev-02 | 03 `읽기 · Read` |
| 9~10 | SessionStart → PreToolUse AskUserQuestion | dev-03 | 03 `권한 요청`(주황) |
| 11 | SessionStart만 | dev-04 | 03 `대기`(회색) |
| 12~13 | SessionStart → PreToolUse Bash(`export TOKEN=...`) | dev-05 | 01 실시간 이벤트 마스킹 시연(`export TOKEN=••••••••`) |
| 14 | SubagentStart(agent_type=dev-07, 정의 있음) | dev-lead의 세션 | 03 "정의 있는 서브에이전트" · 부모 dev-lead |
| 15 | SubagentStart(agent_type=Explore, 정의 없음) | dev-lead의 세션 | 03 작은 캐릭터 "서브에이전트" · 부모 dev-lead |
| 16 | SessionStart만 | dev-06 | dev-team 인원 채움(대기) — dev-08은 이벤트가 전혀 없어 FR-004-AC1(이벤트 없는 에이전트=대기) 시연 |
| 17~18 | SessionStart → PreToolUse Bash | mkt-lead | 02 워크플로우 C "실행 중 N명" |
| 19 | SessionStart만 | mkt-02 | 02 워크플로우 C 대기 인원 |
| 20~21 | SessionStart → PostToolUse | mkt-03 | 02 워크플로우 C 작업 중 인원 |
| 22 | SessionStart만 | ops-01 | 02 워크플로우 D(팀장 없음) 대기 인원. ops-02는 이벤트 없음(대기) |

- `video-lead`·`video-02`~`video-04`(video-team)는 이 시나리오에서 전혀 등장하지 않는다 →
  "모두 대기" 워크플로우(02 워크플로우 B 대응)를 만든다.
- `dev-team`은 `dev-lead` + `dev-02`~`dev-08`(7명)으로 인원 8명 — FR-006-AC2 "인원 7 이상 →
  span 3" 층 카드 시연.

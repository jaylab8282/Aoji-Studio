/**
 * 화면 문구 상수 (conventions.md §2 MUST). ui-spec.md·final 문서의 문구를 글자 그대로 쓴다.
 * 컴포넌트는 이 파일의 상수만 쓰고 문자열을 직접 적지 않는다.
 */
import type { HostOs, ImportRejectedReason, Role, Status, UsagePeriod } from "../api/types";
import type { ModelChoice } from "./derive/agentForm";
import type { FloorSummary } from "./derive/floorSummary";

// 공통 상태 글자 (ui-rules.md 1, conventions.md §7)
export const STATUS_LABEL_TEXT: Record<Status, string> = {
  running: "작업 중",
  waiting: "권한·입력 대기",
  idle: "대기",
};

// 캐릭터 아래 짧은 표기(03·02 책상 등에서 쓰는 축약형, ui-spec SCR-02 로비 표)
export const STATUS_LABEL_TEXT_SHORT: Record<Status, string> = {
  running: "작업 중",
  waiting: "권한 대기",
  idle: "대기",
};

// Sidebar 로고 (ui-spec §공통 로고·파비콘: 심볼 `alt`)
export const APP_WORDMARK = "Aoji Studio";
// Sidebar 태그라인 (가로형만, docs/ui/screens/00-side-tab.html `NAV-1`)
export const APP_TAGLINE = "AI AGENT ORCHESTRATION PLATFORM";
// Sidebar `<aside aria-label>` (docs/ui/screens/00-side-tab.html `NAV`)
export const SIDEBAR_LABEL = "주 메뉴";

// Sidebar 탭 (ui-spec §공통 AppShell)
export const SIDEBAR_TAB_HOME = "홈";
export const SIDEBAR_TAB_WORKFLOWS = "에이전트 워크플로우";
export const SIDEBAR_TAB_SKILLS = "스킬";
export const SIDEBAR_TAB_SETTINGS = "설정";

// TopBar (ui-spec §공통 TopBar)
export const BREADCRUMB_SEPARATOR = "/";
export const LOCAL_ONLY_TEXT = "127.0.0.1 전용";
export const PROJECT_CHIP_PREFIX = "프로젝트 · ";

// CollectorStatus (ui-spec §공통, FR-003-AC6)
export const COLLECTOR_STATUS_TITLE = "수집 상태";
export const HOOK_CONFIGURED_TEXT = "hook 설정됨";
export const HOOK_NOT_CONFIGURED_TEXT = "hook 설정 안 됨";
export const NO_LAST_RECEIVED_TEXT = "마지막 수신 없음";

// 수집 상자 `마지막 수신 <시각>`의 앞 글자(시각은 고정폭 글자로 따로 그린다)와 레일 축약의 둘째 줄
export const COLLECTOR_LAST_RECEIVED_LEAD = "마지막 수신 ";
export const COLLECTOR_RAIL_LABEL = "수집";

export function lastReceivedLabel(hhmmss: string | null): string {
  return hhmmss === null ? NO_LAST_RECEIVED_TEXT : `마지막 수신 ${hhmmss}`;
}

// DisconnectBanner (ui-spec SCR-04-3, FR-016)
// 숫자(N)는 고정폭 글자로 따로 그리므로 앞뒤 글자를 나눠 둔다.
export const DISCONNECT_BANNER_LEAD = "실시간 연결이 끊겼습니다 · ";
export const DISCONNECT_BANNER_TAIL = "초 후 재연결";
export function disconnectBannerMessage(retryInSec: number): string {
  return `${DISCONNECT_BANNER_LEAD}${retryInSec}${DISCONNECT_BANNER_TAIL}`;
}
export const RECONNECT_NOW_LABEL = "지금 재연결";
export const NO_DATA_YET_TEXT = "아직 받은 데이터가 없습니다";
export const LAST_UPDATED_LEAD = "마지막 갱신 ";
export const LAST_UPDATED_TAIL = " 기준 화면을 유지합니다";
export function lastUpdatedLabel(hhmmss: string): string {
  return `${LAST_UPDATED_LEAD}${hhmmss}${LAST_UPDATED_TAIL}`;
}

// 워크플로우 칩 (lib/derive/workflowChip.ts에서 조립하는 문구 그대로 보관)
export const WORKFLOW_CHIP_ALL_IDLE_TEXT = "모두 대기";

// 알 수 없는 오류 공통 문구 (conventions.md §4 MUST). 네트워크 예외·형식이 깨진 응답처럼
// 서버가 사용자용 `message`를 주지 못한 모든 경우에 이 문구 하나만 쓴다(api/client.ts가 정규화).
export const UNKNOWN_ERROR_MESSAGE = "서버에 연결할 수 없습니다 · 다시 시도하세요";

// CopyButton (ui-spec §공통). 라벨은 쓰는 화면이 정하고(`명령 복사`·`설정 예시 복사`),
// 복사 성공 표시 문구만 공용이다.
export const COPY_BUTTON_COPIED_LABEL = "복사됨";
/** `명령 복사`. 07 카드 2와 `HelperMissingDialog`이 같은 라벨을 쓴다(ui-spec §공통, FR-014-AC5). */
export const COPY_COMMAND_LABEL = "명령 복사";

// ── 열기 도우미 (FR-013, ui-spec §공통 `HelperMissingDialog` · SCR-02 · SCR-03 · SCR-07) ─────
/** 도우미가 없거나 2초 안에 응답하지 않을 때 뜨는 팝업(FR-013-AC9·E1). */
export const HELPER_MISSING_DIALOG_TITLE = "열기 도우미가 응답하지 않습니다";
/** 실행 환경별 설치 스크립트(ADR-91 — wsl 문장). macos `helper/install.sh` / wsl `helper/windows/install.ps1`. */
export const HELPER_INSTALL_SCRIPT: Record<HostOs, string> = {
  macos: "helper/install.sh",
  wsl: "helper/windows/install.ps1",
};
export function helperMissingDialogBody(hostOs: HostOs): string {
  return `${HELPER_INSTALL_SCRIPT[hostOs]}로 설치한 뒤 다시 시도하세요`;
}
/** 도우미가 403으로 거부했을 때 버튼 옆에 붙는 확정 문구(FR-013-E2). */
export const HELPER_AUTH_FAILED_TEXT = "도우미 인증 실패 · 도우미를 다시 설치하세요";
/** 버튼을 누른 시점에 `registry.agents`에 팀장이 없을 때(FR-013-E4). 도우미를 호출하지 않는다. */
export const LEAD_GONE_TEXT = "팀장이 없습니다";
/**
 * 03 `팀장 호출 · 터미널 열기`가 표시·복사하는 명령(FR-013-AC2, ui-spec SCR-03) = `config.defaultSessionCommand + " --agent " + 팀장 name`.
 * 실행 환경별 기본 명령(macos `cd "<hostPath>" && claude` / wsl `wsl -d <배포판> --cd <hostPath> -- claude`, ADR-77)에 프론트가 붙인다.
 * 도우미에게는 이 문자열이 아니라 팀장 name만 보낸다(FR-013-AC6).
 */
export function leadSessionCommand(defaultSessionCommand: string, leadName: string): string {
  return `${defaultSessionCommand} --agent ${leadName}`;
}

// AgentsDirMissing (SCR-04-5, 01·02·07 공통)
export const AGENTS_DIR_MISSING_TITLE = "에이전트 폴더를 찾을 수 없습니다";
export function agentsDirMissingPath(hostPath: string): string {
  return `${hostPath}/.claude/agents`;
}
export const AGENTS_DIR_MISSING_BODY =
  "컨테이너를 실행할 때 마운트한 AojiStudio 폴더에 .claude/agents가 없습니다. 폴더를 만든 뒤 다시 읽기를 누르세요. 마운트 경로는 설정에서 확인할 수 있습니다.";
export const RESCAN_BUTTON_LABEL = "다시 읽기";
export const RESCAN_BUTTON_LOADING_LABEL = "다시 읽는 중…";
export const OPEN_SETTINGS_BUTTON_LABEL = "설정 열기";
export function rescanFailedMessage(message: string): string {
  return `다시 읽지 못했습니다 · ${message}`;
}

// EmptyWorkflowCard (SCR-04-7, 01·02 공통)
export const EMPTY_WORKFLOW_TITLE = "아직 워크플로우가 없습니다";
export const EMPTY_WORKFLOW_BODY =
  "워크플로우를 만들면 팀장과 팀원이 층으로 보입니다. 지금은 모든 에이전트가 워크플로우 밖에 있어 로비에만 나타납니다.";
export const ADD_WORKFLOW_BUTTON_LABEL = "워크플로우 추가";
export const WRITABLE_FALSE_REASON = "쓰기 권한 없음";

// NoEventsYet (SCR-04-1, 01)
export const NO_EVENTS_TITLE = "아직 수집된 활동이 없습니다";
export const NO_EVENTS_BODY =
  "AojiStudio 폴더에서 Claude Code를 실행하면 에이전트 활동이 여기에 나타납니다. hook 설정이 없으면 이벤트를 받을 수 없습니다.";
export const NO_EVENTS_COMMAND = ".claude/settings.json — 설정 화면의 hook 설정 예시를 복사해 붙여 넣으세요";
export const NO_EVENTS_FOOTNOTE = "에이전트 수·스킬 수는 이벤트와 상관없이 정의 파일 기준으로 보입니다";
/** 상태 막대 이유 줄(04-1, `04-1-2`). */
export const NO_EVENTS_STATUS_BAR_REASON = "hook 이벤트를 받기 전이라 모든 에이전트를 대기로 표시합니다";

// SCR-01 홈
export const HOME_TITLE = "에이전트 관제";
export const HOME_SUBTITLE = "Claude Code 에이전트 활동을 실시간으로 봅니다. 웹에서 에이전트를 실행하지 않습니다.";
export const OPEN_WORKFLOWS_BUTTON_LABEL = "에이전트 워크플로우 열기";

export const KPI_RUNNING_TITLE = "실행 중 에이전트";
// 보조 줄은 수(고정폭)를 따로 그리므로 앞뒤 글자를 나눠 둔다.
export const KPI_RUNNING_SUB_LEAD = "권한·입력 대기 ";
export const KPI_RUNNING_SUB_TAIL = " · hook 이벤트 기준";
export function kpiRunningSubtitle(waiting: number): string {
  return `${KPI_RUNNING_SUB_LEAD}${waiting}${KPI_RUNNING_SUB_TAIL}`;
}
export const KPI_AGENT_COUNT_TITLE = "에이전트 수";
export const KPI_AGENT_COUNT_PATH = ".claude/agents";
export const KPI_AGENT_COUNT_SUFFIX = " 정의 파일";
export const KPI_SKILL_COUNT_TITLE = "스킬 수";
export const KPI_SKILL_COUNT_PATH = ".claude/skills";
export const KPI_SKILL_COUNT_SUFFIX = " 스킬 폴더";
export const KPI_COLLECTOR_TITLE = "수집 상태";

export const STATUS_BAR_TITLE = "에이전트 상태";
export const STATUS_BAR_SUBTITLE = "hook 이벤트 기준";
export const STATUS_BAR_LEGEND_RUNNING = "작업 중";
export const STATUS_BAR_LEGEND_WAITING = "권한·입력 대기";
export const STATUS_BAR_LEGEND_IDLE = "대기";

export const FEATURED_WORKFLOWS_TITLE = "에이전트 워크플로우";
export const FEATURED_WORKFLOWS_SUBTITLE = "대표 3개 · 실행 중·권한 대기가 있는 워크플로우 → 최근 활동순";
export const WORKFLOW_CARD_VIEW_LINK_LABEL = "워크플로우 보기";
export function workflowCardCountsLabel(agentCount: number, skillCount: number): string {
  return `에이전트 ${agentCount} · 스킬 ${skillCount}`;
}
// 활동 줄(01 대표 카드): 요약·시각은 고정폭으로 따로 그리므로 앞 글자를 나눠 둔다. `title` 속성은 전체 문자열이다.
export const RECENT_ACTIVITY_LEAD = "최근 활동 · ";
export const LAST_ACTIVITY_LEAD = "마지막 활동 · ";
export function recentActivityLabel(title: string, summary: string): string {
  return `${RECENT_ACTIVITY_LEAD}${title} ${summary}`;
}
export function lastActivityLabel(timestamp: string): string {
  return `${LAST_ACTIVITY_LEAD}${timestamp}`;
}
export const NO_ACTIVITY_TEXT = "최근 활동 없음";

export const EVENTS_CARD_TITLE = "실시간 이벤트";
export const EVENTS_CARD_SUBTITLE = "최근 50개 · 최신순";
export const LIVE_CONNECTED_TEXT = "실시간 연결됨";
export const LIVE_DISCONNECTED_TEXT = "연결 끊김";
export const EVENTS_TABLE_COL_TIME = "시각";
export const EVENTS_TABLE_COL_WORKFLOW = "워크플로우";
export const EVENTS_TABLE_COL_AGENT = "에이전트";
export const EVENTS_TABLE_COL_EVENT = "이벤트";
export const EVENTS_TABLE_COL_SUMMARY = "요약";
export const EVENTS_TABLE_FOOTNOTE = "token·key·password 같은 민감 값은 ••••••••로 가립니다";
export const EMPTY_VALUE_TEXT = "-";

// SCR-02 에이전트 워크플로우 층 뷰
export const WORKFLOWS_SUMMARY_PROJECT_LABEL = "AojiStudio";
export const WORKFLOWS_SUMMARY_CLAUDE_LABEL = ".claude";
/** 요약 줄 수 라벨(`02-2`). 값은 호출부가 `<b>`로 감싸 고정폭으로 그리고, 에이전트 폴더 읽기 실패면 `-`다. */
export const WORKFLOWS_SUMMARY_AGENT_LABEL = "에이전트";
export const WORKFLOWS_SUMMARY_SKILL_LABEL = "스킬";
export const WORKFLOWS_SUMMARY_WORKFLOW_LABEL = "워크플로우";
export const SUMMARY_SEPARATOR = "·";
// N = 0이어도 링크는 그대로 활성이다(05-R 빈 상태로 연다, FR-009-AC6·AC7). 폴더 읽기 실패면 N = `-`.
export function outsideAgentsLinkLabel(count: number | string): string {
  return `워크플로우 밖 에이전트 ${count} · 가져오기`;
}
export const CREATE_AGENT_BUTTON_LABEL = "에이전트 만들기";
export const OPEN_DEFAULT_SESSION_BUTTON_LABEL = "Claude 열기 · 기본 세션";

export const SEARCH_PLACEHOLDER = "워크플로우·에이전트 이름 검색";
export function floorSelectAllLabel(count: number): string {
  return `전체 층 (${count}개)`;
}
export const ADD_WORKFLOW_HEADER_BUTTON_LABEL = "워크플로우 추가";
export const SEARCH_NO_RESULTS_TEXT = "검색 결과가 없습니다";

export const LOBBY_TITLE = "로비 · 메인 세션";
export const LOBBY_SUBTITLE = "에이전트 지정 없이 실행 중인 세션 · 워크플로우 밖 에이전트";
export const LOBBY_EMPTY_TEXT = "실행 중인 메인 세션 없음";
// 로비 전용 짧은 표기: waiting은 "입력 대기"(ui-spec SCR-02 로비 표, 02 PNG). 다른 화면의
// STATUS_LABEL_TEXT_SHORT("권한 대기")와 문구가 다르다.
export const LOBBY_STATUS_TEXT: Record<Status, string> = {
  running: "작업 중",
  waiting: "입력 대기",
  idle: "대기",
};

export function floorMemberCountLabel(count: number): string {
  return `${count}명`;
}
export const FLOOR_NO_LEAD_TEXT = "팀장 없음";
/** 층 헤더 요약 조각(FR-006-AC5). 조각마다 상태 사각형이 붙어 호출부가 따로 그린다. */
export function floorRunningLabel(count: number): string {
  return `실행 중 ${count}명`;
}
export function floorWaitingLabel(count: number): string {
  return `권한 대기 ${count}명`;
}
/** 층 헤더 요약 한 줄 문구(FR-006-AC5). 집계는 `lib/derive/floorSummary.ts`가 하고 여기서는 문구만 만든다. */
export function floorSummaryLabel(summary: FloorSummary): string {
  if (summary.allIdle) return WORKFLOW_CHIP_ALL_IDLE_TEXT;
  const parts: string[] = [];
  if (summary.running > 0) parts.push(floorRunningLabel(summary.running));
  if (summary.waiting > 0) parts.push(floorWaitingLabel(summary.waiting));
  return parts.join(" · ");
}
export const FLOOR_NO_LEAD_WARNING = "팀장이 없습니다 · 팀장을 만들거나 가져오세요";
/**
 * FR-006-AC11 확정 문구. 치환값 뒤 조사는 병기 표기로 쓰고 받침을 판정하지 않는다
 * (ADR-39, conventions.md §2 MUST — 조사 보정 함수를 두지 않는다).
 */
export function floorDuplicateWarning(name: string): string {
  return `${name}이(가) 여러 워크플로우에 있습니다 · 구성 파일을 확인하세요`;
}
export const FLOOR_IMPORT_BUTTON_LABEL = "가져오기";
export const FLOOR_CREATE_BUTTON_LABEL = "만들기";
export const FLOOR_DETAIL_BUTTON_LABEL = "상세";
export const FLOOR_DELETE_BUTTON_LABEL = "삭제";
export const LEAD_BADGE_TEXT = "팀장";

/** 04-6 카드 머리·보조 줄(`04-6-1`, FR-002-AC2). */
export function formatErrorListTitle(count: number): string {
  return `읽지 못한 정의·구성 파일 ${count}개`;
}
export const FORMAT_ERROR_NOTE = "층·에이전트 수·가져오기 목록에서 뺐습니다 · 에디터에서 고쳐 저장하면 2초 안에 반영됩니다";

/** 줌 묶음(`02-9`)·미니맵(`02-10`)·캔버스(`02-5`) 접근 이름(FR-006-AC6). 줌 글자 `+`/`−`는 없고 아이콘 버튼이다. */
export const ZOOM_GROUP_LABEL = "줌";
export const ZOOM_IN_LABEL = "확대";
export const ZOOM_OUT_LABEL = "축소";
export const ZOOM_FIT_LABEL = "맞춤";
export const ZOOM_FIT_TITLE = "모든 층이 보이게 맞춤";
export const MINIMAP_LABEL = "미니맵 · 누른 곳으로 이동";
export function canvasLabel(zoom: number): string {
  return `층 캔버스 · 줌 ${zoom}%`;
}

/** 책상·오피스 캐릭터 상태 글자 + 서브에이전트 부모 접미(FR-006-AC1·AC3, FR-007-AC3). */
export function agentStatusWithParent(status: Status, parentLabel: string | null): string {
  const base = STATUS_LABEL_TEXT_SHORT[status];
  return parentLabel ? `${base} · 부모 ${parentLabel}` : base;
}

// SCR-03 워크플로우 상세 · 픽셀 오피스
export const BACK_TO_WORKFLOWS_LABEL = "에이전트 워크플로우로";
export const LEAD_TERMINAL_BUTTON_LABEL = "팀장 호출 · 터미널 열기";
export const WORKFLOW_NOT_FOUND_TEXT = "워크플로우를 찾을 수 없습니다";

/** 03 헤더 `에이전트 N · 스킬 N`: 수는 고정폭으로 따로 그리므로 글자를 나눠 둔다. */
export const HEADER_META_AGENTS = "에이전트 ";
export const HEADER_META_SKILLS = " · 스킬 ";
/** 03 오피스 캐릭터 칸의 `title`·`aria-label`: `<name> · <상태 줄>`. */
export function seatLabel(name: string, statusText: string): string {
  return `${name} · ${statusText}`;
}
export const OFFICE_TITLE = "오피스";
export const OFFICE_SUBTITLE = "에이전트 1명 = 캐릭터 1개 · 팀장 첫 자리, 나머지 이름순";
export const EMPTY_SEAT_TEXT = "빈 자리";

export const OFFICE_LEGEND_TITLE = "동작 매핑";
/** 범례 견본(`03-7`): 말풍선 견본 + 뜻. 말풍선 색 계열은 `Bubble tone`이다. */
export const OFFICE_LEGEND_ITEMS: ReadonlyArray<{ tone: Status; sample: string; meaning: string }> = [
  { tone: "running", sample: "타이핑 · Edit", meaning: "Edit·Write·NotebookEdit" },
  { tone: "running", sample: "읽기 · Read", meaning: "Read·Grep·Glob" },
  { tone: "waiting", sample: "권한 요청", meaning: "권한·입력 대기" },
  { tone: "idle", sample: "대기", meaning: "대기" },
  { tone: "running", sample: "Bash", meaning: "그 밖 도구 = 도구 이름" },
];
export const OFFICE_LEGEND_SUBAGENT = "작은 캐릭터 = 정의 없는 서브에이전트";

/** 말풍선 문구(FR-007-AC2). 조립은 `lib/derive/actionLabel.ts`가 한다. */
export const ACTION_LABEL_PERMISSION = "권한 요청";
export function typingActionLabel(tool: string): string {
  return `타이핑 · ${tool}`;
}
export function readingActionLabel(tool: string): string {
  return `읽기 · ${tool}`;
}

// 04-4 수집 중단 띠 (SCR-04-4, FR-007-E1). 시각은 고정폭으로 따로 그리므로 앞 글자를 나눠 둔다(시각 `없음` 포함).
export const COLLECTOR_DOWN_LEAD = "hook 이벤트 수신 없음 · 마지막 수신 ";
export const COLLECTOR_DOWN_WHY = "Claude Code가 꺼졌거나 hook 설정이 없으면 캐릭터를 모두 대기로 표시합니다";

// 선택 패널 (SCR-03 가로형 오른쪽 열 / 세로형 오피스 아래 2칸)
export const PANEL_TITLE = "선택한 에이전트";
export const PANEL_SUBTITLE = "기본 선택 = 팀장";
export const PANEL_NO_AGENT_TEXT = "선택할 에이전트가 없습니다";
export const PANEL_ROW_STATUS = "상태";
export const PANEL_ROW_CURRENT_TOOL = "현재 도구";
export const PANEL_ROW_SESSION_STARTED = "세션 시작";
export const PANEL_ROW_CHILD_COUNT = "서브에이전트";
export const PANEL_ROW_CWD = "작업 폴더";
/** 패널 `현재 도구`: `<도구> · <대상 요약>`, 없으면 `-` (FR-007-AC5). */
export function currentToolLabel(toolName: string | null, target: string | null): string {
  return toolName === null ? EMPTY_VALUE_TEXT : `${toolName} · ${target ?? ""}`.trimEnd();
}
export const PANEL_RECENT_EVENTS_TITLE = "최근 이벤트";
export const PANEL_RECENT_EVENTS_NOTE = "최신 10개";
export const PANEL_RECENT_EVENTS_EMPTY = "최근 이벤트 없음";
export const PANEL_RECENT_EVENTS_ERROR = "최근 이벤트를 불러오지 못했습니다";
export const RETRY_BUTTON_LABEL = "다시 시도";
export const EDIT_AGENT_BUTTON_LABEL = "정의 수정";
export const REMOVE_AGENT_BUTTON_LABEL = "제거";
export const EDIT_AGENT_BUSY_REASON = "작업 중에는 수정할 수 없습니다";
export const REMOVE_AGENT_BUSY_REASON = "작업 중에는 제거할 수 없습니다";
/** 패널 동작 줄 사유 한 줄(두 버튼 공통, FR-011-AC5·FR-012-AC6). */
export const PANEL_BUSY_REASON = `${EDIT_AGENT_BUSY_REASON} · ${REMOVE_AGENT_BUSY_REASON}`;
/** 패널 각주(`03-9`): 경로는 고정폭으로 따로 그리므로 앞뒤 글자를 나눠 둔다. */
export const PANEL_FOOTNOTE_LEAD = "제거하면 정의 파일이 ";
export const PANEL_FOOTNOTE_TRASH_PATH = ".aojistudio/trash/";
export const PANEL_FOOTNOTE_TAIL = "로 이동합니다 · 작업 지시는 터미널에서 팀장에게 직접 합니다";

// 05·06 공통 팝업 (ui-spec.md SCR-05·SCR-06, docs/ui/ui-rules.md 팝업·"final에 없는 문구")
export const CANCEL_BUTTON_LABEL = "취소";
/** 05-L·05-R·06 `쓰기 권한 없음`(FR-001-E2): 아래 줄 버튼 아래에 놓는 문구(ui-rules 표). */
export const WRITABLE_FALSE_POPUP_NOTICE = "쓰기 권한 없음 · 마운트한 폴더를 쓰기 가능하게 실행해야 바꿀 수 있습니다";
/**
 * 쓰기 실패 `<사유>` 고정 문구(D-142: 서버가 사유를 나누지 않으므로 프론트가 하나로 고정한다, ui-rules ADR-73 표 네 번째).
 * 05-L E3·05-R E3가 같은 글자를 쓴다.
 */
export const WRITE_FAIL_REASON = "파일을 쓰는 중 오류가 났습니다";

// SCR-05-L 워크플로우 추가 (FR-008)
export const WORKFLOW_ADD_TITLE = "워크플로우 추가";
/**
 * ui-spec.md SCR-05-L 부제. 경로는 고정폭으로 따로 그리므로 앞·경로·뒤로 나눠 둔다.
 * 와이어프레임 표기의 괄호는 ADR-33 (c) 정적 텍스트이므로 괄호 기호만 벗기고 낱말은 그대로 둔다.
 */
export const WORKFLOW_ADD_DESCRIPTION_LEAD = "구성 파일 ";
export const WORKFLOW_ADD_DESCRIPTION_PATH = ".aojistudio/teams/이름.json";
export const WORKFLOW_ADD_DESCRIPTION_TAIL = "(팀장·팀원 목록)이 만들어집니다.";
export const WORKFLOW_ADD_DESCRIPTION = `${WORKFLOW_ADD_DESCRIPTION_LEAD}${WORKFLOW_ADD_DESCRIPTION_PATH}${WORKFLOW_ADD_DESCRIPTION_TAIL}`;
export const WORKFLOW_NAME_LABEL = "이름";
export const WORKFLOW_NAME_HINT = "1~40자 · 한글·영문·숫자·공백·하이픈·언더스코어 · 같은 이름 불가";
/** FR-008-E2: 사전 검증·서버 `fields.name`(ui-rules "final에 없는 문구" 05L 문자·길이). */
export const WORKFLOW_NAME_RULE_MESSAGE = "이름은 1~40자, 한글·영문·숫자·공백·하이픈·언더스코어만 쓸 수 있습니다.";
/** FR-008-E1: 서버 `fields.name`(이미 있는 이름) 자리에 보이는 문구(ui-rules 05L 이름 중복). */
export const WORKFLOW_NAME_DUPLICATE_MESSAGE =
  "같은 이름의 워크플로우가 이미 있습니다. 다른 이름을 입력하세요. (대소문자는 구분하지 않습니다)";
export const WORKFLOW_DESCRIPTION_LABEL = "설명";
/** 선택 입력 표시(`설명 (선택)`, 라벨 밖 muted 400). */
export const OPTIONAL_MARK_TEXT = "(선택)";
export const WORKFLOW_DESCRIPTION_PLACEHOLDER = "한 줄 설명";
/** FR-008-AC3 안내 박스(ui-spec.md SCR-05-L 안내 박스, 끝 마침표 없음). */
export const WORKFLOW_ADD_LEAD_NOTICE =
  "만든 뒤 팀장 1명을 만들거나 가져오세요. 팀장이 없으면 층에 팀장 없음이 표시됩니다";
export const WORKFLOW_ADD_SUBMIT_LABEL = "만들기";
export const WORKFLOW_ADD_SUBMIT_PENDING_LABEL = "만드는 중…";
/** FR-008-E3: `POST /api/workflows` 500 `IO_FAILED` → ui-rules 05L 쓰기 실패 문구(D-142 프론트 매핑). */
export const WORKFLOW_ADD_WRITE_FAIL_MESSAGE = `구성 파일을 만들지 못했습니다. ${WRITE_FAIL_REASON}. 폴더 쓰기 권한을 확인한 뒤 다시 만드세요.`;

// SCR-05-3 워크플로우 삭제 확인 (FR-017)
export function workflowDeleteTitle(name: string): string {
  return `${name} 워크플로우를 삭제할까요?`;
}
/** 첫째 줄: 경로는 고정폭으로 따로 그린다. */
export const WORKFLOW_DELETE_FILE_LEAD = "구성 파일 ";
export const WORKFLOW_DELETE_FILE_TAIL = "이 삭제됩니다";
export function workflowDeleteConfigPath(name: string): string {
  return `.aojistudio/teams/${name}.json`;
}
export function workflowDeleteConfigNote(name: string): string {
  return `${WORKFLOW_DELETE_FILE_LEAD}${workflowDeleteConfigPath(name)}${WORKFLOW_DELETE_FILE_TAIL}`;
}
export const WORKFLOW_DELETE_NO_TRASH_NOTE = "삭제한 구성 파일은 휴지통에 남지 않습니다";
export const WORKFLOW_DELETE_INPUT_LABEL = "확인을 위해 워크플로우 이름 입력";
export function workflowDeleteReason(name: string): string {
  return `${name}을(를) 똑같이 입력하면 삭제 버튼이 켜집니다`;
}
export const WORKFLOW_DELETE_CONFIRM_LABEL = "삭제";
export const WORKFLOW_DELETE_CONFIRM_PENDING_LABEL = "삭제 중…";
/** FR-017-E1: 409 `WORKFLOW_NOT_EMPTY`. */
export const WORKFLOW_NOT_EMPTY_MESSAGE = "팀원이 있어 삭제할 수 없습니다";

// SCR-05-4 워크플로우 삭제 불가 안내 (v1.2.0, FR-017-AC1)
export function workflowDeleteBlockedTitle(name: string): string {
  return `${name} 워크플로우를 삭제할 수 없습니다`;
}
/** 조건 안내 한 요소(`05-4-1` 본문). */
export const WORKFLOW_DELETE_BLOCKED_CONDITION = "팀장·팀원이 0명일 때만 삭제할 수 있습니다 · 팀원을 먼저 제거하세요";
export function workflowDeleteBlockedListTitle(count: number): string {
  return `남은 에이전트 ${count}명`;
}
export const WORKFLOW_DELETE_BLOCKED_CONFIRM_LABEL = "확인";

// SCR-05-R 기존 에이전트 가져오기 (FR-009)
/** 대상 워크플로우가 정해지지 않았을 때의 제목(ui-spec.md SCR-05-R 제목 행 "헤더 링크로 열면"). */
export const IMPORT_TITLE = "기존 에이전트 가져오기";
/**
 * 대상 워크플로우가 정해졌을 때의 제목. 대상은 `?workflow` ?? 드롭다운 현재 선택값이다(ADR-38).
 * 값 뒤 조사는 병기 표기 `(으)로`를 글자 그대로 쓴다(ADR-39, conventions.md §2 MUST).
 */
export function importTitleFor(workflowName: string): string {
  return `${workflowName}(으)로 ${IMPORT_TITLE}`;
}
/** 부제의 N = 워크플로우 밖 에이전트 수(ADR-33 (a) 치환). */
export function importSubtitle(outsideCount: number): string {
  return `어느 워크플로우에도 없는 정의 파일 ${outsideCount}개 · 정의 파일은 그대로 두고 소속과 역할만 구성 파일에 적습니다`;
}
export const IMPORT_TARGET_WORKFLOW_LABEL = "대상 워크플로우";
/** 워크플로우가 0개일 때 드롭다운 자리에 놓는 안내(ui-spec.md SCR-05-R 드롭다운 행 `빈`). */
export const IMPORT_NO_WORKFLOW_NOTICE = "먼저 워크플로우를 추가하세요";
export const IMPORT_SEARCH_LABEL = "검색";
export const IMPORT_SEARCH_PLACEHOLDER = "이름·설명 검색";
export const IMPORT_SEARCH_NO_RESULTS_TEXT = "일치하는 에이전트가 없습니다";
/**
 * ADR-37: 검색은 표시 필터일 뿐이라 선택을 지우지 않는다. 지금 검색 결과에 없는 선택이
 * 1명 이상일 때만 검색 입력 아래에 이 줄을 그린다(0명이면 줄 자체를 그리지 않는다).
 */
export function importHiddenSelectionNotice(hiddenCount: number): string {
  return `검색으로 가려진 선택 ${hiddenCount}명`;
}
export const IMPORT_CREATE_AGENT_BUTTON_LABEL = "새로 만들기";
export const IMPORT_TABLE_SELECT_LABEL = "선택";
export const IMPORT_TABLE_COL_NAME = "이름 (name)";
export const IMPORT_TABLE_COL_DESCRIPTION = "설명 (description)";
export const IMPORT_TABLE_COL_ROLE = "역할";
/** 역할 드롭다운 선택지(ui-spec.md SCR-05-R 목록 표 `역할` 열). */
export const ROLE_OPTION_TEXT: Record<Role, string> = {
  lead: "팀장",
  member: "팀원",
};
/** 행마다 다른 체크박스·역할 드롭다운의 접근성 이름(NFR-12). */
export function importRowCheckLabel(agentName: string): string {
  return `${agentName} ${IMPORT_TABLE_SELECT_LABEL}`;
}
export function importRoleSelectLabel(agentName: string): string {
  return `${agentName} ${IMPORT_TABLE_COL_ROLE}`;
}
/** FR-009-AC6: 워크플로우 밖 에이전트가 0명일 때의 점선 안내 카드(ui-rules 05R 빈 상태). */
export const IMPORT_EMPTY_TITLE = "워크플로우 밖 에이전트가 없습니다";
export const IMPORT_EMPTY_BODY =
  "모든 정의 파일이 이미 워크플로우에 속해 있습니다. 새로 만들어 이 워크플로우에 넣으세요.";
export const IMPORT_NOTICE =
  "팀장은 워크플로우당 1명이고 층의 첫 자리에 놓입니다. 대상 워크플로우에 팀장이 있으면 역할의 팀장은 고를 수 없습니다.";
/** FR-009-AC5: 선택 인원이 라벨에 들어간다(ADR-33 (a) 치환). 0명이면 비활성이다. */
export function importSubmitLabel(selectedCount: number): string {
  return `선택한 ${selectedCount}명 가져오기`;
}
export const IMPORT_SUBMIT_PENDING_LABEL = "가져오는 중…";
/** FR-009-E1: 팀장 2명 이상 → 400 `VALIDATION`(`fields.members`) 대신 프론트가 만드는 ui-rules 05R E1 문구. N = 요청에서 팀장으로 고른 수. */
export function importLeadMultipleMessage(leadCount: number): string {
  return `팀장은 워크플로우당 1명입니다. 팀장으로 고른 ${leadCount}명 중 1명만 남기세요.`;
}
/**
 * FR-009-E2: `ALREADY_ASSIGNED` 거부 줄(ui-rules 05R 그사이 소속됨). 소속 워크플로우는 갱신된 스냅샷에서 찾는다(D-142).
 * 스냅샷에서도 찾지 못하면(그 에이전트가 사라졌거나 소속이 비었다) `IMPORT_ASSIGNED_UNKNOWN_WORKFLOW`로 쓴다.
 */
export const IMPORT_ASSIGNED_UNKNOWN_WORKFLOW = "다른 워크플로우";
export function importAlreadyAssignedLine(agentName: string, workflowName: string, addedCount: number): string {
  return `${agentName}은(는) 그사이 ${workflowName}에 들어가 가져오지 않았습니다. 나머지 ${addedCount}명은 가져왔습니다.`;
}
/** FR-009-E2: `NOT_FOUND`·`FORMAT_ERROR` 거부 줄(ui-spec.md SCR-05-R 에러 영역, ADR-36). */
export const IMPORT_REJECTED_REASON_TEXT: Record<Exclude<ImportRejectedReason, "ALREADY_ASSIGNED">, string> = {
  NOT_FOUND: "정의 파일이 없습니다 · 목록을 확인하세요",
  FORMAT_ERROR: "읽지 못한 정의 파일입니다 · 목록을 확인하세요",
};
export function importRejectedLine(agentName: string, reason: Exclude<ImportRejectedReason, "ALREADY_ASSIGNED">): string {
  return `${agentName}: ${IMPORT_REJECTED_REASON_TEXT[reason]}`;
}
/** FR-009-E3: `POST /api/workflows/{workflow}/members` 500 `IO_FAILED` → ui-rules 05R 쓰기 실패 문구(D-142 프론트 매핑). */
export const IMPORT_WRITE_FAIL_MESSAGE = `구성 파일을 바꾸지 못했습니다. ${WRITE_FAIL_REASON}. 아무것도 바뀌지 않았으니 다시 시도하세요.`;

// ── SCR-06 에이전트 만들기 · 수정 폼 (FR-010, FR-011) ──────────────
export const AGENT_FORM_CREATE_TITLE = "에이전트 만들기";
export const AGENT_FORM_EDIT_TITLE = "에이전트 수정";
/** 필수 입력 표시(이름·소속 워크플로우·설명에만 붙는다). */
export const REQUIRED_MARK_TEXT = "필수";
/**
 * 제목 옆 경로(ui-spec.md SCR-06 제목 행 `AojiStudio/.claude/agents/...`).
 * 서버가 주는 `filePath`는 마운트 루트 기준 상대 경로이므로 앞에 프로젝트 폴더 이름을 붙인다(ADR-33 (a)).
 */
export function agentFilePathLabel(filePath: string): string {
  return `${WORKFLOWS_SUMMARY_PROJECT_LABEL}/${filePath}`;
}
export const AGENT_NAME_LABEL = "이름 (name)";
export const AGENT_NAME_HINT = "소문자·숫자·하이픈, 1~64자 · 같은 이름 불가 · 바꾸면 파일명도 바뀜";
/**
 * 사전 검증 문구. api-spec.yaml `POST /api/agents` 400 `fields.name`과 ui-spec.md SCR-06 이름 행이
 * 같은 규칙에 쓰는 확정 문구이므로 프론트 사전 검증도 같은 글자를 쓴다(conventions.md §2).
 */
export const AGENT_NAME_RULE_MESSAGE = "소문자·숫자·하이픈만, 1~64자";
export const AGENT_MODEL_LABEL = "모델 (model)";
/** ADR-13 드롭다운 선택지. `custom`은 아래 입력창에 전체 모델 ID를 적는다. */
export const MODEL_OPTION_TEXT: Record<ModelChoice, string> = {
  inherit: "상속 (지정 안 함)",
  sonnet: "sonnet",
  opus: "opus",
  haiku: "haiku",
  custom: "직접 입력",
};
export const AGENT_WORKFLOW_LABEL = "소속 워크플로우";
export const AGENT_WORKFLOW_HINT = "한 에이전트는 한 워크플로우에만 속함";
/** FR-011-AC3: 워크플로우 밖 에이전트를 수정할 때만 고를 수 있는 옵션. */
export const AGENT_WORKFLOW_NONE_OPTION = "(없음)";
export const AGENT_ROLE_LABEL = "역할";
/** FR-010-AC4 이유 줄(ADR-35 지정 지점). */
export function leadExistsReason(lead: string): string {
  return `이미 팀장이 있습니다 (${lead})`;
}
export const AGENT_DESCRIPTION_LABEL = "설명 (description)";
export const AGENT_TOOLS_LABEL = "사용 도구 (tools)";
export const TOOLS_MODE_INHERIT_TEXT = "전체 상속";
export const TOOLS_MODE_EXPLICIT_TEXT = "직접 선택";
/** `기타` 체크박스 라벨과 그 입력(placeholder, 접근성 이름 `기타 도구`). */
export const AGENT_TOOLS_OTHER_LABEL = "기타";
export const AGENT_TOOLS_OTHER_PLACEHOLDER = "기타 도구 (쉼표로 구분)";
export const AGENT_TOOLS_OTHER_INPUT_LABEL = "기타 도구";
/** FR-010-AC2 이유 줄(ADR-35 지정 지점). */
export const TOOLS_MODE_REQUIRED_REASON = "도구 방식을 고르세요";
/** 직접 선택 0개일 때 `사용 도구` 필드 아래 사유(api-spec.yaml `fields.tools`와 같은 문구). */
export const TOOLS_EXPLICIT_EMPTY_MESSAGE = "직접 선택은 1개 이상";
export const AGENT_BODY_LABEL = "지침 (본문 = 시스템 프롬프트)";
/** FR-011-AC1·AC2 아래 줄 왼쪽 도움말(ui-spec.md SCR-06). */
export const AGENT_FORM_FOOTNOTE = "폼에 없는 항목(permissionMode, skills 등)은 값과 순서를 그대로 둡니다";
export const AGENT_FORM_SUBMIT_LABEL = "저장";
export const AGENT_FORM_SUBMIT_PENDING_LABEL = "저장 중…";
export const AGENT_REMOVE_FROM_WORKFLOW_BUTTON_LABEL = "워크플로우에서 제거";
/** `GET /api/agents/{name}` 404(ui-spec.md SCR-06 제목 행 에러 열). */
export const AGENT_FILE_NOT_FOUND_MESSAGE = "정의 파일이 없습니다 · 목록을 확인하세요";
export const CLOSE_BUTTON_LABEL = "닫기";
/** FR-010-AC6: 만들기 성공 뒤 02 상단에 8초 동안 남는 한 줄. */
export const AGENT_CREATED_RESTART_NOTICE =
  "Claude Code가 새 정의를 바로 인식하지 못하면 재시작이 필요할 수 있습니다";

// ── SCR-06-5 저장 충돌 (FR-011-AC4) ──────────────────────────
export const SAVE_CONFLICT_TITLE = "파일이 다른 곳에서 수정되었습니다";
/** 본문(ui-rules 06-5). 파일 이름·시각은 고정폭으로 따로 그리므로 사이 글자를 나눠 둔다. */
export const SAVE_CONFLICT_BODY_AFTER_FILE = "가 이 창을 연 뒤 ";
export const SAVE_CONFLICT_BODY_AFTER_TIME =
  "에 바뀌었습니다. 덮어쓰면 그 변경이 사라집니다. 최신 파일을 다시 불러오면 지금 폼에 적은 내용이 사라집니다.";
/**
 * 조사 `가`는 병기가 아니라 ui-rules 글자 그대로다 — 받침 판정을 하지 않는다(ADR-39).
 */
export function saveConflictBody(fileName: string, hhmmss: string): string {
  return `${fileName}${SAVE_CONFLICT_BODY_AFTER_FILE}${hhmmss}${SAVE_CONFLICT_BODY_AFTER_TIME}`;
}
export const SAVE_CONFLICT_RELOAD_LABEL = "최신 파일 다시 불러오기";
export const SAVE_CONFLICT_OVERWRITE_LABEL = "덮어쓰기";

// ── SCR-06-6 워크플로우에서 제거 확인 (FR-012) ────────────────────────────────────────
/** 치환값 뒤 조사는 병기 표기로 쓰고 받침 판정을 하지 않는다(ADR-39, conventions.md §2 MUST). */
export function agentRemoveTitle(agentName: string, workflowName: string | null): string {
  return workflowName === null
    ? `${agentName}을(를) 제거할까요?`
    : `${agentName}을(를) ${workflowName}에서 제거할까요?`;
}
/** 첫째 줄: 경로는 고정폭으로 따로 그린다(ui-rules 06-6 안내). */
export const AGENT_REMOVE_TRASH_LEAD = "정의 파일이 ";
export const AGENT_REMOVE_TRASH_PATH = ".aojistudio/trash/";
export const AGENT_REMOVE_TRASH_TAIL = "로 이동합니다 (파일을 옮겨 복구할 수 있습니다)";
export const AGENT_REMOVE_TRASH_NOTE = `${AGENT_REMOVE_TRASH_LEAD}${AGENT_REMOVE_TRASH_PATH}${AGENT_REMOVE_TRASH_TAIL}`;
/** 둘째 줄(소속이 있을 때). */
export function agentRemoveWorkflowNote(workflowName: string): string {
  return `${workflowName} 구성 파일에서 빠집니다`;
}
/** FR-012-AC3: 팀장을 제거할 때만 붙는 셋째 줄(Q-R3-2 A 확정). */
export function agentRemoveLeadNote(workflowName: string): string {
  return `팀장을 제거하면 ${workflowName} 층에 팀장 없음이 표시됩니다`;
}
export const AGENT_REMOVE_INPUT_LABEL = "확인을 위해 name 입력";
export function agentRemoveReason(agentName: string): string {
  return `${agentName}을(를) 똑같이 입력하면 제거 버튼이 켜집니다`;
}
export const AGENT_REMOVE_CONFIRM_LABEL = "제거";
export const AGENT_REMOVE_CONFIRM_PENDING_LABEL = "제거 중…";
/** `DELETE /api/agents/{name}` 404(ui-spec.md SCR-06-6 에러 열). */
export const AGENT_ALREADY_REMOVED_MESSAGE = "이미 없는 에이전트입니다";

// ── SCR-07 설정 (FR-014, FR-001-AC4·AC5·E1·E2, FR-013-AC5·AC10, docs/ui/screens/07-settings.html) ─────
export const SETTINGS_TITLE = "설정";
export const SETTINGS_SUBTITLE = "읽기 전용 · 웹에서 바꾸지 않습니다. 값은 마운트한 폴더와 실행 설정에서 옵니다.";
/** 값 줄 안 구분점. ui-spec.md SCR-07 값 문구가 `A · B` 형태로 적은 자리에만 쓴다. */
export const MIDDLE_DOT_SEPARATOR = " · ";

// 프로젝트 폴더 카드
export const SETTINGS_PROJECT_CARD_TITLE = "프로젝트 폴더";
export const SETTINGS_READ_ONLY_BADGE = "읽기 전용";
export const SETTINGS_ROW_MOUNT_PATH = "마운트 폴더";
export const SETTINGS_ROW_AGENTS = "에이전트";
export const SETTINGS_ROW_SKILLS = "스킬";
export const SETTINGS_ROW_WRITABLE = "쓰기 권한";
export const SETTINGS_ROW_FORMAT_ERRORS = "형식 오류";
export const SETTINGS_AGENTS_PATH = ".claude/agents/";
export const SETTINGS_SKILLS_PATH = ".claude/skills/";
export const SETTINGS_AGENTS_COUNT_PREFIX = "정의";
export const SETTINGS_COUNT_SUFFIX = "개";
export const SETTINGS_WRITABLE_TRUE_TEXT = "있음 · 에이전트 추가·수정·제거 가능";
/** FR-001-E2. 비활성 이유 줄(`WRITABLE_FALSE_REASON`)과 같은 글자다. */
export const SETTINGS_WRITABLE_FALSE_TEXT = WRITABLE_FALSE_REASON;
export const SETTINGS_FORMAT_ERRORS_PREFIX = "읽지 못한 정의 파일";
export const SETTINGS_PROJECT_FOOTNOTE = "폴더는 컨테이너를 실행할 때 마운트로 정해지며 웹에서 바꿀 수 없습니다";

// Claude 열기 카드 (설명문은 D-F4 확정 문구. 두 버튼 이름은 굵게)
export const SETTINGS_CLAUDE_CARD_TITLE = "Claude 열기";
export const SETTINGS_CLAUDE_DESC_1 = "에이전트 워크플로우의 ";
export const SETTINGS_CLAUDE_DESC_BTN_1 = "Claude 열기 · 기본 세션";
export const SETTINGS_CLAUDE_DESC_2 = "은 claude를, 워크플로우 상세의 ";
export const SETTINGS_CLAUDE_DESC_BTN_2 = "팀장 호출";
export const SETTINGS_CLAUDE_DESC_3 = "은 그 워크플로우 팀장 세션을 맥북 기본 터미널에서 AojiStudio 폴더 기준으로 엽니다.";
export const SETTINGS_ROW_TERMINAL_APP = "터미널 앱";
export const SETTINGS_ROW_DEFAULT_SESSION = "기본 세션";
export const SETTINGS_ROW_LEAD_SESSION = "팀장으로 열기";
export const SETTINGS_LEAD_SESSION_HINT =
  "도우미가 받는 값은 팀장 name 하나 · 소문자·숫자·하이픈만 허용";
export const SETTINGS_ROW_HELPER = "열기 도우미";
export const SETTINGS_HELPER_CHECKING_TEXT = "확인 중…";
export const SETTINGS_HELPER_INSTALLED_TEXT = "설치됨";
export const SETTINGS_HELPER_MISSING_TEXT = "미설치 · helper/install.sh로 설치";
/** `GET /api/helper/token`이 null일 때(ui-spec.md SCR-07 `열기 도우미` 행). */
export const SETTINGS_HELPER_NO_TOKEN_TEXT = "미설치 · 토큰 파일 없음";
export const SETTINGS_TEST_OPEN_BUTTON_LABEL = "테스트로 열기";
/** FR-013-AC10 이유 줄(ADR-35 지정 지점). */
export const HELPER_MISSING_REASON = "도우미 미설치";
export const SETTINGS_COMMAND_COPY_NOTE = "명령 복사 = 기본 세션 명령 · 팀장 명령은 워크플로우 상세에서 복사합니다";

// 수집 카드
export const SETTINGS_COLLECT_CARD_TITLE = "수집";
export const SETTINGS_ROW_COLLECT_URL = "수집 주소";
export const SETTINGS_ROW_HOOK = "hook 설정";
export const SETTINGS_HOOK_SETTINGS_PATH = ".claude/settings.json";
export const SETTINGS_HOOK_CONFIGURED_TEXT = "있음";
export const SETTINGS_HOOK_MISSING_TEXT = "없음";
export const SETTINGS_COPY_HOOK_EXAMPLE_LABEL = "설정 예시 복사";
export const SETTINGS_COLLECT_COPY_NOTE = "웹은 settings.json을 쓰지 않습니다. 예시를 복사해 직접 붙여 넣으세요";
export const SETTINGS_ROW_TEAMS = "워크플로우 구성";
export const SETTINGS_ROW_TRASH = "휴지통";
export const SETTINGS_ROW_RETENTION = "이벤트 보존";
export const SETTINGS_TEAMS_NOTE = "팀장·팀원 목록";
export const SETTINGS_TRASH_NOTE = "제거한 정의 파일 보관";
export const SETTINGS_RETENTION_SUFFIX = "일";

// ── (v1.2.0) 08·09·10 데이터 화면 공통 (ui-spec §공통 `PeriodSelector`·`ExpandableList`·`UsedAgentsButton`, ADR-86·88) ─────
/** 기간 선택 라벨(`aria-labelledby`의 글자). */
export const PERIOD_LABEL = "기간";
/** 기간 선택 3칸. 기본은 `7d`다. */
export const PERIOD_OPTIONS: ReadonlyArray<{ value: UsagePeriod; label: string }> = [
  { value: "7d", label: "7일" },
  { value: "30d", label: "30일" },
  { value: "all", label: "전체" },
];
/** `range.from`이 null(집계가 없는 전체 기간)일 때 날짜 범위 자리. */
export const PERIOD_RANGE_NONE_TEXT = "-";
/** `MM-DD ~ MM-DD`: `YYYY-MM-DD` 두 날짜에서 연도를 뗀다. */
export function periodRangeText(from: string, to: string): string {
  return `${from.slice(5)} ~ ${to.slice(5)}`;
}
export function usedAgentsLabel(count: number): string {
  return `사용 에이전트 ${count}명`;
}
/** 행 펼침 버튼의 접근 이름. */
export function expandRowLabel(name: string, expanded: boolean): string {
  return expanded ? `${name} 접기` : `${name} 펼치기`;
}

// ── (v1.2.0) SCR-08 스킬 목록 (ui-spec SCR-08, `08-skills.html`) ──────────────────────────────────────────
export const SKILLS_TITLE = "스킬";
export const SKILLS_PATH = ".claude/skills/";
export const SKILLS_SUBTITLE_AFTER_PATH = " · ";
export const SKILLS_SUBTITLE_AFTER_COUNT = "개 · 이름순 · 사용자 전용 스킬은 ";
export const SKILLS_SUBTITLE_SLASH_NAME = "/<이름>";
export const SKILLS_SUBTITLE_TAIL = "으로만 부릅니다";
export const SKILLS_LIST_LABEL = "스킬 목록";
export const SKILLS_COL_NAME = "스킬";
export const SKILLS_COL_USAGE_LEAD = "활용도 · ";
export const SKILLS_COL_AGENTS = "사용 에이전트";
export const SKILLS_COL_ACTIONS = "동작";
/** 기간 줄·펼친 내용에 붙는 기간 표기(`최근 7일`·`최근 30일`·`전체`). */
export const PERIOD_WINDOW_TEXT: Record<UsagePeriod, string> = { "7d": "최근 7일", "30d": "최근 30일", all: "전체" };
export const SKILLS_SUM_LEAD = "· 사용 합계 ";
export const SKILLS_SUM_TAIL = "회";
export const SKILLS_HOW_TEXT = "활용도 = 스킬 사용 횟수 / 모든 스킬 사용 횟수 합 · 사용 횟수 = 호출 + 직접 호출 + 미리 넣음";
export const SKILLS_NO_HOOK_NOTE = "hook 이벤트가 없어 호출 기록을 셀 수 없습니다";
export const SKILL_CHIP_USER_ONLY = "사용자 전용";
export const SKILL_CHIP_IMPORTED = "가져온 스킬";
export const SKILL_CHIP_FORMAT_ERROR = "형식 오류";
export const USAGE_NO_RECORD_TEXT = "기록 없음";
export function usageMeterLabel(percentText: string): string {
  return `활용도 ${percentText}%`;
}
export const SKILL_DELETE_BUTTON_LABEL = "삭제";
export const SKILL_DETAIL_DESCRIPTION = "설명";
export const SKILL_DETAIL_USAGE_LEAD = "사용 횟수 · ";
export const SKILL_DETAIL_CALL = "호출";
export const SKILL_DETAIL_SLASH = "직접 호출";
export const SKILL_DETAIL_PRELOAD = "미리 넣음";
export const SKILL_DETAIL_DEFINED = "정의상 (skills:)";
export const SKILL_DETAIL_ACTUAL = "실제 사용 (횟수)";
export const DEFAULT_SESSION_AGENT_TEXT = "기본 세션";
export const DEFINED_UNUSED_CHIP_TEXT = "정의됨 · 사용 0";
export const SKILLS_EMPTY_TITLE = "스킬이 없습니다";
export const SKILLS_EMPTY_BODY_AFTER_PATH = "에 스킬 폴더가 없습니다. 새로 만들거나 외부 스킬 zip을 가져오세요.";
export const SKILLS_LOAD_FAILED_LABEL = "스킬 목록을 불러오지 못했습니다";

// ── (v1.2.0) SCR-08-3 스킬 삭제 확인 ─────────────────────────────────────────────────────────────────────
export function skillDeleteTitle(name: string): string {
  return `${name} 스킬을 삭제할까요?`;
}
export const SKILL_DELETE_TRASH_LEAD = "스킬 폴더가 ";
export const SKILL_DELETE_TRASH_PATH = ".aojistudio/trash/";
export const SKILL_DELETE_TRASH_TAIL = "로 이동합니다 (폴더를 옮겨 복구할 수 있습니다)";
export function skillDeleteUsedByTitle(count: number): string {
  return `이 스킬을 미리 넣어 쓰는 에이전트 ${count}명`;
}
export const SKILL_DELETE_USED_BY_NOTE_LEAD = "에이전트 정의 파일의 ";
export const SKILL_DELETE_USED_BY_NOTE_CODE = "skills:";
export const SKILL_DELETE_USED_BY_NOTE_TAIL = " 항목은 바뀌지 않습니다";
export const SKILL_DELETE_INPUT_LABEL = "확인을 위해 스킬 이름 입력";
export function skillDeleteReason(name: string): string {
  return `${name}을(를) 똑같이 입력하면 삭제 버튼이 켜집니다`;
}
export const SKILL_DELETE_CONFIRM_LABEL = "삭제";
export const SKILL_DELETE_CONFIRM_PENDING_LABEL = "삭제 중…";

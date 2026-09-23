/**
 * 화면 문구 상수 (conventions.md §2 MUST). ui-spec.md·final 문서의 문구를 글자 그대로 쓴다.
 * 컴포넌트는 이 파일의 상수만 쓰고 문자열을 직접 적지 않는다.
 */
import type { Status } from "../api/types";
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

// Sidebar 로고·워드마크 (docs/ui/screens/01-home.png 좌상단)
export const APP_WORDMARK = "Jay Studio";

// Sidebar 탭 (ui-spec §공통 AppShell)
export const SIDEBAR_TAB_HOME = "홈";
export const SIDEBAR_TAB_WORKFLOWS = "에이전트 워크플로우";
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

export function lastReceivedLabel(hhmmss: string | null): string {
  return hhmmss === null ? NO_LAST_RECEIVED_TEXT : `마지막 수신 ${hhmmss}`;
}

// DisconnectBanner (ui-spec SCR-04-3, FR-016)
export function disconnectBannerMessage(retryInSec: number): string {
  return `실시간 연결이 끊겼습니다 · ${retryInSec}초 후 재연결`;
}
export const RECONNECT_NOW_LABEL = "지금 재연결";
export const NO_DATA_YET_TEXT = "아직 받은 데이터가 없습니다";
export function lastUpdatedLabel(hhmmss: string): string {
  return `마지막 갱신 ${hhmmss} 기준 화면 유지`;
}

// 워크플로우 칩 (lib/derive/workflowChip.ts에서 조립하는 문구 그대로 보관)
export const WORKFLOW_CHIP_ALL_IDLE_TEXT = "모두 대기";

// CopyButton (ui-spec §공통)
export const COPY_BUTTON_DEFAULT_LABEL = "복사";
export const COPY_BUTTON_COPIED_LABEL = "복사됨";

// AgentsDirMissing (SCR-04-5, 01·02·07 공통)
export const AGENTS_DIR_MISSING_TITLE = "에이전트 폴더를 찾을 수 없습니다";
export function agentsDirMissingPath(hostPath: string): string {
  return `${hostPath}/.claude/agents`;
}
export const AGENTS_DIR_MISSING_BODY_1 = "컨테이너 실행 시 마운트한 폴더에 .claude가 있는지 확인하세요.";
export const AGENTS_DIR_MISSING_BODY_2 = "쓰기 권한이 없으면 추가·수정·삭제 버튼은 비활성.";
export const RESCAN_BUTTON_LABEL = "다시 읽기";
export const RESCAN_BUTTON_LOADING_LABEL = "다시 읽는 중…";
export const OPEN_SETTINGS_BUTTON_LABEL = "설정 열기";
export function rescanFailedMessage(message: string): string {
  return `다시 읽지 못했습니다 · ${message}`;
}

// EmptyWorkflowCard (SCR-04-7, 01·02 공통)
export const EMPTY_WORKFLOW_TITLE = "아직 워크플로우가 없습니다";
export const ADD_WORKFLOW_BUTTON_LABEL = "워크플로우 추가";
export const WRITABLE_FALSE_REASON = "쓰기 권한 없음";

// NoEventsYet (SCR-04-1, 01)
export const NO_EVENTS_TITLE = "아직 수집된 활동이 없습니다";
export const NO_EVENTS_BODY = "프로젝트 폴더에서 Claude Code를 실행하면 에이전트 활동이 여기에 나타납니다.";
export const NO_EVENTS_HOOK_SETUP_PREFIX = "hook 설정: .claude/settings.json · ";
export const NO_EVENTS_HOOK_SETUP_LINK_LABEL = "설정 화면";
export const NO_EVENTS_HOOK_SETUP_SUFFIX = "에서 예시 복사";
export const NO_EVENTS_FOOTNOTE = "에이전트 정의는 이벤트와 무관하게 워크플로우 탭에 표시";

// SCR-01 홈
export const HOME_TITLE = "에이전트 관제";
export const HOME_SUBTITLE = "Claude Code 에이전트 활동을 실시간으로 봅니다. 웹에서 에이전트를 실행하지 않습니다.";
export const OPEN_WORKFLOWS_BUTTON_LABEL = "에이전트 워크플로우 열기 →";

export const KPI_RUNNING_TITLE = "실행 중 에이전트";
export function kpiRunningSubtitle(waiting: number): string {
  return `hook 이벤트 기준 · 권한·입력 대기 ${waiting}`;
}
export const KPI_AGENT_COUNT_TITLE = "에이전트 수";
export const KPI_AGENT_COUNT_SUBTITLE = ".claude/agents 정의 파일 수";
export const KPI_SKILL_COUNT_TITLE = "스킬 수";
export const KPI_SKILL_COUNT_SUBTITLE = ".claude/skills 스킬 수";
export const KPI_COLLECTOR_TITLE = "수집 상태";

export const STATUS_BAR_TITLE = "에이전트 상태";
export const STATUS_BAR_SUBTITLE = "hook 이벤트 기준";
export const STATUS_BAR_LEGEND_RUNNING = "작업 중";
export const STATUS_BAR_LEGEND_WAITING = "입력·권한 대기";
export const STATUS_BAR_LEGEND_IDLE = "대기";

export const FEATURED_WORKFLOWS_TITLE = "에이전트 워크플로우";
export const FEATURED_WORKFLOWS_SUBTITLE = "대표 3개 · 실행 중 에이전트가 있는 워크플로우 → 최근 활동순";
export const VIEW_ALL_WORKFLOWS_LINK_LABEL = "전체 보기 →";
export const WORKFLOW_CARD_VIEW_LINK_LABEL = "워크플로우 보기 →";
export function workflowCardCountsLabel(agentCount: number, skillCount: number): string {
  return `에이전트 ${agentCount} · 스킬 ${skillCount}`;
}
export function recentActivityLabel(title: string, summary: string): string {
  return `최근 활동 · ${title} · ${summary}`;
}
export function lastActivityLabel(dateHm: string): string {
  return `마지막 활동 · ${dateHm}`;
}
export const NO_ACTIVITY_TEXT = "활동 없음";

export const EVENTS_CARD_TITLE = "실시간 이벤트";
export function recentEventsSubtitle(count: number): string {
  return `최근 ${count}개 · 전체 로그 화면 없음`;
}
export const LIVE_CONNECTED_TEXT = "실시간 연결됨";
export const LIVE_DISCONNECTED_TEXT = "연결 끊김";
export const EVENTS_TABLE_COL_TIME = "시각";
export const EVENTS_TABLE_COL_WORKFLOW = "워크플로우";
export const EVENTS_TABLE_COL_AGENT = "에이전트";
export const EVENTS_TABLE_COL_EVENT = "이벤트";
export const EVENTS_TABLE_COL_SUMMARY = "요약";
export const EVENTS_TABLE_FOOTNOTE = "token·key·password 등 기본 패턴은 ••••••••로 가림";
export const EMPTY_VALUE_TEXT = "-";

// SCR-02 에이전트 워크플로우 층 뷰
export const WORKFLOWS_SUMMARY_PROJECT_LABEL = "JayStudio";
export const WORKFLOWS_SUMMARY_CLAUDE_LABEL = ".claude";
export function workflowsSummaryCountsLabel(
  agentCount: number | string,
  skillCount: number,
  workflowCount: number,
): string {
  return `에이전트 ${agentCount} · 스킬 ${skillCount} · 워크플로우 ${workflowCount}`;
}
// N=0이면 링크가 비활성이라 "· 가져오기"를 붙이지 않는다(ui-spec.md SCR-02 "워크플로우 밖 에이전트" 행).
export function outsideAgentsLinkLabel(count: number): string {
  const base = `워크플로우 밖 에이전트 ${count}`;
  return count === 0 ? base : `${base} · 가져오기`;
}
export const CREATE_AGENT_BUTTON_LABEL = "+ 에이전트 만들기";
export const OPEN_DEFAULT_SESSION_BUTTON_LABEL = "Claude 열기 · 기본 세션";

export const SEARCH_PLACEHOLDER = "워크플로우·에이전트 이름 검색";
export function floorSelectAllLabel(count: number): string {
  return `전체 층 (${count}개)`;
}
export const ADD_WORKFLOW_HEADER_BUTTON_LABEL = "+ 워크플로우 추가";
export const SEARCH_NO_RESULTS_TEXT = "검색 결과가 없습니다";

export const LOBBY_TITLE = "로비 · 메인 세션";
export const LOBBY_SUBTITLE = "에이전트 지정 없이 실행 중인 Claude Code 세션";
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
/** 층 헤더 요약(FR-006-AC5). 집계는 `lib/derive/floorSummary.ts`가 하고 여기서는 문구만 만든다. */
export function floorSummaryLabel(summary: FloorSummary): string {
  if (summary.allIdle) return WORKFLOW_CHIP_ALL_IDLE_TEXT;
  const parts: string[] = [];
  if (summary.running > 0) parts.push(`실행 중 ${summary.running}명`);
  if (summary.waiting > 0) parts.push(`권한 대기 ${summary.waiting}명`);
  return parts.join(" · ");
}
export const FLOOR_NO_LEAD_WARNING = "팀장이 없습니다 · 팀장을 만들거나 가져오세요";
function koreanSubjectParticle(text: string): "이" | "가" {
  const last = text.trim().slice(-1).toLowerCase();
  return "aeiou".includes(last) ? "가" : "이";
}
export function floorDuplicateWarning(name: string): string {
  return `${name}${koreanSubjectParticle(name)} 여러 워크플로우에 있습니다 · 구성 파일을 확인하세요`;
}
export const FLOOR_EMPTY_TEXT = "에이전트가 없습니다 · 만들거나 가져오세요";
export const FLOOR_IMPORT_BUTTON_LABEL = "가져오기";
export const FLOOR_CREATE_BUTTON_LABEL = "+ 만들기";
export const FLOOR_DETAIL_BUTTON_LABEL = "상세 →";
export const FLOOR_DELETE_BUTTON_LABEL = "삭제";
export const FLOOR_DELETE_DISABLED_REASON = "팀원을 먼저 제거하세요";
export const LEAD_BADGE_TEXT = "팀장";

export function formatErrorListTitle(count: number): string {
  return `읽지 못한 정의 파일 ${count}개`;
}
export const FORMAT_ERROR_FOOTNOTE = "오류 파일은 층에 표시하지 않고 목록만 표시 · 수정은 에디터에서";
export const FORMAT_ERROR_EDIT_LINK_LABEL = "정상 파일은 수정 팝업에서 편집 →";

export const ZOOM_IN_LABEL = "+";
export const ZOOM_OUT_LABEL = "−";
export const ZOOM_FIT_LABEL = "맞춤";

/** 책상·오피스 캐릭터 상태 글자 + 서브에이전트 부모 접미(FR-006-AC1·AC3, FR-007-AC3). */
export function agentStatusWithParent(status: Status, parentLabel: string | null): string {
  const base = STATUS_LABEL_TEXT_SHORT[status];
  return parentLabel ? `${base} · 부모 ${parentLabel}` : base;
}

// SCR-03 워크플로우 상세 · 픽셀 오피스
export const BACK_TO_WORKFLOWS_LABEL = "에이전트 워크플로우로";
export const LEAD_TERMINAL_BUTTON_LABEL = "팀장 호출 · 터미널 열기";
export const WORKFLOW_NOT_FOUND_TEXT = "워크플로우를 찾을 수 없습니다";

export const OFFICE_TITLE = "오피스";
export const OFFICE_SUBTITLE = "에이전트 1명 = 캐릭터 1개 · 팀장 첫 자리, 나머지 이름순";
export const EMPTY_SEAT_TEXT = "빈 자리";

export const OFFICE_LEGEND_TITLE = "동작 매핑";
export const OFFICE_LEGEND_TYPING = "타이핑 = Edit·Write";
export const OFFICE_LEGEND_READING = "읽기 = Read·Grep·Glob";
export const OFFICE_LEGEND_WAITING = "주황 말풍선 = 권한 요청";
export const OFFICE_LEGEND_IDLE = "회색 = 대기";
export const OFFICE_LEGEND_SUBAGENT = "작은 캐릭터 = 서브에이전트";

/** 말풍선 문구(FR-007-AC2). 조립은 `lib/derive/actionLabel.ts`가 한다. */
export const ACTION_LABEL_PERMISSION = "권한 요청";
export function typingActionLabel(tool: string): string {
  return `타이핑 · ${tool}`;
}
export function readingActionLabel(tool: string): string {
  return `읽기 · ${tool}`;
}

// 04-4 수집 중단 배너 (SCR-04-4, FR-007-E1)
export function collectorDownBannerMessage(lastReceivedDateHm: string | null): string {
  return `hook 이벤트 수신 없음 · ${lastReceivedLabel(lastReceivedDateHm)}`;
}
export const COLLECTOR_DOWN_FOOTNOTE = "Claude Code 미실행 또는 컨테이너 재시작 · 캐릭터는 모두 회색 대기";

// 선택 패널 (SCR-03 오른쪽 360px)
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
export const PANEL_RECENT_EVENTS_EMPTY = "최근 이벤트 없음";
export const PANEL_RECENT_EVENTS_ERROR = "최근 이벤트를 불러오지 못했습니다";
export const RETRY_BUTTON_LABEL = "다시 시도";
export const EDIT_AGENT_BUTTON_LABEL = "정의 수정";
export const REMOVE_AGENT_BUTTON_LABEL = "제거";
export const EDIT_AGENT_BUSY_REASON = "작업 중에는 수정할 수 없습니다";
export const REMOVE_AGENT_BUSY_REASON = "작업 중에는 제거할 수 없습니다";
export const PANEL_FOOTNOTE_TRASH = "제거 = 휴지통(.jaystudio/trash/)으로 이동 · 원문 로그 보기 없음";
export const PANEL_FOOTNOTE_TERMINAL_PREFIX = "작업 지시는 상단 ";
export const PANEL_FOOTNOTE_TERMINAL_EMPHASIS = "팀장 호출";
export const PANEL_FOOTNOTE_TERMINAL_SUFFIX = "로 연 터미널에서 직접 한다 · ";
export function leadAgentCommand(lead: string): string {
  return `claude --agent ${lead}`;
}

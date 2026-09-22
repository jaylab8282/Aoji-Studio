/**
 * 화면 문구 상수 (conventions.md §2 MUST). ui-spec.md·final 문서의 문구를 글자 그대로 쓴다.
 * 컴포넌트는 이 파일의 상수만 쓰고 문자열을 직접 적지 않는다.
 */
import type { Status } from "../api/types";

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

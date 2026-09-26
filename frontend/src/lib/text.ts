/**
 * 화면 문구 상수 (conventions.md §2 MUST). ui-spec.md·final 문서의 문구를 글자 그대로 쓴다.
 * 컴포넌트는 이 파일의 상수만 쓰고 문자열을 직접 적지 않는다.
 */
import type { ImportRejectedReason, Role, Status } from "../api/types";
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
export const HELPER_MISSING_DIALOG_BODY = "helper/install.sh로 설치한 뒤 다시 시도하세요";
/** 도우미가 403으로 거부했을 때 버튼 옆에 붙는 확정 문구(FR-013-E2). */
export const HELPER_AUTH_FAILED_TEXT = "도우미 인증 실패 · 도우미를 다시 설치하세요";
/** 버튼을 누른 시점에 `registry.agents`에 팀장이 없을 때(FR-013-E4). 도우미를 호출하지 않는다. */
export const LEAD_GONE_TEXT = "팀장이 없습니다";
/**
 * 03 `팀장 호출 · 터미널 열기`가 표시·복사하는 명령(FR-013-AC2, ui-spec SCR-03).
 * 도우미에게는 이 문자열이 아니라 팀장 name만 보낸다(FR-013-AC6).
 */
export function leadSessionCommand(hostPath: string, leadName: string): string {
  return `cd "${hostPath}" && claude --agent ${leadName}`;
}

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
/**
 * FR-006-AC11 확정 문구. 치환값 뒤 조사는 병기 표기로 쓰고 받침을 판정하지 않는다
 * (ADR-39, conventions.md §2 MUST — 조사 보정 함수를 두지 않는다).
 */
export function floorDuplicateWarning(name: string): string {
  return `${name}이(가) 여러 워크플로우에 있습니다 · 구성 파일을 확인하세요`;
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

// 05·06 공통 팝업 (ui-spec.md SCR-05·SCR-06)
export const CANCEL_BUTTON_LABEL = "취소";
/** 05-3·06-6 확인 입력 라벨(ui-spec.md SCR-05-3·SCR-06-6 `확인을 위해 이름 입력`). */
export const CONFIRM_BY_NAME_INPUT_LABEL = "확인을 위해 이름 입력";

// SCR-05-L 워크플로우 추가 (FR-008)
export const WORKFLOW_ADD_TITLE = "워크플로우 추가";
/**
 * ui-spec.md SCR-05-L 제목 행: 데이터 출처 `정적`. 만들어질 파일 경로 규칙을 그대로 설명한다.
 * 와이어프레임 표기의 괄호는 ADR-33 (c) 정적 텍스트이므로 괄호 기호만 벗기고 낱말은 그대로 둔다.
 */
export const WORKFLOW_ADD_DESCRIPTION =
  "구성 파일 .jaystudio/teams/이름.json(팀장·팀원 목록)이 만들어집니다.";
export const WORKFLOW_NAME_LABEL = "이름";
export const WORKFLOW_NAME_PLACEHOLDER = "개발부서";
export const WORKFLOW_NAME_HINT = "이름 중복 불가 · 개수 제한 없음";
/** FR-008-AC2 사전 검증 문구(ui-spec.md SCR-05-L 이름 입력 행). */
export const WORKFLOW_NAME_RULE_MESSAGE = "1~40자, 한글·영문·숫자·공백·하이픈·언더스코어만";
export const WORKFLOW_DESCRIPTION_LABEL = "설명 (선택)";
export const WORKFLOW_DESCRIPTION_PLACEHOLDER = "한 줄 설명";
/** FR-008-AC3 안내 박스. */
export const WORKFLOW_ADD_LEAD_NOTICE =
  "만든 뒤 팀장 1명을 만들거나 가져오세요. 팀장이 없으면 층에 팀장 없음이 표시됩니다.";
export const WORKFLOW_ADD_SUBMIT_LABEL = "만들기";
export const WORKFLOW_ADD_SUBMIT_PENDING_LABEL = "만드는 중…";

// SCR-05-3 워크플로우 삭제 확인 (FR-017)
export function workflowDeleteTitle(name: string): string {
  return `${name} 워크플로우를 삭제할까요?`;
}
export function workflowDeleteConfigNote(name: string): string {
  return `구성 파일 .jaystudio/teams/${name}.json이 삭제됩니다`;
}
export const WORKFLOW_DELETE_CONFIRM_LABEL = "삭제 (이름 일치 시 활성)";
export const WORKFLOW_DELETE_CONFIRM_PENDING_LABEL = "삭제 중…";

// SCR-05-R 기존 에이전트 가져오기 (FR-009, 와이어프레임 p.6 오른쪽)
/** 대상 워크플로우가 정해지지 않았을 때의 제목(ui-spec.md SCR-05-R 제목 행 "워크플로우 미정이면"). */
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
  return `어느 워크플로우에도 없는 정의 파일 ${outsideCount}개 · 파일은 그대로 두고 소속만 지정`;
}
export const IMPORT_TARGET_WORKFLOW_LABEL = "대상 워크플로우";
/** 워크플로우가 0개일 때 드롭다운 자리에 놓는 안내(ui-spec.md SCR-05-R 드롭다운 행 `빈`). */
export const IMPORT_NO_WORKFLOW_NOTICE = "먼저 워크플로우를 추가하세요";
export const IMPORT_SEARCH_PLACEHOLDER = "이름·설명 검색";
export const IMPORT_SEARCH_NO_RESULTS_TEXT = "일치하는 에이전트가 없습니다";
/**
 * ADR-37: 검색은 표시 필터일 뿐이라 선택을 지우지 않는다. 지금 검색 결과에 없는 선택이
 * 1명 이상일 때만 검색 입력 아래에 이 줄을 그린다(0명이면 줄 자체를 그리지 않는다).
 * N은 값으로 치환한다(ADR-33 (a)).
 */
export function importHiddenSelectionNotice(hiddenCount: number): string {
  return `검색으로 가려진 선택 ${hiddenCount}명`;
}
export const IMPORT_CREATE_AGENT_BUTTON_LABEL = "+ 새로 만들기";
export const IMPORT_TABLE_COL_NAME = "이름 (name)";
export const IMPORT_TABLE_COL_DESCRIPTION = "설명 (description)";
export const IMPORT_TABLE_COL_ROLE = "역할";
/** 역할 드롭다운 선택지(ui-spec.md SCR-05-R 목록 표 `역할` 열). */
export const ROLE_OPTION_TEXT: Record<Role, string> = {
  lead: "팀장",
  member: "팀원",
};
/** 행마다 다른 역할 드롭다운을 가리키는 보조 이름(NFR-12). 보이는 문구는 옵션 글자다. */
export function importRoleSelectLabel(agentName: string): string {
  return `${agentName} ${IMPORT_TABLE_COL_ROLE}`;
}
/** FR-009-AC6: 워크플로우 밖 에이전트가 0명일 때 표 대신 놓는 안내. */
export const IMPORT_EMPTY_TEXT = "가져올 에이전트가 없습니다 · 새로 만들어 넣으세요";
export const IMPORT_NOTICE_LEAD =
  "팀장은 워크플로우당 1명이고 층의 첫 자리에 배치됩니다. 이미 팀장이 있으면 팀장 선택은 비활성.";
export const IMPORT_NOTICE_TRASH =
  "가져온 뒤 워크플로우에서 제거하면 정의 파일이 휴지통(.jaystudio/trash/)으로 이동합니다. 다른 워크플로우 소속 에이전트는 목록에 없습니다.";
/** FR-009-AC5: 선택 인원이 라벨에 들어간다(ADR-33 (a) 치환). 0명이면 비활성이다. */
export function importSubmitLabel(selectedCount: number): string {
  return `선택한 ${selectedCount}명 가져오기`;
}
export const IMPORT_SUBMIT_PENDING_LABEL = "가져오는 중…";
/**
 * FR-009-E2 거부 사유. ui-spec.md SCR-05-R 에러 영역이 `reason` 세 값의 문구를 모두 확정했다(ADR-36).
 */
export const IMPORT_REJECTED_REASON_TEXT: Record<ImportRejectedReason, string> = {
  ALREADY_ASSIGNED: "가져오는 사이 다른 워크플로우에 소속되었습니다",
  NOT_FOUND: "정의 파일이 없습니다 · 목록을 확인하세요",
  FORMAT_ERROR: "읽지 못한 정의 파일입니다 · 목록을 확인하세요",
};
export function importRejectedLine(agentName: string, reason: ImportRejectedReason): string {
  // 계약 밖 값(enum 불일치)이 오면 문장을 지어내지 않고 이름만 보여준다(ADR-36).
  const reasonText: string | undefined = IMPORT_REJECTED_REASON_TEXT[reason];
  return reasonText === undefined ? agentName : `${agentName}: ${reasonText}`;
}

// ── SCR-06 에이전트 만들기 · 수정 폼 (FR-010, FR-011, 와이어프레임 p.7 왼쪽) ──────────────
export const AGENT_FORM_CREATE_TITLE = "에이전트 만들기";
export const AGENT_FORM_EDIT_TITLE = "에이전트 수정";
/** 필수 입력 표시(와이어프레임 p.7: 이름·소속 워크플로우·설명에만 붙는다). */
export const REQUIRED_MARK_TEXT = "필수";
/**
 * 제목 옆 경로(ui-spec.md SCR-06 제목 행 `JayStudio/.claude/agents/...`).
 * 서버가 주는 `filePath`는 마운트 루트 기준 상대 경로이므로 앞에 프로젝트 폴더 이름을 붙인다(ADR-33 (a)).
 */
export function agentFilePathLabel(filePath: string): string {
  return `${WORKFLOWS_SUMMARY_PROJECT_LABEL}/${filePath}`;
}
export const AGENT_NAME_LABEL = "이름 (name)";
export const AGENT_NAME_HINT = "소문자와 하이픈만 · 중복 불가";
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
export const AGENT_WORKFLOW_HINT = "한 에이전트는 한 워크플로우에만 소속";
/** FR-011-AC3: 워크플로우 밖 에이전트를 수정할 때만 고를 수 있는 옵션. */
export const AGENT_WORKFLOW_NONE_OPTION = "(없음)";
export const AGENT_ROLE_LABEL = "역할";
export const AGENT_ROLE_HINT = "팀장은 워크플로우당 1명 · 층 첫 자리 · 이미 있으면 비활성";
/** FR-010-AC4 이유 줄(ADR-35 지정 지점). */
export function leadExistsReason(lead: string): string {
  return `이미 팀장이 있습니다 (${lead})`;
}
export const AGENT_DESCRIPTION_LABEL = "설명 (description)";
/** 와이어프레임 p.7 `[...]`의 (b) 입력 예시 — 괄호를 벗긴 문구를 placeholder로 쓴다(ADR-33). */
export const AGENT_DESCRIPTION_PLACEHOLDER = "언제 이 에이전트에게 일을 맡기는지";
export const AGENT_TOOLS_LABEL = "사용 도구 (tools)";
export const TOOLS_MODE_INHERIT_TEXT = "전체 상속";
export const TOOLS_MODE_EXPLICIT_TEXT = "직접 선택";
/** 와이어프레임 p.7 `[기타]`의 (c) 정적 텍스트 = 입력 라벨(ADR-33). */
export const AGENT_TOOLS_OTHER_LABEL = "기타";
/** FR-010-AC2 이유 줄(ADR-35 지정 지점). */
export const TOOLS_MODE_REQUIRED_REASON = "도구 방식을 고르세요";
/** 직접 선택 0개일 때 `사용 도구` 필드 아래 사유(api-spec.yaml `fields.tools`와 같은 문구). */
export const TOOLS_EXPLICIT_EMPTY_MESSAGE = "직접 선택은 1개 이상";
export const AGENT_BODY_LABEL = "지침 (본문 = 시스템 프롬프트)";
/** FR-011-AC1·AC2 각주. */
export const AGENT_FORM_FOOTNOTE =
  "이름 변경 시 파일명도 변경 · 폼에 없는 필드(permissionMode 등)는 기존 값 보존";
export const AGENT_FORM_SUBMIT_LABEL = "저장";
export const AGENT_FORM_SUBMIT_PENDING_LABEL = "저장 중…";
export const AGENT_REMOVE_FROM_WORKFLOW_BUTTON_LABEL = "워크플로우에서 제거";
/** `GET /api/agents/{name}` 404(ui-spec.md SCR-06 제목 행 에러 열). */
export const AGENT_FILE_NOT_FOUND_MESSAGE = "정의 파일이 없습니다 · 목록을 확인하세요";
export const CLOSE_BUTTON_LABEL = "닫기";
/** FR-010-AC6: 만들기 성공 뒤 02 상단에 8초 동안 남는 한 줄. */
export const AGENT_CREATED_RESTART_NOTICE =
  "Claude Code가 새 정의를 바로 인식하지 못하면 재시작이 필요할 수 있습니다";

// ── SCR-06-5 저장 충돌 (FR-011-AC4, 와이어프레임 p.7 오른쪽 위) ──────────────────────────
export const SAVE_CONFLICT_TITLE = "파일이 다른 곳에서 수정되었습니다";
/**
 * 조사가 붙는 대상이 치환값이 아니라 고정 접미 `.md`라 병기 표기 대상이 아니다 — ui-spec.md 문구 그대로 둔다(ADR-39).
 */
export function saveConflictBody(agentName: string, hhmmss: string): string {
  return `${agentName}.md이 이 창을 연 뒤 ${hhmmss}에 변경되었습니다. 저장하면 그 변경이 사라집니다.`;
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
export const AGENT_REMOVE_TRASH_NOTE =
  "정의 파일이 .jaystudio/trash/로 이동합니다 (소프트 삭제, 복구 가능).";
/** FR-012-AC3: 팀장을 제거할 때만 붙는 두 번째 안내 줄. */
export function agentRemoveLeadNote(workflowName: string): string {
  return `팀장을 제거하면 ${workflowName} 층에 팀장 없음이 표시됩니다.`;
}
export const AGENT_REMOVE_CONFIRM_LABEL = "제거 (이름 일치 시 활성)";
export const AGENT_REMOVE_CONFIRM_PENDING_LABEL = "제거 중…";
/** `DELETE /api/agents/{name}` 404(ui-spec.md SCR-06-6 에러 열). */
export const AGENT_ALREADY_REMOVED_MESSAGE = "이미 없는 에이전트입니다";

// ── SCR-07 설정 (FR-014, FR-001-AC4·AC5·E1·E2, FR-013-AC5, 와이어프레임 p.4) ──────────────
export const SETTINGS_TITLE = "설정";
/** 값 사이 구분점. ui-spec.md SCR-07 값 문구가 `A · B` 형태로 적은 자리에만 쓴다. */
export const MIDDLE_DOT_SEPARATOR = " · ";

// 카드 1 프로젝트 폴더
export const SETTINGS_PROJECT_CARD_TITLE = "프로젝트 폴더";
export const SETTINGS_READ_ONLY_BADGE = "읽기 전용";
export const SETTINGS_ROW_MOUNT_PATH = "마운트 폴더";
export const SETTINGS_ROW_AGENTS = "에이전트";
export const SETTINGS_ROW_SKILLS = "스킬";
export const SETTINGS_ROW_WRITABLE = "쓰기 권한";
export const SETTINGS_ROW_FORMAT_ERRORS = "형식 오류";
/** 경로(mono)와 뒤 설명은 화면에서 따로 그리고, 값 전체는 `<경로> · <설명>` 한 줄이다. */
export const SETTINGS_AGENTS_PATH = ".claude/agents/";
export const SETTINGS_SKILLS_PATH = ".claude/skills/";
export function settingsAgentsNote(agentCount: number): string {
  return `정의 ${agentCount}개`;
}
export function settingsSkillsNote(skillCount: number): string {
  return `${skillCount}개`;
}
export const SETTINGS_WRITABLE_TRUE_TEXT = "✓ agents 추가·수정·삭제 가능";
/** FR-001-E2. `쓰기 권한 없음`은 비활성 이유 줄(`WRITABLE_FALSE_REASON`)과 같은 글자다. */
export const SETTINGS_WRITABLE_FALSE_TEXT = `✗ ${WRITABLE_FALSE_REASON}`;
export function settingsFormatErrorsValue(count: number): string {
  return `! 읽지 못한 정의 파일 ${count} 개`;
}
export const SETTINGS_FORMAT_ERRORS_NONE_TEXT = "없음";
export const SETTINGS_PROJECT_FOOTNOTE = "폴더는 컨테이너 실행 시 마운트로 고정 · 웹에서 변경 불가";

// 카드 2 Claude 열기 (설명문은 D-F4 확정 문구)
export const SETTINGS_CLAUDE_CARD_TITLE = "Claude 열기";
export const SETTINGS_CLAUDE_CARD_DESCRIPTION =
  "02의 Claude 열기 · 기본 세션과 03의 팀장 호출 · 터미널 열기를 누르면 맥북 터미널이 열리고 프로젝트 폴더에서 claude가 실행됩니다.";
export const SETTINGS_ROW_TERMINAL_APP = "터미널 앱";
export const SETTINGS_ROW_DEFAULT_SESSION = "기본 세션";
export const SETTINGS_ROW_LEAD_SESSION = "팀장으로 열기";
export const SETTINGS_LEAD_SESSION_HINT =
  "도우미가 받는 값은 팀장 name 하나 · 소문자·숫자·하이픈만 허용";
export const SETTINGS_ROW_HELPER = "열기 도우미";
export const SETTINGS_HELPER_CHECKING_TEXT = "확인 중…";
export function settingsHelperInstalledText(hhmmss: string): string {
  return `설치됨 · 응답 확인 ${hhmmss}`;
}
export const SETTINGS_HELPER_MISSING_TEXT = "미설치 · helper/install.sh로 설치";
/** `GET /api/helper/token`이 null일 때(ui-spec.md SCR-07 `열기 도우미` 행). */
export const SETTINGS_HELPER_NO_TOKEN_TEXT = "미설치 · 토큰 파일 없음";
export const SETTINGS_TEST_OPEN_BUTTON_LABEL = "테스트로 열기 (도우미 설치 후)";
/** FR-013-AC10 이유 줄(ADR-35 지정 지점). */
export const HELPER_MISSING_REASON = "도우미 미설치";

// 카드 3 수집
export const SETTINGS_COLLECT_CARD_TITLE = "수집";
export const SETTINGS_ROW_COLLECT_URL = "수집 주소";
export const SETTINGS_ROW_HOOK = "hook 설정";
export const SETTINGS_HOOK_SETTINGS_PATH = ".claude/settings.json";
export const SETTINGS_HOOK_CONFIGURED_TEXT = "설정됨";
export const SETTINGS_HOOK_MISSING_TEXT = "없음";
export const SETTINGS_COPY_HOOK_EXAMPLE_LABEL = "설정 예시 복사";
export const SETTINGS_ROW_TEAMS = "워크플로우 구성";
export const SETTINGS_ROW_TRASH = "휴지통";
export const SETTINGS_ROW_RETENTION = "이벤트 보존";
export const SETTINGS_TEAMS_NOTE = "팀장·팀원 목록";
export const SETTINGS_TRASH_NOTE = "제거한 에이전트 보관";
export function settingsRetentionValue(retentionDays: number): string {
  return `${retentionDays}일`;
}

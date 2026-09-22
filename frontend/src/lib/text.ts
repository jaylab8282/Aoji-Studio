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

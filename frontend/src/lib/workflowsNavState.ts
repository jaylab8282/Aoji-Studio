/**
 * 06 팝업 → 02 화면으로 한 번만 넘기는 표시 신호(react-router `location.state`).
 * URL·스냅샷에 담을 값이 아니라 "직전 동작의 결과로 02가 한 번 보여줄 것"이라 라우터 state로 넘긴다.
 * - `agentCreated`: FR-010-AC6 재시작 안내 줄
 * - `scrollToFormatErrors`: FR-011-E3 형식 오류 파일 수정 시도 → 02의 04-6 목록으로 스크롤
 */
export interface WorkflowsNavState {
  agentCreated?: true;
  scrollToFormatErrors?: true;
}

export const AGENT_CREATED_NAV_STATE: WorkflowsNavState = { agentCreated: true };
export const FORMAT_ERRORS_NAV_STATE: WorkflowsNavState = { scrollToFormatErrors: true };

/** `location.state`는 `unknown`이므로 좁혀서 읽는다(conventions.md §3 `any` 금지). */
export function readWorkflowsNavState(state: unknown): WorkflowsNavState {
  if (typeof state !== "object" || state === null) return {};
  const record = state as Record<string, unknown>;
  return {
    ...(record.agentCreated === true ? { agentCreated: true as const } : {}),
    ...(record.scrollToFormatErrors === true ? { scrollToFormatErrors: true as const } : {}),
  };
}

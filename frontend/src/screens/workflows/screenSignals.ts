/**
 * 06 팝업이 라우터 state로 넘긴 신호를 02가 한 번 처리한다(`lib/workflowsNavState.ts`).
 * - `useAgentCreatedNotice`: FR-010-AC6 재시작 안내 줄을 8초 동안 보여준다.
 * - `useFormatErrorScroll`: FR-011-E3 형식 오류 파일 수정 시도 → 04-6 목록으로 스크롤한다.
 *
 * 같은 라우트에 머문 채 navigate하는 경우(`/workflows?dialog=agent-new` → `/workflows`)에도
 * 화면이 다시 마운트되지 않으므로 `location.key`가 바뀔 때마다 신호를 다시 읽는다.
 */
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { readWorkflowsNavState } from "../../lib/workflowsNavState";

/** ui-spec.md SCR-06 "저장 후 안내 (토스트가 아닌 02 상단 한 줄, 8초)"의 지속 시간(conventions.md §7 MUST). */
export const AGENT_CREATED_NOTICE_MS = 8000;

export function useAgentCreatedNotice(): boolean {
  const location = useLocation();
  const created = readWorkflowsNavState(location.state).agentCreated === true;
  // 표시 여부는 렌더 중에 계산하고, 8초 뒤에 그 이동 키를 "이미 보여준 것"으로 기록한다.
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const visible = created && dismissedKey !== location.key;

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setDismissedKey(location.key), AGENT_CREATED_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [visible, location.key]);

  return visible;
}

export function useFormatErrorScroll(elementId: string): void {
  const location = useLocation();
  const scrollTo = readWorkflowsNavState(location.state).scrollToFormatErrors === true;

  useEffect(() => {
    if (!scrollTo) return;
    const element = document.getElementById(elementId);
    // jsdom에는 scrollIntoView가 없으므로 있을 때만 부른다.
    if (element && typeof element.scrollIntoView === "function") element.scrollIntoView();
  }, [scrollTo, location.key, elementId]);
}

/**
 * 02 층 카드 헤더 요약 집계 (ui-spec.md SCR-02 층 카드 행, FR-006-AC5). 순수 함수(ADR-15).
 * 워크플로우 단위의 작업 상태(칩)는 만들지 않는다. 에이전트 수 집계만 돌려주고,
 * 문구 조립은 `lib/text.ts`의 `floorSummaryLabel`이 맡는다(conventions.md §2·§3 MUST).
 */
import type { AgentLive, Workflow } from "../../api/types";
import { countWorkflowStatuses } from "./counts";

export interface FloorSummary {
  running: number;
  waiting: number;
  /** running·waiting이 모두 0이면 층 요약은 `모두 대기`다. */
  allIdle: boolean;
}

export function floorSummary(workflow: Workflow, liveAgents: Record<string, AgentLive>): FloorSummary {
  const counts = countWorkflowStatuses(workflow, liveAgents);
  return {
    running: counts.running,
    waiting: counts.waiting,
    allIdle: counts.running === 0 && counts.waiting === 0,
  };
}

/**
 * 층 그리드 배치: 인원이 많은 워크플로우는 가로 3칸(전체 폭)을 차지한다.
 * ui-spec.md SCR-02 "층 그리드 배치" 행, FR-006-AC2. 순수 함수.
 */

const WIDE_THRESHOLD = 7;
const WIDE_SPAN = 3;
const NARROW_SPAN = 1;

/** 인원(팀장+팀원 수)이 7 이상이면 3칸, 6 이하면 1칸. */
export function floorColumnSpan(agentCount: number): number {
  return agentCount >= WIDE_THRESHOLD ? WIDE_SPAN : NARROW_SPAN;
}

/**
 * 03 선택 패널의 선택 에이전트 결정 (FR-007-AC4, ui-spec.md SCR-03 패널 name 행). 순수 함수(ADR-15).
 * 우선순위: URL `?agent=` → 팀장 → 첫 자리. 어느 것도 없으면 null(패널 본문 `선택할 에이전트가 없습니다`).
 * 오피스에 칸이 없는 이름(`?agent=`가 다른 층 에이전트를 가리키는 경우)은 무시한다.
 */

export interface SelectedAgentInput {
  /** URL search param `agent`. 없으면 null. */
  agentParam: string | null;
  lead: string | null;
  /** 오피스 칸에 있는 에이전트 name(팀장 첫 자리, 나머지 이름순). */
  seatAgentNames: string[];
}

export function selectedAgentName({ agentParam, lead, seatAgentNames }: SelectedAgentInput): string | null {
  if (agentParam !== null && seatAgentNames.includes(agentParam)) return agentParam;
  if (lead !== null && seatAgentNames.includes(lead)) return lead;
  return seatAgentNames[0] ?? null;
}

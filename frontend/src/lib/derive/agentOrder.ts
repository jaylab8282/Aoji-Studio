/**
 * 에이전트 정렬: 팀장이 첫 자리, 나머지는 name 단순 문자열 오름차순(`<` 비교, `localeCompare` 아님).
 * ui-spec.md SCR-02 층 안 책상, SCR-03 오피스 그리드에서 공용으로 쓴다. FR-006-AC1, FR-007-AC1.
 * 순수 함수(architecture.md ADR-15).
 */

export interface AgentOrderInput {
  lead: string | null;
  members: string[];
}

export function agentOrder({ lead, members }: AgentOrderInput): string[] {
  const rest = [...members].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return lead ? [lead, ...rest] : rest;
}

/**
 * 05-R 기존 에이전트 가져오기의 파생 계산 (ui-spec.md SCR-05-R, FR-009). 순수 함수(ADR-15,
 * conventions.md §3 Frontend MUST: 정렬·집계·라벨은 컴포넌트가 아니라 여기서 한다).
 */
import type { AgentDef, ImportMemberRequestItem, Role } from "../../api/types";

/**
 * FR-009-AC1: 목록에는 워크플로우 밖 에이전트(`workflow === null`)만 name 오름차순으로 나온다.
 * 정렬은 `agentOrder.ts`와 같은 단순 문자열 비교(`<`)를 쓴다.
 */
export function outsideAgents(agents: AgentDef[]): AgentDef[] {
  return agents
    .filter((agent) => agent.workflow === null)
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** 표 `설명 (description)` 열은 첫 줄만 보여준다(ui-spec.md SCR-05-R 목록 표). */
export function descriptionFirstLine(description: string): string {
  return description.split("\n")[0]?.trim() ?? "";
}

export interface LeadOptionInput {
  /** 대상 워크플로우의 `lead`. 대상이 아직 없으면 null. */
  targetLead: string | null;
  /** 이 목록에서 이미 `팀장`을 고른 행의 name. 없으면 null. */
  leadSelectedBy: string | null;
  /** 판정할 행의 name. */
  rowName: string;
}

/**
 * FR-009-AC4: 대상 워크플로우에 팀장이 있으면 모든 행의 `팀장`이 비활성이다.
 * FR-009-E1 사전 방지: 한 행이 `팀장`이면 다른 행의 `팀장`도 비활성이다(자기 행은 유지).
 */
export function isLeadOptionDisabled({ targetLead, leadSelectedBy, rowName }: LeadOptionInput): boolean {
  if (targetLead !== null) return true;
  return leadSelectedBy !== null && leadSelectedBy !== rowName;
}

/** 역할 상태에서 `팀장`을 고른 행을 찾는다(없으면 null). 목록 순서의 첫 행이 기준이다. */
export function leadSelectedBy(names: string[], roles: Record<string, Role | undefined>): string | null {
  return names.find((name) => roles[name] === "lead") ?? null;
}

/**
 * `POST /api/workflows/{workflow}/members` 요청 본문의 `members`를 만든다.
 * 체크한 행만 담고 역할 기본값은 `팀원`이다(ui-spec.md SCR-05-R 목록 표).
 */
export function toImportMembers(
  selectedNames: string[],
  roles: Record<string, Role | undefined>,
): ImportMemberRequestItem[] {
  return selectedNames.map((name) => ({ name, role: roles[name] ?? "member" }));
}

/**
 * ADR-37: 검색은 표시 필터일 뿐이라 선택을 지우지 않는다. 선택한 name 중 지금 검색 결과(표시 행)에
 * 없는 수를 센다. 0이면 안내 줄을 그리지 않는다(ui-spec.md SCR-05-R 안내 줄 행).
 */
export function hiddenSelectedCount(selectedNames: string[], visibleAgents: AgentDef[]): number {
  const visible = new Set(visibleAgents.map((agent) => agent.name));
  return selectedNames.filter((name) => !visible.has(name)).length;
}

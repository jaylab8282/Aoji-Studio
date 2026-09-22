/**
 * 상태(running/waiting/idle) 집계 (architecture.md ADR-15, FR-005-AC1·AC2, FR-006-AC5).
 * 순수 함수. 서버는 원천 데이터만 주고 집계는 여기서 한다.
 */
import type { AgentLive, Registry, Status, Workflow } from "../../api/types";

export interface StatusCounts {
  running: number;
  waiting: number;
  idle: number;
}

function emptyCounts(): StatusCounts {
  return { running: 0, waiting: 0, idle: 0 };
}

function countStatusesFor(names: string[], liveAgents: Record<string, AgentLive>): StatusCounts {
  const counts = emptyCounts();
  for (const name of names) {
    const status: Status = liveAgents[name]?.status ?? "idle";
    counts[status] += 1;
  }
  return counts;
}

/** 01 KPI 1·상태 막대: registry의 정상 정의 파일 전체 기준 집계(FR-005-AC1·AC2). */
export function countAllStatuses(registry: Registry, liveAgents: Record<string, AgentLive>): StatusCounts {
  const names = registry.agents.map((agent) => agent.name);
  return countStatusesFor(names, liveAgents);
}

/** 02 층 카드 요약: 한 워크플로우의 팀장+팀원 기준 집계(FR-006-AC5). */
export function countWorkflowStatuses(workflow: Workflow, liveAgents: Record<string, AgentLive>): StatusCounts {
  const names: string[] = [];
  if (workflow.lead) names.push(workflow.lead);
  names.push(...workflow.members);
  return countStatusesFor(names, liveAgents);
}

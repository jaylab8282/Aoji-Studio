/**
 * 01 대표 워크플로우 3개 선정·정렬 (ui-spec.md SCR-01, FR-005-AC3·AC4, architecture.md ADR-15).
 * 순수 함수. 정렬: 활성 워크플로우(실행 중·권한 대기 에이전트 있음) 우선 → 소속 에이전트 중 최근 이벤트 내림차순
 * → 이벤트 없음이면 이름 오름차순. 최대 3개.
 */
import type { AgentLive, EventRow, Live, Registry, Workflow } from "../../api/types";
import { countWorkflowStatuses, type StatusCounts } from "./counts";
import { workflowChip, type WorkflowChipResult } from "./workflowChip";

export type FeaturedWorkflowActivity =
  | { kind: "recent"; title: string; summary: string }
  | { kind: "last"; at: string }
  | { kind: "none" };

export interface FeaturedWorkflow {
  name: string;
  description: string;
  chip: WorkflowChipResult;
  /** 카드 테두리 색 계산용(ADR-24 `workflowCardBorder`). 칩과 우선순위가 다르므로 원본 집계를 그대로 넘긴다. */
  counts: StatusCounts;
  agentCount: number;
  skillCount: number;
  activity: FeaturedWorkflowActivity;
}

interface RankedWorkflow extends FeaturedWorkflow {
  active: boolean;
  latestAt: number | null;
}

const MAX_FEATURED = 3;

function memberNames(workflow: Workflow): string[] {
  const names: string[] = [];
  if (workflow.lead) names.push(workflow.lead);
  names.push(...workflow.members);
  return names;
}

function latestEvent(names: string[], liveAgents: Record<string, AgentLive>): EventRow | null {
  let best: EventRow | null = null;
  let bestTime = -Infinity;
  for (const name of names) {
    const event = liveAgents[name]?.lastEvent ?? null;
    if (event === null) continue;
    const time = new Date(event.at).getTime();
    if (time > bestTime) {
      bestTime = time;
      best = event;
    }
  }
  return best;
}

function rank(workflow: Workflow, registry: Registry, live: Live): RankedWorkflow {
  const names = memberNames(workflow);
  const counts = countWorkflowStatuses(workflow, live.agents);
  const active = counts.running > 0 || counts.waiting > 0;
  const latest = latestEvent(names, live.agents);
  const activity: FeaturedWorkflowActivity =
    latest === null ? { kind: "none" } : active ? { kind: "recent", title: latest.title, summary: latest.summary } : { kind: "last", at: latest.at };

  return {
    name: workflow.name,
    description: workflow.description,
    chip: workflowChip(counts),
    counts,
    agentCount: names.length,
    skillCount: registry.skillCount,
    activity,
    active,
    latestAt: latest === null ? null : new Date(latest.at).getTime(),
  };
}

function compare(a: RankedWorkflow, b: RankedWorkflow): number {
  if (a.active !== b.active) return a.active ? -1 : 1;
  if (a.latestAt !== b.latestAt) {
    if (a.latestAt === null) return 1;
    if (b.latestAt === null) return -1;
    return b.latestAt - a.latestAt;
  }
  if (a.name === b.name) return 0;
  return a.name < b.name ? -1 : 1;
}

export function featuredWorkflows(registry: Registry, live: Live): FeaturedWorkflow[] {
  const ranked = registry.workflows.map((workflow) => rank(workflow, registry, live));
  ranked.sort(compare);
  return ranked.slice(0, MAX_FEATURED).map((workflow) => ({
    name: workflow.name,
    description: workflow.description,
    chip: workflow.chip,
    counts: workflow.counts,
    agentCount: workflow.agentCount,
    skillCount: workflow.skillCount,
    activity: workflow.activity,
  }));
}

/**
 * 검색 매칭 (ui-spec.md SCR-02 검색 입력, FR-006-AC8). 순수 함수, 대소문자 무시 부분 일치.
 * 워크플로우 이름이 일치하면 층 전체를 보여주고, 에이전트 이름만 일치하면 그 층에서 일치하는
 * 에이전트만 보여준다(검색어가 비어 있으면 전체를 보여준다).
 */
import type { Workflow } from "../../api/types";

export function matchesQuery(text: string, query: string): boolean {
  const trimmed = query.trim();
  if (trimmed === "") return true;
  return text.toLowerCase().includes(trimmed.toLowerCase());
}

export interface WorkflowSearchMatch {
  workflow: Workflow;
  /** null이면 워크플로우 이름이 일치해 층 전체를 보여준다. 배열이면 그 안의 에이전트 이름만 보여준다. */
  matchedAgentNames: string[] | null;
}

export function searchWorkflows(workflows: Workflow[], query: string): WorkflowSearchMatch[] {
  const trimmed = query.trim();
  if (trimmed === "") {
    return workflows.map((workflow) => ({ workflow, matchedAgentNames: null }));
  }

  const results: WorkflowSearchMatch[] = [];
  for (const workflow of workflows) {
    if (matchesQuery(workflow.name, trimmed)) {
      results.push({ workflow, matchedAgentNames: null });
      continue;
    }
    const candidateNames = workflow.lead ? [workflow.lead, ...workflow.members] : workflow.members;
    const matchedAgentNames = candidateNames.filter((name) => matchesQuery(name, trimmed));
    if (matchedAgentNames.length > 0) {
      results.push({ workflow, matchedAgentNames });
    }
  }
  return results;
}

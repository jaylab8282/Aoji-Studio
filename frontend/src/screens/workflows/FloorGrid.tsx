/**
 * ui-spec.md SCR-02 층 그리드(3열). 인원 많은 층은 가로 전체(FR-006-AC2, `workflowLayout.ts`).
 * 검색 결과 0건이면 "검색 결과가 없습니다"(FR-006-AC8). 워크플로우 0개·에이전트 폴더 없음은
 * 상위 `WorkflowsScreen`이 04-7·04-5로 대체하므로 이 컴포넌트는 다루지 않는다.
 */
import type { AgentDef, Live, Workflow } from "../../api/types";
import { floorColumnSpan } from "../../lib/derive/workflowLayout";
import type { WorkflowSearchMatch } from "../../lib/derive/search";
import { SEARCH_NO_RESULTS_TEXT } from "../../lib/text";
import { Floor } from "./Floor";

interface FloorGridProps {
  results: WorkflowSearchMatch[];
  registryAgents: AgentDef[];
  live: Live;
  writable: boolean;
}

function agentCountOf(workflow: Workflow): number {
  return (workflow.lead ? 1 : 0) + workflow.members.length;
}

export function FloorGrid({ results, registryAgents, live, writable }: FloorGridProps) {
  if (results.length === 0) {
    return <p className="text-body text-text-secondary">{SEARCH_NO_RESULTS_TEXT}</p>;
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      {results.map(({ workflow, matchedAgentNames }) => (
        <div key={workflow.name} className={floorColumnSpan(agentCountOf(workflow)) === 3 ? "col-span-3" : "col-span-1"}>
          <Floor
            workflow={workflow}
            registryAgents={registryAgents}
            live={live}
            writable={writable}
            matchedAgentNames={matchedAgentNames}
          />
        </div>
      ))}
    </div>
  );
}

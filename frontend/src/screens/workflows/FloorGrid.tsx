/**
 * ui-spec.md SCR-02 층 그리드: 가로형 3열, 세로형 2열(`portrait:`, ADR-66). 인원(팀장 포함) 7명 이상 층은 한 줄 전체 폭
 * (FR-006-AC2, `floorLayout.ts`). 층은 위에 붙고 자기 높이만 쓴다(`items-start`). 검색 결과 0건이면 `검색 결과가 없습니다`(FR-006-AC8).
 * 워크플로우 0개·에이전트 폴더 없음은 상위 `WorkflowsScreen`이 04-7·04-5로 대체하므로 이 컴포넌트는 다루지 않는다.
 */
import type { AgentDef, Live, Workflow } from "../../api/types";
import { floorColumnSpan } from "../../lib/derive/floorLayout";
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
    return <p className="text-body text-text-muted">{SEARCH_NO_RESULTS_TEXT}</p>;
  }

  return (
    <div data-testid="floor-grid" className="grid grid-cols-3 items-start gap-3 portrait:grid-cols-2">
      {results.map(({ workflow, matchedAgentNames }) => (
        <div
          key={workflow.name}
          className={`min-w-0 ${floorColumnSpan(agentCountOf(workflow)) === 3 ? "col-span-full" : ""}`}
        >
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

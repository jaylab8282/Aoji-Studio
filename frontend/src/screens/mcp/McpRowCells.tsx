/**
 * ui-spec SCR-09 행 한 줄 요약 칸(펼침 버튼 다음): 이름(`09-?` 고정폭 500 + 말줄임 + 활성 칩) · 정의 위치 칩들(`09-6`, `호출 기록만` 점선 칩) · `사용 에이전트 N명`(`09-12`).
 */
import type { McpLocation, McpServer } from "../../api/types";
import { UsedAgentsButton } from "../../components/data/UsedAgentsButton";
import { Chip } from "../../components/ui/Chip";
import {
  MCP_ACTIVE_CHIP,
  MCP_INACTIVE_CHIP,
  MCP_LOCATION_CALLED_ONLY,
  MCP_LOCATION_GLOBAL,
  MCP_LOCATION_PROJECT,
  mcpLocationAgent,
  mcpLocationPlugin,
} from "../../lib/text";

function locationLabel(location: McpLocation): string {
  switch (location.kind) {
    case "project":
      return MCP_LOCATION_PROJECT;
    case "global":
      return MCP_LOCATION_GLOBAL;
    case "plugin":
      return mcpLocationPlugin(location.detail);
    case "agent":
      return mcpLocationAgent(location.detail);
    default:
      return MCP_LOCATION_CALLED_ONLY;
  }
}

interface McpRowCellsProps {
  server: McpServer;
  expanded: boolean;
  detailId: string;
  onToggle: () => void;
}

export function McpRowCells({ server, expanded, detailId, onToggle }: McpRowCellsProps) {
  return (
    <>
      <div className="flex min-w-0 items-center gap-2">
        <b data-clamp title={server.name} className="min-w-0 truncate font-mono font-medium text-text">
          {server.name}
        </b>
        {server.active === null ? null : <Chip tone="outline">{server.active ? MCP_ACTIVE_CHIP : MCP_INACTIVE_CHIP}</Chip>}
      </div>
      <div data-wf="09-6" className="flex flex-wrap gap-1">
        {server.locations.map((location) => (
          <Chip key={`${location.kind}:${location.detail ?? ""}`} tone={location.kind === "called-only" ? "dash" : "neutral"}>
            {locationLabel(location)}
          </Chip>
        ))}
      </div>
      <div data-wf="09-12">
        <UsedAgentsButton count={server.usedAgentCount} expanded={expanded} onToggle={onToggle} controls={detailId} />
      </div>
    </>
  );
}

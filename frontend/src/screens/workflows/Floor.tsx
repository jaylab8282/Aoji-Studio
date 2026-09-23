/**
 * ui-spec.md SCR-02 층 카드(워크플로우별). FR-006-AC1·AC3·AC5·AC9(로비는 별도 컴포넌트)·AC11·AC12,
 * FR-017-AC1, FR-001-E2. 그리드 배치(span, FR-006-AC2)는 상위 `FloorGrid`가 맡는다.
 */
import { useNavigate } from "react-router-dom";
import type { AgentDef, Live, Workflow } from "../../api/types";
import { DeskSprite } from "../../components/pixel/DeskSprite";
import { Button } from "../../components/ui/Button";
import { Chip } from "../../components/ui/Chip";
import { agentOrder } from "../../lib/derive/agentOrder";
import { floorSummary } from "../../lib/derive/floorSummary";
import { workflowCardBorder } from "../../lib/derive/workflowCardBorder";
import { floorColumnSpan } from "../../lib/derive/workflowLayout";
import { useDialogNavigate } from "../../lib/dialogNavigate";
import {
  FLOOR_CREATE_BUTTON_LABEL,
  FLOOR_DELETE_BUTTON_LABEL,
  FLOOR_DELETE_DISABLED_REASON,
  FLOOR_DETAIL_BUTTON_LABEL,
  FLOOR_EMPTY_TEXT,
  FLOOR_IMPORT_BUTTON_LABEL,
  FLOOR_NO_LEAD_TEXT,
  FLOOR_NO_LEAD_WARNING,
  WRITABLE_FALSE_REASON,
  floorDuplicateWarning,
  floorMemberCountLabel,
  floorSummaryLabel,
} from "../../lib/text";

interface FloorProps {
  workflow: Workflow;
  registryAgents: AgentDef[];
  live: Live;
  writable: boolean;
  /** null이면 검색으로 걸러지지 않은 상태(전체 표시). 배열이면 그 이름들만 책상을 보여준다. */
  matchedAgentNames: string[] | null;
}

export function Floor({ workflow, registryAgents, live, writable, matchedAgentNames }: FloorProps) {
  const navigate = useNavigate();
  const openDialog = useDialogNavigate();

  const allNames = workflow.lead ? [workflow.lead, ...workflow.members] : [...workflow.members];
  const nameToAgent = new Map(registryAgents.map((agent) => [agent.name, agent] as const));
  const duplicateNames = allNames.filter((name) => (nameToAgent.get(name)?.duplicateWorkflows.length ?? 0) > 0);

  // 중복 소속 에이전트는 `agent.workflow`(첫 층)에만 책상을 둔다(FR-006-AC11).
  const canonicalLead =
    workflow.lead !== null && nameToAgent.get(workflow.lead)?.workflow === workflow.name ? workflow.lead : null;
  const canonicalMembers = workflow.members.filter((name) => nameToAgent.get(name)?.workflow === workflow.name);
  const canonicalOrder = agentOrder({ lead: canonicalLead, members: canonicalMembers });
  const deskNames =
    matchedAgentNames === null ? canonicalOrder : canonicalOrder.filter((name) => matchedAgentNames.includes(name));

  const summary = floorSummary(workflow, live.agents);
  const hasLead = workflow.lead !== null;
  // 테두리 색은 01·02 공용 규칙 하나로만 정한다(ADR-24, conventions.md §7 MUST).
  const borderClass = workflowCardBorder({
    running: summary.running,
    waiting: summary.waiting,
    leadMissing: !hasLead,
  });

  // 책상 열은 층 카드 폭을 균등 분할한다(기준 PNG 02: span-3 = 9열, span-1 = 4열).
  // 열 수는 그리드 span에서 파생하며 가로 간격은 두지 않는다 — 열 폭이 곧 책상 pitch다.
  const deskGridClass = floorColumnSpan(allNames.length) === 3 ? "grid-cols-9" : "grid-cols-4";

  const deleteDisabledReason = !writable
    ? WRITABLE_FALSE_REASON
    : workflow.rawMemberCount > 0
      ? FLOOR_DELETE_DISABLED_REASON
      : undefined;

  return (
    <div
      className={`h-full rounded-card border ${borderClass} bg-card-alt p-card flex flex-col gap-3`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="text-section font-semibold text-text">{workflow.name}</h3>
          <Chip>{floorMemberCountLabel(allNames.length)}</Chip>
          {hasLead ? (
            <span className="text-aux text-text-secondary">{floorSummaryLabel(summary)}</span>
          ) : (
            <span className="text-aux text-danger">{FLOOR_NO_LEAD_TEXT}</span>
          )}
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabledReason={writable ? undefined : WRITABLE_FALSE_REASON}
            onClick={() => openDialog({ dialog: "import", workflow: workflow.name })}
          >
            {FLOOR_IMPORT_BUTTON_LABEL}
          </Button>
          <Button
            variant="add"
            size="sm"
            disabledReason={writable ? undefined : WRITABLE_FALSE_REASON}
            onClick={() => openDialog({ dialog: "agent-new", workflow: workflow.name })}
          >
            {FLOOR_CREATE_BUTTON_LABEL}
          </Button>
          <Button
            variant="terminal"
            size="sm"
            onClick={() => navigate(`/workflows/${encodeURIComponent(workflow.name)}`)}
          >
            {FLOOR_DETAIL_BUTTON_LABEL}
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabledReason={deleteDisabledReason}
            onClick={() => openDialog({ dialog: "workflow-delete", workflow: workflow.name })}
          >
            {FLOOR_DELETE_BUTTON_LABEL}
          </Button>
        </div>
      </div>

      {hasLead ? null : (
        <p className="rounded-control bg-danger-soft px-3 py-2 text-aux text-danger">{FLOOR_NO_LEAD_WARNING}</p>
      )}

      {duplicateNames.map((name) => (
        <p key={name} className="rounded-control bg-danger-soft px-3 py-2 text-aux text-danger">
          {floorDuplicateWarning(name)}
        </p>
      ))}

      {canonicalOrder.length === 0 ? (
        <p className="text-body text-text-secondary">{FLOOR_EMPTY_TEXT}</p>
      ) : deskNames.length === 0 ? null : (
        <div className={`rounded-control bg-inset p-card grid ${deskGridClass} justify-items-center gap-y-2`}>
          {deskNames.map((name) => {
            const agentLive = live.agents[name];
            return (
              <button
                key={name}
                type="button"
                className="rounded-control p-1 hover:bg-selected"
                onClick={() =>
                  navigate(`/workflows/${encodeURIComponent(workflow.name)}?agent=${encodeURIComponent(name)}`)
                }
              >
                <DeskSprite
                  name={name}
                  status={agentLive?.status ?? "idle"}
                  isLead={name === canonicalLead}
                  parentLabel={agentLive?.parentLabel ?? null}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

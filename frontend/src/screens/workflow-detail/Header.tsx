/**
 * ui-spec.md SCR-03 헤더: `‹` → 이름 → `에이전트 N · 스킬 N` → 워크플로우 칩 → 팀장 →
 * 오른쪽 `팀장 호출 · 터미널 열기`. FR-007-AC8·AC9, FR-013-AC2·AC4.
 *
 * 도우미 호출(GET /api/helper/token → POST helperUrl + /open, 무응답 시 HelperMissingDialog)은
 * T-021 범위다. 팀장이 없으면 여기서 이미 비활성 + `팀장 없음`을 보여준다(FR-007-AC8, FR-013-AC4).
 */
import { useNavigate } from "react-router-dom";
import type { AgentLive, Workflow } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { MonoText } from "../../components/ui/MonoText";
import { WorkflowChip } from "../../components/ui/WorkflowChip";
import { countWorkflowStatuses } from "../../lib/derive/counts";
import { workflowChip } from "../../lib/derive/workflowChip";
import {
  BACK_TO_WORKFLOWS_LABEL,
  FLOOR_NO_LEAD_TEXT,
  LEAD_BADGE_TEXT,
  LEAD_TERMINAL_BUTTON_LABEL,
  workflowCardCountsLabel,
} from "../../lib/text";

interface HeaderProps {
  workflow: Workflow;
  skillCount: number;
  liveAgents: Record<string, AgentLive>;
}

export function Header({ workflow, skillCount, liveAgents }: HeaderProps) {
  const navigate = useNavigate();
  const agentCount = (workflow.lead === null ? 0 : 1) + workflow.members.length;
  const counts = countWorkflowStatuses(workflow, liveAgents);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      <Button variant="secondary" aria-label={BACK_TO_WORKFLOWS_LABEL} onClick={() => navigate("/workflows")}>
        <span aria-hidden="true">‹</span>
      </Button>
      <h1 className="text-title font-bold text-text">{workflow.name}</h1>
      <p className="text-body text-text-secondary">{workflowCardCountsLabel(agentCount, skillCount)}</p>
      <WorkflowChip result={workflowChip(counts)} />
      {workflow.lead === null ? (
        <p className="text-body text-danger">{FLOOR_NO_LEAD_TEXT}</p>
      ) : (
        <p className="flex items-center gap-1.5 text-body text-text-secondary">
          {LEAD_BADGE_TEXT}
          <MonoText>{workflow.lead}</MonoText>
        </p>
      )}
      <span className="ml-auto">
        <Button variant="terminal" disabledReason={workflow.lead === null ? FLOOR_NO_LEAD_TEXT : undefined}>
          <span aria-hidden="true" className="mr-2">
            {">_"}
          </span>
          {LEAD_TERMINAL_BUTTON_LABEL}
        </Button>
      </span>
    </div>
  );
}

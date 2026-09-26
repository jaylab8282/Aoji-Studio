/**
 * ui-spec.md SCR-03 헤더: `‹` → 이름 → `에이전트 N · 스킬 N` → 워크플로우 칩 → 팀장 →
 * 오른쪽 `팀장 호출 · 터미널 열기`. FR-007-AC8·AC9, FR-013-AC2·AC4·AC6·AC9, FR-013-E2~E4.
 *
 * 도우미에는 `{target:'lead', leadName}`만 보낸다(FR-013-AC6). 화면에 보여주고 복사하는 명령
 * `cd "<hostPath>" && claude --agent <lead>`은 프론트가 조립하지만 도우미에는 보내지 않는다.
 * 팀장이 없으면 여기서 이미 비활성 + `팀장 없음`을 보여준다(FR-007-AC8, FR-013-AC4).
 * 누른 시점에 `registry.agents`에서 팀장이 사라졌으면 호출하지 않고 `팀장이 없습니다`만 남긴다(FR-013-E4).
 */
import { useNavigate } from "react-router-dom";
import type { AgentDef, AgentLive, Workflow } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { MonoText } from "../../components/ui/MonoText";
import { WorkflowChip } from "../../components/ui/WorkflowChip";
import { HelperMissingDialog } from "../../dialogs/helper-missing/HelperMissingDialog";
import { useHelperOpen } from "../../dialogs/helper-missing/useHelperOpen";
import { countWorkflowStatuses } from "../../lib/derive/counts";
import { workflowChip } from "../../lib/derive/workflowChip";
import {
  BACK_TO_WORKFLOWS_LABEL,
  FLOOR_NO_LEAD_TEXT,
  LEAD_BADGE_TEXT,
  LEAD_GONE_TEXT,
  LEAD_TERMINAL_BUTTON_LABEL,
  leadSessionCommand,
  workflowCardCountsLabel,
} from "../../lib/text";

interface HeaderProps {
  workflow: Workflow;
  skillCount: number;
  liveAgents: Record<string, AgentLive>;
  /** 누른 시점의 정의 목록(FR-013-E4 판정용). SSE `registry`가 갱신한 값 그대로다. */
  registryAgents: AgentDef[];
  /** 맥북 경로. 팀장 명령 표시·복사에만 쓴다(FR-013-AC2). */
  hostPath: string;
}

export function Header({ workflow, skillCount, liveAgents, registryAgents, hostPath }: HeaderProps) {
  const navigate = useNavigate();
  const helper = useHelperOpen();
  const lead = workflow.lead;
  const agentCount = (workflow.lead === null ? 0 : 1) + workflow.members.length;
  const counts = countWorkflowStatuses(workflow, liveAgents);

  function handleOpenLead(leadName: string) {
    // FR-013-E4: 누른 직후 팀장이 제거되어 정의가 없으면 도우미를 호출하지 않는다.
    // 화면(팀장 표시·버튼 활성)은 SSE `registry`가 갱신한다.
    if (!registryAgents.some((agent) => agent.name === leadName)) {
      helper.showError(LEAD_GONE_TEXT);
      return;
    }
    helper.open({ target: "lead", leadName }, leadSessionCommand(hostPath, leadName));
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      <Button variant="secondary" aria-label={BACK_TO_WORKFLOWS_LABEL} onClick={() => navigate("/workflows")}>
        <span aria-hidden="true">‹</span>
      </Button>
      <h1 className="text-title font-bold text-text">{workflow.name}</h1>
      <p className="text-body text-text-secondary">{workflowCardCountsLabel(agentCount, skillCount)}</p>
      <WorkflowChip result={workflowChip(counts)} />
      {lead === null ? (
        <p className="text-body text-danger">{FLOOR_NO_LEAD_TEXT}</p>
      ) : (
        <p className="flex items-center gap-1.5 text-body text-text-secondary">
          {LEAD_BADGE_TEXT}
          <MonoText>{lead}</MonoText>
        </p>
      )}
      <span className="ml-auto flex items-center gap-2">
        {helper.errorMessage === null ? null : (
          <span role="alert" className="text-aux text-danger">
            {helper.errorMessage}
          </span>
        )}
        <Button
          variant="terminal"
          disabledReason={lead === null ? FLOOR_NO_LEAD_TEXT : undefined}
          onClick={lead === null ? undefined : () => handleOpenLead(lead)}
        >
          <span aria-hidden="true" className="mr-2">
            {">_"}
          </span>
          {LEAD_TERMINAL_BUTTON_LABEL}
        </Button>
      </span>
      {helper.missingCommand === null ? null : (
        <HelperMissingDialog command={helper.missingCommand} onClose={helper.closeMissingDialog} />
      )}
    </div>
  );
}

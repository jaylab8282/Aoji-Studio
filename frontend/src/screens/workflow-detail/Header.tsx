/**
 * ui-spec.md SCR-03 헤더 줄 (`03-2`): `‹`(`chevron-left`) → 이름(`font/title`, h1) → `에이전트 N · 스킬 N` → 칩 하나 → `팀장 <name>`
 * → 오른쪽 주 동작 `팀장 호출 · 터미널 열기`(`square-terminal`). FR-007-AC8·AC9, FR-013-AC2·AC4·AC6·AC9, FR-013-E2~E4.
 *
 * 칩은 04-4 동안 중립 `모두 대기`로 고정한다(ADR-68). 도우미에는 `{target:'lead', leadName}`만 보낸다(FR-013-AC6).
 * 화면에 보여주고 복사하는 명령 `cd "<hostPath>" && claude --agent <lead>`은 프론트가 조립하지만 도우미에는 보내지 않는다.
 * 팀장이 없으면 버튼 왼쪽에 이유 `팀장 없음`과 함께 비활성(FR-007-AC8, FR-013-AC4). 누른 시점에 `registry.agents`에서 팀장이
 * 사라졌으면 호출하지 않고 `팀장이 없습니다`만 남긴다(FR-013-E4). 첫 스냅샷 전(04-2)에는 수·칩·팀장이 스켈레톤이고 주 동작은 비활성이다(ADR-44).
 */
import { useId, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { AgentDef, AgentLive, Workflow } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { MonoText } from "../../components/ui/MonoText";
import { Skeleton } from "../../components/ui/Skeleton";
import { WorkflowChip } from "../../components/ui/WorkflowChip";
import { HelperMissingDialog } from "../../dialogs/helper-missing/HelperMissingDialog";
import { useHelperOpen } from "../../dialogs/helper-missing/useHelperOpen";
import { countWorkflowStatuses } from "../../lib/derive/counts";
import { workflowChip } from "../../lib/derive/workflowChip";
import {
  BACK_TO_WORKFLOWS_LABEL,
  FLOOR_NO_LEAD_TEXT,
  HEADER_META_AGENTS,
  HEADER_META_SKILLS,
  LEAD_BADGE_TEXT,
  LEAD_GONE_TEXT,
  LEAD_TERMINAL_BUTTON_LABEL,
  leadSessionCommand,
} from "../../lib/text";

const ROW_CLASSES = "flex min-w-0 flex-none items-center gap-3 whitespace-nowrap";

function BackButton() {
  const navigate = useNavigate();
  return (
    <Button
      variant="secondary"
      size="icon"
      aria-label={BACK_TO_WORKFLOWS_LABEL}
      title={BACK_TO_WORKFLOWS_LABEL}
      onClick={() => navigate("/workflows")}
    >
      <Icon name="chevron-left" />
    </Button>
  );
}

function Title({ name }: { name: string }) {
  return <h1 className="text-title font-bold tracking-title text-text">{name}</h1>;
}

function TerminalLabel() {
  return (
    <>
      <Icon name="square-terminal" />
      {LEAD_TERMINAL_BUTTON_LABEL}
    </>
  );
}

interface HeaderProps {
  workflow: Workflow;
  skillCount: number;
  liveAgents: Record<string, AgentLive>;
  /** 누른 시점의 정의 목록(FR-013-E4 판정용). SSE `registry`가 갱신한 값 그대로다. */
  registryAgents: AgentDef[];
  /** 맥북 경로. 팀장 명령 표시·복사에만 쓴다(FR-013-AC2). */
  hostPath: string;
  /** 04-4 표시 중이면 칩을 중립 `모두 대기`로 고정한다(ADR-68). */
  collectorDown: boolean;
}

export function Header({ workflow, skillCount, liveAgents, registryAgents, hostPath, collectorDown }: HeaderProps) {
  const helper = useHelperOpen();
  const reasonId = useId();
  const lead = workflow.lead;
  const agentCount = (workflow.lead === null ? 0 : 1) + workflow.members.length;
  const counts = collectorDown ? { running: 0, waiting: 0, idle: agentCount } : countWorkflowStatuses(workflow, liveAgents);

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
    <div data-wf="03-2" className={ROW_CLASSES}>
      <BackButton />
      <Title name={workflow.name} />
      <p className="text-text-muted" data-testid="workflow-meta">
        {HEADER_META_AGENTS}
        <span className="font-mono font-medium text-text">{agentCount}</span>
        {HEADER_META_SKILLS}
        <span className="font-mono font-medium text-text">{skillCount}</span>
      </p>
      <WorkflowChip result={workflowChip(counts)} />
      <p className="min-w-0 truncate text-text-muted">
        {lead === null ? (
          FLOOR_NO_LEAD_TEXT
        ) : (
          <>
            {LEAD_BADGE_TEXT} <MonoText>{lead}</MonoText>
          </>
        )}
      </p>
      <span className="flex-1" />
      <span className="flex items-center gap-2">
        {helper.errorMessage === null ? null : (
          <span role="alert" className="text-aux text-danger">
            {helper.errorMessage}
          </span>
        )}
        {lead === null ? (
          <span id={reasonId} className="text-aux text-text-muted">
            {FLOOR_NO_LEAD_TEXT}
          </span>
        ) : null}
        <Button
          variant="primary"
          disabled={lead === null}
          aria-describedby={lead === null ? reasonId : undefined}
          onClick={lead === null ? undefined : () => handleOpenLead(lead)}
        >
          <TerminalLabel />
        </Button>
      </span>
      {helper.missingCommand === null ? null : (
        <HelperMissingDialog command={helper.missingCommand} onClose={helper.closeMissingDialog} />
      )}
    </div>
  );
}

/** 03 첫 스냅샷 전(04-2): 이름·`‹`는 보이고 수·칩·팀장은 스켈레톤, 값을 쓰는 주 동작은 비활성(이유 줄 없음, ADR-44). */
export function HeaderSkeleton({ name }: { name: string }): ReactNode {
  return (
    <div data-wf="03-2" className={ROW_CLASSES}>
      <BackButton />
      <Title name={name} />
      <Skeleton className="w-30" aria-label="에이전트·스킬 수 로딩 중" />
      <Skeleton className="h-chip w-22" aria-label="상태 칩 로딩 중" />
      <Skeleton className="w-40" aria-label="팀장 로딩 중" />
      <span className="flex-1" />
      <Button variant="primary" disabled>
        <TerminalLabel />
      </Button>
    </div>
  );
}

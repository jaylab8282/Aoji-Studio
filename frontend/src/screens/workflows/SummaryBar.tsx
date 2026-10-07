/**
 * ui-spec.md SCR-02 요약 줄(`02-2`): `AojiStudio` + `.claude` + 구분선 + `에이전트 N · 스킬 N · 워크플로우 N`(수는 고정폭 500),
 * 오른쪽 끝에 링크 `워크플로우 밖 에이전트 N · 가져오기`와 추가 버튼 `에이전트 만들기`(`plus`). FR-004-AC7, FR-001-E1·E2.
 * 링크는 N = 0이어도 활성이고(05-R 빈 상태로 연다, FR-009-AC6·AC7) 에이전트 폴더 읽기 실패면 수가 `-`다.
 * 한 줄, 줄바꿈 없음. 범례·필터는 `Legend`·`FilterBar`(`02-3`)가 맡는다.
 */
import type { Registry } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { LinkButton } from "../../components/ui/Link";
import { outsideAgents } from "../../lib/derive/importCandidates";
import { useDialogNavigate } from "../../lib/dialogNavigate";
import {
  CREATE_AGENT_BUTTON_LABEL,
  EMPTY_VALUE_TEXT,
  SUMMARY_SEPARATOR,
  WORKFLOWS_SUMMARY_AGENT_LABEL,
  WORKFLOWS_SUMMARY_CLAUDE_LABEL,
  WORKFLOWS_SUMMARY_PROJECT_LABEL,
  WORKFLOWS_SUMMARY_SKILL_LABEL,
  WORKFLOWS_SUMMARY_WORKFLOW_LABEL,
  WRITABLE_FALSE_REASON,
  outsideAgentsLinkLabel,
} from "../../lib/text";

function Count({ children }: { children: string | number }) {
  return <b className="font-mono font-medium text-text">{children}</b>;
}

function Separator() {
  return (
    <span aria-hidden="true" className="text-text-muted">
      {SUMMARY_SEPARATOR}
    </span>
  );
}

export function SummaryBar({ registry }: { registry: Registry }) {
  const openDialog = useDialogNavigate();
  const missing = registry.agentsDirMissing;
  const agentCount = missing ? EMPTY_VALUE_TEXT : (registry.agentCount ?? 0);
  const outsideCount = missing ? EMPTY_VALUE_TEXT : outsideAgents(registry.agents).length;

  return (
    <div data-wf="02-2" className="flex min-w-0 flex-none items-center gap-3 whitespace-nowrap">
      <h2 className="text-section font-bold text-text">{WORKFLOWS_SUMMARY_PROJECT_LABEL}</h2>
      <span className="font-mono text-aux text-text-muted">{WORKFLOWS_SUMMARY_CLAUDE_LABEL}</span>
      <span aria-hidden="true" className="h-5 w-px flex-none bg-border" />
      <span data-testid="workflows-counts" className="flex items-center gap-1.5 text-text-secondary">
        <span>
          {WORKFLOWS_SUMMARY_AGENT_LABEL} <Count>{agentCount}</Count>
        </span>
        {" "}
        <Separator />{" "}
        <span>
          {WORKFLOWS_SUMMARY_SKILL_LABEL} <Count>{registry.skillCount}</Count>
        </span>
        {" "}
        <Separator />{" "}
        <span>
          {WORKFLOWS_SUMMARY_WORKFLOW_LABEL} <Count>{registry.workflows.length}</Count>
        </span>
      </span>
      <span className="flex-1" />
      <LinkButton onClick={() => openDialog({ dialog: "import" })}>{outsideAgentsLinkLabel(outsideCount)}</LinkButton>
      <Button
        variant="add"
        disabledReason={registry.writable ? undefined : WRITABLE_FALSE_REASON}
        onClick={() => openDialog({ dialog: "agent-new" })}
      >
        <Icon name="plus" />
        {CREATE_AGENT_BUTTON_LABEL}
      </Button>
    </div>
  );
}

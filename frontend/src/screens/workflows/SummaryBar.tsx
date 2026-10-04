/**
 * ui-spec.md SCR-02 요약 줄: `AojiStudio`·`.claude` 라벨 + 통계 + 워크플로우 밖 에이전트 링크
 * + "+ 에이전트 만들기" 버튼 + 범례. FR-006-AC*, FR-001-E1, FR-004-AC7.
 */
import type { Live, Registry } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { StatusDot } from "../../components/ui/StatusDot";
import { countAllStatuses } from "../../lib/derive/counts";
import { useDialogNavigate } from "../../lib/dialogNavigate";
import { outsideAgents } from "../../lib/derive/importCandidates";
import {
  CREATE_AGENT_BUTTON_LABEL,
  EMPTY_VALUE_TEXT,
  STATUS_LABEL_TEXT,
  WORKFLOWS_SUMMARY_CLAUDE_LABEL,
  WORKFLOWS_SUMMARY_PROJECT_LABEL,
  WRITABLE_FALSE_REASON,
  outsideAgentsLinkLabel,
  workflowsSummaryCountsLabel,
} from "../../lib/text";

export function SummaryBar({ registry, live }: { registry: Registry; live: Live }) {
  const openDialog = useDialogNavigate();
  const counts = countAllStatuses(registry, live.agents);
  const outsideCount = outsideAgents(registry.agents).length;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-body text-text-secondary">{WORKFLOWS_SUMMARY_PROJECT_LABEL}</span>
        <span className="text-body text-text-faint">{WORKFLOWS_SUMMARY_CLAUDE_LABEL}</span>
        <span className="text-body text-text-secondary">
          {workflowsSummaryCountsLabel(
            registry.agentsDirMissing ? EMPTY_VALUE_TEXT : (registry.agentCount ?? 0),
            registry.skillCount,
            registry.workflows.length,
          )}
        </span>
        <button
          type="button"
          disabled={outsideCount === 0}
          aria-disabled={outsideCount === 0}
          onClick={() => openDialog({ dialog: "import" })}
          className={`text-aux underline decoration-1 underline-offset-2 disabled:no-underline ${
            outsideCount === 0 ? "text-text-faint" : "text-link"
          }`}
        >
          {outsideAgentsLinkLabel(outsideCount)}
        </button>
        <Button
          variant="add"
          size="sm"
          disabledReason={registry.writable ? undefined : WRITABLE_FALSE_REASON}
          onClick={() => openDialog({ dialog: "agent-new" })}
        >
          {CREATE_AGENT_BUTTON_LABEL}
        </Button>
      </div>
      <div className="flex items-center gap-4">
        <span className="inline-flex items-center gap-1.5 text-aux text-text-secondary">
          <StatusDot status="running" />
          {STATUS_LABEL_TEXT.running} {counts.running}
        </span>
        <span className="inline-flex items-center gap-1.5 text-aux text-text-secondary">
          <StatusDot status="waiting" />
          {STATUS_LABEL_TEXT.waiting} {counts.waiting}
        </span>
        <span className="inline-flex items-center gap-1.5 text-aux text-text-secondary">
          <StatusDot status="idle" />
          {STATUS_LABEL_TEXT.idle} {counts.idle}
        </span>
      </div>
    </div>
  );
}

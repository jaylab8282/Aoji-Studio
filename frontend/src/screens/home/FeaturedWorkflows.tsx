/**
 * ui-spec.md SCR-01 대표 워크플로우 3개. FR-005-AC3·AC4·AC5.
 */
import { Link } from "react-router-dom";
import type { Live, Registry } from "../../api/types";
import { EmptyWorkflowCard } from "../../components/ui/EmptyWorkflowCard";
import { WorkflowChip } from "../../components/ui/WorkflowChip";
import { featuredWorkflows, type FeaturedWorkflow } from "../../lib/derive/featuredWorkflows";
import { workflowCardBorder } from "../../lib/derive/workflowCardBorder";
import { formatDateHm } from "../../lib/format/time";
import {
  FEATURED_WORKFLOWS_SUBTITLE,
  FEATURED_WORKFLOWS_TITLE,
  NO_ACTIVITY_TEXT,
  VIEW_ALL_WORKFLOWS_LINK_LABEL,
  WORKFLOW_CARD_VIEW_LINK_LABEL,
  lastActivityLabel,
  recentActivityLabel,
  workflowCardCountsLabel,
} from "../../lib/text";

function activityText(activity: FeaturedWorkflow["activity"]): string {
  if (activity.kind === "recent") return recentActivityLabel(activity.title, activity.summary);
  if (activity.kind === "last") return lastActivityLabel(formatDateHm(activity.at));
  return NO_ACTIVITY_TEXT;
}

function WorkflowCard({ workflow }: { workflow: FeaturedWorkflow }) {
  // 테두리 색은 01·02 공용 규칙 하나로만 정한다(ADR-24, conventions.md §7 MUST). 01 카드에는 팀장 없음 표시가 없다.
  const borderClass = workflowCardBorder({
    running: workflow.counts.running,
    waiting: workflow.counts.waiting,
    leadMissing: false,
  });

  return (
    <Link
      to="/workflows"
      className={`rounded-card border ${borderClass} bg-card p-card flex flex-col gap-2 hover:bg-selected`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-section font-semibold text-text">{workflow.name}</p>
        <WorkflowChip result={workflow.chip} />
      </div>
      <p className="text-body text-text-secondary">{workflow.description}</p>
      <p className="text-aux text-text-faint">{workflowCardCountsLabel(workflow.agentCount, workflow.skillCount)}</p>
      <div className="mt-auto flex items-center justify-between border-t border-border pt-2">
        <p className="text-aux text-text-secondary">{activityText(workflow.activity)}</p>
        <span className="text-aux text-link">{WORKFLOW_CARD_VIEW_LINK_LABEL}</span>
      </div>
    </Link>
  );
}

export function FeaturedWorkflows({ registry, live }: { registry: Registry; live: Live }) {
  const workflows = featuredWorkflows(registry, live);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="flex items-baseline gap-2">
          <h2 className="text-section font-semibold text-text">{FEATURED_WORKFLOWS_TITLE}</h2>
          <span className="text-aux text-text-faint">{FEATURED_WORKFLOWS_SUBTITLE}</span>
        </span>
        <Link to="/workflows" className="text-aux text-link">
          {VIEW_ALL_WORKFLOWS_LINK_LABEL}
        </Link>
      </div>
      {registry.workflows.length === 0 ? (
        <EmptyWorkflowCard writable={registry.writable} />
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {workflows.map((workflow) => (
            <WorkflowCard key={workflow.name} workflow={workflow} />
          ))}
        </div>
      )}
    </section>
  );
}

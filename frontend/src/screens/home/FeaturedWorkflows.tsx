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
  // ADR-46 B: 화면에 보이는 문자열과 `title` 문자열이 같다. 서버가 이미 마스킹해 보낸
  // `lastEvent.title`·`summary`로 만든 값이므로 마스킹 전 원문을 얻는 경로가 없다(FR-015-AC2, FR-005-AC8).
  const activity = activityText(workflow.activity);
  // 테두리 색은 01·02 공용 규칙 하나로만 정한다(ADR-24, conventions.md §7 MUST). 01 카드에는 팀장 없음 표시가 없다.
  const borderClass = workflowCardBorder({
    running: workflow.counts.running,
    waiting: workflow.counts.waiting,
    leadMissing: false,
  });

  return (
    <Link
      to="/workflows"
      // 부류 ①(ADR-46 A): hover 값은 그대로 두고 키보드 포커스에도 같은 표현을 준다(NFR-12, ui-rules 8).
      className={`rounded-card border ${borderClass} bg-card p-card flex flex-col gap-2 hover:bg-selected focus-visible:bg-selected`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-section font-semibold text-text">{workflow.name}</p>
        <WorkflowChip result={workflow.chip} />
      </div>
      <p className="text-body text-text-secondary">{workflow.description}</p>
      <p className="text-aux text-text-faint">{workflowCardCountsLabel(workflow.agentCount, workflow.skillCount)}</p>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-2">
        {/* 한 줄 clamp(ADR-46 B): 폭을 넘으면 `…`로 자르고 `title`로 (마스킹된) 전체를 보여준다.
            글자 수 상수로 DOM 텍스트를 자르지 않는다. 옆 링크가 쪼개지지 않게 링크는 줄어들지 않는다. */}
        <p className="min-w-0 truncate text-aux text-text-secondary" title={activity}>
          {activity}
        </p>
        <span className="shrink-0 text-aux text-link">{WORKFLOW_CARD_VIEW_LINK_LABEL}</span>
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
        {/* 텍스트 링크의 hover·`:focus-visible`은 밑줄만 더한다(ADR-46 A ④, 더 밝은 링크 토큰이 없다). */}
        <Link to="/workflows" className="text-aux text-link hover:underline focus-visible:underline">
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

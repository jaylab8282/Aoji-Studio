/**
 * ui-spec.md SCR-01 대표 워크플로우 섹션 (`01-5`). FR-005-AC3·AC4·AC5·AC10, FR-015-AC2.
 * 가로형 3열 / 세로형 1열(카드 안 2칸: 왼쪽 이름·칩·설명·수, 오른쪽 세로 구분선 뒤 활동 줄·`워크플로우 보기`).
 * 카드 전체가 `/workflows` 링크이고 hover·focus 테두리는 `border-dashed`다(ADR-69). 시안 카드 테두리 같은 상태색은 쓰지 않는다.
 * 워크플로우 0개면 04-7 카드 한 장(전체 폭).
 */
import { Link } from "react-router-dom";
import type { Live, Registry } from "../../api/types";
import { EmptyWorkflowCard } from "../../components/ui/EmptyWorkflowCard";
import { Icon } from "../../components/ui/Icon";
import { Skeleton } from "../../components/ui/Skeleton";
import { WorkflowChip } from "../../components/ui/WorkflowChip";
import { featuredWorkflows, type FeaturedWorkflow } from "../../lib/derive/featuredWorkflows";
import { formatTimestamp } from "../../lib/format/time";
import {
  FEATURED_WORKFLOWS_SUBTITLE,
  FEATURED_WORKFLOWS_TITLE,
  LAST_ACTIVITY_LEAD,
  NO_ACTIVITY_TEXT,
  RECENT_ACTIVITY_LEAD,
  WORKFLOW_CARD_VIEW_LINK_LABEL,
  lastActivityLabel,
  recentActivityLabel,
} from "../../lib/text";

const GRID = "grid grid-cols-3 gap-3 portrait:grid-cols-1";
const CARD_BASE = "grid min-w-0 content-start gap-2 rounded-card border border-border bg-card p-4";
const ACT_BASE = "flex min-w-0 items-center gap-3 border-t border-border pt-2";
const ACT_PORTRAIT =
  "portrait:col-start-2 portrait:row-span-3 portrait:row-start-1 portrait:flex-col portrait:items-start portrait:justify-center portrait:border-t-0 portrait:border-l portrait:pt-0 portrait:pl-4";
const CARD_PORTRAIT = "portrait:grid-cols-2 portrait:gap-x-6";

function SectionHead() {
  return (
    <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
      <h2 className="text-section font-semibold">{FEATURED_WORKFLOWS_TITLE}</h2>
      <span data-clamp className="min-w-0 truncate text-aux text-text-muted">{FEATURED_WORKFLOWS_SUBTITLE}</span>
    </div>
  );
}

/** 활동 줄: 보이는 글자와 `title`이 같은 하나의 (서버가 마스킹한) 문자열이다(FR-015-AC2). 요약·시각은 고정폭이다. */
function ActivityLine({ activity }: { activity: FeaturedWorkflow["activity"] }) {
  const text =
    activity.kind === "recent"
      ? recentActivityLabel(activity.title, activity.summary)
      : activity.kind === "last"
        ? lastActivityLabel(formatTimestamp(activity.at))
        : NO_ACTIVITY_TEXT;
  return (
    <p
      data-testid="activity-line"
      data-clamp
      title={text}
      className="min-w-0 flex-1 truncate text-aux text-text-muted portrait:max-w-full portrait:flex-none"
    >
      {activity.kind === "recent" ? (
        <>
          {RECENT_ACTIVITY_LEAD}
          {activity.title} <span className="font-mono text-text-secondary">{activity.summary}</span>
        </>
      ) : activity.kind === "last" ? (
        <>
          {LAST_ACTIVITY_LEAD}
          <span className="font-mono text-text-secondary">{formatTimestamp(activity.at)}</span>
        </>
      ) : (
        NO_ACTIVITY_TEXT
      )}
    </p>
  );
}

function WorkflowCard({ workflow }: { workflow: FeaturedWorkflow }) {
  return (
    <Link
      to="/workflows"
      aria-label={`${workflow.name} · ${workflow.chip.label} · ${WORKFLOW_CARD_VIEW_LINK_LABEL}`}
      className={`group ${CARD_BASE} ${CARD_PORTRAIT} transition-colors duration-120 ease-standard hover:border-border-dashed focus-visible:border-border-dashed`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <h3 data-clamp className="min-w-0 flex-1 truncate text-section font-semibold text-text">{workflow.name}</h3>
        <WorkflowChip result={workflow.chip} />
      </div>
      <span data-clamp className="truncate text-text-secondary">{workflow.description}</span>
      <span className="text-aux text-text-muted">
        에이전트 <b className="font-mono font-medium text-text-secondary">{workflow.agentCount}</b> · 스킬{" "}
        <b className="font-mono font-medium text-text-secondary">{workflow.skillCount}</b>
      </span>
      <div className={`${ACT_BASE} ${ACT_PORTRAIT}`}>
        <ActivityLine activity={workflow.activity} />
        {/* 카드 전체가 링크라 안쪽은 링크 모양의 글자다(`<a>` 안에 `<a>`를 두지 않는다). */}
        <span className="inline-flex min-h-control shrink-0 items-center gap-1.5 font-semibold whitespace-nowrap text-link underline decoration-action-border underline-offset-3 group-hover:decoration-link">
          {WORKFLOW_CARD_VIEW_LINK_LABEL}
          <Icon name="arrow-right" />
        </span>
      </div>
    </Link>
  );
}

export function FeaturedWorkflows({ registry, live }: { registry: Registry; live: Live }) {
  const workflows = featuredWorkflows(registry, live);

  return (
    <section aria-label={FEATURED_WORKFLOWS_TITLE} data-wf="01-5" className="grid flex-none gap-3">
      <SectionHead />
      {registry.workflows.length === 0 ? (
        <EmptyWorkflowCard writable={registry.writable} />
      ) : (
        <div className={GRID}>
          {workflows.map((workflow) => (
            <WorkflowCard key={workflow.name} workflow={workflow} />
          ))}
        </div>
      )}
    </section>
  );
}

/** 04-2: 카드 3장 안 스켈레톤(제목 40%·설명 70%·수 50%·활동 80%). 섹션 머리는 보인다. */
export function FeaturedWorkflowsSkeleton() {
  return (
    <section aria-label={FEATURED_WORKFLOWS_TITLE} aria-busy="true" data-wf="01-5" className="grid flex-none gap-3">
      <SectionHead />
      <div className={GRID}>
        {[0, 1, 2].map((index) => (
          <div key={index} className={`${CARD_BASE} ${CARD_PORTRAIT}`}>
            <Skeleton className="h-4 w-2/5" aria-label="워크플로우 이름 로딩 중" />
            <Skeleton className="w-7/10" aria-label="워크플로우 설명 로딩 중" />
            <Skeleton className="w-1/2" aria-label="워크플로우 수 로딩 중" />
            <div className={`${ACT_BASE} ${ACT_PORTRAIT}`}>
              <Skeleton className="w-4/5" aria-label="워크플로우 활동 로딩 중" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

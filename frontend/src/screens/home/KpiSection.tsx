/**
 * ui-spec.md SCR-01 KPI 1~4 (`01-3`). FR-005-AC1, FR-001-E1.
 * KPI 1: 수치 `N` + 작은 `/ 전체`(두 요소) + 보조 `권한·입력 대기 N · hook 이벤트 기준`. 실행 중 > 0이면 카드 테두리 `live-border`·수치 `text-live`,
 * 대기 수 > 0이면 그 수만 `text-waiting`. `agentsDirMissing`이면 KPI 1·2 자리를 `AgentsDirMissing`(04-5, 2칸) 하나로 대체한다.
 * KPI 4 수집 상태는 3단계 규칙(ADR-72, `collectorStatus.ts`)을 쓴다.
 */
import type { ReactNode } from "react";
import type { Live, Registry } from "../../api/types";
import { AgentsDirMissing } from "../../components/ui/AgentsDirMissing";
import { Skeleton } from "../../components/ui/Skeleton";
import { StatusDot, type DotStatus } from "../../components/ui/StatusDot";
import { countAllStatuses } from "../../lib/derive/counts";
import { deriveCollectorStatus, type CollectorStage } from "../../lib/derive/collectorStatus";
import {
  COLLECTOR_LAST_RECEIVED_LEAD,
  KPI_AGENT_COUNT_PATH,
  KPI_AGENT_COUNT_SUFFIX,
  KPI_AGENT_COUNT_TITLE,
  KPI_COLLECTOR_TITLE,
  KPI_RUNNING_SUB_LEAD,
  KPI_RUNNING_SUB_TAIL,
  KPI_RUNNING_TITLE,
  KPI_SKILL_COUNT_PATH,
  KPI_SKILL_COUNT_SUFFIX,
  KPI_SKILL_COUNT_TITLE,
  NO_LAST_RECEIVED_TEXT,
} from "../../lib/text";

const CARD_BASE = "grid min-w-0 content-start gap-1 rounded-card border bg-card p-4";
const LABEL = "text-aux text-text-muted";
const FIGURE = "flex min-h-kpi-value items-center font-mono text-figure leading-snug font-medium";

function KpiCard({ live = false, children }: { live?: boolean; children: ReactNode }) {
  return <div className={`${CARD_BASE} ${live ? "border-live-border" : "border-border"}`}>{children}</div>;
}

const STAGE_DOT: Record<CollectorStage, DotStatus> = { live: "running", neutral: "idle", unset: "danger" };
const STAGE_TEXT: Record<CollectorStage, string> = { live: "text-live", neutral: "text-text-muted", unset: "text-danger" };

export function KpiSection({ registry, live, hostPath }: { registry: Registry; live: Live; hostPath: string }) {
  const counts = countAllStatuses(registry, live.agents);
  const agentCount = registry.agentCount ?? 0;
  const collector = deriveCollectorStatus({
    hookConfigured: registry.hookConfigured,
    everReceived: live.everReceived,
    lastReceivedAt: live.lastReceivedAt,
  });

  return (
    <section aria-label="요약" data-wf="01-3" className="grid flex-none grid-cols-4 gap-3">
      {registry.agentsDirMissing ? (
        <div className="col-span-2 grid min-w-0">
          <AgentsDirMissing hostPath={hostPath} />
        </div>
      ) : (
        <>
          <KpiCard live={counts.running > 0}>
            <span className={LABEL}>{KPI_RUNNING_TITLE}</span>
            <span className={`${FIGURE} ${counts.running > 0 ? "text-live" : "text-text"}`}>
              <span data-testid="kpi-running-value">{counts.running}</span>
              <small data-testid="kpi-running-total" className="ml-1.5 text-section font-normal text-text-muted">
                / {agentCount}
              </small>
            </span>
            <span data-testid="kpi-running-sub" className={LABEL}>
              {KPI_RUNNING_SUB_LEAD}
              <b className={`font-mono font-medium ${counts.waiting > 0 ? "text-waiting" : ""}`}>{counts.waiting}</b>
              {KPI_RUNNING_SUB_TAIL}
            </span>
          </KpiCard>
          <KpiCard>
            <span className={LABEL}>{KPI_AGENT_COUNT_TITLE}</span>
            <span className={`${FIGURE} text-text`} data-testid="kpi-agent-count">
              {agentCount}
            </span>
            <span className={LABEL}>
              <span className="font-mono">{KPI_AGENT_COUNT_PATH}</span>
              {KPI_AGENT_COUNT_SUFFIX}
            </span>
          </KpiCard>
        </>
      )}
      <KpiCard>
        <span className={LABEL}>{KPI_SKILL_COUNT_TITLE}</span>
        <span className={`${FIGURE} text-text`} data-testid="kpi-skill-count">
          {registry.skillCount}
        </span>
        <span className={LABEL}>
          <span className="font-mono">{KPI_SKILL_COUNT_PATH}</span>
          {KPI_SKILL_COUNT_SUFFIX}
        </span>
      </KpiCard>
      <KpiCard>
        <span className={LABEL}>{KPI_COLLECTOR_TITLE}</span>
        <span
          data-testid="kpi-collector-status"
          data-stage={collector.stage}
          className={`flex min-h-kpi-value items-center gap-1.5 text-section font-semibold ${STAGE_TEXT[collector.stage]}`}
        >
          <StatusDot status={STAGE_DOT[collector.stage]} />
          {collector.chipText}
        </span>
        <span data-testid="kpi-collector-last" className={LABEL}>
          {live.lastReceivedAt === null ? (
            NO_LAST_RECEIVED_TEXT
          ) : (
            <>
              {COLLECTOR_LAST_RECEIVED_LEAD}
              <span className="font-mono text-text-mono">{collector.lastReceivedText}</span>
            </>
          )}
        </span>
      </KpiCard>
    </section>
  );
}

/** 04-2: 수치(96×28)·보조(150×12) 스켈레톤, 테두리 중립. 라벨은 보인다. */
export function KpiSectionSkeleton() {
  const titles = [KPI_RUNNING_TITLE, KPI_AGENT_COUNT_TITLE, KPI_SKILL_COUNT_TITLE, KPI_COLLECTOR_TITLE];
  return (
    <section aria-label="요약" aria-busy="true" data-wf="01-3" className="grid flex-none grid-cols-4 gap-3">
      {titles.map((title) => (
        <KpiCard key={title}>
          <span className={LABEL}>{title}</span>
          <span className="flex min-h-kpi-value items-center">
            <Skeleton big className="w-24" aria-label={`${title} 값 로딩 중`} />
          </span>
          <span className="flex h-lh items-center text-aux">
            <Skeleton className="w-37.5" aria-label={`${title} 보조 로딩 중`} />
          </span>
        </KpiCard>
      ))}
    </section>
  );
}

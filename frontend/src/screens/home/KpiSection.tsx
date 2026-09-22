/**
 * ui-spec.md SCR-01 KPI 1~4. FR-005-AC1, FR-001-E1.
 * agentsDirMissing이면 KPI 1·2 자리를 `AgentsDirMissing` 하나로 대체한다(SCR-04-5).
 */
import type { ReactNode } from "react";
import type { Live, Registry } from "../../api/types";
import { AgentsDirMissing } from "../../components/ui/AgentsDirMissing";
import { StatusDot } from "../../components/ui/StatusDot";
import { countAllStatuses } from "../../lib/derive/counts";
import { formatHms } from "../../lib/format/time";
import {
  HOOK_CONFIGURED_TEXT,
  HOOK_NOT_CONFIGURED_TEXT,
  KPI_AGENT_COUNT_SUBTITLE,
  KPI_AGENT_COUNT_TITLE,
  KPI_COLLECTOR_TITLE,
  KPI_RUNNING_TITLE,
  KPI_SKILL_COUNT_SUBTITLE,
  KPI_SKILL_COUNT_TITLE,
  kpiRunningSubtitle,
  lastReceivedLabel,
} from "../../lib/text";

interface KpiCardProps {
  title: string;
  children: ReactNode;
  subtitle: string;
  tone?: "running" | "default";
}

function KpiCard({ title, children, subtitle, tone = "default" }: KpiCardProps) {
  const toneClasses =
    tone === "running" ? "border-running-border bg-running-soft" : "border-border bg-card";
  return (
    <div className={`rounded-card border p-card flex flex-col gap-1.5 ${toneClasses}`}>
      <p className="text-aux text-text-muted">{title}</p>
      <div className={`text-kpi font-bold font-mono ${tone === "running" ? "text-running" : "text-text"}`}>
        {children}
      </div>
      <p className="text-aux text-text-faint">{subtitle}</p>
    </div>
  );
}

export function KpiSection({ registry, live, hostPath }: { registry: Registry; live: Live; hostPath: string }) {
  const counts = countAllStatuses(registry, live.agents);

  return (
    <div className="grid grid-cols-4 gap-4">
      {registry.agentsDirMissing ? (
        <div className="col-span-2">
          <AgentsDirMissing hostPath={hostPath} />
        </div>
      ) : (
        <>
          <KpiCard title={KPI_RUNNING_TITLE} subtitle={kpiRunningSubtitle(counts.waiting)} tone="running">
            {counts.running} / {registry.agentCount ?? 0}
          </KpiCard>
          <KpiCard title={KPI_AGENT_COUNT_TITLE} subtitle={KPI_AGENT_COUNT_SUBTITLE}>
            {registry.agentCount ?? 0}
          </KpiCard>
        </>
      )}
      <KpiCard title={KPI_SKILL_COUNT_TITLE} subtitle={KPI_SKILL_COUNT_SUBTITLE}>
        {registry.skillCount}
      </KpiCard>
      <div className="rounded-card border border-border bg-card p-card flex flex-col gap-1.5">
        <p className="text-aux text-text-muted">{KPI_COLLECTOR_TITLE}</p>
        <span className="inline-flex items-center gap-1.5 text-section font-semibold text-text">
          <StatusDot status={registry.hookConfigured ? "running" : "idle"} />
          {registry.hookConfigured ? HOOK_CONFIGURED_TEXT : HOOK_NOT_CONFIGURED_TEXT}
        </span>
        <p className="text-aux text-text-faint">
          {lastReceivedLabel(live.lastReceivedAt === null ? null : formatHms(live.lastReceivedAt))}
        </p>
      </div>
    </div>
  );
}

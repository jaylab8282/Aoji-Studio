/**
 * ui-spec.md SCR-01 상태 막대. FR-005-AC2. agentsDirMissing이면 숨긴다(호출부에서 처리).
 */
import type { Live, Registry } from "../../api/types";
import { StatusDot } from "../../components/ui/StatusDot";
import { countAllStatuses } from "../../lib/derive/counts";
import { STATUS_BAR_LEGEND_IDLE, STATUS_BAR_LEGEND_RUNNING, STATUS_BAR_LEGEND_WAITING, STATUS_BAR_SUBTITLE, STATUS_BAR_TITLE } from "../../lib/text";

function segmentWidth(count: number, total: number): string {
  return total > 0 ? `${(count / total) * 100}%` : "0%";
}

export function StatusBar({ registry, live }: { registry: Registry; live: Live }) {
  const counts = countAllStatuses(registry, live.agents);
  const total = registry.agentCount ?? 0;

  return (
    <div className="rounded-card border border-border bg-card p-card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="flex items-baseline gap-2">
          <span className="text-section font-semibold text-text">{STATUS_BAR_TITLE}</span>
          <span className="text-aux text-text-faint">{STATUS_BAR_SUBTITLE}</span>
        </span>
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5 text-aux text-text-secondary">
            <StatusDot status="running" />
            {STATUS_BAR_LEGEND_RUNNING} {counts.running}
          </span>
          <span className="inline-flex items-center gap-1.5 text-aux text-text-secondary">
            <StatusDot status="waiting" />
            {STATUS_BAR_LEGEND_WAITING} {counts.waiting}
          </span>
          <span className="inline-flex items-center gap-1.5 text-aux text-text-secondary">
            <StatusDot status="idle" />
            {STATUS_BAR_LEGEND_IDLE} {counts.idle}
          </span>
        </div>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-control bg-selected" role="img" aria-label={STATUS_BAR_TITLE}>
        <div className="h-full bg-running" style={{ width: segmentWidth(counts.running, total) }} />
        <div className="h-full bg-waiting" style={{ width: segmentWidth(counts.waiting, total) }} />
        <div className="h-full bg-idle" style={{ width: segmentWidth(counts.idle, total) }} />
      </div>
    </div>
  );
}

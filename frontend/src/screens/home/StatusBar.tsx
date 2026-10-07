/**
 * ui-spec.md SCR-01 상태 막대 카드 (`01-4`, 04-1에서는 `04-1-2`). FR-005-AC2. agentsDirMissing이면 숨긴다(호출부).
 * 범례 `작업 중 N`·`권한·입력 대기 N`·`대기 N`(합 = 에이전트 수) + 막대(`aria-hidden`, 칸 폭 = 각 수 / `agentCount`, 0인 칸은 그리지 않는다).
 * `everReceived === false`면 막대 전체 대기색 + 아래 이유 줄(04-1). 로딩 중에는 범례를 숨기고 막대 전체가 스켈레톤이다.
 */
import type { Live, Registry } from "../../api/types";
import { StatusDot, type DotStatus } from "../../components/ui/StatusDot";
import { countAllStatuses } from "../../lib/derive/counts";
import {
  NO_EVENTS_STATUS_BAR_REASON,
  STATUS_BAR_LEGEND_IDLE,
  STATUS_BAR_LEGEND_RUNNING,
  STATUS_BAR_LEGEND_WAITING,
  STATUS_BAR_SUBTITLE,
  STATUS_BAR_TITLE,
} from "../../lib/text";

const CARD = "grid flex-none gap-3 rounded-card border border-border bg-card p-4";

function percent(count: number, total: number): string {
  return total > 0 ? `${(count / total) * 100}%` : "0%";
}

function LegendItem({ status, text, count, color }: { status: DotStatus; text: string; count: number; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${color}`}>
      <StatusDot status={status} />
      {text} <b className="font-mono text-body font-medium">{count}</b>
    </span>
  );
}

function Heading() {
  return (
    <>
      <h2 className="text-section font-semibold">{STATUS_BAR_TITLE}</h2>
      <span className="text-aux text-text-muted">{STATUS_BAR_SUBTITLE}</span>
    </>
  );
}

export function StatusBar({ registry, live }: { registry: Registry; live: Live }) {
  const counts = countAllStatuses(registry, live.agents);
  const total = registry.agentCount ?? 0;
  const noEvents = !live.everReceived;
  const segments: Array<{ key: string; count: number; color: string }> = noEvents
    ? [{ key: "idle", count: total, color: "bg-idle" }]
    : [
        { key: "running", count: counts.running, color: "bg-live" },
        { key: "waiting", count: counts.waiting, color: "bg-waiting" },
        { key: "idle", count: counts.idle, color: "bg-idle" },
      ];

  return (
    <section data-wf={noEvents ? "04-1-2" : "01-4"} className={CARD}>
      <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
        <Heading />
        <span className="flex-1" />
        <div className="flex items-center gap-4 text-aux font-semibold">
          <LegendItem status="running" text={STATUS_BAR_LEGEND_RUNNING} count={counts.running} color="text-live" />
          <LegendItem status="waiting" text={STATUS_BAR_LEGEND_WAITING} count={counts.waiting} color="text-waiting" />
          <LegendItem status="idle" text={STATUS_BAR_LEGEND_IDLE} count={counts.idle} color="text-text-muted" />
        </div>
      </div>
      <div aria-hidden="true" data-testid="status-bar" className="flex h-sbar gap-0.5 rounded-chip bg-inset p-0.75">
        {segments
          .filter((segment) => segment.count > 0)
          .map((segment) => (
            <i
              key={segment.key}
              data-segment={segment.key}
              className={`block h-full rounded-segment ${segment.color}`}
              style={{ width: percent(segment.count, total) }}
            />
          ))}
      </div>
      {noEvents ? <p className="text-aux text-text-muted">{NO_EVENTS_STATUS_BAR_REASON}</p> : null}
    </section>
  );
}

/** 04-2: 제목·부제는 보이고 범례는 숨기며 막대 전체가 스켈레톤이다. */
export function StatusBarSkeleton() {
  return (
    <section data-wf="01-4" aria-busy="true" className={CARD}>
      <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
        <Heading />
      </div>
      <div aria-hidden="true" className="flex h-sbar gap-0.5 rounded-chip bg-inset p-0.75">
        <i data-skeleton="" className="block h-full w-full rounded-segment bg-soft" />
      </div>
    </section>
  );
}

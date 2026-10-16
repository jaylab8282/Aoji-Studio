/**
 * 09 기간 조회 훅 (ui-spec SCR-09 갱신, realtime-spec §5, ADR-94, conventions §7).
 * 조회·1초 묶음 재조회는 공용 `useThrottledRefetch`다. 재조회 신호는 SSE `usage-changed`의 `mcp`, `registry` revision 변화다.
 */
import { useState } from "react";
import { fetchMcp } from "../../api/usage";
import type { McpReport, UsagePeriod } from "../../api/types";
import { useSnapshotStore } from "../../state/snapshotStore";
import { REFETCH_INTERVAL_MS, useThrottledRefetch } from "../../state/useThrottledRefetch";
import { useUsageSignal } from "../../state/usageSignalStore";

/** 신호로 일어나는 재조회 사이의 최소 간격: 08과 같은 1초(ADR-94). */
export const MCP_REFETCH_INTERVAL_MS = REFETCH_INTERVAL_MS;

export function useMcpReport(period: UsagePeriod) {
  const { registry } = useSnapshotStore();
  const revision = registry === null ? null : registry.revision;
  const signal = useUsageSignal("mcp");
  const [report, setReport] = useState<McpReport | null>(null);
  const { errorMessage, retry } = useThrottledRefetch({
    period,
    fetcher: fetchMcp,
    onLoaded: setReport,
    trigger: `${revision ?? "-"}:${signal}`,
  });
  return { report, errorMessage, retry };
}

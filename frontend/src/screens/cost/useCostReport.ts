/**
 * 10 기간 조회 훅 (ui-spec SCR-10 갱신, realtime-spec §5, ADR-94, conventions §7).
 * - `cost`: 조회·1초 묶음 재조회는 공용 `useThrottledRefetch`다. 재조회 신호는 SSE `usage-changed`의 `cost`뿐이다(FR-025-AC6 10초).
 * - `limits`: 기간과 상관없는 조회다. 신호는 `usage-changed`의 `limits`(FR-027-AC8 2초). 같은 훅을 쓰고 기간은 무시한다.
 */
import { useState } from "react";
import { fetchCost, fetchLimits } from "../../api/usage";
import type { CostReport, Limits, UsagePeriod } from "../../api/types";
import { useThrottledRefetch } from "../../state/useThrottledRefetch";
import { useUsageSignal } from "../../state/usageSignalStore";

export function useCostReport(period: UsagePeriod) {
  const signal = useUsageSignal("cost");
  const [report, setReport] = useState<CostReport | null>(null);
  const { errorMessage, retry } = useThrottledRefetch({
    period,
    fetcher: fetchCost,
    onLoaded: setReport,
    trigger: String(signal),
  });
  return { report, errorMessage, retry };
}

/** 한도는 기간이 없다. 훅이 기간을 받지만 조회 함수가 무시하므로 고정값을 넘긴다(바뀌지 않아 다시 조회하지 않는다). */
const LIMITS_PERIOD: UsagePeriod = "7d";

function fetchLimitsIgnoringPeriod(): Promise<Limits> {
  return fetchLimits();
}

export function useLimitsReport() {
  const signal = useUsageSignal("limits");
  const [limits, setLimits] = useState<Limits | null>(null);
  const { errorMessage, retry } = useThrottledRefetch({
    period: LIMITS_PERIOD,
    fetcher: fetchLimitsIgnoringPeriod,
    onLoaded: setLimits,
    trigger: String(signal),
  });
  return { limits, errorMessage, retry };
}

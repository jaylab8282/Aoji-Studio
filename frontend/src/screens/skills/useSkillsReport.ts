/**
 * 08 기간 조회 훅 (ui-spec SCR-08 갱신, realtime-spec §5, conventions §7).
 * 조회·1초 묶음 재조회는 공용 `useThrottledRefetch`다. 재조회 신호는 SSE `usage-changed`의 `skills`, `registry` revision 변화,
 * 08-3 삭제 완료(`refreshTick`)다. 받은 응답은 `skillsViewStore`에 둔다(08-3이 같은 값을 쓴다).
 */
import { fetchSkills } from "../../api/usage";
import { REFETCH_INTERVAL_MS, useThrottledRefetch } from "../../state/useThrottledRefetch";
import type { SkillsReport, UsagePeriod } from "../../api/types";
import { useSnapshotStore } from "../../state/snapshotStore";
import { skillsViewStore, useSkillsViewStore } from "../../state/skillsViewStore";
import { useUsageSignal } from "../../state/usageSignalStore";

/** 신호로 일어나는 재조회 사이의 최소 간격(공용 값 1초, ADR-94). */
export const SKILLS_REFETCH_INTERVAL_MS = REFETCH_INTERVAL_MS;

function storeReport(loaded: SkillsReport): void {
  skillsViewStore.setReport(loaded);
}

function clearReport(): void {
  skillsViewStore.setReport(null);
}

export function useSkillsReport(period: UsagePeriod) {
  const { registry } = useSnapshotStore();
  const revision = registry === null ? null : registry.revision;
  const signal = useUsageSignal("skills");
  const { report, refreshTick } = useSkillsViewStore();
  const { errorMessage, retry } = useThrottledRefetch({
    period,
    fetcher: fetchSkills,
    onLoaded: storeReport,
    trigger: `${revision ?? "-"}:${signal}:${refreshTick}`,
    onLeave: clearReport,
  });
  return { report, errorMessage, retry };
}

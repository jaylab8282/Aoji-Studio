/**
 * 08 기간 조회 훅 (ui-spec SCR-08 갱신, realtime-spec §5, conventions §7).
 * - 처음·기간을 바꿀 때·`다시 시도`는 바로 조회한다.
 * - 재조회 신호(SSE `usage-changed`의 `skills`, `registry` revision 변화, 08-3 삭제 완료)는 같은 화면 재조회를 `SKILLS_REFETCH_INTERVAL_MS`마다 1회 이하로 묶고
 *   마지막 신호 뒤 반드시 1회 조회한다(타이머 폴링 없음).
 * 받은 응답은 `skillsViewStore`에 둔다(08-3이 같은 값을 쓴다). 응답이 겹치면 가장 나중에 보낸 것만 반영한다.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { fetchSkills } from "../../api/usage";
import type { UsagePeriod } from "../../api/types";
import { UNKNOWN_ERROR_MESSAGE } from "../../lib/text";
import { useSnapshotStore } from "../../state/snapshotStore";
import { skillsViewStore, useSkillsViewStore } from "../../state/skillsViewStore";
import { useUsageSignal } from "../../state/usageSignalStore";

/**
 * 신호로 일어나는 재조회 사이의 최소 간격: 1초에 1회 이하, 마지막 알림 뒤 반드시 1회(ADR-94, realtime-spec §5).
 * FR-018-AC4·FR-019-AC5의 2초 반영 예산을 지키는 값이다.
 */
export const SKILLS_REFETCH_INTERVAL_MS = 1000;

export function useSkillsReport(period: UsagePeriod) {
  const { registry } = useSnapshotStore();
  const revision = registry === null ? null : registry.revision;
  const signal = useUsageSignal("skills");
  const { report, refreshTick } = useSkillsViewStore();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const requestId = useRef(0);
  const lastFetchAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const periodRef = useRef(period);
  const skipFirstTrigger = useRef(true);

  const run = useCallback((target: UsagePeriod) => {
    requestId.current += 1;
    const id = requestId.current;
    lastFetchAt.current = Date.now();
    fetchSkills(target)
      .then((loaded) => {
        if (id !== requestId.current) return;
        skillsViewStore.setReport(loaded);
        setErrorMessage(null);
      })
      .catch((error: unknown) => {
        if (id !== requestId.current) return;
        setErrorMessage(error instanceof ApiError ? error.message : UNKNOWN_ERROR_MESSAGE);
      });
  }, []);

  useEffect(() => {
    periodRef.current = period;
    run(period);
  }, [period, attempt, run]);

  const trigger = `${revision ?? "-"}:${signal}:${refreshTick}`;
  useEffect(() => {
    if (skipFirstTrigger.current) {
      skipFirstTrigger.current = false;
      return;
    }
    if (timer.current !== null) return;
    const wait = Math.max(0, lastFetchAt.current + SKILLS_REFETCH_INTERVAL_MS - Date.now());
    timer.current = setTimeout(() => {
      timer.current = null;
      run(periodRef.current);
    }, wait);
  }, [trigger, run]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      requestId.current += 1;
      skillsViewStore.setReport(null);
    },
    [],
  );

  const retry = useCallback(() => {
    setErrorMessage(null);
    setAttempt((value) => value + 1);
  }, []);

  return { report, errorMessage, retry };
}

/**
 * 09 기간 조회 훅 (ui-spec SCR-09 갱신, realtime-spec §5, ADR-94, conventions §7).
 * - 처음·기간을 바꿀 때·`다시 시도`는 바로 조회한다.
 * - 재조회 신호(SSE `usage-changed`의 `mcp`, `registry` revision 변화)는 같은 화면 재조회를 `MCP_REFETCH_INTERVAL_MS`마다 1회 이하로 묶고
 *   마지막 신호 뒤 반드시 1회 조회한다(타이머 폴링 없음). 방식은 08 `useSkillsReport`와 같다.
 * 응답이 겹치면 가장 나중에 보낸 것만 반영한다.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { fetchMcp } from "../../api/usage";
import type { McpReport, UsagePeriod } from "../../api/types";
import { UNKNOWN_ERROR_MESSAGE } from "../../lib/text";
import { useSnapshotStore } from "../../state/snapshotStore";
import { useUsageSignal } from "../../state/usageSignalStore";
import { SKILLS_REFETCH_INTERVAL_MS } from "../skills/useSkillsReport";

/** 신호로 일어나는 재조회 사이의 최소 간격: 08과 같은 1초(ADR-94). */
export const MCP_REFETCH_INTERVAL_MS = SKILLS_REFETCH_INTERVAL_MS;

export function useMcpReport(period: UsagePeriod) {
  const { registry } = useSnapshotStore();
  const revision = registry === null ? null : registry.revision;
  const signal = useUsageSignal("mcp");
  const [report, setReport] = useState<McpReport | null>(null);
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
    fetchMcp(target)
      .then((loaded) => {
        if (id !== requestId.current) return;
        setReport(loaded);
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

  const trigger = `${revision ?? "-"}:${signal}`;
  useEffect(() => {
    if (skipFirstTrigger.current) {
      skipFirstTrigger.current = false;
      return;
    }
    if (timer.current !== null) return;
    const wait = Math.max(0, lastFetchAt.current + MCP_REFETCH_INTERVAL_MS - Date.now());
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
    },
    [],
  );

  const retry = useCallback(() => {
    setErrorMessage(null);
    setAttempt((value) => value + 1);
  }, []);

  return { report, errorMessage, retry };
}

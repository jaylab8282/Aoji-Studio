/**
 * 08·09·10 기간 조회 공용 훅 (realtime-spec §5, ADR-94, conventions §7, D-177).
 * - 처음·기간을 바꿀 때·`다시 시도`는 바로 조회한다.
 * - 재조회 신호(`trigger` 문자열이 바뀜: SSE `usage-changed`의 자기 영역, `registry` revision 변화 등)는 같은 화면 재조회를
 *   `REFETCH_INTERVAL_MS`마다 1회 이하로 묶고 마지막 신호 뒤 반드시 1회 조회한다(타이머 폴링 없음).
 * - 응답이 겹치면 가장 나중에 보낸 것만 반영한다. 화면을 떠나면 대기 중인 조회를 버린다.
 * 화면마다 다른 것(조회 함수, 받은 값을 어디에 두는지, 떠날 때 정리)은 호출하는 쪽이 넘긴다.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../api/client";
import type { UsagePeriod } from "../api/types";
import { UNKNOWN_ERROR_MESSAGE } from "../lib/text";

/**
 * 신호로 일어나는 재조회 사이의 최소 간격: 1초에 1회 이하, 마지막 알림 뒤 반드시 1회(ADR-94, realtime-spec §5).
 * FR-018-AC4·FR-019-AC5·FR-025-AC6·FR-027-AC8의 반영 예산을 지키는 값이다.
 */
export const REFETCH_INTERVAL_MS = 1000;

interface ThrottledRefetchOptions<T> {
  period: UsagePeriod;
  fetcher: (period: UsagePeriod) => Promise<T>;
  /** 응답을 받았을 때(가장 나중에 보낸 조회만). */
  onLoaded: (loaded: T) => void;
  /** 이 문자열이 바뀌면 재조회 신호다. 첫 값은 신호로 세지 않는다. */
  trigger: string;
  /** 화면을 떠날 때 정리(08은 공유 스토어를 비운다). */
  onLeave?: () => void;
}

export function useThrottledRefetch<T>({ period, fetcher, onLoaded, trigger, onLeave }: ThrottledRefetchOptions<T>) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const requestId = useRef(0);
  const lastFetchAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const periodRef = useRef(period);
  const skipFirstTrigger = useRef(true);
  const fetcherRef = useRef(fetcher);
  const onLoadedRef = useRef(onLoaded);
  const onLeaveRef = useRef(onLeave);

  useEffect(() => {
    fetcherRef.current = fetcher;
    onLoadedRef.current = onLoaded;
    onLeaveRef.current = onLeave;
  });

  const run = useCallback((target: UsagePeriod) => {
    requestId.current += 1;
    const id = requestId.current;
    lastFetchAt.current = Date.now();
    fetcherRef.current(target)
      .then((loaded) => {
        if (id !== requestId.current) return;
        onLoadedRef.current(loaded);
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

  useEffect(() => {
    if (skipFirstTrigger.current) {
      skipFirstTrigger.current = false;
      return;
    }
    if (timer.current !== null) return;
    const wait = Math.max(0, lastFetchAt.current + REFETCH_INTERVAL_MS - Date.now());
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
      onLeaveRef.current?.();
    },
    [],
  );

  const retry = useCallback(() => {
    setErrorMessage(null);
    setAttempt((value) => value + 1);
  }, []);

  return { errorMessage, retry };
}

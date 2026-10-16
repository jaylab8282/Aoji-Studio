/**
 * 10 한도 카드의 `N분 전`·초기화 지남 판정이 시간이 지나도 맞도록 현재 시각을 일정 간격으로 갱신한다(표시용, 서버 조회와 무관).
 */
import { useEffect, useState } from "react";

export const NOW_TICK_MS = 30_000;

export function useNow(intervalMs: number = NOW_TICK_MS): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
